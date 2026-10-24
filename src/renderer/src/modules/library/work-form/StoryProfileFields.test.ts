import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GENRE_CHIPS } from '../../../../../shared/contracts/addressing/genres'
import { GenreChips, StoryProfileFields, describeRegister } from './StoryProfileFields'
import { emptyWorkForm, type WorkFormValues } from './workFormValues'

const noop = (): void => {}
const values = (patch: Partial<WorkFormValues> = {}): WorkFormValues => ({
  ...emptyWorkForm,
  title: 'Truyện',
  sourceLang: 'ja',
  ...patch
})

interface ChipButton {
  label: string
  pressed: boolean
  disabled: boolean
}

/** Các nút chip (nút có aria-pressed) trong markup; bỏ class để không đọc nhầm `data-disabled:` trong đó. */
function chips(html: string): ChipButton[] {
  const out: ChipButton[] = []
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = match[1].replace(/class="[^"]*"/, '')
    if (!/aria-pressed=/.test(attrs)) continue
    out.push({
      label: match[2].replace(/<[^>]*>/g, ''),
      pressed: /aria-pressed="true"/.test(attrs),
      disabled: /\sdisabled(=|\s|$)/.test(attrs) || /\sdata-disabled/.test(attrs)
    })
  }
  return out
}

const pressed = (html: string): string[] =>
  chips(html)
    .filter((chip) => chip.pressed)
    .map((chip) => chip.label)

describe('chip thể loại', () => {
  it('hiện mọi chip, và chỉ chip có trong chuỗi thể loại là đang bật', () => {
    const html = renderToStaticMarkup(
      createElement(GenreChips, { genre: 'Fantasy, 18+', onChange: noop })
    )
    for (const chip of GENRE_CHIPS) expect(html).toContain(chip.label)
    expect(pressed(html)).toEqual(['Fantasy', '18+'])
  })

  it('chữ tự gõ không khớp chip nào không làm chip nào bật', () => {
    const html = renderToStaticMarkup(
      createElement(GenreChips, { genre: 'Truyện kỳ lạ tự gõ', onChange: noop })
    )
    expect(pressed(html)).toEqual([])
  })

  it('khóa chip khi form đang lưu', () => {
    const html = renderToStaticMarkup(
      createElement(GenreChips, { genre: '', onChange: noop, disabled: true })
    )
    expect(chips(html)).toHaveLength(GENRE_CHIPS.length)
    expect(chips(html).every((chip) => chip.disabled)).toBe(true)
  })
})

describe('câu nói bảng xưng hô sẽ dùng', () => {
  it('chưa chọn bối cảnh và thể loại không cho biết thì nói rõ là không có bảng', () => {
    expect(describeRegister(values())).toContain('Chưa chọn bối cảnh')
    expect(describeRegister(values({ genre: 'Xuyên Không, Ngôn Tình, 18+' }))).toContain(
      'Chưa chọn bối cảnh'
    )
  })

  it('chip bối cảnh mâu thuẫn thì không đoán và nói như chưa chọn', () => {
    expect(describeRegister(values({ genre: 'Đô Thị, Fantasy' }))).toContain('Chưa chọn bối cảnh')
  })

  it('suy từ chip và ngôn ngữ nguồn khi người dùng chưa chọn', () => {
    const text = describeRegister(values({ genre: 'Fantasy, Isekai' }))
    expect(text).toBe(
      'Bảng xưng hô gợi ý: Fantasy, quý tộc, isekai · văn hóa Nhật (suy từ thể loại).'
    )
  })

  it('lựa chọn của người dùng thắng suy, kèm bối cảnh phụ và văn hóa', () => {
    const text = describeRegister(
      values({
        sourceLang: 'en',
        genre: 'Fantasy',
        setting: 'court',
        settingsExtra: ['cultivation'],
        culture: 'zh'
      })
    )
    expect(text).toBe(
      'Bảng xưng hô gợi ý: Cung đình, cổ trang + Tiên hiệp, kiếm hiệp · văn hóa Trung.'
    )
  })

  it('"không dùng bảng" thắng chip', () => {
    expect(describeRegister(values({ genre: 'Fantasy', setting: 'none' }))).toContain(
      'Không dùng bảng xưng hô gợi ý'
    )
  })

  it('tiếng Anh không có văn hóa mặc định nên chỉ nói bối cảnh', () => {
    expect(describeRegister(values({ sourceLang: 'en', genre: 'Fantasy' }))).toBe(
      'Bảng xưng hô gợi ý: Fantasy, quý tộc, isekai (suy từ thể loại).'
    )
  })
})

describe('bối cảnh và văn hóa trong form', () => {
  const render = (v: WorkFormValues): string =>
    renderToStaticMarkup(createElement(StoryProfileFields, { values: v, set: noop }))

  it('khóa bối cảnh phụ khi chưa có bối cảnh chính và nói vì sao', () => {
    const html = render(values())
    expect(html).toContain('Chọn bối cảnh chính trước khi thêm bối cảnh phụ.')
    expect(chips(html)).toHaveLength(5)
    expect(chips(html).every((chip) => chip.disabled)).toBe(true)
  })

  it('khóa bối cảnh phụ khi bối cảnh chính là "không dùng bảng"', () => {
    const list = chips(render(values({ setting: 'none' })))
    expect(list).toHaveLength(5)
    expect(list.every((chip) => chip.disabled)).toBe(true)
  })

  it('mở bối cảnh phụ khi có bối cảnh chính, bỏ chính nó khỏi danh sách phụ và đánh dấu phụ đã chọn', () => {
    const html = render(values({ setting: 'court', settingsExtra: ['cultivation'] }))
    expect(chips(html)).toHaveLength(4)
    expect(chips(html).some((chip) => chip.disabled)).toBe(false)
    expect(pressed(html)).toEqual(['Tiên hiệp, kiếm hiệp'])
  })

  it('hiện câu nói bảng sẽ dùng, và nhắc rằng văn hóa không phải ngôn ngữ văn bản', () => {
    const html = render(values({ genre: 'Fantasy' }))
    expect(html).toContain('Bảng xưng hô gợi ý: Fantasy, quý tộc, isekai')
    expect(html).toContain('không phải ngôn ngữ văn bản')
  })
})
