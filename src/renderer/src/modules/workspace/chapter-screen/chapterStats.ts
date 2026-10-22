import type { SessionStatus } from '../chapter-editor/editorSession'

/** Biểu thức chính quy nhận diện từ gồm chuỗi chữ và số; với tiếng Việt tính theo từng âm tiết. */
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/** Thống kê số từ và số ký tự của văn bản; số ký tự không tính các ký tự xuống dòng. */
export function textStats(text: string): { words: number; characters: number } {
  let characters = 0
  for (const char of text) if (char !== '\n' && char !== '\r') characters++
  return { words: text.match(WORD)?.length ?? 0, characters }
}

/** Xác định trạng thái lưu tổng hợp của chương: hiển thị chưa lưu hoặc đang lưu nếu có một bên tương ứng. */
export function combinedSaveLabel(statuses: SessionStatus[]): {
  label: string
  safe: boolean
} {
  if (statuses.some((status) => status.state === 'saving'))
    return { label: 'Đang lưu…', safe: false }
  if (statuses.some((status) => status.state === 'conflict' || status.state === 'error'))
    return { label: 'Lưu lỗi', safe: false }
  if (statuses.some((status) => status.dirty)) return { label: 'Chưa lưu', safe: false }
  return { label: 'Đã lưu', safe: true }
}
