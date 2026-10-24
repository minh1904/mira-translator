import type { SecretCrypto } from '../infra/storage/secretStore'
import type { LibraryStore } from '../services/library/library'
import { AuthProfileService } from './authProfileService'
import { SourceBindingService } from './bindingService'
import { SourceCatalogService } from './catalogService'
import { SourceContentService } from './contentService'
import { SourceSyncService } from './syncService'
import { SourceRegistry } from './registry'
import { createSingleFileAdapter } from './singleFileAdapter'
import { createFolderAdapter } from './folderAdapter'
import { NetworkBroker } from './broker'
import type { CatalogItem, ChapterPage, NovelSourceAdapter, WorkInfo } from './domain'
import { NETWORK_SOURCES, findNetworkSource, type NetworkSource } from './networkSources'
import { AdapterRuntime } from './runtime'

export interface SourceServices {
  bindings: SourceBindingService
  catalog: SourceCatalogService
  sync: SourceSyncService
  content: SourceContentService
  auth: AuthProfileService
  registry: SourceRegistry
  preview: (input: { sourceId: string; remoteWorkId: string; languageTag?: string }) => Promise<{
    work: WorkInfo
    items: CatalogItem[]
  }>
  getChapter: (
    input: {
      sourceId: string
      remoteWorkId: string
      remoteChapterId: string
      languageTag?: string
    },
    signal?: AbortSignal
  ) => Promise<ChapterPage>
}

export interface SourceServicesOptions {
  /** Whether the user confirmed being 18+; gates age-cookie origins of R18 sources. */
  ageConfirmed?: () => boolean
}

export function createSourceServices(
  _library: LibraryStore,
  crypto: SecretCrypto,
  options: SourceServicesOptions = {}
): SourceServices {
  const bindings = new SourceBindingService()
  const catalog = new SourceCatalogService()
  const content = new SourceContentService()
  const auth = new AuthProfileService(crypto)
  const networkAdapters = new Map<string, NovelSourceAdapter>()

  const networkAdapter = (source: NetworkSource): NovelSourceAdapter => {
    const cached = networkAdapters.get(source.manifest.sourceId)
    if (cached) return cached
    const policy = source.manifest.networkPolicy!
    const adapter = source.createAdapter(
      new NetworkBroker({
        allowedOrigins: policy.origins,
        allowNetwork: true,
        minIntervalMs: policy.minIntervalMs,
        maxRedirects: policy.maxRedirects,
        maxResponseBytes: policy.maxResponseBytes,
        requestTimeoutMs: policy.requestTimeoutMs,
        ageCookies: policy.ageCookies,
        ageConfirmed: () => options.ageConfirmed?.() === true
      })
    )
    networkAdapters.set(source.manifest.sourceId, adapter)
    return adapter
  }

  const resolveAdapter = async (
    adapterId: string,
    remoteWorkId: string,
    languageTag: string
  ): Promise<NovelSourceAdapter> => {
    if (adapterId === 'mira.single-file' || adapterId === 'builtin.single-file') {
      const filePath = remoteWorkId.replace(/^file:/, '')
      return await createSingleFileAdapter(filePath, languageTag)
    }
    if (adapterId === 'mira.folder' || adapterId === 'builtin.folder') {
      const folderPath = remoteWorkId.replace(/^folder:/, '')
      return await createFolderAdapter(folderPath, languageTag)
    }
    const network = findNetworkSource(adapterId)
    if (network) return networkAdapter(network)
    throw new Error(`Adapter ${adapterId} is not installed or supported`)
  }

  const sync = new SourceSyncService(resolveAdapter)

  // Builtin registry
  const registry = new SourceRegistry([
    {
      manifestVersion: 1,
      sourceId: 'mira.single-file',
      displayName: 'Tệp văn bản',
      nativeNames: [],
      aliases: ['file', 'txt', 'md'],
      domains: [],
      countryCode: 'ZZ',
      languageTags: ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'],
      capabilities: ['identify', 'work', 'catalog', 'chapter'],
      adapterVersion: '1.0.0',
      apiVersion: '1.0.0',
      dataVersion: 1,
      auth: 'none',
      origin: { kind: 'builtin' },
      limits: { maxPages: 1, pageSize: 1, timeoutMs: 10000 },
      health: 'healthy'
    },
    {
      manifestVersion: 1,
      sourceId: 'mira.folder',
      displayName: 'Thư mục tệp',
      nativeNames: [],
      aliases: ['folder', 'directory'],
      domains: [],
      countryCode: 'ZZ',
      languageTags: ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'],
      capabilities: ['identify', 'work', 'catalog', 'chapter'],
      adapterVersion: '1.0.0',
      apiVersion: '1.0.0',
      dataVersion: 1,
      auth: 'none',
      origin: { kind: 'builtin' },
      limits: { maxPages: 1, pageSize: 10000, timeoutMs: 30000 },
      health: 'healthy'
    },
    ...NETWORK_SOURCES.map((source) => source.manifest)
  ])

  const preview = async (input: {
    sourceId: string
    remoteWorkId: string
    languageTag?: string
  }) => {
    const manifest = registry.get(input.sourceId)
    if (!manifest || !manifest.capabilities.includes('catalog')) {
      throw new Error('Nguồn này chưa được bật')
    }
    const adapter = await resolveAdapter(
      input.sourceId,
      input.remoteWorkId,
      input.languageTag ?? 'ja'
    )
    if (!adapter.getWork) throw new Error('Nguồn không hỗ trợ xem thông tin tác phẩm')
    const work = await adapter.getWork(
      { remoteWorkId: input.remoteWorkId },
      { signal: new AbortController().signal, now: () => new Date() }
    )
    const catalog = await new AdapterRuntime(adapter).getCatalog({
      remoteWorkId: input.remoteWorkId
    })
    if (!catalog.complete || !catalog.exhausted) {
      throw new Error('Nguồn trả về danh mục chưa đầy đủ; Mira không thể tạo bản raw an toàn')
    }
    return { work, items: catalog.items }
  }

  const getChapter = async (
    input: {
      sourceId: string
      remoteWorkId: string
      remoteChapterId: string
      languageTag?: string
    },
    signal?: AbortSignal
  ) => {
    const adapter = await resolveAdapter(
      input.sourceId,
      input.remoteWorkId,
      input.languageTag ?? 'ja'
    )
    return new AdapterRuntime(adapter).getChapter(input, signal)
  }

  return {
    bindings,
    catalog,
    sync,
    content,
    auth,
    registry,
    preview,
    getChapter
  }
}
