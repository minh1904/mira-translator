import { describe, expect, it } from 'vitest'
import { ProviderError, type ProviderErrorKind } from '../types'
import { AdaptiveLimit, PAUSE_BASE_MS, PAUSE_MAX_MS } from './adaptiveLimit'
import { Limiter } from './limiter'

/** Đồng hồ giả: `sleep` chỉ đẩy giờ lên, ghi lại mỗi lần ngủ. */
function setup(ceiling = 4, random = 0.5) {
  const clock = { now: 1_000_000 }
  const slept: number[] = []
  const limiter = new Limiter(1)
  const adaptive = new AdaptiveLimit(
    limiter,
    ceiling,
    () => clock.now,
    () => random,
    async (ms) => {
      slept.push(ms)
      clock.now += ms
    }
  )
  return { clock, slept, limiter, adaptive }
}

const error = (kind: ProviderErrorKind, retryAfterMs?: number): ProviderError =>
  new ProviderError(kind, 'x', retryAfterMs === undefined ? {} : { retryAfterMs })

/** Đưa mức lên `level` bằng các lời gọi thành công. */
function grow(adaptive: AdaptiveLimit, level: number): void {
  while (adaptive.current < level) adaptive.succeeded()
}

describe('AdaptiveLimit', () => {
  it('starts with one call and adds one after every two successes, up to the ceiling', () => {
    const { adaptive, limiter } = setup(3)
    expect(limiter.current).toBe(1)
    adaptive.succeeded()
    expect(adaptive.current).toBe(1)
    adaptive.succeeded()
    expect(adaptive.current).toBe(2)
    for (let i = 0; i < 10; i++) adaptive.succeeded()
    expect(adaptive.current).toBe(3)
    expect(limiter.current).toBe(3)
  })

  it('halves only once when three calls hit a rate limit together', () => {
    const { adaptive, limiter } = setup(4)
    grow(adaptive, 4)
    for (let i = 0; i < 3; i++) adaptive.failed(error('rate_limited'))
    expect(adaptive.current).toBe(2)
    expect(limiter.current).toBe(2)
  })

  it('never goes below one', () => {
    const { adaptive, clock } = setup(4)
    adaptive.failed(error('rate_limited'))
    clock.now = adaptive.pausedUntilMs
    adaptive.failed(error('rate_limited'))
    expect(adaptive.current).toBe(1)
  })

  it('starts no new call before the wait the provider asked for', async () => {
    const { adaptive, clock, slept } = setup()
    const start = clock.now
    adaptive.failed(error('rate_limited', 20_000))
    await adaptive.waitForPause()
    expect(clock.now - start).toBe(20_000)
    expect(slept).toEqual([20_000])
  })

  it('backs off with jitter, doubling on repeated limits, capped at a minute', () => {
    const low = setup(4, 0)
    low.adaptive.failed(error('rate_limited'))
    expect(low.adaptive.pausedUntilMs - low.clock.now).toBe(PAUSE_BASE_MS * 0.8)

    const { adaptive, clock } = setup(4, 1)
    const waits: number[] = []
    for (let i = 0; i < 7; i++) {
      adaptive.failed(error('rate_limited'))
      waits.push(adaptive.pausedUntilMs - clock.now)
      clock.now = adaptive.pausedUntilMs
    }
    expect(waits.slice(0, 3)).toEqual([2_400, 4_800, 9_600])
    expect(Math.max(...waits)).toBe(PAUSE_MAX_MS)
  })

  it('leaves the level alone on quota, auth, network and timeout errors', () => {
    const { adaptive } = setup(4)
    grow(adaptive, 3)
    for (const kind of ['quota', 'auth', 'network', 'timeout'] as const)
      adaptive.failed(error(kind))
    expect(adaptive.current).toBe(3)
    expect(adaptive.pausedUntilMs).toBe(0)
  })

  it('climbs back to the ceiling once calls succeed again', async () => {
    const { adaptive } = setup(4)
    grow(adaptive, 4)
    adaptive.failed(error('rate_limited'))
    await adaptive.waitForPause()
    const seen: number[] = []
    for (let i = 0; i < 8; i++) {
      adaptive.succeeded()
      seen.push(adaptive.current)
    }
    expect(seen).toEqual([2, 3, 3, 4, 4, 4, 4, 4])
  })

  it('keeps the level under a lowered ceiling', () => {
    const { adaptive, limiter } = setup(4)
    grow(adaptive, 4)
    adaptive.setCeiling(2)
    expect(limiter.current).toBe(2)
  })
})
