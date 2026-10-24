import { describe, expect, it } from 'vitest'
import { aggregateTokenUsage, calculateTurnCost, ESTIMATE_LABEL, sumTurnCost } from './agentUsage'
import type { TokenUsage } from '../../../shared/contracts/usage'
import type { ModelInfo } from '../../infra/providers/modelCatalog'

describe('agentUsage (aggregate and cost)', () => {
  it('aggregates usage across multiple calls without double counting cache or reasoning in inputTokens', () => {
    const call1: TokenUsage = {
      inputTokens: 1000,
      uncachedInputTokens: 800,
      cacheReadTokens: 200,
      outputTokens: 500,
      reasoningTokens: 100,
      source: 'provider',
      complete: true
    }

    const call2: TokenUsage = {
      inputTokens: 500,
      uncachedInputTokens: 500,
      outputTokens: 200,
      source: 'provider',
      complete: true
    }

    const total = aggregateTokenUsage([call1, call2])
    expect(total).not.toBeNull()
    // inputTokens is strictly 1000 + 500 = 1500, NOT adding cacheReadTokens to total
    expect(total?.inputTokens).toBe(1500)
    expect(total?.uncachedInputTokens).toBe(1300)
    expect(total?.cacheReadTokens).toBe(200)
    expect(total?.outputTokens).toBe(700)
    expect(total?.reasoningTokens).toBe(100)
    expect(total?.source).toBe('provider')
    expect(total?.complete).toBe(true)
  })

  it('marks complete=false if any call failed to report usage', () => {
    const call1: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      source: 'provider',
      complete: true
    }

    // Call 2 had no usage reported
    const total = aggregateTokenUsage([call1, null])
    expect(total?.inputTokens).toBe(1000)
    expect(total?.outputTokens).toBe(500)
    expect(total?.complete).toBe(false)
  })

  it('preserves null cost when usage is missing or catalog price is unknown, never returning 0', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      source: 'provider',
      complete: true
    }

    // 1. Missing model
    expect(calculateTurnCost(null, undefined)).toEqual({ costUsd: null, label: ESTIMATE_LABEL })
    expect(calculateTurnCost(usage, undefined)).toEqual({ costUsd: null, label: ESTIMATE_LABEL })

    // 2. Model with missing prices
    const freeModel: ModelInfo = {
      id: 'custom-model',
      name: 'Custom',
      contextLimit: 8192
    }
    expect(calculateTurnCost(usage, freeModel)).toEqual({ costUsd: null, label: ESTIMATE_LABEL })

    // 3. Model with prices
    const paidModel: ModelInfo = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextLimit: 128000,
      cost: {
        input: 2.5, // $2.5 per 1M tokens
        output: 10.0 // $10 per 1M tokens
      }
    }
    const cost = calculateTurnCost(usage, paidModel)
    expect(cost.costUsd).toBeGreaterThan(0)
    // 1000 * 2.5 / 1M = 0.0025; 500 * 10 / 1M = 0.005; total = 0.0075
    expect(cost.costUsd).toBe(0.0075)
    expect(cost.label).toBe(ESTIMATE_LABEL)
  })

  it('prices each part of a turn by the model that produced it', () => {
    const main: ModelInfo = { id: 'main', name: 'Main', cost: { input: 2.5, output: 10 } }
    const cheap: ModelInfo = { id: 'cheap', name: 'Cheap', cost: { input: 0.1, output: 0.4 } }
    const part = (inputTokens: number, outputTokens: number): TokenUsage => ({
      inputTokens,
      outputTokens,
      source: 'provider',
      complete: true
    })
    // The turn's own rounds carry no model and fall back to the turn's.
    const parts = [{ usage: part(1000, 500) }, { usage: part(10_000, 1000), model: cheap }]
    // 0.0075 for the turn's model, 10,000 * 0.1 / 1M + 1000 * 0.4 / 1M = 0.0014 for the cheap one.
    expect(sumTurnCost(parts, main)).toBeCloseTo(0.0089, 10)
    expect(aggregateTokenUsage(parts.map((p) => p.usage))).toMatchObject({
      inputTokens: 11_000,
      outputTokens: 1500
    })
  })

  it('has no turn cost when a part is unpriced or nothing reported usage', () => {
    const main: ModelInfo = { id: 'main', name: 'Main', cost: { input: 2.5, output: 10 } }
    const free: ModelInfo = { id: 'free', name: 'Free' }
    const usage: TokenUsage = {
      inputTokens: 10,
      outputTokens: 10,
      source: 'provider',
      complete: true
    }
    expect(sumTurnCost([{ usage }, { usage, model: free }], main)).toBeNull()
    expect(sumTurnCost([{ usage: null }], main)).toBeNull()
    expect(sumTurnCost([], main)).toBeNull()
  })
})
