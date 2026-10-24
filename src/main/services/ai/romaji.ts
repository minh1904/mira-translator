import type { WorkConventionValue } from '../../../shared/contracts/contextQuestions'

/**
 * Kana → romaji for Japanese names (change `add-context-questions`), in the three styles a work can
 * choose: Hepburn with macrons (Ryōta), plain Hepburn (Ryota), and the `ou` style (Ryouta). Pure and
 * deterministic, so names can be written again when the work changes style.
 */
export type RomanizationStyle = WorkConventionValue<'ja_romanization'>

const BASE: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'i',
  ゑ: 'e',
  を: 'o',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o'
}
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' }
const MACRON: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' }

const toHiragana = (text: string): string =>
  text.replace(/[ァ-ヶ]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))

/**
 * One romaji chunk per kana unit (a mora, or a long mark merged into the one before), so the places of
 * the spaces in an existing translation can be carried over. `null` when a character has no reading.
 */
export function romajiChunks(kana: string, style: RomanizationStyle): string[] | null {
  const text = toHiragana(kana)
  const out: string[] = []
  let geminate = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === 'っ') {
      geminate = true
      continue
    }
    if (ch === 'ー') {
      const previous = out.at(-1)
      if (!previous) return null
      const vowel = previous.at(-1)!
      out[out.length - 1] =
        style === 'hepburn_macron' ? previous.slice(0, -1) + (MACRON[vowel] ?? vowel) : previous
      if (style === 'wapuro') out[out.length - 1] = previous + vowel
      continue
    }
    let unit = BASE[ch]
    if (unit === undefined) return null
    const small = text[i + 1]
    if (small && YOON[small] && /i$/u.test(unit) && unit !== 'i') {
      // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja
      unit = /^(sh|ch|j)i$/u.test(unit)
        ? unit.slice(0, -1) + YOON[small]
        : unit.slice(0, -1) + 'y' + YOON[small]
      i++
    }
    if (geminate) {
      unit = (unit.startsWith('ch') ? 't' : unit[0]) + unit
      geminate = false
    }
    // Long vowels: おう, おお, うう, ああ (えい and いい stay as they are in Hepburn).
    const previous = out.at(-1)
    const last = previous?.at(-1)
    if (
      previous &&
      style !== 'wapuro' &&
      ((last === 'o' && (unit === 'u' || unit === 'o')) ||
        (last === 'u' && unit === 'u') ||
        (last === 'a' && unit === 'a'))
    ) {
      out[out.length - 1] =
        style === 'hepburn_macron' ? previous.slice(0, -1) + MACRON[last]! : previous
      out.push('')
      continue
    }
    out.push(unit)
  }
  return out
}

const normalize = (text: string): string => text.toLocaleLowerCase('en').replace(/[\s'-]/gu, '')

/**
 * The name written again in `to`, when `target` is exactly how `from` writes `reading` (ignoring case and
 * spaces); keeps the target's spaces at the same places. `null` when the target was written otherwise.
 */
export function restyleName(
  reading: string,
  target: string,
  from: RomanizationStyle,
  to: RomanizationStyle
): string | null {
  const parts = reading.split(/[\s・＝]+/u).filter(Boolean)
  const oldChunks = parts.map((part) => romajiChunks(part, from))
  const newChunks = parts.map((part) => romajiChunks(part, to))
  if (oldChunks.some((c) => !c) || newChunks.some((c) => !c)) return null
  const old = oldChunks.flat() as string[]
  const fresh = newChunks.flat() as string[]
  if (normalize(old.join('')) !== normalize(target)) return null
  // Each space of the target falls after some number of whole chunks; the new name keeps it there.
  const breaks = new Set<number>()
  let written = 0
  for (const ch of target) {
    if (!/\s/u.test(ch)) {
      if (!/['-]/u.test(ch)) written++
      continue
    }
    let sum = 0
    let k = 0
    while (k < old.length && sum + old[k]!.length <= written) sum += old[k++]!.length
    breaks.add(k)
  }
  let text = ''
  fresh.forEach((piece, k) => {
    if (breaks.has(k)) text += ' '
    text += piece
  })
  return text
    .trim()
    .split(/\s+/u)
    .map((word) => word.charAt(0).toLocaleUpperCase('en') + word.slice(1))
    .join(' ')
}
