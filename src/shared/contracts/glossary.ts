import * as v from 'valibot'
import type { AddressingDyadResolved, CharacterItem } from './addressing'
import { idSchema } from './library'

export const CONTEXT_KINDS = ['term', 'character', 'dyad', 'world', 'style', 'summary'] as const
export type ContextKind = (typeof CONTEXT_KINDS)[number]

export const CONTEXT_STATUSES = ['approved', 'pending', 'rejected'] as const
export type ContextStatus = (typeof CONTEXT_STATUSES)[number]

export const CONTEXT_ORIGINS = ['user', 'ai', 'import'] as const
export type ContextOrigin = (typeof CONTEXT_ORIGINS)[number]

export interface ContextEntryItem {
  id: string
  kind: ContextKind
  source: string
  target: string
  status: ContextStatus
  origin: ContextOrigin
  forbidden: boolean
  fromChapterId: string | null
  toChapterId: string | null
  notes: string | null
  aliases: string[]
  createdAt: number
  updatedAt: number
}

/** Why an AI candidate needs a closer look; shown to the reviewer, never fixed automatically. */
export const REVIEW_FLAG_CODES = [
  'alias_conflict',
  'script_mismatch',
  'reopened',
  'family_mismatch',
  'short_alias',
  'revision_suggested'
] as const
export type ReviewFlagCode = (typeof REVIEW_FLAG_CODES)[number]

export interface ReviewFlag {
  code: ReviewFlagCode
  /** `alias_conflict`: the alias form that belongs to another entry; `short_alias`: the short form left off;
   * `revision_suggested`: the held-back change as JSON (`RevisionSuggestion`). */
  detail?: string
}

/** One quote an extraction run found for an entry. */
export interface ContextEvidence {
  id: string
  runId: string
  chapterId: string | null
  quote: string
  model: string
  promptHash: string
  createdAt: number
}

/**
 * Review data of an entry, read apart from `ContextEntryItem`: the translation snapshot hashes whole
 * items, so these fields stay out of it.
 */
export interface ContextReviewInfo {
  entryId: string
  termType: string | null
  flags: ReviewFlag[]
  evidence: ContextEvidence[]
}

/** Who changed an entry: the model, a person, a person's repeated hand edit of a translation, or code. */
export type ContextChangeActor = 'ai' | 'user' | 'user_edit_signal' | 'code'
/** `correction` fixes the whole story; `progression` applies from `fromChapterId`. */
export type ContextChangeKind = 'create' | 'correction' | 'progression'

/** One changed field of an entry, with the quote behind it. */
export interface ContextEntryChange {
  id: string
  entryId: string
  actor: ContextChangeActor
  kind: ContextChangeKind
  field: string
  oldValue: string | null
  newValue: string | null
  fromChapterId: string | null
  quote: string | null
  quoteChapterId: string | null
  runId: string | null
  createdAt: number
}

/** An entry's history and the translated chapters its latest correction left out of date. */
export interface ContextEntryHistory {
  changes: ContextEntryChange[]
  affectedChapterIds: string[]
}

export const TERM_TEXT_MAX = 200
export const TERM_NOTES_MAX = 1000

export const termTextSchema = v.pipe(
  v.string('Thuật ngữ phải là chuỗi ký tự.'),
  v.trim(),
  v.minLength(1, 'Thuật ngữ không được để trống.'),
  v.maxLength(TERM_TEXT_MAX, `Thuật ngữ tối đa ${TERM_TEXT_MAX} ký tự.`)
)

export const termNotesSchema = v.pipe(
  v.string('Ghi chú phải là chuỗi ký tự.'),
  v.trim(),
  v.maxLength(TERM_NOTES_MAX, `Ghi chú tối đa ${TERM_NOTES_MAX} ký tự.`)
)

const workId = idSchema
const entryId = v.pipe(v.string('ID mục phải là chữ.'), v.uuid('ID mục không hợp lệ.'))
const chapterIdNullable = v.nullish(
  v.pipe(v.string('ID chương phải là chữ.'), v.uuid('ID chương không hợp lệ.'))
)

export const listGlossarySchema = v.strictObject({
  workId,
  kind: v.optional(v.picklist(CONTEXT_KINDS)),
  status: v.optional(v.picklist(CONTEXT_STATUSES)),
  query: v.optional(v.pipe(v.string(), v.trim())),
  chapterId: v.optional(v.pipe(v.string(), v.uuid()))
})

export const createGlossaryEntrySchema = v.strictObject({
  workId,
  kind: v.optional(v.picklist(CONTEXT_KINDS), 'term'),
  source: termTextSchema,
  target: termTextSchema,
  status: v.optional(v.picklist(CONTEXT_STATUSES), 'approved'),
  origin: v.optional(v.picklist(CONTEXT_ORIGINS), 'user'),
  forbidden: v.optional(v.boolean(), false),
  fromChapterId: v.optional(chapterIdNullable),
  toChapterId: v.optional(chapterIdNullable),
  notes: v.optional(v.nullish(termNotesSchema)),
  aliases: v.optional(v.array(termTextSchema), [])
})

export const updateGlossaryEntrySchema = v.strictObject({
  workId,
  entryId,
  source: v.optional(termTextSchema),
  target: v.optional(termTextSchema),
  status: v.optional(v.picklist(CONTEXT_STATUSES)),
  origin: v.optional(v.picklist(CONTEXT_ORIGINS)),
  forbidden: v.optional(v.boolean()),
  fromChapterId: v.optional(chapterIdNullable),
  toChapterId: v.optional(chapterIdNullable),
  notes: v.optional(v.nullish(termNotesSchema)),
  aliases: v.optional(v.array(termTextSchema))
})

export const deleteGlossaryEntrySchema = v.strictObject({
  workId,
  entryId
})

export const reviewInfoSchema = v.strictObject({
  workId,
  entryIds: v.optional(v.array(entryId))
})

export const appliedContextSchema = v.strictObject({
  workId,
  chapterId: v.pipe(v.string(), v.uuid())
})

/** What a translation of the chapter would use now: the snapshot's glossary, pairs and characters. */
export interface AppliedContext {
  glossary: ContextEntryItem[]
  dyads: AddressingDyadResolved[]
  characters: CharacterItem[]
}

export const importNamesSchema = v.strictObject({
  workId,
  content: v.string('Nội dung tệp phải là chuỗi ký tự.')
})

export interface ImportNamesResult {
  importedCount: number
  skippedCount: number
  skippedReasons: Array<{ line: number; raw: string; reason: string }>
}

export interface GlossaryComplianceIssue {
  type: 'missing_target' | 'forbidden_used'
  entryId: string
  source: string
  term: string
  message: string
}

export interface GlossaryComplianceReport {
  checkedCount: number
  matchedCount: number
  issues: GlossaryComplianceIssue[]
  hasIssues: boolean
}
