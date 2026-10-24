import type {
  SegmentInput,
  SegmentRecord,
  SegmentStatus,
  TextRecord,
  TextSide
} from '../../../shared/contracts/text'
import { StorageError } from './errors'
import type { Db } from './sqlite'
import { checkText } from './textRules'

/**
 * Chapter text and its segments inside one work file. The text and every segment of a side are
 * written together in one transaction (the caller opens it), so a segment never points at a
 * revision that does not exist.
 */

interface SegmentRow {
  id: string
  start_offset: number
  end_offset: number
  text_rev: number
  status: SegmentStatus
}

function assertChapter(db: Db, chapterId: string): void {
  const row = db
    .prepare('SELECT 1 AS found FROM chapter WHERE id = ?')
    .get<{ found: number }>(chapterId)
  if (!row) throw new StorageError('not_found', 'Không tìm thấy chương.')
}

function listSegments(db: Db, chapterId: string, side: TextSide): SegmentRecord[] {
  return db
    .prepare(
      `SELECT id, start_offset, end_offset, text_rev, status FROM segment
       WHERE chapter_id = ? AND side = ? ORDER BY position`
    )
    .all<SegmentRow>(chapterId, side)
    .map((row) => ({
      id: row.id,
      start: row.start_offset,
      end: row.end_offset,
      textRev: row.text_rev,
      status: row.status
    }))
}

/** A side that was never saved reads as empty at revision 0; reading never creates a row. */
export function readText(db: Db, chapterId: string, side: TextSide): TextRecord {
  assertChapter(db, chapterId)
  const row = db
    .prepare('SELECT content, rev FROM chapter_text WHERE chapter_id = ? AND side = ?')
    .get<{ content: string; rev: number }>(chapterId, side)
  return {
    content: row?.content ?? '',
    rev: row?.rev ?? 0,
    segments: listSegments(db, chapterId, side)
  }
}

/**
 * The content of one side of every chapter, in one query and without segments: what a scan over the
 * whole work needs (`search_work`). Chapters with nothing saved on that side are absent.
 */
export function readSideContents(db: Db, side: TextSide): Map<string, string> {
  const rows = db
    .prepare('SELECT chapter_id, content FROM chapter_text WHERE side = ?')
    .all<{ chapter_id: string; content: string }>(side)
  return new Map(rows.map((row) => [row.chapter_id, row.content]))
}

export interface SaveTextArgs {
  chapterId: string
  side: TextSide
  content: string
  /** The revision the caller last read; 0 for a side that has never been saved. */
  expectedRev: number
  segments: SegmentInput[]
}

/**
 * Replaces the text and all segments of one side. Segments that carry an id keep it (the id must
 * already belong to this chapter and side); segments left out are deleted, which flags any link
 * that used them for review. Every save counts as an edit and raises the revision.
 */
export function saveText(db: Db, args: SaveTextArgs, now: number, newId: () => string): TextRecord {
  const { chapterId, side, content, expectedRev, segments } = args
  assertChapter(db, chapterId)
  checkText(content, segments)

  const current = db
    .prepare('SELECT rev, content FROM chapter_text WHERE chapter_id = ? AND side = ?')
    .get<{ rev: number; content: string }>(chapterId, side)
  const rev = current?.rev ?? 0
  if (expectedRev !== rev) {
    throw new StorageError(
      'conflict',
      'Văn bản đã đổi ở nơi khác (revision hiện tại ' +
        rev +
        ', bạn đang giữ ' +
        expectedRev +
        '). Hãy tải lại.'
    )
  }

  const existing = new Set(
    db
      .prepare('SELECT id FROM segment WHERE chapter_id = ? AND side = ?')
      .all<{ id: string }>(chapterId, side)
      .map((row) => row.id)
  )
  for (const segment of segments) {
    if (segment.id !== undefined && !existing.has(segment.id)) {
      throw new StorageError(
        'validation',
        'Segment ' + segment.id + ' không thuộc chương và bên này.'
      )
    }
  }

  const nextRev = rev + 1
  if (current === undefined) {
    db.prepare(
      `INSERT INTO chapter_text (chapter_id, side, content, rev, updated_at, size)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(chapterId, side, content, nextRev, now, content.length)
  } else {
    const result = db
      .prepare(
        `UPDATE chapter_text SET content = ?, rev = ?, updated_at = ?, size = ?
         WHERE chapter_id = ? AND side = ? AND rev = ?`
      )
      .run(content, nextRev, now, content.length, chapterId, side, expectedRev)
    // Zero rows means someone else got in between the read and the write.
    if (result.changes !== 1)
      throw new StorageError('conflict', 'Văn bản đã đổi ở nơi khác. Hãy tải lại.')
    // A source that changed must be scanned for terms again.
    if (side === 'source' && current.content !== content)
      db.prepare('DELETE FROM context_extraction_scan WHERE chapter_id = ?').run(chapterId)
  }

  const kept = new Set(
    segments.flatMap((segment) => (segment.id === undefined ? [] : [segment.id]))
  )
  // Prepared once: a chapter can have thousands of segments and every one is written here.
  const remove = db.prepare('DELETE FROM segment WHERE id = ?')
  const update = db.prepare(
    `UPDATE segment SET position = ?, start_offset = ?, end_offset = ?, text_rev = ?, status = 'ok'
     WHERE id = ?`
  )
  const insert = db.prepare(
    `INSERT INTO segment (id, chapter_id, side, position, start_offset, end_offset, text_rev, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')`
  )
  for (const id of existing) {
    if (!kept.has(id)) remove.run(id)
  }

  segments.forEach((segment, position) => {
    if (segment.id !== undefined) {
      update.run(position, segment.start, segment.end, nextRev, segment.id)
    } else {
      insert.run(newId(), chapterId, side, position, segment.start, segment.end, nextRev)
    }
  })

  db.prepare('UPDATE chapter SET updated_at = ? WHERE id = ?').run(now, chapterId)
  db.prepare('UPDATE work SET updated_at = ?').run(now)
  return readText(db, chapterId, side)
}
