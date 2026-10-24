import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../testing/testing'
import { openDatabase } from '../infra/storage/sqlite'
import { workSchema } from '../infra/storage/workSchema'
import { migrate } from '../infra/storage/migrate'
import {
  insertSourceBinding,
  listCatalogItems,
  listUpdateEvents,
  type StoredSourceBinding
} from '../infra/storage/sourceStorage'
import type { NovelSourceAdapter, SourceManifest } from './domain'
import { SourceSyncService } from './syncService'

const tempDir = createTempDirs()

function createTestManifest(sourceId: string): SourceManifest {
  return {
    manifestVersion: 1,
    sourceId,
    displayName: 'Test Adapter',
    nativeNames: [],
    aliases: [],
    domains: [],
    adapterVersion: '1.0.0',
    apiVersion: '1.0.0',
    dataVersion: 1,
    countryCode: 'JP',
    languageTags: ['ja'],
    capabilities: ['catalog'],
    auth: 'none',
    origin: { kind: 'builtin' },
    limits: { maxPages: 10, pageSize: 50, timeoutMs: 5000 }
  }
}

describe('SourceSyncService', () => {
  function setupDb() {
    const dbPath = join(tempDir(), 'work.mira')
    const db = openDatabase(dbPath)
    migrate(db, workSchema)
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at)
      VALUES ('w1', 'Tác phẩm', 'ja', 1, 1);
      INSERT INTO chapter (id, position, title, created_at, updated_at)
      VALUES ('c0', 0, 'Chương có sẵn từ trước', 1, 1);
    `)

    const binding: StoredSourceBinding = {
      id: 'b1',
      adapterId: 'test.adapter',
      adapterVersion: '1.0.0',
      remoteWorkId: 'remote-1',
      canonicalUrl: null,
      countryCode: 'JP',
      languageTag: 'ja',
      label: 'Bản Nhật',
      isPrimary: true,
      enabled: true,
      authProfileId: null,
      schedulePolicyJson: '{}',
      catalogCursorJson: null,
      lastValidSyncAt: null,
      lastAttemptAt: null,
      nextCheckAt: null,
      consecutiveFailures: 0,
      createdAt: 1000,
      updatedAt: 1000
    }
    insertSourceBinding(db, binding)

    return { db, binding }
  }

  it('creates 5 added events for 5 new chapters and does NOT create chapters or translation jobs', async () => {
    const { db } = setupDb()
    let idCounter = 1
    const newId = () => `id-${idCounter++}`

    const adapter: NovelSourceAdapter = {
      manifest: createTestManifest('test.adapter'),
      async getCatalog() {
        return {
          remoteWorkId: 'remote-1',
          items: [
            { remoteChapterId: 'ch-1', title: 'Chương 1', order: 1, access: 'public' },
            { remoteChapterId: 'ch-2', title: 'Chương 2', order: 2, access: 'public' },
            { remoteChapterId: 'ch-3', title: 'Chương 3', order: 3, access: 'public' },
            { remoteChapterId: 'ch-4', title: 'Chương 4', order: 4, access: 'public' },
            { remoteChapterId: 'ch-5', title: 'Chương 5', order: 5, access: 'public' }
          ],
          exhausted: true,
          complete: true
        }
      }
    }

    const service = new SourceSyncService(async () => adapter)

    const run = await service.startSync(db, 'b1', 1000, newId)

    expect(run.state).toBe('completed')
    expect(run.catalogComplete).toBe(true)

    // Check catalog items in DB: exactly 5 items created
    const catalogItems = listCatalogItems(db, 'b1')
    expect(catalogItems).toHaveLength(5)
    for (const item of catalogItems) {
      expect(item.chapterId).toBeNull() // NOT linked to chapter automatically
    }

    // Check update events in DB: exactly 5 added events
    const events = listUpdateEvents(db, 'b1')
    expect(events).toHaveLength(5)
    expect(events.every((e) => e.kind === 'added')).toBe(true)

    // CRITICAL: Chapter table still has ONLY the 1 preexisting chapter
    const chapters = db
      .prepare('SELECT id, title FROM chapter')
      .all<{ id: string; title: string }>()
    expect(chapters).toHaveLength(1)
    expect(chapters[0].id).toBe('c0')

    // Chapter text table is empty
    const textCount = db
      .prepare('SELECT count(*) as count FROM chapter_text')
      .get<{ count: number }>()?.count
    expect(textCount).toBe(0)

    db.close()
  })

  it('rejects concurrent sync on the same binding', async () => {
    const { db } = setupDb()
    let idCounter = 1
    const newId = () => `id-${idCounter++}`

    let finishCatalog: (() => void) | null = null
    const catalogPromise = new Promise<void>((resolve) => {
      finishCatalog = resolve
    })

    const adapter: NovelSourceAdapter = {
      manifest: createTestManifest('test.adapter'),
      async getCatalog() {
        await catalogPromise
        return {
          remoteWorkId: 'remote-1',
          items: [],
          exhausted: true,
          complete: true
        }
      }
    }

    const service = new SourceSyncService(async () => adapter)

    const syncPromise1 = service.startSync(db, 'b1', 1000, newId)

    // Immediate second start on same binding
    await expect(service.startSync(db, 'b1', 1000, newId)).rejects.toThrowError(
      /Đang có một lượt kiểm tra chạy/
    )

    finishCatalog!()
    await syncPromise1

    db.close()
  })

  it('supports cancellation without creating missing events and cleans up dangling runs', async () => {
    const { db } = setupDb()
    let idCounter = 1
    const newId = () => `id-${idCounter++}`

    const adapter: NovelSourceAdapter = {
      manifest: createTestManifest('test.adapter'),
      async getCatalog(_input, context) {
        // Wait until aborted
        await new Promise<void>((resolve) => {
          context.signal.addEventListener('abort', () => resolve())
        })
        return {
          remoteWorkId: 'remote-1',
          items: [],
          exhausted: true,
          complete: true
        }
      }
    }

    const service = new SourceSyncService(async () => adapter)

    const syncPromise = service.startSync(db, 'b1', 1000, newId)

    const active = service.getActiveRun('b1')
    expect(active).toBeDefined()

    const cancelled = service.cancelSync(db, active!.runId, 1500)
    expect(cancelled).toBe(true)

    const runResult = await syncPromise
    expect(runResult.state).toBe('cancelled')
    expect(runResult.failureKind).toBe('cancelled')

    // No events were generated
    expect(listUpdateEvents(db, 'b1')).toHaveLength(0)

    // Test cleanupDanglingRuns
    db.exec(`
      INSERT INTO source_sync_run (id, binding_id, trigger, state, adapter_version, catalog_complete, started_at, stats_json)
      VALUES ('dangling-run', 'b1', 'manual', 'running', '1.0.0', 0, 1000, '{}');
    `)

    service.cleanupDanglingRuns(db, 2000)

    const cleaned = db
      .prepare('SELECT state, failure_kind FROM source_sync_run WHERE id = ?')
      .get<{ state: string; failure_kind: string }>('dangling-run')
    expect(cleaned?.state).toBe('cancelled')
    expect(cleaned?.failure_kind).toBe('interrupted')

    db.close()
  })

  it('skips the catalog when the update fingerprint is unchanged unless a full check is asked', async () => {
    const { db } = setupDb()
    let idCounter = 1
    const newId = () => `id-${idCounter++}`
    let catalogReads = 0
    const adapter: NovelSourceAdapter = {
      manifest: createTestManifest('test.adapter'),
      async getUpdateFingerprint() {
        return '1|2026-10-01'
      },
      async getCatalog() {
        catalogReads++
        return {
          remoteWorkId: 'remote-1',
          items: [{ remoteChapterId: 'ch-1', title: 'Chương 1', order: 1, access: 'public' }],
          exhausted: true,
          complete: true
        }
      }
    }
    const service = new SourceSyncService(async () => adapter)

    await service.startSync(db, 'b1', 1000, newId)
    const unchanged = await service.startSync(db, 'b1', 2000, newId)
    expect(unchanged.state).toBe('completed')
    expect(JSON.parse(unchanged.statsJson ?? '{}')).toMatchObject({ unchanged: true })
    expect(catalogReads).toBe(1)

    await service.startSync(db, 'b1', 3000, newId, undefined, { full: true })
    expect(catalogReads).toBe(2)
    expect(listUpdateEvents(db, 'b1')).toHaveLength(1)
    db.close()
  })
})
