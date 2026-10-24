import type {
  HeldSuggestion,
  SegmentRefusal,
  TranslateBatchInput,
  TranslateBatchResult,
  TranslateFailure,
  TranslatePlan,
  TranslatePlanInput,
  TranslateUsage
} from '../../../shared/contracts/aiTranslate'
import { taskLimit } from '../../../shared/contracts/modelSettings'
import { buildRows, normalizeRowText, type Row } from '../../../shared/contracts/rows'
import { StorageError } from '../../infra/storage/errors'
import type { LibraryStore } from '../library/library'
import type { RowAuthor } from '../../infra/storage/sentenceRows'
import type { ConnectionService } from './connectionService'
import { estimateCost } from './costEstimate'
import { CATALOG_READ_AT, lookupModel } from '../../infra/providers/modelCatalog'
import { planBatches } from '../../../shared/translation/translatePlanner'
import type { TranslationModelCaller } from '../../../shared/contracts/translateCore'
import { executeTranslateBatch } from './translate/translationCore'
import { describeProviderError, withPolicy } from './errorPolicy'
import { listCharacters } from '../../infra/storage/addressingEntries'
import {
  charactersMentionedIn,
  dyadsMentionedIn,
  PREVIOUS_PARAGRAPHS,
  type TranslatePromptContext
} from './translate/translatePrompt'
import { resolveRegister } from '../../../shared/contracts/addressing/resolve'
import { matchContextEntries } from '../../../shared/context/contextMatching'
import { originFor } from './provenance'
import { ProviderError, type SegmentText } from '../../infra/providers/types'
import { toWireUsage } from '../../infra/providers/usage'

/**
 * Dịch bản gốc của một chương bằng AI.
 *
 * Hai lời gọi, không phải một job dài: `plan` nói trước sẽ gửi gì và tốn bao nhiêu, `runBatch` dịch
 * **một lô** rồi ghi ngay phần đã qua kiểm tra. Renderer gọi `runBatch` lần lượt, nên tiến độ, nút
 * Hủy và việc "phần đã xong vẫn được giữ" đúng theo định nghĩa chứ không nhờ may mắn.
 *
 * Luật không bao giờ phá: **không ghi đè hàng người dùng đã viết hay đã soát**. Với những hàng đó,
 * bản AI quay về renderer dưới dạng đề xuất để người dùng tự chọn.
 */

export interface ChapterTranslatorOptions {
  library: LibraryStore
  connections: ConnectionService
  now: () => number
}

/**
 * Hàng nào AI không được ghi đè: hàng **đã có bản dịch** mà bản đó không phải một đề xuất AI chưa
 * ai soát. Gồm cả hàng `check` — chữ của người dùng vẫn nằm đó, chỉ là liên kết đang đáng ngờ.
 */
export function isProtectedRow(row: Row): boolean {
  return row.targetIds.length > 0 && row.state !== 'ai'
}

/** Lỗi của nhà cung cấp quay về renderer như **dữ liệu trong kết quả**, không phải lỗi của kênh IPC. */
function toFailure(error: unknown, now: number): TranslateFailure {
  if (error instanceof ProviderError) {
    const recoverAt =
      error.retryAfterMs === undefined ? null : now + Math.max(0, error.retryAfterMs)
    return withPolicy({ kind: error.kind, message: describeProviderError(error), recoverAt })
  }
  if (error instanceof StorageError && error.code === 'conflict') {
    return withPolicy({ kind: 'conflict', message: error.message, recoverAt: null })
  }
  throw error
}

function toSegmentText(row: Row): SegmentText {
  return { id: row.sourceId, text: row.sourceText }
}

export class ChapterTranslator {
  constructor(private readonly options: ChapterTranslatorOptions) {}

  plan({ workId, chapterId, connectionId, entryId }: TranslatePlanInput): TranslatePlan {
    const { library, connections } = this.options
    const { connection, entry, settingsKey } = connections.translator(connectionId, entryId)
    const work = library.get(workId)
    const source = library.readText(workId, chapterId, 'source')
    if (source.segments.length === 0) {
      throw new StorageError('validation', 'Chương này chưa có bản gốc để dịch.')
    }

    const rows = this.rowsOf(workId, chapterId)
    const sendable = rows.filter((row) => row.sourceText.trim() !== '')
    if (sendable.length === 0) {
      throw new StorageError('validation', 'Bản gốc của chương này không có câu nào để dịch.')
    }

    // Cỡ lô là giới hạn token đầu vào của mục (0 là mặc định).
    const batches = planBatches(sendable.map(toSegmentText), {
      maxTokens: taskLimit(entry.settings.inputTokenLimit) || undefined,
      maxUnits: taskLimit(entry.settings.inputTokenLimit) ? Number.MAX_SAFE_INTEGER : undefined,
      sourceLang: work.sourceLang
    }).batches.map((batch) => ({
      sourceIds: batch.units.map((segment) => segment.id),
      sourceChars: batch.charCount
    }))

    return {
      connectionId,
      connectionName: connection.name,
      entryId,
      entryName: entry.name,
      model: entry.model,
      settingsKey,
      catalogReadAt: CATALOG_READ_AT,
      segmentCount: sendable.length,
      batches,
      protectedCount: sendable.filter(isProtectedRow).length,
      hasTranslation: rows.some((row) => row.targetIds.length > 0),
      estimate: estimateCost({
        sourceChars: batches.reduce((total, batch) => total + batch.sourceChars, 0),
        sourceLang: work.sourceLang,
        batchCount: batches.length,
        model: lookupModel(entry.model, connection.providerId ?? undefined)
      }),
      targetRev: library.readText(workId, chapterId, 'target').rev
    }
  }

  async runBatch(input: TranslateBatchInput): Promise<TranslateBatchResult> {
    const { library, connections, now } = this.options
    const { workId, chapterId, connectionId, entryId, settingsKey, sourceIds, expectedRev } = input
    // Mục bị xóa giữa chừng thì ném `not_found` ở đây, trước khi gửi gì.
    const translator = connections.translator(connectionId, entryId)
    // Cấu hình của mục phải còn y như lúc lập kế hoạch. Provider vừa dựng và khóa vừa so cùng đọc
    // từ một lần đọc mục, nên lô gửi đi dùng đúng bộ cấu hình có khóa khớp, không có kẽ hở giữa hai việc.
    if (translator.settingsKey !== settingsKey) {
      throw new StorageError(
        'conflict',
        'Cấu hình model đã đổi giữa lúc đang dịch. Hãy lập kế hoạch lại để dịch phần còn lại bằng cấu hình mới; phần đã dịch vẫn được giữ.'
      )
    }
    const work = library.get(workId)

    const target = library.readText(workId, chapterId, 'target')
    if (target.rev !== expectedRev) {
      throw new StorageError(
        'conflict',
        'Bản dịch đã đổi ở nơi khác trong lúc đang dịch. Hãy tải lại rồi dịch phần còn lại.'
      )
    }

    const rows = new Map(this.rowsOf(workId, chapterId).map((row) => [row.sourceId, row]))
    const segments: SegmentText[] = []
    for (const id of sourceIds) {
      const row = rows.get(id)
      if (!row) {
        throw new StorageError('validation', 'Bản gốc đã đổi: không còn câu ' + id + '.')
      }
      segments.push(toSegmentText(row))
    }

    let items: SegmentText[] = []
    let usage: TranslateUsage | null = null
    let by: RowAuthor | null = null
    let translationError: TranslateFailure | null = null
    let refusals: SegmentRefusal[] = []

    try {
      if (
        typeof (translator.provider as unknown as TranslationModelCaller).complete === 'function'
      ) {
        const prompt: TranslatePromptContext = {
          sourceLang: work.sourceLang,
          genre: work.genre,
          register: resolveRegister(work)
        }
        try {
          const glossaryEntries = library.getEffectiveGlossary(workId, chapterId, {
            approvedOnly: true
          })
          const combinedSource = segments.map((s) => s.text).join('\n')
          prompt.glossary = matchContextEntries(combinedSource, glossaryEntries, work.sourceLang)
          const dyads = library.getEffectiveAddressing(workId, chapterId)
          const ordered = [...rows.values()]
          const chapterSource = ordered.map((row) => row.sourceText).join('\n')
          prompt.dyads = dyadsMentionedIn(dyads, chapterSource)
          prompt.characters = charactersMentionedIn(
            library.withWork(workId, (db) => listCharacters(db, { status: 'approved' })),
            chapterSource
          )
          const first = ordered.findIndex((row) => row.sourceId === sourceIds[0])
          prompt.previous = ordered
            .slice(Math.max(0, first - PREVIOUS_PARAGRAPHS), Math.max(0, first))
            .map((row) => row.sourceText)
        } catch {
          // Nếu nạp ngữ cảnh thất bại, tiếp tục dịch mà không kèm ngữ cảnh bổ sung
        }

        const outcome = await executeTranslateBatch({
          caller: translator.provider as unknown as TranslationModelCaller,
          units: segments,
          prompt,
          now,
          log: { workId, chapterId, model: translator.entry.model }
        })
        items = outcome.items
        usage = outcome.usage === null ? null : toWireUsage(outcome.usage)
        translationError = outcome.error === null ? null : withPolicy(outcome.error)
        refusals = outcome.refusals
      } else {
        const response = await translator.provider.translate({
          sourceLang: work.sourceLang,
          targetLang: 'vi',
          segments
        })
        items = response.items
        usage = response.usage === undefined ? null : toWireUsage(response.usage)
      }
      by = {
        origin: originFor(translator.provider.id),
        provider: translator.provider.id,
        model: translator.entry.model
      }
    } catch (error) {
      return {
        written: [],
        held: [],
        failed: sourceIds,
        refusals: [],
        error: toFailure(error, now()),
        targetRev: target.rev,
        keyTail: translator.lastKeyTail(),
        usage: null
      }
    }

    if (translationError && items.length === 0) {
      return {
        written: [],
        held: [],
        failed: sourceIds,
        refusals,
        error: translationError,
        targetRev: target.rev,
        keyTail: translator.lastKeyTail(),
        usage
      }
    }

    const written: string[] = []
    const held: HeldSuggestion[] = []
    let rev = target.rev
    let error: TranslateFailure | null = translationError

    try {
      for (const item of items) {
        const row = rows.get(item.id)
        if (!row) continue
        const text = normalizeRowText(item.text)
        if (text === '') continue
        if (isProtectedRow(row)) {
          held.push({
            sourceId: row.sourceId,
            sourceText: row.sourceText,
            userText: row.targetText,
            aiText: text
          })
          continue
        }
        const saved = library.saveRow(workId, {
          chapterId,
          sourceId: row.sourceId,
          text,
          expectedRev: rev,
          by
        })
        rev = saved.target.rev
        written.push(row.sourceId)
      }
    } catch (caught) {
      error = toFailure(caught, now())
    }

    const landed = new Set([...written, ...held.map((item) => item.sourceId)])
    const failed = sourceIds.filter((id) => !landed.has(id))
    return {
      written,
      held,
      failed,
      refusals,
      // Lô về thiếu câu mà không có lỗi nào: nói rõ ra thay vì im lặng bỏ qua.
      error:
        error ??
        (failed.length > 0
          ? withPolicy({
              kind: 'invalid_response',
              message: 'Nhà cung cấp không trả bản dịch cho ' + failed.length + ' câu.',
              recoverAt: null
            })
          : null),
      targetRev: rev,
      keyTail: translator.lastKeyTail(),
      usage
    }
  }

  private rowsOf(workId: string, chapterId: string): Row[] {
    const { library } = this.options
    return buildRows(
      library.readText(workId, chapterId, 'source'),
      library.readText(workId, chapterId, 'target'),
      library.listLinks(workId, chapterId)
    ).rows
  }
}
