import { create } from 'zustand'
import type { AgentOperation } from '../../../../../shared/contracts/agent'
import type {
  AgentTaskChanged,
  AgentTaskCommand,
  AgentTaskDetailView,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import type { QaFinding, TaskQualityView } from '../../../../../shared/contracts/taskQuality'
import { registerStoreReset } from '../../../lib/testing/resetStores'

export interface TaskState {
  tasks: AgentTaskSummary[]
  /** Recent AI runs, chat and task alike; the Activity screen lists the chat ones. */
  operations: AgentOperation[]
  /** Item lists of the tasks a person expanded; refreshed with the list. */
  details: Record<string, AgentTaskDetailView>
  /** Quality warnings of the expanded tasks, computed by Main when read. */
  quality: Record<string, TaskQualityView>
  load: 'idle' | 'loading' | 'ready' | 'failed'
  lastError: string | null
  /** The last state change, read out by the live region. */
  announcement: string
  refresh: () => Promise<void>
  expand: (taskId: string) => Promise<void>
  collapse: (taskId: string) => void
  control: (taskId: string, command: AgentTaskCommand, itemId?: string) => Promise<void>
  /** Steers the task from a chapter on with a full instruction; announces where it really starts. */
  steer: (taskId: string, chapter: number | { chapterId: string }, text: string) => Promise<boolean>
  /** Ignores one warning for the paragraph's current text, then refetches the warnings. */
  dismiss: (taskId: string, itemId: string, finding: QaFinding, reason?: string) => Promise<void>
  /** Subscribes to `agentTaskChanged` and refetches; returns the unsubscribe. */
  listen: () => () => void
  reset: () => void
}

const bridge = () => (typeof window === 'undefined' ? undefined : window.mira?.agent?.tasks)

export const TASK_STATE_LABELS: Record<AgentTaskSummary['state'], string> = {
  queued: 'Đang chờ',
  running: 'Đang chạy',
  pausing: 'Đang tạm dừng',
  paused: 'Tạm dừng',
  waiting_user: 'Chờ bạn',
  cancelling: 'Đang hủy',
  cancelled: 'Đã hủy',
  completed: 'Hoàn tất',
  partially_completed: 'Xong một phần',
  failed: 'Lỗi'
}

const OPERATION_LIMIT = 200
/** Chat runs raise no task event, so the list is read when it is this old, not on every task event. */
const OPERATIONS_MAX_AGE_MS = 5000
/** Task events that arrive together become one refetch: the first at once, the rest after this wait. */
const COALESCE_MS = 500

let operationsAt = 0
let lastEventRefresh = 0
let trailing: ReturnType<typeof setTimeout> | null = null

function refreshSoon(refresh: () => Promise<void>): void {
  const wait = lastEventRefresh + COALESCE_MS - Date.now()
  if (wait <= 0) {
    lastEventRefresh = Date.now()
    void refresh()
    return
  }
  if (trailing) return
  trailing = setTimeout(() => {
    trailing = null
    lastEventRefresh = Date.now()
    void refresh()
  }, wait)
}

let listeners = 0
let unbind: (() => void) | null = null

/**
 * Tasks as Main has them: the store never changes a state itself, it sends a command with the version
 * it saw and refetches. Every window refetches on `agentTaskChanged`, so they agree.
 */
/** Overlapping refreshes: only the latest may write, so an older reply never rolls the list back. */
let refreshSeq = 0

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  operations: [],
  details: {},
  quality: {},
  load: 'idle',
  lastError: null,
  announcement: '',

  refresh: async () => {
    const api = bridge()
    if (!api) return
    const mine = ++refreshSeq
    if (get().load === 'idle') set({ load: 'loading' })
    const res = await api.list()
    if (mine !== refreshSeq) return
    if (!res.ok) {
      set({ load: 'failed', lastError: res.error.message })
      return
    }
    const stale = Date.now() - operationsAt > OPERATIONS_MAX_AGE_MS
    const ran = stale ? await window.mira?.agent?.operations?.list(OPERATION_LIMIT) : undefined
    if (ran?.ok) operationsAt = Date.now()
    const details: Record<string, AgentTaskDetailView> = {}
    const quality: Record<string, TaskQualityView> = {}
    for (const taskId of Object.keys(get().details)) {
      const detail = await api.get(taskId)
      if (detail.ok) details[taskId] = detail.value
      const warnings = await api.quality(taskId)
      if (warnings.ok) quality[taskId] = warnings.value
    }
    if (mine !== refreshSeq) return
    set({
      tasks: res.value.tasks,
      operations: ran?.ok ? ran.value : get().operations,
      details,
      quality,
      load: 'ready'
    })
  },

  expand: async (taskId) => {
    const api = bridge()
    const res = await api?.get(taskId)
    if (res?.ok) set((s) => ({ details: { ...s.details, [taskId]: res.value } }))
    const warnings = await api?.quality(taskId)
    if (warnings?.ok) set((s) => ({ quality: { ...s.quality, [taskId]: warnings.value } }))
  },

  collapse: (taskId) =>
    set((s) => {
      const details = { ...s.details }
      delete details[taskId]
      const quality = { ...s.quality }
      delete quality[taskId]
      return { details, quality }
    }),

  control: async (taskId, command, itemId) => {
    const api = bridge()
    const task = get().tasks.find((item) => item.id === taskId)
    if (!api || !task) return
    set({ lastError: null })
    const res = await api.control({
      taskId,
      command,
      stateVersion: task.stateVersion,
      clientCommandId: crypto.randomUUID(),
      ...(itemId ? { itemId } : {})
    })
    if (!res.ok) set({ lastError: res.error.message })
    await get().refresh()
  },

  steer: async (taskId, chapter, text) => {
    const api = bridge()
    if (!api) return false
    set({ lastError: null })
    const res = await api.steer({
      taskId,
      clientCommandId: crypto.randomUUID(),
      ...(typeof chapter === 'number'
        ? { chapterNumber: chapter }
        : { chapterId: chapter.chapterId }),
      change: { kind: 'instruction', text }
    })
    if (res.ok) {
      set({ announcement: `Điều chỉnh áp dụng từ ${res.value.effectiveFrom.chapterLabel}.` })
    } else {
      set({ lastError: res.error.message })
    }
    await get().refresh()
    return res.ok
  },

  dismiss: async (taskId, itemId, finding, reason) => {
    const api = bridge()
    if (!api) return
    const res = await api.dismiss({
      taskId,
      itemId,
      segmentId: finding.segmentId,
      ruleCode: finding.ruleCode,
      ruleVersion: finding.ruleVersion,
      ...(reason?.trim() ? { reason: reason.trim() } : {})
    })
    if (!res.ok) set({ lastError: res.error.message })
    const warnings = await api.quality(taskId)
    if (warnings.ok) set((s) => ({ quality: { ...s.quality, [taskId]: warnings.value } }))
  },

  listen: () => {
    listeners++
    if (listeners === 1) {
      unbind =
        bridge()?.onChanged((event: AgentTaskChanged) => {
          const before = get().tasks.find((task) => task.id === event.taskId)
          if (before && before.state !== event.state) {
            set({
              announcement: `Tác vụ dịch ${before.workTitle}: ${TASK_STATE_LABELS[event.state]}.`
            })
          }
          refreshSoon(get().refresh)
        }) ?? null
    }
    return () => {
      listeners--
      if (listeners === 0) {
        unbind?.()
        unbind = null
        if (trailing) clearTimeout(trailing)
        trailing = null
        lastEventRefresh = 0
      }
    }
  },

  reset: () => {
    operationsAt = 0
    lastEventRefresh = 0
    set({
      tasks: [],
      operations: [],
      details: {},
      quality: {},
      load: 'idle',
      lastError: null,
      announcement: ''
    })
  }
}))

registerStoreReset(() => useTaskStore.getState().reset())
