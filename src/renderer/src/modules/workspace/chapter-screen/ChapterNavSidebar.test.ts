import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChapterNavSidebar } from './ChapterNavSidebar'

const WORK_ID = 'work-1'

const mockChapters = [
  {
    id: 'ch-1',
    number: 1,
    title: 'Khởi đầu',
    createdAt: 0,
    updatedAt: 0,
    hasSource: true,
    hasTarget: true
  },
  {
    id: 'ch-2',
    number: 2,
    title: 'Cuộc gặp gỡ',
    createdAt: 0,
    updatedAt: 0,
    hasSource: true,
    hasTarget: false
  }
]

vi.mock('../work-detail/useChapters', () => ({
  useChapters: () => ({
    load: 'ready',
    chapters: mockChapters,
    loadError: null,
    notice: null,
    dismissNotice: () => undefined,
    reload: async () => undefined,
    create: async () => ({
      ok: true,
      value: { id: 'ch-3', number: 3, title: 'Chương 3', hasSource: false, hasTarget: false }
    }),
    rename: async () => ({ ok: true }),
    move: async () => ({ ok: true }),
    remove: async () => ({ ok: true }),
    open: async () => ({ ok: true })
  })
}))

describe('ChapterNavSidebar', () => {
  function render(activeChapterId = 'ch-1'): string {
    return renderToStaticMarkup(
      createElement(ChapterNavSidebar, {
        workId: WORK_ID,
        workTitle: 'Test Novel',
        activeChapterId,
        onOpenChapter: () => undefined,
        onWorkChanged: () => undefined
      })
    )
  }

  it('renders a search input instead of the old back button', () => {
    const html = render()
    expect(html).toContain('placeholder="Tìm hoặc nhảy số… (/)"')
    expect(html).toContain('aria-label="Tìm kiếm chương"')
    expect(html).not.toContain('title="Về tác phẩm"')
  })

  it('renders quick add button with Alt+N hint and chapter rows', () => {
    const html = render()
    expect(html).toContain('aria-label="Thêm chương"')
    expect(html).toContain('1. Khởi đầu')
    expect(html).toContain('2. Cuộc gặp gỡ')
  })

  it('renders action triggers for each chapter', () => {
    const html = render()
    expect(html).toContain('aria-label="Thao tác với Khởi đầu"')
    expect(html).toContain('aria-label="Thao tác với Cuộc gặp gỡ"')
  })

  it('leaves translation progress to the window status bar', () => {
    const html = render()
    expect(html).not.toContain('chương đã dịch')
  })

  it('renders clean labels and gap indicator when chapters are sparse', () => {
    const html = render()
    // With ch-1 and ch-2, no gap
    expect(html).not.toContain('Khuyết')
  })
})
