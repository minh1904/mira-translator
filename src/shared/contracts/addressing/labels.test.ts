import { describe, expect, it } from 'vitest'
import { PRESET_TABLES } from './presetTables'
import { toggleGenreChip, genreHasChip, splitGenre } from './genres'
import { CULTURE_LABELS, SETTING_LABELS } from './labels'
import { CULTURE_IDS, SETTING_IDS } from './types'

describe('nhãn bối cảnh và văn hóa cho giao diện', () => {
  it('trùng với nhãn trong dữ liệu bảng, vì nhãn đó đi vào prompt', () => {
    for (const id of SETTING_IDS)
      expect(SETTING_LABELS[id], id).toBe(PRESET_TABLES.settings[id].label)
    for (const id of CULTURE_IDS)
      expect(CULTURE_LABELS[id], id).toBe(PRESET_TABLES.cultures[id].label)
  })
})

describe('chip trong chuỗi thể loại', () => {
  it('tách theo dấu phẩy và bỏ phần trống', () => {
    expect(splitGenre(' Fantasy , ,Isekai，Ngôn Tình ')).toEqual(['Fantasy', 'Isekai', 'Ngôn Tình'])
    expect(splitGenre(null)).toEqual([])
  })

  it('bật chip thêm vào cuối và giữ phần chữ tự gõ', () => {
    expect(toggleGenreChip('', 'Fantasy')).toBe('Fantasy')
    expect(toggleGenreChip('Hậu cung [ja-court]', 'Isekai')).toBe('Hậu cung [ja-court], Isekai')
    expect(toggleGenreChip(null, 'Fantasy')).toBe('Fantasy')
  })

  it('tắt chip bỏ nhãn đó, không phân biệt hoa thường, và giữ các phần khác', () => {
    expect(toggleGenreChip('Fantasy, Isekai', 'fantasy')).toBe('Isekai')
    expect(toggleGenreChip('Tiên hiệp cổ đại, Fantasy', 'Fantasy')).toBe('Tiên hiệp cổ đại')
    expect(toggleGenreChip('Fantasy', 'Fantasy')).toBe('')
  })

  it('chip chỉ khớp nguyên một mục, không khớp một phần của chữ tự gõ', () => {
    expect(genreHasChip('Tiên hiệp cổ đại', 'Tiên Hiệp')).toBe(false)
    expect(genreHasChip('Tiên hiệp, cổ đại', 'tiên hiệp')).toBe(true)
  })
})
