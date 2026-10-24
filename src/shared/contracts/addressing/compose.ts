import { PRESET_TABLES } from './presetTables'
import type {
  ComposedPreset,
  CultureId,
  PresetRow,
  PresetTables,
  RegisterSelection,
  SettingId
} from './types'
import { CULTURE_IDS, SETTING_IDS } from './types'

const relationKey = (row: PresetRow): string => row.relation.trim().toLowerCase()

/**
 * Ghép bảng cho một tác phẩm. Với mỗi bối cảnh, theo thứ tự chính rồi phụ: dòng chung, trong đó dòng riêng của
 * văn hóa cùng `relation` thay chỗ dòng chung, rồi các dòng riêng còn lại. Một `relation` chỉ xuất hiện một
 * lần: dòng của bối cảnh đứng trước thắng. Không có bối cảnh chính thì không có bảng (`null`).
 */
export function composePreset(
  selection: RegisterSelection,
  tables: PresetTables = PRESET_TABLES
): ComposedPreset | null {
  if (!selection.setting) return null
  const order: SettingId[] = [selection.setting]
  for (const id of selection.extra) if (!order.includes(id)) order.push(id)
  const culture = selection.culture ? tables.cultures[selection.culture] : null

  const rows: PresetRow[] = []
  const seen = new Set<string>()
  const thirdPerson: string[] = []
  for (const id of order) {
    const setting = tables.settings[id]
    const own = culture?.rows[id] ?? []
    const ownByKey = new Map(own.map((row) => [relationKey(row), row]))
    const commonKeys = new Set(setting.rows.map(relationKey))
    const merged = [
      ...setting.rows.map((row) => ownByKey.get(relationKey(row)) ?? row),
      ...own.filter((row) => !commonKeys.has(relationKey(row)))
    ]
    for (const row of merged) {
      const key = relationKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
    for (const line of [...setting.thirdPerson, ...(culture?.thirdPerson?.[id] ?? [])]) {
      if (!thirdPerson.includes(line)) thirdPerson.push(line)
    }
  }
  return {
    settingLabels: order.map((id) => tables.settings[id].label),
    cultureLabel: culture?.label ?? null,
    rows,
    thirdPerson
  }
}

/** Mã của bảng phẳng cũ và tổ hợp bối cảnh – văn hóa mà nó được hiểu là. */
export const LEGACY_PRESET_ALIASES: Record<string, { setting: SettingId; culture: CultureId }> = {
  'ja-modern': { setting: 'modern', culture: 'ja' },
  'ja-fantasy': { setting: 'fantasy', culture: 'ja' },
  'ja-court': { setting: 'court', culture: 'ja' },
  'zh-modern': { setting: 'modern', culture: 'zh' },
  // Bảng cũ gồm cả tu chân; người dùng muốn bảng tu chân chọn bối cảnh `cultivation`.
  'zh-ancient': { setting: 'court', culture: 'zh' },
  // Bảng cũ trộn fantasy với hiện đại; chọn fantasy vì dòng tước vị và vua chỉ có nghĩa ở đó.
  'en-western': { setting: 'fantasy', culture: 'west' }
}

const TAG = /\[([a-z]+)-([a-z]+)\]/gi

/**
 * Đọc mã tổ hợp viết thẳng trong thể loại: mã bảng cũ (`[ja-modern]`) hoặc `[văn hóa-bối cảnh]` bất kỳ
 * (`[ko-modern]`). Mã đầu tiên hợp lệ thắng; không có thì `null`.
 */
export function parseRegisterTag(
  text: string | null | undefined
): { setting: SettingId; culture: CultureId } | null {
  for (const match of (text ?? '').matchAll(TAG)) {
    const key = `${match[1]}-${match[2]}`.toLowerCase()
    const legacy = LEGACY_PRESET_ALIASES[key]
    if (legacy) return legacy
    const culture = CULTURE_IDS.find((id) => id === match[1].toLowerCase())
    const setting = SETTING_IDS.find((id) => id === match[2].toLowerCase())
    if (culture && setting) return { setting, culture }
  }
  return null
}
