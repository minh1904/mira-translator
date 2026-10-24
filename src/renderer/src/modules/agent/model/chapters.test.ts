import { describe, expect, it } from 'vitest'
import {
  collapseCompleted,
  defaultChapterFilter,
  filterChapters,
  steerableChapters,
  type ChapterItem
} from './chapters'

const item = (n: number, patch: Partial<ChapterItem> = {}): ChapterItem => ({
  id: `i${n}`,
  taskId: 'k',
  ordinal: n,
  chapterId: `c${n}`,
  state: 'completed',
  reason: null,
  runKey: null,
  sourceRev: null,
  expectedTargetRev: null,
  skippedSegments: [],
  progress: null,
  contextChanged: false,
  stateVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  chapterLabel: `Chương ${n}`,
  instruction: null,
  ...patch
})

describe('collapseCompleted', () => {
  it('folds finished chapters in a row into one line and leaves the rest as rows', () => {
    const rows = collapseCompleted([
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => item(n)),
      item(8, { state: 'running' }),
      ...[9, 10].map((n) => item(n, { state: 'queued' }))
    ])
    expect(rows.map((row) => row.kind)).toEqual(['done', 'item', 'item', 'item'])
    expect(rows[0]).toMatchObject({ kind: 'done', key: 'i1' })
    expect(rows[0].kind === 'done' && rows[0].items).toHaveLength(7)
  })

  it('does not fold two chapters, which would save nothing', () => {
    expect(collapseCompleted([item(1), item(2)]).map((row) => row.kind)).toEqual(['item', 'item'])
  })

  it('keeps a chapter with an instruction or skipped paragraphs as its own row', () => {
    const rows = collapseCompleted([
      item(1),
      item(2),
      item(3),
      item(4, { instruction: 'Giữ tên riêng' }),
      item(5, { skippedSegments: ['s1'] }),
      item(6),
      item(7),
      item(8)
    ])
    expect(rows.map((row) => row.kind)).toEqual(['done', 'item', 'item', 'done'])
  })
})

describe('filterChapters', () => {
  const items = [
    item(1),
    item(2, { state: 'failed', reason: 'provider' }),
    item(3, { state: 'waiting_user', reason: 'conflict' }),
    item(4, { state: 'running' }),
    item(5, { state: 'queued' })
  ]

  it('reads each filter as the person says it', () => {
    expect(filterChapters(items, 'all')).toHaveLength(5)
    expect(filterChapters(items, 'failed').map((each) => each.id)).toEqual(['i2', 'i3'])
    expect(filterChapters(items, 'running').map((each) => each.id)).toEqual(['i4'])
    expect(filterChapters(items, 'todo').map((each) => each.id)).toEqual(['i5'])
  })

  it('opens on the failures when there are any', () => {
    expect(defaultChapterFilter(items)).toBe('failed')
    expect(defaultChapterFilter([item(1), item(2)])).toBe('all')
  })
})

describe('steerableChapters', () => {
  it('lists only the chapters no run has pinned yet', () => {
    const items = [
      item(1, { instruction: null }),
      item(2, { state: 'running', instruction: 'B' }),
      item(3, { state: 'queued', instruction: undefined }),
      item(4, { state: 'queued', instruction: undefined }),
      item(5, { state: 'cancelled', instruction: undefined })
    ]
    expect(steerableChapters(items).map((each) => each.chapterId)).toEqual(['c3', 'c4'])
  })
})
