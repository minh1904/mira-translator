import { randomUUID } from 'node:crypto'
import type { ContextChangeActor, ReviewFlag } from '../../../shared/contracts/glossary'
import { recordFieldChanges } from './contextChanges'
import {
  checkUniqueness,
  entryFields,
  getContextEntry,
  parseFlags,
  rangeOf,
  touchWork
} from './contextEntries'
import { StorageError } from './errors'
import type { Db } from './sqlite'

/**
 * How context entries change as the story goes on (change `add-context-progression`): a `correction`
 * fixes an entry for the whole story, a `progression` closes it at chapter N−1 and starts a new one from
 * N. Every change from the model passes the same guards first; one that fails them changes nothing and
 * leaves a `revision_suggested` flag instead.
 */

const position = (db: Db, id: string | null | undefined): number | null =>
  id
    ? (db.prepare('SELECT position FROM chapter WHERE id = ?').get<{ position: number }>(id)
        ?.position ?? null)
    : null

export interface RevisionQuote {
  chapterId: string | null
  quote: string
}

export interface TermFields {
  target?: string
  notes?: string | null
  /** Forms to add; existing aliases stay. */
  aliases?: string[]
}

export interface ChangeTermFromParams {
  /** Derived from the command or the run, so a retry finds the entry it made. */
  newEntryId: string
  entryId: string
  fromChapterId: string
  fields: TermFields
  actor: ContextChangeActor
  quote?: RevisionQuote
  runId?: string | null
}

/**
 * Closes a term at the chapter before `fromChapterId` and starts a copy from it with `fields` changed
 * (the pattern of `changeDyadFrom`). Refused when the term starts at that chapter or later, or does not
 * apply there.
 */
export function changeTermFrom(
  db: Db,
  params: ChangeTermFromParams,
  now: number = Date.now()
): { newEntryId: string; closedEntryId: string } {
  return db.transaction(() => {
    if (getContextEntry(db, params.newEntryId)) {
      return { newEntryId: params.newEntryId, closedEntryId: params.entryId }
    }
    const entry = getContextEntry(db, params.entryId)
    if (!entry) throw new StorageError('not_found', 'Không tìm thấy mục thuật ngữ.')
    const at = position(db, params.fromChapterId)
    if (at === null) throw new StorageError('not_found', 'Không tìm thấy chương áp dụng.')
    const previous =
      db
        .prepare('SELECT id FROM chapter WHERE position < ? ORDER BY position DESC LIMIT 1')
        .get<{ id: string }>(at)?.id ?? null
    const start = position(db, entry.fromChapterId)
    const end = position(db, entry.toChapterId)
    if (previous === null || (start !== null && start >= at)) {
      throw new StorageError(
        'validation',
        'Mục hiện có bắt đầu từ chương này hoặc sau; hãy sửa trực tiếp ở Từ điển.'
      )
    }
    if (end !== null && end < at) {
      throw new StorageError('validation', 'Mục này không còn áp dụng ở chương đó.')
    }

    const target = params.fields.target?.trim() ?? entry.target
    const notes = params.fields.notes !== undefined ? params.fields.notes : entry.notes
    const added = (params.fields.aliases ?? [])
      .map((form) => form.trim())
      .filter((form) => form !== '' && !entry.aliases.includes(form) && form !== entry.source)
    const aliases = [...entry.aliases, ...added].sort((a, b) => a.localeCompare(b))

    db.prepare('UPDATE context_entry SET to_chapter_id = ?, updated_at = ? WHERE id = ?').run(
      previous,
      now,
      entry.id
    )
    checkUniqueness(
      db,
      entry.source,
      aliases,
      entry.id,
      rangeOf(db, params.fromChapterId, entry.toChapterId)
    )
    db.prepare(
      `INSERT INTO context_entry (id, kind, source, target, status, origin, forbidden, from_chapter_id,
         to_chapter_id, notes, term_type, reading, supersedes_id, created_at, updated_at)
       SELECT ?, kind, source, ?, status, origin, forbidden, ?, to_chapter_id, ?, term_type, reading, id, ?, ?
       FROM context_entry WHERE id = ?`
    ).run(params.newEntryId, target, params.fromChapterId, notes, now, now, entry.id)
    // The new entry ends where the old one used to end.
    db.prepare('UPDATE context_entry SET to_chapter_id = ? WHERE id = ?').run(
      entry.toChapterId,
      params.newEntryId
    )
    const insertAlias = db.prepare(
      'INSERT INTO context_alias (id, entry_id, form, created_at) VALUES (?, ?, ?, ?)'
    )
    for (const form of aliases) insertAlias.run(randomUUID(), params.newEntryId, form, now)
    if (params.actor === 'user')
      db.prepare('UPDATE context_entry SET user_edited_at = ? WHERE id = ?').run(
        now,
        params.newEntryId
      )
    recordFieldChanges(
      db,
      {
        entryId: params.newEntryId,
        actor: params.actor,
        kind: 'progression',
        fromChapterId: params.fromChapterId,
        quote: params.quote?.quote ?? null,
        quoteChapterId: params.quote?.chapterId ?? null,
        runId: params.runId ?? null
      },
      entryFields(entry),
      entryFields({ source: entry.source, target, notes, aliases }),
      now
    )
    touchWork(db, now)
    return { newEntryId: params.newEntryId, closedEntryId: entry.id }
  })
}

export interface RevisionInput {
  entryId: string
  actor: ContextChangeActor
  kind: 'correction' | 'progression'
  /** The chapter a progression applies from. */
  fromChapterId?: string | null
  fields: TermFields
  evidence: RevisionQuote[]
  runId?: string | null
  /** The id of the entry a progression creates; random when absent. */
  newEntryId?: string
}

export type RevisionBlock = 'user_edited' | 'one_chapter' | 'flip_back'

/** What the `revision_suggested` flag carries, as JSON in its `detail`. */
export interface RevisionSuggestion {
  kind: RevisionInput['kind']
  fields: TermFields
  fromChapterId: string | null
  evidence: RevisionQuote[]
  reason: RevisionBlock
}

/**
 * Why a change must not apply, or `null`:
 * - the model never overwrites what a person edited (since that edit);
 * - a progression needs quotes from two chapters at or after the chapter it starts from;
 * - the model never puts back a value it replaced earlier.
 */
export function revisionBlock(
  db: Db,
  input: Pick<RevisionInput, 'entryId' | 'actor' | 'kind' | 'fromChapterId' | 'evidence'> & {
    values: Record<string, string | null | undefined>
  }
): RevisionBlock | null {
  const ai = input.actor === 'ai'
  if (ai) {
    const edited = db
      .prepare('SELECT user_edited_at FROM context_entry WHERE id = ?')
      .get<{ user_edited_at: number | null }>(input.entryId)?.user_edited_at
    if (edited !== null && edited !== undefined) return 'user_edited'
  }
  if (input.kind === 'progression') {
    const at = position(db, input.fromChapterId)
    const chapters = new Set(
      input.evidence
        .filter((quote) => {
          const p = position(db, quote.chapterId)
          return at !== null && p !== null && p >= at
        })
        .map((quote) => quote.chapterId)
    )
    if (chapters.size < 2) return 'one_chapter'
  }
  if (ai) {
    const replaced = db.prepare(
      `SELECT 1 AS found FROM context_entry_change
       WHERE entry_id = ? AND actor = 'ai' AND field = ? AND old_value = ? AND kind != 'create' LIMIT 1`
    )
    for (const [field, value] of Object.entries(input.values)) {
      if (value === undefined || value === null) continue
      if (replaced.get(input.entryId, field, value)) return 'flip_back'
    }
  }
  return null
}

/** Adds a `revision_suggested` flag to an entry; the same suggestion twice stays one flag. */
export function flagRevision(db: Db, entryId: string, suggestion: RevisionSuggestion): void {
  const row = db
    .prepare('SELECT review_flags FROM context_entry WHERE id = ?')
    .get<{ review_flags: string }>(entryId)
  if (!row) return
  const detail = JSON.stringify(suggestion)
  const flags = parseFlags(row.review_flags)
  if (flags.some((flag) => flag.code === 'revision_suggested' && flag.detail === detail)) return
  const next: ReviewFlag[] = [...flags, { code: 'revision_suggested', detail }]
  db.prepare('UPDATE context_entry SET review_flags = ? WHERE id = ?').run(
    JSON.stringify(next),
    entryId
  )
}

/**
 * The one way the model, a hand-edit signal or code changes a term: guards, then the change in place
 * (`correction`) or from a chapter (`progression`), with history. A blocked change only flags the entry.
 */
export function reviseEntry(
  db: Db,
  input: RevisionInput,
  now: number = Date.now()
): { applied: boolean; entryId: string; blocked: RevisionBlock | null } {
  return db.transaction(() => {
    const entry = getContextEntry(db, input.entryId)
    if (!entry) throw new StorageError('not_found', 'Không tìm thấy mục thuật ngữ.')
    const blocked = revisionBlock(db, {
      ...input,
      values: { target: input.fields.target?.trim(), notes: input.fields.notes }
    })
    if (blocked) {
      flagRevision(db, entry.id, {
        kind: input.kind,
        fields: input.fields,
        fromChapterId: input.fromChapterId ?? null,
        evidence: input.evidence,
        reason: blocked
      })
      return { applied: false, entryId: entry.id, blocked }
    }
    const quote = input.evidence[0]
    if (input.kind === 'progression') {
      const made = changeTermFrom(
        db,
        {
          newEntryId: input.newEntryId ?? randomUUID(),
          entryId: entry.id,
          fromChapterId: input.fromChapterId!,
          fields: input.fields,
          actor: input.actor,
          quote,
          runId: input.runId
        },
        now
      )
      return { applied: true, entryId: made.newEntryId, blocked: null }
    }

    const target = input.fields.target?.trim() || entry.target
    const notes = input.fields.notes !== undefined ? input.fields.notes : entry.notes
    const range = rangeOf(db, entry.fromChapterId, entry.toChapterId)
    const aliases = [...entry.aliases]
    for (const raw of input.fields.aliases ?? []) {
      const form = raw.trim()
      if (form === '' || form === entry.source || aliases.includes(form)) continue
      try {
        checkUniqueness(db, entry.source, [...aliases, form], entry.id, range)
        aliases.push(form)
      } catch {
        // A form another entry owns over the same chapters is left off, not an error.
        const flags = parseFlags(
          db
            .prepare('SELECT review_flags FROM context_entry WHERE id = ?')
            .get<{ review_flags: string }>(entry.id)!.review_flags
        )
        if (!flags.some((flag) => flag.code === 'alias_conflict' && flag.detail === form)) {
          db.prepare('UPDATE context_entry SET review_flags = ? WHERE id = ?').run(
            JSON.stringify([...flags, { code: 'alias_conflict', detail: form }]),
            entry.id
          )
        }
      }
    }
    aliases.sort((a, b) => a.localeCompare(b))
    db.prepare('UPDATE context_entry SET target = ?, notes = ?, updated_at = ? WHERE id = ?').run(
      target,
      notes,
      now,
      entry.id
    )
    const insertAlias = db.prepare(
      'INSERT INTO context_alias (id, entry_id, form, created_at) VALUES (?, ?, ?, ?)'
    )
    for (const form of aliases) {
      if (!entry.aliases.includes(form)) insertAlias.run(randomUUID(), entry.id, form, now)
    }
    recordFieldChanges(
      db,
      {
        entryId: entry.id,
        actor: input.actor,
        kind: 'correction',
        fromChapterId: null,
        quote: quote?.quote ?? null,
        quoteChapterId: quote?.chapterId ?? null,
        runId: input.runId ?? null
      },
      entryFields(entry),
      entryFields({ source: entry.source, target, notes, aliases }),
      now
    )
    touchWork(db, now)
    return { applied: true, entryId: entry.id, blocked: null }
  })
}

/**
 * Chapters translated before the entry's latest correction whose source has one of its forms: what a
 * fix for the whole story leaves out of date. Computed on read, since it follows the data.
 */
export function affectedChapters(db: Db, entryId: string): string[] {
  const entry = getContextEntry(db, entryId)
  if (!entry) return []
  const corrected = db
    .prepare(
      `SELECT max(created_at) AS at FROM context_entry_change
       WHERE entry_id = ? AND kind = 'correction' AND field IN ('target', 'source')`
    )
    .get<{ at: number | null }>(entryId)?.at
  if (corrected === null || corrected === undefined) return []
  const forms = [entry.source, ...entry.aliases]
  return db
    .prepare(
      `SELECT c.id, s.content FROM chapter c
       JOIN chapter_text t ON t.chapter_id = c.id AND t.side = 'target' AND t.content != ''
       JOIN chapter_text s ON s.chapter_id = c.id AND s.side = 'source'
       WHERE t.updated_at < ? ORDER BY c.position`
    )
    .all<{ id: string; content: string }>(corrected)
    .filter((row) => forms.some((form) => row.content.includes(form)))
    .map((row) => row.id)
}
