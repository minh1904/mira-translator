import type { SourceCapability, SourceHealth, SourceManifest } from './domain'

const CAPABILITIES = new Set<SourceCapability>([
  'identify',
  'work',
  'catalog',
  'chapter',
  'session'
])
const HEALTH = new Set<SourceHealth>(['healthy', 'degraded', 'broken', 'inconclusive', 'unchecked'])
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const SOURCE_ID = /^mira\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const COUNTRY_CODE = /^[A-Z]{2}$/

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestValidationError'
  }
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ManifestValidationError(message)
}

function isLanguageTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

export function validateManifest(manifest: SourceManifest): SourceManifest {
  requireCondition(manifest.manifestVersion === 1, 'unsupported manifestVersion')
  requireCondition(SOURCE_ID.test(manifest.sourceId), 'invalid sourceId')
  requireCondition(manifest.displayName.trim().length > 0, 'displayName is required')
  requireCondition(SEMVER.test(manifest.adapterVersion), 'invalid adapterVersion')
  requireCondition(SEMVER.test(manifest.apiVersion), 'invalid apiVersion')
  requireCondition(
    Number.isSafeInteger(manifest.dataVersion) && manifest.dataVersion > 0,
    'invalid dataVersion'
  )
  requireCondition(COUNTRY_CODE.test(manifest.countryCode), 'invalid countryCode')
  requireCondition(
    manifest.languageTags.length > 0 && manifest.languageTags.every(isLanguageTag),
    'invalid languageTags'
  )
  requireCondition(
    manifest.capabilities.length > 0 &&
      manifest.capabilities.every((item) => CAPABILITIES.has(item)),
    'invalid capabilities'
  )
  requireCondition(
    manifest.auth === 'none' || manifest.auth === 'optional' || manifest.auth === 'required',
    'invalid auth mode'
  )
  if (manifest.origin.kind === 'package') {
    requireCondition(
      manifest.origin.packageName.startsWith('@mira/source-'),
      'adapter is not an official Mira package'
    )
  }
  requireCondition(
    Number.isSafeInteger(manifest.limits.maxPages) && manifest.limits.maxPages > 0,
    'invalid page limit'
  )
  requireCondition(
    Number.isSafeInteger(manifest.limits.pageSize) && manifest.limits.pageSize > 0,
    'invalid page size'
  )
  requireCondition(
    Number.isSafeInteger(manifest.limits.timeoutMs) && manifest.limits.timeoutMs > 0,
    'invalid timeout'
  )
  requireCondition(manifest.health === undefined || HEALTH.has(manifest.health), 'invalid health')
  if (manifest.networkPolicy !== undefined) {
    requireCondition(
      Array.isArray(manifest.networkPolicy.origins) && manifest.networkPolicy.origins.length > 0,
      'invalid network origins'
    )
    requireCondition(
      Number.isSafeInteger(manifest.networkPolicy.minIntervalMs) &&
        manifest.networkPolicy.minIntervalMs >= 0,
      'invalid minIntervalMs'
    )
    requireCondition(
      Number.isSafeInteger(manifest.networkPolicy.maxConcurrency) &&
        manifest.networkPolicy.maxConcurrency > 0,
      'invalid maxConcurrency'
    )
    const pause = manifest.networkPolicy.burstPause
    requireCondition(
      pause === undefined ||
        (Number.isSafeInteger(pause.every) &&
          pause.every > 0 &&
          Number.isSafeInteger(pause.ms) &&
          pause.ms >= 0),
      'invalid burstPause'
    )
    for (const origin of Object.keys(manifest.networkPolicy.ageCookies ?? {})) {
      requireCondition(
        manifest.networkPolicy.origins.includes(origin),
        'ageCookies origin is not declared'
      )
    }
  }
  return manifest
}
