import { describe, expect, it, vi } from 'vitest'
import * as v from 'valibot'
import type { AgentStreamEvent } from '../../../shared/contracts/agent'
import { validateAgentEventSequence } from '../../../shared/contracts/agent'
import { ProviderError } from '../../infra/providers/types'
import { callTools, say, setupAgent } from './agentTestKit'
import { AgentService, MAX_MODEL_ROUNDS, questionsOf } from './agentService'

const recorder = () => {
  const events: AgentStreamEvent[] = []
  return { events, onStream: (event: AgentStreamEvent) => events.push(event) }
}

describe('AgentService model–tool loop', () => {
  it('answers a read-only question through an allowed read and creates no operation', async () => {
    const { agent, model, modelSelection } = setupAgent()
    model.script(callTools({ name: 'list_works', args: {} }), (request) => {
      const works = JSON.parse(request.messages.at(-1)!.content).value as unknown[]
      return say(`Thư viện có ${works.length} tác phẩm.`)
    })
    const { events, onStream } = recorder()
    const res = await agent.send({
      instruction: 'Thư viện có mấy truyện?',
      modelSelection,
      onStream
    })

    expect(res).toMatchObject({ status: 'completed', answer: 'Thư viện có 2 tác phẩm.' })
    expect(agent.listOperations(res.turnId)).toEqual([])
    expect(agent.listToolCalls(res.turnId)).toEqual([
      expect.objectContaining({
        name: 'list_works',
        decision: 'allow',
        state: 'completed',
        round: 1
      })
    ])
    // Results carry labels, never IDs, and every chat tool is offered with resolve_target first.
    const seen = model.lastToolResult()
    expect(JSON.stringify(seen)).not.toMatch(/"id"/)
    const names = (model.requests[0].tools as Array<{ function: { name: string } }>).map(
      (tool) => tool.function.name
    )
    expect(names[0]).toBe('resolve_target')
    expect(names).toContain('translate_chapter')
    expect(validateAgentEventSequence(events)).toEqual({ ok: true })
    expect(events.at(-1)).toMatchObject({ kind: 'done', turnState: 'completed' })
    expect(res.usage).toMatchObject({ inputTokens: 20, outputTokens: 10, complete: true })
  })

  it('writes the context chapter through the ctx handle', async () => {
    const { agent, model, modelSelection, library, work1, ch1_2 } = setupAgent()
    model.script(callTools({ name: 'translate_chapter', args: { target: 'ctx' } }), say('Đã dịch.'))
    const res = await agent.send({
      instruction: 'dịch chương này',
      context: { workId: work1.id, chapterId: ch1_2.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    const [operation] = agent.listOperations(res.turnId)
    expect(operation).toMatchObject({ state: 'completed', capability: 'translate_chapter' })
    expect(library.readText(work1.id, ch1_2.id, 'target').content).toContain('Dịch: Đoạn một')
  })

  it('resolves a named chapter to a handle and writes only that chapter', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1, ch1_2 } = setupAgent()
    model.script(
      callTools({ name: 'resolve_target', args: { description: 'chương 2' } }),
      (request) => {
        const resolved = JSON.parse(request.messages.at(-1)!.content).value
        expect(resolved).toMatchObject({ status: 'resolved', handle: 't1' })
        return callTools({ name: 'translate_chapter', args: { target: resolved.handle } })
      },
      say('Xong.')
    )
    const res = await agent.send({
      instruction: 'Dịch chương 2',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    const ops = agent.listOperations(res.turnId)
    expect(ops).toHaveLength(1)
    expect(ops[0].target).toMatchObject({ chapterId: ch1_2.id })
    expect(library.readText(work1.id, ch1_1.id, 'target').content).toBe('')
  })

  it('reports not_found without creating an operation', async () => {
    const { agent, model, modelSelection } = setupAgent()
    model.script(
      callTools({ name: 'resolve_target', args: { description: 'truyện Không Có chương 9' } }),
      say('Không tìm thấy đích.')
    )
    const res = await agent.send({ instruction: 'dịch truyện Không Có chương 9', modelSelection })
    expect(model.lastToolResult().value.status).toBe('not_found')
    expect(res.answer).toContain('Không tìm thấy')
    expect(agent.listOperations(res.turnId)).toEqual([])
  })

  it('refuses an unknown tool, a raw ID and a handle the turn never issued', async () => {
    const { agent, model, modelSelection, work1 } = setupAgent()
    model.script(
      callTools(
        { name: 'run_sql', args: { sql: 'DELETE FROM work_index' } },
        { name: 'list_chapters', args: { target: work1.id } },
        { name: 'list_chapters', args: { target: 'ctx' } }
      ),
      say('Không làm được.')
    )
    const res = await agent.send({ instruction: 'xóa hết', modelSelection })
    const rows = agent.listToolCalls(res.turnId)
    expect(rows.map((row) => [row.name, row.decision, row.state])).toEqual([
      ['run_sql', 'deny', 'failed'],
      ['list_chapters', 'deny', 'failed'],
      // The chip was removed (no context), so "ctx" was never issued either.
      ['list_chapters', 'deny', 'failed']
    ])
    const toolMessages = model.requests[1].messages.filter((m) => m.role === 'tool')
    expect(toolMessages).toHaveLength(3)
    for (const message of toolMessages) expect(JSON.parse(message.content).ok).toBe(false)
    expect(agent.listOperations(res.turnId)).toEqual([])
  })

  it('runs the valid call of a round and stores a result for the invalid one', async () => {
    const { agent, model, modelSelection, work1, ch1_1 } = setupAgent()
    model.script(
      callTools(
        { name: 'read_chapter', args: { target: 'ctx', side: 'source' }, id: 'good' },
        { name: 'read_chapter', args: { target: 'ctx', offset: -1 }, id: 'bad' },
        { raw: '{not json', name: 'list_works', id: 'broken' }
      ),
      say('Đã đọc.')
    )
    const res = await agent.send({
      instruction: 'đọc chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    const rows = agent.listToolCalls(res.turnId)
    expect(rows.map((row) => [row.callId, row.state])).toEqual([
      ['good', 'completed'],
      ['bad', 'failed'],
      ['broken', 'failed']
    ])
    expect(
      (rows[0].result as { value: { source: { content: string } } }).value.source.content
    ).toContain('Đoạn một')
    expect(rows[1].result).toMatchObject({ ok: false, error: { code: 'validation' } })
  })

  it('fails the turn and runs nothing when the round cannot be persisted', async () => {
    const { agent, model, modelSelection, repository, registry } = setupAgent()
    vi.spyOn(repository, 'insertToolCalls').mockImplementation(() => {
      throw new Error('disk full')
    })
    const execute = vi.spyOn(registry, 'execute')
    model.script(callTools({ name: 'list_works', args: {} }))
    const { events, onStream } = recorder()
    const res = await agent.send({ instruction: 'liệt kê', modelSelection, onStream })
    expect(res.status).toBe('failed')
    expect(execute).not.toHaveBeenCalled()
    expect(agent.getTurn(res.turnId)?.status).toBe('failed')
    expect(events.at(-1)).toMatchObject({ kind: 'error', error: { code: 'persistence' } })
    expect(model.requests).toHaveLength(1)
  })

  it('sends no tools to a model the catalog marks without tool calls', async () => {
    const { agent, model, modelSelection, work1, ch1_1 } = setupAgent()
    model.info = { id: 'old', name: 'Old', toolCall: false }
    model.script(say('Tôi không dùng được công cụ.'))
    const res = await agent.send({
      instruction: 'dịch chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    expect(model.requests[0].tools).toBeUndefined()
    expect(agent.listOperations(res.turnId)).toEqual([])
    expect(
      agent
        .getSessionDetail(res.sessionId)
        .parts.filter((part) => part.kind === 'progress')
        .map((part) => part.text)
    ).toContain('Model này không dùng được công cụ; trả lời từ ngữ cảnh đã gửi.')
  })

  it('fails on a provider error in round two without asking another model', async () => {
    const { agent, model, modelSelection } = setupAgent()
    model.script(
      callTools({ name: 'list_works', args: {} }),
      new ProviderError('rate_limited', 'slow down')
    )
    const open = vi.spyOn(model, 'open')
    const { events, onStream } = recorder()
    await expect(agent.send({ instruction: 'liệt kê', modelSelection, onStream })).rejects.toThrow()
    const turnId = events[0].turnId
    expect(agent.getTurn(turnId)?.status).toBe('failed')
    expect(open).toHaveBeenCalledTimes(1)
    expect(model.requests).toHaveLength(2)
    expect(agent.listToolCalls(turnId)).toEqual([expect.objectContaining({ state: 'completed' })])
    expect(events.at(-1)).toMatchObject({ kind: 'error', error: { code: 'provider_rate_limited' } })
  })
})

describe('AgentService budget and loop', () => {
  it('sends the sixth round without tools so the model must answer', async () => {
    const { agent, model, modelSelection, work1, ch1_1 } = setupAgent()
    for (let offset = 0; offset < MAX_MODEL_ROUNDS - 1; offset++) {
      model.script(callTools({ name: 'read_chapter', args: { target: 'ctx', offset } }))
    }
    model.script(say('Tóm tắt.'))
    const res = await agent.send({
      instruction: 'tóm tắt chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    expect(model.requests).toHaveLength(MAX_MODEL_ROUNDS)
    expect(model.requests.slice(0, -1).every((r) => r.tools !== undefined)).toBe(true)
    expect(model.requests.at(-1)!.tools).toBeUndefined()
  })

  it('stops a loop on the third identical call without a summary round', async () => {
    const { agent, model, modelSelection } = setupAgent()
    for (let i = 0; i < 3; i++) model.script(callTools({ name: 'list_works', args: {} }))
    const { events, onStream } = recorder()
    const res = await agent.send({ instruction: 'liệt kê', modelSelection, onStream })
    expect(res.status).toBe('failed')
    expect(model.requests).toHaveLength(3)
    const rows = agent.listToolCalls(res.turnId)
    expect(rows.map((row) => row.state)).toEqual(['completed', 'completed', 'failed'])
    expect(rows[2].result).toMatchObject({ error: { code: 'loop' } })
    expect(events.at(-1)).toMatchObject({ kind: 'error', error: { code: 'loop' } })
    expect(agent.getTurn(res.turnId)?.usage).not.toBeNull()
  })

  it('stops when a read would pass the character budget and never hands it to the model', async () => {
    const { agent, model, modelSelection, registry } = setupAgent()
    registry.register({
      name: 'huge_read',
      description: 'test',
      kind: 'read',
      schema: v.object({}),
      parameters: { type: 'object', properties: {}, required: [] },
      targetPolicy: 'no_target',
      handler: async () => ({ ok: true, value: 'x'.repeat(100_001) })
    })
    model.script(callTools({ name: 'huge_read', args: {} }))
    const res = await agent.send({ instruction: 'đọc hết', modelSelection })
    expect(res.status).toBe('failed')
    expect(model.requests).toHaveLength(1)
    expect(agent.listToolCalls(res.turnId)[0].result).toMatchObject({
      error: { code: 'budget_read' }
    })
  })

  it('turns the call over the call cap into an error and makes the next round final', async () => {
    const { agent, model, modelSelection, work1, ch1_1 } = setupAgent()
    model.script(
      callTools(
        ...Array.from({ length: 21 }, (_, offset) => ({
          name: 'read_chapter',
          args: { target: 'ctx', side: 'source', offset }
        }))
      ),
      say('Đủ rồi.')
    )
    const res = await agent.send({
      instruction: 'đọc chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    const rows = agent.listToolCalls(res.turnId)
    expect(rows.filter((row) => row.state === 'completed')).toHaveLength(20)
    expect(rows[20].result).toMatchObject({ error: { code: 'budget_calls' } })
    expect(model.requests[1].tools).toBeUndefined()
  })

  it('stops before a fourth write operation runs', async () => {
    const { agent, model, modelSelection, work1 } = setupAgent()
    const names = ['chương 1', 'chương 2', 'chương Tiết tử Thượng', 'chương Tiết tử Hạ']
    model.script(
      callTools(...names.map((description) => ({ name: 'resolve_target', args: { description } }))),
      callTools(
        ...['t1', 't2', 't3', 't4'].map((target) => ({
          name: 'translate_chapter',
          args: { target }
        }))
      )
    )
    const res = await agent.send({
      instruction: 'dịch chương 1, chương 2, Tiết tử Thượng và Tiết tử Hạ',
      context: { workId: work1.id },
      modelSelection
    })
    expect(res.status).toBe('failed')
    expect(agent.listOperations(res.turnId)).toHaveLength(3)
    expect(agent.listToolCalls(res.turnId).at(-1)?.result).toMatchObject({
      error: { code: 'budget_write' }
    })
    expect(model.requests).toHaveLength(2)
  })

  it('drops the oldest turns from a long session and records how many', async () => {
    const { agent, model, modelSelection } = setupAgent()
    model.script(say('Một câu trả lời rất dài. '.repeat(40)))
    const first = await agent.send({ instruction: 'câu đầu', modelSelection })
    model.info = { id: 'tiny', name: 'Tiny', toolCall: true, contextLimit: 2_000, outputLimit: 500 }
    model.script(say('Ngắn.'))
    const second = await agent.send({
      sessionId: first.sessionId,
      instruction: 'câu hai nguyên văn',
      modelSelection
    })
    const messages = model.requests[1].messages
    expect(messages.map((m) => m.content)).not.toContain('câu đầu')
    expect(messages.some((m) => m.content.startsWith('câu hai nguyên văn'))).toBe(true)
    const dropped = agent
      .getSessionDetail(second.sessionId)
      .parts.find((part) => part.turnId === second.turnId && part.kind === 'progress')
    expect(dropped?.text).toBe('Bỏ 1 lượt cũ khỏi ngữ cảnh model')
  })
})

describe('AgentService waiting_user and continuation', () => {
  async function ambiguous() {
    const kit = setupAgent()
    kit.model.script(callTools({ name: 'resolve_target', args: { description: 'chương Tiết tử' } }))
    const res = await kit.agent.send({
      instruction: 'Dịch chương Tiết tử',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })
    return { ...kit, res, pending: kit.agent.getSessionDetail(res.sessionId).pending }
  }

  it('waits on an ambiguous target with distinguishable candidates and no operation', async () => {
    const { agent, res, pending } = await ambiguous()
    expect(res.status).toBe('waiting_user')
    expect(agent.listOperations(res.turnId)).toEqual([])
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ kind: 'choose', name: 'resolve_target' })
    expect(pending[0].candidates.map((c) => c.label)).toEqual([
      'Đại Đạo Triều Thiên – Tiết tử Thượng',
      'Đại Đạo Triều Thiên – Tiết tử Hạ'
    ])
  })

  it('continues the same turn with the chosen candidate and writes once', async () => {
    const { agent, model, modelSelection, res, pending, library, work1, ch1_amb2 } =
      await ambiguous()
    const chosen = pending[0].candidates[1]
    model.script((request) => {
      expect(JSON.parse(request.messages.at(-1)!.content).value).toMatchObject({
        status: 'resolved',
        handle: chosen.handle
      })
      return callTools({ name: 'translate_chapter', args: { target: chosen.handle } })
    }, say('Đã dịch Tiết tử Hạ.'))
    const reply = {
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending[0].toolCallId,
        argsDigest: pending[0].argsDigest,
        choice: chosen.handle
      },
      instruction: chosen.label,
      modelSelection,
      commandId: 'reply-1'
    }
    const resumed = await agent.send(reply)
    expect(resumed).toMatchObject({ turnId: res.turnId, status: 'completed' })
    expect(agent.listTurns(res.sessionId)).toHaveLength(1)
    expect(agent.listOperations(res.turnId)).toHaveLength(1)
    expect(library.readText(work1.id, ch1_amb2.id, 'target').content).toContain('Dịch:')

    // The same command again returns the same turn and runs nothing more.
    const again = agent.acceptTurn({ ...reply, clientCommandId: 'reply-1' })
    expect(again).toMatchObject({ turnId: res.turnId, created: false })
    expect(agent.listOperations(res.turnId)).toHaveLength(1)
  })

  it('rejects a reply with a wrong digest or for a turn that no longer waits', async () => {
    const { agent, res, pending } = await ambiguous()
    const base = { clientCommandId: 'r', instruction: 'x', continuesTurnId: res.turnId }
    expect(() =>
      agent.acceptTurn({
        ...base,
        pendingReply: {
          ...pending[0],
          argsDigest: 'sha256:other',
          choice: pending[0].candidates[0].handle
        }
      })
    ).toThrow(/không còn hiệu lực/)
    expect(agent.getTurn(res.turnId)?.status).toBe('waiting_user')

    agent.cancelTurn(res.turnId)
    expect(agent.getTurn(res.turnId)?.status).toBe('cancelled')
    expect(agent.listToolCalls(res.turnId)[0].state).toBe('cancelled')
    expect(() =>
      agent.acceptTurn({
        ...base,
        clientCommandId: 'r2',
        pendingReply: { ...pending[0], choice: pending[0].candidates[0].handle }
      })
    ).toThrow(/không còn hiệu lực/)
  })

  it('asks before writing a target the user did not name and binds approval to that call', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1, work2, ch2_1 } = setupAgent()
    // The raw of chapter 1 told the model to translate another work; the model obeyed.
    model.script(
      callTools({ name: 'resolve_target', args: { description: 'Phàm Nhân Tu Tiên chương 1' } }),
      callTools({ name: 'translate_chapter', args: { target: 't1' } })
    )
    const res = await agent.send({
      instruction: 'tóm tắt chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('waiting_user')
    expect(library.readText(work2.id, ch2_1.id, 'target').content).toBe('')
    const [pending] = agent.getSessionDetail(res.sessionId).pending
    expect(pending).toMatchObject({ kind: 'approve', name: 'translate_chapter' })

    // Approved; the model then asks for the same write again: a new call, judged on its own.
    model.script(callTools({ name: 'translate_chapter', args: { target: 't1' } }))
    const resumed = await agent.send({
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending.toolCallId,
        argsDigest: pending.argsDigest,
        choice: 'approve'
      },
      instruction: 'Duyệt',
      modelSelection,
      commandId: 'approve-1'
    })
    expect(resumed.status).toBe('waiting_user')
    expect(agent.listOperations(res.turnId)).toHaveLength(1)
    expect(library.readText(work2.id, ch2_1.id, 'target').content).toContain('Dịch:')
    const next = agent.getSessionDetail(res.sessionId).pending
    expect(next).toHaveLength(1)
    expect(next[0].toolCallId).not.toBe(pending.toolCallId)
  })

  it('filters out write tools when mode is ask', async () => {
    const { agent, model, modelSelection, work1, ch1_1 } = setupAgent()
    model.script(say('Chỉ trả lời câu hỏi tra cứu.'))
    const res = await agent.send({
      instruction: 'chương này nói về gì?',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection,
      mode: 'ask'
    })
    expect(res.status).toBe('completed')
    const toolDefs = (model.requests[0].tools ?? []) as Array<{ function: { name: string } }>
    const toolNames = toolDefs.map((t) => t.function.name)
    expect(toolNames).not.toContain('translate_chapter')
    expect(toolNames).not.toContain('edit_translation')
    expect(toolNames).toContain('resolve_target')
  })

  it('asks two typed questions and sends the model their titles and answer labels', async () => {
    const { agent, model, modelSelection } = setupAgent()
    model.script(
      callTools({
        name: 'ask_questions',
        args: {
          questions: [
            {
              id: 'style',
              title: 'Bạn muốn dịch theo phong cách nào?',
              type: 'single',
              options: ['Thuần Việt', 'Hán Việt / Convert'],
              default: 'Thuần Việt',
              allowFreeText: true
            },
            {
              id: 'names',
              title: 'Giữ tên Hán Việt cho ai?',
              type: 'multi',
              options: ['Lâm Động', 'Lâm Lang Thiên', 'Tiểu Điêu']
            },
            { id: 'note', title: 'Ghi chú thêm?', type: 'text', required: false }
          ]
        }
      })
    )
    const res = await agent.send({ instruction: 'dịch chương này', modelSelection })
    expect(res.status).toBe('waiting_user')
    const [pending] = agent.getSessionDetail(res.sessionId).pending
    expect(pending).toMatchObject({ kind: 'question', allowSkip: true, candidates: [] })
    expect(pending.questions!.map((q) => q.id)).toEqual(['style', 'names', 'note'])

    const reply = (answers: Record<string, string | string[]>) =>
      agent.send({
        continuesTurnId: res.turnId,
        pendingReply: { toolCallId: pending.toolCallId, argsDigest: pending.argsDigest, answers },
        instruction: 'Trả lời câu hỏi',
        modelSelection
      })
    // A required question without an answer is refused and the turn keeps waiting.
    await expect(reply({ style: 'Thuần Việt' })).rejects.toThrow('Giữ tên Hán Việt cho ai?')
    await expect(reply({ style: 'Thuần Việt', names: ['Ai đó'] })).rejects.toThrow(
      'không nằm trong các lựa chọn'
    )
    expect(agent.getTurn(res.turnId)?.status).toBe('waiting_user')

    model.script((request) => {
      const result = JSON.parse(request.messages.at(-1)!.content)
      expect(result.value).toEqual({
        answers: [
          {
            id: 'style',
            title: 'Bạn muốn dịch theo phong cách nào?',
            answer: 'Thuần Việt nhưng giữ tên riêng'
          },
          { id: 'names', title: 'Giữ tên Hán Việt cho ai?', answer: 'Lâm Động, Tiểu Điêu' }
        ]
      })
      return say('Đã rõ.')
    })
    const resumed = await reply({
      style: 'Thuần Việt nhưng giữ tên riêng',
      names: ['Lâm Động', 'Tiểu Điêu']
    })
    expect(resumed.status).toBe('completed')
    const view = agent.getSessionDetail(res.sessionId).toolCalls[0]
    expect(view.questionAnswers).toHaveLength(2)
  })

  it('lets the user skip the questions unless the model turned skipping off', async () => {
    const { agent, model, modelSelection } = setupAgent()
    const ask = (allowSkip: boolean) =>
      callTools({
        name: 'ask_questions',
        args: {
          allowSkip,
          questions: [{ id: 'q', title: 'Phong cách?', type: 'single', options: ['A', 'B'] }]
        }
      })
    model.script(ask(false))
    const locked = await agent.send({ instruction: 'dịch', modelSelection })
    const [first] = agent.getSessionDetail(locked.sessionId).pending
    await expect(
      agent.send({
        continuesTurnId: locked.turnId,
        pendingReply: { toolCallId: first.toolCallId, argsDigest: first.argsDigest, skipped: true },
        instruction: 'Bỏ qua',
        modelSelection
      })
    ).rejects.toThrow('không cho bỏ qua')

    model.script(ask(true))
    const open = await agent.send({
      sessionId: locked.sessionId,
      instruction: 'dịch lại',
      modelSelection
    })
    const [second] = agent.getSessionDetail(open.sessionId).pending
    model.script((request) => {
      expect(JSON.parse(request.messages.at(-1)!.content).value).toEqual({ skipped: true })
      return say('Tôi sẽ tự chọn.')
    })
    const resumed = await agent.send({
      continuesTurnId: open.turnId,
      pendingReply: { toolCallId: second.toolCallId, argsDigest: second.argsDigest, skipped: true },
      instruction: 'Bỏ qua',
      modelSelection
    })
    expect(resumed.status).toBe('completed')
    expect(agent.getSessionDetail(open.sessionId).toolCalls.at(-1)?.questionAnswers).toBe('skipped')
  })

  it('refuses a choice question with more than nine options before waiting', async () => {
    const { agent, model, modelSelection } = setupAgent()
    const options = Array.from({ length: 12 }, (_, n) => 'Lựa chọn ' + (n + 1))
    model.script(
      callTools({
        name: 'ask_questions',
        args: { questions: [{ id: 'q', title: 'Chọn?', type: 'single', options }] }
      }),
      say('Tôi hỏi lại gọn hơn.')
    )
    const res = await agent.send({ instruction: 'dịch', modelSelection })
    expect(res.status).toBe('completed')
    expect(model.requests[1].messages.at(-1)!.content).toContain('"validation"')
    expect(agent.listToolCalls(res.turnId)[0]).toMatchObject({ state: 'failed' })
  })

  it('reads a question stored in the old shape as one single-choice question', () => {
    expect(questionsOf({ question: 'Phong cách?', options: ['A', 'B'] })).toEqual([
      { id: 'q1', title: 'Phong cách?', type: 'single', options: ['A', 'B'], allowFreeText: false }
    ])
  })

  it('keeps a waiting turn across shutdown and startup, then expires it on a new command', async () => {
    const kit = await ambiguous()
    kit.agent.shutdown()
    expect(kit.agent.getTurn(kit.res.turnId)?.status).toBe('waiting_user')

    const restarted = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: kit.repository,
      registry: kit.registry,
      openChatModel: (selection) => kit.model.open(selection)
    })
    expect(restarted.reconcileOnStartup().settledTurns).toBe(0)
    expect(restarted.getTurn(kit.res.turnId)?.status).toBe('waiting_user')

    kit.model.script(say('Chào.'))
    const next = await restarted.send({
      sessionId: kit.res.sessionId,
      instruction: 'chào',
      modelSelection: kit.modelSelection
    })
    expect(next.status).toBe('completed')
    expect(restarted.getTurn(kit.res.turnId)?.status).toBe('expired')
    expect(restarted.listToolCalls(kit.res.turnId)[0].state).toBe('expired')
    expect(restarted.getSessionDetail(kit.res.sessionId).pending).toEqual([])
  })
})

describe('AgentService chat modes and permission levels', () => {
  /** A session at `level` that the next `send` continues. */
  function sessionAt(
    agent: ReturnType<typeof setupAgent>['agent'],
    level: 'default' | 'allow_all' | 'autopilot'
  ): string {
    const session = agent.createSession('Quyền')
    agent.setPermissionLevel(session.id, level)
    return session.id
  }
  const toolNames = (request: { tools?: unknown }) =>
    ((request.tools ?? []) as Array<{ function: { name: string } }>).map((t) => t.function.name)
  const question = callTools({
    name: 'ask_questions',
    args: {
      questions: [
        {
          id: 'style',
          title: 'Phong cách nào?',
          type: 'single',
          options: ['Thuần Việt', 'Hán Việt']
        }
      ]
    }
  })

  it('keeps Ask on the turn after the user answers, so a write is still refused', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1 } = setupAgent()
    model.script(question)
    const res = await agent.send({
      instruction: 'chương này nói về gì?',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection,
      mode: 'ask'
    })
    expect(res.status).toBe('waiting_user')
    expect(agent.getTurn(res.turnId)?.mode).toBe('ask')
    const [pending] = agent.getSessionDetail(res.sessionId).pending

    model.script(callTools({ name: 'translate_chapter', args: { target: 'ctx' } }), say('Xong.'))
    await agent.send({
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending.toolCallId,
        argsDigest: pending.argsDigest,
        answers: { style: 'Thuần Việt' }
      },
      instruction: 'Thuần Việt',
      modelSelection,
      // A resumed turn ignores the mode its command carries.
      mode: 'agent'
    })
    expect(toolNames(model.requests[1])).not.toContain('translate_chapter')
    const write = agent.listToolCalls(res.turnId).find((call) => call.name === 'translate_chapter')
    expect(write).toMatchObject({ decision: 'deny', state: 'failed' })
    expect(library.readText(work1.id, ch1_1.id, 'target').content).toBe('')
  })

  it('starts every new session at the default level', () => {
    const { agent } = setupAgent()
    const first = sessionAt(agent, 'autopilot')
    expect(agent.getSessionDetail(first).session.permissionLevel).toBe('autopilot')
    expect(agent.createSession('Mới').permissionLevel).toBe('default')
  })

  it('runs a waiting turn at the level it was accepted with, and the next turn at the new one', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1, work2, ch2_1 } = setupAgent()
    const sessionId = sessionAt(agent, 'allow_all')
    model.script(question)
    const res = await agent.send({
      sessionId,
      instruction: 'tóm tắt chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    // Allow all approves writes but never answers a question for the user.
    expect(res.status).toBe('waiting_user')
    agent.setPermissionLevel(sessionId, 'default')
    const [pending] = agent.getSessionDetail(sessionId).pending

    model.script(
      callTools({ name: 'resolve_target', args: { description: 'Phàm Nhân Tu Tiên chương 1' } }),
      callTools({ name: 'translate_chapter', args: { target: 't1' } }),
      say('Đã dịch.')
    )
    const resumed = await agent.send({
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending.toolCallId,
        argsDigest: pending.argsDigest,
        answers: { style: 'Thuần Việt' }
      },
      instruction: 'Thuần Việt',
      modelSelection
    })
    expect(resumed.status).toBe('completed')
    expect(library.readText(work2.id, ch2_1.id, 'target').content).toContain('Dịch:')
    const write = agent.listToolCalls(res.turnId).find((call) => call.name === 'translate_chapter')
    expect(write).toMatchObject({ decision: 'needs_user', approval: 'level_allow_all' })

    model.script(
      callTools({ name: 'resolve_target', args: { description: 'Phàm Nhân Tu Tiên chương 1' } }),
      callTools({ name: 'translate_chapter', args: { target: 't1' } })
    )
    const next = await agent.send({
      sessionId,
      instruction: 'tóm tắt chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(next.status).toBe('waiting_user')
  })

  it('skips a write to a work the user did not name in Autopilot', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1, work2, ch2_1 } = setupAgent()
    const sessionId = sessionAt(agent, 'autopilot')
    model.script(
      callTools({ name: 'resolve_target', args: { description: 'Phàm Nhân Tu Tiên chương 1' } }),
      callTools({ name: 'translate_chapter', args: { target: 't1' } }),
      say('Không dịch được.')
    )
    const res = await agent.send({
      sessionId,
      instruction: 'tóm tắt chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    expect(library.readText(work2.id, ch2_1.id, 'target').content).toBe('')
    const write = agent.listToolCalls(res.turnId).find((call) => call.name === 'translate_chapter')
    expect(write).toMatchObject({
      state: 'failed',
      approval: 'autopilot_skip',
      result: { ok: false, error: { code: 'autopilot_skipped' } }
    })
    // The model was told, through the stored result, not to retry as is.
    expect(JSON.stringify(model.requests[2].messages)).toContain('autopilot_skipped')
  })

  it('writes the context chapter in Autopilot as it would by default', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1 } = setupAgent()
    const sessionId = sessionAt(agent, 'autopilot')
    model.script(callTools({ name: 'translate_chapter', args: { target: 'ctx' } }), say('Xong.'))
    const res = await agent.send({
      sessionId,
      instruction: 'dịch chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    expect(res.status).toBe('completed')
    expect(library.readText(work1.id, ch1_1.id, 'target').content).toContain('Dịch:')
  })

  it('answers a question with its default, else its first option, in Autopilot', async () => {
    const { agent, model, modelSelection } = setupAgent()
    const sessionId = sessionAt(agent, 'autopilot')
    model.script(question, say('Tự động chọn Thuần Việt.'))
    const res = await agent.send({ sessionId, instruction: 'dịch chương này', modelSelection })
    expect(res.status).toBe('completed')
    expect(agent.getSessionDetail(sessionId).pending).toHaveLength(0)
    const asked = agent.listToolCalls(res.turnId)[0]
    expect(asked).toMatchObject({
      approval: 'level_autopilot',
      result: {
        ok: true,
        value: { answers: [{ id: 'style', answer: 'Thuần Việt' }], autoAnswered: true }
      }
    })
  })

  it('still refuses a denied call at allow_all', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1 } = setupAgent()
    model.script(callTools({ name: 'translate_chapter', args: { target: 'ctx' } }), say('Xong.'))
    const translated = await agent.send({
      instruction: 'dịch chương này',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    const [operation] = agent.listOperations(translated.turnId)
    const text = library.readText(work1.id, ch1_1.id, 'target').content

    model.script(
      callTools({ name: 'undo_operation', args: { operationId: operation.id } }),
      say('Không được.')
    )
    const other = await agent.send({
      sessionId: sessionAt(agent, 'allow_all'),
      instruction: 'hoàn tác',
      modelSelection
    })
    expect(agent.listToolCalls(other.turnId)[0]).toMatchObject({
      decision: 'deny',
      state: 'failed'
    })
    expect(library.readText(work1.id, ch1_1.id, 'target').content).toBe(text)
  })

  it('remembers an approval for the session only', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1, work2, ch2_1 } = setupAgent()
    const unnamedWrite = () => [
      callTools({ name: 'resolve_target', args: { description: 'Phàm Nhân Tu Tiên chương 1' } }),
      callTools({ name: 'translate_chapter', args: { target: 't1' } })
    ]
    const ask = (sessionId?: string) =>
      agent.send({
        sessionId,
        instruction: 'tóm tắt chương này',
        context: { workId: work1.id, chapterId: ch1_1.id },
        modelSelection
      })
    model.script(...unnamedWrite())
    const first = await ask()
    const [pending] = agent.getSessionDetail(first.sessionId).pending
    model.script(say('Đã dịch.'))
    await agent.send({
      continuesTurnId: first.turnId,
      pendingReply: {
        toolCallId: pending.toolCallId,
        argsDigest: pending.argsDigest,
        choice: 'approve_session'
      },
      instruction: 'Cho phép trong phiên này',
      modelSelection
    })
    expect(library.readText(work2.id, ch2_1.id, 'target').content).toContain('Dịch:')
    expect(agent.getSessionDetail(first.sessionId).sessionApprovals).toEqual(['translate_chapter'])

    model.script(...unnamedWrite(), say('Dịch lại.'))
    const again = await ask(first.sessionId)
    expect(again.status).toBe('completed')
    const write = agent
      .listToolCalls(again.turnId)
      .find((call) => call.name === 'translate_chapter')
    expect(write?.approval).toBe('user_session')

    model.script(...unnamedWrite())
    const other = await ask()
    expect(other.sessionId).not.toBe(first.sessionId)
    expect(other.status).toBe('waiting_user')
  })
})

describe('AgentService response parts', () => {
  /** One model round that thinks, writes, then calls tools. */
  const think = (reasoning: string, text: string, ...calls: Parameters<typeof callTools>) => [
    { kind: 'reasoning' as const, text: reasoning },
    { kind: 'delta' as const, text },
    ...callTools(...calls)
  ]

  it('stores text, tool call and text in the order they happened, and reads them back', async () => {
    const { agent, model, modelSelection } = setupAgent()
    model.script(
      think('Cần danh sách.', 'Để tôi xem thư viện.', { name: 'list_works', args: {} }),
      say('Thư viện có 2 tác phẩm.')
    )
    const res = await agent.send({ instruction: 'thư viện có gì?', modelSelection })
    expect(res.status).toBe('completed')
    const detail = agent.getSessionDetail(res.sessionId)
    const parts = detail.parts.filter((part) => part.turnId === res.turnId)
    expect(parts.map((part) => [part.kind, part.round, part.text])).toEqual([
      ['reasoning', 1, 'Cần danh sách.'],
      ['text', 1, 'Để tôi xem thư viện.'],
      ['tool_call', 1, ''],
      ['text', 2, 'Thư viện có 2 tác phẩm.']
    ])
    const call = detail.toolCalls.find((item) => item.id === parts[2].toolCallId)
    expect(call).toMatchObject({
      name: 'list_works',
      state: 'completed',
      invocationMessage: 'Đang đọc danh sách tác phẩm',
      pastTenseMessage: 'Đã đọc danh sách tác phẩm'
    })
    // The answer the model sees as history is unchanged.
    expect(agent.getTurn(res.turnId)).toMatchObject({
      answer: 'Để tôi xem thư viện.\n\nThư viện có 2 tác phẩm.',
      reasoning: 'Cần danh sách.'
    })
    // The footer names the model the turn ran on.
    expect(agent.getTurn(res.turnId)?.modelLabel).toBe('Mock Model')
    // Reopening reads the same parts from the library DB.
    expect(agent.getSessionDetail(res.sessionId).parts).toEqual(detail.parts)
  })

  it('rebuilds parts for a turn stored before parts existed', async () => {
    const { agent, model, modelSelection, library } = setupAgent()
    model.script(callTools({ name: 'list_works', args: {} }), say('Có 2 tác phẩm.'))
    const res = await agent.send({ instruction: 'thư viện có gì?', modelSelection })
    // A turn from before library v16 has no parts.
    library.appDb.prepare('DELETE FROM agent_turn_part WHERE turn_id = ?').run(res.turnId)
    const parts = agent.getSessionDetail(res.sessionId).parts
    const [call] = agent.listToolCalls(res.turnId)
    expect(parts.map((part) => [part.kind, part.toolCallId, part.text])).toEqual([
      ['tool_call', call.id, ''],
      ['text', null, 'Có 2 tác phẩm.']
    ])
    expect(parts.map((part) => part.seq)).toEqual([1, 2])
  })

  it('announces a call when it runs and when it ends, and a refused call only when it ends', async () => {
    const { agent, model, modelSelection } = setupAgent()
    const events: AgentStreamEvent[] = []
    model.script(
      callTools(
        { name: 'list_works', args: {} },
        { name: 'read_chapter', args: { target: 'not-issued' } }
      ),
      say('Xong.')
    )
    const res = await agent.send({
      instruction: 'xem',
      modelSelection,
      onStream: (event) => events.push(event)
    })
    expect(validateAgentEventSequence(events)).toEqual({ ok: true })
    const calls = events
      .filter((event) => event.kind === 'tool-call')
      .map((event) => event.toolCall as { name: string; state: string; reason: string | null })
    expect(calls.map((call) => [call.name, call.state])).toEqual([
      ['read_chapter', 'failed'],
      ['list_works', 'running'],
      ['list_works', 'completed']
    ])
    expect(calls[0].reason).toMatch(/handle/)
    const deltas = events.filter((event) => event.kind === 'answer-delta')
    expect(deltas.at(-1)).toMatchObject({ text: 'Xong.', round: 2 })
    expect(agent.getToolCallDetail(agent.listToolCalls(res.turnId)[0].id).result).toMatchObject({
      ok: true
    })
  })

  it('keeps what a stopped round streamed as parts', async () => {
    const { agent, model, modelSelection } = setupAgent()
    const controller = new AbortController()
    model.script([
      { kind: 'delta', text: 'Đang viết dở' },
      { kind: 'delta', text: ' và chưa xong' }
    ])
    await agent
      .send({
        instruction: 'viết',
        modelSelection,
        signal: controller.signal,
        onStream: (event) => {
          if (event.kind === 'answer-delta') controller.abort()
        }
      })
      .catch(() => null)
    const [session] = agent.listSessions()
    const detail = agent.getSessionDetail(session.id)
    expect(detail.turns[0].status).toBe('cancelled')
    expect(detail.parts.map((part) => [part.kind, part.text])).toEqual([['text', 'Đang viết dở']])
  })

  it('stores subagent calls under the parent call and returns only its last text', async () => {
    const { agent, model, modelSelection } = setupAgent()
    const events: AgentStreamEvent[] = []
    model.script(
      callTools({
        name: 'run_subagent',
        args: { task: 'Tra cứu danh sách tác phẩm', description: 'Liệt kê tác phẩm' }
      }),
      [{ kind: 'delta', text: 'Tôi sẽ tra.' }, ...callTools({ name: 'list_works', args: {} })],
      say('Thư viện có 2 tác phẩm.'),
      say('Theo subagent, thư viện có 2 tác phẩm.')
    )
    const res = await agent.send({
      instruction: 'thư viện có những truyện nào?',
      modelSelection,
      onStream: (event) => events.push(event)
    })
    expect(res.answer).toBe('Theo subagent, thư viện có 2 tác phẩm.')
    const [parent] = agent.listToolCalls(res.turnId)
    expect(parent).toMatchObject({
      name: 'run_subagent',
      result: { ok: true, value: { summary: 'Thư viện có 2 tác phẩm.' } }
    })
    const detail = agent.getSessionDetail(res.sessionId)
    const children = detail.toolCalls.filter((call) => call.parentToolCallId === parent.id)
    expect(children.map((call) => [call.name, call.state])).toEqual([['list_works', 'completed']])
    expect(detail.toolCalls.find((call) => call.id === parent.id)).toMatchObject({
      invocationMessage: 'Đang chạy subagent: Liệt kê tác phẩm',
      pastTenseMessage: 'Đã chạy subagent: Liệt kê tác phẩm'
    })
    const childEvents = events
      .filter((event) => event.kind === 'tool-call')
      .map((event) => event.toolCall as { parentToolCallId: string | null; state: string })
      .filter((call) => call.parentToolCallId === parent.id)
    expect(childEvents.map((call) => call.state)).toEqual(['running', 'completed'])
    // Subagent rounds answer a tool call of the turn, never the user.
    expect(
      model.requests.slice(1, 3).every((request) => request.messages[0].role === 'system')
    ).toBe(true)
  })

  it('refuses a write in a subagent and stops it at its call ceiling', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1 } = setupAgent()
    const resolves = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        name: 'resolve_target',
        args: { description: 'mô tả ' + (from + index) }
      }))
    model.script(
      callTools({ name: 'run_subagent', args: { task: 'Dịch thử', description: 'Thử ghi' } }),
      callTools({ name: 'translate_chapter', args: { target: 'ctx' } }, ...resolves(1, 5)),
      callTools(...resolves(6, 6)),
      say('Hết.')
    )
    const res = await agent.send({
      instruction: 'dịch',
      context: { workId: work1.id, chapterId: ch1_1.id },
      modelSelection
    })
    const [parent] = agent.listToolCalls(res.turnId)
    const children = agent
      .getSessionDetail(res.sessionId)
      .toolCalls.filter((call) => call.parentToolCallId === parent.id)
    expect(children[0]).toMatchObject({ name: 'translate_chapter', state: 'failed' })
    expect(children[0].reason).toMatch(/chỉ được đọc/)
    expect(library.readText(work1.id, ch1_1.id, 'target').content).toBe('')
    // The refused write is not counted: ten resolves run, the eleventh stops the subagent.
    expect(children).toHaveLength(12)
    expect(children.filter((call) => call.state === 'completed')).toHaveLength(10)
    expect(children.at(-1)).toMatchObject({ state: 'failed' })
    expect(parent.result).toMatchObject({
      ok: true,
      value: { stopped: expect.stringMatching(/hạn mức gọi công cụ/) }
    })
    expect(res.answer).toBe('Hết.')
  })
})
