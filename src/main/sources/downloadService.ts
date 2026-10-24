import { StorageError } from '../infra/storage/errors'
import type { SourceDownloadSummary } from '../../shared/contracts/sources'
import { NetworkBrokerError } from './broker'
import { SourceAccessError } from './http'

export interface DownloadItem {
  id: string
  title: string
}

export interface DownloadSteps<T extends DownloadItem> {
  /** Re-read under the item lock: true when the item already has a Mira chapter. */
  isDone(item: T): boolean
  fetchText(item: T, signal: AbortSignal): Promise<string>
  save(item: T, text: string): void
  onProgress?(current: number, total: number, item: T): void
}

/** Errors after which later chapters would fail the same way, so the task stops. */
function stopReason(error: unknown): string | null {
  if (error instanceof SourceAccessError && error.code === 'temporarily_unavailable') {
    return error.message
  }
  if (error instanceof NetworkBrokerError && error.code === 'age_verification_required') {
    return error.message
  }
  return null
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

/**
 * Chapter downloads for network raw versions: one task per binding, and a per-item lock shared
 * with single downloads so a catalog item never produces two chapters.
 */
export class SourceDownloadService {
  readonly #tasks = new Map<string, AbortController>()
  readonly #busyItems = new Set<string>()

  constructor(private readonly wait: (ms: number, signal: AbortSignal) => Promise<void> = sleep) {}

  /** Runs one item outside a task, rejecting it while any download holds the same item. */
  async runSingle<R>(itemKey: string, run: () => Promise<R>): Promise<R> {
    if (this.#busyItems.has(itemKey)) throw new StorageError('conflict', 'Chương đang được tải')
    this.#busyItems.add(itemKey)
    try {
      return await run()
    } finally {
      this.#busyItems.delete(itemKey)
    }
  }

  async runTask<T extends DownloadItem>(
    taskKey: string,
    itemKeyPrefix: string,
    items: T[],
    steps: DownloadSteps<T>,
    burstPause?: { every: number; ms: number }
  ): Promise<SourceDownloadSummary> {
    if (this.#tasks.has(taskKey)) {
      throw new StorageError('conflict', 'Bản raw này đang có một tác vụ tải chương')
    }
    const controller = new AbortController()
    const { signal } = controller
    this.#tasks.set(taskKey, controller)
    const summary: SourceDownloadSummary = {
      state: 'completed',
      downloaded: 0,
      skipped: 0,
      empty: [],
      failed: [],
      stopReason: null
    }
    let fetched = 0
    try {
      for (const [index, item] of items.entries()) {
        if (signal.aborted) break
        steps.onProgress?.(index + 1, items.length, item)
        const itemKey = itemKeyPrefix + item.id
        if (this.#busyItems.has(itemKey) || steps.isDone(item)) {
          summary.skipped++
          continue
        }
        if (burstPause && fetched > 0 && fetched % burstPause.every === 0) {
          await this.wait(burstPause.ms, signal)
          if (signal.aborted) break
        }
        this.#busyItems.add(itemKey)
        fetched++
        try {
          const text = await steps.fetchText(item, signal)
          if (!text.trim()) summary.empty.push(item.title)
          else {
            steps.save(item, text)
            summary.downloaded++
          }
        } catch (error) {
          if (signal.aborted) break
          const reason = stopReason(error)
          if (reason) {
            summary.state = 'stopped'
            summary.stopReason = reason
            break
          }
          summary.failed.push({
            title: item.title,
            message: error instanceof Error ? error.message : String(error)
          })
        } finally {
          this.#busyItems.delete(itemKey)
        }
      }
      if (signal.aborted) summary.state = 'cancelled'
      return summary
    } finally {
      this.#tasks.delete(taskKey)
    }
  }

  cancel(taskKey: string): boolean {
    const controller = this.#tasks.get(taskKey)
    controller?.abort()
    return controller !== undefined
  }
}
