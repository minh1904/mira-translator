import * as v from 'valibot'
import { CULTURE_IDS, SETTING_IDS, type CultureId, type SettingId } from './addressing/types'
import type { ErrorCode } from './result'

export const BUILTIN_SOURCE_LANGUAGES = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const
/** Danh sách ngôn ngữ nguồn cài sẵn. */
export const SOURCE_LANGUAGES = BUILTIN_SOURCE_LANGUAGES
export type BuiltinSourceLanguage = (typeof BUILTIN_SOURCE_LANGUAGES)[number]

const GRANDFATHERED_LANGUAGE_TAGS = new Set([
  'art-lojban',
  'cel-gaulish',
  'en-gb-oed',
  'i-ami',
  'i-bnn',
  'i-default',
  'i-enochian',
  'i-hak',
  'i-klingon',
  'i-lux',
  'i-mingo',
  'i-navajo',
  'i-pwn',
  'i-tao',
  'i-tay',
  'i-tsu',
  'no-bok',
  'no-nyn',
  'sgn-be-fr',
  'sgn-be-nl',
  'sgn-ch-de',
  'zh-guoyu',
  'zh-hakka',
  'zh-min',
  'zh-min-nan',
  'zh-xiang'
])

/** Xác thực thẻ ngôn ngữ BCP-47 hợp lệ theo chuẩn ECMA-402. */
export function isLanguageTag(value: string): boolean {
  if (value.length === 0 || value.length > 255 || value.includes('_')) return false
  const lower = value.toLowerCase()
  if (GRANDFATHERED_LANGUAGE_TAGS.has(lower)) return true
  if (/^x(?:-[a-z0-9]{1,8})+$/i.test(value)) return true
  try {
    Intl.getCanonicalLocales(value)
    return true
  } catch {
    return false
  }
}

export const sourceLanguageSchema = v.pipe(
  v.string('Ngôn ngữ nguồn phải là chữ.'),
  v.check(isLanguageTag, 'Ngôn ngữ nguồn phải là thẻ BCP-47 hợp lệ.')
)
export type SourceLanguage = v.InferOutput<typeof sourceLanguageSchema>

export interface BuiltinLanguageProfile {
  id: BuiltinSourceLanguage
  locale: string
}

const BUILTIN_LANGUAGE_PROFILES: Record<BuiltinSourceLanguage, BuiltinLanguageProfile> = {
  en: { id: 'en', locale: 'en' },
  'zh-Hans': { id: 'zh-Hans', locale: 'zh-Hans' },
  'zh-Hant': { id: 'zh-Hant', locale: 'zh-Hant' },
  ja: { id: 'ja', locale: 'ja' },
  ko: { id: 'ko', locale: 'ko' }
}

/** Trả về hồ sơ ngôn ngữ mặc định nếu thẻ ngôn ngữ nằm trong danh sách cài sẵn. */
export function builtinLanguageProfile(tag: string): BuiltinLanguageProfile | null {
  return BUILTIN_LANGUAGE_PROFILES[tag as BuiltinSourceLanguage] ?? null
}

export const WORK_STATUSES = ['not-started', 'in-progress', 'paused'] as const
export type WorkStatus = (typeof WORK_STATUSES)[number]

export const TITLE_MAX = 200

/** Ảnh bìa được renderer chuẩn hóa sang JPEG và được main process kiểm tra lại. */
export const COVER_MAX_BYTES = 1024 * 1024
export const COVER_DATA_URL_PREFIX = 'data:image/jpeg;base64,'
export const DESCRIPTION_MAX = 2000

export interface ChapterSummary {
  id: string
  /** Vị trí 1-indexed tính theo thứ tự sắp xếp, không lưu vào kho. */
  number: number
  title: string
}

/** Lựa chọn bối cảnh chính của người dùng, gồm cả "không dùng bảng". */
export type WorkSetting = SettingId | 'none'

export interface WorkSummary {
  id: string
  title: string
  originalTitle: string | null
  description: string | null
  author: string | null
  /** Thể loại văn bản (ví dụ "Tiên hiệp, cổ đại"), dùng làm ngữ cảnh cho model dịch. */
  genre: string | null
  /** Bối cảnh chính của truyện; `'none'` là người dùng chọn không dùng bảng xưng hô; null là chưa chọn. */
  setting: WorkSetting | null
  /** Bối cảnh phụ theo thứ tự ghép; luôn rỗng khi `setting` là null hoặc `'none'`. */
  settingsExtra: SettingId[]
  /** Văn hóa gốc của câu chuyện (không phải ngôn ngữ văn bản); null là chưa chọn. */
  culture: CultureId | null
  /** Thay đổi mỗi khi ảnh bìa được cập nhật; null khi không có ảnh bìa. Dùng làm cache key. */
  coverVersion: number | null
  sourceLang: SourceLanguage
  status: WorkStatus
  archived: boolean
  chapterCount: number
  lastChapter: ChapterSummary | null
  /** Thời điểm tạo/cập nhật (mili-giây epoch, UTC). */
  createdAt: number
  updatedAt: number
}

/** Thông tin về tệp tác phẩm không thể mở; các tác phẩm khác trong thư viện vẫn hoạt động bình thường. */
export interface WorkProblem {
  fileName: string
  code: ErrorCode
  message: string
}

export interface WorkList {
  works: WorkSummary[]
  problems: WorkProblem[]
}

const title = v.pipe(
  v.string('Tên tác phẩm phải là chữ.'),
  v.trim(),
  v.minLength(1, 'Nhập tên tác phẩm.'),
  v.maxLength(TITLE_MAX, 'Tên tác phẩm tối đa ' + TITLE_MAX + ' ký tự.')
)

const optionalTitle = v.pipe(
  v.string('Tên gốc phải là chữ.'),
  v.trim(),
  v.maxLength(TITLE_MAX, 'Tên gốc tối đa ' + TITLE_MAX + ' ký tự.')
)

const author = v.pipe(
  v.string('Tác giả phải là chữ.'),
  v.trim(),
  v.maxLength(TITLE_MAX, 'Tác giả tối đa ' + TITLE_MAX + ' ký tự.')
)

const genre = v.pipe(
  v.string('Thể loại phải là chữ.'),
  v.trim(),
  v.maxLength(TITLE_MAX, 'Thể loại tối đa ' + TITLE_MAX + ' ký tự.')
)

const setting = v.picklist([...SETTING_IDS, 'none'], 'Bối cảnh không hợp lệ.')
const settingsExtra = v.pipe(
  v.array(v.picklist(SETTING_IDS, 'Bối cảnh phụ không hợp lệ.')),
  v.maxLength(SETTING_IDS.length, 'Quá nhiều bối cảnh phụ.')
)
const culture = v.picklist(CULTURE_IDS, 'Văn hóa không hợp lệ.')

const description = v.pipe(
  v.string('Mô tả phải là chữ.'),
  v.trim(),
  v.maxLength(DESCRIPTION_MAX, 'Mô tả tối đa ' + DESCRIPTION_MAX + ' ký tự.')
)

// Chuỗi base64 tăng kích thước khoảng 4/3; giới hạn byte chính xác được kiểm tra lại sau khi giải mã.
const cover = v.pipe(
  v.string('Ảnh bìa không hợp lệ.'),
  v.startsWith(COVER_DATA_URL_PREFIX, 'Ảnh bìa phải là ảnh JPEG.'),
  v.maxLength(
    COVER_DATA_URL_PREFIX.length + Math.ceil((COVER_MAX_BYTES * 4) / 3) + 4,
    'Ảnh bìa quá lớn.'
  )
)

const sourceLang = sourceLanguageSchema
const status = v.picklist(WORK_STATUSES, 'Trạng thái không hợp lệ.')
export const idSchema = v.pipe(v.string('ID phải là chữ.'), v.uuid('ID không hợp lệ.'))

export const createWorkSchema = v.strictObject({
  title,
  sourceLang,
  originalTitle: v.optional(optionalTitle),
  author: v.optional(author),
  genre: v.optional(genre),
  setting: v.optional(setting),
  settingsExtra: v.optional(settingsExtra),
  culture: v.optional(culture),
  description: v.optional(description),
  cover: v.optional(cover)
})
export type CreateWorkInput = v.InferInput<typeof createWorkSchema>

/**
 * `null` để xóa một trường văn bản tùy chọn hoặc xóa ảnh bìa; trường vắng mặt sẽ giữ nguyên giá trị cũ.
 * Ảnh bìa được truyền cùng bản vá để lưu nguyên tử cùng với thông tin tác phẩm.
 */
export const workPatchSchema = v.strictObject({
  title: v.optional(title),
  originalTitle: v.optional(v.nullable(optionalTitle)),
  author: v.optional(v.nullable(author)),
  genre: v.optional(v.nullable(genre)),
  setting: v.optional(v.nullable(setting)),
  settingsExtra: v.optional(settingsExtra),
  culture: v.optional(v.nullable(culture)),
  description: v.optional(v.nullable(description)),
  status: v.optional(status),
  archived: v.optional(v.boolean('Giá trị lưu trữ phải là đúng/sai.')),
  cover: v.optional(v.nullable(cover))
})
export type WorkPatch = v.InferInput<typeof workPatchSchema>

export const getWorkSchema = v.strictObject({ id: idSchema })
export const setCoverSchema = v.strictObject({ id: idSchema, cover: v.nullable(cover) })
export const updateWorkSchema = v.strictObject({ id: idSchema, patch: workPatchSchema })
export type UpdateWorkInput = v.InferInput<typeof updateWorkSchema>
