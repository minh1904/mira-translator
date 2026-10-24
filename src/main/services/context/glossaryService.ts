import type {
  AppliedContext,
  ContextEntryHistory,
  ContextEntryItem,
  ContextKind,
  ContextOrigin,
  ContextReviewInfo,
  ContextStatus,
  ImportNamesResult
} from '../../../shared/contracts/glossary'
import {
  createContextEntry,
  readReviewInfo,
  deleteContextEntry,
  getContextEntry,
  getEffectiveGlossary,
  listContextEntries,
  updateContextEntry,
  type ListContextOptions,
  type UpdateContextEntryParams
} from '../../infra/storage/contextEntries'
import { listEntryChanges } from '../../infra/storage/contextChanges'
import { affectedChapters } from '../../infra/storage/contextRevisions'
import { parseNamesText } from '../../../shared/context/namesParser'
import {
  matchContextEntries,
  type MatchedContextEntry
} from '../../../shared/context/contextMatching'
import {
  evaluateGlossaryCompliance,
  type GlossaryComplianceReport
} from '../../../shared/context/glossaryCompliance'
import type { LibraryStore } from '../library/library'
import { takeContextSnapshot } from '../ai/translate/contextSnapshot'

export class GlossaryService {
  constructor(
    private readonly library: LibraryStore,
    private readonly now: () => number = Date.now
  ) {}

  list(workId: string, options: ListContextOptions = {}): ContextEntryItem[] {
    return this.library.withWork(workId, (db) => listContextEntries(db, options))
  }

  /** Read-only: the same snapshot function a translation of the chapter would use now. */
  applied(workId: string, chapterId: string): AppliedContext {
    let source = ''
    try {
      source = this.library.readText(workId, chapterId, 'source').content
    } catch {
      // No source yet: pairs and characters are narrowed to the text, so none apply.
    }
    const { glossary, dyads, characters } = takeContextSnapshot(
      this.library,
      workId,
      chapterId,
      source
    ).snapshot
    return { glossary, dyads, characters }
  }

  reviewInfo(workId: string, entryIds?: string[]): ContextReviewInfo[] {
    return this.library.withWork(workId, (db) => readReviewInfo(db, entryIds))
  }

  history(workId: string, entryId: string): ContextEntryHistory {
    return this.library.withWork(workId, (db) => ({
      changes: listEntryChanges(db, entryId),
      affectedChapterIds: affectedChapters(db, entryId)
    }))
  }

  get(workId: string, entryId: string): ContextEntryItem | null {
    return this.library.withWork(workId, (db) => getContextEntry(db, entryId))
  }

  create(
    workId: string,
    params: {
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
    }
  ): ContextEntryItem {
    return this.library.withWork(workId, (db) =>
      createContextEntry(db, {
        ...params,
        now: this.now()
      })
    )
  }

  update(workId: string, entryId: string, patch: UpdateContextEntryParams): ContextEntryItem {
    return this.library.withWork(workId, (db) =>
      updateContextEntry(db, entryId, {
        ...patch,
        now: this.now()
      })
    )
  }

  delete(workId: string, entryId: string): void {
    this.library.withWork(workId, (db) => deleteContextEntry(db, entryId, this.now()))
  }

  getEffective(
    workId: string,
    chapterId: string,
    options?: { approvedOnly?: boolean }
  ): ContextEntryItem[] {
    return this.library.withWork(workId, (db) => getEffectiveGlossary(db, chapterId, options))
  }

  importNames(workId: string, content: string): ImportNamesResult {
    const { entries, skipped } = parseNamesText(content)
    const skippedReasons: Array<{ line: number; raw: string; reason: string }> = []

    for (const s of skipped) {
      if (s.reason === 'empty' || s.reason === 'comment') continue
      let reasonText = 'Dòng không hợp lệ'
      if (s.reason === 'missing_delimiter') reasonText = 'Thiếu dấu phân cách ='
      else if (s.reason === 'empty_source') reasonText = 'Từ gốc rỗng'
      else if (s.reason === 'empty_target') reasonText = 'Từ dịch rỗng'
      else if (s.reason === 'duplicate_source') reasonText = 'Trùng lặp từ gốc trong tệp'

      skippedReasons.push({
        line: s.line,
        raw: s.raw,
        reason: reasonText
      })
    }

    let importedCount = 0

    this.library.withWork(workId, (db) => {
      db.transaction(() => {
        for (const entry of entries) {
          try {
            createContextEntry(db, {
              source: entry.source,
              target: entry.target,
              kind: 'term',
              status: 'approved',
              origin: 'import',
              forbidden: false,
              now: this.now()
            })
            importedCount++
          } catch (error) {
            skippedReasons.push({
              line: entry.line,
              raw: entry.raw,
              reason: error instanceof Error ? error.message : 'Lỗi khi lưu mục thuật ngữ'
            })
          }
        }
      })
    })

    return {
      importedCount,
      skippedCount: skippedReasons.length,
      skippedReasons
    }
  }

  match(workId: string, chapterId: string, text: string): MatchedContextEntry[] {
    const work = this.library.get(workId)
    const entries = this.getEffective(workId, chapterId, { approvedOnly: true })
    return matchContextEntries(text, entries, work.sourceLang)
  }

  checkCompliance(
    workId: string,
    chapterId: string,
    sourceText: string,
    targetText: string
  ): GlossaryComplianceReport {
    const work = this.library.get(workId)
    const entries = this.getEffective(workId, chapterId, { approvedOnly: true })
    return evaluateGlossaryCompliance(sourceText, targetText, entries, work.sourceLang)
  }
}
