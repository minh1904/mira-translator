import * as v from 'valibot'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSteerEvent } from '../../../shared/contracts/agent'
import { callTools, say, setupAgent } from './agentTestKit'
import { STEER_LABEL } from './sessionHistory'

type Kit = ReturnType<typeof setupAgent>

/**
 * A read tool that, while it runs, has the user type each of `texts` into the composer, the way a
 * message arrives in the middle of a round.
 */
function typingTool(kit: Kit, texts: string[], after?: () => void): void {
  kit.registry.register({
    name: 'slow_read',
    description: 'test',
    kind: 'read',
    schema: v.object({}),
    parameters: { type: 'object', properties: {}, required: [] },
    targetPolicy: 'no_target',
    handler: async ({ turnId }) => {
      const sessionId = kit.repository.getTurn(turnId)!.sessionId
      for (const [index, text] of texts.entries()) {
        kit.agent.steer({ sessionId, turnId, text, clientCommandId: `steer-${index}` })
      }
      after?.()
      return { ok: true, value: 'đã đọc' }
    }
  })
}

const steerMessagesOf = (messages: Array<{ role: string; content: string }>) =>
  messages.filter((m) => m.role === 'user' && m.content.startsWith(STEER_LABEL))

describe('AgentService steer messages', () => {
  it('puts what the user typed after the round results, as one message, and only once', async () => {
    const kit = setupAgent()
    typingTool(kit, ['chỉ cần chương 3', 'bỏ qua chương 4'])
    kit.model.script(
      callTools({ name: 'slow_read', args: {} }),
      callTools({ name: 'list_works', args: {} }),
      say('Xong.')
    )
    const res = await kit.agent.send({ instruction: 'rà', modelSelection: kit.modelSelection })
    expect(res.status).toBe('completed')

    const second = kit.model.requests[1].messages
    expect(second.at(-2)?.role).toBe('tool')
    expect(steerMessagesOf(second)).toEqual([
      { role: 'user', content: `${STEER_LABEL}\nchỉ cần chương 3\n\nbỏ qua chương 4` }
    ])
    // The third request still has it once, at the same place, not again after round 2.
    expect(steerMessagesOf(kit.model.requests[2].messages)).toHaveLength(1)

    const steers = kit.repository.listSteers(res.turnId)
    expect(steers.map((s) => [s.state, s.deliveredRound])).toEqual([
      ['delivered', 1],
      ['delivered', 1]
    ])
    const kinds = kit.repository.listParts(res.turnId).map((part) => part.kind)
    expect(kinds).toEqual(['tool_call', 'steer', 'steer', 'tool_call', 'text'])
  })

  it('refuses a message once the turn is no longer running', async () => {
    const kit = setupAgent()
    kit.model.script(say('Xong.'))
    const res = await kit.agent.send({ instruction: 'chào', modelSelection: kit.modelSelection })
    expect(() =>
      kit.agent.steer({
        sessionId: res.sessionId,
        turnId: res.turnId,
        text: 'thêm',
        clientCommandId: 'late'
      })
    ).toThrow(/kết thúc/)
  })

  it('starts the next turn with what was still waiting when the turn completed', async () => {
    const kit = setupAgent()
    const events: AgentSteerEvent[] = []
    kit.model.script((request) => {
      // The user types while the model writes its final answer.
      const turn = kit.agent.listSessions().length
        ? kit.agent.getSessionDetail(kit.agent.listSessions()[0].id).turns.at(-1)!
        : null
      kit.agent.steer(
        {
          sessionId: turn!.sessionId,
          turnId: turn!.id,
          text: 'thêm phần tóm tắt nhân vật',
          clientCommandId: 's1'
        },
        (event) => events.push(event)
      )
      expect(request.tools).toBeDefined()
      return say('Đã dịch.')
    }, say('Đây là tóm tắt nhân vật.'))
    const first = await kit.agent.send({
      instruction: 'dịch',
      mode: 'ask',
      modelSelection: kit.modelSelection,
      onSteer: (event) => events.push(event)
    })
    expect(first.status).toBe('completed')
    await vi.waitFor(() => {
      const turns = kit.agent.getSessionDetail(first.sessionId).turns
      expect(turns).toHaveLength(2)
      expect(turns[1].status).toBe('completed')
    })
    const [, next] = kit.agent.getSessionDetail(first.sessionId).turns
    expect(next).toMatchObject({ instruction: 'thêm phần tóm tắt nhân vật', mode: 'ask' })
    expect(next.answer).toBe('Đây là tóm tắt nhân vật.')
    expect(kit.repository.listSteers(first.turnId)[0]).toMatchObject({
      state: 'forwarded',
      forwardedTurnId: next.id
    })
    expect(events.map((event) => event.steer.state)).toEqual(['pending', 'forwarded'])
  })

  it('hands waiting messages back when the user stops the turn, and starts nothing', async () => {
    const kit = setupAgent()
    const controller = new AbortController()
    typingTool(kit, ['khoan đã'], () => controller.abort())
    kit.model.script(callTools({ name: 'slow_read', args: {} }))
    const res = await kit.agent
      .send({ instruction: 'rà', modelSelection: kit.modelSelection, signal: controller.signal })
      .catch(() => null)
    const sessionId = kit.agent.listSessions()[0].id
    const detail = kit.agent.getSessionDetail(sessionId)
    expect(detail.turns).toHaveLength(1)
    expect(detail.turns[0].status).toBe('cancelled')
    expect(detail.steers).toMatchObject([{ text: 'khoan đã', state: 'returned' }])
    expect(res === null || res.status !== 'completed').toBe(true)
  })

  it('treats a target the user named in a delivered message as named by the user', async () => {
    const kit = setupAgent()
    typingTool(kit, ['dịch luôn chương 2'])
    kit.model.script(
      callTools({ name: 'slow_read', args: {} }),
      callTools({ name: 'resolve_target', args: { description: 'chương 2' } }),
      callTools({ name: 'translate_chapter', args: { target: 't1' } }),
      say('Đã dịch chương 2.')
    )
    const res = await kit.agent.send({
      instruction: 'xem tác phẩm này',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })
    expect(res.status).toBe('completed')
    expect(kit.agent.listToolCalls(res.turnId).at(-1)).toMatchObject({
      name: 'translate_chapter',
      decision: 'allow',
      state: 'completed'
    })
  })

  it('resends a steered turn with the message after the results of its round', async () => {
    const kit = setupAgent()
    typingTool(kit, ['chỉ chương 3'])
    kit.model.script(callTools({ name: 'slow_read', args: {} }), say('Xong.'))
    const first = await kit.agent.send({ instruction: 'rà', modelSelection: kit.modelSelection })
    kit.model.script(say('Ừ.'))
    await kit.agent.send({
      instruction: 'tiếp',
      sessionId: first.sessionId,
      modelSelection: kit.modelSelection
    })
    const messages = kit.model.requests.at(-1)!.messages
    const at = messages.findIndex((m) => m.content.startsWith(STEER_LABEL))
    expect(messages[at - 1]?.role).toBe('tool')
    expect(messages[at + 1]).toMatchObject({ role: 'assistant', content: 'Xong.' })

    // A model without tools gets the round as text and still the message, as the user's.
    kit.model.info = { id: 'old', name: 'Old', toolCall: false }
    kit.model.script(say('Ừ.'))
    await kit.agent.send({
      instruction: 'nữa',
      sessionId: first.sessionId,
      modelSelection: kit.modelSelection
    })
    const plain = kit.model.requests.at(-1)!.messages
    expect(plain.some((m) => m.role === 'tool')).toBe(false)
    expect(steerMessagesOf(plain)).toHaveLength(1)
  })

  it('tells the model a steer message is the user speaking', async () => {
    const kit = setupAgent()
    kit.model.script(say('Ừ.'))
    await kit.agent.send({ instruction: 'chào', modelSelection: kit.modelSelection })
    const system = kit.model.requests[0].messages[0].content
    expect(system).toContain(STEER_LABEL)
    expect(system).toContain('thắng yêu cầu ban đầu')
  })
})
