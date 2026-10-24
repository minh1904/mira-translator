import {
  CULTURE_IDS,
  SETTING_IDS,
  type CultureId,
  type SettingId
} from '../../../shared/contracts/addressing/types'
import type {
  CreateWorkInput,
  WorkPatch,
  WorkSetting,
  WorkSummary
} from '../../../shared/contracts/library'
import type { ImageMime } from '../../../shared/contracts/images'
import type { CoverImage } from './cover'
import { StorageError } from './errors'
import type { StoredImage } from './image'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { workSchema } from './workSchema'

/** Operations on a single work file (`works/<id>.mira`). The file is the source of truth. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Work ids become file names, so anything that is not a UUID is rejected before touching disk. */
export function assertWorkId(id: string): void {
  if (!UUID.test(id)) throw new StorageError('validation', 'ID tác phẩm không hợp lệ.')
}

export interface WorkRow {
  id: string
  title: string
  original_title: string | null
  description: string | null
  author: string | null
  genre: string | null
  setting: string | null
  settings_extra: string | null
  culture: string | null
  source_lang: WorkSummary['sourceLang']
  status: WorkSummary['status']
  archived: number
  chapter_count: number
  last_chapter_id: string | null
  last_chapter_number: number | null
  last_chapter_title: string | null
  cover_version: number | null
  created_at: number
  updated_at: number
}

const isSetting = (value: string): value is SettingId =>
  (SETTING_IDS as readonly string[]).includes(value)
const isCulture = (value: string): value is CultureId =>
  (CULTURE_IDS as readonly string[]).includes(value)

/** A value another version wrote that this one does not know reads as "not chosen", never as an error. */
function readSetting(value: string | null): WorkSetting | null {
  return value === 'none' || (value !== null && isSetting(value)) ? (value as WorkSetting) : null
}

function readExtra(setting: WorkSetting | null, value: string | null): SettingId[] {
  if (setting === null || setting === 'none' || !value) return []
  return value
    .split(',')
    .filter(isSetting)
    .filter((id) => id !== setting)
}

export function rowToSummary(row: WorkRow): WorkSummary {
  const setting = readSetting(row.setting)
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title,
    description: row.description,
    author: row.author,
    genre: row.genre,
    setting,
    settingsExtra: readExtra(setting, row.settings_extra),
    culture: row.culture !== null && isCulture(row.culture) ? row.culture : null,
    coverVersion: row.cover_version,
    sourceLang: row.source_lang,
    status: row.status,
    archived: row.archived === 1,
    chapterCount: row.chapter_count,
    lastChapter:
      row.last_chapter_id !== null && row.last_chapter_number !== null
        ? {
            id: row.last_chapter_id,
            number: row.last_chapter_number,
            title: row.last_chapter_title ?? ''
          }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const SELECT_WORK = `
  SELECT w.id, w.title, w.original_title, w.description, w.author, w.genre, w.setting, w.settings_extra, w.culture, w.source_lang, w.status, w.archived,
         (SELECT count(*) FROM chapter) AS chapter_count,
         lc.id AS last_chapter_id,
         (SELECT count(*) FROM chapter c WHERE c.position < lc.position) + 1 AS last_chapter_number,
         lc.title AS last_chapter_title,
         (SELECT updated_at FROM cover) AS cover_version,
         w.created_at, w.updated_at
  FROM work w LEFT JOIN chapter lc ON lc.id = w.last_chapter_id`

/** Opens a work file, upgrading its schema if needed. The caller closes it. */
export function openWorkFile(path: string): Db {
  const db = openDatabase(path)
  try {
    migrate(db, workSchema)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function readWork(db: Db): WorkSummary {
  const row = db.prepare(SELECT_WORK).get<WorkRow>()
  if (!row) throw new StorageError('corrupt', 'Tệp tác phẩm không có thông tin tác phẩm.')
  return rowToSummary(row)
}

export function insertWork(db: Db, id: string, input: CreateWorkInput, now: number): void {
  db.prepare(
    `INSERT INTO work (
       id, title, original_title, description, author, genre, setting, settings_extra, culture,
       source_lang, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.title,
    emptyToNull(input.originalTitle),
    emptyToNull(input.description),
    emptyToNull(input.author),
    emptyToNull(input.genre),
    input.setting ?? null,
    normalizeExtra(input.setting ?? null, input.settingsExtra ?? []),
    input.culture ?? null,
    input.sourceLang,
    now,
    now
  )
}

/** Applies a patch and returns whether anything changed. Absent keys are left untouched. */
export function patchWork(db: Db, patch: WorkPatch, now: number): boolean {
  const sets: string[] = []
  const params: (string | number | null)[] = []
  const set = (column: string, value: string | number | null): void => {
    sets.push(column + ' = ?')
    params.push(value)
  }

  if (patch.title !== undefined) set('title', patch.title.trim())
  if (patch.originalTitle !== undefined) set('original_title', emptyToNull(patch.originalTitle))
  if (patch.description !== undefined) set('description', emptyToNull(patch.description))
  if (patch.author !== undefined) set('author', emptyToNull(patch.author))
  if (patch.genre !== undefined) set('genre', emptyToNull(patch.genre))
  if (patch.setting !== undefined) set('setting', patch.setting)
  if (patch.culture !== undefined) set('culture', patch.culture)
  if (patch.setting !== undefined || patch.settingsExtra !== undefined) {
    // Extra settings follow the primary one: they stay only while it is a real setting, and never repeat it.
    const current = db
      .prepare('SELECT setting, settings_extra FROM work')
      .get<{ setting: string | null; settings_extra: string | null }>()
    const setting =
      patch.setting !== undefined ? patch.setting : readSetting(current?.setting ?? null)
    const extra =
      patch.settingsExtra ??
      readExtra(readSetting(current?.setting ?? null), current?.settings_extra ?? null)
    const hasPrimary = setting !== null && setting !== 'none'
    if (patch.settingsExtra && patch.settingsExtra.length > 0 && !hasPrimary) {
      throw new StorageError('validation', 'Chọn bối cảnh chính trước khi thêm bối cảnh phụ.')
    }
    set('settings_extra', normalizeExtra(setting, extra))
  }
  if (patch.status !== undefined) set('status', patch.status)
  if (patch.archived !== undefined) set('archived', patch.archived ? 1 : 0)

  if (sets.length === 0) return false
  set('updated_at', now)
  db.prepare('UPDATE work SET ' + sets.join(', ')).run(...params)
  return true
}

/** Comma-joined extra settings without repeats and without the primary one; null when none are left. */
function normalizeExtra(setting: WorkSetting | null, extra: readonly SettingId[]): string | null {
  if (setting === null || setting === 'none') return null
  const kept = extra.filter((id, index) => id !== setting && extra.indexOf(id) === index)
  return kept.length === 0 ? null : kept.join(',')
}

/** Storage does not rely on callers having trimmed: blank optional text is stored as null. */
function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

/** Replaces or removes the cover. Changing it counts as editing the work. */
export function writeCover(db: Db, cover: CoverImage | null, now: number): void {
  if (cover === null) {
    db.prepare('DELETE FROM cover').run()
  } else {
    db.prepare(
      `INSERT INTO cover (id, mime, data, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`
    ).run(cover.mime, cover.data, now)
  }
  db.prepare('UPDATE work SET updated_at = ?').run(now)
}

export function readCover(db: Db): CoverImage | null {
  const row = db
    .prepare('SELECT mime, data FROM cover')
    .get<{ mime: 'image/jpeg'; data: Uint8Array }>()
  return row ? { mime: row.mime, data: row.data } : null
}

/** Inserts a new image blob; `id` is generated by the caller (never derived from file names). */
export function insertImage(db: Db, id: string, image: StoredImage, now: number): void {
  db.prepare('INSERT INTO image (id, mime, data, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    image.mime,
    image.data,
    now
  )
}

export function readImage(db: Db, id: string): StoredImage | null {
  const row = db
    .prepare('SELECT mime, data FROM image WHERE id = ?')
    .get<{ mime: ImageMime; data: Uint8Array }>(id)
  return row ? { mime: row.mime, data: row.data } : null
}

/** A no-op when the image is already gone: deleting an embed's image twice must not be an error. */
export function deleteImage(db: Db, id: string): void {
  db.prepare('DELETE FROM image WHERE id = ?').run(id)
}

export function countImages(db: Db): number {
  const row = db.prepare('SELECT count(*) AS n FROM image').get<{ n: number }>()
  return row?.n ?? 0
}
