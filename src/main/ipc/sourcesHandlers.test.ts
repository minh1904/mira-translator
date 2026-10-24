import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../testing/testing'
import { LibraryStore } from '../services/library/library'
import { createSourceServices } from '../sources/sourceServices'
import { createLibraryHandlers, guardHandlers } from './libraryHandlers'
import type {
  SourceBinding,
  SourceCatalogItem,
  SourceCatalogPage,
  SourceUpdatesPage
} from '../../shared/contracts/sources'
import type { SecretCrypto } from '../infra/storage/secretStore'

const tempDir = createTempDirs()

const mockCrypto: SecretCrypto = {
  isEncryptionAvailable: () => true,
  encrypt: async (plain) => Buffer.from(`enc:${plain}`),
  decrypt: async (cipher) => ({
    value: Buffer.from(cipher).toString('utf8').replace(/^enc:/, ''),
    shouldReEncrypt: false
  })
}

describe('Sources IPC handlers', () => {
  function setup() {
    const dir = tempDir()
    const nowTime = 1000
    const library = LibraryStore.open({ dataDir: dir, now: () => nowTime })
    const work = library.create({ title: 'Tác phẩm test', sourceLang: 'ja' })
    const sources = createSourceServices(library, mockCrypto)
    const handlers = createLibraryHandlers(
      library,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      sources
    )

    return { library, work, sources, handlers, dir }
  }

  it('handles binding CRUD and contract round-trip', async () => {
    const { library, work, handlers } = setup()

    // Create binding
    const createRes = await handlers['sources:bindings:create']({
      workId: work.id,
      sourceId: 'mira.folder',
      remoteWorkId: 'folder:chapters',
      languageTag: 'ja',
      label: 'Bản Raw Folder',
      role: 'primary',
      expectedPreviewId: 'preview-1'
    })

    expect(createRes.ok).toBe(true)
    if (!createRes.ok) return
    const binding = createRes.value as SourceBinding
    expect(binding.workId).toBe(work.id)
    expect(binding.sourceId).toBe('mira.folder')
    expect(binding.role).toBe('primary')

    // List bindings
    const listRes = await handlers['sources:bindings:list']({ workId: work.id })
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    const bindings = listRes.value as SourceBinding[]
    expect(bindings).toHaveLength(1)
    expect(bindings[0].id).toBe(binding.id)

    // Update binding
    const updateRes = await handlers['sources:bindings:update']({
      workId: work.id,
      bindingId: binding.id,
      patch: { label: 'Bản Đã Đổi Tên' }
    })
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    const updated = updateRes.value as SourceBinding
    expect(updated.label).toBe('Bản Đã Đổi Tên')

    // Delete binding
    const deleteRes = await handlers['sources:bindings:delete']({
      workId: work.id,
      bindingId: binding.id,
      confirmed: true
    })
    expect(deleteRes.ok).toBe(true)

    const emptyList = await handlers['sources:bindings:list']({ workId: work.id })
    expect(emptyList.ok).toBe(true)
    if (emptyList.ok) expect(emptyList.value as SourceBinding[]).toHaveLength(0)

    library.close()
  })

  it('handles catalog listing, pagination and item retrieval', async () => {
    const { library, work, handlers } = setup()

    // Create a binding directly in db
    library.withWork(work.id, (db) => {
      db.exec(`
        INSERT INTO source_binding (id, adapter_id, adapter_version, remote_work_id, language_tag, label, created_at, updated_at)
        VALUES ('b1', 'mira.folder', '1.0.0', 'folder:raws', 'ja', 'Raw', 1000, 1000);

        INSERT INTO source_catalog_item (id, binding_id, remote_chapter_id, ordinal_key, title, kind, access_state, first_seen_at, last_seen_at, metadata_hash)
        VALUES
          ('item-1', 'b1', 'ch-1', '0001', 'Hồi 1', 'chapter', 'public', 1000, 1000, ''),
          ('item-2', 'b1', 'ch-2', '0002', 'Hồi 2', 'chapter', 'public', 1000, 1000, ''),
          ('item-3', 'b1', 'ch-3', '0003', 'Hồi 3', 'chapter', 'public', 1000, 1000, '');
      `)
    })

    // List with limit 2
    const page1 = await handlers['sources:catalog:list']({
      workId: work.id,
      bindingId: 'b1',
      limit: 2
    })
    expect(page1.ok).toBe(true)
    if (!page1.ok) return
    const p1 = page1.value as SourceCatalogPage
    expect(p1.items).toHaveLength(2)
    expect(p1.exhausted).toBe(false)
    expect(p1.nextCursor).toBe('2')

    // Get single item
    const getRes = await handlers['sources:catalog:get']({
      workId: work.id,
      itemId: 'item-1'
    })
    expect(getRes.ok).toBe(true)
    if (!getRes.ok) return
    const itm = getRes.value as SourceCatalogItem
    expect(itm.id).toBe('item-1')
    expect(itm.title).toBe('Hồi 1')

    // Not found item
    const notFound = await handlers['sources:catalog:get']({
      workId: work.id,
      itemId: 'item-missing'
    })
    expect(notFound.ok).toBe(false)

    library.close()
  })

  it('rejects untrusted senders via guardHandlers', async () => {
    const { library, work, handlers } = setup()
    const guarded = guardHandlers(handlers, () => false)

    const res = await guarded['sources:bindings:list']({} as any, { workId: work.id })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('untrusted_sender')
    }

    library.close()
  })

  it('supports update event mark-seen and preview-apply roundtrip', async () => {
    const { library, work, handlers } = setup()

    library.withWork(work.id, (db) => {
      db.exec(`
        INSERT INTO source_binding (id, adapter_id, adapter_version, remote_work_id, language_tag, label, created_at, updated_at)
        VALUES ('b1', 'mira.folder', '1.0.0', 'folder:raws', 'ja', 'Raw', 1000, 1000);

        INSERT INTO source_update_event (id, binding_id, kind, dedupe_key, payload_json, detected_at)
        VALUES ('ev-1', 'b1', 'added', 'key-1', '{"title":"Chương 1"}', 1000);
      `)
    })

    // List updates
    const listRes = await handlers['sources:updates:list']({ workId: work.id })
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    const lr = listRes.value as SourceUpdatesPage
    expect(lr.items).toHaveLength(1)
    expect(lr.items[0].seenAt).toBeNull()

    // Mark seen
    const markRes = await handlers['sources:updates:mark-seen']({
      workId: work.id,
      eventIds: ['ev-1']
    })
    expect(markRes.ok).toBe(true)
    if (!markRes.ok) return
    const mr = markRes.value as { updatedCount: number }
    expect(mr.updatedCount).toBe(1)

    // Verify seenAt is now recorded
    const listAfter = await handlers['sources:updates:list']({ workId: work.id })
    if (listAfter.ok) {
      const la = listAfter.value as SourceUpdatesPage
      expect(la.items[0].seenAt).toBeTypeOf('number')
      expect(la.items[0].actedAt).toBeNull()
    }

    library.close()
  })

  it('downloads chapters with relative position insertion and supports reorder by catalog', async () => {
    const { library, work, handlers, sources } = setup()

    sources.getChapter = async ({ remoteChapterId }) => ({
      remoteChapterId,
      text: `Nội dung chương ${remoteChapterId}`,
      contentHash: `hash-${remoteChapterId}`,
      payloadHash: `phash-${remoteChapterId}`,
      normalizationVersion: 1
    })

    library.withWork(work.id, (db) => {
      db.exec(`
        INSERT INTO source_binding (id, adapter_id, adapter_version, remote_work_id, language_tag, label, enabled, is_primary, created_at, updated_at)
        VALUES ('b1', 'mira.folder', '1.0.0', 'folder:raws', 'ja', 'Raw', 1, 1, 1000, 1000);

        INSERT INTO source_catalog_item (id, binding_id, remote_chapter_id, ordinal_key, title, kind, access_state, first_seen_at, last_seen_at, metadata_hash)
        VALUES
          ('it-1', 'b1', 'ch-1', '000001', 'Chương 1', 'chapter', 'public', 1000, 1000, 'm1'),
          ('it-5', 'b1', 'ch-5', '000005', 'Chương 5', 'chapter', 'public', 1000, 1000, 'm5'),
          ('it-10', 'b1', 'ch-10', '000010', 'Chương 10', 'chapter', 'public', 1000, 1000, 'm10');
      `)
    })

    // Download chapter 10 first
    const res10 = await handlers['sources:catalog:download']({ workId: work.id, itemId: 'it-10' })
    expect(res10.ok).toBe(true)
    let chapters = library.listChapters(work.id)
    expect(chapters.map((c) => c.title)).toEqual(['Chương 10'])

    // Download chapter 1 next -> should be inserted at position 0
    const res1 = await handlers['sources:catalog:download']({ workId: work.id, itemId: 'it-1' })
    expect(res1.ok).toBe(true)
    chapters = library.listChapters(work.id)
    expect(chapters.map((c) => c.title)).toEqual(['Chương 1', 'Chương 10'])

    // Download chapter 5 next -> should be inserted between 1 and 10
    const res5 = await handlers['sources:catalog:download']({ workId: work.id, itemId: 'it-5' })
    expect(res5.ok).toBe(true)
    chapters = library.listChapters(work.id)
    expect(chapters.map((c) => c.title)).toEqual(['Chương 1', 'Chương 5', 'Chương 10'])

    // Now test reorder: user moves chapter 10 to position 1 (1-based) -> [10, 1, 5]
    library.moveChapter(work.id, chapters[2].id, 1)
    expect(library.listChapters(work.id).map((c) => c.title)).toEqual([
      'Chương 10',
      'Chương 1',
      'Chương 5'
    ])

    // Run reorder-by-source
    const reorderRes = await handlers['sources:catalog:reorder-by-source']({
      workId: work.id,
      bindingId: 'b1'
    })
    expect(reorderRes.ok).toBe(true)
    expect(library.listChapters(work.id).map((c) => c.title)).toEqual([
      'Chương 1',
      'Chương 5',
      'Chương 10'
    ])

    library.close()
  })

  it('supports bulk range download', async () => {
    const { library, work, handlers, sources } = setup()

    sources.getChapter = async ({ remoteChapterId }) => ({
      remoteChapterId,
      text: `Nội dung ${remoteChapterId}`,
      contentHash: `h-${remoteChapterId}`,
      payloadHash: `p-${remoteChapterId}`,
      normalizationVersion: 1
    })

    library.withWork(work.id, (db) => {
      db.exec(`
        INSERT INTO source_binding (id, adapter_id, adapter_version, remote_work_id, language_tag, label, enabled, is_primary, created_at, updated_at)
        VALUES ('b1', 'mira.folder', '1.0.0', 'folder:raws', 'ja', 'Raw', 1, 1, 1000, 1000);

        INSERT INTO source_catalog_item (id, binding_id, remote_chapter_id, ordinal_key, title, kind, access_state, first_seen_at, last_seen_at, metadata_hash)
        VALUES
          ('it-1', 'b1', 'ch-1', '000001', 'Chương 1', 'chapter', 'public', 1000, 1000, 'm1'),
          ('it-2', 'b1', 'ch-2', '000002', 'Chương 2', 'chapter', 'public', 1000, 1000, 'm2'),
          ('it-3', 'b1', 'ch-3', '000003', 'Chương 3', 'chapter', 'public', 1000, 1000, 'm3');
      `)
    })

    const res = await handlers['sources:catalog:download-range']({
      workId: work.id,
      bindingId: 'b1',
      range: '1-2'
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toMatchObject({ state: 'completed', downloaded: 2, failed: [] })
    }
    expect(
      await handlers['sources:catalog:download-cancel']({ workId: work.id, bindingId: 'b1' })
    ).toEqual({ ok: true, value: { cancelled: false } })
    const chapters = library.listChapters(work.id)
    expect(chapters.map((c) => c.title)).toEqual(['Chương 1', 'Chương 2'])

    library.close()
  })

  it('identifies a network URL and stores the previewed catalog when the binding is created', async () => {
    const { library, work, handlers, sources } = setup()
    const identified = await handlers['sources:bindings:identify']({
      workId: work.id,
      candidate: 'https://kakuyomu.jp/works/123/episodes/9'
    })
    expect(identified).toMatchObject({
      ok: true,
      value: {
        source: { sourceId: 'mira.jp.kakuyomu', adult: false },
        remoteWorkId: '123',
        canonicalUrl: 'https://kakuyomu.jp/works/123',
        inputRemoteChapterId: '9'
      }
    })

    let previews = 0
    sources.preview = async () => {
      previews++
      return {
        work: { remoteWorkId: '123', title: 'Truyện', languageTag: 'ja', author: 'Tác giả' },
        items: [
          {
            remoteChapterId: '9',
            title: 'Tập 1',
            order: 1,
            access: 'public',
            volumeTitle: '第一章'
          },
          { remoteChapterId: '10', title: 'Tập 2', order: 2, access: 'public' }
        ]
      }
    }
    const preview = await handlers['sources:bindings:preview-create']({
      workId: work.id,
      sourceId: 'mira.jp.kakuyomu',
      remoteWorkId: '123'
    })
    expect(preview).toMatchObject({ ok: true, value: { author: 'Tác giả', totalCount: 2 } })
    if (!preview.ok) return

    const created = await handlers['sources:bindings:create']({
      workId: work.id,
      sourceId: 'mira.jp.kakuyomu',
      remoteWorkId: '123',
      languageTag: 'ja',
      label: 'Kakuyomu',
      role: 'primary',
      expectedPreviewId: (preview.value as { previewId: string }).previewId
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const catalog = await handlers['sources:catalog:list']({
      workId: work.id,
      bindingId: (created.value as SourceBinding).id
    })
    expect(
      catalog.ok && (catalog.value as SourceCatalogPage).items.map((item) => item.title)
    ).toEqual(['Tập 1', 'Tập 2'])
    expect(previews).toBe(1)
    library.withWork(work.id, (db) => {
      const events = db
        .prepare('SELECT COUNT(*) AS n FROM source_update_event')
        .get<{ n: number }>()
      expect(events?.n).toBe(0)
    })
    library.close()
  })

  it('stops an R18 check with age_verification_required once the confirmation is revoked', async () => {
    const dir = tempDir()
    const library = LibraryStore.open({ dataDir: dir, now: () => 1000 })
    const work = library.create({ title: 'R18', sourceLang: 'ja' })
    let confirmed = true
    const sources = createSourceServices(library, mockCrypto, { ageConfirmed: () => confirmed })
    const handlers = createLibraryHandlers(
      library,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      sources
    )
    library.withWork(work.id, (db) => {
      db.exec(`
        INSERT INTO source_binding (id, adapter_id, adapter_version, remote_work_id, language_tag, label, enabled, is_primary, created_at, updated_at)
        VALUES ('b18', 'mira.jp.syosetu.r18', '1.0.0', 'n5678cd', 'ja', 'R18', 1, 1, 1000, 1000);
      `)
    })
    confirmed = false
    const run = await handlers['sources:sync:start']({ workId: work.id, bindingId: 'b18' })
    expect(run).toMatchObject({
      ok: true,
      value: { state: 'failed', failure: { code: 'age_verification_required' } }
    })
    library.close()
  })
})
