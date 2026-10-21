import { create } from 'zustand'
import type {
  AgentActivity,
  AgentContext,
  AgentOperation,
  AgentPendingAction,
  AgentSendInput,
  AgentSessionDetailView,
  AgentSessionView,
  AgentStreamEvent,
  AgentTurnView
} from '../../../../../shared/contracts/agent'
import { registerStoreReset } from '../../../lib/testing/resetStores'
import type { ModelSelection } from '../../ai-connections/public'
import {
  defaultWorkspaceAgentAdapter,
  type WorkspaceAgentAdapter,
  type TargetRef
} from '../adapter/workspaceAdapter'
import { DeltaBuffer } from '../components/DeltaBuffer'

/** Draft key of a chat that has no session yet. */
export const NEW_CHAT = 'new'

type SendModel = AgentSendInput['modelSelection']

export interface AgentState {
  sessions: AgentSessionView[]
  activeSessionId: string | null
  turns: AgentTurnView[]
  activities: Record<string, AgentActivity[]>
  operations: Record<string, AgentOperation>
  pending: AgentPendingAction[]
  /** Unsent composer text per session (`NEW_CHAT` before the first send); renderer only. */
  drafts: Record<string, string>
  /** Model the user picked in the composer for every session; `null` follows Settings. */
  model: ModelSelection | null
  mode: 'agent' | 'ask'
  permissionLevel: 'normal' | 'autopilot'
  streamingTurnId: string | null
  streamingAnswer: string
  streamingReasoning: string
  isStreaming: boolean
  /** Last failure to show in the live region; cleared by the next send. */
  lastError: string | null
  adapter: WorkspaceAgentAdapter

  loadSessions: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  /** Re-reads the active session from the library DB and merges it (newer `updatedAt` wins). */
  refresh: () => Promise<void>
  /** Starts a new chat; the session is created on the first send. */
  newChat: () => void
  createSession: (title?: string) => Promise<string>
  setDraft: (text: string) => void
  setModel: (model: ModelSelection | null) => void
  setMode: (mode: 'agent' | 'ask') => void
  setPermissionLevel: (permissionLevel: 'normal' | 'autopilot') => void
  send: (
    instruction: string,
    options?: {
      context?: AgentContext
      modelSelection?: SendModel
      mode?: 'agent' | 'ask'
      permissionLevel?: 'normal' | 'autopilot'
    }
  ) => Promise<boolean>
  reply: (
    action: AgentPendingAction,
    choice: string,
    label: string,
    modelSelection?: SendModel
  ) => Promise<boolean>
  cancel: (turnId?: string) => Promise<void>
  undo: (operationId: string) => Promise<void>
  handleStreamEvent: (event: AgentStreamEvent) => void
  listenCoordinator: () => () => void
  reset: () => void
}

const bridge = () => (typeof window === 'undefined' ? undefined : window.mira?.agent)

/** Keeps the newer of two versions of a row; equal `updatedAt` keeps what is already there. */
function newer<T extends { id: string; updatedAt: number }>(current: T | undefined, next: T): T {
  return current && current.updatedAt >= next.updatedAt ? current : next
}

function upsertList<T extends { id: string; updatedAt: number }>(list: T[], items: T[]): T[] {
  const byId = new Map(list.map((item) => [item.id, item]))
  for (const item of items) byId.set(item.id, newer(byId.get(item.id), item))
  return [...byId.values()]
}

const sortTurns = (turns: AgentTurnView[]): AgentTurnView[] =>
  [...turns].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))

const ACTIVE: AgentTurnView['status'][] = ['queued', 'running']

let answerBuffer: DeltaBuffer | null = null
let reasoningBuffer: DeltaBuffer | null = null
/** Turns refetched once and found outside the active session: their deltas are ignored. */
const foreignTurns = new Set<string>()
let refreshing: Promise<void> | null = null
let refreshAgain = false
let listeners = 0
let unbindAll: (() => void) | null = null

export const useAgentStore = create<AgentState>((set, get) => {
  const resetBuffers = () => {
    answerBuffer?.reset()
    reasoningBuffer?.reset()
    answerBuffer = null
    reasoningBuffer = null
  }

  const startStreaming = (turnId: string) => {
    if (get().streamingTurnId === turnId) return
    resetBuffers()
    answerBuffer = new DeltaBuffer({
      intervalMs: 40,
      onCommit: (text) => set({ streamingAnswer: text })
    })
    reasoningBuffer = new DeltaBuffer({
      intervalMs: 40,
      onCommit: (text) => set({ streamingReasoning: text })
    })
    set({ isStreaming: true, streamingTurnId: turnId, streamingAnswer: '', streamingReasoning: '' })
  }

  const stopStreaming = () => {
    resetBuffers()
    set({ isStreaming: false, streamingTurnId: null, streamingAnswer: '', streamingReasoning: '' })
  }

  /** Merges a snapshot without dropping rows that events added while it was being read. */
  const merge = (detail: AgentSessionDetailView) => {
    set((s) => {
      if (s.activeSessionId !== detail.session.id) return s
      const activities: Record<string, AgentActivity[]> = { ...s.activities }
      for (const activity of detail.activities) {
        activities[activity.turnId] = upsertList(activities[activity.turnId] ?? [], [
          activity
        ]).sort((a, b) => a.stepSeq - b.stepSeq)
      }
      const operations = { ...s.operations }
      for (const operation of detail.operations) {
        operations[operation.id] = newer(operations[operation.id], operation)
      }
      return {
        sessions: upsertList(s.sessions, [detail.session]).sort(
          (a, b) => b.updatedAt - a.updatedAt
        ),
        turns: sortTurns(upsertList(s.turns, detail.turns)),
        activities,
        operations,
        pending: detail.pending
      }
    })
    const state = get()
    const running = state.turns.find((turn) => ACTIVE.includes(turn.status))
    if (running) startStreaming(running.id)
    else if (state.isStreaming) stopStreaming()
  }

  return {
    sessions: [],
    activeSessionId: null,
    turns: [],
    activities: {},
    operations: {},
    pending: [],
    drafts: {},
    model: null,
    mode: 'agent',
    permissionLevel: 'normal',
    streamingTurnId: null,
    streamingAnswer: '',
    streamingReasoning: '',
    isStreaming: false,
    lastError: null,
    adapter: defaultWorkspaceAgentAdapter,

    loadSessions: async () => {
      const api = bridge()
      if (!api?.sessions?.list) return
      const res = await api.sessions.list()
      if (!res.ok) return
      set({ sessions: res.value.sessions })
      if (!get().activeSessionId && res.value.sessions.length > 0) {
        await get().selectSession(res.value.sessions[0]!.id)
      }
    },

    selectSession: async (sessionId: string) => {
      if (get().activeSessionId !== sessionId) {
        stopStreaming()
        foreignTurns.clear()
        set({ activeSessionId: sessionId, turns: [], activities: {}, operations: {}, pending: [] })
      }
      await get().refresh()
    },

    refresh: async () => {
      // One read at a time; a request during a read schedules exactly one more.
      if (refreshing) {
        refreshAgain = true
        return refreshing
      }
      const api = bridge()
      const sessionId = get().activeSessionId
      if (!api?.sessions?.get || !sessionId) return
      refreshing = (async () => {
        do {
          refreshAgain = false
          const res = await api.sessions.get(sessionId)
          if (res.ok) merge(res.value)
        } while (refreshAgain)
      })().finally(() => {
        refreshing = null
      })
      return refreshing
    },

    newChat: () => {
      stopStreaming()
      foreignTurns.clear()
      set({ activeSessionId: null, turns: [], activities: {}, operations: {}, pending: [] })
    },

    createSession: async (title?: string) => {
      const api = bridge()
      if (!api?.sessions?.create) {
        const id = `mock-session-${Date.now()}`
        set((s) => ({
          sessions: [
            { id, title: title ?? 'Phiên mới', createdAt: Date.now(), updatedAt: Date.now() },
            ...s.sessions
          ],
          activeSessionId: id,
          turns: []
        }))
        return id
      }
      const res = await api.sessions.create(title)
      if (!res.ok) throw new Error(res.error.message)
      const session = res.value
      set((s) => ({
        sessions: [session, ...s.sessions],
        activeSessionId: session.id,
        turns: [],
        activities: {},
        operations: {},
        pending: []
      }))
      return session.id
    },

    setDraft: (text: string) => {
      const key = get().activeSessionId ?? NEW_CHAT
      set((s) => ({ drafts: { ...s.drafts, [key]: text } }))
    },

    setModel: (model) => set({ model }),
    setMode: (mode) => set({ mode }),
    setPermissionLevel: (permissionLevel) => set({ permissionLevel }),

    send: async (instruction, options) => {
      const state = get()
      if (state.isStreaming) return false
      const api = bridge()
      const draftKey = state.activeSessionId ?? NEW_CHAT
      const context = options?.context ?? state.adapter.captureContext()
      set({ lastError: null })
      if (!api?.turn?.send) {
        // Isolated unit tests without the Electron bridge.
        startStreaming(`mock-turn-${Date.now()}`)
        return true
      }
      const res = await api.turn.send({
        ...(state.activeSessionId ? { sessionId: state.activeSessionId } : {}),
        clientCommandId: crypto.randomUUID(),
        instruction,
        context,
        mode: options?.mode ?? state.mode,
        permissionLevel: options?.permissionLevel ?? state.permissionLevel,
        ...(options?.modelSelection ? { modelSelection: options.modelSelection } : {})
      })
      if (!res.ok) {
        // The draft stays so a busy session or a failure loses nothing the user typed.
        set({ lastError: res.error.message })
        return false
      }
      set((s) => {
        const drafts = { ...s.drafts }
        delete drafts[draftKey]
        return { drafts, activeSessionId: res.value.sessionId }
      })
      startStreaming(res.value.turnId)
      if (draftKey === NEW_CHAT) void get().loadSessions()
      await get().refresh()
      return true
    },

    reply: async (action, choice, label, modelSelection) => {
      const api = bridge()
      if (!api?.turn?.send) return false
      set({ lastError: null })
      const res = await api.turn.send({
        ...(get().activeSessionId ? { sessionId: get().activeSessionId! } : {}),
        clientCommandId: crypto.randomUUID(),
        instruction: label,
        ...(modelSelection ? { modelSelection } : {}),
        continuesTurnId: action.turnId,
        pendingReply: { toolCallId: action.toolCallId, argsDigest: action.argsDigest, choice }
      })
      if (!res.ok) {
        set({ lastError: res.error.message })
        await get().refresh()
        return false
      }
      set({ pending: get().pending.filter((item) => item.toolCallId !== action.toolCallId) })
      startStreaming(action.turnId)
      await get().refresh()
      return true
    },

    cancel: async (turnId?: string) => {
      const pendingTurn = get().pending[0]?.turnId
      const targetId = turnId ?? get().streamingTurnId ?? pendingTurn
      if (!targetId) return
      await bridge()?.turn?.cancel?.({ turnId: targetId })
      stopStreaming()
      await get().refresh()
    },

    undo: async (operationId: string) => {
      const api = bridge()
      if (!api?.operations?.undo) return
      const res = await api.operations.undo({ operationId })
      if (!res.ok) {
        set({ lastError: res.error.message })
        return
      }
      await get().refresh()
    },

    handleStreamEvent: (event: AgentStreamEvent) => {
      const state = get()
      const known = state.turns.some((turn) => turn.id === event.turnId)
      if (!known) {
        // A turn sent from another window, or one whose start we missed: read it back once.
        if (!foreignTurns.has(event.turnId)) {
          foreignTurns.add(event.turnId)
          void get()
            .refresh()
            .then(() => {
              if (get().turns.some((turn) => turn.id === event.turnId)) {
                foreignTurns.delete(event.turnId)
              }
            })
        }
        return
      }
      if (
        state.streamingTurnId !== event.turnId &&
        event.kind !== 'done' &&
        event.kind !== 'error' &&
        event.kind !== 'cancelled'
      ) {
        startStreaming(event.turnId)
      }

      switch (event.kind) {
        case 'reasoning-delta':
          reasoningBuffer?.append(event.text)
          break
        case 'answer-delta':
          answerBuffer?.append(event.text)
          break
        case 'activity-start':
        case 'activity-update':
        case 'activity-finish': {
          const activity = event.activity as AgentActivity
          set((s) => ({
            activities: {
              ...s.activities,
              [event.turnId]: upsertList(s.activities[event.turnId] ?? [], [activity]).sort(
                (a, b) => a.stepSeq - b.stepSeq
              )
            }
          }))
          break
        }
        case 'operation': {
          const operation = event.operation as AgentOperation
          set((s) => ({
            operations: {
              ...s.operations,
              [operation.id]: newer(s.operations[operation.id], operation)
            }
          }))
          break
        }
        case 'done':
        case 'error':
        case 'cancelled': {
          // The stored answer wins over what the deltas drew.
          answerBuffer?.flush()
          reasoningBuffer?.flush()
          if (event.kind === 'error') {
            const error = event.error as { message?: string } | null
            set({ lastError: error?.message ?? 'Lượt trả lời bị lỗi.' })
          }
          stopStreaming()
          void get().refresh()
          break
        }
      }
    },

    listenCoordinator: () => {
      // Every surface that shows the assistant calls this; only the first one subscribes.
      listeners++
      if (listeners === 1) unbindAll = subscribe()
      return () => {
        listeners--
        if (listeners === 0) {
          unbindAll?.()
          unbindAll = null
        }
      }
    },

    reset: () => {
      resetBuffers()
      foreignTurns.clear()
      set({
        sessions: [],
        activeSessionId: null,
        turns: [],
        activities: {},
        operations: {},
        pending: [],
        drafts: {},
        model: null,
        mode: 'agent',
        permissionLevel: 'normal',
        streamingTurnId: null,
        streamingAnswer: '',
        streamingReasoning: '',
        isStreaming: false,
        lastError: null
      })
    }
  }

  function subscribe(): () => void {
    const api = bridge()
    if (!api?.coordinator) return () => {}

    const unbindIntent = api.coordinator.onWriteIntent(async (intent) => {
      const adapter = get().adapter
      const target: TargetRef = {
        workId: intent.target.workId,
        chapterId: intent.target.chapterId,
        side: intent.target.side
      }
      if (!adapter.hasEditor(target)) {
        await api.coordinator.ackWriteIntent({ intentId: intent.intentId, status: 'not-open' })
        return
      }
      // Flush dirty target before ack
      const flushRes = await adapter.flushDirty(target)
      if (flushRes.ok) adapter.setLocked(target, true)
      await api.coordinator.ackWriteIntent({
        intentId: intent.intentId,
        status: flushRes.ok ? 'ack' : 'flush-failed',
        revision: flushRes.revision
      })
    })

    const unbindChanged = api.coordinator.onTargetChanged(async (ev) => {
      const adapter = get().adapter
      const target: TargetRef = {
        workId: ev.target.workId,
        chapterId: ev.target.chapterId,
        side: ev.target.side
      }
      // Reload once at terminal revision and unlock
      await adapter.reloadTarget(target, ev.lastAppliedRev)
      adapter.setLocked(target, false)
    })

    const unbindStream = api.onStreamEvent?.((ev) => get().handleStreamEvent(ev))

    return () => {
      unbindIntent?.()
      unbindChanged?.()
      unbindStream?.()
    }
  }
})

registerStoreReset(() => useAgentStore.getState().reset())
