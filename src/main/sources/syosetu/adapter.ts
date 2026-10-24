import type { NetworkBroker } from '../broker'
import type {
  AdapterContext,
  CatalogItem,
  CatalogPage,
  ChapterPage,
  NovelSourceAdapter,
  SourceIdentity,
  SourceManifest,
  WorkInfo
} from '../domain'
import {
  attr,
  findAllByClass,
  findFirstByClass,
  hasClass,
  inlineText,
  isElement,
  parseHtml,
  sha256,
  walk
} from '../html'
import { fetchText, SourceAccessError } from '../http'
import type { NetworkSource } from '../networkSources'

interface SyosetuVariant {
  sourceId: string
  displayName: string
  nativeName: string
  host: string
  api: string
  adult: boolean
}

const GENERAL: SyosetuVariant = {
  sourceId: 'mira.jp.syosetu',
  displayName: '小説家になろう (Syosetu)',
  nativeName: '小説家になろう',
  host: 'ncode.syosetu.com',
  api: 'https://api.syosetu.com/novelapi/api/',
  adult: false
}

const R18: SyosetuVariant = {
  sourceId: 'mira.jp.syosetu.r18',
  displayName: 'ノクターン・ムーンライト (Syosetu R18)',
  nativeName: 'ノクターンノベルズ',
  host: 'novel18.syosetu.com',
  api: 'https://api.syosetu.com/novel18api/api/',
  adult: true
}

const NCODE = /^n\d+[a-z]+$/
const NOCGENRE_SITES: Record<number, string> = {
  1: 'Nocturne',
  2: 'Moonlight',
  3: 'Moonlight',
  4: 'Midnight'
}
const DIVIDER = '＊＊＊'

export interface SyosetuApiWork {
  ncode: string
  title: string
  writer: string
  story: string
  noveltype: number
  general_all_no: number
  general_lastup: string
  nocgenre?: number
}

export function identifySyosetu(input: string, host: string): SourceIdentity | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== host) return null
  if (url.username || url.password || (url.port !== '' && url.port !== '443')) return null
  const [ncodeRaw, episode, ...rest] = url.pathname.split('/').filter(Boolean)
  const ncode = ncodeRaw?.toLowerCase()
  if (!ncode || !NCODE.test(ncode) || rest.length > 0) return null
  if (episode !== undefined && !/^[1-9]\d*$/.test(episode)) return null
  return {
    remoteWorkId: ncode,
    canonicalUrl: `https://${host}/${ncode}/`,
    ...(episode ? { inputRemoteChapterId: episode } : {})
  }
}

/** The single work entry of a novel API response, or null when the API has no such ncode. */
export function parseSyosetuApi(json: string, ncode: string): SyosetuApiWork | null {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('API Syosetu trả về dữ liệu không đúng dạng')
  const entry = parsed[1] as Partial<SyosetuApiWork> | undefined
  if (!entry || typeof entry.ncode !== 'string' || entry.ncode.toLowerCase() !== ncode) return null
  if (typeof entry.title !== 'string' || typeof entry.general_all_no !== 'number') {
    throw new Error('API Syosetu thiếu tên hoặc số tập')
  }
  return entry as SyosetuApiWork
}

export interface SyosetuTocPage {
  items: { remoteChapterId: string; title: string; volumeTitle?: string }[]
  lastPage: number
}

/** One table-of-contents page; `volumeTitle` carries over from the previous page's last heading. */
export function parseSyosetuToc(html: string, ncode: string, volumeTitle?: string): SyosetuTocPage {
  const nodes = parseHtml(html)
  const list = findFirstByClass(nodes, 'p-eplist')
  if (!list) throw new Error('Không tìm thấy mục lục Syosetu (parser_broken)')
  const items: SyosetuTocPage['items'] = []
  let currentVolume = volumeTitle
  for (const node of walk(list.childNodes)) {
    if (hasClass(node, 'p-eplist__chapter-title')) {
      currentVolume = inlineText(node.childNodes).trim() || undefined
    } else if (hasClass(node, 'p-eplist__subtitle')) {
      const match = new RegExp(`^/${ncode}/(\\d+)/?$`, 'i').exec(attr(node, 'href') ?? '')
      if (!match) throw new Error('Liên kết tập Syosetu không đúng dạng (parser_broken)')
      items.push({
        remoteChapterId: match[1],
        title: inlineText(node.childNodes).trim(),
        ...(currentVolume ? { volumeTitle: currentVolume } : {})
      })
    }
  }
  const last = findAllByClass(nodes, 'c-pager__item--last')[0]
  const pageMatch = /[?&]p=(\d+)/.exec((last && attr(last, 'href')) ?? '')
  return { items, lastPage: pageMatch ? Number(pageMatch[1]) : 1 }
}

/** Preface, body and afterword in reading order; throws when the body block is missing. */
export function parseSyosetuEpisode(html: string): string {
  const body = findFirstByClass(parseHtml(html), 'p-novel__body')
  const blocks = body ? findAllByClass(body.childNodes, 'p-novel__text') : []
  if (!blocks.some((block) => !/--(preface|afterword)\b/.test(attr(block, 'class') ?? ''))) {
    throw new Error('Không tìm thấy nội dung tập Syosetu (parser_broken)')
  }
  return blocks
    .map((block) =>
      block.childNodes
        .filter((child) => isElement(child) && child.tagName === 'p')
        // A blank line is `<p><br /></p>`; drop the `<br>` newline so it joins as one empty line.
        .map((p) => (isElement(p) ? inlineText(p.childNodes).replace(/\n$/, '') : ''))
        .join('\n')
        .replace(/\n+$/, '')
    )
    .filter((text) => text.trim() !== '')
    .join(`\n\n${DIVIDER}\n\n`)
}

function manifestFor(variant: SyosetuVariant): SourceManifest {
  const origin = `https://${variant.host}`
  return {
    manifestVersion: 1,
    sourceId: variant.sourceId,
    displayName: variant.displayName,
    nativeNames: [variant.nativeName],
    aliases: variant.adult ? ['nocturne', 'moonlight', 'novel18'] : ['syosetu', 'narou', 'なろう'],
    domains: [variant.host],
    adapterVersion: '1.0.0',
    apiVersion: '1.0.0',
    dataVersion: 1,
    countryCode: 'JP',
    languageTags: ['ja'],
    capabilities: ['identify', 'work', 'catalog', 'chapter'],
    auth: 'none',
    origin: { kind: 'builtin' },
    limits: { maxPages: 100, pageSize: 100, timeoutMs: 180_000 },
    health: 'unchecked',
    ...(variant.adult ? { adult: true } : {}),
    networkPolicy: {
      origins: [origin, 'https://api.syosetu.com'],
      minIntervalMs: 1000,
      maxConcurrency: 1,
      maxRedirects: 5,
      maxAttempts: 1,
      maxResponseBytes: 8 * 1024 * 1024,
      requestTimeoutMs: 15_000,
      operationRequestBudget: 102,
      burstPause: { every: 10, ms: 5000 },
      ...(variant.adult ? { ageCookies: { [origin]: 'over18=yes' } } : {})
    }
  }
}

function createSyosetuAdapter(
  variant: SyosetuVariant,
  manifest: SourceManifest,
  broker: NetworkBroker
): NovelSourceAdapter {
  const origin = `https://${variant.host}`

  const apiWork = async (ncode: string, signal: AbortSignal) => {
    // No `gzip`: the broker hands back raw bytes and the response is small.
    const fields = variant.adult ? 't-w-s-nt-ga-gl-ng-n' : 't-w-s-nt-ga-gl-n'
    const json = await fetchText(
      broker,
      `${variant.api}?out=json&ncode=${ncode}&of=${fields}`,
      signal
    )
    const work = parseSyosetuApi(json, ncode)
    if (!work) throw new SourceAccessError('not_found', 'Syosetu không có tác phẩm này')
    return work
  }

  return {
    manifest,

    async getWork(input, context): Promise<WorkInfo> {
      const work = await apiWork(input.remoteWorkId, context.signal)
      const siteName = work.nocgenre !== undefined ? NOCGENRE_SITES[work.nocgenre] : undefined
      return {
        remoteWorkId: input.remoteWorkId,
        title: work.title,
        languageTag: 'ja',
        author: work.writer || undefined,
        description: work.story || undefined,
        ...(siteName ? { siteName } : {})
      }
    },

    async getUpdateFingerprint(input, context) {
      const work = await apiWork(input.remoteWorkId, context.signal)
      return `${work.general_all_no}|${work.general_lastup}`
    },

    // Cursor `<page>:<apiCount>:<itemsSoFar>:<volumeTitle>` carries state across TOC pages.
    async getCatalog(input, context: AdapterContext): Promise<CatalogPage> {
      const ncode = input.remoteWorkId
      let page = 1
      let expected: number
      let offset = 0
      let volumeTitle: string | undefined
      if (input.cursor) {
        const [pageText, countText, offsetText, ...volume] = input.cursor.split(':')
        page = Number(pageText)
        expected = Number(countText)
        offset = Number(offsetText)
        volumeTitle = volume.join(':') || undefined
      } else {
        const work = await apiWork(ncode, context.signal)
        if (work.noveltype === 2) {
          return {
            remoteWorkId: ncode,
            items: [{ remoteChapterId: '1', title: work.title, order: 1, access: 'public' }],
            exhausted: true,
            complete: true
          }
        }
        expected = work.general_all_no
      }
      const html = await fetchText(broker, `${origin}/${ncode}/?p=${page}`, context.signal)
      const toc = parseSyosetuToc(html, ncode, volumeTitle)
      const items: CatalogItem[] = toc.items.map((item, index) => ({
        ...item,
        order: offset + index + 1,
        access: 'public'
      }))
      if (page < toc.lastPage) {
        const lastVolume = items.at(-1)?.volumeTitle ?? volumeTitle ?? ''
        return {
          remoteWorkId: ncode,
          items,
          nextCursor: `${page + 1}:${expected}:${offset + items.length}:${lastVolume}`,
          exhausted: false,
          complete: true
        }
      }
      // An API count that disagrees (lag, removed episodes) keeps the snapshot from proving removals.
      return {
        remoteWorkId: ncode,
        items,
        exhausted: true,
        complete: offset + items.length === expected
      }
    },

    async getChapter(input, context): Promise<ChapterPage> {
      const base = `${origin}/${input.remoteWorkId}/`
      let html: string
      try {
        html = await fetchText(broker, `${base}${input.remoteChapterId}/`, context.signal)
      } catch (error) {
        // A short story has no episode pages; its only item `1` is the work page body.
        if (!(error instanceof SourceAccessError && error.code === 'not_found')) throw error
        if (input.remoteChapterId !== '1') throw error
        html = await fetchText(broker, base, context.signal)
      }
      const text = parseSyosetuEpisode(html)
      const hash = sha256(text)
      return {
        remoteChapterId: input.remoteChapterId,
        text,
        contentHash: hash,
        payloadHash: hash,
        normalizationVersion: 1
      }
    }
  }
}

function sourceFor(variant: SyosetuVariant): NetworkSource {
  const manifest = manifestFor(variant)
  return {
    manifest,
    identify: (url) => identifySyosetu(url, variant.host),
    canonicalUrl: (ncode) => `https://${variant.host}/${ncode}/`,
    createAdapter: (broker) => createSyosetuAdapter(variant, manifest, broker)
  }
}

export const syosetuSource = sourceFor(GENERAL)
export const syosetuR18Source = sourceFor(R18)
