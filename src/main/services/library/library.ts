import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { ChapterChange, ChapterItem, ChaptersChange } from '../../../shared/contracts/chapters'
import type {
  CreateWorkInput,
  WorkList,
  WorkPatch,
  WorkSummary
} from '../../../shared/contracts/library'
import { IMAGE_MAX_PER_WORK } from '../../../shared/contracts/images'
import {
  deleteChapter,
  insertChapter,
  insertChapterAt,
  listChapters,
  moveChapter,
  openChapter,
  renameChapter
} from '../../infra/storage/chapterFile'
import {
  countContextEntriesByStatus,
  getEffectiveGlossary,
  listContextEntries
} from '../../infra/storage/contextEntries'
import {
  countApprovedDyads,
  getApprovedDyadsForWork,
  getEffectiveDyadsForChapter
} from '../../infra/storage/addressingEntries'
import { readTranslationProgress, type TranslationProgress } from '../../infra/storage/chapterFile'
import type { ContextEntryItem, ContextStatus } from '../../../shared/contracts/glossary'
import type { AddressingDyadResolved } from '../../../shared/contracts/addressing'
import type { SegmentInput, TextRecord, TextSide } from '../../../shared/contracts/text'
import type { RowSaved } from '../../../shared/contracts/rows'
import { createLink, getProvenance, listLinks, setProvenance } from '../../infra/storage/linkFile'
import type { LinkInput, LinkRecord, ProvenanceRecord } from '../../infra/storage/linkFile'
import { saveRow, type RowAuthor, type RowRef } from '../../infra/storage/sentenceRows'
import { readSideContents, readText, saveText } from '../../infra/storage/textFile'
import type {
  AgentOperationBatch,
  AgentOperationCheckpoint,
  AgentOperationEvidence,
  AgentOperationTerminalState,
  ApplyAgentTranslationBatchInput
} from '../../infra/storage/agentOperationJournal'
import {
  applyAgentTranslationBatch,
  markAgentOperationTerminal,
  prepareAgentOperation,
  readAgentOperationEvidence,
  undoAgentOperation,
  undoAgentOperationChain,
  type AgentUndoChainResult
} from '../../infra/storage/agentOperationJournal'
import { decodeCover, encodeCover } from '../../infra/storage/cover'
import { decodeImage, encodeImage } from '../../infra/storage/image'
import { StorageError } from '../../infra/storage/errors'
import type { Db } from '../../infra/storage/sqlite'
import {
  assertWorkId,
  countImages,
  deleteImage,
  insertImage,
  insertWork,
  patchWork,
  readCover,
  readImage,
  readWork,
  writeCover
} from '../../infra/storage/workFile'
import { WorkFiles } from '../../infra/storage/workFiles'
import {
  reconcileStartupOperations,
  type ReconcileStartupOperationsResult
} from '../agent/operationReconciler'

export interface LibraryOptions {
  /** Directory that holds `library.db` and `works/`. */
  dataDir: string
  now?: () => number
  newId?: () => string
  newChapterId?: () => string
  /** Ids for segments and links. */
  newContentId?: () => string
}

/**
 * The work library: one SQLite file per work (source of truth) plus a small index for listing.
 * What is inside a work is this class's business; where the files are, and how they are created,
 * imported, exported and reconciled with the index, is `WorkFiles`'.
 */
export class LibraryStore {
  private readonly now: () => number
  private readonly newId: () => string
  private readonly newChapterId: () => string
  private readonly newContentId: () => string

  private constructor(
    private readonly files: WorkFiles,
    now: () => number,
    options: LibraryOptions
  ) {
    this.now = now
    this.newId = options.newId ?? randomUUID
    this.newChapterId = options.newChapterId ?? randomUUID
    this.newContentId = options.newContentId ?? randomUUID
  }

  static open(options: LibraryOptions): LibraryStore {
    const now = options.now ?? Date.now
    const files = WorkFiles.open({ dataDir: options.dataDir, now })
    reconcileStartupOperations(files.index, files, now())
    return new LibraryStore(files, now, options)
  }

  reconcileOperations(): ReconcileStartupOperationsResult {
    return reconcileStartupOperations(this.appDb, this.files, this.now())
  }

  /**
   * Cơ sở dữ liệu phạm vi ứng dụng (`library.db`), cho những thứ không thuộc một tác phẩm nào —
   * hiện là cài đặt kết nối AI. **Chỉ dùng trong main process**, và chỉ cho dữ liệu cấp ứng dụng:
   * mọi thứ thuộc về một tác phẩm vẫn đi qua các phương thức của lớp này.
   */
  get appDb(): Db {
    return this.files.index
  }

  /** Dùng chung với kho tác phẩm để id của kết nối và khóa cùng một kiểu. */
  newAppId(): string {
    return this.newId()
  }

  appNow(): number {
    return this.now()
  }

  list(): WorkList {
    return this.files.list()
  }

  get(id: string): WorkSummary {
    return this.files.withWork(id, (db) => readWork(db))
  }

  create(input: CreateWorkInput): WorkSummary {
    const title = input.title.trim()
    if (title.length === 0) throw new StorageError('validation', 'Nhập tên tác phẩm.')

    // Decode first so a bad cover fails before any file is created.
    const cover = input.cover === undefined ? null : decodeCover(input.cover)
    const id = this.newId()
    assertWorkId(id)
    const now = this.now()

    const summary = this.files.createWorkFile(id, (db) => {
      db.transaction(() => {
        insertWork(db, id, { ...input, title }, now)
        if (cover) writeCover(db, cover, now)
      })
      return readWork(db)
    })

    this.files.syncIndex(summary)
    return summary
  }

  /** Details and cover are saved in one transaction: either both change or neither does. */
  update(id: string, patch: WorkPatch): WorkSummary {
    // Decode first so a bad cover fails before the file is touched.
    const cover =
      patch.cover === undefined ? undefined : patch.cover === null ? null : decodeCover(patch.cover)
    const summary = this.files.withWork(id, (db) => {
      db.transaction(() => {
        const now = this.now()
        patchWork(db, patch, now)
        if (cover !== undefined) writeCover(db, cover, now)
      })
      return readWork(db)
    })
    this.files.syncIndex(summary)
    return summary
  }

  listChapters(workId: string): ChapterItem[] {
    return this.files.withWork(workId, (db) => listChapters(db))
  }

  createChapter(workId: string, title = ''): ChapterChange {
    const chapterId = this.newChapterId()
    return this.changeChapters(workId, (db, now) => {
      const chapter = insertChapter(db, chapterId, title.trim(), now)
      return { chapter }
    })
  }

  createChapterAt(workId: string, position: number, title = ''): ChapterChange {
    const chapterId = this.newChapterId()
    return this.changeChapters(workId, (db, now) => {
      const chapter = insertChapterAt(db, chapterId, position, title.trim(), now)
      return { chapter }
    })
  }

  renameChapter(workId: string, chapterId: string, title: string): ChapterChange {
    return this.changeChapters(workId, (db, now) => ({
      chapter: renameChapter(db, chapterId, title.trim(), now)
    }))
  }

  /** `to` is the 1-based position the chapter should end up at. */
  moveChapter(workId: string, chapterId: string, to: number): ChaptersChange {
    return this.changeChapters(workId, (db, now) => {
      moveChapter(db, chapterId, to, now)
      return { chapters: listChapters(db) }
    })
  }

  deleteChapter(workId: string, chapterId: string): ChaptersChange {
    return this.changeChapters(workId, (db, now) => {
      deleteChapter(db, chapterId, now)
      return { chapters: listChapters(db) }
    })
  }

  /** One side of a chapter's text. A side that was never saved reads as empty at revision 0. */
  readText(workId: string, chapterId: string, side: TextSide): TextRecord {
    return this.files.withWork(workId, (db) => readText(db, chapterId, side))
  }

  /** One side of every chapter's text, in one read: for scans over the whole work. */
  readSideContents(workId: string, side: TextSide): Map<string, string> {
    return this.files.withWork(workId, (db) => readSideContents(db, side))
  }

  private readonly writeLeases = new Map<string, string>()

  acquireTargetWriteLease(
    target: { workId: string; chapterId: string; side: TextSide },
    operationId: string
  ): () => void {
    const key = `${target.workId}:${target.chapterId}:${target.side}`
    const existing = this.writeLeases.get(key)
    if (existing) {
      throw new StorageError('conflict', `Target đang được khóa bởi operation ${existing}`)
    }
    this.writeLeases.set(key, operationId)
    return () => {
      if (this.writeLeases.get(key) === operationId) {
        this.writeLeases.delete(key)
      }
    }
  }

  private assertNoTargetLease(workId: string, chapterId: string, side: TextSide): void {
    const key = `${workId}:${chapterId}:${side}`
    const holder = this.writeLeases.get(key)
    if (holder) {
      throw new StorageError('conflict', `Target đang được Agent cập nhật (operation ${holder}).`)
    }
  }

  private assertHoldsTargetLease(
    workId: string,
    chapterId: string,
    side: TextSide,
    operationId: string
  ): void {
    const key = `${workId}:${chapterId}:${side}`
    const holder = this.writeLeases.get(key)
    if (holder !== operationId) {
      throw new StorageError(
        'conflict',
        `Operation ${operationId} không nắm giữ write lease trên target.`
      )
    }
  }

  prepareAgentOperation(
    workId: string,
    input: { operationId: string; chapterId: string; side: TextSide; totalUnits: number }
  ): AgentOperationCheckpoint {
    return this.changeChapters(workId, (db, now) => ({
      checkpoint: prepareAgentOperation(db, input, now)
    })).checkpoint
  }

  readAgentOperationEvidence(workId: string, operationId: string): AgentOperationEvidence | null {
    return this.files.withWork(workId, (db) => readAgentOperationEvidence(db, operationId))
  }

  applyAgentTranslationBatch(
    workId: string,
    input: ApplyAgentTranslationBatchInput
  ): AgentOperationBatch {
    const evidence = this.readAgentOperationEvidence(workId, input.operationId)
    if (!evidence) {
      throw new StorageError('not_found', 'Không tìm thấy checkpoint operation.')
    }
    this.assertHoldsTargetLease(
      workId,
      evidence.checkpoint.chapterId,
      evidence.checkpoint.side,
      input.operationId
    )
    return this.changeChapters(workId, (db, now) => ({
      batch: applyAgentTranslationBatch(db, input, now, this.newContentId)
    })).batch
  }

  markAgentOperationTerminal(
    workId: string,
    operationId: string,
    state: AgentOperationTerminalState,
    result: unknown
  ): AgentOperationCheckpoint {
    return this.changeChapters(workId, (db, now) => ({
      checkpoint: markAgentOperationTerminal(db, operationId, state, result, now)
    })).checkpoint
  }

  undoAgentOperation(
    workId: string,
    operationId: string
  ): { checkpoint: AgentOperationCheckpoint; restoredRev: number } {
    const evidence = this.readAgentOperationEvidence(workId, operationId)
    if (!evidence) {
      throw new StorageError('not_found', 'Không tìm thấy checkpoint operation.')
    }
    const key = `${workId}:${evidence.checkpoint.chapterId}:${evidence.checkpoint.side}`
    const alreadyHeld = this.writeLeases.get(key) === operationId
    const release = alreadyHeld
      ? () => {}
      : this.acquireTargetWriteLease(
          {
            workId,
            chapterId: evidence.checkpoint.chapterId,
            side: evidence.checkpoint.side
          },
          operationId
        )
    try {
      return this.changeChapters(workId, (db, now) =>
        undoAgentOperation(db, operationId, now, this.newContentId)
      )
    } finally {
      release()
    }
  }

  /**
   * Undoes operations that wrote one chapter side, newest first, under one write lease; a dry run only
   * reports what would be undone and where the chain stops.
   */
  undoAgentOperationChain(
    workId: string,
    target: { chapterId: string; side: TextSide },
    operationIds: string[],
    options: { dryRun?: boolean } = {}
  ): AgentUndoChainResult {
    if (options.dryRun) {
      return this.files.withWork(workId, (db) =>
        undoAgentOperationChain(db, operationIds, this.now(), this.newContentId, options)
      )
    }
    const release = this.acquireTargetWriteLease(
      { workId, chapterId: target.chapterId, side: target.side },
      'undo:' + operationIds.join(',')
    )
    try {
      const { work: _work, ...result } = this.changeChapters(workId, (db, now) =>
        undoAgentOperationChain(db, operationIds, now, this.newContentId)
      )
      return result
    } finally {
      release()
    }
  }

  /** Text and segments are replaced together; `expectedRev` guards against a stale writer. */
  saveText(
    workId: string,
    chapterId: string,
    side: TextSide,
    content: string,
    expectedRev: number,
    segments: SegmentInput[]
  ): TextRecord {
    this.assertNoTargetLease(workId, chapterId, side)
    const saved = this.changeChapters(workId, (db, now) => ({
      text: saveText(
        db,
        { chapterId, side, content, expectedRev, segments },
        now,
        this.newContentId
      )
    }))
    return saved.text
  }

  createLink(workId: string, chapterId: string, input: LinkInput): LinkRecord {
    return this.changeChapters(workId, (db, now) => ({
      link: createLink(db, chapterId, input, now, this.newContentId())
    })).link
  }

  listLinks(workId: string, chapterId: string): LinkRecord[] {
    return this.files.withWork(workId, (db) => listLinks(db, chapterId))
  }

  /**
   * The translation of one row, written into the chapter's translation with its segments and its
   * link, in one transaction. `expectedRev` is the translation revision the caller last read.
   */
  saveRow(
    workId: string,
    args: RowRef & { text: string; expectedRev: number; by?: RowAuthor }
  ): RowSaved {
    this.assertNoTargetLease(workId, args.chapterId, 'target')
    return this.changeChapters(workId, (db, now) => ({
      saved: saveRow(db, args, now, this.newContentId)
    })).saved
  }

  setProvenance(workId: string, record: ProvenanceRecord): void {
    this.changeChapters(workId, (db) => {
      setProvenance(db, record)
      return {}
    })
  }

  getProvenance(workId: string, segmentId: string): ProvenanceRecord | null {
    return this.files.withWork(workId, (db) => getProvenance(db, segmentId))
  }

  /** Marks a chapter as the one being worked on and returns the updated work. */
  openChapter(workId: string, chapterId: string): WorkSummary {
    return this.changeChapters(workId, (db, now) => {
      openChapter(db, chapterId, now)
      return {}
    }).work
  }

  /** Runs a chapter change in one transaction, then refreshes the library index from the result. */
  private changeChapters<T extends object>(
    workId: string,
    change: (db: Db, now: number) => T
  ): T & { work: WorkSummary } {
    const result = this.files.withWork(workId, (db) => {
      const changed = db.transaction(() => change(db, this.now()))
      return { ...changed, work: readWork(db) }
    })
    this.files.syncIndex(result.work)
    return result
  }

  /** The cover as a data URL, or null when the work has none. */
  getCover(id: string): string | null {
    return this.files.withWork(id, (db) => {
      const cover = readCover(db)
      return cover ? encodeCover(cover) : null
    })
  }

  /** Pass null to remove the cover. */
  setCover(id: string, dataUrl: string | null): WorkSummary {
    const cover = dataUrl === null ? null : decodeCover(dataUrl)
    const summary = this.files.withWork(id, (db) => {
      db.transaction(() => writeCover(db, cover, this.now()))
      return readWork(db)
    })
    this.files.syncIndex(summary)
    return summary
  }

  /**
   * Stores a pasted or dropped image as a blob in the work's own file and returns its generated ID;
   * the embed syntax in the translation (`![[id]]`) refers to this ID, never a file name.
   */
  putImage(workId: string, dataUrl: string): { id: string } {
    const image = decodeImage(dataUrl)
    return this.files.withWork(workId, (db) =>
      db.transaction(() => {
        if (countImages(db) >= IMAGE_MAX_PER_WORK) {
          throw new StorageError(
            'validation',
            'Tác phẩm đã có ' + IMAGE_MAX_PER_WORK + ' ảnh, đây là giới hạn tối đa.'
          )
        }
        const id = this.newContentId()
        insertImage(db, id, image, this.now())
        return { id }
      })
    )
  }

  /** The image as a data URL, or null when it no longer exists (e.g. an embed left dangling). */
  getImage(workId: string, imageId: string): string | null {
    return this.files.withWork(workId, (db) => {
      const image = readImage(db, imageId)
      return image ? encodeImage(image) : null
    })
  }

  /** Deleting an image that is already gone is not an error: the embed may have been removed first. */
  deleteImage(workId: string, imageId: string): void {
    this.files.withWork(workId, (db) => deleteImage(db, imageId))
  }

  /**
   * Writes a consistent backup of one work to `destination`, which the user chose. The work stays
   * open and unchanged. The destination must be outside the data directory, so a backup can never
   * overwrite a live work file.
   */
  exportWork(workId: string, destination: string): void {
    this.files.exportWork(workId, destination)
  }

  /**
   * Adds a backup to the library as a new work: copied, checked and upgraded as a copy, never opened
   * in place. Status, last chapter and dates come from the backup.
   */
  restoreWork(sourcePath: string): WorkSummary {
    if (!isAbsolute(sourcePath)) {
      throw new StorageError('validation', 'Đường dẫn tệp phải là đường dẫn đầy đủ.')
    }
    const id = this.newId()
    assertWorkId(id)
    const summary = this.files.importWorkFile(id, sourcePath)
    this.files.syncIndex(summary)
    return summary
  }

  withWork<T>(workId: string, fn: (db: Db) => T): T {
    return this.files.withWork(workId, fn)
  }

  withWorkAsync<T>(workId: string, fn: (db: Db) => Promise<T>): Promise<T> {
    return this.files.withWorkAsync(workId, fn)
  }

  getEffectiveGlossary(
    workId: string,
    chapterId: string,
    options?: { approvedOnly?: boolean }
  ): ContextEntryItem[] {
    return this.files.withWork(workId, (db) => getEffectiveGlossary(db, chapterId, options))
  }

  getEffectiveAddressing(workId: string, chapterId: string): AddressingDyadResolved[] {
    return this.files.withWork(workId, (db) => getEffectiveDyadsForChapter(db, chapterId))
  }

  /** Approved glossary terms of the whole work, with the chapter ranges they apply to. */
  listApprovedGlossary(workId: string): ContextEntryItem[] {
    return this.files.withWork(workId, (db) =>
      listContextEntries(db, { kind: 'term', status: 'approved' })
    )
  }

  /** Approved addressing pairs of the whole work, with the chapter ranges they apply to. */
  listApprovedAddressing(workId: string): AddressingDyadResolved[] {
    return this.files.withWork(workId, (db) => getApprovedDyadsForWork(db))
  }

  /** How far the work is translated, from one query over the segments. */
  translationProgress(workId: string): TranslationProgress {
    return this.files.withWork(workId, (db) => readTranslationProgress(db))
  }

  /** Glossary entries by status and the approved addressing pairs, counted without loading them. */
  contextCounts(workId: string): {
    glossary: Record<ContextStatus, number>
    addressingPairs: number
  } {
    return this.files.withWork(workId, (db) => ({
      glossary: countContextEntriesByStatus(db, 'term'),
      addressingPairs: countApprovedDyads(db)
    }))
  }

  close(): void {
    this.files.close()
  }
}
