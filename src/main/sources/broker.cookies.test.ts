import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent: { url: string; cookie: string | null }[] = []
let responses: { status: number; headers?: Record<string, string> }[] = []

vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }]
}))
vi.mock('undici', () => ({
  Agent: class {
    close(): Promise<void> {
      return Promise.resolve()
    }
  },
  fetch: async (url: URL, init: { headers: Headers }) => {
    sent.push({ url: url.toString(), cookie: init.headers.get('cookie') })
    const next = responses.shift() ?? { status: 200 }
    return new Response(next.status === 200 ? 'ok' : null, {
      status: next.status,
      headers: next.headers
    })
  }
}))

const { NetworkBroker } = await import('./broker')

const R18 = 'https://novel18.syosetu.com'
const API = 'https://api.syosetu.com'

function broker(ageConfirmed: boolean) {
  return new NetworkBroker({
    allowedOrigins: [R18, API],
    allowNetwork: true,
    minIntervalMs: 0,
    ageCookies: { [R18]: 'over18=yes' },
    ageConfirmed: () => ageConfirmed
  })
}

describe('NetworkBroker age-confirmation cookies', () => {
  beforeEach(() => {
    sent.length = 0
    responses = []
  })

  it('sends the declared cookie only to its origin after confirmation', async () => {
    const b = broker(true)
    await b.request({ url: `${R18}/n1234ab/` })
    await b.request({ url: `${API}/novel18api/api/` })
    expect(sent).toEqual([
      { url: `${R18}/n1234ab/`, cookie: 'over18=yes' },
      { url: `${API}/novel18api/api/`, cookie: null }
    ])
  })

  it('rejects every origin of an R18 source before dispatch when age is not confirmed', async () => {
    for (const url of [`${R18}/n1234ab/`, `${API}/novel18api/api/`]) {
      await expect(broker(false).request({ url })).rejects.toMatchObject({
        code: 'age_verification_required'
      })
    }
    expect(sent).toHaveLength(0)
  })

  it('rejects cookies supplied by the adapter', async () => {
    await expect(
      broker(true).request({ url: `${API}/x`, headers: { Cookie: 'session=1' } })
    ).rejects.toMatchObject({ code: 'auth_handle_invalid' })
    expect(sent).toHaveLength(0)
  })

  it('does not keep Set-Cookie and swaps the cookie on cross-origin redirect', async () => {
    responses = [
      { status: 302, headers: { location: `${API}/moved`, 'set-cookie': 'track=1' } },
      { status: 200, headers: { 'set-cookie': 'track=2' } }
    ]
    const b = broker(true)
    await b.request({ url: `${R18}/n1234ab/` })
    await b.request({ url: `${API}/again` })
    expect(sent.map((r) => r.cookie)).toEqual(['over18=yes', null, null])
  })
})
