import type { CultureId, SettingId } from './types'

/**
 * Thể loại của tác phẩm là một chuỗi (chip nối bằng dấu phẩy, hoặc chữ người dùng gõ). Chỉ nhóm `setting`
 * tác động tới việc chọn bảng xưng hô; chế độ kể như Xuyên Không không phải bối cảnh (change
 * `add-multilingual-addressing-presets`).
 */
export type GenreGroup = 'setting' | 'narration' | 'relationship' | 'content' | 'other'

export interface GenreChip {
  label: string
  group: GenreGroup
  /** Bối cảnh mà chip này cho biết; chỉ có ở nhóm `setting`. */
  setting?: SettingId
}

export const GENRE_CHIPS: readonly GenreChip[] = [
  { label: 'Tiên Hiệp', group: 'setting', setting: 'cultivation' },
  { label: 'Võ Hiệp', group: 'setting', setting: 'cultivation' },
  { label: 'Huyền Huyễn', group: 'setting', setting: 'cultivation' },
  { label: 'Đô Thị', group: 'setting', setting: 'modern' },
  { label: 'Đời Thường', group: 'setting', setting: 'modern' },
  { label: 'Lịch Sử', group: 'setting', setting: 'court' },
  { label: 'Fantasy', group: 'setting', setting: 'fantasy' },
  { label: 'Isekai', group: 'setting', setting: 'fantasy' },
  { label: 'LitRPG', group: 'setting', setting: 'game' },
  { label: 'Hệ Thống', group: 'setting', setting: 'game' },
  { label: 'Tận Thế', group: 'setting', setting: 'game' },
  { label: 'Xuyên Không', group: 'narration' },
  { label: 'Ngôn Tình', group: 'relationship' },
  { label: 'Đam Mỹ', group: 'relationship' },
  { label: 'Bách Hợp', group: 'relationship' },
  { label: 'Harem', group: 'relationship' },
  { label: '18+', group: 'content' },
  { label: 'Viễn Tưởng', group: 'other' },
  { label: 'Kinh Dị', group: 'other' },
  { label: 'Hành Động', group: 'other' },
  { label: 'Hài Hước', group: 'other' },
  { label: 'Trinh Thám', group: 'other' },
  { label: 'Khác', group: 'other' }
]

/**
 * Từ khóa cho biết bối cảnh trong chữ người dùng gõ tự do (và nhãn chip). Viết thường; có cả tiếng Nhật và
 * Trung vì thể loại trên trang nguồn thường ghi bằng ngôn ngữ gốc. "xuyên không" không có ở đây: đó là chế
 * độ kể, không cho biết bối cảnh.
 */
const SETTING_KEYWORDS: Record<SettingId, readonly string[]> = {
  modern: [
    'hiện đại',
    'đô thị',
    'đời thường',
    'học đường',
    'vườn trường',
    'showbiz',
    'giới giải trí',
    'urban',
    'modern',
    'contemporary',
    'school',
    'romcom',
    'rom-com',
    'slice of life',
    '学園',
    '学校',
    '高校',
    '現代',
    '現実世界',
    'ラブコメ',
    '都市',
    '现代',
    '现言',
    '校园',
    '校園',
    '娱乐圈'
  ],
  fantasy: [
    'dị giới',
    'isekai',
    'fantasy',
    'quý tộc',
    'tiểu thư',
    'hoàng tử',
    'chuyển sinh',
    'ma pháp',
    '異世界',
    'ファンタジー',
    '令嬢',
    '貴族',
    '転生'
  ],
  court: [
    'hậu cung',
    'cung đình',
    'cung đấu',
    'cổ trang',
    'cổ đại',
    'lịch sử',
    'trạch đấu',
    'historical',
    '後宮',
    '宮廷',
    '妃',
    '古代',
    '古言',
    '宫斗',
    '宅斗',
    '历史',
    '歷史'
  ],
  cultivation: [
    'tiên hiệp',
    'kiếm hiệp',
    'võ hiệp',
    'tu tiên',
    'tu chân',
    'huyền huyễn',
    'xianxia',
    'wuxia',
    'xuanhuan',
    'cultivation',
    '仙侠',
    '武侠',
    '玄幻',
    '修仙',
    '修真'
  ],
  game: [
    'litrpg',
    'gamelit',
    'hệ thống',
    'võng du',
    'tận thế',
    'mạt thế',
    'hầm ngục',
    'dungeon',
    'progression'
  ]
}

/** Các bối cảnh mà thể loại cho biết, không lặp, theo thứ tự bối cảnh trong bảng khai báo. */
export function settingsOfGenre(genre: string | null | undefined): SettingId[] {
  const text = (genre ?? '').toLowerCase()
  if (text.trim() === '') return []
  return (Object.keys(SETTING_KEYWORDS) as SettingId[]).filter((id) =>
    SETTING_KEYWORDS[id].some((word) => text.includes(word))
  )
}

// shortcut: chỉ nhận ra văn hóa Trung từ từ khóa tu chân/kiếm hiệp; thêm văn hóa khác khi có tín hiệu từ khóa đủ chắc.
const ZH_CULTURE_WORDS = [
  'tiên hiệp',
  'kiếm hiệp',
  'võ hiệp',
  'tu tiên',
  'tu chân',
  'huyền huyễn',
  'cung đấu',
  'trạch đấu',
  'xianxia',
  'wuxia',
  'xuanhuan',
  'cultivation',
  '仙侠',
  '武侠',
  '玄幻',
  '修仙',
  '修真',
  '宫斗',
  '宅斗'
]

/** Văn hóa mà thể loại cho biết (khi ngôn ngữ nguồn không cho biết, như truyện Trung đọc bản tiếng Anh). */
export function cultureOfGenre(genre: string | null | undefined): CultureId | null {
  const text = (genre ?? '').toLowerCase()
  return ZH_CULTURE_WORDS.some((word) => text.includes(word)) ? 'zh' : null
}

/** Các thể loại ghi trong chuỗi, tách theo dấu phẩy, bỏ phần trống. */
export function splitGenre(genre: string | null | undefined): string[] {
  return (genre ?? '')
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export function genreHasChip(genre: string | null | undefined, label: string): boolean {
  return splitGenre(genre).some((part) => part.toLowerCase() === label.toLowerCase())
}

/**
 * Bật hoặc tắt một chip trong chuỗi thể loại, giữ nguyên phần chữ tự gõ còn lại. Chip tắt đi thì mọi lần xuất
 * hiện của nhãn đó biến mất; chip bật lên thì thêm vào cuối.
 */
export function toggleGenreChip(genre: string | null | undefined, label: string): string {
  const parts = splitGenre(genre)
  const next = genreHasChip(genre, label)
    ? parts.filter((part) => part.toLowerCase() !== label.toLowerCase())
    : [...parts, label]
  return next.join(', ')
}
