export type SourceCapability =
  | 'identify'
  | 'metadata'
  | 'catalog'
  | 'chapter'
  | 'session'
  | 'browser'
  | 'work'
export type SourceHealth = 'healthy' | 'degraded' | 'broken' | 'inconclusive' | 'unchecked'
export type AccessState =
  | 'public'
  | 'login_required'
  | 'age_verification_required'
  | 'entitlement_required'
  | 'manual_intervention_required'
  | 'temporarily_unavailable'
  | 'parser_broken'

export interface SourceManifest {
  manifestVersion: 1
  sourceId: string
  displayName: string
  nativeNames: string[]
  aliases: string[]
  domains: string[]
  adapterVersion: string
  apiVersion: string
  dataVersion: number
  countryCode: string
  languageTags: string[]
  capabilities: SourceCapability[]
  auth: 'none' | 'optional' | 'required'
  origin: { kind: 'builtin' } | { kind: 'package'; packageName: string }
  limits: { maxPages: number; pageSize: number; timeoutMs: number }
  health?: SourceHealth
  /** R18 source: requests need the user's age confirmation. */
  adult?: boolean
  networkPolicy?: {
    origins: string[]
    minIntervalMs: number
    maxConcurrency: number
    maxRedirects: number
    maxAttempts: number
    maxResponseBytes: number
    requestTimeoutMs: number
    operationRequestBudget: number
    /** Extra pause the download task takes after every `every` chapters. */
    burstPause?: { every: number; ms: number }
    /** Fixed age-confirmation cookie per origin, sent only after the user confirmed their age. */
    ageCookies?: Record<string, string>
  }
}

export interface SourceIdentity {
  remoteWorkId: string
  canonicalUrl: string
  inputRemoteChapterId?: string
}

export interface WorkInfo {
  remoteWorkId: string
  title: string
  languageTag: string
  author?: string
  description?: string
  /** Site name shown next to the source, e.g. Nocturne for an R18 Syosetu work. */
  siteName?: string
}

export interface CatalogItem {
  remoteChapterId: string
  title: string
  order: number
  url?: string
  /** Chapter group heading (章) the episode sits under. */
  volumeTitle?: string
  access: AccessState
  contentHash?: string
  payloadHash?: string
  identityConfidence?: 'stable' | 'fallback'
}

export interface CatalogPage {
  items: CatalogItem[]
  nextCursor?: string
  exhausted: boolean
  complete: boolean
  remoteWorkId: string
}

export interface ChapterPage {
  remoteChapterId: string
  text: string
  contentHash: string
  payloadHash: string
  normalizationVersion: 1
}

export interface AdapterContext {
  signal: AbortSignal
  now: () => Date
}

export interface NovelSourceAdapter {
  manifest: SourceManifest
  /** Local (folder/file) adapters only; network sources identify URLs offline via `NetworkSource`. */
  identify?: (
    input: { value: string },
    context: AdapterContext
  ) => Promise<{ remoteWorkId: string } | null>
  getWork?: (input: { remoteWorkId: string }, context: AdapterContext) => Promise<WorkInfo>
  /**
   * Cheap evidence of remote change (e.g. episode count + last update from an API). A sync whose
   * fingerprint equals the last complete run's skips reading the catalog.
   */
  getUpdateFingerprint?: (
    input: { remoteWorkId: string },
    context: AdapterContext
  ) => Promise<string>
  getCatalog?: (
    input: { remoteWorkId: string; cursor?: string },
    context: AdapterContext
  ) => Promise<CatalogPage>
  getChapter?: (
    input: { remoteWorkId: string; remoteChapterId: string },
    context: AdapterContext
  ) => Promise<ChapterPage>
  checkSession?: (
    input: { remoteWorkId: string },
    context: AdapterContext
  ) => Promise<{ state: 'valid' | 'login_required' }>
}
