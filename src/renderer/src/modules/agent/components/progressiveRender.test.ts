import { describe, expect, it } from 'vitest'
import {
  closeOpenFence,
  countWords,
  estimateRate,
  nextWordCount,
  RENDER_RATE,
  sliceWords
} from './progressiveRender'

describe('progressive rendering', () => {
  it('counts and slices words without losing spacing', () => {
    expect(countWords('Một hai  ba\nbốn')).toBe(4)
    expect(sliceWords('Một hai  ba\nbốn', 3)).toBe('Một hai  ba\n')
    expect(sliceWords('Một hai', 9)).toBe('Một hai')
  })

  it('starts at 8 words a second and clamps the measured rate to 40–2000', () => {
    expect(estimateRate(0, 0)).toBe(RENDER_RATE.initial)
    expect(estimateRate(1, 1000)).toBe(40)
    expect(estimateRate(100_000, 1000)).toBe(2000)
    expect(estimateRate(300, 1000)).toBe(300)
  })

  it('advances by the rate and drains at least 80 words a second once done', () => {
    expect(nextWordCount({ rendered: 0, total: 100, elapsedMs: 500, rate: 40, done: false })).toBe(
      20
    )
    expect(nextWordCount({ rendered: 0, total: 100, elapsedMs: 500, rate: 40, done: true })).toBe(
      40
    )
    expect(
      nextWordCount({ rendered: 95, total: 100, elapsedMs: 1000, rate: 40, done: false })
    ).toBe(100)
    // Even a short frame shows at least one more word.
    expect(nextWordCount({ rendered: 3, total: 10, elapsedMs: 1, rate: 8, done: false })).toBe(4)
  })

  it('closes an open fence and hides one with no content yet', () => {
    expect(closeOpenFence('a\n```ts\nconst x = 1')).toBe('a\n```ts\nconst x = 1\n```')
    expect(closeOpenFence('a\n```ts\n')).toBe('a')
    expect(closeOpenFence('a\n```ts\nx\n```\nb')).toBe('a\n```ts\nx\n```\nb')
  })
})
