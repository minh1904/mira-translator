import { createHash } from 'node:crypto'
import type {
  ParagraphBatchInput,
  ParagraphBatchResult,
  ParagraphFinalizeInput,
  ParagraphFinalizeResult,
  ParagraphPlanInput,
  ParagraphTranslationPlan
} from '../../../shared/contracts/aiTranslateProposals'
import type {
  SegmentRefusal,
  TranslateFailure,
  TranslateUsage
} from '../../../shared/contracts/aiTranslate'
import { taskLimit } from '../../../shared/contracts/modelSettings'
import { planBatches } from '../../../shared/translation/translatePlanner'
import type { TranslationModelCaller } from '../../../shared/contracts/translateCore'
import { createProposal, appendProposalParts, getProposal } from '../../infra/storage/aiProposals'
import { StorageError } from '../../infra/storage/errors'
import {
  createRunContext,
  getRunContext,
  pruneOrphanRunContexts
} from '../../infra/storage/translateRunContext'
import { CATALOG_READ_AT, lookupModel } from '../../infra/providers/modelCatalog'
import { ProviderError, type SegmentText } from '../../infra/providers/types'
import { toWireUsage } from '../../infra/providers/usage'
import type { LibraryStore } from '../library/library'
import type { ConnectionService } from './connectionService'
import { estimateCost } from './costEstimate'
import { executeTranslateBatch } from './translate/translationCore'
import { CallBudget, defaultExtra, type BudgetSnapshot } from './translate/callBudget'
import { describeProviderError, withPolicy } from './errorPolicy'
import { buildTranslateRequest, PREVIOUS_PARAGRAPHS } from './translate/translatePrompt'
import { chooseOutputMode } from './translate/outputMode'
import { modelCapability } from '../../infra/providers/modelCapability'
import { buildGeneration } from '../../infra/providers/generation'
import { parseSnapshot, promptFromSnapshot, takeContextSnapshot } from './translate/contextSnapshot'
import { acceptProposalParts, textHash } from '../proposals/proposalService'

interface ParagraphUnit extends SegmentText {
  order: number
}

function paragraphId(order: number, text: string): string {
  const hex = createHash('sha256').update(`${order}\0${text}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Mỗi dòng văn bản gốc không rỗng được xem là một đoạn văn bản riêng biệt. */
export function paragraphUnits(content: string): ParagraphUnit[] {
  return content
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, order) => ({ id: paragraphId(order, text), text, order }))
}

function failure(error: unknown, now: number): TranslateFailure {
  if (error instanceof ProviderError)
    return withPolicy({
      kind: error.kind,
      message: describeProviderError(error),
      recoverAt: error.retryAfterMs === undefined ? null : now + Math.max(0, error.retryAfterMs)
    })
  throw error
}

/** Chia một chương thành các lô dịch dựa trên giới hạn token đầu vào của mục cấu hình model. */
function batchesOf(
  units: ParagraphUnit[],
  inputTokenLimit: number | undefined,
  sourceLang: string
): Array<{ sourceIds: string[]; sourceChars: number }> {
  return planBatches(units, {
    maxTokens: taskLimit(inputTokenLimit) || undefined,
    maxUnits: taskLimit(inputTokenLimit) ? Number.MAX_SAFE_INTEGER : undefined,
    sourceLang
  }).batches.map((batch) => ({
    sourceIds: batch.units.map((unit) => unit.id),
    sourceChars: batch.charCount
  }))
}

/** Tính số lượt gọi chênh lệch của một lô: lấy số lượt sau khi chạy trừ đi số lượt trước khi chạy. */
function budgetDelta(
  before: BudgetSnapshot,
  after: BudgetSnapshot
): { byRound: BudgetSnapshot['byRound']; httpAttempts: number } {
  return {
    byRound: {
      main: after.byRound.main - before.byRound.main,
      split: after.byRound.split - before.byRound.split,
      bare: after.byRound.bare - before.byRound.bare,
      repair: after.byRound.repair - before.byRound.repair,
      fallback: after.byRound.fallback - before.byRound.fallback,
      polish: after.byRound.polish - before.byRound.polish
    },
    httpAttempts: after.httpAttempts - before.httpAttempts
  }
}

export class ParagraphTranslator {
  /**
   * Ngân sách lượt gọi API của từng lượt dịch đang mở, định danh theo `runId`.
   * Lưu trong bộ nhớ tạm: nếu ứng dụng khởi động lại, lượt dịch sẽ được cấp ngân sách mới từ kế hoạch.
   */
  private readonly budgets = new Map<string, CallBudget>()
  /**
   * Theo dõi các lượt dịch có lô bị từ chối schema định dạng và số lô đã chuyển sang dự phòng.
   */
  private readonly fellBack = new Map<string, number>()

  constructor(
    private readonly options: {
      library: LibraryStore
      connections: ConnectionService
      now: () => number
      /**
       * Yêu cầu chế độ JSON-schema khi model hỗ trợ (mặc định tắt trong sản phẩm).
       */
      outputSchema?: boolean
    }
  ) {}

  /**
   * Tạo kế hoạch dịch thuật cho chương: chia lô, tính toán ngân sách lượt gọi và chụp nhanh ngữ cảnh.
   */
  plan(
    { workId, chapterId, connectionId, entryId }: ParagraphPlanInput,
    { extraCalls }: { extraCalls?: number } = {}
  ): ParagraphTranslationPlan {
    const { library, connections } = this.options
    const { connection, entry, settingsKey } = connections.translator(connectionId, entryId)
    const work = library.get(workId)
    const source = library.readText(workId, chapterId, 'source')
    const target = library.readText(workId, chapterId, 'target')
    const units = paragraphUnits(source.content)
    if (units.length === 0)
      throw new StorageError('validation', 'Chương này chưa có đoạn gốc để dịch.')
    const batches = batchesOf(units, entry.settings.inputTokenLimit, work.sourceLang)
    const runId = library.newAppId()
    this.budgets.set(
      runId,
      new CallBudget(batches.length, extraCalls ?? defaultExtra(batches.length))
    )
    // Chụp nhanh ngữ cảnh một lần duy nhất cho toàn bộ các lượt gọi trong lượt dịch này.
    const record = takeContextSnapshot(library, workId, chapterId, source.content)
    library.withWork(workId, (db) => {
      pruneOrphanRunContexts(db, chapterId, this.options.now())
      createRunContext(db, {
        runKey: `translate:${runId}`,
        chapterId,
        snapshotJson: record.json,
        snapshotHash: record.hash,
        createdAt: this.options.now()
      })
    })
    return {
      runId,
      sourceRev: source.rev,
      targetRev: target.rev,
      targetBaseContent: target.content,
      connectionId,
      connectionName: connection.name,
      entryId,
      entryName: entry.name,
      model: entry.model,
      settingsKey,
      catalogReadAt: CATALOG_READ_AT,
      paragraphCount: units.length,
      batches,
      hasTranslation: target.content.trim() !== '',
      estimate: estimateCost({
        sourceChars: batches.reduce((sum, batch) => sum + batch.sourceChars, 0),
        sourceLang: work.sourceLang,
        batchCount: batches.length,
        model: lookupModel(entry.model, connection.providerId ?? undefined)
      }),
      context: {
        hash: record.hash,
        glossary: record.snapshot.glossary.length,
        dyads: record.snapshot.dyads.length,
        characters: record.snapshot.characters.length
      }
    }
  }

  async runBatch(input: ParagraphBatchInput): Promise<ParagraphBatchResult> {
    const { library, connections, now } = this.options
    const translator = connections.translator(input.connectionId, input.entryId)
    if (translator.settingsKey !== input.settingsKey) {
      throw new StorageError('conflict', 'Cấu hình model đã đổi. Hãy lập kế hoạch lại.')
    }
    const work = library.get(input.workId)
    const source = library.readText(input.workId, input.chapterId, 'source')
    const target = library.readText(input.workId, input.chapterId, 'target')
    if (
      source.rev !== input.sourceRev ||
      target.rev !== input.targetRev ||
      target.content !== input.targetBaseContent
    ) {
      throw new StorageError('conflict', 'Bản gốc hoặc bản dịch đã đổi. Hãy lập kế hoạch lại.')
    }
    const all = paragraphUnits(source.content)
    const byId = new Map(all.map((unit) => [unit.id, unit]))
    const requested = [...new Set(input.sourceIds)].map((id) => {
      const unit = byId.get(id)
      if (!unit) throw new StorageError('conflict', 'Đoạn gốc đã đổi. Hãy lập kế hoạch lại.')
      return unit
    })
    const key = `translate:${input.runId}`
    const stored = library.withWork(input.workId, (db) => getRunContext(db, key))
    if (!stored || stored.chapterId !== input.chapterId) {
      throw new StorageError(
        'conflict',
        'Lượt dịch không có bản chụp ngữ cảnh (kế hoạch cũ hoặc đã bị xóa). Hãy lập kế hoạch lại.'
      )
    }
    const snapshot = parseSnapshot(stored.snapshotJson)
    // So với kho lúc này: khác thì báo, nhưng lô vẫn dùng bản chụp của lượt, không trộn hai phiên bản.
    const contextChanged =
      takeContextSnapshot(
        library,
        input.workId,
        input.chapterId,
        source.content,
        // The pinned instruction: a newer steering is not a context change for this run.
        snapshot.instruction
      ).hash !== stored.snapshotHash
    const prior = library.withWork(input.workId, (db) => {
      const row = db.prepare('SELECT id FROM proposal WHERE run_key = ?').get<{ id: string }>(key)
      return row ? getProposal(db, row.id) : null
    })
    if (
      prior &&
      (prior.chapterId !== input.chapterId ||
        prior.sourceHash !== textHash(source.content) ||
        prior.targetBaseRev !== input.targetRev ||
        prior.targetBaseContent !== target.content ||
        prior.policy !== input.policy ||
        prior.model !== translator.entry.model)
    ) {
      throw new StorageError('conflict', 'Lượt dịch không còn khớp kế hoạch ban đầu.')
    }
    const done = new Set(prior?.parts.map((part) => part.batchKey) ?? [])
    const units = requested.filter((unit) => !done.has(`${key}:${unit.id}`))
    const budget = this.budgetFor(
      input.runId,
      () => batchesOf(all, translator.entry.settings.inputTokenLimit, work.sourceLang).length
    )
    // Thử lại phần lỗi do người dùng bấm: lượt được thêm một phần ngân sách cho lô thử lại đó.
    if (input.retry === true) budget.grant(1, defaultExtra(1))
    const budgetBefore = budget.snapshot()
    if (units.length === 0)
      return {
        proposalId: prior?.id ?? null,
        proposed: requested.map((unit) => unit.id),
        failed: [],
        refusals: [],
        budgetIds: [],
        budget: budgetBefore,
        contextChanged,
        output: { mode: 'array', structure: { extraneous: 0, duplicate: 0, repaired: 0 } },
        error: null,
        usage: null,
        keyTail: null
      }

    // Ngữ cảnh từ bản chụp của lượt; glossary vẫn lọc theo chữ của lô, nhưng chỉ trong bản chụp.
    const first = Math.min(...units.map((unit) => unit.order))
    const previous = all
      .slice(Math.max(0, first - PREVIOUS_PARAGRAPHS), first)
      .map((unit) => unit.text)
    // Chế độ đầu ra chọn một lần cho lượt; một lô đã rơi về thì các lô sau không gửi schema nữa.
    const choice = chooseOutputMode({
      requested: this.options.outputSchema === true,
      capability: modelCapability(
        lookupModel(translator.entry.model, translator.connection.providerId ?? undefined)
      ),
      extraBody: buildGeneration(translator.entry.settings).extraBody
    })
    const runFellBack = (this.fellBack.get(input.runId) ?? 0) > 0
    const mode = runFellBack ? 'array' : choice.mode
    const prompt = {
      ...promptFromSnapshot(snapshot, units.map((unit) => unit.text).join('\n'), previous),
      ...(mode === 'object' ? { outputMode: mode } : {})
    }
    const matched = prompt.glossary ?? []
    const context = [...matched, ...snapshot.dyads]
    // Hash của request lượt chính, tính bằng cùng bộ dựng lõi dịch dùng để gửi: không thể lệch nhau.
    const planned = buildTranslateRequest(
      prompt,
      units.map((unit, index) => ({
        tempId: `[${index + 1}]`,
        originalId: unit.id,
        text: unit.text
      }))
    )
    let contextHash = planned.requestHash
    let systemHash = planned.systemHash
    let items: SegmentText[] = []
    let usage: TranslateUsage | null = null
    let error: TranslateFailure | null = null
    let refusals: SegmentRefusal[] = []
    let budgetIds: string[] = []
    let used: ParagraphBatchResult['output']['mode'] = mode
    let structure = { extraneous: 0, duplicate: 0, repaired: 0 }
    try {
      if (typeof (translator.provider as TranslationModelCaller).complete === 'function') {
        const result = await executeTranslateBatch({
          caller: translator.provider as TranslationModelCaller,
          units,
          prompt,
          now,
          budget,
          log: {
            workId: input.workId,
            chapterId: input.chapterId,
            runKey: key,
            model: translator.entry.model
          }
        })
        contextHash = result.request?.requestHash ?? contextHash
        items = result.items
        usage = result.usage ? toWireUsage(result.usage) : null
        error = result.error === null ? null : withPolicy(result.error)
        refusals = result.refusals
        budgetIds = result.budgetIds
        structure = result.structure
        if (result.request) {
          used = result.request.outputMode
          systemHash = result.request.systemHash
        }
        if (used === 'object→fallback') {
          this.fellBack.set(input.runId, (this.fellBack.get(input.runId) ?? 0) + 1)
        }
      } else {
        const result = await translator.provider.translate({
          sourceLang: work.sourceLang,
          targetLang: 'vi',
          segments: units
        })
        items = result.items
        usage = result.usage ? toWireUsage(result.usage) : null
      }
    } catch (caught) {
      return {
        proposalId: prior?.id ?? null,
        proposed: [],
        failed: units.map((unit) => unit.id),
        refusals: [],
        budgetIds: [],
        budget: budget.snapshot(),
        contextChanged,
        output: { mode: used, structure },
        error: failure(caught, now()),
        usage: null,
        keyTail: translator.lastKeyTail()
      }
    }
    const returned = new Map(items.map((item) => [item.id, item.text.trim()]))
    const good = units.filter((unit) => returned.get(unit.id))
    const proposed = good.map((unit) => unit.id)
    const failed = units.filter((unit) => !returned.get(unit.id)).map((unit) => unit.id)
    const budgetAfter = budget.snapshot()
    const outputReason: ParagraphBatchResult['output']['reason'] = runFellBack
      ? 'run_fell_back'
      : choice.reason
    const output: ParagraphBatchResult['output'] = {
      mode: used,
      ...(outputReason ? { reason: outputReason } : {}),
      structure
    }
    let proposalId = prior?.id ?? null
    if (good.length > 0) {
      const trace = {
        sourceIds: units.map((unit) => unit.id),
        context,
        contextHash,
        promptVersion: planned.version,
        systemHash,
        usage,
        // Chế độ đầu ra của lô, lý do khi không dùng schema, và số lô của lượt đã rơi về tới lúc này.
        outputMode: used,
        ...(outputReason ? { outputModeReason: outputReason } : {}),
        fallbacks: this.fellBack.get(input.runId) ?? 0,
        structure,
        // Đủ để dựng lại request lượt chính từ bản chụp (`rebuildTranslateRequest`).
        snapshot: { runKey: key, hash: stored.snapshotHash },
        characters: snapshot.characters.map(
          (character) => `${character.source} → ${character.target}`
        ),
        previous,
        register: snapshot.register,
        // Lời gọi của riêng lô này, theo vòng, và số request HTTP thật đằng sau chúng.
        budget: budgetDelta(budgetBefore, budgetAfter),
        // Chỉ ghi khi có: hồ sơ cũ không có trường này vẫn đọc như trước.
        ...(refusals.length > 0 ? { refusals } : {})
      }
      const parts = good.map((unit) => ({
        id: library.newAppId(),
        baseFrom: target.content === '' ? 0 : null,
        baseTo: target.content === '' ? 0 : null,
        beforeText: '',
        afterText: returned.get(unit.id)!,
        sourceOrder: unit.order,
        sourceText: unit.text,
        batchKey: `${key}:${unit.id}`,
        status: target.content === '' ? ('pending' as const) : ('needs-placement' as const)
      }))
      library.withWork(input.workId, (db) =>
        db.transaction(() => {
          const existing = db
            .prepare('SELECT id FROM proposal WHERE run_key = ?')
            .get<{ id: string }>(key)
          proposalId = existing?.id ?? proposalId
          if (proposalId === null) {
            proposalId = library.newAppId()
            createProposal(db, {
              id: proposalId,
              chapterId: input.chapterId,
              origin: 'translate',
              policy: input.policy,
              sourceRev: source.rev,
              sourceHash: textHash(source.content),
              targetBaseRev: target.rev,
              targetBaseContent: target.content,
              context: [trace],
              contextHash: textHash(JSON.stringify([contextHash])),
              provider: translator.provider.id,
              model: translator.entry.model,
              usage,
              runKey: key,
              now: now(),
              parts
            })
          } else {
            const saved = getProposal(db, proposalId)
            if (
              saved.chapterId !== input.chapterId ||
              saved.sourceHash !== textHash(source.content) ||
              saved.targetBaseRev !== input.targetRev ||
              saved.targetBaseContent !== target.content ||
              saved.policy !== input.policy ||
              saved.model !== translator.entry.model
            ) {
              throw new StorageError('conflict', 'Lượt dịch không còn khớp kế hoạch ban đầu.')
            }
            const fresh = parts.filter(
              (part) => !saved.parts.some((old) => old.batchKey === part.batchKey)
            )
            if (fresh.length > 0) {
              appendProposalParts(db, proposalId, fresh, now())
              const traces = [...saved.context, trace]
              const oldUsage = saved.usage as TranslateUsage | null
              const totalUsage = usage
                ? {
                    inputTokens: (oldUsage?.inputTokens ?? 0) + usage.inputTokens,
                    outputTokens: (oldUsage?.outputTokens ?? 0) + usage.outputTokens
                  }
                : oldUsage
              db.prepare(
                `UPDATE proposal SET context_json = ?, context_hash = ?, usage_json = ?,
              updated_at = ? WHERE id = ?`
              ).run(
                JSON.stringify(traces),
                textHash(JSON.stringify(traces.map((item) => (item as typeof trace).contextHash))),
                totalUsage ? JSON.stringify(totalUsage) : null,
                now(),
                proposalId
              )
            }
          }
        })
      )
    }
    return {
      proposalId,
      proposed,
      failed,
      refusals,
      budgetIds,
      budget: budgetAfter,
      contextChanged,
      output,
      error:
        error ??
        (failed.length
          ? withPolicy({
              kind: 'invalid_response',
              message: `Thiếu bản dịch cho ${failed.length} đoạn.`,
              recoverAt: null
            })
          : null),
      usage,
      keyTail: translator.lastKeyTail()
    }
  }

  /**
   * Lấy ngân sách lượt gọi của lượt dịch, hoặc khởi tạo mới từ kế hoạch nếu bị mất (khi ứng dụng khởi động lại giữa chừng).
   */
  private budgetFor(runId: string, plannedBatches: () => number): CallBudget {
    const known = this.budgets.get(runId)
    if (known) return known
    const batches = plannedBatches()
    const budget = new CallBudget(batches, defaultExtra(batches))
    this.budgets.set(runId, budget)
    return budget
  }

  finalize(input: ParagraphFinalizeInput): ParagraphFinalizeResult {
    this.budgets.delete(input.runId)
    this.fellBack.delete(input.runId)
    const { library } = this.options
    return library.withWork(input.workId, (db) => {
      const key = `translate:${input.runId}`
      const row = db.prepare('SELECT id FROM proposal WHERE run_key = ?').get<{ id: string }>(key)
      const target = library.readText(input.workId, input.chapterId, 'target')
      if (!row)
        return {
          proposed: 0,
          applied: 0,
          needsReview: 0,
          targetRev: target.rev,
          targetContent: target.content
        }
      const proposal = getProposal(db, row.id)
      if (proposal.chapterId !== input.chapterId || proposal.policy !== input.policy) {
        throw new StorageError('validation', 'Lượt dịch không thuộc chương hoặc chính sách này.')
      }
      const ids = proposal.parts.filter((part) => part.status === 'pending').map((part) => part.id)
      if (input.policy === 'auto' && ids.length > 0) {
        acceptProposalParts(db, {
          chapterId: input.chapterId,
          partIds: ids,
          commandId: input.runId,
          actor: 'auto',
          now: this.options.now(),
          newId: () => library.newAppId()
        })
      }
      const final = getProposal(db, proposal.id)
      const latest = library.readText(input.workId, input.chapterId, 'target')
      return {
        proposed: final.parts.length,
        applied: final.parts.filter((part) => part.status === 'applied').length,
        needsReview: final.parts.filter(
          (part) => part.status !== 'applied' && part.status !== 'rejected'
        ).length,
        targetRev: latest.rev,
        targetContent: latest.content
      }
    })
  }
}
