import { describe, expect, it } from 'vitest'
import type { AgentOperation } from '../../../../../shared/contracts/agent'
import type { AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import {
  activityRows,
  countsOfTabs,
  dayLabel,
  isCleanCompletion,
  matchesText,
  partitionActivities,
  rowsOfTab,
  whenLabel
} from './activity'

const at = (month: number, day: number, hour = 12): number =>
  new Date(2026, month - 1, day, hour).getTime()
const NOW = at(10, 23)

const task = (id: string, patch: Partial<AgentTaskSummary> = {}): AgentTaskSummary => ({
  id,
  kind: 'translate_chapters',
  workId: 'w1',
  originTurnId: null,
  sourceTaskId: null,
  state: 'completed',
  reason: null,
  model: { connectionId: 'c', entryId: 'e', settingsKey: 's' },
  overwritePolicy: 'fill_untranslated',
  options: {},
  budget: {},
  stateVersion: 1,
  createdAt: 1,
  updatedAt: NOW,
  workTitle: 'Hehe',
  modelLabel: 'Gemini · Flash',
  counts: {
    queued: 0,
    running: 0,
    waiting_user: 0,
    completed: 12,
    failed: 0,
    skipped: 0,
    cancelled: 0
  },
  usage: null,
  ...patch
})

const chat = (id: string, patch: Partial<AgentOperation> = {}): AgentOperation => ({
  id,
  turnId: 't',
  taskItemId: null,
  commandId: id,
  capability: 'edit_translation',
  target: { kind: 'work', workId: 'w1', workLabel: 'Hehe' },
  state: 'completed',
  progress: null,
  model: null,
  usage: null,
  result: null,
  error: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch
})

const ids = (entries: ReturnType<typeof partitionActivities>['attention']): string[] =>
  entries.map((entry) => (entry.kind === 'task' ? entry.task.id : entry.operation.id))

describe('partitionActivities', () => {
  it('puts a quota-paused task above a running one and each task in exactly one block', () => {
    const result = partitionActivities(
      [
        task('run', { state: 'running' }),
        task('quota', { state: 'paused', reason: 'budget' }),
        task('mine', { state: 'paused', reason: 'user' }),
        task('done')
      ],
      [],
      NOW
    )
    expect(ids(result.attention)).toEqual(['quota'])
    expect(ids(result.running).sort()).toEqual(['mine', 'run'])
    expect(result.recent.flatMap((day) => ids(day.entries))).toEqual(['done'])
  })

  it('keeps a partial task with failures in attention, but not one that only skipped chapters', () => {
    const counts = {
      queued: 0,
      running: 0,
      waiting_user: 0,
      completed: 11,
      failed: 0,
      skipped: 0,
      cancelled: 0
    }
    const result = partitionActivities(
      [
        task('bad', { state: 'partially_completed', counts: { ...counts, failed: 1 } }),
        task('skip', { state: 'partially_completed', counts: { ...counts, skipped: 1 } })
      ],
      [],
      NOW
    )
    expect(ids(result.attention)).toEqual(['bad'])
    expect(result.recent[0]?.entries).toHaveLength(1)
  })

  it('groups the rest by day, newest first, and sends failed chat runs to attention', () => {
    const result = partitionActivities(
      [task('old', { updatedAt: at(10, 15) }), task('today', { updatedAt: at(10, 23, 9) })],
      [
        chat('ok', { updatedAt: at(10, 22) }),
        chat('bad', { state: 'failed' }),
        chat('run', { taskItemId: 'item' })
      ],
      NOW
    )
    expect(ids(result.attention)).toEqual(['bad'])
    expect(result.recent.map((day) => day.label)).toEqual(['Hôm nay', 'Hôm qua', '15/10'])
    expect(result.recent.flatMap((day) => ids(day.entries))).toEqual(['today', 'ok', 'old'])
  })
})

describe('dayLabel', () => {
  it('adds the year only for another year', () => {
    expect(dayLabel(at(12, 31), at(1, 2) + 365 * 86_400_000)).toBe('31/12/2026')
  })
})

describe('isCleanCompletion', () => {
  it('is false when a chapter failed, waits or was skipped', () => {
    expect(isCleanCompletion(task('a'))).toBe(true)
    expect(isCleanCompletion(task('b', { counts: { ...task('b').counts, skipped: 1 } }))).toBe(
      false
    )
    expect(isCleanCompletion(task('c', { state: 'partially_completed' }))).toBe(false)
  })
})

describe('the activity table', () => {
  const parts = partitionActivities(
    [
      task('done', { updatedAt: NOW - 3 }),
      task('run', { state: 'running', updatedAt: NOW - 2 }),
      task('bad', { state: 'failed', reason: 'provider', updatedAt: NOW - 1 })
    ],
    [],
    NOW
  )

  it('lists what needs the person first, then what runs, then the rest', () => {
    const rows = activityRows(parts)
    expect(rows.map((row) => row.block)).toEqual(['attention', 'running', 'recent'])
  })

  it('filters by tab and counts each tab', () => {
    const rows = activityRows(parts)
    expect(rowsOfTab(rows, 'all')).toHaveLength(3)
    expect(rowsOfTab(rows, 'attention').map((row) => row.block)).toEqual(['attention'])
    expect(rowsOfTab(rows, 'done')).toHaveLength(1)
    expect(countsOfTabs(rows)).toEqual({ all: 3, running: 1, attention: 1, done: 1 })
  })

  it('searches the work and the model, ignoring case and spaces at the ends', () => {
    const [entry] = parts.running
    expect(matchesText(entry, '  hehe ')).toBe(true)
    expect(matchesText(entry, 'FLASH')).toBe(true)
    expect(matchesText(entry, 'kiếm lai')).toBe(false)
    expect(matchesText(entry, '')).toBe(true)
  })
})

describe('whenLabel', () => {
  it('says how long ago in words a person reads at a glance', () => {
    expect(whenLabel(NOW - 20_000, NOW)).toBe('vừa xong')
    expect(whenLabel(NOW - 5 * 60_000, NOW)).toBe('5 phút trước')
    expect(whenLabel(at(10, 23, 8), NOW)).toMatch(/^Hôm nay /)
    expect(whenLabel(at(10, 22, 21), NOW)).toMatch(/^Hôm qua /)
    expect(whenLabel(at(10, 15, 9), NOW)).toBe('15/10')
  })
})
