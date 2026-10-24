import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  MAX_SOURCE_CURSOR_LENGTH,
  sourceBindingIdentifyResultSchema,
  sourceBindingPreviewSchema,
  sourceBindingSchema,
  sourceCatalogItemSchema,
  sourceCatalogListInputSchema,
  sourceDescriptorSchema,
  sourceManifestSchema,
  sourceSyncRunSchema,
  sourceUpdateEventSchema
} from './sources'

const descriptor = {
  sourceId: 'mira.folder',
  displayName: 'Thư mục',
  nativeName: null,
  aliases: ['Folder'],
  domains: [],
  countryCode: null,
  languageTags: ['ko', 'fr-CA'],
  capabilities: ['identify', 'metadata', 'catalog', 'chapter'],
  access: 'local',
  health: { state: 'healthy', checkedAt: 1, message: null },
  adult: false
} as const

const manifest = {
  manifestVersion: 1,
  sourceId: descriptor.sourceId,
  displayName: descriptor.displayName,
  nativeNames: ['Thư mục'],
  aliases: descriptor.aliases,
  domains: descriptor.domains,
  countryCode: 'ZZ',
  languageTags: descriptor.languageTags,
  capabilities: descriptor.capabilities,
  adapterVersion: '1.2.3',
  apiVersion: '1.0.0',
  dataVersion: 1,
  auth: 'none',
  origin: { kind: 'builtin' },
  limits: { pageSize: 100, maxPages: 20, timeoutMs: 30_000 },
  health: 'healthy'
} as const

describe('source descriptor and manifest contracts', () => {
  it('accepts independent country and language metadata', () => {
    expect(v.parse(sourceDescriptorSchema, { ...descriptor, countryCode: 'KR' })).toMatchObject({
      countryCode: 'KR',
      languageTags: ['ko', 'fr-CA']
    })
    expect(v.is(sourceManifestSchema, manifest)).toBe(true)
  })

  it.each([
    { ...manifest, sourceId: '' },
    { ...manifest, countryCode: 'KOR' },
    { ...manifest, countryCode: 'kr' },
    { ...manifest, languageTags: ['not_a_tag'] },
    { ...manifest, adapterVersion: 'latest' },
    { ...manifest, capabilities: ['database'] }
  ])('rejects invalid manifest metadata %#', (value) => {
    expect(v.is(sourceManifestSchema, value)).toBe(false)
  })

  it('validates a bounded HTTPS network policy', () => {
    const networkManifest = {
      ...manifest,
      sourceId: 'mira.jp.kakuyomu',
      domains: ['kakuyomu.jp'],
      network: {
        origins: ['https://kakuyomu.jp'],
        minIntervalMs: 1000,
        maxConcurrency: 1,
        maxRedirects: 3,
        maxAttempts: 3,
        maxResponseBytes: 2_000_000,
        requestTimeoutMs: 30_000,
        operationRequestBudget: 20
      }
    } as const

    expect(v.is(sourceManifestSchema, networkManifest)).toBe(true)
    expect(
      v.is(sourceManifestSchema, {
        ...networkManifest,
        network: { ...networkManifest.network, origins: ['http://kakuyomu.jp'] }
      })
    ).toBe(false)
    expect(
      v.is(sourceManifestSchema, {
        ...networkManifest,
        network: { ...networkManifest.network, maxConcurrency: 0 }
      })
    ).toBe(false)
  })
})

describe('source persisted DTO contracts', () => {
  it('accepts binding, catalog, sync and update records', () => {
    expect(
      v.is(sourceBindingSchema, {
        id: 'binding-1',
        workId: 'work-1',
        sourceId: 'mira.folder',
        adapterVersion: '1.2.3',
        remoteWorkId: 'folder:C:/novel',
        canonicalUrl: null,
        countryCode: null,
        languageTag: 'ko',
        label: 'Raw Hàn',
        role: 'primary',
        authProfileId: null,
        enabled: true,
        checkpoint: null,
        createdAt: 1,
        updatedAt: 1
      })
    ).toBe(true)
    expect(
      v.is(sourceCatalogItemSchema, {
        id: 'item-1',
        bindingId: 'binding-1',
        remoteChapterId: 'chapter/1.txt',
        remoteUrl: null,
        chapterId: null,
        position: 1,
        title: '1',
        kind: 'chapter',
        access: 'public',
        contentHash: null,
        firstSeenAt: 1,
        lastSeenAt: 1,
        missingStreak: 0,
        removedAt: null
      })
    ).toBe(true)
    expect(
      v.is(sourceSyncRunSchema, {
        id: 'run-1',
        bindingId: 'binding-1',
        trigger: 'manual',
        state: 'completed',
        adapterVersion: '1.2.3',
        complete: true,
        phase: 'done',
        processedCount: 2,
        totalCount: 2,
        failure: null,
        startedAt: 1,
        finishedAt: 2
      })
    ).toBe(true)
    expect(
      v.is(sourceUpdateEventSchema, {
        id: 'event-1',
        bindingId: 'binding-1',
        catalogItemId: 'item-1',
        kind: 'added',
        dedupeKey: 'added:item-1:first',
        payload: null,
        detectedAt: 2,
        seenAt: null,
        actedAt: null
      })
    ).toBe(true)
  })

  it.each([
    ['binding', sourceBindingSchema, { id: '', languageTag: 'ko' }],
    ['catalog access', sourceCatalogItemSchema, { id: 'x', access: 'paid' }],
    ['sync state', sourceSyncRunSchema, { id: 'x', state: 'sleeping' }],
    ['event kind', sourceUpdateEventSchema, { id: 'x', kind: 'deleted' }]
  ])('rejects invalid %s state', (_name, schema, value) => {
    expect(v.is(schema, value)).toBe(false)
  })

  it.each([
    'redirect_not_allowed',
    'address_blocked',
    'response_too_large',
    'request_budget_exceeded',
    'parser_broken'
  ])('accepts safe source failure code %s', (code) => {
    expect(
      v.is(sourceSyncRunSchema, {
        id: 'run-1',
        bindingId: 'binding-1',
        trigger: 'manual',
        state: 'failed',
        adapterVersion: '1.0.0',
        complete: false,
        phase: 'catalog',
        processedCount: 0,
        totalCount: null,
        failure: { code, message: 'Yêu cầu nguồn thất bại', retryable: false },
        startedAt: 1,
        finishedAt: 2
      })
    ).toBe(true)
  })
})

describe('source IPC contracts', () => {
  it('bounds pagination cursors and rejects unknown input fields', () => {
    expect(
      v.is(sourceCatalogListInputSchema, {
        workId: 'work-1',
        bindingId: 'binding-1',
        cursor: 'next',
        limit: 50
      })
    ).toBe(true)
    expect(
      v.is(sourceCatalogListInputSchema, {
        workId: 'work-1',
        cursor: 'x'.repeat(MAX_SOURCE_CURSOR_LENGTH + 1)
      })
    ).toBe(false)
    expect(v.is(sourceCatalogListInputSchema, { workId: 'work-1', secret: 'nope' })).toBe(false)
  })

  it('round-trips typed identify and preview results', () => {
    const source = {
      ...descriptor,
      sourceId: 'mira.jp.kakuyomu',
      domains: ['kakuyomu.jp'],
      countryCode: 'JP',
      languageTags: ['ja'],
      access: 'public',
      health: { state: 'unchecked', checkedAt: null, message: null },
      adult: false
    }
    expect(
      v.is(sourceBindingIdentifyResultSchema, {
        source,
        remoteWorkId: '123',
        canonicalUrl: 'https://kakuyomu.jp/works/123',
        inputRemoteChapterId: '456'
      })
    ).toBe(true)
    expect(
      v.is(sourceBindingPreviewSchema, {
        previewId: 'preview-1',
        expiresAt: 10_000,
        workId: 'work-1',
        sourceId: 'mira.jp.kakuyomu',
        remoteWorkId: '123',
        canonicalUrl: 'https://kakuyomu.jp/works/123',
        inputRemoteChapterId: '456',
        title: 'Tác phẩm mẫu',
        author: 'Tác giả mẫu',
        description: 'Mô tả',
        languageTag: 'ja',
        totalCount: 2,
        matchedCount: 0,
        unmatchedCount: 2,
        errorCount: 0,
        warnings: [],
        sample: []
      })
    ).toBe(true)
  })
})
