import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { WorkList, WorkProblem, WorkSummary } from '../../../shared/contracts/library'
import { exportToFile, verifyWorkFile } from './backupFile'
import { StorageError, toStorageError } from './errors'
import { createLibraryBackup, findLatestValidLibraryBackup, removeSideFiles } from './libraryBackup'
import { librarySchema } from './librarySchema'
import { latestVersion, migrate, readPragmas } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { assertWorkId, openWorkFile, readWork, rowToSummary, type WorkRow } from './workFile'

export interface WorkFilesOptions {
  /** Directory that holds `library.db` and `works/`. */
  dataDir: string
  now: () => number
}

const WORK_EXTENSION = '.mira'
const PART_EXTENSION = '.part'

interface IndexRow extends WorkRow {
  file_name: string
}

/**
 * The library's files on disk: `library.db` (the index of works, and the app-level database) and one
 * SQLite file per work, which is the source of truth. This class knows where the files are and how to
 * open, create, import, export and reconcile them; it knows nothing about what is inside a work. The
 * index is a cache and is rebuilt from the work files on startup, so losing it loses nothing.
 */
export class WorkFiles {
  private readonly worksDir: string
  private readonly tmpDir: string
  private readonly backupsDir: string
  /** `library.db`: the index of works, and room for data that belongs to no single work. */
  readonly index: Db
  private problems: WorkProblem[] = []

  private constructor(
    private readonly dataDir: string,
    private readonly now: () => number
  ) {
    this.worksDir = join(dataDir, 'works')
    this.tmpDir = join(this.worksDir, '.tmp')
    this.backupsDir = join(dataDir, 'backups')
    mkdirSync(this.tmpDir, { recursive: true })
    mkdirSync(this.backupsDir, { recursive: true })
    this.index = this.openIndex()
  }

  static open(options: WorkFilesOptions): WorkFiles {
    const files = new WorkFiles(options.dataDir, options.now)
    files.reconcile()
    return files
  }

  list(): WorkList {
    const rows = this.index
      .prepare('SELECT * FROM work_index ORDER BY updated_at DESC, title')
      .all<IndexRow>()
    return { works: rows.map(rowToSummary), problems: [...this.problems] }
  }

  withWork<T>(id: string, fn: (db: Db) => T): T {
    assertWorkId(id)
    const path = this.workPath(id)
    if (!existsSync(path)) throw new StorageError('not_found', 'Không tìm thấy tác phẩm.')
    try {
      const db = openWorkFile(path)
      try {
        return fn(db)
      } finally {
        db.close()
      }
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async withWorkAsync<T>(id: string, fn: (db: Db) => Promise<T>): Promise<T> {
    assertWorkId(id)
    const path = this.workPath(id)
    if (!existsSync(path)) throw new StorageError('not_found', 'Không tìm thấy tác phẩm.')
    try {
      const db = openWorkFile(path)
      try {
        return await fn(db)
      } finally {
        db.close()
      }
    } catch (error) {
      throw toStorageError(error)
    }
  }

  /**
   * Builds a new work file in `.tmp` with `build`, then moves it into place. The rename is the commit
   * point: a work file is either complete or absent, and a failure leaves nothing behind.
   */
  createWorkFile<T>(id: string, build: (db: Db) => T): T {
    assertWorkId(id)
    const finalPath = this.workPath(id)
    const partPath = this.partPath(id)

    let built: T
    try {
      const db = openWorkFile(partPath)
      try {
        built = build(db)
      } finally {
        db.close()
      }
      // The rename is the commit point: a work file is either complete or absent.
      renameSync(partPath, finalPath)
    } catch (error) {
      this.removeWorkFiles(partPath)
      throw toStorageError(error)
    }
    return built
  }

  /**
   * Adds a backup to the library as a new work. The file is copied, checked and upgraded as a copy
   * in `.tmp`; the rename into `works/` is the commit point, so a work is either complete or absent.
   * The user's file is never opened in place. Status, last chapter and dates come from the backup.
   */
  importWorkFile(id: string, sourcePath: string): WorkSummary {
    assertWorkId(id)
    const partPath = this.partPath(id)
    const finalPath = this.workPath(id)

    let summary: WorkSummary
    try {
      copyFileSync(sourcePath, partPath)
      verifyWorkFile(partPath)
      const db = openWorkFile(partPath)
      try {
        db.transaction(() => db.prepare('UPDATE work SET id = ?').run(id))
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        summary = readWork(db)
      } finally {
        db.close()
      }
      renameSync(partPath, finalPath)
    } catch (error) {
      this.removeWorkFiles(partPath)
      throw toStorageError(error)
    }
    return summary
  }

  /**
   * Writes a consistent backup of one work to `destination`, which the user chose. The work stays
   * open and unchanged. The destination must be outside the data directory, so a backup can never
   * overwrite a live work file.
   */
  exportWork(workId: string, destination: string): void {
    if (!isAbsolute(destination)) {
      throw new StorageError('validation', 'Đường dẫn lưu phải là đường dẫn đầy đủ.')
    }
    const inside = relative(resolve(this.dataDir), resolve(destination))
    if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
      throw new StorageError('validation', 'Hãy chọn nơi lưu bên ngoài thư mục dữ liệu của Mira.')
    }
    this.withWork(workId, (db) => exportToFile(db, destination))
  }

  /** Best effort: the work file is already committed, and reconcile repairs a stale index. */
  syncIndex(summary: WorkSummary): void {
    try {
      this.upsertIndex(summary, summary.id + WORK_EXTENSION)
    } catch (error) {
      console.error('Không cập nhật được chỉ mục thư viện:', error)
    }
  }

  close(): void {
    this.index.close()
  }

  private workPath(id: string): string {
    return join(this.worksDir, id + WORK_EXTENSION)
  }

  private partPath(id: string): string {
    return join(this.tmpDir, id + WORK_EXTENSION + PART_EXTENSION)
  }

  /**
   * Opens `library.db`. A corrupt database is restored from the latest valid backup;
   * if no backup exists, it refuses with a recovery error instead of silently recreating a blank DB.
   */
  private openIndex(): Db {
    const path = join(this.dataDir, 'library.db')
    try {
      return this.openAndMigrateIndex(path)
    } catch (error) {
      const storageError = toStorageError(error)
      if (storageError.code !== 'corrupt') throw storageError

      const backup =
        findLatestValidLibraryBackup(this.backupsDir) ?? findLatestValidLibraryBackup(this.dataDir)

      if (backup) {
        if (existsSync(path)) {
          renameSync(path, path + '.corrupt-' + this.now())
          removeSideFiles(path)
        }
        copyFileSync(backup, path)
        removeSideFiles(path)
        return this.openAndMigrateIndex(path)
      }

      throw new StorageError(
        'corrupt',
        'Cơ sở dữ liệu thư viện bị hỏng và không tìm thấy bản sao lưu hợp lệ để khôi phục.'
      )
    }
  }

  private openAndMigrateIndex(path: string): Db {
    const db = openDatabase(path)
    try {
      const { userVersion } = readPragmas(db)
      const latest = latestVersion(librarySchema)
      if (userVersion > 0) {
        const check = db.prepare('PRAGMA quick_check').get<{ quick_check: string }>()
        if (check?.quick_check !== 'ok') {
          throw new StorageError('corrupt', 'Cơ sở dữ liệu thư viện bị hỏng dữ liệu.')
        }
        if (userVersion < latest) {
          mkdirSync(this.backupsDir, { recursive: true })
          let backupDest = join(this.backupsDir, `library-backup-${this.now()}.db`)
          if (existsSync(backupDest)) {
            backupDest = join(
              this.backupsDir,
              `library-backup-${this.now()}-${randomUUID().slice(0, 8)}.db`
            )
          }
          createLibraryBackup(db, backupDest)
        }
      }
      migrate(db, librarySchema)
      return db
    } catch (error) {
      db.close()
      throw toStorageError(error)
    }
  }

  /** Makes the index agree with the work files on disk and records files that cannot be opened. */
  private reconcile(): void {
    // Everything in .tmp is an unfinished create or restore, including SQLite's own side files
    // (-journal, -wal, -shm), so nothing there is worth keeping after a restart.
    for (const name of readdirSync(this.tmpDir)) {
      rmSync(join(this.tmpDir, name), { recursive: true, force: true })
    }

    if (existsSync(this.backupsDir)) {
      for (const name of readdirSync(this.backupsDir)) {
        if (name.endsWith('.part')) {
          rmSync(join(this.backupsDir, name), { force: true })
        }
      }
    }

    const problems: WorkProblem[] = []
    const seen = new Set<string>()

    for (const fileName of readdirSync(this.worksDir)) {
      if (!fileName.endsWith(WORK_EXTENSION)) continue
      try {
        const summary = this.readSummaryFromFile(fileName)
        seen.add(summary.id)
        this.upsertIndex(summary, fileName)
      } catch (error) {
        const storageError = toStorageError(error)
        problems.push({ fileName, code: storageError.code, message: storageError.message })
      }
    }

    this.index.transaction(() => {
      const known = this.index.prepare('SELECT id FROM work_index').all<{ id: string }>()
      for (const { id } of known) {
        if (!seen.has(id)) this.index.prepare('DELETE FROM work_index WHERE id = ?').run(id)
      }
    })
    this.problems = problems
  }

  private readSummaryFromFile(fileName: string): WorkSummary {
    const db = openWorkFile(join(this.worksDir, fileName))
    try {
      const summary = readWork(db)
      if (summary.id + WORK_EXTENSION !== fileName) {
        throw new StorageError('corrupt', 'Tên tệp không khớp với ID tác phẩm bên trong.')
      }
      return summary
    } finally {
      db.close()
    }
  }

  private upsertIndex(summary: WorkSummary, fileName: string): void {
    this.index
      .prepare(
        `INSERT INTO work_index (
           id, file_name, title, original_title, description, author, genre, setting, settings_extra,
           culture, source_lang, status, archived, chapter_count, last_chapter_id, last_chapter_number,
           last_chapter_title, cover_version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           file_name = excluded.file_name, title = excluded.title,
           original_title = excluded.original_title, description = excluded.description,
           author = excluded.author, genre = excluded.genre, setting = excluded.setting,
           settings_extra = excluded.settings_extra, culture = excluded.culture,
           source_lang = excluded.source_lang, status = excluded.status,
           archived = excluded.archived, chapter_count = excluded.chapter_count,
           last_chapter_id = excluded.last_chapter_id,
           last_chapter_number = excluded.last_chapter_number,
           last_chapter_title = excluded.last_chapter_title,
           cover_version = excluded.cover_version,
           created_at = excluded.created_at, updated_at = excluded.updated_at`
      )
      .run(
        summary.id,
        fileName,
        summary.title,
        summary.originalTitle,
        summary.description,
        summary.author,
        summary.genre,
        summary.setting,
        summary.settingsExtra.length > 0 ? summary.settingsExtra.join(',') : null,
        summary.culture,
        summary.sourceLang,
        summary.status,
        summary.archived ? 1 : 0,
        summary.chapterCount,
        summary.lastChapter?.id ?? null,
        summary.lastChapter?.number ?? null,
        summary.lastChapter?.title ?? null,
        summary.coverVersion,
        summary.createdAt,
        summary.updatedAt
      )
  }

  private removeWorkFiles(path: string): void {
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(path + suffix, { force: true })
  }
}
