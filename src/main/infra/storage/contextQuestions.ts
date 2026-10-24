import { createHash, randomUUID } from 'node:crypto'
import {
  QUESTION_LABELS,
  type AnswerContextQuestionResult,
  type ContextQuestion,
  type ContextQuestionKind
} from '../../../shared/contracts/contextQuestions'
import type { ReviewFlag, ReviewFlagCode } from '../../../shared/contracts/glossary'
import { changeDyadFrom, getCharacter, updateCharacter } from './addressingEntries'
import { recordChange } from './contextChanges'
import { checkUniqueness, getContextEntry, parseFlags, rangeOf, touchWork } from './contextEntries'
import { reviseEntry } from './contextRevisions'
import { StorageError } from './errors'
import type { Db } from './sqlite'

/** The flag code each kind of question rides on. */
const CODE_OF: Record<ContextQuestionKind, ReviewFlagCode> = {
  revision: 'revision_suggested',
  retranslate: 'revision_suggested',
  merge: 'merge_suggested',
  gender: 'gender_uncertain'
}
const QUESTION_CODES = new Set<ReviewFlagCode>(Object.values(CODE_OF))

/** The question a flag carries, or `null` for a flag that is not one or whose detail does not parse. */
export function questionOf(flag: ReviewFlag): ContextQuestion | null {
  if (!QUESTION_CODES.has(flag.code) || !flag.detail) return null
  try {
    const question = JSON.parse(flag.detail) as ContextQuestion
    return typeof question?.id === 'string' &&
      Array.isArray(question.options) &&
      typeof question.default === 'string'
      ? question
      : null
  } catch {
    return null
  }
}

export const fingerprintOf = (
  kind: ContextQuestionKind,
  entryId: string,
  otherEntryId: string | null,
  proposal: unknown
): string =>
  createHash('sha256')
    .update(JSON.stringify([kind, entryId, otherEntryId, proposal]))
    .digest('hex')
    .slice(0, 32)

const flagsOf = (db: Db, entryId: string): ReviewFlag[] | null => {
  const row = db
    .prepare('SELECT review_flags FROM context_entry WHERE id = ?')
    .get<{ review_flags: string }>(entryId)
  return row ? parseFlags(row.review_flags) : null
}
const writeFlags = (db: Db, entryId: string, flags: ReviewFlag[]): void => {
  db.prepare('UPDATE context_entry SET review_flags = ? WHERE id = ?').run(
    JSON.stringify(flags),
    entryId
  )
}

export type QuestionInput = Omit<ContextQuestion, 'id' | 'fingerprint'>

/**
 * Leaves a question on an entry, unless the same one (same fingerprint) is already open or was answered
 * before. Returns the question's id, or `null` when nothing was added.
 */
export function attachQuestion(db: Db, entryId: string, input: QuestionInput): string | null {
  const flags = flagsOf(db, entryId)
  if (!flags) return null
  const fingerprint = fingerprintOf(input.kind, entryId, input.otherEntryId, input.proposal)
  if (flags.some((flag) => questionOf(flag)?.fingerprint === fingerprint)) return null
  const answered = db
    .prepare(
      "SELECT 1 AS found FROM context_entry_change WHERE field = 'question' AND old_value = ? LIMIT 1"
    )
    .get(fingerprint)
  if (answered) return null
  const question: ContextQuestion = { ...input, id: randomUUID(), fingerprint }
  writeFlags(db, entryId, [
    ...flags,
    { code: CODE_OF[input.kind], detail: JSON.stringify(question) }
  ])
  return question.id
}

/** Every open question of the work, with its entry. */
export function listQuestions(
  db: Db
): Array<ContextQuestion & { entryId: string; entrySource: string }> {
  return db
    .prepare(
      `SELECT id, source, review_flags FROM context_entry
       WHERE review_flags LIKE '%_suggested%' OR review_flags LIKE '%gender_uncertain%'`
    )
    .all<{ id: string; source: string; review_flags: string }>()
    .flatMap((row) =>
      parseFlags(row.review_flags).flatMap((flag) => {
        const question = questionOf(flag)
        return question ? [{ ...question, entryId: row.id, entrySource: row.source }] : []
      })
    )
}

const chapterNumber = (db: Db, chapterId: string | null): number | null => {
  if (!chapterId) return null
  const position = db
    .prepare('SELECT position FROM chapter WHERE id = ?')
    .get<{ position: number }>(chapterId)?.position
  return position === undefined ? null : position + 1
}

/** The options of a held-back change: "from chapter N" only when it names a chapter. */
export function revisionOptions(
  db: Db,
  fromChapterId: string | null,
  wholeStory: boolean
): string[] {
  const n = chapterNumber(db, fromChapterId)
  return [
    ...(wholeStory ? [QUESTION_LABELS.applyAll] : []),
    ...(n !== null ? [QUESTION_LABELS.applyFrom(n)] : []),
    QUESTION_LABELS.keep
  ]
}

interface RevisionProposal {
  kind: 'correction' | 'progression'
  fields: { target?: string; notes?: string | null; aliases?: string[] }
  fromChapterId: string | null
  dyad?: {
    sourceCharacterId: string
    targetCharacterId: string
    self: string
    address: string
    secondPerson: string | null
  }
}

/**
 * Applies a person's answer to an open question, in one transaction: the action of the chosen option,
 * then the flag goes and the answer is recorded with the question's fingerprint so it is never asked
 * again. An unknown question, or a label that is not one of its options, is refused and changes nothing.
 */
export function answerContextQuestion(
  db: Db,
  questionId: string,
  label: string,
  now: number
): AnswerContextQuestionResult {
  return db.transaction(() => {
    const found = listQuestions(db).find((question) => question.id === questionId)
    if (!found) throw new StorageError('not_found', 'Câu hỏi đã được trả lời hoặc không còn.')
    if (!found.options.includes(label)) {
      throw new StorageError('validation', `"${label}" không phải một lựa chọn của câu hỏi này.`)
    }
    const { entryId } = found
    const result: AnswerContextQuestionResult = {}
    let recordOn: string = entryId

    if (found.kind === 'revision' && label !== QUESTION_LABELS.keep) {
      const proposal = found.proposal as RevisionProposal
      const fromChapter = label !== QUESTION_LABELS.applyAll
      if (proposal.dyad) {
        changeDyadFrom(
          db,
          {
            newDyadId: randomUUID(),
            sourceCharacterId: proposal.dyad.sourceCharacterId,
            targetCharacterId: proposal.dyad.targetCharacterId,
            fromChapterId: proposal.fromChapterId!,
            speakerPronoun: proposal.dyad.self,
            recipientPronoun: proposal.dyad.address,
            secondPerson: proposal.dyad.secondPerson,
            actor: 'user'
          },
          now
        )
      } else {
        // A person answering: the guards that hold back the model do not apply.
        recordOn = reviseEntry(
          db,
          {
            entryId,
            actor: 'user',
            kind: fromChapter ? 'progression' : 'correction',
            fromChapterId: fromChapter ? proposal.fromChapterId : null,
            fields: proposal.fields,
            evidence: found.evidence
          },
          now
        ).entryId
      }
    } else if (found.kind === 'retranslate' && label === QUESTION_LABELS.retranslate) {
      result.retranslateChapterIds = (found.proposal as { chapterIds: string[] }).chapterIds
    } else if (found.kind === 'merge' && label === QUESTION_LABELS.merge) {
      recordOn = mergeInto(db, entryId, found.otherEntryId!, now)
    } else if (found.kind === 'gender') {
      const gender =
        label === QUESTION_LABELS.male
          ? 'male'
          : label === QUESTION_LABELS.female
            ? 'female'
            : 'unknown'
      if (getCharacter(db, entryId)) updateCharacter(db, entryId, { gender }, now)
    }

    const flags = flagsOf(db, entryId)
    if (flags)
      writeFlags(
        db,
        entryId,
        flags.filter((flag) => questionOf(flag)?.id !== questionId)
      )
    recordChange(
      db,
      {
        entryId: recordOn,
        actor: 'user',
        kind: 'correction',
        field: 'question',
        oldValue: found.fingerprint,
        newValue: label,
        fromChapterId: found.fromChapterId,
        quote: null,
        quoteChapterId: null,
        runId: found.runId
      },
      now
    )
    db.prepare('UPDATE context_entry SET user_edited_at = ? WHERE id = ?').run(now, recordOn)
    touchWork(db, now)
    return result
  })
}

/**
 * "These are one": the entry's quotes and history move to `otherId`, the entry goes, then its source and
 * aliases become aliases of `otherId`. A form another entry owns over the same chapters is left off.
 */
function mergeInto(db: Db, entryId: string, otherId: string, now: number): string {
  const entry = getContextEntry(db, entryId)
  const other = getContextEntry(db, otherId)
  if (!entry || !other) throw new StorageError('not_found', 'Không còn mục để gộp.')
  for (const table of ['context_entry_evidence', 'context_entry_change']) {
    db.prepare(`UPDATE ${table} SET entry_id = ? WHERE entry_id = ?`).run(other.id, entry.id)
  }
  db.prepare('DELETE FROM context_entry WHERE id = ?').run(entry.id)
  const range = rangeOf(db, other.fromChapterId, other.toChapterId)
  const aliases = [...other.aliases]
  const insert = db.prepare(
    'INSERT INTO context_alias (id, entry_id, form, created_at) VALUES (?, ?, ?, ?)'
  )
  for (const form of [entry.source, ...entry.aliases]) {
    if (form === other.source || aliases.includes(form)) continue
    try {
      checkUniqueness(db, other.source, [...aliases, form], other.id, range)
    } catch {
      continue
    }
    aliases.push(form)
    insert.run(randomUUID(), other.id, form, now)
  }
  recordChange(
    db,
    {
      entryId: other.id,
      actor: 'user',
      kind: 'correction',
      field: 'aliases',
      oldValue: other.aliases.join(', '),
      newValue: [...aliases].sort((x, y) => x.localeCompare(y)).join(', '),
      fromChapterId: null,
      quote: null,
      quoteChapterId: null,
      runId: null
    },
    now
  )
  return other.id
}
