import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentActivity,
  AgentOperation,
  AgentSessionDetailView,
  AgentStreamEvent,
  AgentTurnView
} from '../../../../../shared/contracts/agent'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { NEW_CHAT, composeActive, useAgentStore } from './agentStore'

const session = {
  id: 's1',
  title: 'Phiên',
  permissionLevel: 'default' as const,
  createdAt: 1,
  updatedAt: 1
}
const turn = (patch: Partial<AgentTurnView> = {}): AgentTurnView => ({
  id: 't1',
  sessionId: 's1',
  instruction: 'dịch chương này',
  answer: '',
  reasoning: '',
  context: {},
  mode: 'agent',
  permissionLevel: 'default',
  modelLabel: null,
  status: 'running',
  usage: null,
  costUsd: null,
  legacyRef: null,
  createdAt: 10,
  updatedAt: 10,
  ...patch
})
const operation = (patch: Partial<AgentOperation> = {}): AgentOperation => ({
  id: 'op1',
  turnId: 't1',
  taskItemId: null,
  commandId: 'c',
  capability: 'translate_chapter',
  target: { kind: 'chapter', workId: 'w', workLabel: 'W', chapterId: 'c', chapterLabel: 'C' },
  state: 'running',
  progress: null,
  model: null,
  usage: null,
  result: null,
  error: null,
  createdAt: 11,
  updatedAt: 11,
  ...patch
})
const activity = (patch: Partial<AgentActivity> = {}): AgentActivity => ({
  id: 'a1',
  turnId: 't1',
  operationId: null,
  stepSeq: 1,
  kind: 'read',
  state: 'running',
  label: 'Đọc',
  detail: null,
  createdAt: 11,
  updatedAt: 11,
  ...patch
})
const detail = (patch: Partial<AgentSessionDetailView> = {}): AgentSessionDetailView => ({
  session,
  turns: [],
  editedChapters: [],
  activities: [],
  operations: [],
  pending: [],
  sessionApprovals: [],
  parts: [],
  toolCalls: [],
  ...patch
})
const event = (patch: Record<string, unknown>): AgentStreamEvent =>
  ({ requestId: 'r', turnId: 't1', eventSeq: 1, ...patch }) as AgentStreamEvent

function bridge(get: () => Promise<{ ok: true; value: AgentSessionDetailView }>) {
  const api = {
    sessions: {
      get: vi.fn(get),
      list: vi.fn(async () => ({ ok: true, value: { sessions: [session] } })),
      create: vi.fn(async (title?: string) => ({
        ok: true,
        value: { ...session, id: 's2', title: title ?? '' }
      })),
      setPermissionLevel: vi.fn(
        async (input: { sessionId: string; level: 'default' | 'allow_all' | 'autopilot' }) => ({
          ok: true,
          value: { ...session, id: input.sessionId, permissionLevel: input.level }
        })
      )
    },
    turn: {
      send: vi.fn(async () => ({
        ok: true,
        value: { requestId: 'r', turnId: 't1', sessionId: 's1' }
      })),
      cancel: vi.fn()
    }
  }
  ;(globalThis as unknown as { window: unknown }).window = { mira: { agent: api } }
  return api
}

const model = { connectionId: 'c1', entryId: 'e1' }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('agentStore', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  it('reads the snapshot back after a missed event and shows what the DB committed', async () => {
    let snapshot = detail({ turns: [turn()] })
    const api = bridge(async () => ({ ok: true, value: snapshot }))
    await useAgentStore.getState().selectSession('s1')
    expect(useAgentStore.getState().isStreaming).toBe(true)

    // The operation event was missed; the turn finished in Main.
    snapshot = detail({
      turns: [turn({ status: 'completed', answer: 'Đã dịch.', updatedAt: 20 })],
      operations: [operation({ state: 'completed', updatedAt: 19 })]
    })
    useAgentStore.getState().handleStreamEvent(event({ kind: 'answer-delta', text: 'Đã d' }))
    useAgentStore
      .getState()
      .handleStreamEvent(event({ eventSeq: 3, kind: 'done', turnState: 'completed', usage: null }))
    await flush()
    const state = useAgentStore.getState()
    expect(state.turns[0]).toMatchObject({ status: 'completed', answer: 'Đã dịch.' })
    expect(state.operations.op1.state).toBe('completed')
    expect(state.isStreaming).toBe(false)
    expect(api.sessions.get).toHaveBeenCalledTimes(2)
  })

  it('keeps an event that arrives while the snapshot is being read', async () => {
    let release: (value: { ok: true; value: AgentSessionDetailView }) => void = () => {}
    bridge(() => new Promise((resolve) => (release = resolve)))
    useAgentStore.setState({ activeSessionId: 's1', turns: [turn()] })
    const hydrating = useAgentStore.getState().refresh()
    // Newer activity arrives before the (older) snapshot lands.
    useAgentStore.getState().handleStreamEvent(
      event({
        kind: 'activity-finish',
        activityId: 'a1',
        stepSeq: 1,
        activity: activity({ state: 'completed', updatedAt: 30 })
      })
    )
    release({ ok: true, value: detail({ turns: [turn()], activities: [activity()] }) })
    await hydrating
    expect(useAgentStore.getState().activities.t1).toEqual([
      expect.objectContaining({ id: 'a1', state: 'completed', updatedAt: 30 })
    ])
  })

  it('reads an unknown turn back once, as a turn sent from another window', async () => {
    const api = bridge(async () => ({ ok: true, value: detail({ turns: [turn({ id: 't2' })] }) }))
    useAgentStore.setState({ activeSessionId: 's1' })
    useAgentStore
      .getState()
      .handleStreamEvent(event({ turnId: 't2', kind: 'answer-delta', text: 'x' }))
    useAgentStore
      .getState()
      .handleStreamEvent(event({ turnId: 't2', kind: 'answer-delta', text: 'y' }))
    await flush()
    expect(api.sessions.get).toHaveBeenCalledTimes(1)
    expect(useAgentStore.getState().turns.map((t) => t.id)).toEqual(['t2'])
    expect(useAgentStore.getState().streamingTurnId).toBe('t2')
  })

  it('keeps drafts per session and only clears the one that was sent', async () => {
    const api = bridge(async () => ({ ok: true, value: detail({ turns: [turn()] }) }))
    const store = useAgentStore.getState()
    store.setDraft('chưa có phiên')
    await store.selectSession('s1')
    useAgentStore.setState({ isStreaming: false, streamingTurnId: null })
    useAgentStore.getState().setDraft('nháp phiên 1')
    expect(useAgentStore.getState().drafts).toEqual({
      [NEW_CHAT]: 'chưa có phiên',
      s1: 'nháp phiên 1'
    })

    api.turn.send.mockResolvedValueOnce({
      ok: false,
      error: { code: 'conflict', message: 'Phiên đang bận.' }
    } as never)
    expect(await useAgentStore.getState().send('nháp phiên 1')).toBe(false)
    expect(useAgentStore.getState().drafts.s1).toBe('nháp phiên 1')
    expect(useAgentStore.getState().lastError).toBe('Phiên đang bận.')

    expect(await useAgentStore.getState().send('nháp phiên 1')).toBe(true)
    expect(useAgentStore.getState().drafts).toEqual({ [NEW_CHAT]: 'chưa có phiên' })
  })

  it('sends the chips of the draft and clears them only once the turn is accepted', async () => {
    const api = bridge(async () => ({ ok: true, value: detail({ turns: [turn()] }) }))
    await useAgentStore.getState().selectSession('s1')
    useAgentStore.setState({ isStreaming: false, streamingTurnId: null })
    const store = useAgentStore.getState()
    store.adapter.setActiveContextGetter(
      () => ({ workId: 'w', chapterId: 'c12' }),
      () => ({ chapter: 'Chương 12' })
    )
    const chapter13 = {
      kind: 'chapter' as const,
      workId: 'w',
      chapterId: 'c13',
      label: 'Chương 13'
    }
    expect(store.addAttachment(chapter13)).toMatchObject({ ok: true })
    expect(store.addAttachment(chapter13)).toEqual({ ok: false, reason: 'duplicate' })

    api.turn.send.mockResolvedValueOnce({
      ok: false,
      error: { code: 'conflict', message: 'Phiên đang bận.' }
    } as never)
    expect(await useAgentStore.getState().send('so sánh')).toBe(false)
    expect(useAgentStore.getState().composer.s1?.attachments).toEqual([chapter13])

    // The open chapter is still dimmed in Agent, so only the open work and the added chip go.
    expect(await useAgentStore.getState().send('so sánh')).toBe(true)
    expect(api.turn.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: { workId: 'w', attachments: [chapter13] } })
    )
    expect(useAgentStore.getState().composer.s1).toBeUndefined()
    store.adapter.setActiveContextGetter(() => null)
  })

  it('keeps a dismissed work chip off for the session, and per work', async () => {
    const api = bridge(async () => ({ ok: true, value: detail({ turns: [turn()] }) }))
    await useAgentStore.getState().selectSession('s1')
    const { adapter } = useAgentStore.getState()
    adapter.setActiveContextGetter(() => ({ workId: 'a' }))
    useAgentStore.getState().setWorkDismissed('a', true)
    expect(composeActive(useAgentStore.getState()).context).toEqual({})

    useAgentStore.setState({ isStreaming: false, streamingTurnId: null })
    expect(await useAgentStore.getState().send('hỏi')).toBe(true)
    expect(api.turn.send).toHaveBeenLastCalledWith(expect.objectContaining({ context: {} }))
    // The send cleared the draft, not the dismissal.
    expect(composeActive(useAgentStore.getState()).context).toEqual({})

    adapter.setActiveContextGetter(() => ({ workId: 'b' }))
    expect(composeActive(useAgentStore.getState()).context).toEqual({ workId: 'b' })

    useAgentStore.getState().setWorkDismissed('a', false)
    adapter.setActiveContextGetter(() => ({ workId: 'a' }))
    expect(composeActive(useAgentStore.getState()).context).toEqual({ workId: 'a' })
    adapter.setActiveContextGetter(() => null)
  })

  it('sends the model chosen in the composer, and none when the composer has none', async () => {
    const api = bridge(async () => ({ ok: true, value: detail({ turns: [turn()] }) }))
    await useAgentStore.getState().selectSession('s1')
    useAgentStore.setState({ isStreaming: false, streamingTurnId: null })
    await useAgentStore.getState().send('dịch', { modelSelection: model })
    useAgentStore.setState({ isStreaming: false, streamingTurnId: null })
    await useAgentStore.getState().send('dịch tiếp')
    expect(api.turn.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ modelSelection: model })
    )
    expect(api.turn.send).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ modelSelection: expect.anything() })
    )
  })

  it('answers a pending action bound to its call and digest', async () => {
    const pending = {
      turnId: 't1',
      toolCallId: 'call',
      argsDigest: 'sha256:x',
      name: 'resolve_target',
      kind: 'choose' as const,
      label: 'Chọn đích',
      candidates: [{ handle: 't2', label: 'B' }],
      createdAt: 1
    }
    const api = bridge(async () => ({
      ok: true,
      value: detail({ turns: [turn({ status: 'waiting_user' })], pending: [pending] })
    }))
    await useAgentStore.getState().selectSession('s1')
    expect(useAgentStore.getState().pending).toHaveLength(1)
    await useAgentStore.getState().reply(pending, 't2', 'B', model)
    expect(api.turn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        modelSelection: model,
        continuesTurnId: 't1',
        pendingReply: { toolCallId: 'call', argsDigest: 'sha256:x', choice: 't2' },
        instruction: 'B'
      })
    )
  })

  it('changes the level of the active session in Main and shows what Main stored', async () => {
    const api = bridge(async () => ({ ok: true, value: detail() }))
    await useAgentStore.getState().selectSession('s1')
    expect(useAgentStore.getState().permissionLevel).toBe('default')
    await useAgentStore.getState().setPermissionLevel('allow_all')
    expect(api.sessions.setPermissionLevel).toHaveBeenCalledWith({
      sessionId: 's1',
      level: 'allow_all'
    })
    expect(useAgentStore.getState().permissionLevel).toBe('allow_all')
    expect(useAgentStore.getState().sessions[0].permissionLevel).toBe('allow_all')
  })

  it('creates the session at the chosen level before the first turn of a new chat', async () => {
    const api = bridge(async () => ({ ok: true, value: detail() }))
    useAgentStore.getState().newChat()
    await useAgentStore.getState().setPermissionLevel('autopilot')
    expect(api.sessions.setPermissionLevel).not.toHaveBeenCalled()
    await useAgentStore.getState().send('dịch chương này', { modelSelection: model, mode: 'ask' })
    expect(api.sessions.create).toHaveBeenCalledWith('dịch chương này')
    expect(api.sessions.setPermissionLevel).toHaveBeenCalledWith({
      sessionId: 's2',
      level: 'autopilot'
    })
    const [sent] = api.turn.send.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(sent).toMatchObject({ sessionId: 's2', mode: 'ask' })
    expect(sent).not.toHaveProperty('permissionLevel')
    expect(api.sessions.setPermissionLevel.mock.invocationCallOrder[0]).toBeLessThan(
      api.turn.send.mock.invocationCallOrder[0]!
    )
  })

  it('starts a new chat at the default level and sends no mode with an answer', async () => {
    const api = bridge(async () => ({
      ok: true,
      value: detail({ session: { ...session, permissionLevel: 'autopilot' } })
    }))
    await useAgentStore.getState().selectSession('s1')
    expect(useAgentStore.getState().permissionLevel).toBe('autopilot')
    const pending = {
      turnId: 't1',
      toolCallId: 'call',
      argsDigest: 'sha256:x',
      name: 'translate_chapter',
      kind: 'approve' as const,
      label: 'Dịch',
      candidates: [],
      createdAt: 1
    }
    await useAgentStore.getState().reply(pending, 'approve_session', 'Cho phép trong phiên này')
    const [sent] = api.turn.send.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(sent).not.toHaveProperty('mode')
    expect(sent).not.toHaveProperty('permissionLevel')
    useAgentStore.getState().newChat()
    expect(useAgentStore.getState().permissionLevel).toBe('default')
  })

  it('draws each round from its own deltas and keeps them until the stored parts arrive', async () => {
    let snapshot = detail({ turns: [turn()] })
    const api = bridge(async () => ({ ok: true, value: snapshot }))
    await useAgentStore.getState().selectSession('s1')
    const handle = useAgentStore.getState().handleStreamEvent
    handle(event({ eventSeq: 2, kind: 'reasoning-delta', text: 'Nghĩ', round: 1 }))
    handle(event({ eventSeq: 3, kind: 'answer-delta', text: 'Vòng một.', round: 1 }))
    handle(event({ eventSeq: 4, kind: 'answer-delta', text: 'Vòng hai.', round: 2 }))
    await new Promise((resolve) => setTimeout(resolve, 60))
    const live = useAgentStore.getState().live
    expect(live[1]).toMatchObject({ reasoning: 'Nghĩ', text: 'Vòng một.' })
    expect(live[1].reasoningEndedAt).not.toBeNull()
    expect(live[2]).toMatchObject({ text: 'Vòng hai.' })

    // Main stored round 1: that round is drawn from its part, round 2 still from deltas.
    snapshot = detail({
      turns: [turn()],
      parts: [
        {
          id: 'p1',
          turnId: 't1',
          seq: 1,
          round: 1,
          kind: 'text',
          text: 'Vòng một.',
          toolCallId: null,
          durationMs: null,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    })
    await useAgentStore.getState().refresh()
    expect(Object.keys(useAgentStore.getState().live)).toEqual(['2'])

    snapshot = detail({
      turns: [turn({ status: 'completed', updatedAt: 30 })],
      parts: snapshot.parts
    })
    handle(event({ eventSeq: 5, kind: 'done', turnState: 'completed', usage: null }))
    expect(useAgentStore.getState().live[2]).toBeDefined()
    await flush()
    await flush()
    expect(useAgentStore.getState().live).toEqual({})
    expect(api.sessions.get).toHaveBeenCalledTimes(3)
  })

  it('updates a tool call from its events and reads its full result once', async () => {
    const api = bridge(async () => ({ ok: true, value: detail({ turns: [turn()] }) }))
    ;(api as unknown as { toolCalls: unknown }).toolCalls = {
      get: vi.fn(async () => ({
        ok: true,
        value: { toolCall: {}, result: { ok: true, value: 3 } }
      }))
    }
    await useAgentStore.getState().selectSession('s1')
    const view = {
      id: 'c1',
      turnId: 't1',
      round: 1,
      parentToolCallId: null,
      name: 'list_works',
      args: {},
      state: 'running',
      invocationMessage: 'Đang đọc',
      pastTenseMessage: 'Đã đọc',
      summary: null,
      reason: null,
      durationMs: null,
      createdAt: 1
    }
    useAgentStore
      .getState()
      .handleStreamEvent(event({ eventSeq: 2, kind: 'tool-call', toolCall: view }))
    useAgentStore
      .getState()
      .handleStreamEvent(
        event({ eventSeq: 3, kind: 'tool-call', toolCall: { ...view, state: 'completed' } })
      )
    expect(useAgentStore.getState().toolCalls.c1.state).toBe('completed')
    await useAgentStore.getState().loadToolCallDetail('c1')
    await useAgentStore.getState().loadToolCallDetail('c1')
    const get = (api as unknown as { toolCalls: { get: ReturnType<typeof vi.fn> } }).toolCalls.get
    expect(get).toHaveBeenCalledTimes(1)
    expect(useAgentStore.getState().toolCallDetails.c1).toEqual({ ok: true, value: 3 })
  })

  it('sends a turn again with its instruction, context and mode', async () => {
    const api = bridge(async () => ({ ok: true, value: detail() }))
    await useAgentStore.getState().selectSession('s1')
    await useAgentStore
      .getState()
      .retry(turn({ instruction: 'dịch lại', context: { workId: 'w1' }, mode: 'ask' }), model)
    expect(api.turn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: 'dịch lại',
        context: { workId: 'w1' },
        mode: 'ask',
        modelSelection: model
      })
    )
  })

  it('continues with the mode and context of the turn, not the ones the composer shows', async () => {
    const api = bridge(async () => ({ ok: true, value: detail() }))
    await useAgentStore.getState().selectSession('s1')
    useAgentStore.getState().setMode('ask')
    useAgentStore.getState().adapter.setActiveContextGetter(() => ({ workId: 'moved-on' }))
    await useAgentStore
      .getState()
      .continueAfter(
        turn({ instruction: 'dịch toàn bộ', context: { workId: 'w1' }, mode: 'agent' }),
        model
      )
    expect(api.turn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        instruction: 'Tiếp tục',
        context: { workId: 'w1' },
        mode: 'agent',
        modelSelection: model
      })
    )
    useAgentStore.getState().adapter.setActiveContextGetter(() => null)
  })

  it('keeps what the user is typing when a turn is continued or retried', async () => {
    bridge(async () => ({ ok: true, value: detail() }))
    await useAgentStore.getState().selectSession('s1')
    const attachment = { kind: 'work' as const, workId: 'w2', label: 'B' }
    useAgentStore.getState().setDraft('đang gõ dở')
    useAgentStore.getState().addAttachment(attachment)
    const empty = turn({ instruction: 'dịch toàn bộ', context: { workId: 'w1' }, mode: 'agent' })
    expect(await useAgentStore.getState().continueAfter(empty, model)).toBe(true)
    useAgentStore.setState({ isStreaming: false })
    expect(await useAgentStore.getState().retry(empty, model)).toBe(true)
    expect(useAgentStore.getState().drafts.s1).toBe('đang gõ dở')
    expect(useAgentStore.getState().composer.s1?.attachments).toEqual([attachment])
  })
})
