import type { TranslateUnit } from '../contracts/translateCore'

export interface PlanOptions {
  /** Giới hạn số đơn vị tối đa trong một lô */
  maxUnits?: number
  /** Giới hạn ước tính token tối đa cho một lô */
  maxTokens?: number
  /** Ngôn ngữ nguồn để ước tính token chính xác */
  sourceLang?: string
}

export interface PlannedBatch {
  units: TranslateUnit[]
  estimatedTokens: number
  charCount: number
}

export interface BatchPlan {
  batches: PlannedBatch[]
  totalUnits: number
  totalEstimatedTokens: number
}

export const DEFAULT_MAX_UNITS = 100
export const DEFAULT_MAX_TOKENS = 4500

/**
 * Ước tính số token của chuỗi văn bản dựa trên ngôn ngữ nguồn.
 */
export function estimateTextTokens(text: string, lang?: string): number {
  if (text.length === 0) return 0
  const isCjk = lang === 'zh-Hans' || lang === 'zh-Hant' || lang === 'ja'
  // CJK ~1.5 ký tự mỗi token; Latin ~3.5-4 ký tự mỗi token
  const charsPerToken = isCjk ? 1.5 : 3.8
  return Math.max(1, Math.ceil(text.length / charsPerToken))
}

/**
 * Lập kế hoạch chia các đơn vị dịch thành nhiều lô an toàn.
 *
 * Không cắt đơn vị: một đoạn dài hơn trần token vẫn đi trọn trong một lô riêng. Bản cũ cắt đoạn trên
 * 1600 ký tự thành mảnh tạm, nhưng không luồng dịch nào ráp lại, nên cả hai nơi gọi đều phải tắt nó.
 */
export function planBatches(units: TranslateUnit[], options?: PlanOptions): BatchPlan {
  const maxUnits = options?.maxUnits ?? DEFAULT_MAX_UNITS
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS
  const lang = options?.sourceLang

  const batches: PlannedBatch[] = []
  let currentUnits: TranslateUnit[] = []
  let currentTokens = 0
  let currentChars = 0

  for (const unit of units) {
    const cost = estimateTextTokens(unit.text, lang)

    const exceedsUnitLimit = currentUnits.length >= maxUnits
    const exceedsTokenLimit = currentUnits.length > 0 && currentTokens + cost > maxTokens

    if (exceedsUnitLimit || exceedsTokenLimit) {
      batches.push({
        units: currentUnits,
        estimatedTokens: currentTokens,
        charCount: currentChars
      })
      currentUnits = []
      currentTokens = 0
      currentChars = 0
    }

    currentUnits.push(unit)
    currentTokens += cost
    currentChars += unit.text.length
  }

  if (currentUnits.length > 0) {
    batches.push({
      units: currentUnits,
      estimatedTokens: currentTokens,
      charCount: currentChars
    })
  }

  const totalEstimatedTokens = batches.reduce((sum, b) => sum + b.estimatedTokens, 0)

  return {
    batches,
    totalUnits: units.length,
    totalEstimatedTokens
  }
}
