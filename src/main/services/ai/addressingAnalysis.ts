import type { SourceLanguage } from '../../../shared/contracts/library'
import {
  ADDRESSING_RULES,
  REGISTER_PRESETS,
  type RegisterPresetId
} from '../../../shared/contracts/addressingPresets'
import { presetSection } from './translate/translatePrompt'
import { languageName } from './translate/languageProfiles'

/**
 * Bước phân tích xưng hô trước khi dịch: đề xuất cặp xưng hô **đủ ô** kèm bằng chứng, để người dịch
 * duyệt thay vì tự soạn.
 *
 * Hai tầng. Mã thuần gom bằng chứng — các câu thoại có tên một nhân vật, kèm câu dẫn liền trước để
 * biết ai nói, và số lần mỗi đại từ xuất hiện. Model đọc bằng chứng và trả JSON: giới tính, đại từ
 * ngôi ba của từng nhân vật; với từng cặp A → B: tự xưng, cách gọi, đại từ ngôi hai dự phòng, ghi
 * chú và câu trích làm chứng. Kết quả có hiệu lực ngay; người dùng sửa sau ở màn Xưng hô.
 */

export interface AnalysisCharacter {
  source: string
  target: string
  aliases?: string[]
  gender?: string
  role?: string
  notes?: string
}

export interface ChapterSource {
  number: number
  text: string
}

export interface EvidenceLine {
  chapter: number
  /** Câu dẫn liền trước (thường cho biết ai nói), có thể rỗng. */
  cue: string
  line: string
}

export interface CharacterEvidence {
  source: string
  lines: EvidenceLine[]
  /** Đại từ gặp trong các câu thoại đã gom, kèm số lần. */
  pronouns: Record<string, number>
}

const PRONOUNS: Record<string, RegExp> = {
  ja: /わたくし|あたし|わたし|私|俺|僕|ボク|うち|儂|わし|拙者|お前|おまえ|あなた|貴方|あんた|君|キミ|貴様|てめぇ|テメェ|お兄ちゃん|お兄様|兄様|兄さん|お姉ちゃん|お姉様|姉様|姉さん/g,
  zh: /我|你|您|他|她|朕|本宫|本座|在下|小女子|妾身|奴婢|臣妾|老夫|师父|师兄|师姐|师弟|师妹|哥|姐/g,
  en: /\b(I|you|my lord|my lady|sir|madam|master|darling)\b/gi
}

function pronounPattern(sourceLang: SourceLanguage | string): RegExp {
  if (sourceLang === 'ja') return PRONOUNS.ja
  if (sourceLang === 'en') return PRONOUNS.en
  return PRONOUNS.zh
}

function isDialogue(line: string): boolean {
  return /^[「『“"]/.test(line.trim())
}

/**
 * Gom bằng chứng cho từng nhân vật: câu thoại có một dạng tên của họ, rải đều qua các chương (không
 * lấy dồn ở chương đầu), tối đa `perCharacter` câu.
 */
export function collectAddressingEvidence(
  chapters: ChapterSource[],
  characters: AnalysisCharacter[],
  sourceLang: SourceLanguage | string,
  perCharacter = 14
): CharacterEvidence[] {
  const pattern = pronounPattern(sourceLang)
  return characters.map((character) => {
    const forms = [character.source, ...(character.aliases ?? [])].filter((form) => form.trim())
    const byChapter: EvidenceLine[][] = []
    for (const chapter of chapters) {
      const lines = chapter.text.split(/\r?\n/).map((line) => line.trim())
      const found: EvidenceLine[] = []
      lines.forEach((line, index) => {
        if (!isDialogue(line) || !forms.some((form) => line.includes(form))) return
        const cue = [...lines.slice(Math.max(0, index - 2), index)]
          .reverse()
          .find((l) => l && !isDialogue(l))
        found.push({
          chapter: chapter.number,
          cue: (cue ?? '').slice(0, 120),
          line: line.slice(0, 200)
        })
      })
      if (found.length > 0) byChapter.push(found)
    }
    // Rải đều: lần lượt lấy một câu từ mỗi chương cho tới khi đủ.
    const picked: EvidenceLine[] = []
    for (let round = 0; picked.length < perCharacter; round++) {
      let added = false
      for (const lines of byChapter) {
        if (lines[round] && picked.length < perCharacter) {
          picked.push(lines[round])
          added = true
        }
      }
      if (!added) break
    }
    const pronouns: Record<string, number> = {}
    for (const lines of byChapter) {
      for (const item of lines) {
        for (const match of item.line.matchAll(pattern)) {
          pronouns[match[0]] = (pronouns[match[0]] ?? 0) + 1
        }
      }
    }
    return { source: character.source, lines: picked, pronouns }
  })
}

export const ANALYSIS_OUTPUT_EXAMPLE = {
  characters: [
    {
      source: 'ミリィ',
      gender: 'female',
      thirdPerson: 'cô',
      notes: 'Hầu gái nuôi Rion từ bé; luôn nói kính ngữ'
    }
  ],
  dyads: [
    {
      from: 'ミリィ',
      to: 'リオン',
      self: 'tôi',
      address: 'Rion-sama',
      secondPerson: 'cậu',
      notes: 'Bản gốc luôn gọi リオン様 và nói です/ます',
      evidence: ['ch3: 「リオン様ったらまた部屋から抜け出して、探しましたよ？」'],
      confidence: 'cao'
    }
  ]
}

export function buildAnalysisMessages(input: {
  sourceLang: SourceLanguage | string
  register: RegisterPresetId | null
  characters: AnalysisCharacter[]
  evidence: CharacterEvidence[]
}): Array<{ role: 'system' | 'user'; content: string }> {
  const preset = input.register ? REGISTER_PRESETS[input.register] : undefined
  const system = [
    `Bạn là biên tập viên dịch truyện ${languageName(input.sourceLang)} sang tiếng Việt, đang lập bảng xưng hô cho một bộ truyện TRƯỚC khi dịch.`,
    'Nhiệm vụ: từ các câu thoại bằng chứng, đề xuất cho mỗi nhân vật giới tính và đại từ người kể dùng (ngôi ba), và cho mỗi cặp người nói → người nghe có bằng chứng: tự xưng, cách gọi người nghe, đại từ ngôi hai dự phòng.',
    '',
    '<rules>',
    ...ADDRESSING_RULES.map((rule) => '- ' + rule),
    '- "address" là cách gọi người nghe như bản gốc (tên kèm hậu tố, danh xưng, hoặc đại từ). Nếu "address" là tên hoặc danh xưng thì BẮT BUỘC có "secondPerson": đại từ tiếng Việt dùng khi bản gốc lược chủ ngữ hoặc dùng あなた/貴方/你.',
    '- "secondPerson" phải hợp vai: người dưới gọi người trên không dùng đại từ hạ vai (hầu gái nói kính ngữ với con trai nhà chủ: "cậu", không phải "em").',
    '- Chỉ đề xuất cặp có ít nhất một câu bằng chứng; trích nguyên câu gốc kèm số chương. Không chắc thì ghi rõ trong "notes" và để "confidence": "thấp".',
    '- Không bịa nhân vật mới; dùng đúng "source" đã cho.',
    '</rules>',
    ...(preset ? ['', ...presetSection(preset)] : []),
    '',
    'Trả về đúng một đối tượng JSON, không kèm giải thích hay dấu ```, theo mẫu:',
    JSON.stringify(ANALYSIS_OUTPUT_EXAMPLE)
  ].join('\n')

  const blocks = input.characters.map((character, index) => {
    const evidence = input.evidence[index]
    const pronouns = Object.entries(evidence?.pronouns ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([word, count]) => `${word}×${count}`)
      .join(', ')
    const lines = (evidence?.lines ?? []).map(
      (item) => `  - ch${item.chapter}: ${item.cue ? `[${item.cue}] ` : ''}${item.line}`
    )
    const facts = [character.gender, character.role, character.notes].filter(Boolean).join('; ')
    return [
      `<character source="${character.source}" target="${character.target}"${character.aliases?.length ? ` aliases="${character.aliases.join(', ')}"` : ''}>`,
      facts ? `Đã biết: ${facts}` : '',
      pronouns ? `Đại từ trong các câu có tên nhân vật: ${pronouns}` : '',
      lines.length > 0
        ? 'Câu thoại có tên nhân vật ([câu dẫn] câu thoại):'
        : 'Không có câu thoại nào có tên.',
      ...lines,
      '</character>'
    ]
      .filter(Boolean)
      .join('\n')
  })
  const user = [...blocks, '', 'Lập bảng xưng hô theo luật ở trên. Chỉ trả về JSON.'].join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

export interface AnalysisResult {
  characters: Array<{
    source: string
    gender?: string
    thirdPerson?: string
    notes?: string
  }>
  dyads: Array<{
    from: string
    to: string
    self: string
    address: string
    secondPerson?: string
    notes?: string
    evidence?: string[]
    confidence?: string
  }>
}

/** Đọc JSON model trả về, chịu được rào ```json và chữ thừa quanh nó. */
export function parseAnalysis(text: string): AnalysisResult {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Phản hồi phân tích không có JSON.')
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AnalysisResult>
  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    dyads: (Array.isArray(parsed.dyads) ? parsed.dyads : []).filter(
      (dyad) => dyad && dyad.from && dyad.to && dyad.self && dyad.address
    )
  }
}

/**
 * The model's evidence quotes that appear verbatim in one of `chapters`, with the chapter they are in;
 * the rest are dropped. Strips the `ch3:` and `[cue]` prefixes the prompt shows the model.
 */
export function verifiedQuotes(
  evidence: unknown,
  chapters: ChapterSource[]
): Array<{ chapter: number; quote: string }> {
  const quotes: Array<{ chapter: number; quote: string }> = []
  for (const raw of Array.isArray(evidence) ? evidence : []) {
    if (typeof raw !== 'string') continue
    const quote = raw
      .replace(/^\s*ch\s*\d+\s*:\s*/i, '')
      .replace(/^\[[^\]]*\]\s*/, '')
      .trim()
    const chapter = quote ? chapters.find((each) => each.text.includes(quote)) : undefined
    if (chapter) quotes.push({ chapter: chapter.number, quote: quote.slice(0, 200) })
  }
  return quotes
}
