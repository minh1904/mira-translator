import * as v from 'valibot'
import { idSchema } from './library'

/**
 * Context questions (change `add-context-questions`): what extraction could not settle. The safe default
 * is already applied; the question waits on the entry, as a review flag, until a person answers it in
 * the Glossary screen or in chat. Every option is one action code applies, without the model.
 */
export const CONTEXT_QUESTION_KINDS = ['revision', 'retranslate', 'merge', 'gender'] as const
export type ContextQuestionKind = (typeof CONTEXT_QUESTION_KINDS)[number]

export const QUESTION_LABELS = {
  applyAll: 'Áp cho cả truyện',
  applyFrom: (chapter: number | string) => `Áp từ chương ${chapter}`,
  keep: 'Giữ nguyên',
  retranslate: 'Dịch lại các chương này',
  listOnly: 'Chỉ liệt kê',
  merge: 'Gộp vào mục kia',
  distinct: 'Hai mục khác nhau',
  male: 'Nam',
  female: 'Nữ',
  unknown: 'Không rõ'
} as const

export interface ContextQuestionQuote {
  chapterId: string | null
  quote: string
}

/** One open question, as stored in the `detail` of its flag. */
export interface ContextQuestion {
  id: string
  kind: ContextQuestionKind
  title: string
  options: string[]
  default: string
  fromChapterId: string | null
  /** The entry a `merge` question points at. */
  otherEntryId: string | null
  /** What applying the question changes; its shape depends on `kind`. */
  proposal: unknown
  evidence: ContextQuestionQuote[]
  runId: string | null
  /** Kind, entry, other entry and proposal, hashed: a question answered once is never asked again. */
  fingerprint: string
}

/** An open question with the entry it is about, as the Glossary screen and chat list them. */
export interface ContextQuestionView extends ContextQuestion {
  entryId: string
  entrySource: string
  /** How often the entry's forms appear in chapters with no translation yet. */
  impact: number
}

export interface AnswerContextQuestionResult {
  /** Chapters the person chose to translate again; the caller confirms, then creates the task. */
  retranslateChapterIds?: string[]
}

export const answerContextQuestionSchema = v.strictObject({
  workId: idSchema,
  questionId: idSchema,
  label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
})
export type AnswerContextQuestionInput = v.InferOutput<typeof answerContextQuestionSchema>

// ---------------------------------------------------------------------------------------------------
// Work conventions

export const WORK_CONVENTIONS = {
  ja_romanization: ['hepburn_macron', 'hepburn_plain', 'wapuro'],
  honorifics: ['keep', 'vietnamize'],
  correction_retranslate: ['list', 'ask']
} as const
export type WorkConventionKey = keyof typeof WORK_CONVENTIONS
export type WorkConventionValue<K extends WorkConventionKey = WorkConventionKey> =
  (typeof WORK_CONVENTIONS)[K][number]

export const WORK_CONVENTION_DEFAULTS: { [K in WorkConventionKey]: WorkConventionValue<K> } = {
  ja_romanization: 'hepburn_plain',
  honorifics: 'keep',
  correction_retranslate: 'list'
}

export const WORK_CONVENTION_LABELS: {
  [K in WorkConventionKey]: { title: string; values: Record<WorkConventionValue<K>, string> }
} = {
  ja_romanization: {
    title: 'Kiểu phiên âm tên Nhật',
    values: {
      hepburn_macron: 'Hepburn có dấu (Ryōta)',
      hepburn_plain: 'Hepburn không dấu (Ryota)',
      wapuro: 'Kiểu ou (Ryouta)'
    }
  },
  honorifics: {
    title: 'Kính ngữ',
    values: { keep: 'Giữ hậu tố Nhật (Akira-san)', vietnamize: 'Việt hóa' }
  },
  correction_retranslate: {
    title: 'Khi sửa sai đụng chương đã dịch',
    values: { list: 'Chỉ liệt kê', ask: 'Hỏi có dịch lại không' }
  }
}

export interface WorkConventionState<K extends WorkConventionKey = WorkConventionKey> {
  value: WorkConventionValue<K>
  /** `false` while the default is in use and nobody chose it. */
  settled: boolean
}
export type WorkConventions = { [K in WorkConventionKey]: WorkConventionState<K> }

export const setWorkConventionSchema = v.strictObject({
  workId: idSchema,
  key: v.picklist(Object.keys(WORK_CONVENTIONS) as WorkConventionKey[]),
  value: v.string()
})
export type SetWorkConventionInput = v.InferOutput<typeof setWorkConventionSchema>
