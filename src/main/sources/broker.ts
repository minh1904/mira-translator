import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch } from 'undici'

export interface NetworkRequest {
  url: string
  signal?: AbortSignal
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string | Uint8Array
  authHandle?: string
}

export interface NetworkResponse {
  status: number
  headers: Record<string, string>
  body: Uint8Array
}

export type NetworkBrokerErrorCode =
  | 'origin_not_allowed'
  | 'private_address_blocked'
  | 'network_disabled'
  | 'auth_handle_invalid'
  | 'age_verification_required'

export class NetworkBrokerError extends Error {
  constructor(
    readonly code: NetworkBrokerErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'NetworkBrokerError'
  }
}

const BLOCKED_ADDRESSES = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const)
  BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const)
  BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv6')

export function isPrivateAddress(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (host === 'localhost' || host === 'localhost.localdomain' || host.startsWith('::ffff:'))
    return true
  const family = isIP(host)
  return family > 0 && BLOCKED_ADDRESSES.check(host, family === 4 ? 'ipv4' : 'ipv6')
}

export interface NetworkBrokerPolicy {
  allowedOrigins: string[]
  allowNetwork?: boolean
  minIntervalMs?: number
  maxRedirects?: number
  maxResponseBytes?: number
  requestTimeoutMs?: number
  /** Fixed age-confirmation cookie per origin (manifest `ageCookies`). */
  ageCookies?: Record<string, string>
  /** Whether the user confirmed being 18+; read on every request so revoking takes effect at once. */
  ageConfirmed?: () => boolean
}

let nextAllowedRequestAt = 0

async function waitForPacing(minIntervalMs: number): Promise<void> {
  const now = Date.now()
  const startAt = Math.max(now, nextAllowedRequestAt)
  nextAllowedRequestAt = startAt + minIntervalMs
  if (startAt > now) await new Promise((resolve) => setTimeout(resolve, startAt - now))
}

export class NetworkBroker {
  constructor(private readonly policy: NetworkBrokerPolicy) {}

  async request(req: NetworkRequest): Promise<NetworkResponse> {
    if (this.policy.allowNetwork !== true) {
      throw new NetworkBrokerError(
        'network_disabled',
        'network adapter requests are not enabled in this release'
      )
    }
    if (req.method && req.method !== 'GET') {
      throw new NetworkBrokerError('network_disabled', 'only GET requests are supported')
    }
    if (req.authHandle || req.body) {
      throw new NetworkBrokerError('auth_handle_invalid', 'request credentials are not supported')
    }

    let url: URL
    try {
      url = new URL(req.url)
    } catch {
      throw new NetworkBrokerError('origin_not_allowed', 'invalid request URL')
    }
    const isAllowed = (candidate: URL): boolean =>
      candidate.protocol === 'https:' &&
      !candidate.username &&
      !candidate.password &&
      this.policy.allowedOrigins.some((origin) => {
        try {
          return new URL(origin).origin === candidate.origin
        } catch {
          return false
        }
      })
    if (isPrivateAddress(url.hostname)) {
      throw new NetworkBrokerError(
        'private_address_blocked',
        'private network addresses are blocked'
      )
    }
    if (!isAllowed(url)) {
      throw new NetworkBrokerError(
        'origin_not_allowed',
        `origin ${url.origin} is not in the declared HTTPS origins`
      )
    }

    // An R18 source (one that declares age cookies) sends nothing, not even API calls, before confirmation.
    if (this.policy.ageCookies && this.policy.ageConfirmed?.() !== true) {
      throw new NetworkBrokerError(
        'age_verification_required',
        'Nguồn R18: cần xác nhận đủ 18 tuổi trước khi truy cập'
      )
    }

    const maxRedirects = this.policy.maxRedirects ?? 5
    const maxBytes = this.policy.maxResponseBytes ?? 8 * 1024 * 1024
    const timeoutMs = this.policy.requestTimeoutMs ?? 15_000
    const headers = new Headers(req.headers)
    if (headers.has('cookie')) {
      throw new NetworkBrokerError('auth_handle_invalid', 'adapters cannot set cookies')
    }
    for (const name of ['authorization', 'cookie', 'proxy-authorization', 'host', 'connection']) {
      headers.delete(name)
    }
    headers.set('user-agent', 'Mira/0.1 (+local novel source reader)')

    for (let redirects = 0; ; redirects += 1) {
      if (!isAllowed(url)) {
        throw new NetworkBrokerError('origin_not_allowed', 'redirect origin is not allowed')
      }
      // Only the cookie declared for this exact origin; response cookies are never kept.
      headers.delete('cookie')
      const ageCookie = this.policy.ageCookies?.[url.origin]
      if (ageCookie !== undefined) headers.set('cookie', ageCookie)
      const records = isIP(url.hostname)
        ? [{ address: url.hostname, family: isIP(url.hostname) }]
        : await lookup(url.hostname, { all: true, verbatim: true })
      if (!records.length || records.some(({ address }) => isPrivateAddress(address))) {
        throw new NetworkBrokerError(
          'private_address_blocked',
          'host resolves to a private or special-use address'
        )
      }
      let index = 0
      const agent = new Agent({
        connect: {
          lookup: (_hostname, lookupOptions, callback) => {
            if (lookupOptions.all) {
              callback(null, records)
              return
            }
            const record = records[index++ % records.length]
            callback(null, record.address, record.family)
          }
        }
      })
      const controller = new AbortController()
      const abortFromCaller = () => controller.abort(req.signal?.reason)
      if (req.signal?.aborted) abortFromCaller()
      else req.signal?.addEventListener('abort', abortFromCaller, { once: true })
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        await waitForPacing(this.policy.minIntervalMs ?? 1000)
        const response = await fetch(url, {
          dispatcher: agent,
          headers,
          redirect: 'manual',
          signal: controller.signal
        })
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel()
          const location = response.headers.get('location')
          if (!location || redirects >= maxRedirects) {
            throw new NetworkBrokerError('origin_not_allowed', 'redirect limit exceeded')
          }
          url = new URL(location, url)
          continue
        }
        const chunks: Uint8Array[] = []
        let size = 0
        if (response.body) {
          for await (const chunk of response.body) {
            const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
            size += bytes.byteLength
            if (size > maxBytes) {
              controller.abort()
              throw new NetworkBrokerError('network_disabled', 'response exceeds size limit')
            }
            chunks.push(bytes)
          }
        }
        const body = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          body.set(chunk, offset)
          offset += chunk.byteLength
        }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body
        }
      } finally {
        clearTimeout(timeout)
        req.signal?.removeEventListener('abort', abortFromCaller)
        await agent.close()
      }
    }
  }
}

export interface AuthHost {
  getOpaqueHandle(profileId: string): Promise<string>
}

export interface BrowserHost {
  openInteractiveSession(sourceId: string, profileId: string, url: string): Promise<void>
}
