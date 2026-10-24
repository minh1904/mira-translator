import { describe, expect, it } from 'vitest'
import { genreFamily, languageProfile } from './languageProfiles'

describe('genreFamily', () => {
  it('nhận thể loại cổ trang và hiện đại từ chữ người dùng gõ', () => {
    expect(genreFamily('Tiên hiệp, tu tiên')).toBe('historical')
    expect(genreFamily('仙侠')).toBe('historical')
    expect(genreFamily('Ngôn tình đô thị')).toBe('modern')
    expect(genreFamily('Urban fantasy')).toBe('modern')
  })

  it('không chắc thì để chung', () => {
    expect(genreFamily(null)).toBe('unknown')
    expect(genreFamily('Ngôn tình')).toBe('unknown')
    // Có cả hai dấu hiệu (cung đấu cổ đại và đô thị): không đoán.
    expect(genreFamily('Cung đấu, đô thị')).toBe('unknown')
    // Xuyên không là chế độ kể, không cho biết bối cảnh: chỉ còn tín hiệu đô thị.
    expect(genreFamily('Xuyên không đô thị')).toBe('modern')
  })
})

describe('languageProfile', () => {
  it('tiếng Nhật mặc định giữ hậu tố', () => {
    const lines = languageProfile({ sourceLang: 'ja' }).join('\n')
    expect(lines).toContain('Giữ hậu tố')
    expect(lines).toContain('chị A-san')
  })

  it('tiếng Nhật Việt hóa vẫn giữ thay đổi cách gọi trong bản gốc', () => {
    const lines = languageProfile({ sourceLang: 'ja', honorifics: { mode: 'localize' } }).join('\n')
    expect(lines).toContain('Việt hóa')
    expect(lines).toContain('A-san thành A')
    expect(lines).not.toContain('Giữ hậu tố')
  })

  it('chế độ lai hoặc tùy chỉnh dùng quy tắc người dịch, thiếu quy tắc thì về mặc định', () => {
    const custom = languageProfile({
      sourceLang: 'ja',
      honorifics: { mode: 'custom', rules: 'Giữ -sama, bỏ -san.' }
    }).join('\n')
    expect(custom).toContain('Giữ -sama, bỏ -san.')
    const empty = languageProfile({ sourceLang: 'ja', honorifics: { mode: 'hybrid', rules: ' ' } })
    expect(empty.join('\n')).toContain('Giữ hậu tố')
  })

  it('tiếng Trung đổi lối xưng hô theo thể loại và dùng fallback rõ cho profile lạ', () => {
    expect(languageProfile({ sourceLang: 'zh-Hant', genre: '武侠' }).join('\n')).toContain('cổ đại')
    expect(languageProfile({ sourceLang: 'zh-Hans' }).join('\n')).toContain('giữ một lối')
    expect(languageProfile({ sourceLang: 'en' }).join('\n')).toContain('I/you')
    expect(languageProfile({ sourceLang: 'ko' }).join('\n')).toContain('kính ngữ')
    expect(languageProfile({ sourceLang: 'fr-CA' })).toEqual([])
  })
})

describe('quy ước theo văn hóa gốc', () => {
  const lines = (input: Parameters<typeof languageProfile>[0]): string =>
    languageProfile(input).join('\n')

  it('khi văn hóa trùng ngôn ngữ nguồn thì giữ nguyên profile của ngôn ngữ đó', () => {
    expect(languageProfile({ sourceLang: 'ja', culture: 'ja' })).toEqual(
      languageProfile({ sourceLang: 'ja' })
    )
    expect(languageProfile({ sourceLang: 'zh-Hans', culture: 'zh', setting: 'court' })).toEqual(
      languageProfile({ sourceLang: 'zh-Hans', genre: 'cổ trang' })
    )
    expect(languageProfile({ sourceLang: 'en', culture: 'west' })).toEqual(
      languageProfile({ sourceLang: 'en' })
    )
  })

  it('bản tiếng Anh của truyện Nhật dùng quy ước kính ngữ Nhật, không dùng dòng về chữ Nhật', () => {
    const text = lines({ sourceLang: 'en', culture: 'ja' })
    expect(text).toContain('Giữ hậu tố gắn sau tên')
    expect(text).toContain('I/you không cho biết quan hệ')
    expect(text).not.toContain('です/ます')
    expect(text).not.toContain('romaji')
  })

  it('chính sách kính ngữ Nhật cũng áp cho bản tiếng Anh của truyện Nhật', () => {
    expect(lines({ sourceLang: 'en', culture: 'ja', honorifics: { mode: 'localize' } })).toContain(
      'Việt hóa kính ngữ gắn sau tên'
    )
  })

  it('bản tiếng Anh của truyện Trung dùng Hán Việt cho tên, nhường dòng tên Latinh', () => {
    const text = lines({ sourceLang: 'en', culture: 'zh', setting: 'cultivation' })
    expect(text).toContain('Tên người, địa danh, công pháp, cảnh giới dùng âm Hán Việt')
    expect(text).toContain('bổn tọa')
    expect(text).toContain('I/you không cho biết quan hệ')
    expect(text).not.toContain('chữ Latinh')
    expect(text).not.toContain('咱们')
  })

  it('bối cảnh đã chọn thắng việc đoán nhóm thể loại của truyện Trung', () => {
    const modern = lines({ sourceLang: 'zh-Hans', setting: 'modern', genre: 'Tiên hiệp' })
    expect(modern).toContain('lối nói hiện đại')
    const historical = lines({ sourceLang: 'zh-Hans', setting: 'court', genre: 'Đô thị' })
    expect(historical).toContain('bối cảnh cổ đại')
  })

  it('bản tiếng Anh giữ nguyên dòng tên Latinh khi văn hóa là Nhật, Hàn hoặc phương Tây', () => {
    expect(lines({ sourceLang: 'en', culture: 'ja' })).toContain('chữ Latinh')
    expect(lines({ sourceLang: 'en', culture: 'ko' })).toContain('chữ Latinh')
    expect(lines({ sourceLang: 'en', culture: 'west' })).toContain('chữ Latinh')
  })

  it('văn hóa khác ngôn ngữ chỉ ghép với tiếng Anh; ngôn ngữ khác quay về profile của chính nó', () => {
    expect(languageProfile({ sourceLang: 'ja', culture: 'ko' })).toEqual(
      languageProfile({ sourceLang: 'ja' })
    )
  })

  it('xuyên không không còn bị coi là truyện cổ đại', () => {
    expect(genreFamily('Xuyên không')).toBe('unknown')
    expect(genreFamily('Xuyên không, cung đấu')).toBe('historical')
  })
})

describe('kính ngữ Hàn', () => {
  const ko = (honorifics?: Parameters<typeof languageProfile>[0]['honorifics']): string =>
    languageProfile({ sourceLang: 'ko', honorifics }).join('\n')

  it('mặc định Việt hóa -ssi, dịch 오빠/형 theo vai và 선배 gọi trống ra "tiền bối"', () => {
    const text = ko()
    expect(text).toContain('Việt hóa hậu tố gắn sau tên')
    expect(text).toContain('em – anh/chị')
    expect(text).toContain('gọi trống dịch "tiền bối"')
    expect(text).toContain('형님 cần biết giới tính người nói')
    expect(text).not.toContain('Giữ hậu tố và danh xưng thân tộc Hàn')
  })

  it('chế độ giữ hậu tố giữ nguyên oppa, hyung, sunbae', () => {
    const text = ko({ mode: 'keep' })
    expect(text).toContain('Giữ hậu tố và danh xưng thân tộc Hàn')
    expect(text).not.toContain('Việt hóa hậu tố gắn sau tên')
  })

  it('quy tắc của người dịch thay thế quy ước mặc định; quy tắc trống thì quay về mặc định', () => {
    expect(ko({ mode: 'custom', rules: 'Giữ oppa, Việt hóa còn lại.' })).toContain(
      'Giữ oppa, Việt hóa còn lại.'
    )
    expect(ko({ mode: 'custom', rules: ' ' })).toContain('Việt hóa hậu tố gắn sau tên')
  })

  it('không còn dòng ghép danh xưng lặp ở phần tên người', () => {
    const lines = ko()
      .split('\n')
      .filter((line) => line.includes('anh Min-su-ssi'))
    expect(lines).toHaveLength(1)
  })

  it('bản tiếng Anh của truyện Hàn dùng cùng quy ước kính ngữ Hàn', () => {
    const text = languageProfile({ sourceLang: 'en', culture: 'ko' }).join('\n')
    expect(text).toContain('Việt hóa hậu tố gắn sau tên')
    expect(text).not.toContain('Đuôi câu lịch sự (-요')
  })
})

describe('language profiles: style notes', () => {
  it('gives each source language its own flexible notes', () => {
    const profile = (sourceLang: string, genre?: string) =>
      languageProfile({ sourceLang, genre }).join('\n')
    const ja = profile('ja')
    expect(ja).toContain('không phiên âm romaji')
    expect(ja).toContain('緊張 là căng thẳng')
    const zh = profile('zh-Hans', 'Tiên hiệp')
    expect(zh).toContain('咱们 luôn gồm người nghe')
    expect(zh).toContain('bổn tọa')
    expect(zh).toContain('có phải… hay không')
    const ko = profile('ko')
    expect(ko).toContain('không tự đọc theo Hán Việt')
    expect(ko).toContain('ạ, dạ, thưa')
    expect(ko).not.toContain('Hán Hàn')
    expect(profile('en')).toContain('không lặp "anh ta/cô ta"')
  })
})
