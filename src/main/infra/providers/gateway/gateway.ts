import type { ClassifiedError } from '../classifyError'
import { ProviderError } from '../types'
import { AdaptiveLimit } from './adaptiveLimit'
import type { KeyLease, KeyOutcome, KeySource } from './keys'
import { KeyScheduler } from './keyScheduler'
import { type CallPriority, Limiter } from './limiter'
import { RatePacer } from './ratePacer'
import { DEFAULT_RETRY, abortableSleep, decideRetry, type RetryOptions } from './retryPolicy'

/**
 * Quản lý quy trình thực thi yêu cầu gọi API: điều phối khóa (key), giới hạn đồng thời,
 * giãn cách tốc độ (RPM), thử lại khi gặp lỗi và cập nhật trạng thái khóa.
 *
 * Trình tự xử lý yêu cầu:
 *  1. Xin slot từ bộ giới hạn đồng thời (limiter), rồi chờ hết khoảng tạm ngừng của mục nếu đang bị giới hạn tốc độ.
 *  2. Chờ theo tốc độ giới hạn (RPM pacer) trước mỗi lần gọi nếu được cấu hình.
 *  3. Mượn khóa hợp lệ (hoặc chờ/báo lỗi nếu tất cả khóa đang bị đóng băng).
 *  4. Thực thi yêu cầu và ghi nhận kết quả cho khóa chính xác một lần.
 *  5. Khi thất bại: lỗi thuộc về khóa (rate limit, hạn mức, xác thực) sẽ chuyển ngay sang khóa khác;
 *     lỗi đường truyền tạm thời (mạng, timeout) sẽ được thử lại có giãn cách.
 *  6. Đối với stream: không thử lại sau khi dữ liệu đã bắt đầu được phát đi.
 */

/** Số lượng yêu cầu tối đa thực thi đồng thời mặc định trên một kết nối. */
export const DEFAULT_CONCURRENCY = 4

/** Giới hạn số lần chuyển khóa tối đa để tránh vòng lặp vô tận khi xử lý lỗi. */
const MAX_KEY_SWITCHES = 16

export interface GatewayOptions {
  keys: KeySource
  limiter: Limiter
  /** Mức đồng thời tự điều chỉnh của mục (đặt lên `limiter`); thiếu thì mức cố định bằng trần của `limiter`. */
  adaptive?: AdaptiveLimit
  /** Hàng chờ suất của lời gọi; mặc định `interactive`. */
  priority?: CallPriority
  /** Điều phối giãn cách các yêu cầu theo giới hạn RPM của cấu hình mô hình. */
  pacer?: RatePacer
  now: () => number
  retry?: Partial<RetryOptions>
  /** Hàm sinh số ngẫu nhiên phục vụ tính toán jitter khi thử lại. */
  random?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /**
   * Khi toàn bộ khóa bị đóng băng: chờ đến khi có khóa phục hồi (`true`) hoặc ném lỗi ngay lập tức (`false`).
   */
  waitForKeys?: boolean
}

/**
 * Chuyển đổi lỗi nhà cung cấp thành kết quả đánh giá trạng thái khóa.
 * Yêu cầu bị hủy hoặc quá thời gian được coi là trung lập (`neutral`).
 */
export function outcomeFor(error: ProviderError): KeyOutcome {
  if (error.kind === 'cancelled' || error.kind === 'timeout') return 'neutral'
  const classified: ClassifiedError = { kind: error.kind, message: error.message }
  if (error.retryAfterMs !== undefined) classified.retryAfterMs = error.retryAfterMs
  if (error.quotaScope !== undefined) classified.quotaScope = error.quotaScope
  if (error.status !== undefined) classified.status = error.status
  if (error.receivedAt !== undefined) classified.receivedAt = error.receivedAt
  if (error.bodySnippet !== undefined) classified.bodySnippet = error.bodySnippet
  return classified
}

/**
 * Bảo đảm lượt mượn khóa được ghi nhận kết quả chính xác một lần,
 * tự động báo cáo trạng thái `neutral` nếu phiên kết thúc bất thường.
 */
class LeaseGuard {
  private settled = false

  constructor(
    private readonly keys: KeySource,
    private readonly lease: KeyLease
  ) {}

  async settle(outcome: KeyOutcome): Promise<void> {
    if (this.settled) return
    this.settled = true
    if (this.lease.id !== null) await this.keys.report(this.lease, outcome)
  }

  async settleFailure(error: unknown): Promise<void> {
    if (error instanceof ProviderError) await this.settle(outcomeFor(error))
  }
}

/** Kiểm tra lỗi có xuất phát từ khóa hay không (hết hạn mức, xác thực) để chuyển khóa khác. */
function isKeyTrouble(error: ProviderError): boolean {
  return error.kind === 'rate_limited' || error.kind === 'quota' || error.kind === 'auth'
}

interface Progress {
  retries: number
  switches: number
}

export class Gateway {
  private readonly retry: RetryOptions
  private readonly random: () => number
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(private readonly options: GatewayOptions) {
    this.retry = { ...DEFAULT_RETRY, ...options.retry }
    this.random = options.random ?? Math.random
    this.sleep = options.sleep ?? abortableSleep
  }

  /**
   * Thực thi yêu cầu với khóa, tự động thử lại hoặc đổi khóa khi gặp lỗi.
   * `onAttempt` được gọi mỗi lần gửi yêu cầu thực tế để theo dõi tiến độ.
   */
  async call<T>(
    attempt: (lease: KeyLease) => Promise<T>,
    signal?: AbortSignal,
    onAttempt?: () => void
  ): Promise<T> {
    const release = await this.options.limiter.acquire(signal, this.options.priority)
    try {
      await this.options.adaptive?.waitForPause(signal)
      let lease = await this.acquireKey(signal)
      const progress: Progress = { retries: 0, switches: 0 }
      for (;;) {
        const guard = new LeaseGuard(this.options.keys, lease)
        try {
          onAttempt?.()
          const result = await attempt(lease)
          this.options.adaptive?.succeeded()
          await guard.settle('ok')
          return result
        } catch (error) {
          this.reportFailure(error)
          await guard.settleFailure(error)
          lease = await this.next(error, lease, progress, signal)
        } finally {
          await guard.settle('neutral')
        }
      }
    } finally {
      release()
    }
  }

  /**
   * Thực thi yêu cầu dạng luồng (stream).
   * `isFinal` xác định sự kiện kết thúc thành công để ghi nhận khóa trước khi trả về sự kiện cuối cùng.
   * Khi luồng đã bắt đầu phát dữ liệu sẽ không thử lại hay chuyển khóa.
   */
  async *stream<E>(
    attempt: (lease: KeyLease) => AsyncGenerator<E>,
    signal?: AbortSignal,
    isFinal?: (event: E) => boolean
  ): AsyncGenerator<E> {
    const release = await this.options.limiter.acquire(signal, this.options.priority)
    try {
      await this.options.adaptive?.waitForPause(signal)
      let lease = await this.acquireKey(signal)
      const progress: Progress = { retries: 0, switches: 0 }
      for (;;) {
        const guard = new LeaseGuard(this.options.keys, lease)
        let started = false
        try {
          for await (const event of attempt(lease)) {
            started = true
            if (isFinal?.(event) === true) await guard.settle('ok')
            yield event
          }
          this.options.adaptive?.succeeded()
          await guard.settle('ok')
          return
        } catch (error) {
          this.reportFailure(error)
          await guard.settleFailure(error)
          // Dữ liệu đã bắt đầu được gửi đi, không thể thử lại để tránh lặp nội dung.
          if (started) throw error
          lease = await this.next(error, lease, progress, signal)
        } finally {
          await guard.settle('neutral')
        }
      }
    } finally {
      release()
    }
  }

  private reportFailure(error: unknown): void {
    if (error instanceof ProviderError) this.options.adaptive?.failed(error)
  }

  /**
   * Xử lý sau khi một lượt gọi thất bại: đổi sang khóa khác hoặc chờ thử lại nếu là lỗi tạm thời.
   */
  private async next(
    error: unknown,
    lease: KeyLease,
    progress: Progress,
    signal: AbortSignal | undefined
  ): Promise<KeyLease> {
    if (!(error instanceof ProviderError)) throw error

    // Lỗi thuộc về khóa: chuyển sang khóa khác ngay lập tức nếu còn khóa khả dụng.
    if (isKeyTrouble(error) && lease.id !== null && progress.switches < MAX_KEY_SWITCHES) {
      progress.switches++
      try {
        return await this.acquireKey(signal)
      } catch (exhausted) {
        // Ném lỗi mới nếu không phải lỗi hết khóa khả dụng (ví dụ lỗi truy xuất cơ sở dữ liệu).
        if (!(exhausted instanceof ProviderError)) throw exhausted
        // Khi không còn khóa nào khác, ưu tiên trả về lỗi hết hạn mức kèm thời gian chờ nếu có.
        if (error.kind === 'rate_limited' && exhausted.kind === 'rate_limited') throw exhausted
        throw exhausted.kind === 'cancelled' ? exhausted : error
      }
    }

    const decision = decideRetry(error, progress.retries, this.retry, this.random, {
      keyless: lease.id === null
    })
    if (!decision.retry) throw error
    progress.retries++
    await this.sleep(decision.delayMs, signal)
    return this.acquireKey(signal)
  }

  /**
   * Lấy khóa khả dụng cho yêu cầu, hoặc ném lỗi nếu tất cả khóa đang đóng băng (trừ khi bật `waitForKeys`).
   */
  private async acquireKey(signal: AbortSignal | undefined): Promise<KeyLease> {
    // Giãn cách theo tốc độ trước khi lấy khóa cho mỗi lượt gọi.
    await this.options.pacer?.wait(signal)
    for (;;) {
      const lease = await this.options.keys.acquire()
      if (!('exhausted' in lease)) return lease
      if (this.options.waitForKeys === true && lease.recoverAt !== null) {
        await this.sleep(Math.max(0, lease.recoverAt - this.options.now()), signal)
        continue
      }
      const wait = lease.recoverAt === null ? '' : ' Thử lại sau.'
      throw new ProviderError(
        'rate_limited',
        'Mọi khóa của kết nối này đều đang hết hạn mức.' + wait,
        lease.recoverAt === null
          ? {}
          : { retryAfterMs: Math.max(0, lease.recoverAt - this.options.now()) }
      )
    }
  }
}

/** Trạng thái runtime lưu trữ giữa các yêu cầu của một kết nối (lịch trình sử dụng khóa). */
export class ConnectionRuntime {
  constructor(readonly scheduler: KeyScheduler) {}
}

/**
 * Trạng thái runtime lưu trữ của một mục cấu hình mô hình (giới hạn đồng thời, mức tự điều chỉnh và giãn cách tốc độ).
 */
export class EntryRuntime {
  constructor(
    readonly limiter: Limiter,
    readonly adaptive: AdaptiveLimit,
    readonly pacer: RatePacer
  ) {}
}

/** Cấu hình giới hạn áp dụng cho mục mô hình (số lượng đồng thời và RPM). */
export interface EntryLimits {
  concurrency?: number
  rpm?: number
}

/**
 * Đăng ký và quản lý trạng thái runtime tồn tại qua các phiên gọi:
 * mỗi kết nối dùng chung một bộ điều phối khóa, mỗi cấu hình mô hình dùng chung bộ giới hạn và giãn cách.
 */
export class GatewayRegistry {
  private readonly runtimes = new Map<string, ConnectionRuntime>()
  private readonly entries = new Map<string, { connectionId: string; runtime: EntryRuntime }>()

  constructor(
    private readonly now: () => number,
    private readonly concurrency: number = DEFAULT_CONCURRENCY,
    private readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>,
    private readonly random?: () => number
  ) {}

  runtimeFor(connectionId: string): ConnectionRuntime {
    let runtime = this.runtimes.get(connectionId)
    if (runtime === undefined) {
      runtime = new ConnectionRuntime(new KeyScheduler(this.now))
      this.runtimes.set(connectionId, runtime)
    }
    return runtime
  }

  /**
   * Lấy runtime (limiter, mức tự điều chỉnh và pacer) của một mục cấu hình mô hình và cập nhật giới hạn mới nhất.
   * `concurrency` là **trần**; mức hiện hành do `AdaptiveLimit` điều chỉnh bên dưới trần đó.
   */
  entryRuntimeFor(connectionId: string, entryId: string, limits: EntryLimits = {}): EntryRuntime {
    const concurrency =
      limits.concurrency === undefined || limits.concurrency === 0
        ? this.concurrency
        : limits.concurrency
    const rpm = limits.rpm ?? 0

    let held = this.entries.get(entryId)
    if (held === undefined) {
      const limiter = new Limiter(concurrency)
      held = {
        connectionId,
        runtime: new EntryRuntime(
          limiter,
          new AdaptiveLimit(limiter, concurrency, this.now, this.random, this.sleep),
          new RatePacer(rpm, this.now, this.sleep)
        )
      }
      this.entries.set(entryId, held)
    }
    held.runtime.adaptive.setCeiling(concurrency)
    held.runtime.pacer.setRpm(rpm)
    return held.runtime
  }

  /** Xóa trạng thái runtime của một mục mô hình khi bị xóa bỏ. */
  forgetEntry(entryId: string): void {
    this.entries.delete(entryId)
  }

  /** Xóa trạng thái runtime của kết nối cùng toàn bộ các mục mô hình liên quan. */
  forget(connectionId: string): void {
    this.runtimes.delete(connectionId)
    for (const [entryId, held] of this.entries) {
      if (held.connectionId === connectionId) this.entries.delete(entryId)
    }
  }
}
