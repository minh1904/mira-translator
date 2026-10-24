import * as v from 'valibot'
import { idSchema } from './library'

/**
 * Quality warnings of a durable task's items (change `add-translation-task-qa`). Computed when read from
 * the snapshot the item pinned, never stored, never a blocker; only a dismissal is stored.
 * Bump a rule's version when its logic changes: old dismissals then stop matching.
 */
export const QA_RULE_VERSIONS = {
  'glossary.forbidden_used': 1,
  'glossary.missing_target': 2,
  'addressing.unexpected_pronoun': 1,
  'addressing.inconsistent_pair': 1,
  'text.residual_source': 1,
  'text.length_ratio': 1,
  'text.repetition': 1,
  'text.unbalanced_quotes': 2
} as const
export type QaRuleCode = keyof typeof QA_RULE_VERSIONS
export const QA_RULE_CODES = Object.keys(QA_RULE_VERSIONS) as QaRuleCode[]

export interface QaFinding {
  ruleCode: QaRuleCode
  ruleVersion: number
  chapterId: string
  segmentId: string
  /** 0-based position of the source paragraph, for "Mở đoạn". */
  paragraphIndex: number
  message: string
  /** Short proof: the term, the pronoun, the leftover characters, the ratio. */
  evidence: string
}

export interface QaItemView {
  itemId: string
  chapterId: string
  chapterLabel: string
  /** `na`: nothing to check yet (no pinned snapshot or no committed target). */
  status: 'checked' | 'na'
  findings: QaFinding[]
}

export interface TaskQualityView {
  taskId: string
  openCount: number
  items: QaItemView[]
}

export const taskQualityInputSchema = v.strictObject({ taskId: idSchema })

export const qaDismissInputSchema = v.strictObject({
  taskId: idSchema,
  itemId: idSchema,
  segmentId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  ruleCode: v.picklist(QA_RULE_CODES),
  ruleVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)))
})
export type QaDismissInput = v.InferOutput<typeof qaDismissInputSchema>
