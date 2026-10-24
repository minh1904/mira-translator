import { randomUUID } from 'node:crypto'
import type {
  ContextChangeActor,
  ContextChangeKind,
  ContextEntryChange
} from '../../../shared/contracts/glossary'
import type { Db } from './sqlite'

/**
 * History of a context entry (change `add-context-progression`): one row per changed field, with who
 * changed it, whether it fixes the whole story or applies from a chapter, and the quote behind it.
 */
export type ChangeActor = ContextChangeActor
export type EntryChange = ContextEntryChange

export type EntryChangeInput = Omit<EntryChange, 'id' | 'createdAt' | 'entryId'> & {
  entryId: string
}

export function recordChange(db: Db, change: EntryChangeInput, now: number): void {
  db.prepare(
    `INSERT INTO context_entry_change (id, entry_id, actor, kind, field, old_value, new_value,
       from_chapter_id, quote, quote_chapter_id, run_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    change.entryId,
    change.actor,
    change.kind,
    change.field,
    change.oldValue,
    change.newValue,
    change.fromChapterId,
    change.quote,
    change.quoteChapterId,
    change.runId,
    now
  )
}

/** The fields of `before` that differ in `after`, one history row each. */
export function recordFieldChanges(
  db: Db,
  base: Omit<EntryChangeInput, 'field' | 'oldValue' | 'newValue'>,
  before: Record<string, string | null>,
  after: Record<string, string | null>,
  now: number
): void {
  for (const field of Object.keys(after)) {
    if ((before[field] ?? null) === (after[field] ?? null)) continue
    recordChange(
      db,
      { ...base, field, oldValue: before[field] ?? null, newValue: after[field] ?? null },
      now
    )
  }
}

/** An entry's history, newest first. */
export function listEntryChanges(db: Db, entryId: string): EntryChange[] {
  return db
    .prepare(
      `SELECT id, entry_id, actor, kind, field, old_value, new_value, from_chapter_id, quote,
         quote_chapter_id, run_id, created_at
       FROM context_entry_change WHERE entry_id = ? ORDER BY rowid DESC`
    )
    .all<{
      id: string
      entry_id: string
      actor: ChangeActor
      kind: ContextChangeKind
      field: string
      old_value: string | null
      new_value: string | null
      from_chapter_id: string | null
      quote: string | null
      quote_chapter_id: string | null
      run_id: string | null
      created_at: number
    }>(entryId)
    .map((row) => ({
      id: row.id,
      entryId: row.entry_id,
      actor: row.actor,
      kind: row.kind,
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      fromChapterId: row.from_chapter_id,
      quote: row.quote,
      quoteChapterId: row.quote_chapter_id,
      runId: row.run_id,
      createdAt: row.created_at
    }))
}
