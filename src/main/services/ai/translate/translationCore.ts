import type { Usage } from '../../../infra/providers/usage'
import type { SegmentRefusal, TranslateFailure } from '../../../../shared/contracts/aiTranslate'
import type {
  TempMappedUnit,
  TranslateUnit,
  ModelCompletionResult,
  TranslationModelCaller
} from '../../../../shared/contracts/translateCore'
import { mapToTempIds, reconcileTempItems } from '../../../../shared/translation/translateReconcile'
import { parseTranslationResponse } from '../../../../shared/translation/lenientParser'
import {
  buildRepairRequest,
  buildTranslateRequest,
  TRANSLATE_PROMPT_VERSION,
  type TranslatePromptContext
} from './translatePrompt'
import { appendAiCall } from '../../../infra/storage/aiCallLog'
import { ProviderError } from '../../../infra/providers/types'
import { addUsage } from '../../../infra/providers/usage'
import { describeRefusals } from '../../../../shared/translation/refusalMessage'
import { describeProviderError } from '../errorPolicy'
import { CallBudget, LOCAL_EXTRA, type BudgetRound } from './callBudget'
import { TRANSLATE_RESPONSE_FORMAT, type OutputMode, type UsedOutputMode } from './outputMode'

export type { ModelCompletionResult, TranslationModelCaller }

/** Lỗi của một lô theo lời lõi dịch. Việc lỗi có dừng cả lượt hay không do bên gọi quyết theo chính sách. */
export type CoreFailure = Omit<TranslateFailure, 'haltsRun'>

export interface TranslateCoreBatchOptions {
  caller: TranslationModelCaller
  units: TranslateUnit[]
  /** Ngữ cảnh và thế hệ prompt; lượt hỏi lại dùng lại đúng ngữ cảnh này. */
  prompt?: TranslatePromptContext
  signal?: AbortSignal
  now?: () => number
  /**
   * The run's call budget, shared by every batch of the run. Absent, the batch gets its own with the old
   * caps (one main call, 33 extra), so callers that do not plan a run behave as before.
   */
  budget?: CallBudget
  /** Where the batch belongs; given, every model call and the kept result go to the work's AI call log. */
  log?: { workId: string; chapterId: string; runKey?: string; model?: string }
}

export interface TranslateCoreBatchOutcome {
  items: TranslateUnit[]
  failedIds: string[]
  /**
   * Đơn vị nhà cung cấp từ chối dịch (bộ lọc nội dung), đã khoanh tới từng đoạn. Nằm cả trong
   * `failedIds`; tách riêng để báo người dịch rằng thử lại cũng vô ích, cần dịch tay hoặc model khác.
   */
  refusedIds: string[]
  /** Lý do chặn của từng đoạn trong `refusedIds`, cùng thứ tự. */
  refusals: SegmentRefusal[]
  /**
   * Đoạn không được gửi (hoặc không được hỏi lại) vì ngân sách lời gọi của lượt đã hết. Nằm cả trong
   * `failedIds`; khác `refusedIds` ở chỗ thử lại có ích.
   */
  budgetIds: string[]
  /**
   * Đoạn bộ lọc chặn khi gửi kèm ngữ cảnh tác phẩm nhưng qua được khi gửi lại không kèm glossary,
   * nhân vật và cặp xưng hô. Đã có bản dịch, nhưng tên và xưng hô chưa được đối chiếu, cần soát lại.
   */
  withoutContextIds: string[]
  usage: Usage | null
  error: CoreFailure | null
  /**
   * Request lượt chính có câu trả lời được dùng; `null` khi lô không có gì để gửi. Khi schema bị từ chối
   * và lô được gửi lại không schema, đây là request gửi lại, và `outputMode` là `object→fallback`.
   */
  request: {
    version: string
    systemHash: string
    requestHash: string
    outputMode: UsedOutputMode
  } | null
  /** Lỗi cấu trúc của câu trả lời lượt chính: mục lạ, mục lặp, và số đoạn phải hỏi lại. */
  structure: { extraneous: number; duplicate: number; repaired: number }
}

const CJK_QUOTES: Record<string, string> = { '「': '“', '」': '”', '『': '‘', '』': '’' }

/** CJK corner brackets as Vietnamese quotes, as the prompt asks (`languageProfiles.ts`). */
export const vietnameseQuotes = (text: string): string =>
  text.replace(/[「」『』]/g, (mark) => CJK_QUOTES[mark]!)

/**
 * Dịch một lô đơn vị qua mô hình AI:
 * - Ánh xạ ID tạm [1], [2], ...
 * - Gửi prompt chuẩn hóa
 * - Phân tích cú pháp khoan dung
 * - Đối soát ID
 * - Hỏi lại (repair) đúng các ID bị thiếu 1 lần duy nhất
 */
export async function executeTranslateBatch(
  options: TranslateCoreBatchOptions
): Promise<TranslateCoreBatchOutcome> {
  const raw = await runTranslateBatch(options)
  // The prompt asks for “…” and ‘…’, yet models still return 「」『』 in some batches (Truyện test,
  // 2026-10-23: 84 paragraphs), which leaves a chapter with mixed quotes.
  const outcome = {
    ...raw,
    items: raw.items.map((item) => ({ ...item, text: vietnameseQuotes(item.text) }))
  }
  const { log, units } = options
  if (log) {
    // What the app kept, next to the raw answers above it: a lost quote or word shows which side lost it.
    const source = new Map(units.map((unit) => [unit.id, unit.text]))
    appendAiCall(log.workId, {
      kind: 'translate.result',
      ...log,
      promptVersion: TRANSLATE_PROMPT_VERSION,
      items: outcome.items.map((item) => ({
        id: item.id,
        src: source.get(item.id),
        dst: item.text
      })),
      failedIds: outcome.failedIds,
      refusedIds: outcome.refusedIds,
      error: outcome.error,
      structure: outcome.structure
    })
  }
  return outcome
}

async function runTranslateBatch({
  caller,
  units,
  prompt = {},
  signal,
  now,
  budget = new CallBudget(1, LOCAL_EXTRA),
  log
}: TranslateCoreBatchOptions): Promise<TranslateCoreBatchOutcome> {
  let totalUsage: Usage | null = null
  const record = (
    round: BudgetRound,
    messages: Parameters<TranslationModelCaller['complete']>[0],
    mode: OutputMode,
    answer: Record<string, unknown>
  ): void => {
    if (!log) return
    appendAiCall(log.workId, {
      kind: 'translate.' + round,
      ...log,
      promptVersion: TRANSLATE_PROMPT_VERSION,
      outputMode: mode,
      messages,
      ...answer
    })
  }
  // Mọi lời gọi model của lô đi qua đây: xin ngân sách trước, ghi số request HTTP thật sau.
  const call = async (
    round: BudgetRound,
    messages: Parameters<TranslationModelCaller['complete']>[0],
    mode: OutputMode
  ): Promise<ModelCompletionResult | null> => {
    if (!budget.take(round)) return null
    try {
      // Chế độ tắt thì lời gọi y như trước: không có khóa `responseFormat` nào.
      const result = await caller.complete(
        messages,
        mode === 'object' ? { signal, responseFormat: TRANSLATE_RESPONSE_FORMAT } : { signal }
      )
      budget.addAttempts(result.attempts ?? 1)
      record(round, messages, mode, {
        raw: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
        attempts: result.attempts,
        ...(result.filter ? { filter: result.filter } : {})
      })
      return result
    } catch (error) {
      budget.addAttempts(1)
      record(round, messages, mode, {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  // 1. Ánh xạ ID tạm và tách đơn vị rỗng
  const { sendable, skippedEmpty, tempToId } = mapToTempIds(units)

  const structure = { extraneous: 0, duplicate: 0, repaired: 0 }
  if (sendable.length === 0) {
    return {
      items: skippedEmpty,
      failedIds: [],
      refusedIds: [],
      refusals: [],
      budgetIds: [],
      withoutContextIds: [],
      usage: null,
      error: null,
      request: null,
      structure
    }
  }

  // 2. Gửi yêu cầu chính tới mô hình. `active` là ngữ cảnh mọi lượt sau dùng: chia lô, gửi lại không ngữ
  // cảnh và hỏi lại giữ chế độ đầu ra của lô (sau khi rơi về nếu có).
  let active: TranslatePromptContext = prompt
  const modeOf = (context: TranslatePromptContext): OutputMode => context.outputMode ?? 'array'
  let usedMode: UsedOutputMode = modeOf(prompt)
  let main = buildTranslateRequest(active, sendable)
  const requestOf = (): NonNullable<TranslateCoreBatchOutcome['request']> => ({
    version: main.version,
    systemHash: main.systemHash,
    requestHash: main.requestHash,
    outputMode: usedMode
  })
  let request = requestOf()

  let mainCall: ModelCompletionResult
  try {
    let answer: ModelCompletionResult | null
    try {
      answer = await call('main', main.messages, modeOf(active))
    } catch (error) {
      // Schema bị nhà cung cấp từ chối (lỗi cấu hình, không phải nội dung bị chặn): gửi lại lô đúng một lần
      // không schema, và báo để các lô sau của lượt khỏi gửi schema nữa (D6).
      if (!(error instanceof ProviderError) || error.kind !== 'invalid_request') throw error
      if (modeOf(active) !== 'object') throw error
      active = { ...prompt, outputMode: 'array' }
      usedMode = 'object→fallback'
      main = buildTranslateRequest(active, sendable)
      request = requestOf()
      answer = await call('fallback', main.messages, 'array')
    }
    if (answer === null) {
      const ids = sendable.map((u) => u.originalId)
      return {
        items: skippedEmpty,
        failedIds: ids,
        refusedIds: [],
        refusals: [],
        budgetIds: ids,
        withoutContextIds: [],
        usage: null,
        error: {
          kind: 'budget_exhausted',
          message: `Hết ngân sách lời gọi của lượt dịch; ${ids.length} đoạn chưa được gửi. Thử lại phần lỗi để gửi tiếp.`,
          recoverAt: null
        },
        request,
        structure
      }
    }
    mainCall = answer
    totalUsage = addUsage(totalUsage, mainCall.usage)
  } catch (error) {
    if (error instanceof ProviderError) {
      const currentTime = now ? now() : Date.now()
      const recoverAt =
        error.retryAfterMs === undefined ? null : currentTime + Math.max(0, error.retryAfterMs)
      return {
        items: skippedEmpty,
        failedIds: sendable.map((u) => u.originalId),
        refusedIds: [],
        refusals: [],
        budgetIds: [],
        withoutContextIds: [],
        usage: totalUsage,
        error: {
          kind: error.kind,
          message: describeProviderError(error),
          recoverAt,
          ...(error.quotaScope ? { quotaScope: error.quotaScope } : {}),
          detail: [error.message, error.bodySnippet].filter(Boolean).join('\n')
        },
        request,
        structure
      }
    }
    throw error
  }

  if (mainCall.finishReason === 'length') {
    return {
      items: skippedEmpty,
      failedIds: sendable.map((u) => u.originalId),
      refusedIds: [],
      refusals: [],
      budgetIds: [],
      withoutContextIds: [],
      usage: totalUsage,
      error: {
        kind: 'invalid_response',
        message: 'Phản hồi bị cắt vì hết giới hạn đầu ra.',
        recoverAt: null
      },
      request,
      structure
    }
  }

  // 3. Phân tích cú pháp và đối soát. Lô bị bộ lọc nội dung chặn thì chia đôi để cứu các đoạn vô can.
  const matched: TranslateUnit[] = []
  let missingIds: string[] = []
  let refusals: SegmentRefusal[] = []
  const budgetIds: string[] = []
  let withoutContextIds: string[] = []
  if (mainCall.finishReason === 'filter') {
    const split = await splitFiltered(
      sendable,
      active,
      (messages) => call('split', messages, modeOf(active)),
      tempToId,
      signal,
      false,
      mainCall.filter
    )
    totalUsage = addUsage(totalUsage, split.usage)
    matched.push(...split.matched)
    missingIds = split.missing
    refusals = split.refused
    budgetIds.push(...split.unsent)

    // Đoạn vẫn bị chặn: thử thêm một vòng không kèm glossary, nhân vật và cặp xưng hô. Lý do giữ lại là
    // của lần chặn cuối cùng; đoạn qua được ở vòng này thì không còn lý do nào.
    const bare = withoutWorkContext(active)
    if (refusals.length > 0 && bare && !signal?.aborted) {
      const blocked = new Set(refusals.map((refusal) => refusal.id))
      const refusedUnits = sendable.filter((u) => blocked.has(u.originalId))
      const retry = await splitFiltered(
        refusedUnits,
        bare,
        (messages) => call('bare', messages, modeOf(bare)),
        tempToId,
        signal,
        true
      )
      totalUsage = addUsage(totalUsage, retry.usage)
      matched.push(...retry.matched)
      withoutContextIds = retry.matched.map((item) => item.id)
      missingIds.push(...retry.missing)
      // Đoạn chưa được gửi lại vì hết ngân sách vẫn là đoạn đã bị chặn ở vòng có ngữ cảnh: giữ lý do đó.
      const unsentBare = new Set(retry.unsent)
      refusals = [...retry.refused, ...refusals.filter((refusal) => unsentBare.has(refusal.id))]
    }
  } else {
    const reconciliation = reconcileTempItems(
      sendable,
      tempToId,
      parseTranslationResponse(mainCall.text)
    )
    matched.push(...reconciliation.matched)
    missingIds = [...reconciliation.missing, ...reconciliation.empty]
    structure.extraneous = reconciliation.extraneous.length
    structure.duplicate = reconciliation.duplicate ?? 0
  }

  // 4. Nếu có ID thiếu và chưa bị hủy, hỏi lại đúng các ID đó 1 lần
  if (missingIds.length > 0 && !signal?.aborted) {
    const missingUnits = sendable.filter((u) => missingIds.includes(u.originalId))
    if (missingUnits.length > 0) {
      const repair = buildRepairRequest(active, missingUnits)
      structure.repaired = missingUnits.length

      try {
        const repairCall = await call('repair', repair.messages, modeOf(active))
        if (repairCall === null) {
          // Không còn ngân sách để hỏi lại: thử lại phần lỗi sẽ có ích, nên không gọi là "thiếu".
          budgetIds.push(...missingIds)
          missingIds = []
        } else {
          totalUsage = addUsage(totalUsage, repairCall.usage)
        }

        if (repairCall !== null && repairCall.finishReason !== 'length') {
          const repairParsed = parseTranslationResponse(repairCall.text)
          const repairReconciliation = reconcileTempItems(missingUnits, tempToId, repairParsed, {
            acceptEcho: true
          })

          matched.push(...repairReconciliation.matched)
          const newlyMatchedIds = new Set(repairReconciliation.matched.map((m) => m.id))
          missingIds = missingIds.filter((id) => !newlyMatchedIds.has(id))
        }
      } catch {
        // Lỗi ở lượt sửa không làm mất các câu đã dịch được ở lượt chính
      }
    }
  }

  const allItems = [...skippedEmpty, ...matched]
  const refusedIds = refusals.map((refusal) => refusal.id)
  const budgetNote =
    budgetIds.length > 0
      ? ` ${budgetIds.length} đoạn chưa xong vì hết ngân sách lời gọi; thử lại phần lỗi để gửi tiếp.`
      : ''
  const missingNote =
    missingIds.length > 0 ? ` Thiếu thêm ${missingIds.length} đoạn sau khi đã thử lại.` : ''
  // Nặng nhất đứng tên lỗi: bị chặn (thử lại vô ích), rồi hết ngân sách (thử lại có ích), rồi thiếu.
  const error: CoreFailure | null =
    refusals.length > 0
      ? {
          kind: 'refused',
          message:
            describeRefusals(refusals.map((refusal) => refusal.group)) + missingNote + budgetNote,
          recoverAt: null
        }
      : budgetIds.length > 0
        ? {
            kind: 'budget_exhausted',
            message: `Hết ngân sách lời gọi của lượt dịch.${budgetNote}${missingNote}`,
            recoverAt: null
          }
        : missingIds.length > 0
          ? {
              kind: 'invalid_response',
              message: `Thiếu ${missingIds.length} đoạn sau khi đã thử lại.`,
              recoverAt: null
            }
          : null

  return {
    items: allItems,
    failedIds: [...missingIds, ...refusedIds, ...budgetIds],
    refusedIds,
    refusals,
    budgetIds,
    withoutContextIds,
    usage: totalUsage,
    error,
    request,
    structure
  }
}

/**
 * Ngữ cảnh gửi lại cho đoạn bị chặn: bỏ glossary, nhân vật và cặp xưng hô, giữ nguyên bản gốc, đoạn
 * liền trước và mọi chỉ dẫn. `null` khi prompt vốn không có các khối đó, gửi lại cũng như cũ.
 */
function withoutWorkContext(prompt: TranslatePromptContext): TranslatePromptContext | null {
  const has = (list?: unknown[]): boolean => (list?.length ?? 0) > 0
  if (!has(prompt.glossary) && !has(prompt.characters) && !has(prompt.dyads)) return null
  return { ...prompt, glossary: [], characters: [], dyads: [] }
}

/**
 * Trần an toàn cho một vòng chia, cùng với ngân sách lời gọi của lượt (`CallBudget`): đủ cho lô 30 đoạn
 * có vài đoạn xấu. Ngân sách mặc định của một lượt thấp hơn trần này; trần chỉ còn tác dụng khi lô chạy
 * không kèm ngân sách lượt.
 */
export const MAX_FILTER_SPLIT_CALLS = 16

/**
 * Lô bị bộ lọc nội dung của nhà cung cấp chặn: chia đôi và gửi lại từng nửa, cho tới khi khoanh được
 * đúng các đoạn vẫn bị chặn khi đứng một mình. Thường chỉ vài câu kích hoạt bộ lọc, mà không chia thì
 * cả lô mất. Không đổi nội dung hay chỉ dẫn gửi đi: đoạn bộ lọc vẫn chặn thì để trống và báo
 * `refused`. Nửa trả về bình thường mà thiếu id thì để lượt hỏi lại xử lý như mọi lô.
 * `untried`: `units` chưa gửi với `prompt` này, gửi cả nhóm trước rồi mới chia.
 */
async function splitFiltered(
  units: TempMappedUnit[],
  prompt: TranslatePromptContext,
  /** Gọi model qua ngân sách lượt; `null` là hết ngân sách, phần đó không được gửi. */
  complete: (
    messages: Parameters<TranslationModelCaller['complete']>[0]
  ) => Promise<ModelCompletionResult | null>,
  tempToId: Map<string, string>,
  signal?: AbortSignal,
  untried = false,
  firstReason?: ModelCompletionResult['filter']
): Promise<{
  matched: TranslateUnit[]
  missing: string[]
  refused: SegmentRefusal[]
  /** Phần không được gửi vì hết ngân sách lượt. */
  unsent: string[]
  usage: Usage | null
}> {
  const matched: TranslateUnit[] = []
  const missing: string[] = []
  const refused: SegmentRefusal[] = []
  const unsent: string[] = []
  let usage: Usage | null = null
  let calls = 0
  const ids = (part: TempMappedUnit[]): string[] => part.map((unit) => unit.originalId)

  // `part` là phần vừa bị chặn và `reason` là lý do của lần chặn đó: một đoạn thì đã khoanh xong và mang
  // lý do ấy, nhiều hơn thì chia tiếp.
  const narrow = async (
    part: TempMappedUnit[],
    reason: ModelCompletionResult['filter']
  ): Promise<void> => {
    if (part.length === 1) {
      refused.push({
        id: part[0].originalId,
        group: reason?.group ?? 'other',
        raw: reason?.raw ?? ''
      })
      return
    }
    const middle = Math.ceil(part.length / 2)
    for (const half of [part.slice(0, middle), part.slice(middle)]) await attempt(half)
  }

  const attempt = async (part: TempMappedUnit[]): Promise<void> => {
    if (signal?.aborted || calls >= MAX_FILTER_SPLIT_CALLS) {
      missing.push(...ids(part))
      return
    }
    calls++
    let result: ModelCompletionResult
    try {
      const answer = await complete(buildTranslateRequest(prompt, part).messages)
      if (answer === null) {
        unsent.push(...ids(part))
        return
      }
      result = answer
    } catch {
      missing.push(...ids(part))
      return
    }
    usage = addUsage(usage, result.usage)
    if (result.finishReason === 'filter') {
      await narrow(part, result.filter)
    } else if (result.finishReason === 'length') {
      missing.push(...ids(part))
    } else {
      const reconciliation = reconcileTempItems(
        part,
        tempToId,
        parseTranslationResponse(result.text)
      )
      matched.push(...reconciliation.matched)
      missing.push(...reconciliation.missing, ...reconciliation.empty)
    }
  }

  await (untried ? attempt(units) : narrow(units, firstReason))
  return { matched, missing, refused, unsent, usage }
}
