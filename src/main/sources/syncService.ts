import type { Db } from '../infra/storage/sqlite'
import { StorageError } from '../infra/storage/errors'
import {
  getSourceBinding,
  getSyncRun,
  insertCatalogItem,
  insertSyncRun,
  insertUpdateEvent,
  listCatalogItems,
  updateCatalogItem,
  updateSourceBinding,
  updateSyncRun,
  type StoredCatalogItem,
  type StoredSyncRun
} from '../infra/storage/sourceStorage'
import { diffCatalog, type CatalogSnapshot, type CatalogStateItem } from './catalogDiff'
import type { CatalogItem, NovelSourceAdapter } from './domain'
import { AdapterRuntime, AdapterRuntimeError } from './runtime'

export type AdapterResolver = (
  adapterId: string,
  remoteWorkId: string,
  languageTag: string
) => Promise<NovelSourceAdapter>

export interface ActiveSync {
  runId: string
  bindingId: string
  controller: AbortController
}

export interface SyncProgressUpdate {
  runId: string
  bindingId: string
  phase: 'queued' | 'catalog' | 'diff' | 'commit' | 'done'
  processedCount: number
  totalCount: number | null
}

function lastCompleteFingerprint(db: Db, bindingId: string): string | null {
  const row = db
    .prepare(
      `SELECT stats_json FROM source_sync_run
       WHERE binding_id = ? AND state = 'completed' AND catalog_complete = 1
       ORDER BY started_at DESC, id DESC LIMIT 1`
    )
    .get<{ stats_json: string }>(bindingId)
  if (!row) return null
  try {
    const stats = JSON.parse(row.stats_json) as { fingerprint?: unknown }
    return typeof stats.fingerprint === 'string' ? stats.fingerprint : null
  } catch {
    return null
  }
}

export class SourceSyncService {
  private readonly activeRuns = new Map<string, ActiveSync>()

  constructor(private readonly resolveAdapter: AdapterResolver) {}

  getActiveRun(bindingId: string): ActiveSync | undefined {
    return this.activeRuns.get(bindingId)
  }

  cancelSync(db: Db, runId: string, now: number): boolean {
    for (const [bindingId, active] of this.activeRuns.entries()) {
      if (active.runId === runId) {
        active.controller.abort()
        this.activeRuns.delete(bindingId)
        updateSyncRun(db, {
          id: runId,
          state: 'cancelled',
          finishedAt: now,
          failureKind: 'cancelled',
          failureMessage: 'Lượt kiểm tra đã bị hủy'
        })
        return true
      }
    }
    return false
  }

  async startSync(
    db: Db,
    bindingId: string,
    now: number,
    newId: () => string,
    onProgress?: (progress: SyncProgressUpdate) => void,
    options: { full?: boolean } = {}
  ): Promise<StoredSyncRun> {
    const binding = getSourceBinding(db, bindingId)
    if (!binding) {
      throw new StorageError('not_found', `Binding ${bindingId} not found`)
    }

    // Enforce uniqueness: only 1 active sync per binding
    if (this.activeRuns.has(bindingId)) {
      throw new StorageError('conflict', `Đang có một lượt kiểm tra chạy trên bản raw ${bindingId}`)
    }

    const runId = newId()
    const controller = new AbortController()
    this.activeRuns.set(bindingId, { runId, bindingId, controller })

    const run: StoredSyncRun = {
      id: runId,
      bindingId,
      trigger: 'manual',
      state: 'running',
      adapterVersion: binding.adapterVersion,
      catalogComplete: false,
      startedAt: now,
      finishedAt: null,
      failureKind: null,
      failureMessage: null,
      statsJson: '{}'
    }
    insertSyncRun(db, run)

    onProgress?.({
      runId,
      bindingId,
      phase: 'catalog',
      processedCount: 0,
      totalCount: null
    })

    try {
      const adapter = await this.resolveAdapter(
        binding.adapterId,
        binding.remoteWorkId,
        binding.languageTag
      )

      let fingerprint: string | null = null
      if (adapter.getUpdateFingerprint) {
        fingerprint = await adapter.getUpdateFingerprint(
          { remoteWorkId: binding.remoteWorkId },
          { signal: controller.signal, now: () => new Date(now) }
        )
        if (!options.full && fingerprint === lastCompleteFingerprint(db, bindingId)) {
          updateSyncRun(db, {
            id: runId,
            state: 'completed',
            catalogComplete: true,
            finishedAt: now,
            statsJson: JSON.stringify({ unchanged: true, fingerprint })
          })
          updateSourceBinding(db, {
            ...binding,
            lastValidSyncAt: now,
            lastAttemptAt: now,
            consecutiveFailures: 0,
            updatedAt: now
          })
          onProgress?.({ runId, bindingId, phase: 'done', processedCount: 0, totalCount: 0 })
          return getSyncRun(db, runId)!
        }
      }

      const runtime = new AdapterRuntime(adapter)
      const page = await runtime.getCatalog(
        { remoteWorkId: binding.remoteWorkId },
        controller.signal
      )

      onProgress?.({
        runId,
        bindingId,
        phase: 'diff',
        processedCount: page.items.length,
        totalCount: page.items.length
      })

      const snapshot: CatalogSnapshot = {
        sourceId: binding.adapterId,
        remoteWorkId: binding.remoteWorkId,
        items: page.items,
        complete: page.complete,
        exhausted: page.exhausted
      }

      const existingStored = listCatalogItems(db, bindingId)
      const previousState: CatalogStateItem[] = existingStored.map((s) => ({
        remoteChapterId: s.remoteChapterId,
        title: s.title,
        order: Number.parseInt(s.ordinalKey, 10) || 0,
        access: s.accessState as CatalogItem['access'],
        firstSeenAt: new Date(s.firstSeenAt).toISOString(),
        lastSeenAt: new Date(s.lastSeenAt).toISOString(),
        missingStreak: s.missingStreak,
        removedAt: s.removedAt ? new Date(s.removedAt).toISOString() : undefined
      }))

      const observedAt = new Date(now).toISOString()
      const diffResult = diffCatalog(previousState, snapshot, observedAt)

      if (!diffResult.valid) {
        updateSyncRun(db, {
          id: runId,
          state: 'failed',
          finishedAt: now,
          failureKind: 'validation_error',
          failureMessage: diffResult.validationReasons.join('; ')
        })
        updateSourceBinding(db, {
          ...binding,
          lastAttemptAt: now,
          consecutiveFailures: binding.consecutiveFailures + 1,
          updatedAt: now
        })
        return (getSyncRun(db, runId) ?? { ...run, state: 'failed' }) as StoredSyncRun
      }

      onProgress?.({
        runId,
        bindingId,
        phase: 'commit',
        processedCount: diffResult.items.length,
        totalCount: diffResult.items.length
      })

      // Commit changes in transaction
      db.transaction(() => {
        const storedMap = new Map(existingStored.map((s) => [s.remoteChapterId, s]))

        for (const item of diffResult.items) {
          const prior = storedMap.get(item.remoteChapterId)
          if (!prior) {
            // New item discovered
            const newItem: StoredCatalogItem = {
              id: newId(),
              bindingId,
              remoteChapterId: item.remoteChapterId,
              remoteUrl: item.url ?? null,
              chapterId: null, // Note: NOT linked to chapter automatically!
              ordinalKey: String(item.order).padStart(6, '0'),
              volumeTitle: item.volumeTitle ?? null,
              title: item.title,
              kind: 'chapter',
              publishedAt: null,
              remoteUpdatedAt: null,
              revisionToken: null,
              accessState: item.access,
              firstSeenAt: now,
              lastSeenAt: now,
              missingStreak: item.missingStreak,
              removedAt: item.removedAt ? now : null,
              metadataHash: ''
            }
            insertCatalogItem(db, newItem)
            storedMap.set(item.remoteChapterId, newItem)
          } else {
            // Update existing catalog item
            const updated: StoredCatalogItem = {
              ...prior,
              remoteUrl: item.url ?? prior.remoteUrl,
              title: item.title,
              ordinalKey: String(item.order).padStart(6, '0'),
              volumeTitle: item.volumeTitle ?? prior.volumeTitle,
              accessState: item.access,
              lastSeenAt: now,
              missingStreak: item.missingStreak,
              removedAt: item.removedAt ? now : null
            }
            updateCatalogItem(db, updated)
          }
        }

        // Insert update events - idempotent by dedupeKey
        for (const event of diffResult.events) {
          const item = storedMap.get(event.remoteChapterId)
          insertUpdateEvent(db, {
            id: newId(),
            bindingId,
            catalogItemId: item?.id ?? null,
            kind: event.kind,
            dedupeKey: event.dedupeKey,
            payloadJson: JSON.stringify({
              remoteChapterId: event.remoteChapterId,
              confidence: event.identityConfidence
            }),
            detectedAt: now,
            seenAt: null,
            actedAt: null
          })
        }

        // Update binding
        updateSourceBinding(db, {
          ...binding,
          lastValidSyncAt: now,
          lastAttemptAt: now,
          consecutiveFailures: 0,
          catalogCursorJson: page.nextCursor ? JSON.stringify(page.nextCursor) : null,
          updatedAt: now
        })

        // Complete sync run
        const addedCount = diffResult.events.filter((e) => e.kind === 'added').length
        updateSyncRun(db, {
          id: runId,
          state: 'completed',
          catalogComplete: page.complete,
          finishedAt: now,
          statsJson: JSON.stringify({
            totalItems: diffResult.items.length,
            addedCount,
            eventsCount: diffResult.events.length,
            // Only a complete catalog may vouch for "unchanged" on the next check.
            fingerprint: page.complete ? fingerprint : null
          })
        })
      })

      onProgress?.({
        runId,
        bindingId,
        phase: 'done',
        processedCount: diffResult.items.length,
        totalCount: diffResult.items.length
      })

      return getSyncRun(db, runId)!
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
        (err instanceof AdapterRuntimeError && err.code === 'cancelled')
      ) {
        updateSyncRun(db, {
          id: runId,
          state: 'cancelled',
          finishedAt: now,
          failureKind: 'cancelled',
          failureMessage: 'Lượt kiểm tra đã bị hủy'
        })
        return getSyncRun(db, runId)!
      }

      const message = err instanceof Error ? err.message : String(err)
      // Broker and source access errors carry a code the UI can act on (e.g. age confirmation).
      const code = (err as { code?: unknown }).code
      updateSyncRun(db, {
        id: runId,
        state: 'failed',
        finishedAt: now,
        failureKind: typeof code === 'string' ? code : 'adapter_error',
        failureMessage: message
      })
      updateSourceBinding(db, {
        ...binding,
        lastAttemptAt: now,
        consecutiveFailures: binding.consecutiveFailures + 1,
        updatedAt: now
      })
      return getSyncRun(db, runId)!
    } finally {
      this.activeRuns.delete(bindingId)
    }
  }

  /**
   * Resets dangling runs left in 'running' state after an unexpected process restart.
   */
  cleanupDanglingRuns(db: Db, now: number): void {
    db.prepare(
      `UPDATE source_sync_run
       SET state = 'cancelled', finished_at = ?, failure_kind = 'interrupted',
           failure_message = 'Lượt kiểm tra bị gián đoạn do ứng dụng đóng đột ngột'
       WHERE state IN ('running', 'queued')`
    ).run(now)
  }
}
