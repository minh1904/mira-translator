import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NetworkBroker } from '../broker'
import { validateManifest } from '../manifest'
import { AdapterRuntime } from '../runtime'
import {
  identifySyosetu,
  parseSyosetuEpisode,
  parseSyosetuToc,
  syosetuR18Source,
  syosetuSource
} from './adapter'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8')

/** Fake broker: maps URL → [status, fixture]; records every request. */
function fakeBroker(routes: Record<string, [number, string]>) {
  const requested: string[] = []
  const broker = {
    request: async ({ url }: { url: string }) => {
      requested.push(url)
      const [status, body] = routes[url] ?? [404, '']
      return { status, headers: {}, body: new TextEncoder().encode(body) }
    }
  } as unknown as NetworkBroker
  return { broker, requested }
}

const API = 'https://api.syosetu.com/novelapi/api/?out=json&ncode=n1234ab&of=t-w-s-nt-ga-gl-n'
const R18_API =
  'https://api.syosetu.com/novel18api/api/?out=json&ncode=n5678cd&of=t-w-s-nt-ga-gl-ng-n'
const serialRoutes = (): Record<string, [number, string]> => ({
  [API]: [200, fixture('api-serial.json')],
  'https://ncode.syosetu.com/n1234ab/?p=1': [200, fixture('toc-page1.html')],
  'https://ncode.syosetu.com/n1234ab/?p=2': [200, fixture('toc-page2.html')]
})
const context = { signal: new AbortController().signal, now: () => new Date() }

describe('Syosetu identify', () => {
  it('identifies work and episode URLs by lower-cased ncode on its own host', () => {
    expect(identifySyosetu('https://ncode.syosetu.com/N1234AB', 'ncode.syosetu.com')).toEqual({
      remoteWorkId: 'n1234ab',
      canonicalUrl: 'https://ncode.syosetu.com/n1234ab/'
    })
    expect(syosetuSource.identify('https://ncode.syosetu.com/n1234ab/12/')).toMatchObject({
      remoteWorkId: 'n1234ab',
      inputRemoteChapterId: '12'
    })
    expect(syosetuR18Source.identify('https://novel18.syosetu.com/n5678cd/')).toMatchObject({
      remoteWorkId: 'n5678cd',
      canonicalUrl: 'https://novel18.syosetu.com/n5678cd/'
    })
    expect(syosetuSource.identify('https://novel18.syosetu.com/n5678cd/')).toBeNull()
    for (const url of [
      'https://syosetu.com/n1234ab/',
      'https://mypage.syosetu.com/12345/',
      'https://syosetu.org/novel/1/',
      'https://ncode.syosetu.com/abc/',
      'http://ncode.syosetu.com/n1234ab/',
      'https://ncode.syosetu.com/n1234ab/0/'
    ]) {
      expect(syosetuSource.identify(url)).toBeNull()
    }
  })

  it('declares valid manifests with API origin, burst pause and the R18 age cookie', () => {
    for (const source of [syosetuSource, syosetuR18Source]) {
      expect(() => validateManifest(source.manifest)).not.toThrow()
      expect(source.manifest.networkPolicy?.origins).toContain('https://api.syosetu.com')
      expect(source.manifest.networkPolicy?.burstPause).toEqual({ every: 10, ms: 5000 })
    }
    expect(syosetuR18Source.manifest.adult).toBe(true)
    expect(syosetuR18Source.manifest.networkPolicy?.ageCookies).toEqual({
      'https://novel18.syosetu.com': 'over18=yes'
    })
    expect(syosetuSource.manifest.networkPolicy?.ageCookies).toBeUndefined()
  })
})

describe('Syosetu adapter', () => {
  it('reads work metadata and fails closed when the API has no matching entry', async () => {
    const { broker } = fakeBroker(serialRoutes())
    const adapter = syosetuSource.createAdapter(broker)
    expect(await adapter.getWork!({ remoteWorkId: 'n1234ab' }, context)).toEqual({
      remoteWorkId: 'n1234ab',
      title: 'テスト作品',
      languageTag: 'ja',
      author: '作者',
      description: 'あらすじ'
    })
    expect(await adapter.getUpdateFingerprint!({ remoteWorkId: 'n1234ab' }, context)).toBe(
      '4|2026-10-01 12:00:00'
    )
    const empty = fakeBroker({ [API]: [200, fixture('api-empty.json')] })
    await expect(
      syosetuSource.createAdapter(empty.broker).getWork!({ remoteWorkId: 'n1234ab' }, context)
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('traverses every TOC page with group headings and checks the API count', async () => {
    const { broker, requested } = fakeBroker(serialRoutes())
    const catalog = await new AdapterRuntime(syosetuSource.createAdapter(broker)).getCatalog({
      remoteWorkId: 'n1234ab'
    })
    expect(catalog.complete).toBe(true)
    expect(
      catalog.items.map((item) => [item.remoteChapterId, item.title, item.volumeTitle])
    ).toEqual([
      ['1', 'プロローグ', '第１章　はじまり'],
      ['2', '第一話「出会い」', '第１章　はじまり'],
      ['3', '第二話「旅立ち」', '第１章　はじまり'],
      ['4', '第三話「港町」', '第２章　旅']
    ])
    expect(requested.every((url) => !url.includes('novel18'))).toBe(true)

    const lagging = serialRoutes()
    lagging[API] = [
      200,
      fixture('api-serial.json').replace('"general_all_no":4', '"general_all_no":5')
    ]
    const stale = await new AdapterRuntime(
      syosetuSource.createAdapter(fakeBroker(lagging).broker)
    ).getCatalog({ remoteWorkId: 'n1234ab' })
    expect(stale.complete).toBe(false)
  })

  it('treats a short story as one item whose text is the work page body', async () => {
    const { broker } = fakeBroker({
      [R18_API]: [200, fixture('api-short-r18.json')],
      'https://novel18.syosetu.com/n5678cd/': [200, fixture('episode.html')]
    })
    const adapter = syosetuR18Source.createAdapter(broker)
    expect(await adapter.getWork!({ remoteWorkId: 'n5678cd' }, context)).toMatchObject({
      siteName: 'Moonlight'
    })
    const catalog = await adapter.getCatalog!({ remoteWorkId: 'n5678cd' }, context)
    expect(catalog.items).toEqual([
      { remoteChapterId: '1', title: '短編作品', order: 1, access: 'public' }
    ])
    const chapter = await adapter.getChapter!(
      { remoteWorkId: 'n5678cd', remoteChapterId: '1' },
      context
    )
    expect(chapter.text).toContain('主人公が歩く。')
  })

  it('joins preface, body and afterword and fails closed without a body', () => {
    expect(parseSyosetuEpisode(fixture('episode.html'))).toBe(
      '前書きです。\n\n＊＊＊\n\n　主人公が歩く。\n\n　［挿絵］\n　終わり。\n\n＊＊＊\n\n後書きです。'
    )
    expect(() => parseSyosetuEpisode(fixture('episode-missing-body.html'))).toThrow(/parser_broken/)
  })

  it('reads the last page number from the pager', () => {
    expect(parseSyosetuToc(fixture('toc-page1.html'), 'n1234ab').lastPage).toBe(2)
    expect(parseSyosetuToc(fixture('toc-page2.html'), 'n1234ab').lastPage).toBe(1)
  })
})
