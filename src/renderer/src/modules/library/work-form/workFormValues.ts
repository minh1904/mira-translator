import type { CultureId, SettingId } from '../../../../../shared/contracts/addressing/types'
import type {
  SourceLanguage,
  WorkPatch,
  WorkSetting
} from '../../../../../shared/contracts/library'

export interface WorkFormValues {
  title: string
  sourceLang: SourceLanguage
  originalTitle: string
  author: string
  genre: string
  /** Bối cảnh chính: '' là tự suy theo thể loại, 'none' là không dùng bảng xưng hô. */
  setting: WorkSetting | ''
  settingsExtra: SettingId[]
  /** Văn hóa gốc của câu chuyện; '' là tự suy theo ngôn ngữ gốc. */
  culture: CultureId | ''
  description: string
  /** Ảnh bìa dưới dạng data URL JPEG, hoặc null nếu không có. */
  cover: string | null
}

export const emptyWorkForm: WorkFormValues = {
  title: '',
  sourceLang: 'zh-Hans',
  originalTitle: '',
  author: '',
  genre: '',
  setting: '',
  settingsExtra: [],
  culture: '',
  description: '',
  cover: null
}

/** Chỉ gửi các trường có thay đổi; trường tùy chọn bị xóa trắng sẽ gửi giá trị `null` để xóa trong cơ sở dữ liệu. */
export function buildPatch(before: WorkFormValues, after: WorkFormValues): WorkPatch {
  const patch: WorkPatch = {}
  if (after.title !== before.title) patch.title = after.title
  const optional = ['originalTitle', 'author', 'genre', 'description'] as const
  for (const key of optional) {
    if (after[key] === before[key]) continue
    patch[key] = after[key].trim() === '' ? null : after[key]
  }
  if (after.setting !== before.setting) patch.setting = after.setting === '' ? null : after.setting
  if (after.settingsExtra.join(',') !== before.settingsExtra.join(',')) {
    patch.settingsExtra = after.settingsExtra
  }
  if (after.culture !== before.culture) patch.culture = after.culture === '' ? null : after.culture
  if (after.cover !== before.cover) patch.cover = after.cover
  return patch
}
