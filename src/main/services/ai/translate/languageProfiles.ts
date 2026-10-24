import type { SourceLanguage } from '../../../../shared/contracts/library'
import type { CultureId, SettingId } from '../../../../shared/contracts/addressing/types'
import { cultureOfLanguage } from '../../../../shared/contracts/addressing/resolve'

/**
 * Quy ước mặc định theo ngôn ngữ nguồn và thể loại — tầng thấp nhất của chỉ dẫn dịch.
 *
 * Profile chỉ nói điều đúng cho **cả một loại truyện**: chính sách kính ngữ, lối xưng hô chung, cách
 * viết tên. Cặp xưng hô của từng nhân vật thuộc ma trận xưng hô, thuật ngữ thuộc glossary; cả hai ghi
 * đè profile khi xung đột. Lời lẽ cố ý là **gợi ý theo bối cảnh** chứ không phải bảng ánh xạ cứng
 * (không ép mọi thoại cổ trang thành "ta – ngươi", không coi "tôi – bạn" là trung tính) — xem
 * [nhân vật và xưng hô](../../../../../docs/modules/context/characters-and-addressing.md).
 *
 * Profile phụ thuộc vào tác phẩm, không phụ thuộc lô, nên nằm trong system prompt và giữ nguyên
 * từng ký tự giữa các lô của cùng tác phẩm.
 */

/**
 * Bốn chế độ kính ngữ Nhật theo quyết định ngày 2026-10-04; mặc định **Giữ hậu tố**.
 * `hybrid` và `custom` cần quy tắc của người dịch; thiếu quy tắc thì quay về mặc định.
 */
export const HONORIFIC_MODES = ['keep', 'localize', 'hybrid', 'custom'] as const
export type HonorificMode = (typeof HONORIFIC_MODES)[number]

export interface HonorificPolicy {
  mode: HonorificMode
  /** Quy tắc người dịch viết cho `hybrid`/`custom`. */
  rules?: string
}

export const DEFAULT_HONORIFICS: HonorificPolicy = { mode: 'keep' }

/** Nhóm thể loại đủ khác nhau để đổi lối xưng hô. Hiện chỉ có ý nghĩa với nguồn tiếng Trung. */
export type GenreFamily = 'historical' | 'modern' | 'unknown'

const HISTORICAL = [
  'cổ trang',
  'cổ đại',
  'tiên hiệp',
  'kiếm hiệp',
  'võ hiệp',
  'huyền huyễn',
  'tu tiên',
  'tu chân',
  'cung đấu',
  'trạch đấu',
  'lịch sử',
  'xianxia',
  'wuxia',
  'xuanhuan',
  'cultivation',
  'historical',
  '古代',
  '古言',
  '仙侠',
  '武侠',
  '玄幻',
  '修仙',
  '修真',
  '宫斗',
  '宅斗',
  '历史',
  '歷史'
]
const MODERN = [
  'hiện đại',
  'đô thị',
  'học đường',
  'vườn trường',
  'showbiz',
  'giới giải trí',
  'urban',
  'modern',
  'contemporary',
  'school',
  '都市',
  '现代',
  '現代',
  '现言',
  '校园',
  '校園',
  '娱乐圈'
]

/**
 * Suy nhóm thể loại từ trường `genre` người dùng gõ tự do. Không chắc thì `unknown` — profile chung
 * để model tự đọc bối cảnh còn hơn ép sai lối xưng hô cho nửa số truyện.
 */
export function genreFamily(genre: string | null | undefined): GenreFamily {
  const text = (genre ?? '').toLowerCase()
  if (text.trim() === '') return 'unknown'
  const historical = HISTORICAL.some((word) => text.includes(word))
  const modern = MODERN.some((word) => text.includes(word))
  if (historical === modern) return 'unknown'
  return historical ? 'historical' : 'modern'
}

export interface LanguageProfileInput {
  sourceLang?: SourceLanguage | string
  genre?: string | null
  /**
   * Chính sách kính ngữ của tác phẩm. Vắng thì tiếng Nhật giữ hậu tố (quyết định 2026-10-04) còn tiếng Hàn
   * Việt hóa; chỉ `keep` nói rõ mới giữ hậu tố Hàn.
   */
  honorifics?: HonorificPolicy
  /** Văn hóa gốc của câu chuyện; vắng thì theo ngôn ngữ nguồn. */
  culture?: CultureId | null
  /** Bối cảnh chính; chọn lối xưng hô cổ phong hay hiện đại của truyện Trung khi thể loại không nói rõ. */
  setting?: SettingId | null
}

const LANGUAGE_NAME: Record<string, string> = {
  ja: 'tiếng Nhật',
  'zh-Hans': 'tiếng Trung',
  'zh-Hant': 'tiếng Trung',
  en: 'tiếng Anh',
  ko: 'tiếng Hàn'
}

export function languageName(sourceLang?: string): string {
  return (sourceLang && LANGUAGE_NAME[sourceLang]) || 'ngôn ngữ nguồn'
}

function honorificLines(policy: HonorificPolicy): string[] {
  const rules = policy.rules?.trim() ?? ''
  if ((policy.mode === 'hybrid' || policy.mode === 'custom') && rules !== '') {
    return ['- Kính ngữ theo quy tắc của người dịch:', rules]
  }
  if (policy.mode === 'localize') {
    return [
      '- Việt hóa kính ngữ gắn sau tên (-san, -kun, -chan, -sama…) thành cách gọi tiếng Việt theo vai và quan hệ; không giữ hậu tố Nhật.',
      '- Khi bản gốc đổi cách gọi một người (A-san thành A, A-sama thành A-san), đổi cách gọi tiếng Việt tương ứng để giữ thay đổi đó.'
    ]
  }
  return [
    '- Giữ hậu tố gắn sau tên (-san, -kun, -chan, -sama…) đúng như bản gốc; không tự thêm hậu tố không có trong bản gốc.',
    '- Không ghép thêm danh xưng tiếng Việt thành dạng lai như "chị A-san".',
    '- Chức danh hay quan hệ đứng riêng (sensei, senpai…) dịch theo vai trong cảnh.',
    '- Hậu tố chỉ gắn sau tên riêng. Danh hiệu, chức danh kèm 様 (剣聖様, 聖女様) dịch thành "ngài Kiếm Thánh", "Thánh nữ đại nhân"…, không viết dạng lai "Kiếm Thánh-sama".'
  ]
}

function japanese(policy: HonorificPolicy): string[] {
  return [
    ...honorificLines(policy),
    '- Bản gốc hay lược chủ ngữ: chỉ thêm đại từ khi câu tiếng Việt cần, và suy người nói từ mạch truyện, không suy từ một chữ.',
    '- Thể lịch sự (です/ます) là lịch sự trung tính, không phải kính ngữ với bề trên: thể hiện bằng lời lẽ nhã nhặn (xin, vâng, cảm ơn). Chỉ thêm "ạ" khi người nói xưng em, cháu, con với người trên, hoặc người phục vụ, thuộc hạ nói với khách, chủ; nhiều nhất một "ạ" mỗi lượt thoại; không dùng khi quát, can ngăn hay nói với kẻ địch.',
    '- 私たち, 僕たち, 俺たち là "chúng tôi", "bọn tôi" khi không gồm người nghe; "chúng ta" chỉ khi gồm cả người nghe.',
    '- Trợ từ sắc thái phải hiện ra trong câu: なんて (chẳng qua chỉ là, cái việc… mà), すら/さえ (ngay cả, đến cả), すでに (đã… từ lúc nào), ぜひ (nhất định), …だろうか (liệu… không), …ものだ (thường hay).',
    '- Cách tự xưng (僕, 俺, 私, わたくし…) và đuôi câu đặc trưng (～のじゃ, ～ですわ, ～っす) là giọng của nhân vật: giữ khác biệt đó bằng cách chọn từ và tiểu từ tiếng Việt nhất quán, không làm phẳng.',
    '- Từ tượng thanh, tượng hình dịch bằng từ láy hoặc động từ tiếng Việt (ドキドキ → thình thịch); không phiên âm romaji.',
    '- Từ Hán của tiếng Nhật không mặc nhiên cùng nghĩa với từ Hán Việt (緊張 là căng thẳng, 勉強 là học, 大丈夫 là ổn).',
    '- Dùng dấu câu tiếng Việt thay cho 、。！？. Lời thoại 「…」 viết thành “…”, trích dẫn lồng 『…』 thành ‘…’; 『…』 đứng riêng (lời nhớ lại, lời trích) cũng viết ‘…’ để không lẫn với thoại đang diễn ra; giữ một kiểu cho cả chương.'
  ]
}

const ZH_COMMON_LANGUAGE = [
  '- Không gán 你 hay 您 vào một cặp đại từ tiếng Việt cố định; chọn theo quan hệ giữa người nói và người nghe.',
  '- 咱们 luôn gồm người nghe ("chúng ta"); 我们 có thể không gồm ("chúng tôi", "bọn ta"): xét theo cảnh.'
]
const ZH_HAN_VIET_ADDRESS =
  '- Tự xưng theo thân phận (本座, 本王, 本宫, 老夫, 贫道, 在下, 朕…) giữ dạng Hán Việt (bổn tọa, bổn vương, lão phu, tại hạ, trẫm…); chỉ 我/你 trơn mới chọn theo quan hệ.'
const ZH_HAN_VIET_TERMS =
  '- Giữ Hán Việt cho tên, danh xưng, thuật ngữ và từ cổ hợp bối cảnh; lời kể dùng từ thông dụng khi có (im lặng thay trầm mặc, hóa ra thay nguyên lai). Thành ngữ: ưu tiên thành ngữ tiếng Việt tương đương, rồi dạng Hán Việt đã quen, cuối cùng mới dịch nghĩa.'
const ZH_TAIL_LANGUAGE = [
  '- Không giữ dấu vết trật tự câu tiếng Trung: 把 không thành "đem… ra", 向 không thành "hướng", 是不是 không thành "có phải… hay không", 几分 không thành "vài phần".',
  '- Tên người nước ngoài hay tên Nhật viết bằng chữ Hán (约翰, 山本) trả về dạng gốc (John, Yamamoto).'
]

/** Lối xưng hô và cách viết tên của văn hóa Trung theo nhóm thể loại; không phụ thuộc văn bản là chữ Hán. */
function chineseFamilyLines(family: GenreFamily): string[] {
  if (family === 'historical') {
    return [
      '- Tên người, địa danh, công pháp, cảnh giới dùng âm Hán Việt.',
      '- Xưng hô theo bối cảnh cổ đại và vai vế: với bề trên, trưởng bối, đồng môn, kẻ thù mỗi cặp một khác; không ép mọi lời thoại thành "ta – ngươi".'
    ]
  }
  if (family === 'modern') {
    return [
      '- Tên người dùng âm Hán Việt.',
      '- Xưng hô theo lối nói hiện đại (anh – em, tôi – cậu, mày – tao… tùy quan hệ); không dùng lối cổ phong như ta – ngươi, huynh – đệ trừ khi nhân vật cố ý nói vậy.',
      '- Không đổi cặp xưng hô để báo trước diễn biến tình cảm sớm hơn bản gốc.'
    ]
  }
  return [
    '- Tên người, địa danh dùng âm Hán Việt.',
    '- Chọn lối xưng hô cổ phong hay hiện đại theo bối cảnh của truyện và giữ một lối cho cả chương.'
  ]
}

function chinese(family: GenreFamily): string[] {
  return [
    ...chineseFamilyLines(family),
    ...ZH_COMMON_LANGUAGE,
    ZH_HAN_VIET_ADDRESS,
    ZH_HAN_VIET_TERMS,
    ...ZH_TAIL_LANGUAGE
  ]
}

/** Phần của văn hóa Trung còn đúng khi văn bản không phải tiếng Trung (bản tiếng Anh của truyện Trung). */
function chineseCulture(family: GenreFamily): string[] {
  return [...chineseFamilyLines(family), ZH_HAN_VIET_ADDRESS, ZH_HAN_VIET_TERMS]
}

/** Nhóm thể loại của truyện Trung: bối cảnh đã chọn thắng việc đoán từ chữ của thể loại. */
function chineseFamily(input: LanguageProfileInput): GenreFamily {
  if (input.setting === 'court' || input.setting === 'cultivation') return 'historical'
  if (input.setting === 'modern') return 'modern'
  return genreFamily(input.genre)
}

function english(latinNames = true): string[] {
  return [
    '- I/you không cho biết quan hệ: chọn cặp xưng hô tiếng Việt theo tuổi, vai vế và độ thân giữa hai người, rồi giữ nguyên cặp đó khi quan hệ chưa đổi.',
    ...(latinNames ? ['- Tên riêng giữ dạng chữ Latinh của bản gốc.'] : []),
    '- he/she/his/her dày đặc trong bản gốc: lược khi đã rõ, gọi tên khi hai nhân vật cùng giới, không lặp "anh ta/cô ta"; bỏ đại từ sở hữu khi đã rõ của ai.',
    '- Câu bị động chuyển sang chủ động khi tự nhiên hơn. Câu dẫn "he said" được lược khi đã rõ người nói hoặc đưa lên trước lời thoại; không thay bằng động từ thêm nghĩa.',
    '- "love", "darling", "mate" kiểu Anh có thể chỉ là cách gọi thân, không mặc nhiên là tín hiệu yêu hay bạn thân.'
  ]
}

/**
 * Kính ngữ Hàn. Khác tiếng Nhật, mặc định là Việt hóa (`-ssi`, `오빠`/`형` theo vai); chỉ `keep` nói rõ mới giữ
 * hậu tố và danh xưng thân tộc.
 */
function koreanHonorifics(policy?: HonorificPolicy): string[] {
  const rules = policy?.rules?.trim() ?? ''
  if ((policy?.mode === 'hybrid' || policy?.mode === 'custom') && rules !== '') {
    return ['- Kính ngữ theo quy tắc của người dịch:', rules]
  }
  if (policy?.mode === 'keep') {
    return [
      '- Giữ hậu tố và danh xưng thân tộc Hàn (oppa, hyung, noona, unnie, sunbae, -nim, -ssi) đúng như bản gốc; không tự thêm hậu tố không có trong bản gốc.',
      '- Không ghép thêm danh xưng tiếng Việt thành dạng lai như "anh Min-su-ssi".'
    ]
  }
  return [
    '- Việt hóa hậu tố gắn sau tên: 씨 thành gọi tên (kèm "anh/chị" khi quan hệ đã rõ), 님 thành "ạ", "thưa" hoặc chức danh; không viết dạng lai như "anh Min-su-ssi".',
    '- 오빠, 형, 누나, 언니 dịch theo vai và giới của người nói thành cặp em – anh/chị, không biến thành "tôi – anh". 선배 xếp theo thâm niên, không theo tuổi: gọi trống dịch "tiền bối", chỉ dịch "anh/chị" khi biết người đó lớn tuổi hơn. 형님 cần biết giới tính người nói.',
    '- Chức danh làm cách gọi (팀장님, 사장님, 회장님) giữ chức danh thay đại từ ("trưởng nhóm Kim", "giám đốc"), không ghép "-nim".'
  ]
}

function korean(policy?: HonorificPolicy): string[] {
  return [
    ...koreanHonorifics(policy),
    '- Đuôi câu lịch sự (-요, -습니다) thể hiện bằng tiểu từ và lời lẽ tiếng Việt (ạ, dạ, thưa…), không tự đổi sang một cặp đại từ khác; 너 hay 당신 không tự quyết định cặp xưng hô, quan hệ mới quyết định.',
    '- Chuyển từ kính ngữ sang nói trống (반말) là mốc quan hệ: đổi cặp đúng tại mốc đó; nói trống khi chưa được phép thì thể hiện độ lạnh hay hỗn bằng lời lẽ.',
    '- Tên người Hàn viết Latinh (Kim Dok-ja, Sung Jin-woo) trừ khi glossary ghi khác; không tự đọc theo Hán Việt.',
    '- Cửa sổ hệ thống trong [ ] hoặc 【 】 giữ nguyên khung và con số, văn trung tính. Từ tượng thanh dịch sang tiếng Việt (쾅 → rầm).',
    '- Tên bị nhắc lặp ở các câu liền nhau thì lược hoặc thay bằng đại từ ngôi ba đã chọn.'
  ]
}

/** Quy ước kính ngữ và xưng hô của một văn hóa gốc, không kể văn bản viết bằng ngôn ngữ nào. */
function cultureProfile(input: LanguageProfileInput, culture: CultureId): string[] {
  switch (culture) {
    case 'ja':
      return honorificLines(input.honorifics ?? DEFAULT_HONORIFICS)
    case 'ko':
      return koreanHonorifics(input.honorifics)
    case 'zh':
      return chineseCulture(chineseFamily(input))
    default:
      return []
  }
}

/**
 * Các dòng quy ước của tác phẩm; mảng rỗng khi ngôn ngữ không có profile. Văn hóa gốc quyết định kính ngữ và
 * xưng hô, ngôn ngữ nguồn quyết định phần nói về chính ngôn ngữ đó. Hai thứ trùng nhau (truyện Nhật viết
 * tiếng Nhật) thì ra đúng profile của ngôn ngữ đó. Văn hóa khác ngôn ngữ chỉ ghép được với văn bản tiếng Anh
 * (bản dịch Anh của truyện Á), nên các ngôn ngữ khác quay về profile của chính chúng.
 */
export function languageProfile(input: LanguageProfileInput): string[] {
  const own = cultureOfLanguage(input.sourceLang)
  const culture = input.culture ?? own
  if (input.sourceLang === 'en' && culture !== null && culture !== 'west') {
    return [...cultureProfile(input, culture), ...english(culture !== 'zh')]
  }
  switch (input.sourceLang) {
    case 'ja':
      return japanese(input.honorifics ?? DEFAULT_HONORIFICS)
    case 'zh-Hans':
    case 'zh-Hant':
      return chinese(chineseFamily(input))
    case 'en':
      return english()
    case 'ko':
      return korean(input.honorifics)
    default:
      return []
  }
}
