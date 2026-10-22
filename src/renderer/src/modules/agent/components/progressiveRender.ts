/**
 * Chữ trả lời hiện theo tốc độ từ như VS Code (`getProgressiveRenderRate` trong `chatListRenderer.ts`):
 * số từ hiển thị tăng theo thời gian, tốc độ ước theo tốc độ chữ đến, kẹp 40–2000 từ mỗi giây, 8 khi
 * chưa đo được; khi stream đã xong thì xả phần còn lại với tối thiểu 80 từ mỗi giây.
 */
export const RENDER_RATE = { initial: 8, min: 40, max: 2000, drain: 80 } as const

const WORD = /\S+\s*/g

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0
}

/** The first `words` words of `text`, keeping their spacing and line breaks. */
export function sliceWords(text: string, words: number): string {
  if (words <= 0) return text.slice(0, text.length - text.trimStart().length)
  let seen = 0
  for (const match of text.matchAll(WORD)) {
    seen++
    if (seen === words) return text.slice(0, match.index + match[0].length)
  }
  return text
}

/** Words per second implied by what arrived so far; `initial` before anything can be measured. */
export function estimateRate(arrivedWords: number, elapsedMs: number): number {
  if (arrivedWords === 0 || elapsedMs <= 0) return RENDER_RATE.initial
  const implied = (arrivedWords / elapsedMs) * 1000
  return Math.min(RENDER_RATE.max, Math.max(RENDER_RATE.min, implied))
}

/** How many words to show after `elapsedMs` more milliseconds. */
export function nextWordCount(input: {
  rendered: number
  total: number
  elapsedMs: number
  rate: number
  done: boolean
}): number {
  const rate = input.done ? Math.max(input.rate, RENDER_RATE.drain) : input.rate
  const next = input.rendered + Math.max(1, Math.floor((input.elapsedMs / 1000) * rate))
  return Math.min(input.total, next)
}

/**
 * Text safe to parse while it streams: an open code fence is closed, and a fence opened with no
 * content yet is left out, so an empty code box never flashes.
 */
export function closeOpenFence(text: string): string {
  const fences = text.match(/^[ \t]*```/gm)?.length ?? 0
  if (fences % 2 === 0) return text
  const open = text.lastIndexOf('```')
  const body = text.slice(open + 3).replace(/^[^\n]*\n?/, '')
  if (body.trim() === '') return text.slice(0, open).trimEnd()
  return `${text}${text.endsWith('\n') ? '' : '\n'}\`\`\``
}
