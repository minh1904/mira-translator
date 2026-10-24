import { parseRegisterTag } from './compose'
import { cultureOfGenre, settingsOfGenre } from './genres'
import type { CultureId, RegisterSelection, SettingId } from './types'

export interface RegisterInput {
  sourceLang?: string | null
  genre?: string | null
  /** Lựa chọn đã lưu của người dùng; `'none'` là không dùng bảng, null là chưa chọn. */
  setting?: SettingId | 'none' | null
  settingsExtra?: readonly SettingId[]
  culture?: CultureId | null
}

/** Văn hóa mặc định theo ngôn ngữ nguồn. Tiếng Anh không có: văn bản tiếng Anh có thể mang văn hóa bất kỳ. */
export function cultureOfLanguage(sourceLang: string | null | undefined): CultureId | null {
  switch (sourceLang) {
    case 'ja':
      return 'ja'
    case 'ko':
      return 'ko'
    case 'zh-Hans':
    case 'zh-Hant':
      return 'zh'
    default:
      return null
  }
}

/**
 * Quyết định bối cảnh và văn hóa của một tác phẩm. Thứ tự: mã tổ hợp trong thể loại (`[ja-modern]`) >
 * lựa chọn đã lưu > suy từ thể loại (chỉ khi thể loại cho đúng một bối cảnh) > không có. Văn hóa: mã trong thể
 * loại > đã lưu > từ khóa của thể loại > theo ngôn ngữ nguồn. `'none'` đã lưu tắt bảng nhưng văn hóa vẫn có,
 * vì văn hóa còn điều khiển quy ước kính ngữ.
 */
export function resolveRegister(input: RegisterInput): RegisterSelection {
  const tag = parseRegisterTag(input.genre)
  if (tag) return { setting: tag.setting, extra: [], culture: tag.culture }

  const culture =
    input.culture ?? cultureOfGenre(input.genre) ?? cultureOfLanguage(input.sourceLang)

  if (input.setting === 'none') return { setting: null, extra: [], culture }
  if (input.setting) {
    const extra = (input.settingsExtra ?? []).filter(
      (id, index, all) => id !== input.setting && all.indexOf(id) === index
    )
    return { setting: input.setting, extra, culture }
  }

  // Nhiều bối cảnh khác nhau trong thể loại (Đô Thị cùng Fantasy) là mâu thuẫn: không đoán.
  const inferred = settingsOfGenre(input.genre)
  return { setting: inferred.length === 1 ? inferred[0] : null, extra: [], culture }
}
