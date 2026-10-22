import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressingScreen } from './AddressingScreen'

const WORK_ID = '11111111-1111-4111-8111-111111111111'

describe('AddressingScreen component', () => {
  beforeEach(() => {
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
      addressing: {
        characters: {
          list: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              characters: [
                {
                  id: 'char-1',
                  source: '韩立',
                  target: 'Hàn Lập',
                  gender: 'male',
                  role: 'Nhân vật chính',
                  status: 'approved',
                  notes: null,
                  aliases: ['Lập Ca'],
                  createdAt: 1,
                  updatedAt: 1
                },
                {
                  id: 'char-2',
                  source: '南宫婉',
                  target: 'Nam Cung Uyển',
                  gender: 'female',
                  role: 'Đạo lữ',
                  status: 'approved',
                  notes: null,
                  aliases: [],
                  createdAt: 1,
                  updatedAt: 1
                }
              ]
            }
          }),
          get: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        },
        dyads: {
          list: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              dyads: [
                {
                  id: 'dyad-1',
                  sourceCharacterId: 'char-1',
                  targetCharacterId: 'char-2',
                  speakerPronoun: 'ta',
                  recipientPronoun: 'nàng',
                  formality: 'thân mật',
                  status: 'approved',
                  fromChapterId: 'c1',
                  toChapterId: null,
                  notes: null,
                  createdAt: 1,
                  updatedAt: 1
                }
              ]
            }
          }),
          get: vi.fn(),
          set: vi.fn(),
          delete: vi.fn(),
          effective: vi.fn()
        },
        checkCompliance: vi.fn()
      }
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: mockMira
    }
  })

  it('renders initial toolbar, tabs and dyad matrix headers', () => {
    const html = renderToStaticMarkup(createElement(AddressingScreen, { workId: WORK_ID }))

    expect(html).toContain('Tìm theo tên nhân vật, đại từ...')
    expect(html).toContain('Thêm nhân vật')
    expect(html).toContain('Thêm xưng hô')
    expect(html).toContain('Quan hệ xưng hô')
    expect(html).toContain('Dàn nhân vật')
    expect(html).toContain('Người nói → Người nghe')
    expect(html).toContain('Từ xưng hô (Tự xưng – Gọi đối phương)')
    expect(html).toContain('Phạm vi hiệu lực')
    expect(html).toContain('Thao tác')
  })
})
