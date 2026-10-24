/**
 * Bảng gợi ý xưng hô theo hai trục (change `add-multilingual-addressing-presets`): **bối cảnh** của truyện
 * và **văn hóa gốc** của câu chuyện. Văn hóa gốc không phải ngôn ngữ văn bản: bản tiếng Anh của truyện Nhật
 * vẫn mang văn hóa `ja`. Thêm một bối cảnh hay một văn hóa là thêm dữ liệu, không sửa chỗ ghép.
 */

export const SETTING_IDS = ['modern', 'fantasy', 'court', 'cultivation', 'game'] as const
export type SettingId = (typeof SETTING_IDS)[number]

export const CULTURE_IDS = ['ja', 'ko', 'zh', 'west'] as const
export type CultureId = (typeof CULTURE_IDS)[number]

/** Độ tin cậy của một dòng: `high` có nguồn hoặc quyết định đã chốt, `low` là suy từ kiến thức, chưa đo. */
export type RowConfidence = 'high' | 'medium' | 'low'

export interface PresetRow {
  /** Loại quan hệ, viết theo chiều A → B. Hai dòng cùng `relation` (sau khi chuẩn hóa) là một dòng. */
  relation: string
  /** Tín hiệu trong bản gốc nhận ra quan hệ hoặc mức thô. */
  signals?: string
  /** A tự xưng – A gọi B. Mỗi ô chỉ một cặp. */
  forward: string
  /** B tự xưng – B gọi A, khi khác chiều thuận. */
  backward?: string
  notes?: string
  confidence: RowConfidence
}

/** Dòng chung của một bối cảnh: áp cho mọi văn hóa. */
export interface SettingData {
  label: string
  rows: PresetRow[]
  /** Cách người kể gọi nhân vật ở ngôi ba. */
  thirdPerson: string[]
}

/** Phần riêng của một văn hóa: dòng riêng cho từng bối cảnh mà văn hóa đó có mặt. */
export interface CultureData {
  label: string
  rows: Partial<Record<SettingId, PresetRow[]>>
  thirdPerson?: Partial<Record<SettingId, string[]>>
}

export interface PresetTables {
  settings: Record<SettingId, SettingData>
  cultures: Record<CultureId, CultureData>
}

/** Lựa chọn đã quyết cho một tác phẩm; mỗi giá trị có thể chưa có. */
export interface RegisterSelection {
  /** Bối cảnh chính. */
  setting: SettingId | null
  /** Bối cảnh phụ, theo thứ tự ghép. Chỉ có nghĩa khi có bối cảnh chính. */
  extra: SettingId[]
  culture: CultureId | null
}

export interface ComposedPreset {
  settingLabels: string[]
  cultureLabel: string | null
  rows: PresetRow[]
  thirdPerson: string[]
}
