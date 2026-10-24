import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextEntryChange } from '../../../../../shared/contracts/glossary'
import { describeChange, EntryHistoryView } from './EntryHistoryDialog'

const change = (patch: Partial<ContextEntryChange>): ContextEntryChange => ({
  id: 'x',
  entryId: 'e',
  actor: 'ai',
  kind: 'create',
  field: 'target',
  oldValue: null,
  newValue: 'Mili',
  fromChapterId: null,
  quote: null,
  quoteChapterId: null,
  runId: null,
  createdAt: 1,
  ...patch
})
const numbers: Record<string, number> = { c3: 3, c8: 8, c12: 12, c20: 20 }
const chapterNumber = (id: string | null) => (id ? numbers[id] : undefined)

describe('EntryHistoryView', () => {
  it('lists changes newest first with their quote, and the chapters to translate again', () => {
    const onRetranslate = vi.fn()
    const html = renderToStaticMarkup(
      createElement(EntryHistoryView, {
        history: {
          changes: [
            change({
              id: 'b',
              kind: 'correction',
              oldValue: 'Mili',
              newValue: 'Milly',
              quote: 'ミリィ（Milly）が笑った',
              quoteChapterId: 'c20'
            }),
            change({ id: 'a' })
          ],
          affectedChapterIds: ['c3', 'c8']
        },
        chapterNumber,
        onRetranslate
      })
    )
    expect(html.indexOf('AI đổi bản dịch: Mili → Milly')).toBeLessThan(html.indexOf('AI tạo: Mili'))
    expect(html).toContain('C.20: “ミリィ（Milly）が笑った”')
    expect(html).toContain('2 chương đã dịch trước lần sửa này vẫn dùng bản dịch cũ: C.3, C.8')
    expect(html).toContain('Dịch lại các chương này')
    // Nothing is translated again until the person confirms.
    expect(onRetranslate).not.toHaveBeenCalled()
  })

  it('shows a progression with the chapter it applies from, and no list without a correction', () => {
    expect(
      describeChange(
        change({
          actor: 'user',
          kind: 'progression',
          oldValue: 'A',
          newValue: 'B',
          fromChapterId: 'c12'
        }),
        chapterNumber
      ).title
    ).toBe('Bạn đổi bản dịch: A → B (từ C.12)')
    const html = renderToStaticMarkup(
      createElement(EntryHistoryView, {
        history: { changes: [], affectedChapterIds: [] },
        chapterNumber,
        onRetranslate: vi.fn()
      })
    )
    expect(html).toContain('Chưa có thay đổi nào.')
    expect(html).not.toContain('Dịch lại')
  })
})
