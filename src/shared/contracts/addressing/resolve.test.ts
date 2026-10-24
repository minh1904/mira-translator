import { describe, expect, it } from 'vitest'
import { GENRE_CHIPS, cultureOfGenre, settingsOfGenre } from './genres'
import { cultureOfLanguage, resolveRegister } from './resolve'

describe('resolveRegister', () => {
  it('mã trong thể loại thắng lựa chọn đã lưu và bỏ bối cảnh phụ đã lưu', () => {
    expect(
      resolveRegister({
        sourceLang: 'ja',
        genre: 'Học đường [ja-fantasy]',
        setting: 'modern',
        settingsExtra: ['game'],
        culture: 'ko'
      })
    ).toEqual({ setting: 'fantasy', extra: [], culture: 'ja' })
  })

  it('lựa chọn đã lưu thắng suy từ thể loại', () => {
    expect(
      resolveRegister({ sourceLang: 'ja', genre: 'Fantasy', setting: 'court', culture: 'zh' })
    ).toEqual({ setting: 'court', extra: [], culture: 'zh' })
  })

  it('bối cảnh phụ đã lưu được giữ, không lặp bối cảnh chính hay lặp nhau', () => {
    expect(
      resolveRegister({ setting: 'court', settingsExtra: ['court', 'cultivation', 'cultivation'] })
    ).toMatchObject({ setting: 'court', extra: ['cultivation'] })
  })

  it('"none" tắt bảng nhưng văn hóa vẫn có để điều khiển kính ngữ', () => {
    expect(resolveRegister({ sourceLang: 'ko', genre: 'Fantasy', setting: 'none' })).toEqual({
      setting: null,
      extra: [],
      culture: 'ko'
    })
  })

  it('suy bối cảnh từ chip khi không mâu thuẫn', () => {
    expect(resolveRegister({ sourceLang: 'ja', genre: 'Fantasy, Isekai' })).toEqual({
      setting: 'fantasy',
      extra: [],
      culture: 'ja'
    })
    expect(resolveRegister({ sourceLang: 'ja', genre: 'Hậu cung, trinh thám' }).setting).toBe(
      'court'
    )
    expect(resolveRegister({ sourceLang: 'ja', genre: 'Học đường' }).setting).toBe('modern')
    expect(resolveRegister({ sourceLang: 'ja', genre: '現実世界〔恋愛〕' }).setting).toBe('modern')
  })

  it('chip bối cảnh mâu thuẫn thì không suy ra bối cảnh nào', () => {
    expect(resolveRegister({ sourceLang: 'ja', genre: 'Đô Thị, Fantasy' }).setting).toBeNull()
  })

  it('Xuyên Không và chip không phải bối cảnh không cho ra bối cảnh', () => {
    expect(resolveRegister({ sourceLang: 'zh-Hans', genre: 'Xuyên Không' }).setting).toBeNull()
    expect(resolveRegister({ sourceLang: 'ja', genre: 'Ngôn Tình, 18+, Harem' }).setting).toBeNull()
  })

  it('tiếng Anh không tín hiệu không cho bối cảnh và không cho văn hóa', () => {
    expect(resolveRegister({ sourceLang: 'en', genre: null })).toEqual({
      setting: null,
      extra: [],
      culture: null
    })
    expect(resolveRegister({ sourceLang: 'en', genre: 'Hành động' }).setting).toBeNull()
  })

  it('văn hóa theo thứ tự: đã lưu > từ khóa thể loại > ngôn ngữ nguồn', () => {
    expect(resolveRegister({ sourceLang: 'en', genre: 'Xianxia, cultivation' })).toEqual({
      setting: 'cultivation',
      extra: [],
      culture: 'zh'
    })
    expect(resolveRegister({ sourceLang: 'en', culture: 'ja' }).culture).toBe('ja')
    expect(resolveRegister({ sourceLang: 'zh-Hant', genre: 'Đô thị' })).toEqual({
      setting: 'modern',
      extra: [],
      culture: 'zh'
    })
  })

  it('có bối cảnh mà chưa có văn hóa thì giữ văn hóa là null', () => {
    expect(resolveRegister({ sourceLang: 'en', setting: 'modern' })).toEqual({
      setting: 'modern',
      extra: [],
      culture: null
    })
  })
})

describe('cultureOfLanguage', () => {
  it('ja, ko, zh có văn hóa mặc định; en và ngôn ngữ khác thì không', () => {
    expect(
      ['ja', 'ko', 'zh-Hans', 'zh-Hant', 'en', 'fr', undefined].map(cultureOfLanguage)
    ).toEqual(['ja', 'ko', 'zh', 'zh', null, null, null])
  })
})

describe('thể loại', () => {
  it('chỉ chip nhóm bối cảnh cho ra bối cảnh, và mỗi nhãn chip bối cảnh tự suy ra đúng bối cảnh của nó', () => {
    for (const chip of GENRE_CHIPS) {
      if (chip.group === 'setting') {
        expect(settingsOfGenre(chip.label), chip.label).toEqual([chip.setting])
      } else {
        expect(chip.setting, chip.label).toBeUndefined()
        expect(settingsOfGenre(chip.label), chip.label).toEqual([])
      }
    }
  })

  it('không chip nào trùng nhãn', () => {
    const labels = GENRE_CHIPS.map((chip) => chip.label.toLowerCase())
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('văn hóa Trung chỉ nhận ra từ từ khóa tu chân, kiếm hiệp, cung đấu', () => {
    expect(cultureOfGenre('Tiên Hiệp')).toBe('zh')
    expect(cultureOfGenre('Fantasy')).toBeNull()
  })
})
