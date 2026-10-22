import type { LinkKind, LinkRecord, LinkStatus } from '../../../shared/contracts/links'
import { StorageError } from './errors'
import type { Db } from './sqlite'

export type { LinkKind, LinkRecord, LinkStatus }

/**
 * Links between segments (n:m) and where each translated segment came from. These are repository
 * functions with tests; no IPC channel exposes them yet (the editor and translation jobs will).
 */

export interface LinkInput {
  kind: LinkKind
  confidence?: number | null
  status?: LinkStatus
  /** Set when the link is created already confirmed (a person wrote the translation). */
  reviewedAt?: number | null
  /** Segment ids, at least one from each side. Their order is kept. */
  members: string[]
}

export type ProvenanceOrigin = 'human' | 'ai' | 'mock' | 'import'

export interface ProvenanceRecord {
  segmentId: string
  origin: ProvenanceOrigin
  provider: string | null
  model: string | null
  at: number
}

interface LinkRow {
  id: string
  chapter_id: string
  kind: LinkKind
  confidence: number | null
  status: LinkStatus
  created_at: number
  reviewed_at: number | null
}

export function createLink(
  db: Db,
  chapterId: string,
  input: LinkInput,
  now: number,
  id: string
): LinkRecord {
  if (new Set(input.members).size !== input.members.length) {
    throw new StorageError('validation', 'Liên kết có segment bị lặp.')
  }
  const sides = new Set<string>()
  for (const memberId of input.members) {
    const row = db
      .prepare('SELECT side FROM segment WHERE id = ? AND chapter_id = ?')
      .get<{ side: string }>(memberId, chapterId)
    if (!row)
      throw new StorageError('validation', 'Segment ' + memberId + ' không thuộc chương này.')
    sides.add(row.side)
  }
  if (!sides.has('source') || !sides.has('target')) {
    throw new StorageError(
      'validation',
      'Liên kết cần ít nhất một segment nguồn và một segment dịch.'
    )
  }
  if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) {
    throw new StorageError('validation', 'Mức tin cậy phải từ 0 tới 1.')
  }

  db.prepare(
    `INSERT INTO link (id, chapter_id, kind, confidence, status, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    chapterId,
    input.kind,
    input.confidence ?? null,
    input.status ?? 'ok',
    now,
    input.reviewedAt ?? null
  )
  input.members.forEach((memberId, position) => {
    db.prepare('INSERT INTO link_member (link_id, segment_id, position) VALUES (?, ?, ?)').run(
      id,
      memberId,
      position
    )
  })
  return {
    id,
    chapterId,
    kind: input.kind,
    confidence: input.confidence ?? null,
    status: input.status ?? 'ok',
    members: [...input.members],
    createdAt: now,
    reviewedAt: input.reviewedAt ?? null
  }
}

export function listLinks(db: Db, chapterId: string): LinkRecord[] {
  const rows = db
    .prepare(
      `SELECT id, chapter_id, kind, confidence, status, created_at, reviewed_at FROM link
       WHERE chapter_id = ? ORDER BY created_at, id`
    )
    .all<LinkRow>(chapterId)
  // One query for every member of the chapter's links, not one per link: a chapter can have thousands.
  const membersByLink = new Map<string, string[]>()
  const members = db
    .prepare(
      `SELECT m.link_id, m.segment_id FROM link_member m
       JOIN link l ON l.id = m.link_id
       WHERE l.chapter_id = ? ORDER BY m.link_id, m.position`
    )
    .all<{ link_id: string; segment_id: string }>(chapterId)
  for (const member of members) {
    const list = membersByLink.get(member.link_id)
    if (list) list.push(member.segment_id)
    else membersByLink.set(member.link_id, [member.segment_id])
  }
  return rows.map((row) => ({
    id: row.id,
    chapterId: row.chapter_id,
    kind: row.kind,
    confidence: row.confidence,
    status: row.status,
    members: membersByLink.get(row.id) ?? [],
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at
  }))
}

/** Removes a link and its membership; the segments stay. */
export function deleteLink(db: Db, linkId: string): void {
  db.prepare('DELETE FROM link WHERE id = ?').run(linkId)
}

/** Records where a segment's text came from; a later call replaces the earlier record. */
export function setProvenance(db: Db, record: ProvenanceRecord): void {
  const exists = db
    .prepare('SELECT 1 AS found FROM segment WHERE id = ?')
    .get<{ found: number }>(record.segmentId)
  if (!exists) throw new StorageError('not_found', 'Không tìm thấy segment.')
  db.prepare(
    `INSERT INTO provenance (segment_id, origin, provider, model, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (segment_id) DO UPDATE SET
       origin = excluded.origin, provider = excluded.provider, model = excluded.model, at = excluded.at`
  ).run(record.segmentId, record.origin, record.provider, record.model, record.at)
}

export function getProvenance(db: Db, segmentId: string): ProvenanceRecord | null {
  const row = db
    .prepare('SELECT segment_id, origin, provider, model, at FROM provenance WHERE segment_id = ?')
    .get<{
      segment_id: string
      origin: ProvenanceOrigin
      provider: string | null
      model: string | null
      at: number
    }>(segmentId)
  return row
    ? {
        segmentId: row.segment_id,
        origin: row.origin,
        provider: row.provider,
        model: row.model,
        at: row.at
      }
    : null
}
