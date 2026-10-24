import type { NetworkBroker } from './broker'
import type { NovelSourceAdapter, SourceIdentity, SourceManifest } from './domain'
import { akatsukiSource } from './akatsuki/adapter'
import { kakuyomuSource } from './kakuyomu/adapter'
import { syosetuR18Source, syosetuSource } from './syosetu/adapter'

/** A network source Mira ships: its manifest, offline URL identification and adapter factory. */
export interface NetworkSource {
  manifest: SourceManifest
  identify(url: string): SourceIdentity | null
  canonicalUrl(remoteWorkId: string): string
  createAdapter(broker: NetworkBroker): NovelSourceAdapter
}

export const NETWORK_SOURCES: NetworkSource[] = [
  kakuyomuSource,
  syosetuSource,
  syosetuR18Source,
  akatsukiSource
]

export function findNetworkSource(sourceId: string): NetworkSource | undefined {
  return NETWORK_SOURCES.find((source) => source.manifest.sourceId === sourceId)
}

/** First registered source whose offline identification accepts the URL. */
export function identifyNetworkUrl(
  url: string
): { source: NetworkSource; identity: SourceIdentity } | null {
  for (const source of NETWORK_SOURCES) {
    const identity = source.identify(url)
    if (identity) return { source, identity }
  }
  return null
}
