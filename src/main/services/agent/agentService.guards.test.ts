import { describe, expect, it } from 'vitest'
import type { ChatStreamEvent } from '../../infra/providers/transports/openAiChatTransport'
import { BUDGET_STOP_NOTICE, EMPTY_TURN_NOTICE } from '../../../shared/contracts/agentEmptyTurn'
import { callTools, say, setupAgent } from './agentTestKit'

const ZERO = { inputTokens: 10, outputTokens: 0 }

type Kit = ReturnType<typeof setupAgent>
const retriesOf = (kit: Kit, turnId: string) =>
  kit.repository.listActivities(turnId).filter((row) => row.kind === 'retry')
const noticesOf = (kit: Kit, turnId: string) =>
  kit.repository
    .listParts(turnId)
    .filter((part) => part.kind === 'progress')
    .map((part) => part.text)

describe('AgentService empty round retry', () => {
  it('sends an empty round again to the same model and keeps only the answer', async () => {
    const kit = setupAgent()
    kit.model.script(
      [{ kind: 'reasoning', text: 'Nghĩ mà không nói.' }, ...say('')],
      say('Có hai tác phẩm.')
    )
    const res = await kit.agent.send({
      instruction: 'có mấy truyện?',
      modelSelection: kit.modelSelection
    })
    expect(res).toMatchObject({ status: 'completed', answer: 'Có hai tác phẩm.' })
    expect(kit.model.requests).toHaveLength(2)
    expect(kit.model.requests[1].messages).toEqual(kit.model.requests[0].messages)
    const parts = kit.repository.listParts(res.turnId)
    expect(parts.map((part) => [part.kind, part.text])).toEqual([['text', 'Có hai tác phẩm.']])
    // Usage counts the empty attempt too.
    expect(res.usage).toMatchObject({ inputTokens: 20, outputTokens: 10 })
    expect(retriesOf(kit, res.turnId)).toHaveLength(1)
  })

  it('does not count a retry as a model round of the turn', async () => {
    const kit = setupAgent()
    // Fourteen tool rounds, one empty attempt, then the fifteenth round answers without tools.
    for (let offset = 0; offset < 14; offset++) {
      kit.model.script(
        callTools({ name: 'read_chapter', args: { target: 'ctx', side: 'source', offset } })
      )
    }
    kit.model.script(say(''), say('Xong.'))
    const res = await kit.agent.send({
      instruction: 'đọc',
      context: { workId: kit.work1.id, chapterId: kit.ch1_1.id },
      modelSelection: kit.modelSelection
    })
    expect(res.answer).toBe('Xong.')
    // Round 15 was the last one either way: its retry went without tools as well.
    expect(kit.model.requests.slice(-2).every((request) => request.tools === undefined)).toBe(true)
    expect(kit.model.requests).toHaveLength(16)
  })

  it('stops after two empties in a row with zero output and shows the empty-turn notice', async () => {
    const kit = setupAgent()
    kit.model.script(say('', ZERO), say('', ZERO))
    const res = await kit.agent.send({
      instruction: 'nói gì đi',
      modelSelection: kit.modelSelection
    })
    expect(kit.model.requests).toHaveLength(2)
    expect(noticesOf(kit, res.turnId)).toEqual([EMPTY_TURN_NOTICE])
  })

  it('does not retry a round a content filter stopped', async () => {
    const kit = setupAgent()
    kit.model.script([{ kind: 'done', usage: ZERO, finishReason: 'filter' } as ChatStreamEvent])
    const res = await kit.agent.send({ instruction: 'viết', modelSelection: kit.modelSelection })
    expect(kit.model.requests).toHaveLength(1)
    expect(retriesOf(kit, res.turnId)).toHaveLength(0)
  })

  it('retries at most three times in a turn', async () => {
    const kit = setupAgent()
    // Round 1: two retries then a call. Round 2: one retry, then no more retries are left.
    kit.model.script(
      say(''),
      say(''),
      callTools({ name: 'list_works', args: {} }),
      say(''),
      say('')
    )
    const res = await kit.agent.send({ instruction: 'liệt kê', modelSelection: kit.modelSelection })
    expect(kit.model.requests).toHaveLength(5)
    expect(retriesOf(kit, res.turnId)).toHaveLength(3)
    expect(noticesOf(kit, res.turnId)).toEqual([EMPTY_TURN_NOTICE])
  })
})

describe('AgentService repetition guard', () => {
  const sentence = 'Lâm Phong nhìn lên bầu trời và thấy một vệt sáng xanh vụt qua. '
  const stream = (kind: 'delta' | 'reasoning', text: string): ChatStreamEvent[] =>
    Array.from({ length: Math.ceil(text.length / 100) }, (_, index) => ({
      kind,
      text: text.slice(index * 100, (index + 1) * 100)
    })) as ChatStreamEvent[]

  it('cuts a repeating answer, runs none of its calls and stops the turn with Tiếp tục', async () => {
    const kit = setupAgent()
    const intro = 'Đây là bản tóm tắt. '
    kit.model.script([
      ...stream('delta', intro + sentence.repeat(60)),
      ...callTools({ name: 'list_works', args: {} })
    ])
    const res = await kit.agent.send({ instruction: 'tóm tắt', modelSelection: kit.modelSelection })
    expect(res.status).toBe('completed')
    expect(kit.model.requests).toHaveLength(1)
    expect(kit.agent.listToolCalls(res.turnId)).toHaveLength(0)
    expect(res.answer.startsWith(intro)).toBe(true)
    expect(res.answer.length).toBeLessThan(intro.length + 2 * sentence.length)
    const notices = noticesOf(kit, res.turnId)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatch(new RegExp('^' + BUDGET_STOP_NOTICE + '.*lặp'))
  })

  it('cuts repeating reasoning the same way', async () => {
    const kit = setupAgent()
    kit.model.script([...stream('reasoning', sentence.repeat(60)), ...say('Không tới đây.')])
    const res = await kit.agent.send({ instruction: 'nghĩ', modelSelection: kit.modelSelection })
    expect(res.status).toBe('completed')
    expect(res.answer).toBe('')
    const reasoning = kit.repository.listParts(res.turnId).find((part) => part.kind === 'reasoning')
    expect(reasoning!.text.length).toBeLessThan(2 * sentence.length)
    expect(noticesOf(kit, res.turnId)[0]).toMatch(new RegExp('^' + BUDGET_STOP_NOTICE))
  })
})

describe('AgentService subagent guards', () => {
  const askSubagent = callTools({
    name: 'run_subagent',
    args: { task: 'Tra cứu danh sách tác phẩm', description: 'Liệt kê tác phẩm' }
  })

  it('sends an empty subagent round again', async () => {
    const kit = setupAgent()
    kit.model.script(askSubagent, say(''), say('Thư viện có 2 tác phẩm.'), say('Có 2 tác phẩm.'))
    const res = await kit.agent.send({ instruction: 'liệt kê', modelSelection: kit.modelSelection })
    const [parent] = kit.agent.listToolCalls(res.turnId)
    expect(parent.result).toMatchObject({ value: { summary: 'Thư viện có 2 tác phẩm.' } })
    expect(kit.model.requests).toHaveLength(4)
  })

  it('stops a repeating subagent and reports why to the turn', async () => {
    const kit = setupAgent()
    const sentence = 'Lâm Phong nhìn lên bầu trời và thấy một vệt sáng xanh vụt qua. '
    kit.model.script(
      askSubagent,
      [{ kind: 'delta', text: sentence.repeat(60) }, ...say('')],
      say('Subagent bị lặp.')
    )
    const res = await kit.agent.send({ instruction: 'liệt kê', modelSelection: kit.modelSelection })
    expect(res.answer).toBe('Subagent bị lặp.')
    const [parent] = kit.agent.listToolCalls(res.turnId)
    expect(parent.result).toMatchObject({ value: { stopped: expect.stringContaining('lặp') } })
  })
})
