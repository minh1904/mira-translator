import { randomUUID } from 'node:crypto'
import type {
  ContextEntryItem,
  ContextEvidence,
  ContextKind,
  ContextOrigin,
  ContextReviewInfo,
  ContextStatus,
  ReviewFlag
} from '../../../shared/contracts/glossary'
import { StorageError } from './errors'
import type { Db } from './sqlite'

interface ContextEntryRow {
  id: string
  kind: ContextKind
  source: string
  target: string
  status: ContextStatus
  origin: ContextOrigin
  forbidden: number
  from_chapter_id: string | null
  to_chapter_id: string | null
  notes: string | null
  created_at: number
  updated_at: number
}

interface AliasRow {
  entry_id: string
  form: string
}

function touchWork(db: Db, now: number): void {
  db.prepare('UPDATE work SET updated_at = ?').run(now)
}

function toItem(row: ContextEntryRow, aliases: string[] = []): ContextEntryItem {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    target: row.target,
    status: row.status,
    origin: row.origin,
    forbidden: row.forbidden === 1,
    fromChapterId: row.from_chapter_id,
    toChapterId: row.to_chapter_id,
    notes: row.notes,
    aliases,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function validateChapters(
  db: Db,
  fromChapterId: string | null | undefined,
  toChapterId: string | null | undefined
): void {
  let fromPos: number | null = null
  let toPos: number | null = null

  if (fromChapterId) {
    const fromChap = db
      .prepare('SELECT position FROM chapter WHERE id = ?')
      .get<{ position: number }>(fromChapterId)
    if (!fromChap) {
      throw new StorageError('not_found', 'Không tìm thấy chương bắt đầu.')
    }
    fromPos = fromChap.position
  }

  if (toChapterId) {
    const toChap = db
      .prepare('SELECT position FROM chapter WHERE id = ?')
      .get<{ position: number }>(toChapterId)
    if (!toChap) {
      throw new StorageError('not_found', 'Không tìm thấy chương kết thúc.')
    }
    toPos = toChap.position
  }

  if (fromPos !== null && toPos !== null && fromPos > toPos) {
    throw new StorageError(
      'validation',
      'Chương bắt đầu phải đứng trước hoặc bằng chương kết thúc.'
    )
  }
}

/**
 * Characters and pairs keep their own names: a character named like a glossary person (the addressing
 * analysis creates one per person) must not block that entry's review.
 */
const GLOSSARY = "kind NOT IN ('character', 'dyad')"

/**
 * The lists hide rejected entries, so one must not block a word a person adds by hand: it goes, with its
 * aliases and quotes. Its only job was to stop the model proposing the word again.
 */
function dropRejectedOwners(db: Db, forms: string[], excludeEntryId?: string): void {
  for (const form of forms) {
    const owner = ownerOf(db, form.trim())
    if (owner?.status === 'rejected' && owner.id !== excludeEntryId) {
      db.prepare('DELETE FROM context_entry WHERE id = ?').run(owner.id)
    }
  }
}

function checkUniqueness(db: Db, source: string, aliases: string[], excludeEntryId?: string): void {
  const trimmedSource = source.trim()
  const trimmedAliases = aliases.map((a) => a.trim())

  // Check intra-input uniqueness
  for (const alias of trimmedAliases) {
    if (alias.toLowerCase() === trimmedSource.toLowerCase()) {
      throw new StorageError(
        'conflict',
        `Dạng viết khác không được trùng với từ gốc: "${trimmedSource}"`
      )
    }
  }

  const aliasSet = new Set<string>()
  for (const alias of trimmedAliases) {
    const lower = alias.toLowerCase()
    if (aliasSet.has(lower)) {
      throw new StorageError('conflict', `Dạng viết khác bị trùng lặp trong danh sách: "${alias}"`)
    }
    aliasSet.add(lower)
  }

  // Check cross-database collisions
  const candidates = [trimmedSource, ...trimmedAliases]
  for (const candidate of candidates) {
    // Check if exists as context_entry source
    const existingEntry = db
      .prepare(
        excludeEntryId
          ? `SELECT source FROM context_entry WHERE lower(source) = lower(?) AND ${GLOSSARY} AND id != ? LIMIT 1`
          : `SELECT source FROM context_entry WHERE lower(source) = lower(?) AND ${GLOSSARY} LIMIT 1`
      )
      .get<{ source: string }>(candidate, ...(excludeEntryId ? [excludeEntryId] : []))

    if (existingEntry) {
      throw new StorageError('conflict', `Thuật ngữ "${candidate}" đã tồn tại trong từ điển.`)
    }

    // Check if exists as context_alias form
    const existingAlias = db
      .prepare(
        excludeEntryId
          ? 'SELECT form FROM context_alias WHERE lower(form) = lower(?) AND entry_id != ? LIMIT 1'
          : 'SELECT form FROM context_alias WHERE lower(form) = lower(?) LIMIT 1'
      )
      .get<{ form: string }>(candidate, ...(excludeEntryId ? [excludeEntryId] : []))

    if (existingAlias) {
      throw new StorageError(
        'conflict',
        `Dạng viết khác "${candidate}" đã được sử dụng trong từ điển.`
      )
    }
  }
}

export function getContextEntry(db: Db, id: string): ContextEntryItem | null {
  const row = db.prepare('SELECT * FROM context_entry WHERE id = ?').get<ContextEntryRow>(id)
  if (!row) return null

  const aliasRows = db
    .prepare('SELECT form FROM context_alias WHERE entry_id = ? ORDER BY form ASC')
    .all<{ form: string }>(id)

  return toItem(
    row,
    aliasRows.map((a) => a.form)
  )
}

export interface ListContextOptions {
  kind?: ContextKind
  status?: ContextStatus
  query?: string
  chapterId?: string
}

export function listContextEntries(db: Db, options: ListContextOptions = {}): ContextEntryItem[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (options.kind) {
    conditions.push('e.kind = ?')
    params.push(options.kind)
  }

  if (options.status) {
    conditions.push('e.status = ?')
    params.push(options.status)
  }

  if (options.chapterId) {
    const targetChap = db
      .prepare('SELECT position FROM chapter WHERE id = ?')
      .get<{ position: number }>(options.chapterId)
    if (!targetChap) throw new StorageError('not_found', 'Không tìm thấy chương.')

    conditions.push('(e.from_chapter_id IS NULL OR fc.position IS NULL OR fc.position <= ?)')
    params.push(targetChap.position)

    conditions.push('(e.to_chapter_id IS NULL OR tc.position IS NULL OR tc.position >= ?)')
    params.push(targetChap.position)
  }

  if (options.query && options.query.trim().length > 0) {
    const q = `%${options.query.trim()}%`
    conditions.push(
      '(e.source LIKE ? OR e.target LIKE ? OR e.notes LIKE ? OR EXISTS (SELECT 1 FROM context_alias a WHERE a.entry_id = e.id AND a.form LIKE ?))'
    )
    params.push(q, q, q, q)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT e.*
    FROM context_entry e
    LEFT JOIN chapter fc ON fc.id = e.from_chapter_id
    LEFT JOIN chapter tc ON tc.id = e.to_chapter_id
    ${whereClause}
    ORDER BY e.created_at DESC, e.source ASC
  `

  const rows = db.prepare(sql).all<ContextEntryRow>(...params)
  if (rows.length === 0) return []

  const aliases = db
    .prepare('SELECT entry_id, form FROM context_alias ORDER BY form ASC')
    .all<AliasRow>()
  const aliasMap = new Map<string, string[]>()
  for (const alias of aliases) {
    const list = aliasMap.get(alias.entry_id) ?? []
    list.push(alias.form)
    aliasMap.set(alias.entry_id, list)
  }

  return rows.map((r) => toItem(r, aliasMap.get(r.id) ?? []))
}

/** Entries of one kind by status, counted in one query. */
export function countContextEntriesByStatus(
  db: Db,
  kind: ContextKind
): Record<ContextStatus, number> {
  const counts: Record<ContextStatus, number> = { approved: 0, pending: 0, rejected: 0 }
  const rows = db
    .prepare('SELECT status, count(*) AS n FROM context_entry WHERE kind = ? GROUP BY status')
    .all<{ status: ContextStatus; n: number }>(kind)
  for (const row of rows) counts[row.status] = row.n
  return counts
}

export function getEffectiveGlossary(
  db: Db,
  chapterId: string,
  options: { approvedOnly?: boolean } = {}
): ContextEntryItem[] {
  const targetChap = db
    .prepare('SELECT position FROM chapter WHERE id = ?')
    .get<{ position: number }>(chapterId)
  if (!targetChap) throw new StorageError('not_found', 'Không tìm thấy chương.')

  const approvedOnly = options.approvedOnly ?? true
  const params: (string | number)[] = [targetChap.position, targetChap.position]

  let sql = `
    SELECT e.*
    FROM context_entry e
    LEFT JOIN chapter fc ON fc.id = e.from_chapter_id
    LEFT JOIN chapter tc ON tc.id = e.to_chapter_id
    WHERE e.kind = 'term'
      AND (e.from_chapter_id IS NULL OR fc.position IS NULL OR fc.position <= ?)
      AND (e.to_chapter_id IS NULL OR tc.position IS NULL OR tc.position >= ?)
  `

  if (approvedOnly) {
    sql += " AND e.status = 'approved'"
  }

  sql += ' ORDER BY length(e.source) DESC, e.source ASC'

  const rows = db.prepare(sql).all<ContextEntryRow>(...params)
  if (rows.length === 0) return []

  const aliases = db
    .prepare('SELECT entry_id, form FROM context_alias ORDER BY form ASC')
    .all<AliasRow>()
  const aliasMap = new Map<string, string[]>()
  for (const alias of aliases) {
    const list = aliasMap.get(alias.entry_id) ?? []
    list.push(alias.form)
    aliasMap.set(alias.entry_id, list)
  }

  return rows.map((r) => toItem(r, aliasMap.get(r.id) ?? []))
}

export interface CreateContextEntryParams {
  id?: string
  kind?: ContextKind
  source: string
  target: string
  status?: ContextStatus
  origin?: ContextOrigin
  forbidden?: boolean
  fromChapterId?: string | null
  toChapterId?: string | null
  notes?: string | null
  aliases?: string[]
  now?: number
}

export function createContextEntry(db: Db, params: CreateContextEntryParams): ContextEntryItem {
  return db.transaction(() => {
    const id = params.id ?? randomUUID()
    const kind = params.kind ?? 'term'
    const source = params.source.trim()
    const target = params.target.trim()
    const status = params.status ?? 'approved'
    const origin = params.origin ?? 'user'
    const forbidden = params.forbidden ? 1 : 0
    const fromChapterId = params.fromChapterId ?? null
    const toChapterId = params.toChapterId ?? null
    const notes = params.notes?.trim() || null
    const aliases = (params.aliases ?? [])
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
      .sort((a, b) => a.localeCompare(b))
    const now = params.now ?? Date.now()

    validateChapters(db, fromChapterId, toChapterId)
    dropRejectedOwners(db, [source, ...aliases])
    checkUniqueness(db, source, aliases)

    db.prepare(`
      INSERT INTO context_entry (
        id, kind, source, target, status, origin, forbidden,
        from_chapter_id, to_chapter_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      kind,
      source,
      target,
      status,
      origin,
      forbidden,
      fromChapterId,
      toChapterId,
      notes,
      now,
      now
    )

    const insertAlias = db.prepare(`
      INSERT INTO context_alias (id, entry_id, form, created_at)
      VALUES (?, ?, ?, ?)
    `)
    for (const form of aliases) {
      insertAlias.run(randomUUID(), id, form, now)
    }

    touchWork(db, now)

    return {
      id,
      kind,
      source,
      target,
      status,
      origin,
      forbidden: forbidden === 1,
      fromChapterId,
      toChapterId,
      notes,
      aliases,
      createdAt: now,
      updatedAt: now
    }
  })
}

export interface UpdateContextEntryParams {
  source?: string
  target?: string
  status?: ContextStatus
  origin?: ContextOrigin
  forbidden?: boolean
  fromChapterId?: string | null
  toChapterId?: string | null
  notes?: string | null
  aliases?: string[]
  now?: number
}

export function updateContextEntry(
  db: Db,
  id: string,
  params: UpdateContextEntryParams
): ContextEntryItem {
  return db.transaction(() => {
    const current = getContextEntry(db, id)
    if (!current) {
      throw new StorageError('not_found', 'Không tìm thấy mục thuật ngữ.')
    }

    const now = params.now ?? Date.now()
    const nextSource = params.source !== undefined ? params.source.trim() : current.source
    const nextTarget = params.target !== undefined ? params.target.trim() : current.target
    const nextStatus = params.status ?? current.status
    const nextOrigin = params.origin ?? current.origin
    const nextForbidden = params.forbidden !== undefined ? params.forbidden : current.forbidden
    const nextFromChapterId =
      params.fromChapterId !== undefined ? params.fromChapterId : current.fromChapterId
    const nextToChapterId =
      params.toChapterId !== undefined ? params.toChapterId : current.toChapterId
    const nextNotes = params.notes !== undefined ? params.notes?.trim() || null : current.notes
    const nextAliases =
      params.aliases !== undefined
        ? params.aliases
            .map((a) => a.trim())
            .filter((a) => a.length > 0)
            .sort((a, b) => a.localeCompare(b))
        : current.aliases

    validateChapters(db, nextFromChapterId, nextToChapterId)

    const sourceChanged = nextSource.toLowerCase() !== current.source.toLowerCase()
    const aliasesChanged =
      nextAliases.length !== current.aliases.length ||
      nextAliases.some((a, i) => a.toLowerCase() !== (current.aliases[i]?.toLowerCase() ?? ''))

    if (sourceChanged || aliasesChanged) {
      dropRejectedOwners(db, [nextSource, ...nextAliases], id)
      checkUniqueness(db, nextSource, nextAliases, id)
    }

    db.prepare(`
      UPDATE context_entry
      SET source = ?, target = ?, status = ?, origin = ?, forbidden = ?,
          from_chapter_id = ?, to_chapter_id = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nextSource,
      nextTarget,
      nextStatus,
      nextOrigin,
      nextForbidden ? 1 : 0,
      nextFromChapterId,
      nextToChapterId,
      nextNotes,
      now,
      id
    )

    if (params.aliases !== undefined) {
      db.prepare('DELETE FROM context_alias WHERE entry_id = ?').run(id)
      const insertAlias = db.prepare(`
        INSERT INTO context_alias (id, entry_id, form, created_at)
        VALUES (?, ?, ?, ?)
      `)
      for (const form of nextAliases) {
        insertAlias.run(randomUUID(), id, form, now)
      }
    }

    touchWork(db, now)

    return {
      id,
      kind: current.kind,
      source: nextSource,
      target: nextTarget,
      status: nextStatus,
      origin: nextOrigin,
      forbidden: nextForbidden,
      fromChapterId: nextFromChapterId,
      toChapterId: nextToChapterId,
      notes: nextNotes,
      aliases: nextAliases,
      createdAt: current.createdAt,
      updatedAt: now
    }
  })
}

export function deleteContextEntry(db: Db, id: string, now?: number): void {
  db.transaction(() => {
    const existing = db.prepare('SELECT id FROM context_entry WHERE id = ?').get<{ id: string }>(id)
    if (!existing) {
      throw new StorageError('not_found', 'Không tìm thấy mục thuật ngữ.')
    }

    db.prepare('DELETE FROM context_entry WHERE id = ?').run(id)
    touchWork(db, now ?? Date.now())
  })
}

// -----------------------------------------------------------------------------------------------------
// AI extraction: candidates with evidence, scanned chapters, review data (change
// `add-agent-context-workflow`).

export interface ExtractedCandidateWrite {
  source: string
  target: string
  termType: string
  /** `rejected` for what the model called `not-a-term`, so it is not proposed again. */
  status: 'approved' | 'rejected'
  aliases?: string[]
  notes?: string | null
  /** Flags the caller already knows (`script_mismatch`); alias conflicts are found here. */
  flags?: ReviewFlag[]
  evidence: Array<{ chapterId: string | null; quote: string }>
}

export interface SaveExtractionInput {
  runId: string
  model: string
  promptHash: string
  /** Chapters this write finishes scanning; recorded in the same transaction. */
  scannedChapterIds: string[]
  candidates: ExtractedCandidateWrite[]
  now?: number
  newId?: () => string
}

export interface SaveExtractionResult {
  /** New entries that apply (`approved`); not-a-term rows are left out. */
  pending: string[]
  skipped: number
}

interface MatchRow {
  id: string
  status: ContextStatus
  review_flags: string
}

/** The entry that already owns `form`, as its source or as an alias. */
function ownerOf(db: Db, form: string): MatchRow | null {
  return (
    db
      .prepare(
        `SELECT id, status, review_flags FROM context_entry WHERE lower(source) = lower(?) AND ${GLOSSARY}
         UNION ALL
         SELECT e.id, e.status, e.review_flags FROM context_alias a
           JOIN context_entry e ON e.id = a.entry_id WHERE lower(a.form) = lower(?)
         LIMIT 1`
      )
      .get<MatchRow>(form, form) ?? null
  )
}

const parseFlags = (json: string): ReviewFlag[] => {
  try {
    const flags = JSON.parse(json) as unknown
    return Array.isArray(flags) ? (flags as ReviewFlag[]) : []
  } catch {
    return []
  }
}

/**
 * Writes one extraction step in one transaction: candidates, their quotes and the scanned chapters. A
 * candidate that matches any entry is dropped, a rejected one included: with no review step left, a
 * person's rejection or the model's not-a-term stands. An alias another entry owns is left off and
 * becomes an `alias_conflict` flag instead of an error.
 */
export function saveExtraction(db: Db, input: SaveExtractionInput): SaveExtractionResult {
  const now = input.now ?? Date.now()
  const newId = input.newId ?? randomUUID
  return db.transaction(() => {
    const pending: string[] = []
    let skipped = 0
    const insertEvidence = db.prepare(
      `INSERT INTO context_entry_evidence
         (id, entry_id, run_id, chapter_id, quote, model, prompt_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const addEvidence = (entryId: string, evidence: ExtractedCandidateWrite['evidence']): void => {
      for (const quote of evidence) {
        insertEvidence.run(
          newId(),
          entryId,
          input.runId,
          quote.chapterId,
          quote.quote,
          input.model,
          input.promptHash,
          now
        )
      }
    }

    for (const candidate of input.candidates) {
      const source = candidate.source.trim()
      if (ownerOf(db, source)) {
        skipped++
        continue
      }

      const flags = [...(candidate.flags ?? [])]
      const aliases: string[] = []
      for (const raw of candidate.aliases ?? []) {
        const form = raw.trim()
        if (form === '' || form.toLowerCase() === source.toLowerCase()) continue
        if (aliases.some((alias) => alias.toLowerCase() === form.toLowerCase())) continue
        if (ownerOf(db, form)) flags.push({ code: 'alias_conflict', detail: form })
        else aliases.push(form)
      }
      const id = newId()
      db.prepare(
        `INSERT INTO context_entry (id, kind, source, target, status, origin, forbidden, notes,
           term_type, review_flags, created_at, updated_at)
         VALUES (?, 'term', ?, ?, ?, 'ai', 0, ?, ?, ?, ?, ?)`
      ).run(
        id,
        source,
        candidate.target.trim(),
        candidate.status,
        candidate.notes?.trim() || null,
        candidate.termType,
        JSON.stringify(flags),
        now,
        now
      )
      const insertAlias = db.prepare(
        'INSERT INTO context_alias (id, entry_id, form, created_at) VALUES (?, ?, ?, ?)'
      )
      for (const form of aliases) insertAlias.run(newId(), id, form, now)
      addEvidence(id, candidate.evidence)
      if (candidate.status !== 'rejected') pending.push(id)
    }

    const scan = db.prepare(
      `INSERT OR REPLACE INTO context_extraction_scan (chapter_id, run_id, model, prompt_hash, scanned_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const chapterId of input.scannedChapterIds) {
      scan.run(chapterId, input.runId, input.model, input.promptHash, now)
    }
    if (input.candidates.length > 0) touchWork(db, now)
    return { pending, skipped }
  })
}

/** Whether the work has any glossary term that is approved or waiting for review. */
export function hasGlossary(db: Db): boolean {
  return (
    db
      .prepare(
        "SELECT 1 AS found FROM context_entry WHERE kind = 'term' AND status IN ('approved', 'pending') LIMIT 1"
      )
      .get<{ found: number }>() !== undefined
  )
}

/** The chapters an extraction run already scanned. */
export function listScannedChapterIds(db: Db): Set<string> {
  return new Set(
    db
      .prepare('SELECT chapter_id FROM context_extraction_scan')
      .all<{ chapter_id: string }>()
      .map((row) => row.chapter_id)
  )
}

/** Review data of the given entries (or of every entry that has a type, flags or evidence). */
export function readReviewInfo(db: Db, entryIds?: string[]): ContextReviewInfo[] {
  const rows = db
    .prepare(
      `SELECT id, term_type, review_flags FROM context_entry e
       WHERE term_type IS NOT NULL OR review_flags != '[]'
         OR EXISTS (SELECT 1 FROM context_entry_evidence v WHERE v.entry_id = e.id)`
    )
    .all<{ id: string; term_type: string | null; review_flags: string }>()
  const wanted = entryIds ? new Set(entryIds) : null
  const evidence = new Map<string, ContextEvidence[]>()
  for (const row of db
    .prepare(
      `SELECT id, entry_id, run_id, chapter_id, quote, model, prompt_hash, created_at
       FROM context_entry_evidence ORDER BY created_at, rowid`
    )
    .all<{
      id: string
      entry_id: string
      run_id: string
      chapter_id: string | null
      quote: string
      model: string
      prompt_hash: string
      created_at: number
    }>()) {
    const list = evidence.get(row.entry_id) ?? []
    list.push({
      id: row.id,
      runId: row.run_id,
      chapterId: row.chapter_id,
      quote: row.quote,
      model: row.model,
      promptHash: row.prompt_hash,
      createdAt: row.created_at
    })
    evidence.set(row.entry_id, list)
  }
  return rows
    .filter((row) => !wanted || wanted.has(row.id))
    .map((row) => ({
      entryId: row.id,
      termType: row.term_type,
      flags: parseFlags(row.review_flags),
      evidence: evidence.get(row.id) ?? []
    }))
}
