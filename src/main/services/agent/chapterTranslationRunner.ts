import { createHash } from 'node:crypto'
import type { AgentProgress } from '../../../shared/contracts/agent'
import type { TranslationModelCaller } from '../../../shared/contracts/translateCore'
import { taskLimit } from '../../../shared/contracts/modelSettings'
import { buildRows, normalizeRowText, type Row } from '../../../shared/contracts/rows'
import { planBatches } from '../../../shared/translation/translatePlanner'
import { StorageError } from '../../infra/storage/errors'
import type { CallPriority } from '../../infra/providers/gateway/limiter'
import type { SegmentText } from '../../infra/providers/types'
import { addUsage, toWireUsage, type Usage } from '../../infra/providers/usage'
import type { RowAuthor } from '../../infra/storage/sentenceRows'
import { createRunContext, getRunContext } from '../../infra/storage/translateRunContext'
import type { LibraryStore } from '../library/library'
import type { ConnectionService } from '../ai/connectionService'
import { executeTranslateBatch } from '../ai/translate/translationCore'
import { collectFailures, MissingSourceError, RunFailedError, type RunFailure } from './taskError'
import { CallBudget, defaultExtra } from '../ai/translate/callBudget'
import {
  parseSnapshot,
  promptFromSnapshot,
  takeContextSnapshot
} from '../ai/translate/contextSnapshot'
import { PREVIOUS_PARAGRAPHS } from '../ai/translate/translatePrompt'
import { originFor } from '../ai/provenance'
import { isProtectedRow } from '../ai/chapterTranslation'
import { polishChapterRows } from '../ai/chapterPolish'
import { POLISH_PROMPT_VERSION } from '../ai/polish'
import type { TokenUsage } from '../../../shared/contracts/usage'

/** Why a run stopped at a safe point between batches; the item goes back to the queue. */
export type RunStopReason = 'pause' | 'budget' | 'app_closed'

/**
 * Which rows a run may write. `protect` is the chat policy: every row except a human-owned translation.
 * `fill_untranslated` is the task policy: only rows with no translation at all, so a retry never calls or
 * writes again what an earlier run committed, AI rows included.
 */
export type OverwritePolicy = 'protect' | 'fill_untranslated'

export interface ChapterTranslationRunInput {
  library: LibraryStore
  connections: ConnectionService
  workId: string
  chapterId: string
  operationId: string
  modelSelection: {
    connectionId: string
    entryId: string
    settingsKey?: string
  }
  /** Queue for the entry's call slots; a task runs as `background` so chat goes first. */
  priority?: CallPriority
  /**
   * Key of the run's context snapshot in `translate_run_context`. Created from the live store when
   * missing; a task item pins `task:<itemId>` before its first run and every later run reuses it.
   */
  runKey?: string
  policy?: OverwritePolicy
  /**
   * Polish the rows this run translated once every batch is in (change `add-auto-polish`), on the
   * auxiliary model when one is set, else on the run's own. Best effort: it never fails the run, and it
   * writes inside the same operation, so one undo takes back the translation and the polish together.
   */
  polish?: boolean
  /** Source rows the user chose to skip (refused by the provider); never sent again. */
  skipIds?: readonly string[]
  /** Prefix of content batch keys; a task uses `item:<itemId>:` so keys hold across its runs. */
  batchKeyPrefix?: string
  /** A batch with this key already committed by an earlier run of the same item, if any. */
  priorBatch?: (batchKey: string) => { checksum: string } | null
  /** Outer cap asked before every model call (task caps); see `CallBudget`. */
  gate?: ConstructorParameters<typeof CallBudget>[2]
  /** Checked before every batch: a reason stops the run at a safe point. */
  shouldStop?: () => RunStopReason | null
  /** Runs before every batch commit (flush editors); throwing makes the run a conflict. */
  beforeCommit?: () => Promise<void>
  /** Usage so far after every batch, `complete: false` until the run ends normally. */
  onUsage?: (usage: TokenUsage | null, calls: number) => void
  onProgress?: (progress: AgentProgress) => void
  signal?: AbortSignal
  now?: () => number
}

export interface ChapterTranslationRunResult {
  state: 'completed' | 'partially_completed' | 'conflict' | 'cancelled' | 'failed' | 'stopped'
  stopReason?: RunStopReason
  appliedUnits: number
  /** Rows the polish step rewrote after they were translated; absent when polish did not run. */
  polishedUnits?: number
  totalUnits: number
  /** Rows left alone because they already had a translation. */
  protectedCount: number
  failedIds: string[]
  refusedIds: string[]
  budgetIds: string[]
  /** Why the paragraphs in `failedIds` failed, grouped by cause (change `unify-activity-screen`). */
  failures: RunFailure[]
  lastAppliedRev: number | null
  summary: string
  usage?: TokenUsage | null
  contextHash?: string
}

export { MissingSourceError }

function toSegmentText(row: Row): SegmentText {
  return { id: row.sourceId, text: row.sourceText }
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

export async function runChapterTranslation(
  input: ChapterTranslationRunInput
): Promise<ChapterTranslationRunResult> {
  const {
    library,
    connections,
    workId,
    chapterId,
    operationId,
    modelSelection,
    onProgress,
    signal
  } = input
  const now = input.now ?? Date.now
  const policy = input.policy ?? 'protect'

  const translator = connections.translator(
    modelSelection.connectionId,
    modelSelection.entryId,
    input.priority
  )
  if (modelSelection.settingsKey && translator.settingsKey !== modelSelection.settingsKey) {
    throw new StorageError(
      'conflict',
      'Cấu hình model đã đổi so với lúc khởi tạo lượt. Vui lòng thử lại.'
    )
  }

  const work = library.get(workId)
  const source = library.readText(workId, chapterId, 'source')
  if (source.segments.length === 0) {
    throw new MissingSourceError('Chương này chưa có bản gốc để dịch.')
  }

  const targetInit = library.readText(workId, chapterId, 'target')
  const links = library.listLinks(workId, chapterId)
  const rows = buildRows(source, targetInit, links).rows
  const sendable = rows.filter((row) => row.sourceText.trim() !== '')
  if (sendable.length === 0) {
    throw new MissingSourceError('Bản gốc của chương này không có câu nào để dịch.')
  }

  // Every batch of the run builds its prompt from one stored snapshot, never from the live store.
  const runKey = input.runKey ?? `agent:${operationId}`
  const stored =
    library.withWork(workId, (db) => getRunContext(db, runKey)) ??
    (() => {
      const record = takeContextSnapshot(library, workId, chapterId, source.content)
      const created = {
        runKey,
        chapterId,
        snapshotJson: record.json,
        snapshotHash: record.hash,
        createdAt: now()
      }
      library.withWork(workId, (db) => createRunContext(db, created))
      return created
    })()
  const snapshot = parseSnapshot(stored.snapshotJson)

  const skip = new Set(input.skipIds ?? [])
  const owned =
    policy === 'fill_untranslated' ? (row: Row) => row.targetIds.length > 0 : isProtectedRow
  const keep = (row: Row) => skip.has(row.sourceId) || owned(row)
  const keptRows = sendable.filter(keep)
  const toTranslate = sendable.filter((row) => !keep(row))

  library.prepareAgentOperation(workId, {
    operationId,
    chapterId,
    side: 'target',
    totalUnits: sendable.length
  })

  const base = {
    totalUnits: sendable.length,
    protectedCount: keptRows.length,
    failedIds: [] as string[],
    refusedIds: [] as string[],
    budgetIds: [] as string[],
    failures: [] as RunFailure[],
    contextHash: stored.snapshotHash
  }

  if (toTranslate.length === 0) {
    // Nothing left: for a task the chapter is done; for chat every row belongs to a person.
    const state = policy === 'fill_untranslated' ? 'completed' : 'conflict'
    library.markAgentOperationTerminal(workId, operationId, state, {
      reason: 'nothing_to_translate',
      protectedCount: keptRows.length
    })
    return {
      ...base,
      state,
      appliedUnits: 0,
      lastAppliedRev: null,
      usage: null,
      summary:
        state === 'completed'
          ? `Mọi câu của chương đã có bản dịch (${keptRows.length} câu được giữ).`
          : `Toàn bộ ${keptRows.length} câu trong chương đã có bản dịch và được bảo vệ. Không có câu nào được ghi đè.`
    }
  }

  const planned = planBatches(toTranslate.map(toSegmentText), {
    maxTokens: taskLimit(translator.entry.settings.inputTokenLimit) || undefined,
    maxUnits: taskLimit(translator.entry.settings.inputTokenLimit)
      ? Number.MAX_SAFE_INTEGER
      : undefined,
    sourceLang: work.sourceLang
  })
  const budget = new CallBudget(
    planned.batches.length,
    defaultExtra(planned.batches.length),
    input.gate
  )

  let currentRev = targetInit.rev
  let appliedUnits = 0
  /** What this run committed, for the polish step; rows an earlier run of the item wrote are not in it. */
  const translatedRows: Array<{ sourceId: string; text: string }> = []
  const rowMap = new Map(rows.map((r) => [r.sourceId, r]))
  let usage: Usage | null = null
  let calledWithoutUsage = false
  const wireUsage = (complete: boolean): TokenUsage | null =>
    usage ? toWireUsage(usage, complete && !calledWithoutUsage) : null
  const reportUsage = () => input.onUsage?.(wireUsage(false), budget.snapshot().used)
  const batchAuthor: RowAuthor = {
    origin: originFor(translator.provider.id),
    provider: translator.provider.id,
    model: translator.entry.model
  }

  const finish = (
    state: ChapterTranslationRunResult['state'],
    summary: string,
    extra: Partial<ChapterTranslationRunResult> = {}
  ): ChapterTranslationRunResult => {
    const journalState = state === 'stopped' ? 'interrupted' : state
    library.markAgentOperationTerminal(workId, operationId, journalState, {
      appliedUnits,
      totalUnits: sendable.length,
      protectedCount: keptRows.length,
      failedIds: base.failedIds,
      refusedIds: base.refusedIds,
      budgetIds: base.budgetIds,
      ...(extra.stopReason ? { stopReason: extra.stopReason } : {})
    })
    const result = {
      ...base,
      ...extra,
      state,
      appliedUnits,
      lastAppliedRev: appliedUnits > 0 ? currentRev : null,
      summary,
      usage: wireUsage(state !== 'cancelled' && state !== 'stopped')
    }
    input.onUsage?.(result.usage, budget.snapshot().used)
    return result
  }

  /** Polishes what this run translated and commits the accepted edits; returns how many rows changed. */
  const polishApplied = async (): Promise<number> => {
    let polisher = translator
    const auxiliary = connections.preferences().auxiliary
    if (auxiliary) {
      try {
        polisher = connections.translator(auxiliary.connectionId, auxiliary.entryId, input.priority)
      } catch {
        // The auxiliary model is gone or unusable: polish on the run's own model.
      }
    }
    const caller = polisher.provider as unknown as TranslationModelCaller
    if (typeof caller.complete !== 'function') return 0
    const rowsToPolish = translatedRows.flatMap((done) => {
      const row = rowMap.get(done.sourceId)
      return row ? [{ sourceId: done.sourceId, src: row.sourceText, dst: done.text }] : []
    })
    let polished
    try {
      polished = await polishChapterRows({
        caller,
        snapshot,
        rows: rowsToPolish,
        budget,
        signal,
        log: { workId, chapterId, runKey, model: polisher.entry.model }
      })
    } catch {
      return 0
    }
    if (polished.usage) usage = addUsage(usage, polished.usage)
    else if (polished.calls > 0) calledWithoutUsage = true
    reportUsage()
    const edits = polished.edits
      .map((edit) => ({ sourceId: edit.sourceId, text: normalizeRowText(edit.text) }))
      .filter((edit) => edit.text !== '')
    if (edits.length === 0 || signal?.aborted) return 0
    try {
      await input.beforeCommit?.()
    } catch {
      return 0
    }
    const releaseLease = library.acquireTargetWriteLease(
      { workId, chapterId, side: 'target' },
      operationId
    )
    try {
      if (signal?.aborted) return 0
      const applied = library.applyAgentTranslationBatch(workId, {
        operationId,
        batchKey:
          (input.batchKeyPrefix ?? 'op:') +
          'polish:' +
          sha256(
            JSON.stringify([
              edits.map((edit) => edit.sourceId),
              stored.snapshotHash,
              polisher.settingsKey,
              POLISH_PROMPT_VERSION
            ])
          ),
        expectedRev: currentRev,
        checksum: 'sha256:' + sha256(JSON.stringify(edits)),
        rows: edits,
        by: {
          origin: originFor(polisher.provider.id),
          provider: polisher.provider.id,
          model: polisher.entry.model
        }
      })
      currentRev = applied.afterRev
      return edits.length
    } catch (error) {
      // Someone edited the chapter since the batches were written: leave the translation as it is.
      if (error instanceof StorageError && error.code === 'conflict') return 0
      throw error
    } finally {
      releaseLease()
    }
  }

  try {
    for (let batchIdx = 0; batchIdx < planned.batches.length; batchIdx++) {
      if (signal?.aborted) break
      const stop = input.shouldStop?.() ?? null
      if (stop) {
        return finish('stopped', `Đã dừng ở điểm an toàn sau ${appliedUnits} câu.`, {
          stopReason: stop
        })
      }

      const batch = planned.batches[batchIdx]
      let translatedItems: SegmentText[] = []
      if (
        typeof (translator.provider as unknown as TranslationModelCaller).complete === 'function'
      ) {
        const first = rows.findIndex((r) => r.sourceId === batch.units[0].id)
        const prompt = promptFromSnapshot(
          snapshot,
          batch.units.map((unit) => unit.text).join('\n'),
          rows
            .slice(Math.max(0, first - PREVIOUS_PARAGRAPHS), Math.max(0, first))
            .map((r) => r.sourceText)
        )
        const outcome = await executeTranslateBatch({
          caller: translator.provider as unknown as TranslationModelCaller,
          units: batch.units,
          prompt,
          now,
          signal,
          budget,
          log: { workId, chapterId, runKey, model: translator.entry.model }
        })
        translatedItems = outcome.items
        base.failedIds.push(...outcome.failedIds)
        base.refusedIds.push(...outcome.refusedIds)
        base.budgetIds.push(...outcome.budgetIds)
        collectFailures(base.failures, outcome)
        if (outcome.usage) usage = addUsage(usage, outcome.usage)
        else if (outcome.request) calledWithoutUsage = true
        if (
          outcome.error &&
          !signal?.aborted &&
          translatedItems.length === 0 &&
          !budget.gateClosed
        ) {
          reportUsage()
          throw new RunFailedError(outcome.error.message, base.failures)
        }
      } else {
        const res = await translator.provider.translate(
          { sourceLang: work.sourceLang, targetLang: 'vi', segments: batch.units },
          { signal }
        )
        translatedItems = res.items
        if (res.usage) usage = addUsage(usage, res.usage)
        else calledWithoutUsage = true
      }
      reportUsage()
      if (signal?.aborted) break

      const safeBatchRows: Array<{ sourceId: string; text: string }> = []
      for (const item of translatedItems) {
        const row = rowMap.get(item.id)
        if (!row || keep(row)) continue
        const text = normalizeRowText(item.text)
        if (text === '') continue
        safeBatchRows.push({ sourceId: row.sourceId, text })
      }

      if (safeBatchRows.length > 0) {
        const batchKey =
          (input.batchKeyPrefix ?? 'op:') +
          sha256(
            JSON.stringify([
              batch.units.map((unit) => unit.id),
              source.rev,
              stored.snapshotHash,
              translator.settingsKey
            ])
          )
        const checksum = 'sha256:' + sha256(JSON.stringify(safeBatchRows))
        const prior = input.priorBatch?.(batchKey) ?? null
        if (prior) {
          if (prior.checksum !== checksum) {
            return finish('conflict', 'Khóa batch đã được ghi với nội dung khác ở lần chạy trước.')
          }
          continue
        }
        await input.beforeCommit?.()
        const releaseLease = library.acquireTargetWriteLease(
          { workId, chapterId, side: 'target' },
          operationId
        )
        try {
          // Cancel fence: nothing commits once a cancel was accepted.
          if (signal?.aborted) break
          const applied = library.applyAgentTranslationBatch(workId, {
            operationId,
            batchKey,
            expectedRev: currentRev,
            checksum,
            rows: safeBatchRows,
            by: batchAuthor
          })
          currentRev = applied.afterRev
          appliedUnits += safeBatchRows.length
          translatedRows.push(...safeBatchRows)
        } finally {
          releaseLease()
        }
      }

      onProgress?.({
        completed: appliedUnits,
        total: sendable.length,
        unit: 'segments',
        message: `Đã dịch ${appliedUnits}/${sendable.length} câu (${batchIdx + 1}/${planned.batches.length} lô)`
      })
      if (budget.gateClosed) {
        return finish('stopped', 'Đã chạm trần của tác vụ.', { stopReason: 'budget' })
      }
    }

    if (signal?.aborted) {
      return finish(
        'cancelled',
        `Đã dừng dịch. Đã hoàn thành ${appliedUnits}/${sendable.length} câu trước khi hủy.`
      )
    }
    const polishedUnits =
      input.polish && translatedRows.length > 0 && !budget.gateClosed ? await polishApplied() : 0
    const polishNote = polishedUnits > 0 ? ` Trau chuốt sửa ${polishedUnits} câu.` : ''
    const failed = base.failedIds.length > 0
    const state = failed || keptRows.length > 0 ? 'partially_completed' : 'completed'
    return finish(
      state,
      (failed
        ? `Đã dịch ${appliedUnits} câu; ${base.failedIds.length} câu chưa dịch được.`
        : keptRows.length > 0
          ? `Đã dịch ${appliedUnits} câu mới; giữ nguyên ${keptRows.length} câu đã có bản dịch.`
          : `Đã dịch hoàn tất ${appliedUnits}/${sendable.length} câu.`) + polishNote,
      input.polish ? { polishedUnits } : {}
    )
  } catch (error) {
    if (signal?.aborted) {
      return finish(
        'cancelled',
        `Đã dừng dịch. Đã hoàn thành ${appliedUnits}/${sendable.length} câu trước khi hủy.`
      )
    }
    if (error instanceof StorageError && error.code === 'conflict') {
      return finish('conflict', error.message)
    }
    // Usage of the batches that ran is kept even though the run failed.
    library.markAgentOperationTerminal(workId, operationId, 'failed', {
      appliedUnits,
      totalUnits: sendable.length,
      error: error instanceof Error ? error.message : String(error)
    })
    input.onUsage?.(wireUsage(false), budget.snapshot().used)
    throw error
  }
}
