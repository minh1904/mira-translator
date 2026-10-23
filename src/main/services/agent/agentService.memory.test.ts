import { describe, expect, it } from 'vitest'
import { callTools, say, setupAgent } from './agentTestKit'

type Kit = ReturnType<typeof setupAgent>

const LONG = 'Một câu trả lời rất dài. '.repeat(100)
const SMALL_WINDOW = {
  id: 'small',
  name: 'Small',
  toolCall: true,
  contextLimit: 6_000,
  outputLimit: 500
}

/** Five turns of one session that leave older turns past the compaction threshold. */
async function longSession(kit: Kit): Promise<string> {
  kit.model.info = SMALL_WINDOW
  let sessionId: string | undefined
  for (let n = 1; n <= 4; n++) {
    kit.model.script(say(LONG))
    const result = await kit.agent.send({
      sessionId,
      instruction: `câu ${n}`,
      modelSelection: kit.modelSelection
    })
    sessionId = result.sessionId
  }
  return sessionId!
}

const askAgain = (kit: Kit, sessionId: string, instruction = 'câu 5') =>
  kit.agent.send({ sessionId, instruction, modelSelection: kit.modelSelection })

const compactionOf = (kit: Kit, sessionId: string, turnId: string) =>
  kit.agent
    .getSessionDetail(sessionId)
    .activities.find((item) => item.turnId === turnId && item.kind === 'compaction')

describe('AgentService session history', () => {
  async function afterReadingChapter() {
    const kit = setupAgent()
    kit.model.script(
      callTools({ id: 'read-1', name: 'get_work_overview', args: { target: 'ctx' } }),
      say('Tác phẩm có hai chương.')
    )
    const first = await kit.agent.send({
      instruction: 'xem tác phẩm này',
      context: { workId: kit.work1.id, chapterId: kit.ch1_1.id },
      modelSelection: kit.modelSelection
    })
    return { kit, first }
  }

  it('resends the earlier tool round with the target label instead of its handle', async () => {
    const { kit, first } = await afterReadingChapter()
    kit.model.script(say('Trả lời từ lượt trước.'))
    await askAgain(kit, first.sessionId, 'hỏi tiếp')
    const request = kit.model.requests.at(-1)!
    const call = request.messages.find((m) => m.tool_calls?.[0]?.id === 'read-1')
    expect(call?.tool_calls?.[0]?.function.name).toBe('get_work_overview')
    expect(call?.tool_calls?.[0]?.function.arguments).toContain('Đại Đạo Triều Thiên')
    expect(call?.tool_calls?.[0]?.function.arguments).not.toContain('"ctx"')
    expect(request.messages.some((m) => m.tool_call_id === 'read-1')).toBe(true)
    const old = request.messages.find((m) => m.content.startsWith('xem tác phẩm này'))
    expect(old?.content).toContain('Ngữ cảnh của lượt cũ:')
    expect(request.messages[0]?.content).toContain('không dùng được ở lượt này')
  })

  it('sends the earlier tool round as text to a model without tools', async () => {
    const { kit, first } = await afterReadingChapter()
    kit.model.info = { id: 'plain', name: 'Plain', toolCall: false }
    kit.model.script(say('Trả lời.'))
    await askAgain(kit, first.sessionId, 'hỏi tiếp')
    const messages = kit.model.requests.at(-1)!.messages
    expect(messages.some((m) => m.role === 'tool' || m.tool_calls)).toBe(false)
    expect(messages.some((m) => m.content.includes('Đã gọi `get_work_overview`'))).toBe(true)
  })
})

describe('AgentService session summary', () => {
  it('summarises the older turns with the auxiliary model and keeps the turn on its own', async () => {
    const kit = setupAgent()
    const sessionId = await longSession(kit)
    kit.services.connections.setAuxiliaryModel({
      connectionId: kit.modelSelection.connectionId,
      entryId: kit.auxEntryId
    })
    kit.auxModel.script(say('TÓM TẮT: người dùng hỏi câu 1.'))
    kit.model.script(say('đáp 5'))
    const fifth = await askAgain(kit, sessionId)

    expect(kit.auxModel.requests).toHaveLength(1)
    expect(kit.auxModel.requests[0]!.tools).toBeUndefined()
    const turnRequest = kit.model.requests.at(-1)!
    expect(turnRequest.messages[0]?.content).toContain('TÓM TẮT: người dùng hỏi câu 1.')
    expect(turnRequest.messages[0]?.content).toContain('chỉ để tham khảo')
    expect(turnRequest.messages.some((m) => m.content.startsWith('câu 1'))).toBe(false)
    const stored = kit.repository.getSessionSummary(sessionId)
    expect(stored?.text).toBe('TÓM TẮT: người dùng hỏi câu 1.')
    expect(stored?.coveredTurnIds).toHaveLength(1)
    expect(compactionOf(kit, sessionId, fifth.turnId)?.detail).toMatchObject({
      summarizedTurns: 1,
      summaryError: null
    })
    // The summary call's usage is part of the turn's.
    expect(fifth.usage?.inputTokens).toBe(20)
    // It shows up in no transcript element.
    const parts = kit.agent.getSessionDetail(sessionId).parts
    expect(parts.some((part) => part.kind === 'progress')).toBe(false)
  })

  it('uses the stored summary on the next turn without summarising again', async () => {
    const kit = setupAgent()
    const sessionId = await longSession(kit)
    // No auxiliary model is set, so the turn's own model writes the summary first.
    kit.model.script(say('TÓM TẮT CŨ'), say('đáp'))
    await askAgain(kit, sessionId)
    const summaryRequests = kit.model.requests.length
    expect(kit.repository.getSessionSummary(sessionId)).not.toBeNull()
    expect(kit.auxModel.requests).toHaveLength(0)

    kit.model.info = { id: 'big', name: 'Big', toolCall: true, contextLimit: 1_000_000 }
    kit.model.script(say('đáp 6'))
    await askAgain(kit, sessionId, 'câu 6')
    expect(kit.model.requests.length).toBe(summaryRequests + 1)
    expect(kit.model.requests.at(-1)!.messages[0]?.content).toContain('chỉ để tham khảo')
  })

  it("falls back to the turn's model when the auxiliary model fails", async () => {
    const kit = setupAgent()
    const sessionId = await longSession(kit)
    kit.services.connections.setAuxiliaryModel({
      connectionId: kit.modelSelection.connectionId,
      entryId: kit.auxEntryId
    })
    kit.auxModel.script(new Error('aux down'))
    kit.model.script(say('TÓM TẮT TỪ MODEL CỦA LƯỢT'), say('đáp 5'))
    await askAgain(kit, sessionId)
    expect(kit.repository.getSessionSummary(sessionId)?.text).toBe('TÓM TẮT TỪ MODEL CỦA LƯỢT')
  })

  it('still answers, cutting old turns, when no model can summarise', async () => {
    const kit = setupAgent()
    const sessionId = await longSession(kit)
    kit.model.script(new Error('down'), say('đáp 5'))
    const fifth = await askAgain(kit, sessionId)
    expect(fifth.status).toBe('completed')
    expect(fifth.answer).toBe('đáp 5')
    expect(kit.repository.getSessionSummary(sessionId)).toBeNull()
    expect(compactionOf(kit, sessionId, fifth.turnId)?.detail).toMatchObject({
      summarizedTurns: 0,
      summaryError: expect.any(String)
    })
    expect(compactionOf(kit, sessionId, fifth.turnId)?.detail).toHaveProperty('droppedTurns')
  })

  it('asks for a summary once per turn when it fails, not again on every round', async () => {
    const kit = setupAgent()
    const sessionId = await longSession(kit)
    const before = kit.model.requests.length
    kit.model.script(
      new Error('down'),
      callTools({ id: 'list-1', name: 'list_works', args: {} }),
      say('đáp 5')
    )
    const fifth = await askAgain(kit, sessionId)
    expect(fifth.answer).toBe('đáp 5')
    // One failed summary call and two turn rounds.
    expect(kit.model.requests.length - before).toBe(3)
  })

  it('drops the summary when a turn it covers is reverted', async () => {
    const kit = setupAgent()
    const sessionId = await longSession(kit)
    kit.model.script(say('TÓM TẮT'), say('đáp 5'))
    await askAgain(kit, sessionId)
    const [firstTurn] = kit.repository.listTurns(sessionId)
    kit.agent.revertToTurn(firstTurn!.id)
    expect(kit.repository.getSessionSummary(sessionId)).toBeNull()

    kit.model.info = { id: 'big', name: 'Big', toolCall: true, contextLimit: 1_000_000 }
    kit.model.script(say('đáp mới'))
    await askAgain(kit, sessionId, 'hỏi lại')
    const messages = kit.model.requests.at(-1)!.messages
    expect(messages[0]?.content).not.toContain('TÓM TẮT')
    expect(messages.some((m) => m.content.startsWith('câu 1'))).toBe(false)
  })
})
