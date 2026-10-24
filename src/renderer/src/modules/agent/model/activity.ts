import type { AgentOperation } from '../../../../../shared/contracts/agent'
import type { AgentTaskSummary } from '../../../../../shared/contracts/agentTask'

export type ActivityEntry =
  | { kind: 'task'; at: number; task: AgentTaskSummary }
  | { kind: 'chat'; at: number; operation: AgentOperation }

export interface ActivityDay {
  label: string
  entries: ActivityEntry[]
}

export interface ActivityPartition {
  attention: ActivityEntry[]
  running: ActivityEntry[]
  recent: ActivityDay[]
}

/** A paused task the person did not ask for (budget, quota) waits for them; their own pause does not. */
const taskNeedsAttention = (task: AgentTaskSummary): boolean => {
  switch (task.state) {
    case 'failed':
    case 'waiting_user':
      return true
    case 'paused':
      return task.reason !== 'user'
    case 'partially_completed':
      return task.counts.failed > 0 || task.counts.waiting_user > 0
    default:
      return false
  }
}

const taskIsLive = (task: AgentTaskSummary): boolean =>
  task.state === 'queued' ||
  task.state === 'running' ||
  task.state === 'pausing' ||
  task.state === 'cancelling' ||
  task.state === 'paused'

const chatNeedsAttention = (operation: AgentOperation): boolean =>
  operation.state === 'failed' || operation.state === 'conflict'

const startOfDay = (at: number): number => {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Hôm nay", "Hôm qua", then the date (with the year only when it is not the current one). */
export function dayLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000)
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Hôm qua'
  const date = new Date(at)
  const day = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
  return date.getFullYear() === new Date(now).getFullYear() ? day : `${day}/${date.getFullYear()}`
}

/**
 * Splits tasks and chat runs into the three blocks of the Activity screen. Every entry lands in exactly
 * one block; "Gần đây" is newest first and grouped by calendar day. Chat runs that are task runs
 * (`taskItemId` set) are the task's own business and never listed here.
 */
export function partitionActivities(
  tasks: readonly AgentTaskSummary[],
  operations: readonly AgentOperation[],
  now: number
): ActivityPartition {
  const entries: ActivityEntry[] = [
    ...tasks.map((task): ActivityEntry => ({ kind: 'task', at: task.updatedAt, task })),
    ...operations
      .filter((operation) => operation.taskItemId === null)
      .map((operation): ActivityEntry => ({ kind: 'chat', at: operation.updatedAt, operation }))
  ].sort((a, b) => b.at - a.at)

  const attention: ActivityEntry[] = []
  const running: ActivityEntry[] = []
  const recent: ActivityDay[] = []
  for (const entry of entries) {
    if (
      entry.kind === 'task' ? taskNeedsAttention(entry.task) : chatNeedsAttention(entry.operation)
    )
      attention.push(entry)
    else if (entry.kind === 'task' && taskIsLive(entry.task)) running.push(entry)
    else {
      const label = dayLabel(entry.at, now)
      const last = recent.at(-1)
      if (last?.label === label) last.entries.push(entry)
      else recent.push({ label, entries: [entry] })
    }
  }
  return { attention, running, recent }
}

/** A finished task with nothing failed, waiting or skipped is a one-line row. */
export const isCleanCompletion = (task: AgentTaskSummary): boolean =>
  task.state === 'completed' &&
  task.counts.failed === 0 &&
  task.counts.waiting_user === 0 &&
  task.counts.skipped === 0

/** What a run says about itself: the error first, otherwise the runner's own summary. */
export function operationMessage(operation: AgentOperation): string | null {
  const read = (value: unknown, key: string): string | null => {
    if (!value || typeof value !== 'object') return null
    const text = (value as Record<string, unknown>)[key]
    return typeof text === 'string' && text.trim() !== '' ? text : null
  }
  return read(operation.error, 'message') ?? read(operation.result, 'summary')
}

export type ActivityBlock = 'attention' | 'running' | 'recent'

/** One line of the activity table, with the block the entry belongs to (what the tabs filter on). */
export interface ActivityRow {
  block: ActivityBlock
  entry: ActivityEntry
}

/** Everything in one list in the order a person reads it: what needs them, what runs, then the rest. */
export function activityRows(parts: ActivityPartition): ActivityRow[] {
  return [
    ...parts.attention.map((entry): ActivityRow => ({ block: 'attention', entry })),
    ...parts.running.map((entry): ActivityRow => ({ block: 'running', entry })),
    ...parts.recent.flatMap((day) =>
      day.entries.map((entry): ActivityRow => ({ block: 'recent', entry }))
    )
  ]
}

export type ActivityTab = 'all' | 'running' | 'attention' | 'done'

export const ACTIVITY_TABS: Array<{ value: ActivityTab; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'running', label: 'Đang chạy' },
  { value: 'attention', label: 'Cần xử lý' },
  { value: 'done', label: 'Đã xong' }
]

const TAB_BLOCK: Record<Exclude<ActivityTab, 'all'>, ActivityBlock> = {
  running: 'running',
  attention: 'attention',
  done: 'recent'
}

export const rowsOfTab = (rows: readonly ActivityRow[], tab: ActivityTab): ActivityRow[] =>
  tab === 'all' ? [...rows] : rows.filter((row) => row.block === TAB_BLOCK[tab])

export const countsOfTabs = (rows: readonly ActivityRow[]): Record<ActivityTab, number> => ({
  all: rows.length,
  running: rowsOfTab(rows, 'running').length,
  attention: rowsOfTab(rows, 'attention').length,
  done: rowsOfTab(rows, 'done').length
})

/** What a person can search a row by: the work, the model, and for a chat run its chapter. */
export function searchTextOf(entry: ActivityEntry): string {
  if (entry.kind === 'task') return `${entry.task.workTitle} ${entry.task.modelLabel}`
  const { target } = entry.operation
  return `${target.workLabel} ${target.kind === 'chapter' ? target.chapterLabel : ''}`
}

export const matchesText = (entry: ActivityEntry, text: string): boolean => {
  const needle = text.trim().toLocaleLowerCase('vi')
  return needle === '' || searchTextOf(entry).toLocaleLowerCase('vi').includes(needle)
}

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

/** "vừa xong", "5 phút trước", "Hôm nay 22:01", "Hôm qua 21:56", then the date. */
export function whenLabel(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const day = dayLabel(at, now)
  return day === 'Hôm nay' || day === 'Hôm qua' ? `${day} ${clock(at)}` : day
}
