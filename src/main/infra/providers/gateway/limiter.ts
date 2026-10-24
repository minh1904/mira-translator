import { ProviderError } from '../types'

/** Ai đang chờ suất: lượt chat của người dùng (`interactive`) được cấp trước lời gọi của tác vụ nền. */
export type CallPriority = 'interactive' | 'background'

interface Waiter {
  grant: () => void
  onAbort: () => void
}

/**
 * Giới hạn số lượng yêu cầu tối đa thực thi đồng thời (`limit`), các yêu cầu vượt quá sẽ xếp hàng chờ.
 *
 * Mỗi cấu hình mô hình (model entry) dùng một bộ giới hạn riêng, được chia sẻ giữa các tác vụ (như dịch thuật và trò chuyện).
 * Hạn mức của khóa được quản lý độc lập theo kết nối thông qua bộ điều phối khóa (key scheduler).
 */
export class Limiter {
  private active = 0
  private limit: number
  private readonly waiting: Record<CallPriority, Waiter[]> = { interactive: [], background: [] }

  constructor(limit: number) {
    Limiter.check(limit)
    this.limit = limit
  }

  private static check(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('The limit must be a whole number of at least 1.')
    }
  }

  /**
   * Thay đổi giới hạn đồng thời khi đang có yêu cầu chạy hoặc chờ.
   * Giảm giới hạn sẽ không ngắt các yêu cầu đang chạy mà chỉ chặn yêu cầu mới cho đến khi số lượng giảm xuống.
   * Tăng giới hạn sẽ giải phóng ngay các yêu cầu đang xếp hàng (hàng `interactive` trước, trong hàng theo thứ tự đến).
   */
  setLimit(limit: number): void {
    Limiter.check(limit)
    this.limit = limit
    this.drain()
  }

  /** Giới hạn hiện tại đang áp dụng (dùng cho kiểm thử và hiển thị). */
  get current(): number {
    return this.limit
  }

  private drain(): void {
    while (this.active < this.limit) {
      const next = this.waiting.interactive.shift() ?? this.waiting.background.shift()
      if (next === undefined) return
      next.grant()
    }
  }

  /** Số lượng yêu cầu đang thực thi hiện tại. */
  get inFlight(): number {
    return this.active
  }

  /** Số lượng yêu cầu đang chờ trong hàng đợi. */
  get queued(): number {
    return this.waiting.interactive.length + this.waiting.background.length
  }

  /**
   * Xin cấp phát một slot thực thi, trả về hàm giải phóng slot khi hoàn tất.
   * Ném lỗi `cancelled` nếu tín hiệu bị hủy trong lúc đang chờ.
   */
  acquire(signal?: AbortSignal, priority: CallPriority = 'interactive'): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new ProviderError('cancelled', 'Yêu cầu đã bị hủy.'))
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve(this.releaser())
    }
    return new Promise((resolve, reject) => {
      const queue = this.waiting[priority]
      const entry: Waiter = {
        grant: () => {
          signal?.removeEventListener('abort', entry.onAbort)
          this.active++
          resolve(this.releaser())
        },
        onAbort: () => {
          const at = queue.indexOf(entry)
          if (at >= 0) queue.splice(at, 1)
          reject(new ProviderError('cancelled', 'Yêu cầu đã bị hủy.'))
        }
      }
      signal?.addEventListener('abort', entry.onAbort, { once: true })
      queue.push(entry)
    })
  }

  /** Hàm giải phóng bảo đảm an toàn khi gọi nhiều lần mà không trừ thừa slot. */
  private releaser(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
      this.drain()
    }
  }
}
