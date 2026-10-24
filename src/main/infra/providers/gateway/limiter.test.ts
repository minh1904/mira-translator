import { describe, expect, it } from 'vitest'
import { ProviderError } from '../types'
import { Limiter } from './limiter'

/** Cho phép các callback promise trong hàng đợi được thực thi. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('Limiter', () => {
  it('runs up to the limit at once and makes the rest wait', async () => {
    const limiter = new Limiter(2)
    const first = await limiter.acquire()
    await limiter.acquire()
    let thirdStarted = false
    const third = limiter.acquire().then((release) => {
      thirdStarted = true
      return release
    })
    await tick()
    expect(limiter.inFlight).toBe(2)
    expect(limiter.queued).toBe(1)
    expect(thirdStarted).toBe(false)

    first()
    await third
    expect(thirdStarted).toBe(true)
    expect(limiter.inFlight).toBe(2)
    expect(limiter.queued).toBe(0)
  })

  it('serves the line in the order it formed', async () => {
    const limiter = new Limiter(1)
    const release = await limiter.acquire()
    const order: string[] = []
    const a = limiter.acquire().then((r) => {
      order.push('a')
      return r
    })
    const b = limiter.acquire().then((r) => {
      order.push('b')
      return r
    })
    const c = limiter.acquire().then((r) => {
      order.push('c')
      return r
    })
    release()
    const releaseA = await a
    releaseA()
    const releaseB = await b
    releaseB()
    const releaseC = await c
    releaseC()
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('takes a cancelled call out of the line without ever starting it', async () => {
    const limiter = new Limiter(1)
    const release = await limiter.acquire()
    const controller = new AbortController()
    const cancelled = limiter.acquire(controller.signal).catch((e: unknown) => e)
    let nextStarted = false
    const next = limiter.acquire().then((r) => {
      nextStarted = true
      return r
    })

    controller.abort()
    expect(await cancelled).toMatchObject({ kind: 'cancelled' })
    expect(limiter.queued).toBe(1)

    release()
    await next
    // Slot được trao cho cuộc gọi xếp sau cuộc gọi bị hủy.
    expect(nextStarted).toBe(true)
    expect(limiter.inFlight).toBe(1)
  })

  it('refuses at once a call that was cancelled before it asked', async () => {
    const limiter = new Limiter(1)
    const controller = new AbortController()
    controller.abort()
    await expect(limiter.acquire(controller.signal)).rejects.toBeInstanceOf(ProviderError)
    expect(limiter.inFlight).toBe(0)
  })

  it('does not give away two places when a release is called twice', async () => {
    const limiter = new Limiter(1)
    const release = await limiter.acquire()
    release()
    release()
    await limiter.acquire()
    let second = false
    void limiter.acquire().then(() => {
      second = true
    })
    await tick()
    expect(second).toBe(false)
    expect(limiter.inFlight).toBe(1)
  })

  it('does not free a place just because a call that already has one is aborted', async () => {
    const limiter = new Limiter(1)
    const controller = new AbortController()
    const release = await limiter.acquire(controller.signal)
    controller.abort()
    expect(limiter.inFlight).toBe(1)
    release()
    expect(limiter.inFlight).toBe(0)
  })

  it('refuses a limit that cannot work', () => {
    expect(() => new Limiter(0)).toThrow(RangeError)
    expect(() => new Limiter(1.5)).toThrow(RangeError)
  })
})

describe('Limiter.setLimit', () => {
  it('lets the ones waiting in at once when the limit is raised, in the order they came', async () => {
    const limiter = new Limiter(1)
    await limiter.acquire()
    const order: string[] = []
    const a = limiter.acquire().then(() => order.push('a'))
    const b = limiter.acquire().then(() => order.push('b'))
    const c = limiter.acquire().then(() => order.push('c'))
    await tick()
    expect(order).toEqual([])

    limiter.setLimit(3)
    await Promise.all([a, b])
    // Tăng từ 1 lên 3 khi đang có 1 cuộc gọi chạy: có thêm 2 slot trống nên a và b vào chạy, c tiếp tục chờ.
    expect(order).toEqual(['a', 'b'])
    expect(limiter.inFlight).toBe(3)
    expect(limiter.queued).toBe(1)
    void c
  })

  it('never cuts a call that is running when the limit is lowered', async () => {
    const limiter = new Limiter(4)
    const releases = await Promise.all([1, 2, 3].map(() => limiter.acquire()))
    limiter.setLimit(1)
    expect(limiter.inFlight).toBe(3) // cả 3 yêu cầu đều giữ nguyên slot đang chạy
    expect(limiter.current).toBe(1)

    let started = false
    void limiter.acquire().then(() => {
      started = true
    })
    await tick()
    expect(started).toBe(false)

    // Không có yêu cầu mới nào được chạy cho đến khi số lượng đang chạy nhỏ hơn giới hạn mới.
    releases[0]!()
    releases[1]!()
    await tick()
    expect(limiter.inFlight).toBe(1)
    expect(started).toBe(false)

    releases[2]!()
    await tick()
    expect(started).toBe(true)
    expect(limiter.inFlight).toBe(1)
  })

  it('applies to a call made after it', async () => {
    const limiter = new Limiter(4)
    limiter.setLimit(1)
    await limiter.acquire()
    let second = false
    void limiter.acquire().then(() => {
      second = true
    })
    await tick()
    expect(second).toBe(false)
  })

  it('refuses a limit that cannot work, and keeps the one it had', () => {
    const limiter = new Limiter(2)
    expect(() => limiter.setLimit(0)).toThrow(RangeError)
    expect(() => limiter.setLimit(2.5)).toThrow(RangeError)
    expect(limiter.current).toBe(2)
  })
})

describe('Limiter priority', () => {
  /** Xếp một lượt chờ và ghi tên nó khi được cấp; trả hàm giải phóng của lượt đó. */
  const queue = (
    limiter: Limiter,
    order: string[],
    name: string,
    priority: 'interactive' | 'background',
    signal?: AbortSignal
  ): Promise<() => void> =>
    limiter.acquire(signal, priority).then((release) => {
      order.push(name)
      return release
    })

  it('lets a chat call go before background calls already waiting', async () => {
    const limiter = new Limiter(1)
    const release = await limiter.acquire(undefined, 'background')
    const order: string[] = []
    const waits = [
      queue(limiter, order, 'task1', 'background'),
      queue(limiter, order, 'task2', 'background'),
      queue(limiter, order, 'task3', 'background'),
      queue(limiter, order, 'chat', 'interactive')
    ]
    release()
    for (const wait of [waits[3]!, waits[0]!, waits[1]!, waits[2]!]) (await wait)()
    expect(order).toEqual(['chat', 'task1', 'task2', 'task3'])
  })

  it('takes a cancelled background call out of its own line', async () => {
    const limiter = new Limiter(1)
    const release = await limiter.acquire()
    const order: string[] = []
    const controller = new AbortController()
    const cancelled = queue(limiter, order, 'gone', 'background', controller.signal).catch(
      (e: unknown) => e
    )
    const kept = queue(limiter, order, 'kept', 'background')
    controller.abort()
    expect(await cancelled).toBeInstanceOf(ProviderError)
    expect(limiter.queued).toBe(1)
    release()
    ;(await kept)()
    expect(order).toEqual(['kept'])
  })
})
