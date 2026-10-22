import type { ChapterItem } from '../../../shared/contracts/chapters'
import { StorageError } from './errors'
import type { Db } from './sqlite'

/**
 * Chapter operations inside one work file. Invariant: `chapter.position` is always a gapless
 * permutation 0..n-1. There is no UNIQUE constraint on it (the shifting statements pass through
 * duplicates mid-update), so every operation that changes positions must run in one transaction.
 */

interface ChapterRow {
  id: string
  position: number
  title: string
  created_at: number
  updated_at: number
  has_source: number
  has_target: number
}

/**
 * The two flags read `size` through the covering index chapter_text_presence, so listing never
 * touches the text itself.
 */
export const CHAPTER_SELECT = `
  SELECT c.id, c.position, c.title, c.created_at, c.updated_at,
    EXISTS (SELECT 1 FROM chapter_text t INDEXED BY chapter_text_presence
            WHERE t.chapter_id = c.id AND t.side = 'source' AND t.size > 0) AS has_source,
    EXISTS (SELECT 1 FROM chapter_text t INDEXED BY chapter_text_presence
            WHERE t.chapter_id = c.id AND t.side = 'target' AND t.size > 0) AS has_target
  FROM chapter c`

function toItem(row: ChapterRow): ChapterItem {
  return {
    id: row.id,
    number: row.position + 1,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasSource: row.has_source === 1,
    hasTarget: row.has_target === 1
  }
}

export function listChapters(db: Db): ChapterItem[] {
  return db
    .prepare(CHAPTER_SELECT + ' ORDER BY c.position')
    .all<ChapterRow>()
    .map(toItem)
}

export interface TranslationProgress {
  chapterCount: number
  /** Chapters with at least one translated segment. */
  translatedChapters: number
  /** Number (1-based) of the first chapter without a translated segment; null when all have one. */
  firstUntranslatedNumber: number | null
}

/** Translation progress of the whole work in one query; no chapter text is read. */
export function readTranslationProgress(db: Db): TranslationProgress {
  const row = db
    .prepare(
      `SELECT count(*) AS total,
         coalesce(sum(translated), 0) AS translated,
         min(CASE WHEN translated = 0 THEN position END) AS first_untranslated
       FROM (
         SELECT c.position AS position,
           EXISTS (SELECT 1 FROM segment s WHERE s.chapter_id = c.id AND s.side = 'target') AS translated
         FROM chapter c
       )`
    )
    .get<{ total: number; translated: number; first_untranslated: number | null }>()
  return {
    chapterCount: row?.total ?? 0,
    translatedChapters: row?.translated ?? 0,
    firstUntranslatedNumber:
      row?.first_untranslated === null || row?.first_untranslated === undefined
        ? null
        : row.first_untranslated + 1
  }
}

function findChapter(db: Db, chapterId: string): ChapterRow {
  const row = db.prepare(CHAPTER_SELECT + ' WHERE c.id = ?').get<ChapterRow>(chapterId)
  if (!row) throw new StorageError('not_found', 'Không tìm thấy chương.')
  return row
}

function countChapters(db: Db): number {
  return db.prepare('SELECT count(*) AS n FROM chapter').get<{ n: number }>()?.n ?? 0
}

/** Any chapter work counts as work on the work itself. */
function touchWork(db: Db, now: number): void {
  db.prepare('UPDATE work SET updated_at = ?').run(now)
}

export function getChapter(db: Db, chapterId: string): ChapterItem {
  return toItem(findChapter(db, chapterId))
}

/** Appends a chapter; the title may be empty (shown as "Chương N"). */
export function insertChapter(db: Db, id: string, title: string, now: number): ChapterItem {
  db.prepare(
    `INSERT INTO chapter (id, position, title, created_at, updated_at)
     VALUES (?, (SELECT count(*) FROM chapter), ?, ?, ?)`
  ).run(id, title, now, now)
  touchWork(db, now)
  return getChapter(db, id)
}

/** Inserts a chapter at 0-based `targetPosition`, shifting subsequent chapters up. */
export function insertChapterAt(
  db: Db,
  id: string,
  targetPosition: number,
  title: string,
  now: number
): ChapterItem {
  const total = countChapters(db)
  const pos = Math.max(0, Math.min(Math.floor(targetPosition), total))
  if (pos < total) {
    db.prepare('UPDATE chapter SET position = position + 1 WHERE position >= ?').run(pos)
  }
  db.prepare(
    `INSERT INTO chapter (id, position, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, pos, title, now, now)
  touchWork(db, now)
  return getChapter(db, id)
}

export function renameChapter(db: Db, chapterId: string, title: string, now: number): ChapterItem {
  findChapter(db, chapterId)
  db.prepare('UPDATE chapter SET title = ?, updated_at = ? WHERE id = ?').run(title, now, chapterId)
  touchWork(db, now)
  return getChapter(db, chapterId)
}

/** `to` is 1-based. Moving a chapter onto its own position changes nothing, including timestamps. */
export function moveChapter(db: Db, chapterId: string, to: number, now: number): void {
  const total = countChapters(db)
  if (!Number.isInteger(to) || to < 1 || to > total) {
    throw new StorageError('validation', 'Vị trí phải từ 1 đến ' + total + '.')
  }
  const from = findChapter(db, chapterId).position
  const target = to - 1
  if (from === target) return

  if (from < target) {
    db.prepare(
      'UPDATE chapter SET position = position - 1 WHERE position > ? AND position <= ?'
    ).run(from, target)
  } else {
    db.prepare(
      'UPDATE chapter SET position = position + 1 WHERE position >= ? AND position < ?'
    ).run(target, from)
  }
  db.prepare('UPDATE chapter SET position = ?, updated_at = ? WHERE id = ?').run(
    target,
    now,
    chapterId
  )
  touchWork(db, now)
}

/** Child rows and `work.last_chapter_id` are handled by their foreign keys. */
export function deleteChapter(db: Db, chapterId: string, now: number): void {
  const { position } = findChapter(db, chapterId)
  db.prepare('DELETE FROM chapter WHERE id = ?').run(chapterId)
  db.prepare('UPDATE chapter SET position = position - 1 WHERE position > ?').run(position)
  touchWork(db, now)
}

/**
 * Records the chapter as the one being worked on. A work that has not been started becomes
 * in progress; a paused work stays paused because that was the user's choice.
 */
export function openChapter(db: Db, chapterId: string, now: number): void {
  findChapter(db, chapterId)
  db.prepare(
    `UPDATE work SET last_chapter_id = ?, updated_at = ?,
       status = CASE status WHEN 'not-started' THEN 'in-progress' ELSE status END`
  ).run(chapterId, now)
}
