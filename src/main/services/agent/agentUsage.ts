import type { TokenUsage } from '../../../shared/contracts/usage'
import type { ModelInfo } from '../../infra/providers/modelCatalog'
import { costOfUsage } from '../ai/costEstimate'

export const ESTIMATE_LABEL = 'ước tính theo bảng giá'

/**
 * Cộng dồn TokenUsage từ nhiều lời gọi provider / tool / batch.
 *
 * Luật không bao giờ phá:
 * - `inputTokens` wire là tổng input, không cộng thêm `cacheReadTokens` hay `cacheWriteTokens`.
 * - `reasoningTokens` là subset của `outputTokens`, không cộng thêm vào tổng.
 * - Nếu có bất kỳ lời gọi nào thực sự chạy mà không báo usage (hoặc `complete = false`),
 *   kết quả tổng phải có `complete = false`.
 * - Không tự ý điền 0 cho dữ liệu thiếu.
 */
export function aggregateTokenUsage(
  usages: Array<TokenUsage | null | undefined>,
  options?: { anyCallWithoutUsage?: boolean }
): TokenUsage | null {
  if (usages.length === 0 && !options?.anyCallWithoutUsage) return null

  let inputTokens = 0
  let outputTokens = 0
  let uncachedInputTokens: number | undefined
  let cacheReadTokens: number | undefined
  let cacheWriteTokens: number | undefined
  let reasoningTokens: number | undefined
  let complete = !options?.anyCallWithoutUsage
  let hasAny = false

  for (const u of usages) {
    if (u === null || u === undefined) {
      complete = false
      continue
    }
    hasAny = true
    inputTokens += u.inputTokens
    outputTokens += u.outputTokens
    if (u.complete === false) complete = false

    if (u.uncachedInputTokens !== undefined) {
      uncachedInputTokens = (uncachedInputTokens ?? 0) + u.uncachedInputTokens
    }
    if (u.cacheReadTokens !== undefined) {
      cacheReadTokens = (cacheReadTokens ?? 0) + u.cacheReadTokens
    }
    if (u.cacheWriteTokens !== undefined) {
      cacheWriteTokens = (cacheWriteTokens ?? 0) + u.cacheWriteTokens
    }
    if (u.reasoningTokens !== undefined) {
      reasoningTokens = (reasoningTokens ?? 0) + u.reasoningTokens
    }
  }

  if (!hasAny) {
    return options?.anyCallWithoutUsage
      ? { inputTokens: 0, outputTokens: 0, source: 'provider', complete: false }
      : null
  }

  return {
    inputTokens,
    ...(uncachedInputTokens !== undefined ? { uncachedInputTokens } : {}),
    outputTokens,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    source: 'provider',
    complete
  }
}

/**
 * Tính chi phí của một lượt dựa trên usage thật của provider và catalog giá.
 * Trả về `null` khi thiếu usage hoặc thiếu giá; không bao giờ trả về 0 cho dữ liệu thiếu.
 */
export function calculateTurnCost(
  usage: TokenUsage | null | undefined,
  model?: ModelInfo
): { costUsd: number | null; label: string } {
  if (!usage || !model?.cost?.input || !model?.cost?.output) {
    return { costUsd: null, label: ESTIMATE_LABEL }
  }
  const cost = costOfUsage(
    {
      inputTokens: usage.uncachedInputTokens ?? usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens
    },
    model
  )
  return { costUsd: cost, label: ESTIMATE_LABEL }
}

/** Usage of one provider call of a turn, with the model that made it when that is not the turn's. */
export interface PricedUsage {
  usage: TokenUsage | null
  model?: ModelInfo
}

/**
 * Cost of a turn whose calls ran on several models (turn, auxiliary): each model's usage, summed first
 * because a single call's cost is rounded, at that model's price. `null` when nothing reported usage or
 * a model that did has no price, never a partial sum.
 */
export function sumTurnCost(parts: PricedUsage[], turnModel?: ModelInfo): number | null {
  const byModel = new Map<ModelInfo | undefined, Array<TokenUsage | null>>()
  for (const part of parts) {
    const model = part.model ?? turnModel
    byModel.set(model, [...(byModel.get(model) ?? []), part.usage])
  }
  let total: number | null = null
  for (const [model, usages] of byModel) {
    const usage = aggregateTokenUsage(usages)
    if (!usage) continue
    const cost = calculateTurnCost(usage, model).costUsd
    if (cost === null) return null
    total = (total ?? 0) + cost
  }
  return total
}
