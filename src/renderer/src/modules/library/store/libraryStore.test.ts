import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useLibraryStore } from './libraryStore'
import type { WorkList, WorkSummary } from '../../../../../shared/contracts/library'

const mockSummary: WorkSummary = {
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
  chapterCount: 0,
  lastChapter: null,
  createdAt: 1775347200000,
  updatedAt: 1775347200000
}

describe('libraryStore', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: {
        works: {
          list: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          setCover: vi.fn()
        },
        backup: {
          restore: vi.fn()
        }
      }
    }
  })

  it('initializes with default loading state', () => {
    const state = useLibraryStore.getState()
    expect(state.load).toBe('loading')
    expect(state.works).toEqual([])
    expect(state.problems).toEqual([])
    expect(state.notice).toBeNull()
  })

  it('reloads works successfully from window.mira.works.list', async () => {
    const listResponse: WorkList = {
      works: [mockSummary],
      problems: []
    }
    window.mira.works.list = vi.fn().mockResolvedValue({ ok: true, value: listResponse })

    await useLibraryStore.getState().reload()

    const state = useLibraryStore.getState()
    expect(state.load).toBe('ready')
    expect(state.works.length).toBe(1)
    expect(state.works[0].id).toBe('work-1')
    expect(state.works[0].title).toBe('Test Work')
  })

  it('handles reload failure properly', async () => {
    window.mira.works.list = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'io', message: 'Disk read error' }
    })

    await useLibraryStore.getState().reload()

    const state = useLibraryStore.getState()
    expect(state.load).toBe('failed')
    expect(state.loadError).toContain('Disk read error')
  })

  it('applyWork updates existing work or adds new work in memory', () => {
    useLibraryStore.getState().applyWork(mockSummary)
    expect(useLibraryStore.getState().works.length).toBe(1)
    expect(useLibraryStore.getState().works[0].title).toBe('Test Work')

    const updatedSummary = { ...mockSummary, title: 'Updated Work Title' }
    useLibraryStore.getState().applyWork(updatedSummary)
    expect(useLibraryStore.getState().works.length).toBe(1)
    expect(useLibraryStore.getState().works[0].title).toBe('Updated Work Title')

    const newSummary: WorkSummary = {
      ...mockSummary,
      id: 'work-2',
      title: 'Second Work'
    }
    useLibraryStore.getState().applyWork(newSummary)
    expect(useLibraryStore.getState().works.length).toBe(2)
  })

  it('dismisses notice and success', () => {
    useLibraryStore.getState().reportNotice('Something went wrong')
    expect(useLibraryStore.getState().notice).toBe('Something went wrong')

    useLibraryStore.getState().dismissNotice()
    expect(useLibraryStore.getState().notice).toBeNull()
  })
})
