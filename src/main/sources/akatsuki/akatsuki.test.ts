import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NetworkBroker } from '../broker'
import { validateManifest } from '../manifest'
import { AdapterRuntime } from '../runtime'
import {
  akatsukiManifest,
  akatsukiSource,
  identifyAkatsuki,
  parseAkatsukiEpisode,
  parseAkatsukiWork
} from './adapter'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8')
const BASE = 'https://www.akatsuki-novels.com'
const context = { signal: new AbortController().signal, now: () => new Date() }

function fakeBroker(routes: Record<string, string>) {
  return {
    request: async ({ url }: { url: string }) => {
      const body = routes[url]
      return {
        status: body === undefined ? 404 : 200,
        headers: {},
        body: new TextEncoder().encode(body ?? '')
      }
    }
  } as unknown as NetworkBroker
}

describe('Akatsuki adapter', () => {
  it('identifies index and episode URLs by numeric IDs', () => {
    expect(identifyAkatsuki(`${BASE}/stories/index/novel_id~1234`)).toEqual({
      remoteWorkId: '1234',
      canonicalUrl: `${BASE}/stories/index/novel_id~1234`
    })
    expect(identifyAkatsuki(`${BASE}/stories/view/98765/novel_id~1234`)).toMatchObject({
      remoteWorkId: '1234',
      inputRemoteChapterId: '98765'
    })
    expect(identifyAkatsuki(`${BASE}/stories/index/novel_id%7E1234/page~3`)?.remoteWorkId).toBe(
      '1234'
    )
    for (const url of [
      'http://www.akatsuki-novels.com/stories/index/novel_id~1234',
      'https://akatsuki-novels.com/stories/index/novel_id~1234',
      `${BASE}/novels/view/1234`,
      `${BASE}/stories/index/novel_id~abc`
    ]) {
      expect(identifyAkatsuki(url)).toBeNull()
    }
  })

  it('declares an adult manifest with the age cookie and burst pause', () => {
    expect(() => validateManifest(akatsukiManifest)).not.toThrow()
    expect(akatsukiManifest.adult).toBe(true)
    expect(akatsukiManifest.networkPolicy?.ageCookies).toEqual({
      [BASE]: 'CakeCookie[ALLOWED_ADULT_NOVEL]=on'
    })
  })

  it('reads metadata and refuses a private work', () => {
    expect(parseAkatsukiWork(fixture('index-page1.html'), '1234')).toEqual({
      remoteWorkId: '1234',
      title: 'テスト作品',
      languageTag: 'ja',
      author: '作者名',
      description: '一行目のあらすじ。\n二行目。'
    })
    expect(() => parseAkatsukiWork(fixture('private.html'), '1234')).toThrow(/không công khai/)
  })

  it('reads every catalog page with headings and checks the total', async () => {
    const routes = {
      [`${BASE}/stories/index/novel_id~1234`]: fixture('index-page1.html'),
      [`${BASE}/stories/index/novel_id~1234/page~2`]: fixture('index-page2.html')
    }
    const catalog = await new AdapterRuntime(
      akatsukiSource.createAdapter(fakeBroker(routes))
    ).getCatalog({ remoteWorkId: '1234' })
    expect(catalog.complete).toBe(true)
    expect(
      catalog.items.map((item) => [item.remoteChapterId, item.order, item.volumeTitle])
    ).toEqual([
      ['101', 1, '第一部'],
      ['105', 2, '第一部'],
      ['230', 3, '第一部']
    ])

    const short = await new AdapterRuntime(
      akatsukiSource.createAdapter(
        fakeBroker({ [`${BASE}/stories/index/novel_id~77`]: fixture('index-single.html') })
      )
    ).getCatalog({ remoteWorkId: '77' })
    expect(short.complete).toBe(true)
    expect(short.items.map((item) => item.title)).toEqual(['第一話　始まり', '第二話　続き'])
  })

  it('marks the catalog incomplete when the last page is missing items', async () => {
    const routes = {
      [`${BASE}/stories/index/novel_id~1234`]: fixture('index-page1.html'),
      [`${BASE}/stories/index/novel_id~1234/page~2`]: fixture('index-page2.html').replace(
        /<tr><td>.*?<\/tr>/s,
        ''
      )
    }
    const catalog = await akatsukiSource.createAdapter(fakeBroker(routes)).getCatalog!(
      { remoteWorkId: '1234', cursor: '2:2:第一部' },
      context
    )
    expect(catalog.complete).toBe(false)
  })

  it('joins preface, body and afterword and fails closed without a body', () => {
    expect(parseAkatsukiEpisode(fixture('episode.html'))).toBe(
      '前書きです。\n\n＊＊＊\n\n　主人公が歩く。\n\n　［挿絵］終わり。\n\n＊＊＊\n\n後書きです。'
    )
    expect(() => parseAkatsukiEpisode(fixture('index-single.html'))).toThrow(/parser_broken/)
    expect(() => parseAkatsukiEpisode(fixture('private.html'))).toThrow(/không công khai/)
  })
})
