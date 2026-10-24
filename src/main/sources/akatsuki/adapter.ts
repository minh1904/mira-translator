import type { NetworkBroker } from '../broker'
import type {
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
  inlineText,
  isElement,
  parseHtml,
  sha256,
  walk,
  type ChildNode,
  type Element
} from '../html'
import { fetchText, SourceAccessError } from '../http'
import type { NetworkSource } from '../networkSources'

export const AKATSUKI_SOURCE_ID = 'mira.jp.akatsuki' as const
const ORIGIN = 'https://www.akatsuki-novels.com'
const PRIVATE_NOTICE = 'この作品は作者の諸事情により非公開にしています'
const PAGING = /Page (\d+) of (\d+), showing \d+ records out of (\d+) total/
const DIVIDER = '＊＊＊'

export const akatsukiManifest: SourceManifest = {
  manifestVersion: 1,
  sourceId: AKATSUKI_SOURCE_ID,
  displayName: '暁 (Akatsuki)',
  nativeNames: ['暁'],
  aliases: ['akatsuki', 'akatsuki-novels'],
  domains: ['www.akatsuki-novels.com'],
  adapterVersion: '1.0.0',
  apiVersion: '1.0.0',
  dataVersion: 1,
  countryCode: 'JP',
  languageTags: ['ja'],
  capabilities: ['identify', 'work', 'catalog', 'chapter'],
  auth: 'none',
  origin: { kind: 'builtin' },
  // 20 episodes per TOC page: 200 pages cover about 4000 episodes.
  limits: { maxPages: 200, pageSize: 20, timeoutMs: 300_000 },
  health: 'unchecked',
  // The site mixes adult and general works on one origin, so every request needs the age cookie.
  adult: true,
  networkPolicy: {
    origins: [ORIGIN],
    minIntervalMs: 1000,
    maxConcurrency: 1,
    maxRedirects: 5,
    maxAttempts: 1,
    maxResponseBytes: 8 * 1024 * 1024,
    requestTimeoutMs: 15_000,
    operationRequestBudget: 202,
    burstPause: { every: 10, ms: 5000 },
    ageCookies: { [ORIGIN]: 'CakeCookie[ALLOWED_ADULT_NOVEL]=on' }
  }
}

export function identifyAkatsuki(input: string): SourceIdentity | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'www.akatsuki-novels.com') return null
  if (url.username || url.password || (url.port !== '' && url.port !== '443')) return null
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '')
  const index = /^\/stories\/index\/novel_id~([1-9]\d*)(?:\/page~\d+)?$/.exec(path)
  const view = /^\/stories\/view\/([1-9]\d*)\/novel_id~([1-9]\d*)$/.exec(path)
  const workId = index?.[1] ?? view?.[2]
  if (!workId) return null
  return {
    remoteWorkId: workId,
    canonicalUrl: `${ORIGIN}/stories/index/novel_id~${workId}`,
    ...(view ? { inputRemoteChapterId: view[1] } : {})
  }
}

/** All line breaks on this site are `<br>`; raw newlines in the source are formatting only. */
function parsePage(html: string): ChildNode[] {
  if (html.includes(PRIVATE_NOTICE)) {
    throw new SourceAccessError('not_found', 'Tác phẩm Akatsuki đang ở chế độ không công khai')
  }
  return parseHtml(html.replace(/\r?\n/g, ''))
}

const clean = (text: string) => text.replace(/ /g, ' ').trim()

export function parseAkatsukiWork(html: string, workId: string): WorkInfo {
  const nodes = parsePage(html)
  let title: string | undefined
  let author: string | undefined
  for (const node of walk(nodes)) {
    if (!isElement(node) || node.tagName !== 'a') continue
    if (title === undefined && attr(node, 'id') === 'LookNovel')
      title = clean(inlineText(node.childNodes))
    if (author === undefined && /^\/users\/view\/\d+$/.test(attr(node, 'href') ?? '')) {
      author = clean(inlineText(node.childNodes))
    }
  }
  if (!title) throw new Error('Không tìm thấy tên tác phẩm Akatsuki (parser_broken)')
  // Synopsis: the plain `<div>` inside the inner `body-w640` box (the outer box also has class `story`).
  const box = findAllByClass(nodes, 'body-w640').find(
    (el) => !/\bstory\b/.test(attr(el, 'class') ?? '')
  )
  const synopsis = box?.childNodes.filter(isElement).find((child) => child.tagName === 'div')
  const description = synopsis ? clean(inlineText(synopsis.childNodes)) : ''
  return {
    remoteWorkId: workId,
    title,
    languageTag: 'ja',
    ...(author ? { author } : {}),
    ...(description ? { description } : {})
  }
}

export interface AkatsukiTocPage {
  items: { remoteChapterId: string; title: string; volumeTitle?: string }[]
  /** Absent when the whole catalog fits on one page. */
  paging?: { page: number; lastPage: number; total: number }
}

export function parseAkatsukiToc(
  html: string,
  workId: string,
  volumeTitle?: string
): AkatsukiTocPage {
  const nodes = parsePage(html)
  const table = findFirstByClass(nodes, 'list')
  if (!table) throw new Error('Không tìm thấy mục lục Akatsuki (parser_broken)')
  const items: AkatsukiTocPage['items'] = []
  let currentVolume = volumeTitle
  for (const node of walk(table.childNodes)) {
    if (!isElement(node)) continue
    if (node.tagName === 'td' && attr(node, 'colspan') === '2') {
      currentVolume = clean(inlineText(node.childNodes)) || undefined
    } else if (node.tagName === 'a') {
      const match = new RegExp(`^/stories/view/(\\d+)/novel_id~${workId}$`).exec(
        attr(node, 'href') ?? ''
      )
      if (!match) continue
      items.push({
        remoteChapterId: match[1],
        title: clean(inlineText(node.childNodes)),
        ...(currentVolume ? { volumeTitle: currentVolume } : {})
      })
    }
  }
  const pagingText = PAGING.exec(inlineText(nodes))
  if (!pagingText) {
    if (findFirstByClass(nodes, 'paging-top')) {
      throw new Error('Không đọc được số trang mục lục Akatsuki (parser_broken)')
    }
    return { items }
  }
  return {
    items,
    paging: {
      page: Number(pagingText[1]),
      lastPage: Number(pagingText[2]),
      total: Number(pagingText[3])
    }
  }
}

/** Preface, body and afterword in reading order; throws when the body block is missing. */
export function parseAkatsukiEpisode(html: string): string {
  const nodes = parsePage(html)
  const parts: { kind: 'preface' | 'body' | 'afterword'; text: string }[] = []
  for (const block of findAllByClass(nodes, 'body-novel')) {
    const siblings = block.parentNode ? (block.parentNode as Element).childNodes : []
    const label = siblings.slice(0, siblings.indexOf(block)).filter(isElement).at(-1)
    const labelText = label && label.tagName === 'div' ? inlineText(label.childNodes) : ''
    const kind = labelText.includes('前書き')
      ? 'preface'
      : labelText.includes('後書き')
        ? 'afterword'
        : 'body'
    const text = inlineText(block.childNodes)
      .replace(/[ \s]+$/, '')
      .replace(/^\n+/, '')
    parts.push({ kind, text })
  }
  if (!parts.some((part) => part.kind === 'body')) {
    throw new Error('Không tìm thấy nội dung tập Akatsuki (parser_broken)')
  }
  return parts
    .map((part) => part.text)
    .filter((text) => text.trim() !== '')
    .join(`\n\n${DIVIDER}\n\n`)
}

export function createAkatsukiAdapter(broker: NetworkBroker): NovelSourceAdapter {
  const indexUrl = (workId: string, page = 1) =>
    `${ORIGIN}/stories/index/novel_id~${workId}${page > 1 ? `/page~${page}` : ''}`

  return {
    manifest: akatsukiManifest,

    async getWork(input, context) {
      return parseAkatsukiWork(
        await fetchText(broker, indexUrl(input.remoteWorkId), context.signal),
        input.remoteWorkId
      )
    },

    // Cursor `<page>:<itemsSoFar>:<volumeTitle>` carries state across TOC pages.
    async getCatalog(input, context): Promise<CatalogPage> {
      const workId = input.remoteWorkId
      const [pageText, offsetText, ...volume] = (input.cursor ?? '1:0:').split(':')
      const page = Number(pageText)
      const offset = Number(offsetText)
      const html = await fetchText(broker, indexUrl(workId, page), context.signal)
      const toc = parseAkatsukiToc(html, workId, volume.join(':') || undefined)
      const items: CatalogItem[] = toc.items.map((item, index) => ({
        ...item,
        order: offset + index + 1,
        access: 'public'
      }))
      if (toc.paging && toc.paging.page !== page) {
        throw new Error('Trang mục lục Akatsuki không khớp số trang (parser_broken)')
      }
      if (toc.paging && page < toc.paging.lastPage) {
        const lastVolume = items.at(-1)?.volumeTitle ?? volume.join(':')
        return {
          remoteWorkId: workId,
          items,
          nextCursor: `${page + 1}:${offset + items.length}:${lastVolume}`,
          exhausted: false,
          complete: true
        }
      }
      return {
        remoteWorkId: workId,
        items,
        exhausted: true,
        complete: !toc.paging || offset + items.length === toc.paging.total
      }
    },

    async getChapter(input, context): Promise<ChapterPage> {
      const html = await fetchText(
        broker,
        `${ORIGIN}/stories/view/${input.remoteChapterId}/novel_id~${input.remoteWorkId}`,
        context.signal
      )
      const text = parseAkatsukiEpisode(html)
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

export const akatsukiSource: NetworkSource = {
  manifest: akatsukiManifest,
  identify: identifyAkatsuki,
  canonicalUrl: (workId) => `${ORIGIN}/stories/index/novel_id~${workId}`,
  createAdapter: createAkatsukiAdapter
}
