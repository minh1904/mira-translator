import type { ProviderError } from '../types'
import type { Limiter } from './limiter'
import { abortableSleep } from './retryPolicy'

/** Số lời gọi thành công liên tiếp để mở thêm một suất. */
export const GROW_AFTER = 2
/** Khoảng chờ đầu khi nhà cung cấp không báo thời gian; nhân đôi mỗi lần bị chặn liên tiếp. */
export const PAUSE_BASE_MS = 2_000
/** Trần khoảng chờ tự tính. */
export const PAUSE_MAX_MS = 60_000

/**
 * Mức đồng thời tự điều chỉnh của một mục model (AIMD), đặt lên `Limiter` của mục.
 *
 * Bắt đầu một suất, thêm một suất sau mỗi `GROW_AFTER` lời gọi thành công liên tiếp, tới trần cấu hình. Lỗi
 * `rate_limited` chia đôi mức (tối thiểu 1) và đặt khoảng tạm ngừng: lời gọi **mới** chờ hết khoảng đó, lời gọi
 * đang chạy không bị đụng tới. Nhiều lỗi trong cùng một khoảng chờ chỉ giảm một lần. Lỗi khác không đổi mức.
 */
export class AdaptiveLimit {
  private ceiling: number
  private level = 1
  private successes = 0
  private strikes = 0
  private pausedUntil = 0

  constructor(
    private readonly limiter: Limiter,
    ceiling: number,
    private readonly now: () => number,
    private readonly random: () => number = Math.random,
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = abortableSleep
  ) {
    this.ceiling = ceiling
    this.apply()
  }

  /** Mức hiện hành (dùng cho kiểm thử). */
  get current(): number {
    return this.level
  }

  /** Trần cấu hình (dùng cho kiểm thử). */
  get maximum(): number {
    return this.ceiling
  }

  /** Thời điểm hết tạm ngừng (ms epoch); 0 hoặc đã qua là không tạm ngừng. */
  get pausedUntilMs(): number {
    return this.pausedUntil
  }

  /** Đổi trần cấu hình; mức hiện hành không vượt trần mới. */
  setCeiling(ceiling: number): void {
    this.ceiling = ceiling
    this.apply()
  }

  /** Chờ hết khoảng tạm ngừng trước khi bắt đầu một lời gọi mới. */
  async waitForPause(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const left = this.pausedUntil - this.now()
      if (left <= 0) return
      await this.sleep(left, signal)
    }
  }

  succeeded(): void {
    this.strikes = 0
    this.successes++
    if (this.successes < GROW_AFTER) return
    this.successes = 0
    if (this.level < this.ceiling) {
      this.level++
      this.apply()
    }
  }

  /** Ghi nhận lỗi của một lần gọi; chỉ `rate_limited` làm giảm mức. */
  failed(error: ProviderError): void {
    if (error.kind !== 'rate_limited') return
    this.successes = 0
    const now = this.now()
    // Lỗi của các lời gọi đã bay trước khi tạm ngừng: cùng một đợt, đã giảm rồi.
    if (now < this.pausedUntil) return
    this.strikes++
    this.level = Math.max(1, Math.floor(this.level / 2))
    this.apply()
    const backoff = PAUSE_BASE_MS * 2 ** (this.strikes - 1) * (0.8 + 0.4 * this.random())
    const wait = error.retryAfterMs ?? Math.min(PAUSE_MAX_MS, Math.round(backoff))
    this.pausedUntil = now + wait
  }

  private apply(): void {
    this.level = Math.min(this.level, this.ceiling)
    this.limiter.setLimit(this.level)
  }
}
