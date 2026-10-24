import * as v from 'valibot'
import { sourceLanguageSchema } from './library'

export const MAX_SOURCE_CURSOR_LENGTH = 2048
export const MAX_SOURCE_PAGE_SIZE = 200
export const MAX_SOURCE_TEXT_LENGTH = 500

const nonEmptyText = (label: string, maxLength = MAX_SOURCE_TEXT_LENGTH) =>
  v.pipe(
    v.string(label + ' phải là chữ.'),
    v.trim(),
    v.minLength(1, label + ' không được để trống.'),
    v.maxLength(maxLength, label + ' quá dài.')
  )

/** ID do nguồn quản lý; kiểm tra không rỗng và có độ dài tối đa an toàn. */
export const sourceOpaqueIdSchema = nonEmptyText('ID', 512)
export const sourceIdSchema = v.pipe(
  nonEmptyText('Source ID', 128),
  v.regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Source ID không hợp lệ.')
)
export const sourceCountryCodeSchema = v.pipe(
  v.string('Mã quốc gia phải là chữ.'),
  v.regex(/^[A-Z]{2}$/, 'Mã quốc gia phải là ISO 3166-1 alpha-2 viết hoa.')
)
export const sourceVersionSchema = v.pipe(
  v.string('Phiên bản phải là chữ.'),
  v.regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'Phiên bản phải theo SemVer.')
)
export const sourceCursorSchema = v.pipe(
  v.string('Cursor phải là chữ.'),
  v.maxLength(MAX_SOURCE_CURSOR_LENGTH, 'Cursor quá dài.')
)

const timestampSchema = v.pipe(v.number('Thời điểm phải là số.'), v.safeInteger(), v.minValue(0))
const nullableTimestampSchema = v.nullable(timestampSchema)
const nonNegativeIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const positiveIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1))

export const SOURCE_CAPABILITIES = [
  'identify',
  'metadata',
  'work',
  'catalog',
  'chapter',
  'session',
  'browser'
] as const
export const sourceCapabilitySchema = v.picklist(SOURCE_CAPABILITIES)
export type SourceCapability = v.InferOutput<typeof sourceCapabilitySchema>

export const SOURCE_ACCESS_KINDS = ['local', 'public', 'account', 'subscription'] as const
export const sourceAccessKindSchema = v.picklist(SOURCE_ACCESS_KINDS)
export type SourceAccessKind = v.InferOutput<typeof sourceAccessKindSchema>

export const SOURCE_HEALTH_STATES = [
  'healthy',
  'degraded',
  'broken',
  'inconclusive',
  'unchecked'
] as const
export const sourceHealthStateSchema = v.picklist(SOURCE_HEALTH_STATES)
export type SourceHealthState = v.InferOutput<typeof sourceHealthStateSchema>

export const sourceHealthSchema = v.strictObject({
  state: sourceHealthStateSchema,
  checkedAt: nullableTimestampSchema,
  message: v.nullable(v.pipe(v.string(), v.maxLength(2000)))
})
export type SourceHealth = v.InferOutput<typeof sourceHealthSchema>

export const sourceDescriptorSchema = v.strictObject({
  sourceId: sourceIdSchema,
  displayName: nonEmptyText('Tên nguồn'),
  nativeName: v.nullable(nonEmptyText('Tên bản địa')),
  aliases: v.pipe(v.array(nonEmptyText('Alias')), v.maxLength(50)),
  domains: v.pipe(
    v.array(
      v.pipe(
        v.string(),
        v.regex(
          /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
        )
      )
    ),
    v.maxLength(50)
  ),
  countryCode: v.nullable(sourceCountryCodeSchema),
  languageTags: v.pipe(v.array(sourceLanguageSchema), v.minLength(1), v.maxLength(50)),
  capabilities: v.pipe(v.array(sourceCapabilitySchema), v.maxLength(SOURCE_CAPABILITIES.length)),
  access: sourceAccessKindSchema,
  health: sourceHealthSchema,
  /** R18 source: preview and requests need the user's age confirmation. */
  adult: v.boolean()
})
export type SourceDescriptor = v.InferOutput<typeof sourceDescriptorSchema>

export const sourceAuthSchema = v.strictObject({
  type: v.picklist(['none', 'optional', 'required'] as const),
  interactive: v.optional(v.boolean(), false)
})
export type SourceAuth = v.InferOutput<typeof sourceAuthSchema>

export const sourceNetworkPolicySchema = v.strictObject({
  origins: v.pipe(
    v.array(
      v.pipe(
        v.string(),
        v.url(),
        v.check((value) => {
          const url = new URL(value)
          return (
            url.protocol === 'https:' &&
            url.origin === value &&
            url.username === '' &&
            url.password === '' &&
            url.pathname === '/' &&
            url.search === '' &&
            url.hash === ''
          )
        }, 'Origin mạng phải là HTTPS origin canonical.')
      )
    ),
    v.minLength(1),
    v.maxLength(20)
  ),
  minIntervalMs: v.pipe(nonNegativeIntegerSchema, v.maxValue(60_000)),
  maxConcurrency: v.pipe(positiveIntegerSchema, v.maxValue(8)),
  maxRedirects: v.pipe(nonNegativeIntegerSchema, v.maxValue(5)),
  maxAttempts: v.pipe(positiveIntegerSchema, v.maxValue(5)),
  maxResponseBytes: v.pipe(positiveIntegerSchema, v.maxValue(20_000_000)),
  requestTimeoutMs: v.pipe(positiveIntegerSchema, v.maxValue(300_000)),
  operationRequestBudget: v.pipe(positiveIntegerSchema, v.maxValue(100))
})
export type SourceNetworkPolicy = v.InferOutput<typeof sourceNetworkPolicySchema>

export const sourceLimitsSchema = v.strictObject({
  pageSize: v.pipe(positiveIntegerSchema, v.maxValue(50_000)),
  maxPages: v.pipe(positiveIntegerSchema, v.maxValue(1000)),
  timeoutMs: v.pipe(positiveIntegerSchema, v.maxValue(300_000))
})
export type SourceLimits = v.InferOutput<typeof sourceLimitsSchema>

export const sourceManifestSchema = v.strictObject({
  manifestVersion: v.literal(1),
  sourceId: sourceIdSchema,
  displayName: nonEmptyText('Tên nguồn'),
  nativeNames: v.pipe(v.array(nonEmptyText('Tên bản địa')), v.maxLength(50)),
  aliases: v.pipe(v.array(nonEmptyText('Alias')), v.maxLength(50)),
  domains: v.pipe(v.array(nonEmptyText('Domain', 253)), v.maxLength(50)),
  countryCode: v.nullable(sourceCountryCodeSchema),
  languageTags: v.pipe(v.array(sourceLanguageSchema), v.minLength(1), v.maxLength(50)),
  capabilities: v.pipe(v.array(sourceCapabilitySchema), v.maxLength(SOURCE_CAPABILITIES.length)),
  health: v.optional(sourceHealthStateSchema),
  adapterVersion: sourceVersionSchema,
  apiVersion: sourceVersionSchema,
  dataVersion: positiveIntegerSchema,
  auth: v.picklist(['none', 'optional', 'required'] as const),
  origin: v.variant('kind', [
    v.strictObject({ kind: v.literal('builtin') }),
    v.strictObject({ kind: v.literal('package'), packageName: nonEmptyText('Tên package', 214) })
  ]),
  limits: sourceLimitsSchema,
  network: v.optional(sourceNetworkPolicySchema)
})
export type SourceManifest = v.InferOutput<typeof sourceManifestSchema>

export const SOURCE_BINDING_ROLES = ['primary', 'reference'] as const
export const sourceBindingRoleSchema = v.picklist(SOURCE_BINDING_ROLES)
export const sourceBindingSchema = v.strictObject({
  id: sourceOpaqueIdSchema,
  workId: sourceOpaqueIdSchema,
  sourceId: sourceIdSchema,
  adapterVersion: sourceVersionSchema,
  remoteWorkId: sourceOpaqueIdSchema,
  canonicalUrl: v.nullable(v.pipe(v.string(), v.url())),
  countryCode: v.nullable(sourceCountryCodeSchema),
  languageTag: sourceLanguageSchema,
  label: nonEmptyText('Nhãn binding'),
  role: sourceBindingRoleSchema,
  authProfileId: v.nullable(sourceOpaqueIdSchema),
  enabled: v.boolean(),
  checkpoint: v.nullable(sourceCursorSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})
export type SourceBinding = v.InferOutput<typeof sourceBindingSchema>

export const SOURCE_CATALOG_KINDS = ['chapter', 'volume', 'extra', 'unknown'] as const
export const sourceCatalogKindSchema = v.picklist(SOURCE_CATALOG_KINDS)
export const SOURCE_CONTENT_ACCESS_STATES = [
  'public',
  'login_required',
  'age_verification_required',
  'entitlement_required',
  'manual_intervention_required',
  'temporarily_unavailable',
  'parser_broken'
] as const
export const sourceContentAccessSchema = v.picklist(SOURCE_CONTENT_ACCESS_STATES)
export type SourceContentAccess = v.InferOutput<typeof sourceContentAccessSchema>

export const sourceCatalogItemSchema = v.strictObject({
  id: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  remoteChapterId: sourceOpaqueIdSchema,
  remoteUrl: v.nullable(v.pipe(v.string(), v.url())),
  chapterId: v.nullable(sourceOpaqueIdSchema),
  position: v.pipe(v.number(), v.finite()),
  title: nonEmptyText('Tên mục catalog', 1000),
  kind: sourceCatalogKindSchema,
  access: sourceContentAccessSchema,
  contentHash: v.nullable(v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/i))),
  firstSeenAt: timestampSchema,
  lastSeenAt: timestampSchema,
  missingStreak: nonNegativeIntegerSchema,
  removedAt: nullableTimestampSchema
})
export type SourceCatalogItem = v.InferOutput<typeof sourceCatalogItemSchema>

export const SOURCE_SYNC_TRIGGERS = ['manual', 'resume'] as const
export const SOURCE_SYNC_STATES = [
  'queued',
  'running',
  'waiting_user',
  'completed',
  'failed',
  'cancelled',
  'login_required',
  'adapter_missing'
] as const
export const SOURCE_SYNC_PHASES = [
  'queued',
  'identify',
  'metadata',
  'catalog',
  'diff',
  'commit',
  'done'
] as const
export const sourceSyncFailureSchema = v.strictObject({
  code: v.picklist([
    'cancelled',
    'login_required',
    'age_verification_required',
    'manual_intervention_required',
    'temporarily_unavailable',
    'parser_broken',
    'adapter_missing',
    'deadline_exceeded',
    'redirect_not_allowed',
    'redirect_limit_exceeded',
    'address_blocked',
    'origin_not_allowed',
    'response_too_large',
    'request_budget_exceeded',
    'unknown'
  ] as const),
  message: nonEmptyText('Lỗi sync', 2000),
  retryable: v.boolean()
})
export type SourceSyncFailure = v.InferOutput<typeof sourceSyncFailureSchema>

export const sourceSyncRunSchema = v.strictObject({
  id: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  trigger: v.picklist(SOURCE_SYNC_TRIGGERS),
  state: v.picklist(SOURCE_SYNC_STATES),
  adapterVersion: sourceVersionSchema,
  complete: v.boolean(),
  phase: v.picklist(SOURCE_SYNC_PHASES),
  processedCount: nonNegativeIntegerSchema,
  totalCount: v.nullable(nonNegativeIntegerSchema),
  failure: v.nullable(sourceSyncFailureSchema),
  startedAt: nullableTimestampSchema,
  finishedAt: nullableTimestampSchema,
  /** The source's update evidence matched the last complete check, so the catalog was not read. */
  unchanged: v.optional(v.boolean())
})
export type SourceSyncRun = v.InferOutput<typeof sourceSyncRunSchema>

export const SOURCE_UPDATE_KINDS = [
  'added',
  'renamed',
  'moved',
  'access_changed',
  'missing_remote',
  'reappeared',
  'raw_changed'
] as const
export const sourceUpdateKindSchema = v.picklist(SOURCE_UPDATE_KINDS)
export const sourceUpdateEventSchema = v.strictObject({
  id: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  catalogItemId: v.nullable(sourceOpaqueIdSchema),
  kind: sourceUpdateKindSchema,
  dedupeKey: nonEmptyText('Dedupe key', 1000),
  payload: v.nullable(v.record(v.string(), v.unknown())),
  detectedAt: timestampSchema,
  seenAt: nullableTimestampSchema,
  actedAt: nullableTimestampSchema
})
export type SourceUpdateEvent = v.InferOutput<typeof sourceUpdateEventSchema>

const pageLimitSchema = v.optional(
  v.pipe(positiveIntegerSchema, v.maxValue(MAX_SOURCE_PAGE_SIZE)),
  50
)
const optionalCursorSchema = v.optional(sourceCursorSchema)

export const sourceCatalogListInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: v.optional(sourceOpaqueIdSchema),
  cursor: optionalCursorSchema,
  limit: pageLimitSchema
})
export const sourceCatalogGetInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  itemId: sourceOpaqueIdSchema
})
export const sourceCatalogDownloadInputSchema = sourceCatalogGetInputSchema
export const sourceCatalogDownloadResultSchema = v.strictObject({
  chapterId: sourceOpaqueIdSchema,
  title: nonEmptyText('Tên chương', 1000)
})
export const sourceCatalogReorderInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema
})
export type SourceCatalogReorderInput = v.InferInput<typeof sourceCatalogReorderInputSchema>

export const sourceCatalogDownloadRangeInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  range: nonEmptyText('Dải chương', 500)
})
export type SourceCatalogDownloadRangeInput = v.InferInput<
  typeof sourceCatalogDownloadRangeInputSchema
>
export const sourceCatalogDownloadCancelInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema
})
export type SourceCatalogDownloadCancelInput = v.InferInput<
  typeof sourceCatalogDownloadCancelInputSchema
>
export const sourceDownloadSummarySchema = v.strictObject({
  /** `stopped`: the source became unavailable or needs age confirmation; the rest was not tried. */
  state: v.picklist(['completed', 'cancelled', 'stopped'] as const),
  downloaded: nonNegativeIntegerSchema,
  /** Already downloaded or not public, so not requested. */
  skipped: nonNegativeIntegerSchema,
  empty: v.array(nonEmptyText('Tên chương', 1000)),
  failed: v.array(v.strictObject({ title: nonEmptyText('Tên chương', 1000), message: v.string() })),
  stopReason: v.nullable(v.string())
})
export type SourceDownloadSummary = v.InferOutput<typeof sourceDownloadSummarySchema>

export const sourceCatalogPageSchema = v.strictObject({
  items: v.array(sourceCatalogItemSchema),
  nextCursor: v.nullable(sourceCursorSchema),
  exhausted: v.boolean()
})

export const sourceBindingsListInputSchema = v.strictObject({ workId: sourceOpaqueIdSchema })
export const sourceBindingIdentifyInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  candidate: nonEmptyText('Nguồn cần nhận diện', 4096)
})
export const sourceBindingIdentifyResultSchema = v.strictObject({
  source: sourceDescriptorSchema,
  remoteWorkId: sourceOpaqueIdSchema,
  canonicalUrl: v.pipe(v.string(), v.url()),
  inputRemoteChapterId: v.nullable(sourceOpaqueIdSchema)
})
export type SourceBindingIdentifyResult = v.InferOutput<typeof sourceBindingIdentifyResultSchema>
export const sourceBindingPreviewCreateInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  sourceId: sourceIdSchema,
  remoteWorkId: sourceOpaqueIdSchema,
  canonicalUrl: v.optional(v.nullable(v.pipe(v.string(), v.url()))),
  inputRemoteChapterId: v.optional(v.nullable(sourceOpaqueIdSchema)),
  authProfileId: v.optional(v.nullable(sourceOpaqueIdSchema))
})
export const sourceBindingPreviewSampleSchema = v.strictObject({
  remoteChapterId: sourceOpaqueIdSchema,
  title: nonEmptyText('Tên mục catalog', 1000),
  position: v.pipe(v.number(), v.finite())
})
export const sourceBindingPreviewSchema = v.strictObject({
  previewId: sourceOpaqueIdSchema,
  expiresAt: timestampSchema,
  workId: sourceOpaqueIdSchema,
  sourceId: sourceIdSchema,
  remoteWorkId: sourceOpaqueIdSchema,
  canonicalUrl: v.nullable(v.pipe(v.string(), v.url())),
  inputRemoteChapterId: v.nullable(sourceOpaqueIdSchema),
  title: nonEmptyText('Tên tác phẩm', 1000),
  author: v.nullable(nonEmptyText('Tác giả', 1000)),
  description: v.nullable(v.pipe(v.string(), v.maxLength(20_000))),
  /** Site within the source, e.g. Nocturne for an R18 Syosetu work. */
  siteName: v.optional(v.nullable(nonEmptyText('Tên site', 200))),
  languageTag: sourceLanguageSchema,
  totalCount: nonNegativeIntegerSchema,
  matchedCount: nonNegativeIntegerSchema,
  unmatchedCount: nonNegativeIntegerSchema,
  errorCount: nonNegativeIntegerSchema,
  warnings: v.pipe(v.array(nonEmptyText('Cảnh báo', 2000)), v.maxLength(50)),
  sample: v.pipe(v.array(sourceBindingPreviewSampleSchema), v.maxLength(20))
})
export type SourceBindingPreview = v.InferOutput<typeof sourceBindingPreviewSchema>
export const sourceBindingCreateInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  sourceId: sourceIdSchema,
  remoteWorkId: sourceOpaqueIdSchema,
  languageTag: sourceLanguageSchema,
  label: nonEmptyText('Nhãn binding'),
  role: sourceBindingRoleSchema,
  authProfileId: v.optional(v.nullable(sourceOpaqueIdSchema)),
  expectedPreviewId: sourceOpaqueIdSchema
})
export const sourceBindingUpdateInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  patch: v.strictObject({
    label: v.optional(nonEmptyText('Nhãn binding')),
    role: v.optional(sourceBindingRoleSchema),
    authProfileId: v.optional(v.nullable(sourceOpaqueIdSchema)),
    enabled: v.optional(v.boolean())
  })
})
export const sourceBindingDeleteInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  confirmed: v.boolean()
})

export const sourceSyncStartInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  /** Read the whole catalog even when the source's cheap update check reports no change. */
  full: v.optional(v.boolean())
})
export const sourceSyncCancelInputSchema = v.strictObject({ runId: sourceOpaqueIdSchema })
export const sourceSyncStatusInputSchema = v.strictObject({ runId: sourceOpaqueIdSchema })
export const sourceSyncProgressSchema = v.strictObject({
  runId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  phase: v.picklist(SOURCE_SYNC_PHASES),
  processedCount: nonNegativeIntegerSchema,
  totalCount: v.nullable(nonNegativeIntegerSchema)
})

export const sourceUpdatesListInputSchema = v.strictObject({
  workId: v.optional(sourceOpaqueIdSchema),
  bindingId: v.optional(sourceOpaqueIdSchema),
  unseenOnly: v.optional(v.boolean(), false),
  cursor: optionalCursorSchema,
  limit: pageLimitSchema
})
export const sourceUpdatesPageSchema = v.strictObject({
  items: v.array(sourceUpdateEventSchema),
  nextCursor: v.nullable(sourceCursorSchema),
  exhausted: v.boolean()
})
export const sourceUpdateMarkSeenInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  eventIds: v.pipe(v.array(sourceOpaqueIdSchema), v.minLength(1), v.maxLength(200))
})
export const sourceUpdatePreviewApplyInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  eventId: sourceOpaqueIdSchema
})
export const sourceUpdateApplyInputSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  eventId: sourceOpaqueIdSchema,
  expectedRev: nonNegativeIntegerSchema,
  expectedPreviewId: sourceOpaqueIdSchema
})

export type SourceCatalogListInput = v.InferInput<typeof sourceCatalogListInputSchema>
export type SourceCatalogGetInput = v.InferInput<typeof sourceCatalogGetInputSchema>
export type SourceCatalogDownloadInput = v.InferInput<typeof sourceCatalogDownloadInputSchema>
export type SourceCatalogDownloadResult = v.InferOutput<typeof sourceCatalogDownloadResultSchema>
export type SourceCatalogPage = v.InferOutput<typeof sourceCatalogPageSchema>
export type SourceBindingsListInput = v.InferInput<typeof sourceBindingsListInputSchema>
export type SourceBindingIdentifyInput = v.InferInput<typeof sourceBindingIdentifyInputSchema>
export type SourceBindingPreviewCreateInput = v.InferInput<
  typeof sourceBindingPreviewCreateInputSchema
>
export type SourceBindingCreateInput = v.InferInput<typeof sourceBindingCreateInputSchema>
export type SourceBindingUpdateInput = v.InferInput<typeof sourceBindingUpdateInputSchema>
export type SourceBindingDeleteInput = v.InferInput<typeof sourceBindingDeleteInputSchema>
export type SourceSyncStartInput = v.InferInput<typeof sourceSyncStartInputSchema>
export type SourceSyncCancelInput = v.InferInput<typeof sourceSyncCancelInputSchema>
export type SourceSyncStatusInput = v.InferInput<typeof sourceSyncStatusInputSchema>
export type SourceSyncProgress = v.InferOutput<typeof sourceSyncProgressSchema>
export const sourceDownloadProgressSchema = v.strictObject({
  workId: sourceOpaqueIdSchema,
  bindingId: sourceOpaqueIdSchema,
  current: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema,
  itemTitle: v.string()
})
export type SourceDownloadProgress = v.InferOutput<typeof sourceDownloadProgressSchema>
export type SourceUpdatesListInput = v.InferInput<typeof sourceUpdatesListInputSchema>
export type SourceUpdatesPage = v.InferOutput<typeof sourceUpdatesPageSchema>
export type SourceUpdateMarkSeenInput = v.InferInput<typeof sourceUpdateMarkSeenInputSchema>
export type SourceUpdatePreviewApplyInput = v.InferInput<typeof sourceUpdatePreviewApplyInputSchema>
export type SourceUpdateApplyInput = v.InferInput<typeof sourceUpdateApplyInputSchema>

export const sourceRegistryListInputSchema = v.optional(
  v.strictObject({
    text: v.optional(v.string()),
    countryGroup: v.optional(v.picklist(['CN', 'JP', 'KR', 'other'] as const)),
    languageTag: v.optional(v.string()),
    capability: v.optional(sourceCapabilitySchema),
    health: v.optional(sourceHealthStateSchema)
  }),
  {}
)
export type SourceRegistryListInput = v.InferInput<typeof sourceRegistryListInputSchema>

/** The user's 18+ confirmation that gates R18 sources; stored as an application preference. */
export const sourceAgeSetInputSchema = v.strictObject({ confirmed: v.boolean() })
export type SourceAgeSetInput = v.InferInput<typeof sourceAgeSetInputSchema>
