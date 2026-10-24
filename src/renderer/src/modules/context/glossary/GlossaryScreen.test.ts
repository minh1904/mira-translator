import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GlossaryScreen, reviewFlagLabel } from './GlossaryScreen'

const WORK_ID = '11111111-1111-4111-8111-111111111111'

describe('GlossaryScreen component', () => {
  beforeEach(() => {
    // Giả lập đối tượng globalThis.window
    const mockMira = {
      chapters: {
        list: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            chapters: [
              {
                id: 'c1',
                number: 1,
                title: 'Chương 1',
                hasSource: true,
                hasTarget: true,
                createdAt: 1,
                updatedAt: 1
              },
              {
                id: 'c2',
                number: 2,
                title: 'Chương 2',
                hasSource: true,
                hasTarget: false,
                createdAt: 1,
                updatedAt: 1
              }
            ]
          }
        })
      },
      glossary: {
        list: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            entries: [
              {
                id: 'e1',
                kind: 'term',
                source: '筑基',
                target: 'Trúc Cơ',
                status: 'approved',
                origin: 'user',
                forbidden: false,
                fromChapterId: 'c1',
                toChapterId: 'c2',
                notes: 'Cảnh giới tu luyện',
                aliases: ['Trúc Cơ Kỳ'],
                createdAt: 1,
                updatedAt: 1
              }
            ]
          }
        }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        importNames: vi.fn(),
        checkCompliance: vi.fn(),
        reviewInfo: vi.fn().mockResolvedValue({ ok: true, value: { entries: [] } })
      }
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: mockMira
    }
  })

  it('renders initial toolbar and table headers', () => {
    const html = renderToStaticMarkup(createElement(GlossaryScreen, { workId: WORK_ID }))

    expect(html).toContain('Tìm theo từ gốc, bản dịch, alias...')
    expect(html).toContain('Nhập Names.txt')
    expect(html).toContain('Thêm thuật ngữ')
    expect(html).toContain('Từ gốc / Biến thể')
    expect(html).toContain('Bản dịch đích')
    expect(html).toContain('Hiệu lực')
  })
})

describe('glossary review helpers', () => {
  it('names every flag for the reviewer', () => {
    expect(reviewFlagLabel({ code: 'alias_conflict', detail: 'アキ' })).toBe(
      'Dạng viết "アキ" thuộc mục khác'
    )
    expect(reviewFlagLabel({ code: 'script_mismatch' })).toBe('Bản dịch sai hệ chữ')
    expect(reviewFlagLabel({ code: 'reopened' })).toBe('Mở lại vì có bằng chứng mới')
    expect(reviewFlagLabel({ code: 'family_mismatch' })).toBe('Lệch khuôn với thuật ngữ cùng họ')
    expect(reviewFlagLabel({ code: 'short_alias', detail: 'セラ' })).toBe(
      'Dạng ngắn "セラ" dễ khớp nhầm'
    )
  })
})
