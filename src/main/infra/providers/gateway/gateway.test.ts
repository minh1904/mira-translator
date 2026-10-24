import { describe, expect, it } from 'vitest'
import { ProviderError, type ProviderErrorKind } from '../types'
import { Gateway, GatewayRegistry, outcomeFor } from './gateway'
import { AdaptiveLimit } from './adaptiveLimit'
import type { KeyExhausted, KeyLease, KeyOutcome, KeySource } from './keys'
import { KeyScheduler, type KeyRecord, type Lease } from './keyScheduler'
import { Limiter } from './limiter'
import { RatePacer } from './ratePacer'

const NOW = 1_700_000_000_000

interface MemoryKeys {
  source: KeySource
  rows: KeyRecord[]
  reports: Array<{ key: string | null; outcome: KeyOutcome }>
  acquired: string[]
  clock: { now: number }
}

/** Kho lưu trữ khóa trong bộ nhớ phục vụ kiểm thử, ghi nhận mọi báo cáo nhận được. */
function memoryKeys(ids: string[], clock: { now: number } = { now: NOW }): MemoryKeys {
  const rows: KeyRecord[] = ids.map((id) => ({
    id,
    state: 'ok',
    frozenUntil: null,
    frozenScope: null,
    freezeStrikes: 0
  }))
  const scheduler = new KeyScheduler(() => clock.now)
  const issued = new WeakMap<KeyLease, Lease>()
  const reports: Array<{ key: string | null; outcome: KeyOutcome }> = []
  const acquired: string[] = []

  const source: KeySource = {
    async acquire(): Promise<KeyLease | KeyExhausted> {
      if (rows.length === 0) return { id: null, secret: null }
      const pick = scheduler.pick(rows)
      if ('exhausted' in pick) return { exhausted: true, recoverAt: pick.recoverAt }
      const lease: KeyLease = { id: pick.lease.keyId, secret: 'secret-' + pick.lease.keyId }
      issued.set(lease, pick.lease)
      acquired.push(pick.lease.keyId)
      return lease
    },
    async report(lease, outcome) {
      reports.push({ key: lease.id, outcome })
      if (lease.id === null) return
      const inner = issued.get(lease)
      if (inner === undefined)
        throw new Error('a lease was reported that was never handed out, or twice')
      issued.delete(lease)
      const row = rows.find((candidate) => candidate.id === lease.id)
      const effect = scheduler.settle(inner, outcome, row)
      if (row === undefined) return
      if (effect.kind === 'clear')
        Object.assign(row, { state: 'ok', frozenUntil: null, frozenScope: null, freezeStrikes: 0 })
      if (effect.kind === 'freeze') {
        Object.assign(row, {
          frozenUntil: effect.until,
          frozenScope: effect.scope,
          freezeStrikes: effect.strikes
        })
      }
      if (effect.kind === 'invalid') Object.assign(row, { state: 'invalid', frozenUntil: null })
    }
  }
  return { source, rows, reports, acquired, clock }
}

const fail = (
  kind: ProviderErrorKind,
  over: { retryAfterMs?: number; status?: number } = {}
): ProviderError => new ProviderError(kind, kind + ' happened', over)

interface Rig {
  gateway: Gateway
  keys: MemoryKeys
  limiter: Limiter
  sleeps: number[]
}

function rig(
  ids: string[],
  over: {
    limit?: number
    waitForKeys?: boolean
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  } = {}
): Rig {
  const keys = memoryKeys(ids)
  const limiter = new Limiter(over.limit ?? 4)
  const sleeps: number[] = []
  const gateway = new Gateway({
    keys: keys.source,
    limiter,
    now: () => keys.clock.now,
    random: () => 0.5,
    sleep:
      over.sleep ??
      (async (ms) => {
        sleeps.push(ms)
        keys.clock.now += ms
      }),
    waitForKeys: over.waitForKeys
  })
  return { gateway, keys, limiter, sleeps }
}

const drain = async <E>(stream: AsyncGenerator<E>): Promise<{ events: E[]; error: unknown }> => {
  const events: E[] = []
  try {
    for await (const event of stream) events.push(event)
  } catch (error) {
    return { events, error }
  }
  return { events, error: null }
}

describe('call: trouble that belongs to the key', () => {
  it('moves to the next key at once, without waiting, when a key is rate limited', async () => {
    const { gateway, keys, sleeps } = rig(['a', 'b'])
    const used: string[] = []
    const result = await gateway.call(async (lease) => {
      used.push(lease.id as string)
      if (lease.id === 'a') throw fail('rate_limited', { status: 429 })
      return 'done'
    })
    expect(result).toBe('done')
    expect(used).toEqual(['a', 'b'])
    expect(sleeps).toEqual([])
    expect(keys.reports.map((r) => r.key)).toEqual(['a', 'b'])
    expect(keys.reports[1]!.outcome).toBe('ok')
  })

  it('retires a wrong key and finishes the same call on the next one', async () => {
    const { gateway, keys } = rig(['bad', 'good'])
    const result = await gateway.call(async (lease) => {
      if (lease.id === 'bad') throw fail('auth', { status: 401 })
      return 'done'
    })
    expect(result).toBe('done')
    expect(keys.rows.find((r) => r.id === 'bad')!.state).toBe('invalid')
  })

  it('parks an account that is out of credit and goes on with another key', async () => {
    const { gateway, keys } = rig(['empty', 'funded'])
    const result = await gateway.call(async (lease) => {
      if (lease.id === 'empty') throw fail('quota', { status: 402 })
      return 'done'
    })
    expect(result).toBe('done')
    expect(keys.rows.find((r) => r.id === 'empty')).toMatchObject({
      state: 'ok',
      frozenScope: 'day'
    })
  })

  it('says every key is out, with the earliest comeback, when the last key is rate limited', async () => {
    const { gateway } = rig(['only'])
    const error = await gateway
      .call(async () => {
        throw fail('rate_limited', { status: 429 })
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'rate_limited', retryAfterMs: 60_000 })
    expect((error as ProviderError).message).toContain('Mọi khóa')
    expect((error as ProviderError).message).toContain('Thử lại sau')
  })

  it('shows the real error, not "all keys out", when the only key is wrong', async () => {
    const { gateway } = rig(['only'])
    const error = await gateway
      .call(async () => {
        throw fail('auth', { status: 401 })
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'auth', status: 401 })
  })

  it('sends nothing at all, and says when a key returns, when every key is already frozen', async () => {
    const { gateway, keys } = rig(['a', 'b'])
    keys.rows[0]!.frozenUntil = NOW + 5_000
    keys.rows[1]!.frozenUntil = NOW + 2_000
    let called = false
    const error = await gateway
      .call(async () => {
        called = true
        return 'x'
      })
      .catch((e: unknown) => e)
    expect(called).toBe(false)
    expect(error).toMatchObject({ kind: 'rate_limited', retryAfterMs: 2_000 })
  })

  it('waits for a key to come back, and then goes on, when the caller asked to wait', async () => {
    const { gateway, keys, sleeps } = rig(['a'], { waitForKeys: true })
    keys.rows[0]!.frozenUntil = NOW + 5_000
    keys.rows[0]!.freezeStrikes = 1
    const result = await gateway.call(async () => 'done')
    expect(result).toBe('done')
    expect(sleeps).toEqual([5_000])
  })

  it('does not retry or move on for a refused request: that is the request, not the key', async () => {
    const { gateway, sleeps } = rig(['a', 'b'])
    let calls = 0
    const error = await gateway
      .call(async () => {
        calls++
        throw fail('refused', { status: 400 })
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'refused' })
    expect(calls).toBe(1)
    expect(sleeps).toEqual([])
  })

  it('does not retry or move on for a request error either: a wrong parameter is not the key', async () => {
    const { gateway, sleeps } = rig(['a', 'b'])
    let calls = 0
    const error = await gateway
      .call(async () => {
        calls++
        throw fail('invalid_request', { status: 400 })
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'invalid_request' })
    expect(calls).toBe(1)
    expect(sleeps).toEqual([])
  })
})

describe('call: transient trouble on the wire', () => {
  it('retries once after a short wait and hands back the second try as one call', async () => {
    const { gateway, sleeps } = rig(['a'])
    let calls = 0
    const result = await gateway.call(async () => {
      if (++calls === 1) throw fail('network')
      return 'done'
    })
    expect(result).toBe('done')
    expect(calls).toBe(2)
    expect(sleeps).toEqual([500])
  })

  it('reports every request it sends, retries included, without changing the result', async () => {
    const { gateway } = rig(['a'])
    let calls = 0
    let attempts = 0
    const result = await gateway.call(
      async () => {
        if (++calls === 1) throw fail('network')
        return 'done'
      },
      undefined,
      () => attempts++
    )
    expect(result).toBe('done')
    expect(attempts).toBe(2)
  })

  it('stops after two retries and shows the last error', async () => {
    const { gateway, sleeps } = rig(['a'])
    let calls = 0
    const error = await gateway
      .call(async () => {
        calls++
        throw fail('timeout')
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'timeout' })
    expect(calls).toBe(3)
    expect(sleeps).toEqual([500, 1_000])
  })

  it('does not hold the key responsible for a network failure or a timeout', async () => {
    const { gateway, keys } = rig(['a'])
    let calls = 0
    await gateway.call(async () => {
      if (++calls <= 2) throw fail(calls === 1 ? 'network' : 'timeout')
      return 'done'
    })
    expect(keys.rows[0]).toMatchObject({ state: 'ok', frozenUntil: null, freezeStrikes: 0 })
  })

  it('does not sleep for a server that asks for longer than the ceiling', async () => {
    const { gateway, sleeps } = rig(['a'])
    const error = await gateway
      .call(async () => {
        throw fail('network', { retryAfterMs: 120_000 })
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'network', retryAfterMs: 120_000 })
    expect(sleeps).toEqual([])
  })

  it('ends at once with `cancelled` when Cancel is pressed during the wait', async () => {
    const controller = new AbortController()
    let calls = 0
    const { gateway } = rig(['a'], {
      sleep: (_ms, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new ProviderError('cancelled', 'stopped')),
            { once: true }
          )
          controller.abort()
        })
    })
    const error = await gateway
      .call(async () => {
        calls++
        throw fail('network')
      }, controller.signal)
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'cancelled' })
    expect(calls).toBe(1)
  })

  it('retries a rate limit with a wait, and no key switching, on a connection that has no key', async () => {
    const { gateway, sleeps } = rig([])
    let calls = 0
    const result = await gateway.call(async (lease) => {
      expect(lease.id).toBeNull()
      if (++calls < 3) throw fail('rate_limited', { status: 429 })
      return 'done'
    })
    expect(result).toBe('done')
    expect(sleeps).toEqual([500, 1_000])
  })

  it('does not loop on a keyless connection that answers 401: there is no other key to try', async () => {
    const { gateway } = rig([])
    let calls = 0
    const error = await gateway
      .call(async () => {
        calls++
        throw fail('auth', { status: 401 })
      })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'auth' })
    expect(calls).toBe(1)
  })
})

describe('reporting to the key layer', () => {
  it('reports every lease exactly once, whatever happens', async () => {
    const { gateway, keys } = rig(['a', 'b'])
    let calls = 0
    await gateway.call(async (lease) => {
      calls++
      if (calls === 1) throw fail('rate_limited', { status: 429 })
      if (calls === 2) throw fail('network')
      return lease.id
    })
    // Kho khóa ném lỗi nếu một lease được báo cáo hai lần hoặc chưa từng được cấp phát.
    expect(keys.reports).toHaveLength(calls)
    // Lỗi mạng được báo cáo đúng loại lỗi; chỉ yêu cầu chưa hoàn tất (hủy, timeout) mới là `neutral`.
    expect(
      keys.reports.map((r) => (typeof r.outcome === 'string' ? r.outcome : r.outcome.kind))
    ).toEqual(['rate_limited', 'network', 'ok'])
  })

  it('reports `neutral` for a call that was cancelled, so no key is blamed or cleared', async () => {
    const { gateway, keys } = rig(['a'])
    await gateway
      .call(async () => {
        throw fail('cancelled')
      })
      .catch(() => undefined)
    expect(keys.reports).toEqual([{ key: 'a', outcome: 'neutral' }])
  })

  it('reports `neutral` when something unexpected is thrown, so a probe cannot be left hanging', async () => {
    const { gateway, keys } = rig(['a'])
    await gateway
      .call(async () => {
        throw new TypeError('a bug')
      })
      .catch(() => undefined)
    expect(keys.reports).toEqual([{ key: 'a', outcome: 'neutral' }])
  })

  it('turns an error into what the key layer reads, and keeps cancel and timeout neutral', () => {
    expect(outcomeFor(fail('cancelled'))).toBe('neutral')
    expect(outcomeFor(fail('timeout'))).toBe('neutral')
    expect(outcomeFor(fail('rate_limited', { retryAfterMs: 5, status: 429 }))).toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 5,
      status: 429
    })
  })
})

describe('call: several at once (measured: six 429s froze a key for 30 minutes)', () => {
  it('counts six simultaneous rate limits on one key as one strike, and the calls still finish on the other key', async () => {
    const { gateway, keys } = rig(['a', 'b'], { limit: 6 })
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        gateway.call(async (lease) => {
          // Mọi cuộc gọi đều đang thực thi với khóa `a` trước khi phản hồi đầu tiên trả về.
          await new Promise((resolve) => setTimeout(resolve, 0))
          if (lease.id === 'a') throw fail('rate_limited', { status: 429 })
          return lease.id
        })
      )
    )
    expect(results).toEqual(['b', 'b', 'b', 'b', 'b', 'b'])
    const a = keys.rows.find((row) => row.id === 'a')!
    expect(a.freezeStrikes).toBe(1)
    expect(a.frozenUntil).toBe(NOW + 60_000)
  })
})

describe('call: slowing the entry down on a rate limit', () => {
  function adaptiveRig() {
    const keys = memoryKeys(['a', 'b'])
    const limiter = new Limiter(4)
    const sleeps: number[] = []
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms)
      keys.clock.now += ms
    }
    const adaptive = new AdaptiveLimit(
      limiter,
      4,
      () => keys.clock.now,
      () => 0.5,
      sleep
    )
    const gateway = new Gateway({
      keys: keys.source,
      limiter,
      adaptive,
      now: () => keys.clock.now,
      random: () => 0.5,
      sleep
    })
    return { gateway, keys, adaptive, sleeps }
  }

  it('still moves the failing call to the next key at once, and makes the next call wait', async () => {
    const { gateway, keys, adaptive, sleeps } = adaptiveRig()
    while (adaptive.current < 4) adaptive.succeeded()
    const used: string[] = []
    const first = await gateway.call(async (lease) => {
      used.push(lease.id as string)
      if (lease.id === 'a') throw fail('rate_limited', { status: 429, retryAfterMs: 20_000 })
      return 'done'
    })
    expect(first).toBe('done')
    expect(used).toEqual(['a', 'b'])
    expect(sleeps).toEqual([])
    expect(adaptive.current).toBe(2)

    const pausedAt = keys.clock.now
    let sentAt = 0
    await gateway.call(async () => {
      sentAt = keys.clock.now
      return 'next'
    })
    expect(sentAt - pausedAt).toBe(20_000)
  })

  it('opens one more place after every two calls that succeed', async () => {
    const { gateway, adaptive } = adaptiveRig()
    for (let i = 0; i < 4; i++) await gateway.call(async () => 'ok')
    expect(adaptive.current).toBe(3)
  })
})

describe('the connection limit', () => {
  it('lets the next call start only when a place is free', async () => {
    const { gateway, limiter } = rig(['a'], { limit: 1 })
    const order: string[] = []
    let finishFirst!: () => void
    const first = gateway.call(async () => {
      order.push('first starts')
      await new Promise<void>((resolve) => (finishFirst = resolve))
      order.push('first ends')
      return 1
    })
    const second = gateway.call(async () => {
      order.push('second starts')
      return 2
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(limiter.queued).toBe(1)
    expect(order).toEqual(['first starts'])
    finishFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first starts', 'first ends', 'second starts'])
  })

  it('never sends a call that was cancelled while it waited', async () => {
    const { gateway } = rig(['a'], { limit: 1 })
    let finishFirst!: () => void
    const first = gateway.call(
      () => new Promise<number>((resolve) => (finishFirst = () => resolve(1)))
    )
    const controller = new AbortController()
    let secondCalls = 0
    const second = gateway
      .call(async () => {
        secondCalls++
        return 2
      }, controller.signal)
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    expect(await second).toMatchObject({ kind: 'cancelled' })
    finishFirst()
    await first
    expect(secondCalls).toBe(0)
  })

  it('gives the place back when the call fails', async () => {
    const { gateway, limiter } = rig(['a'], { limit: 1 })
    await gateway
      .call(async () => {
        throw fail('refused')
      })
      .catch(() => undefined)
    expect(limiter.inFlight).toBe(0)
  })
})

describe('stream', () => {
  async function* events(items: string[], failWith?: ProviderError): AsyncGenerator<string> {
    for (const item of items) yield item
    if (failWith !== undefined) throw failWith
  }

  it('passes the events through and reports the key good before the last one is handed over', async () => {
    const { gateway, keys } = rig(['a'])
    const seen: Array<{ event: string; reportsSoFar: number }> = []
    const stream = gateway.stream(
      () => events(['x', 'y', 'DONE']),
      undefined,
      (event) => event === 'DONE'
    )
    for await (const event of stream) seen.push({ event, reportsSoFar: keys.reports.length })
    expect(seen).toEqual([
      { event: 'x', reportsSoFar: 0 },
      { event: 'y', reportsSoFar: 0 },
      { event: 'DONE', reportsSoFar: 1 }
    ])
    expect(keys.reports).toEqual([{ key: 'a', outcome: 'ok' }])
  })

  it('retries a stream that failed before it produced anything', async () => {
    const { gateway, sleeps } = rig(['a'])
    let tries = 0
    const result = await drain(
      gateway.stream(() => {
        tries++
        return tries === 1 ? events([], fail('network')) : events(['hello'])
      })
    )
    expect(result).toEqual({ events: ['hello'], error: null })
    expect(sleeps).toEqual([500])
  })

  it('moves a stream to the next key when the first is rate limited before any text', async () => {
    const { gateway } = rig(['a', 'b'])
    const used: Array<string | null> = []
    const result = await drain(
      gateway.stream((lease) => {
        used.push(lease.id)
        return lease.id === 'a' ? events([], fail('rate_limited', { status: 429 })) : events(['ok'])
      })
    )
    expect(result.events).toEqual(['ok'])
    expect(used).toEqual(['a', 'b'])
  })

  it('never retries a stream once it has produced text: the reader already has it', async () => {
    const { gateway, sleeps } = rig(['a'])
    let tries = 0
    const result = await drain(
      gateway.stream(() => {
        tries++
        return events(['half an answer'], fail('network'))
      })
    )
    expect(result.events).toEqual(['half an answer'])
    expect(result.error).toMatchObject({ kind: 'network' })
    expect(tries).toBe(1)
    expect(sleeps).toEqual([])
  })

  it('gives the place and the lease back when the reader walks away early', async () => {
    const { gateway, keys, limiter } = rig(['a'])
    const stream = gateway.stream(() => events(['1', '2', '3']))
    await stream.next()
    // Dừng sớm: bên đọc ngừng yêu cầu và đóng luồng stream.
    await stream.return(undefined)
    expect(limiter.inFlight).toBe(0)
    expect(keys.reports).toEqual([{ key: 'a', outcome: 'neutral' }])
  })
})

describe('GatewayRegistry', () => {
  it('gives every call of a connection the same key scheduler, and other connections their own', () => {
    const registry = new GatewayRegistry(() => NOW)
    const a1 = registry.runtimeFor('a')
    expect(registry.runtimeFor('a')).toBe(a1)
    expect(registry.runtimeFor('b')).not.toBe(a1)
  })

  it('starts a connection over once it was deleted', () => {
    const registry = new GatewayRegistry(() => NOW)
    const before = registry.runtimeFor('a')
    registry.forget('a')
    expect(registry.runtimeFor('a')).not.toBe(before)
  })
})

describe('the pace of an entry (RPM)', () => {
  /** Môi trường kiểm thử chia sẻ đồng hồ giả lập giữa pacer và gateway để mô phỏng trôi thời gian khi chờ lượt. */
  function pacedRig(
    ids: string[],
    rpm: number
  ): Rig & { pacer: RatePacer; turns: number[]; startedAt: number[] } {
    const keys = memoryKeys(ids)
    const limiter = new Limiter(4)
    const turns: number[] = []
    const sleeps: number[] = []
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms)
      keys.clock.now += ms
    }
    const pacer = new RatePacer(
      rpm,
      () => keys.clock.now,
      async (ms) => {
        turns.push(ms)
        keys.clock.now += ms
      }
    )
    const gateway = new Gateway({
      keys: keys.source,
      limiter,
      pacer,
      now: () => keys.clock.now,
      random: () => 0.5,
      sleep
    })
    return { gateway, keys, limiter, sleeps, pacer, turns, startedAt: [] }
  }

  it('starts two calls at least a minute divided by the RPM apart', async () => {
    const { gateway, keys, startedAt } = pacedRig(['a'], 6)
    for (let call = 0; call < 2; call++) {
      await gateway.call(async () => {
        startedAt.push(keys.clock.now)
        return call
      })
    }
    expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(10_000)
  })

  it('does not delay anything when no RPM is set', async () => {
    const { gateway, turns } = pacedRig(['a'], 0)
    for (let call = 0; call < 5; call++) await gateway.call(async () => call)
    expect(turns).toEqual([])
  })

  it('waits its turn before every attempt, retries included, because each is a real request', async () => {
    const { gateway, turns } = pacedRig(['a'], 6)
    let attempts = 0
    await gateway.call(async () => {
      attempts++
      if (attempts === 1) throw fail('network')
      return 'ok'
    })
    // Lần gọi đầu thực thi ngay; lần thử lại (sau khi backoff) vẫn phải chờ đến lượt theo tốc độ.
    expect(attempts).toBe(2)
    expect(turns.length).toBeGreaterThanOrEqual(1)
  })

  it('never sends a call that was cancelled while it waited for its turn, and reports no key', async () => {
    const keys = memoryKeys(['a'])
    const waits: number[] = []
    const pacer = new RatePacer(
      6,
      () => keys.clock.now,
      (ms, signal) => {
        waits.push(ms)
        return new Promise<void>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new ProviderError('cancelled', 'x')), {
            once: true
          })
        )
      }
    )
    const gateway = new Gateway({
      keys: keys.source,
      limiter: new Limiter(4),
      pacer,
      now: () => keys.clock.now
    })
    await gateway.call(async () => 1)

    let sent = false
    const controller = new AbortController()
    const waiting = gateway
      .call(async () => {
        sent = true
        return 2
      }, controller.signal)
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()

    expect(await waiting).toMatchObject({ kind: 'cancelled' })
    expect(sent).toBe(false)
    // Chưa lấy khóa nên không có gì cần báo cáo và không để lại probe bị treo.
    expect(keys.acquired).toEqual(['a'])
    expect(keys.reports).toHaveLength(1)
  })

  it('gives the place back when the wait for a turn is cancelled', async () => {
    const keys = memoryKeys(['a'])
    const limiter = new Limiter(1)
    const pacer = new RatePacer(
      6,
      () => keys.clock.now,
      (_ms, signal) =>
        new Promise<void>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new ProviderError('cancelled', 'x')), {
            once: true
          })
        )
    )
    const gateway = new Gateway({ keys: keys.source, limiter, pacer, now: () => keys.clock.now })
    await gateway.call(async () => 1)
    const controller = new AbortController()
    const waiting = gateway.call(async () => 2, controller.signal).catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(limiter.inFlight).toBe(1)
    controller.abort()
    await waiting
    expect(limiter.inFlight).toBe(0)
  })
})

describe('GatewayRegistry, per entry', () => {
  it('gives every call of an entry the same limiter and pacer, and other entries their own', () => {
    const registry = new GatewayRegistry(() => NOW)
    const a = registry.entryRuntimeFor('conn', 'a')
    expect(registry.entryRuntimeFor('conn', 'a')).toBe(a)
    const b = registry.entryRuntimeFor('conn', 'b')
    expect(b).not.toBe(a)
    expect(b.limiter).not.toBe(a.limiter)
    expect(b.pacer).not.toBe(a.pacer)
  })

  it('shares the key scheduler between the entries of one connection, and not between connections', () => {
    const registry = new GatewayRegistry(() => NOW)
    // Hai mục mô hình của cùng kết nối dùng chung bộ điều phối, nên lỗi 429 ở một bên sẽ tác động đến bên còn lại.
    expect(registry.runtimeFor('conn')).toBe(registry.runtimeFor('conn'))
    expect(registry.runtimeFor('other')).not.toBe(registry.runtimeFor('conn'))
  })

  it('applies the limits an entry has now, on every call, without being rebuilt', () => {
    const registry = new GatewayRegistry(() => NOW)
    const first = registry.entryRuntimeFor('conn', 'a', { concurrency: 2, rpm: 6 })
    expect(first.adaptive.maximum).toBe(2)
    expect(first.pacer.current).toBe(6)

    const again = registry.entryRuntimeFor('conn', 'a', { concurrency: 8, rpm: 0 })
    expect(again).toBe(first)
    expect(first.adaptive.maximum).toBe(8)
    expect(first.pacer.current).toBe(0)
  })

  it('uses the default concurrency for 0 or absent, and no pacing for an absent RPM', () => {
    const registry = new GatewayRegistry(() => NOW, 4)
    expect(registry.entryRuntimeFor('c', 'a').adaptive.maximum).toBe(4)
    expect(registry.entryRuntimeFor('c', 'b', { concurrency: 0 }).adaptive.maximum).toBe(4)
    expect(registry.entryRuntimeFor('c', 'c').pacer.current).toBe(0)
  })

  it('lets a lower concurrency take hold without cutting a call that is running', async () => {
    const registry = new GatewayRegistry(() => NOW)
    const runtime = registry.entryRuntimeFor('c', 'a', { concurrency: 3 })
    while (runtime.adaptive.current < 3) runtime.adaptive.succeeded()
    const releases = await Promise.all([1, 2].map(() => runtime.limiter.acquire()))
    registry.entryRuntimeFor('c', 'a', { concurrency: 1 })
    expect(runtime.limiter.inFlight).toBe(2)
    releases.forEach((release) => release())
  })

  it('forgets an entry, and starts it over', () => {
    const registry = new GatewayRegistry(() => NOW)
    const before = registry.entryRuntimeFor('c', 'a')
    registry.forgetEntry('a')
    expect(registry.entryRuntimeFor('c', 'a')).not.toBe(before)
  })

  it('takes every entry of a connection with it when the connection is deleted, and only those', () => {
    const registry = new GatewayRegistry(() => NOW)
    const mine = registry.entryRuntimeFor('c1', 'a')
    const theirs = registry.entryRuntimeFor('c2', 'b')
    registry.forget('c1')
    expect(registry.entryRuntimeFor('c1', 'a')).not.toBe(mine)
    expect(registry.entryRuntimeFor('c2', 'b')).toBe(theirs)
  })

  it('shares the same pace between the translation and the chat that use one entry', async () => {
    // Bộ điều phối tốc độ thuộc về mục mô hình, nên mọi tính năng gọi đến đều dùng chung lượt chờ.
    const waits: number[] = []
    const registry = new GatewayRegistry(
      () => NOW,
      4,
      (ms, signal) => {
        waits.push(ms)
        return new Promise<void>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new ProviderError('cancelled', 'x')), {
            once: true
          })
        )
      }
    )
    const translation = registry.entryRuntimeFor('c', 'a', { rpm: 6 })
    const chat = registry.entryRuntimeFor('c', 'a', { rpm: 6 })
    await translation.pacer.wait()
    void chat.pacer.wait()
    expect(waits).toEqual([10_000])
  })
})
