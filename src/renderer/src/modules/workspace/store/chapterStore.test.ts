import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useChapterStore } from './chapterStore'
import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type { WorkSummary } from '../../../../../shared/contracts/library'

const mockWorkSummary: WorkSummary = {
  id: 'work-1',
  title: 'Test Work',
  originalTitle: null,
  description: null,
  author: null,
  genre: null,
  setting: null,
  settingsExtra: [],
  culture: null,
  coverVersion: null,
  sourceLang: 'zh-Hans',
  status: 'in-progress',
  archived: false,
  chapterCount: 1,
  lastChapter: null,
  createdAt: 1775347200000,
  updatedAt: 1775347200000
}

const mockChapter: ChapterItem = {
  id: 'chap-1',
  number: 1,
  title: 'Chương 1',
  hasSource: true,
  hasTarget: false,
  updatedAt: 1775347200000,
  createdAt: 1775347200000
}

describe('chapterStore', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: {
        chapters: {
          list: vi.fn(),
          create: vi.fn(),
          rename: vi.fn(),
          move: vi.fn(),
          delete: vi.fn(),
          open: vi.fn()
        }
      }
    }
  })

  it('initializes with default values', () => {
    const state = useChapterStore.getState()
    expect(state.workId).toBeNull()
    expect(state.load).toBe('loading')
    expect(state.chapters).toEqual([])
  })

  it('loads chapters for a work', async () => {
    window.mira.chapters.list = vi.fn().mockResolvedValue({
      ok: true,
      value: { chapters: [mockChapter] }
    })

    await useChapterStore.getState().initWork('work-1')

    const state = useChapterStore.getState()
    expect(state.workId).toBe('work-1')
    expect(state.load).toBe('ready')
    expect(state.chapters).toEqual([mockChapter])
  })

  it('restores each work chapter list on tab return', async () => {
    window.mira.chapters.list = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: { chapters: [mockChapter] } })
      .mockResolvedValueOnce({ ok: true, value: { chapters: [] } })
    await useChapterStore.getState().initWork('work-1')
    await useChapterStore.getState().initWork('work-2')
    await useChapterStore.getState().initWork('work-1')
    expect(useChapterStore.getState()).toMatchObject({
      workId: 'work-1',
      chapters: [mockChapter]
    })
    expect(window.mira.chapters.list).toHaveBeenCalledTimes(2)
  })

  it('creates a new chapter and appends to list', async () => {
    window.mira.chapters.list = vi.fn().mockResolvedValue({
      ok: true,
      value: { chapters: [] }
    })
    await useChapterStore.getState().initWork('work-1')

    window.mira.chapters.create = vi.fn().mockResolvedValue({
      ok: true,
      value: { work: mockWorkSummary, chapter: mockChapter }
    })

    const res = await useChapterStore.getState().create('Chương 1')
    expect(res.ok).toBe(true)
    expect(useChapterStore.getState().chapters).toEqual([mockChapter])
  })

  it('renames a chapter', async () => {
    window.mira.chapters.list = vi.fn().mockResolvedValue({
      ok: true,
      value: { chapters: [mockChapter] }
    })
    await useChapterStore.getState().initWork('work-1')

    const renamed = { ...mockChapter, title: 'Tên mới' }
    window.mira.chapters.rename = vi.fn().mockResolvedValue({
      ok: true,
      value: { work: mockWorkSummary, chapter: renamed }
    })

    const res = await useChapterStore.getState().rename('chap-1', 'Tên mới')
    expect(res.ok).toBe(true)
    expect(useChapterStore.getState().chapters[0].title).toBe('Tên mới')
  })

  it('deletes a chapter and updates list', async () => {
    window.mira.chapters.list = vi.fn().mockResolvedValue({
      ok: true,
      value: { chapters: [mockChapter] }
    })
    await useChapterStore.getState().initWork('work-1')

    window.mira.chapters.delete = vi.fn().mockResolvedValue({
      ok: true,
      value: { work: mockWorkSummary, chapters: [] }
    })

    const res = await useChapterStore.getState().remove('chap-1')
    expect(res.ok).toBe(true)
    expect(useChapterStore.getState().chapters).toEqual([])
  })

  it('ignores a chapter list from a work that is no longer active', async () => {
    let resolveFirst!: (value: unknown) => void
    window.mira.chapters.list = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ ok: true, value: { chapters: [] } })
    const first = useChapterStore.getState().initWork('work-1')
    await useChapterStore.getState().initWork('work-2')
    resolveFirst({ ok: true, value: { chapters: [mockChapter] } })
    await first
    expect(useChapterStore.getState()).toMatchObject({ workId: 'work-2', chapters: [] })
  })

  it('does not append a chapter from a late create to another work', async () => {
    window.mira.chapters.list = vi.fn().mockResolvedValue({ ok: true, value: { chapters: [] } })
    await useChapterStore.getState().initWork('work-1')
    let resolveCreate!: (value: unknown) => void
    window.mira.chapters.create = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )
    const creating = useChapterStore.getState().create('Chương 1')
    await useChapterStore.getState().initWork('work-2')
    resolveCreate({ ok: true, value: { work: mockWorkSummary, chapter: mockChapter } })
    await creating
    expect(useChapterStore.getState()).toMatchObject({ workId: 'work-2', chapters: [] })
  })
})
