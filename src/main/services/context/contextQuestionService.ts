import {
  WORK_CONVENTION_LABELS,
  type AnswerContextQuestionResult,
  type ContextQuestionView,
  type WorkConventionKey,
  type WorkConventions
} from '../../../shared/contracts/contextQuestions'
import { answerContextQuestion, listQuestions } from '../../infra/storage/contextQuestions'
import { reviseEntry } from '../../infra/storage/contextRevisions'
import { readConventions, writeConvention } from '../../infra/storage/workConventions'
import { countForms } from '../ai/glossaryExtraction'
import { restyleName, type RomanizationStyle } from '../ai/romaji'
import type { LibraryStore } from '../library/library'

/**
 * Open context questions and the work's conventions (change `add-context-questions`), for the Glossary
 * screen and chat alike: list by impact, answer by code, set a convention.
 */
export class ContextQuestionService {
  constructor(
    private readonly library: LibraryStore,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Open questions, those whose entry appears most in chapters not translated yet first; ties by the
   * chapter they start to matter from.
   */
  list(workId: string): ContextQuestionView[] {
    return this.library.withWork(workId, (db) => {
      const questions = listQuestions(db)
      if (questions.length === 0) return []
      const untranslated = db
        .prepare(
          `SELECT c.position AS position, s.content AS content FROM chapter c
           JOIN chapter_text s ON s.chapter_id = c.id AND s.side = 'source'
           LEFT JOIN chapter_text t ON t.chapter_id = c.id AND t.side = 'target'
           WHERE t.content IS NULL OR t.content = '' ORDER BY c.position`
        )
        .all<{ position: number; content: string }>()
        .map((row) => ({ number: row.position + 1, text: row.content }))
      const formsOf = new Map(
        questions.map((q) => [
          q.entryId,
          [
            q.entrySource,
            ...db
              .prepare('SELECT form FROM context_alias WHERE entry_id = ?')
              .all<{ form: string }>(q.entryId)
              .map((row) => row.form)
          ]
        ])
      )
      const counts = countForms([...formsOf.values()].flat(), untranslated, 0)
      const position = (chapterId: string | null): number =>
        (chapterId
          ? db
              .prepare('SELECT position FROM chapter WHERE id = ?')
              .get<{ position: number }>(chapterId)?.position
          : undefined) ?? Number.MAX_SAFE_INTEGER
      return questions
        .map((q) => ({
          ...q,
          impact: (formsOf.get(q.entryId) ?? []).reduce(
            (sum, form) => sum + (counts.get(form)?.count ?? 0),
            0
          )
        }))
        .sort(
          (a, b) => b.impact - a.impact || position(a.fromChapterId) - position(b.fromChapterId)
        )
    })
  }

  /** Open questions left by the given extraction runs (a task's `extract_terms` operations). */
  countForRuns(workId: string, runIds: string[]): number {
    if (runIds.length === 0) return 0
    const runs = new Set(runIds)
    return this.library.withWork(workId, (db) =>
      listQuestions(db).filter((question) => question.runId !== null && runs.has(question.runId))
    ).length
  }

  answer(workId: string, questionId: string, label: string): AnswerContextQuestionResult {
    return this.library.withWork(workId, (db) =>
      answerContextQuestion(db, questionId, label, this.now())
    )
  }

  conventions(workId: string): WorkConventions {
    return this.library.withWork(workId, (db) => readConventions(db))
  }

  /**
   * Sets a convention as settled. A new romanization style writes again the people's names whose
   * translation is exactly the old style of their reading and that nobody edited by hand.
   */
  setConvention(
    workId: string,
    key: WorkConventionKey,
    value: string,
    settled = true
  ): { conventions: WorkConventions; renamed: number; skipped: number } {
    return this.library.withWork(workId, (db) =>
      db.transaction(() => {
        const before = readConventions(db)
        const now = this.now()
        writeConvention(db, key, value, settled, now)
        let renamed = 0
        let skipped = 0
        const from = before.ja_romanization.value as RomanizationStyle
        if (key === 'ja_romanization' && value !== from) {
          const people = db
            .prepare(
              `SELECT id, target, reading, user_edited_at FROM context_entry
               WHERE kind = 'term' AND term_type = 'person' AND reading IS NOT NULL AND reading != ''`
            )
            .all<{ id: string; target: string; reading: string; user_edited_at: number | null }>()
          for (const person of people) {
            const next =
              person.user_edited_at === null
                ? restyleName(person.reading, person.target, from, value as RomanizationStyle)
                : null
            if (!next) {
              skipped++
              continue
            }
            if (next === person.target) continue
            reviseEntry(
              db,
              {
                entryId: person.id,
                actor: 'code',
                kind: 'correction',
                fields: { target: next },
                evidence: []
              },
              now
            )
            renamed++
          }
        }
        return { conventions: readConventions(db), renamed, skipped }
      })
    )
  }
}

/**
 * The line a chat turn on this work carries: how many context questions are open and which conventions
 * nobody chose yet (romanization only for Japanese). `null` when there is nothing to say.
 */
export function contextQuestionNote(library: LibraryStore, workId: string): string | null {
  const japanese = library.get(workId).sourceLang === 'ja'
  const { open, unsettled } = library.withWork(workId, (db) => {
    const conventions = readConventions(db)
    return {
      open: listQuestions(db).length,
      unsettled: (Object.keys(conventions) as WorkConventionKey[]).filter(
        (key) => !conventions[key].settled && (japanese || key !== 'ja_romanization')
      )
    }
  })
  const parts = [
    open > 0 ? `${open} câu hỏi ngữ cảnh đang mở (read_context_questions)` : '',
    unsettled.length > 0
      ? `quy ước chưa chốt: ${unsettled.map((key) => `${key} (${WORK_CONVENTION_LABELS[key].title})`).join(', ')}`
      : ''
  ].filter(Boolean)
  return parts.length > 0 ? `Tác phẩm có ${parts.join('; ')}.` : null
}
