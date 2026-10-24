import { describe, expect, it } from 'vitest'
import { composePreset, LEGACY_PRESET_ALIASES, parseRegisterTag } from './compose'
import type { PresetRow, PresetTables, RegisterSelection, SettingId } from './types'

const row = (relation: string, forward: string, extra: Partial<PresetRow> = {}): PresetRow => ({
  relation,
  forward,
  confidence: 'high',
  ...extra
})

const empty = { label: 'x', rows: [], thirdPerson: [] }
const tables: PresetTables = {
  settings: {
    modern: {
      label: 'Hiện đại',
      rows: [row('Bạn', 'tôi – cậu'), row('Sếp', 'tôi – sếp')],
      thirdPerson: ['anh ấy']
    },
    fantasy: { ...empty, label: 'Fantasy' },
    court: {
      label: 'Cung đình',
      rows: [row('Phu thê', 'ta – nàng'), row('Vua → bề tôi', 'trẫm – khanh')],
      thirdPerson: ['hắn']
    },
    cultivation: {
      label: 'Tu chân',
      rows: [row('Phu thê', 'ta – nàng (đạo lữ)'), row('Sư môn', 'ta – ngươi')],
      thirdPerson: ['hắn', 'y']
    },
    game: { ...empty, label: 'Game' }
  },
  cultures: {
    ja: {
      label: 'Nhật',
      rows: {
        modern: [row('Bạn', 'tớ – cậu'), row('Tiền bối', 'em – anh')],
        court: [row('Cung nữ', 'tôi – nương nương')]
      },
      thirdPerson: { modern: ['cậu ấy'] }
    },
    ko: { label: 'Hàn', rows: {} },
    zh: { label: 'Trung', rows: {} },
    west: { label: 'Tây', rows: {} }
  }
}

const select = (
  setting: SettingId | null,
  culture: RegisterSelection['culture'] = null,
  extra: SettingId[] = []
): RegisterSelection => ({ setting, extra, culture })

describe('composePreset', () => {
  it('không có bối cảnh chính thì không có bảng, kể cả khi có bối cảnh phụ và văn hóa', () => {
    expect(composePreset(select(null, 'ja', ['court']), tables)).toBeNull()
  })

  it('chỉ có bối cảnh thì lấy dòng chung', () => {
    const preset = composePreset(select('modern'), tables)
    expect(preset?.rows.map((r) => r.forward)).toEqual(['tôi – cậu', 'tôi – sếp'])
    expect(preset?.cultureLabel).toBeNull()
  })

  it('dòng riêng của văn hóa thay dòng chung cùng quan hệ và thêm dòng mới', () => {
    const preset = composePreset(select('modern', 'ja'), tables)
    expect(preset?.rows.map((r) => r.forward)).toEqual(['tớ – cậu', 'tôi – sếp', 'em – anh'])
    expect(preset?.cultureLabel).toBe('Nhật')
    expect(preset?.thirdPerson).toEqual(['anh ấy', 'cậu ấy'])
  })

  it('văn hóa không có dòng riêng cho bối cảnh thì chỉ còn dòng chung', () => {
    const preset = composePreset(select('cultivation', 'west'), tables)
    expect(preset?.rows.map((r) => r.relation)).toEqual(['Phu thê', 'Sư môn'])
  })

  it('bối cảnh chính thắng bối cảnh phụ khi trùng quan hệ, dòng chỉ có ở phụ vẫn có mặt', () => {
    const preset = composePreset(select('court', null, ['cultivation']), tables)
    expect(preset?.rows.map((r) => r.forward)).toEqual(['ta – nàng', 'trẫm – khanh', 'ta – ngươi'])
    expect(preset?.settingLabels).toEqual(['Cung đình', 'Tu chân'])
    expect(preset?.thirdPerson).toEqual(['hắn', 'y'])
  })

  it('bối cảnh phụ trùng bối cảnh chính hoặc trùng nhau chỉ tính một lần', () => {
    const preset = composePreset(
      select('court', null, ['court', 'cultivation', 'cultivation']),
      tables
    )
    expect(preset?.settingLabels).toEqual(['Cung đình', 'Tu chân'])
  })

  it('so khớp quan hệ không phân biệt hoa thường và khoảng trắng đầu cuối', () => {
    const preset = composePreset(select('modern', 'ja'), {
      ...tables,
      cultures: {
        ...tables.cultures,
        ja: { label: 'Nhật', rows: { modern: [row('  bạn ', 'tớ – cậu')] } }
      }
    })
    expect(preset?.rows.filter((r) => r.relation.trim().toLowerCase() === 'bạn')).toHaveLength(1)
  })

  it('cùng đầu vào cho cùng một kết quả', () => {
    expect(composePreset(select('modern', 'ja', ['court']), tables)).toEqual(
      composePreset(select('modern', 'ja', ['court']), tables)
    )
  })
})

describe('parseRegisterTag', () => {
  it('đọc sáu mã bảng phẳng cũ thành tổ hợp bối cảnh và văn hóa', () => {
    expect(Object.keys(LEGACY_PRESET_ALIASES).sort()).toEqual([
      'en-western',
      'ja-court',
      'ja-fantasy',
      'ja-modern',
      'zh-ancient',
      'zh-modern'
    ])
    expect(parseRegisterTag('Học đường [ja-fantasy]')).toEqual({
      setting: 'fantasy',
      culture: 'ja'
    })
    expect(parseRegisterTag('[zh-ancient]')).toEqual({ setting: 'court', culture: 'zh' })
    expect(parseRegisterTag('[en-western]')).toEqual({ setting: 'fantasy', culture: 'west' })
  })

  it('đọc mã văn hóa-bối cảnh bất kỳ, không phân biệt hoa thường', () => {
    expect(parseRegisterTag('x [KO-modern] y')).toEqual({ setting: 'modern', culture: 'ko' })
    expect(parseRegisterTag('[west-game]')).toEqual({ setting: 'game', culture: 'west' })
  })

  it('mã lạ hoặc thiếu thì trả null, mã hợp lệ đầu tiên thắng', () => {
    expect(parseRegisterTag(null)).toBeNull()
    expect(parseRegisterTag('Fantasy')).toBeNull()
    expect(parseRegisterTag('[ja-unknown] [fr-modern]')).toBeNull()
    expect(parseRegisterTag('[ja-unknown] [ko-court] [ja-modern]')).toEqual({
      setting: 'court',
      culture: 'ko'
    })
  })
})
