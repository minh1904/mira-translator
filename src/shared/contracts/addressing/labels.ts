import type { CultureId, SettingId } from './types'

/**
 * Nhãn ngắn của bối cảnh và văn hóa cho giao diện, để màn hình chọn không phải kéo cả bảng dữ liệu xưng hô.
 * Test `labels.test.ts` giữ chúng trùng với nhãn trong dữ liệu bảng, vì nhãn đó đi vào prompt.
 */
export const SETTING_LABELS: Record<SettingId, string> = {
  modern: 'Hiện đại, đô thị',
  fantasy: 'Fantasy, quý tộc, isekai',
  court: 'Cung đình, cổ trang',
  cultivation: 'Tiên hiệp, kiếm hiệp',
  game: 'Game, hệ thống, tận thế'
}

export const CULTURE_LABELS: Record<CultureId, string> = {
  ja: 'Nhật',
  ko: 'Hàn',
  zh: 'Trung',
  west: 'Phương Tây'
}
