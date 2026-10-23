import { afterEach, describe, expect, it } from 'vitest'
import { CHANNELS } from '../../shared/contracts/channels'
import type {
  ConnectionTestResult,
  ConnectionView,
  ModelEntryTestResult
} from '../../shared/contracts/aiConnections'
import type { Result } from '../../shared/contracts/result'
import { ConnectionService } from '../services/ai/connectionService'
import { LibraryStore } from '../services/library/library'
import { SecretStore, type SecretCrypto } from '../infra/storage/secretStore'
import { createTempDirs } from '../testing/testing'
import { createLibraryHandlers } from './libraryHandlers'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

const crypto: SecretCrypto = {
  isEncryptionAvailable: () => true,
  async encrypt(plain) {
    return new Uint8Array([...Buffer.from(plain, 'utf-8')].map((b) => b ^ 0xff))
  },
  async decrypt(cipher) {
    return {
      value: Buffer.from([...cipher].map((b) => b ^ 0xff)).toString('utf-8'),
      shouldReEncrypt: false
    }
  }
}

function setup(fetchImpl?: typeof fetch): ReturnType<typeof createLibraryHandlers> {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  let counter = 0
  // Ids cross IPC and are validated as UUIDs, so the fake ids must look like real ones.
  const fakeId = (n: number): string => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const connections = new ConnectionService({
    db: library.appDb,
    secrets: new SecretStore(crypto),
    now: () => 1_700_000_000_000,
    newId: () => fakeId(++counter),
    fetchImpl
  })
  return createLibraryHandlers(library, undefined, connections)
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message)
  return result.value
}

async function call<T>(
  handlers: ReturnType<typeof createLibraryHandlers>,
  channel: string,
  raw?: unknown
): Promise<Result<T>> {
  return (await handlers[channel as keyof typeof handlers](raw)) as Result<T>
}

const gatewayInput = { name: 'Gateway nội bộ', baseUrl: 'http://127.0.0.1:8317/v1' }

describe('ai connection channels', () => {
  it('starts with no connections', async () => {
    const handlers = setup()
    const listed = unwrap(
      await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsList)
    )
    expect(listed.connections).toEqual([])
  })

  it('creates, updates and deletes a connection', async () => {
    const handlers = setup()
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, gatewayInput)
    )
    expect(created).toMatchObject({ name: 'Gateway nội bộ', enabled: true, keys: [] })

    const updated = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsUpdate, {
        id: created.id,
        patch: { enabled: false }
      })
    )
    expect(updated.enabled).toBe(false)

    const after = unwrap(
      await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsDelete, {
        id: created.id
      })
    )
    expect(after.connections).toEqual([])
  })

  it('rejects an address that is not an http URL, as data not as a throw', async () => {
    const handlers = setup()
    const result = await call(handlers, CHANNELS.aiConnectionsCreate, {
      name: 'X',
      baseUrl: 'khong-phai-url'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('validation')
  })

  it('takes a key in and never gives it back', async () => {
    const handlers = setup()
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, gatewayInput)
    )
    const withKey = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiKeysAdd, {
        id: created.id,
        secret: 'AIzaSyFAKEKEY01'
      })
    )
    expect(withKey.keys[0].tail).toBe('EY01')
    // Whatever the renderer asks for later, the key itself is not in any answer.
    const listed = await call(handlers, CHANNELS.aiConnectionsList)
    expect(JSON.stringify(listed)).not.toContain('AIzaSyFAKEKEY01')

    const withoutKey = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiKeysRemove, {
        id: created.id,
        keyId: withKey.keys[0].id
      })
    )
    expect(withoutKey.keys).toEqual([])
  })

  it('tests a connection and brings back models with their prices', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'models/gemini-flash-latest' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })) as typeof fetch
    const handlers = setup(fetchImpl)
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        providerId: 'google'
      })
    )

    const result = unwrap(
      await call<ConnectionTestResult>(handlers, CHANNELS.aiConnectionsTest, { id: created.id })
    )
    expect(result.listed).toBe(true)
    expect(result.models[0]).toMatchObject({ id: 'gemini-flash-latest' })
    expect(result.models[0].inputCost).toBeGreaterThan(0)
    expect(result.connection.checkedAt).toBe(1_700_000_000_000)
  })

  it('says a bad key is a bad key, not a mystery', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })) as typeof fetch
    const handlers = setup(fetchImpl)
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, gatewayInput)
    )
    const result = await call(handlers, CHANNELS.aiConnectionsTest, { id: created.id })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('validation')
      expect(result.error.message).toContain('API key not valid')
    }
  })

  it('treats an endpoint without /models as connected but not listable', async () => {
    const fetchImpl = (async () => new Response('not found', { status: 404 })) as typeof fetch
    const handlers = setup(fetchImpl)
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, gatewayInput)
    )
    const result = unwrap(
      await call<ConnectionTestResult>(handlers, CHANNELS.aiConnectionsTest, { id: created.id })
    )
    expect(result).toMatchObject({ listed: false, models: [] })
  })

  it('reports a missing connection as not_found rather than crashing', async () => {
    const handlers = setup()
    const result = await call(handlers, CHANNELS.aiConnectionsUpdate, {
      id: '00000000-0000-4000-8000-000000000000',
      patch: { enabled: false }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_found')
  })
})

describe('model entries over IPC', () => {
  const googleInput = { ...gatewayInput, name: 'Gemini', providerId: 'google' }

  async function connectionWithEntry(
    handlers: ReturnType<typeof createLibraryHandlers>,
    model = 'gemini-2.5-flash'
  ): Promise<{ connection: ConnectionView; entryId: string }> {
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, googleInput)
    )
    const withEntry = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsAdd, {
        connectionId: created.id,
        items: [{ model }]
      })
    )
    return { connection: withEntry, entryId: withEntry.models[0]!.id }
  }

  it('adds entries in order, each named after its model, with no settings', async () => {
    const handlers = setup()
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, googleInput)
    )
    const view = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsAdd, {
        connectionId: created.id,
        items: [{ model: 'b' }, { model: 'a', name: 'Tên của tôi' }]
      })
    )
    expect(view.models.map((entry) => [entry.name, entry.model, entry.settings])).toEqual([
      ['b', 'b', {}],
      ['Tên của tôi', 'a', {}]
    ])
  })

  it('tells the screen what each model supports, from the data shipped with the app', async () => {
    const handlers = setup()
    const { connection } = await connectionWithEntry(handlers, 'gemini-2.5-flash')
    expect(connection.models[0]!.capability).toEqual({
      thinkingLevels: ['off', 'low', 'medium', 'high'],
      temperature: true,
      structuredOutput: true
    })
  })

  it('offers only the default for a model it knows nothing about', async () => {
    const handlers = setup()
    const { connection } = await connectionWithEntry(handlers, 'ten-rieng-cua-toi')
    expect(connection.models[0]!.capability).toEqual({
      thinkingLevels: [],
      temperature: true,
      structuredOutput: false
    })
  })

  it('adds nothing at all when one item of a batch is bad, rather than half of them', async () => {
    const handlers = setup()
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, googleInput)
    )
    const result = await call(handlers, CHANNELS.aiModelsAdd, {
      connectionId: created.id,
      items: [{ model: 'good' }, { model: '   ' }]
    })
    expect(result.ok).toBe(false)
    const list = unwrap(
      await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsList)
    )
    expect(list.connections[0]!.models).toEqual([])
  })

  describe('settings', () => {
    it('saves a patch, and keeps it across a reload of the list', async () => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers)
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: {
            settings: { thinking: 'off', temperature: { enabled: true, value: 0.3 }, rpmLimit: 6 }
          }
        })
      )
      const list = unwrap(
        await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsList)
      )
      expect(list.connections[0]!.models[0]!.settings).toEqual({
        thinking: 'off',
        temperature: { enabled: true, value: 0.3 },
        rpmLimit: 6
      })
    })

    it('changes only what a patch names, so two dialogs cannot overwrite each other', async () => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers)
      const update = async (settings: unknown): Promise<ConnectionView> =>
        unwrap(
          await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
            entryId,
            patch: { settings }
          })
        )
      await update({ thinking: 'low', rpmLimit: 6 })
      const after = await update({ temperature: { enabled: true, value: 0.3 } })
      expect(after.models[0]!.settings).toEqual({
        thinking: 'low',
        rpmLimit: 6,
        temperature: { enabled: true, value: 0.3 }
      })
    })

    it('clears a field with null, which puts it back to the default', async () => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers)
      const update = async (settings: unknown): Promise<ConnectionView> =>
        unwrap(
          await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
            entryId,
            patch: { settings }
          })
        )
      await update({ thinking: 'low', rpmLimit: 6 })
      const cleared = await update({ thinking: null })
      expect(cleared.models[0]!.settings).toEqual({ rpmLimit: 6 })
    })

    it('renames an entry and changes its model without touching its settings', async () => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers)
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { settings: { thinking: 'low' } }
        })
      )
      const view = unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { name: 'Flash nhanh', model: 'gemini-2.5-pro' }
        })
      )
      expect(view.models[0]).toMatchObject({
        name: 'Flash nhanh',
        model: 'gemini-2.5-pro',
        settings: { thinking: 'low' }
      })
      // The capability follows the model, not the name: 2.5 Pro cannot be switched off.
      expect(view.models[0]!.capability.thinkingLevels).toEqual(['low', 'medium', 'high'])
    })

    it.each<[string, unknown, RegExp]>([
      ['a temperature out of range', { temperature: { enabled: true, value: 5 } }, /Nhiệt độ/],
      ['an RPM out of range', { rpmLimit: 10_001 }, /RPM/],
      [
        'an extra_body that overwrites a core field',
        { extraBody: { enabled: true, value: { stream: false } } },
        /stream/
      ],
      [
        'an extra header that carries the key',
        { extraHeaders: { enabled: true, value: { Authorization: 'Bearer x' } } },
        /Authorization/
      ]
    ])('refuses %s as a validation error that says why', async (_label, settings, message) => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers)
      const result = await call(handlers, CHANNELS.aiModelsUpdate, { entryId, patch: { settings } })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('validation')
        // The reason travels in `details`, with the path of the field it is about, so the dialog can put
        // it next to the right input.
        const reasons = result.error.details ?? []
        expect(reasons.some((reason) => message.test(reason.message))).toBe(true)
        expect(reasons.every((reason) => reason.path.startsWith('patch.settings'))).toBe(true)
      }
      // And nothing was saved.
      const list = unwrap(
        await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsList)
      )
      expect(list.connections[0]!.models[0]!.settings).toEqual({})
    })

    it('refuses a thinking level the model does not take, naming the ones it does', async () => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers, 'gemini-3.5-flash-lite')
      const result = await call(handlers, CHANNELS.aiModelsUpdate, {
        entryId,
        patch: { settings: { thinking: 'off' } }
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('validation')
        expect(result.error.message).toContain('các mức hợp lệ: minimal, low, medium, high')
      }
      const list = unwrap(
        await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsList)
      )
      expect(list.connections[0]!.models[0]!.settings).toEqual({})
    })

    it('takes "off" for gemini-3.5-flash, where a measured call showed it works', async () => {
      const handlers = setup()
      const { entryId } = await connectionWithEntry(handlers, 'gemini-3.5-flash')
      const view = unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { settings: { thinking: 'off' } }
        })
      )
      expect(view.models[0]!.settings).toEqual({ thinking: 'off' })
    })

    it('reports an entry that is not there as not_found', async () => {
      const handlers = setup()
      const result = await call(handlers, CHANNELS.aiModelsUpdate, {
        entryId: '00000000-0000-4000-8000-0000000000ff',
        patch: { name: 'x' }
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('not_found')
    })
  })

  it('duplicates an entry with its settings, deletes it, and keeps the others', async () => {
    const handlers = setup()
    const { entryId } = await connectionWithEntry(handlers)
    unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
        entryId,
        patch: { settings: { thinking: 'off' } }
      })
    )
    const duplicated = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsDuplicate, { entryId })
    )
    expect(duplicated.models).toHaveLength(2)
    expect(duplicated.models[1]).toMatchObject({
      model: 'gemini-2.5-flash',
      settings: { thinking: 'off' }
    })
    expect(duplicated.models[1]!.id).not.toBe(entryId)

    const deleted = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsDelete, { entryId })
    )
    expect(deleted.models.map((entry) => entry.id)).toEqual([duplicated.models[1]!.id])
  })

  it('makes an entry the default, and has no default again when that entry is deleted', async () => {
    const handlers = setup()
    const { connection, entryId } = await connectionWithEntry(handlers)
    const set = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsUpdate, {
        id: connection.id,
        patch: { defaultEntryId: entryId }
      })
    )
    expect(set.defaultEntryId).toBe(entryId)
    const deleted = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsDelete, { entryId })
    )
    expect(deleted.defaultEntryId).toBeNull()
  })

  it('refuses a default that is an entry of another connection', async () => {
    const handlers = setup()
    const a = await connectionWithEntry(handlers)
    const other = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, googleInput)
    )
    const result = await call(handlers, CHANNELS.aiConnectionsUpdate, {
      id: other.id,
      patch: { defaultEntryId: a.entryId }
    })
    expect(result.ok).toBe(false)
  })

  it('arranges the entries as the screen sends them, and refuses a stale list', async () => {
    const handlers = setup()
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, googleInput)
    )
    const added = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsAdd, {
        connectionId: created.id,
        items: [{ model: 'a' }, { model: 'b' }, { model: 'c' }]
      })
    )
    const [a, b, c] = added.models.map((entry) => entry.id)
    const reordered = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsReorder, {
        connectionId: created.id,
        ids: [c, a, b]
      })
    )
    expect(reordered.models.map((entry) => entry.model)).toEqual(['c', 'a', 'b'])

    const stale = await call(handlers, CHANNELS.aiModelsReorder, {
      connectionId: created.id,
      ids: [c, a]
    })
    expect(stale.ok).toBe(false)
  })

  describe('testing an entry', () => {
    const ok = (): Response =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )

    it('sends one small request with the saved settings and reports time and tokens', async () => {
      const bodies: Array<Record<string, unknown>> = []
      const fetchImpl = (async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return ok()
      }) as typeof fetch
      const handlers = setup(fetchImpl)
      const { entryId } = await connectionWithEntry(handlers)
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { settings: { thinking: 'off', temperature: { enabled: true, value: 0.3 } } }
        })
      )

      const result = unwrap(
        await call<ModelEntryTestResult>(handlers, CHANNELS.aiModelsTest, { entryId })
      )
      expect(bodies).toHaveLength(1)
      expect(bodies[0]).toMatchObject({
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        reasoning_effort: 'none'
      })
      expect(result.usage).toEqual({
        inputTokens: 12,
        uncachedInputTokens: 12,
        outputTokens: 2,
        source: 'provider',
        complete: true
      })
      expect(result.ms).toBeGreaterThanOrEqual(0)
    })

    it('says what the provider said when it refuses the settings, and changes nothing', async () => {
      const fetchImpl = (async () =>
        new Response(
          JSON.stringify([
            {
              error: {
                code: 400,
                message: 'Unsupported value: temperature',
                status: 'INVALID_ARGUMENT'
              }
            }
          ]),
          { status: 400, headers: { 'content-type': 'application/json' } }
        )) as typeof fetch
      const handlers = setup(fetchImpl)
      const { entryId } = await connectionWithEntry(handlers)
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { settings: { temperature: { enabled: true, value: 0.3 } } }
        })
      )

      const result = await call(handlers, CHANNELS.aiModelsTest, { entryId })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        // A request error is a settings problem, and the message names what was sent.
        expect(result.error.code).toBe('validation')
        expect(result.error.message).toContain('Unsupported value: temperature')
        expect(result.error.message).toContain('temperature: 0.3')
      }

      const list = unwrap(
        await call<{ connections: ConnectionView[] }>(handlers, CHANNELS.aiConnectionsList)
      )
      expect(list.connections[0]!.models[0]!.settings).toEqual({
        temperature: { enabled: true, value: 0.3 }
      })
    })

    it('does not send a thinking level the model no longer takes, and says which ones it does', async () => {
      let calls = 0
      const fetchImpl = (async () => {
        calls++
        return ok()
      }) as typeof fetch
      const handlers = setup(fetchImpl)
      const { entryId } = await connectionWithEntry(handlers)
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { settings: { thinking: 'off' } }
        })
      )
      // Pointing the entry at a model that cannot switch thinking off is allowed (the level shows as
      // unsupported in the form), but nothing goes out with it.
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiModelsUpdate, {
          entryId,
          patch: { model: 'gemini-3.5-flash-lite' }
        })
      )
      const result = await call(handlers, CHANNELS.aiModelsTest, { entryId })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('validation')
        expect(result.error.message).toContain('"Tắt" không hợp lệ với gemini-3.5-flash-lite')
        expect(result.error.message).toContain('Gợi ý: minimal')
      }
      expect(calls).toBe(0)
    })

    it('does not test an entry of a connection that is switched off', async () => {
      let calls = 0
      const fetchImpl = (async () => {
        calls++
        return ok()
      }) as typeof fetch
      const handlers = setup(fetchImpl)
      const { connection, entryId } = await connectionWithEntry(handlers)
      unwrap(
        await call<ConnectionView>(handlers, CHANNELS.aiConnectionsUpdate, {
          id: connection.id,
          patch: { enabled: false }
        })
      )
      const result = await call(handlers, CHANNELS.aiModelsTest, { entryId })
      expect(result.ok).toBe(false)
      expect(calls).toBe(0)
    })

    it('reports an entry that is not there as not_found', async () => {
      const handlers = setup()
      const result = await call(handlers, CHANNELS.aiModelsTest, {
        entryId: '00000000-0000-4000-8000-0000000000ff'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('not_found')
    })
  })
})

describe('provider cards and endpoint probe', () => {
  it('makes the connection from the preset on the first key, and reuses it on the second', async () => {
    const handlers = setup()
    const first = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsEnsureWithKey, {
        providerId: 'openrouter',
        secret: 'sk-or-aaaa1111'
      })
    )
    expect(first).toMatchObject({ name: 'OpenRouter', providerId: 'openrouter' })
    expect(first.keys.map((key) => key.tail)).toEqual(['1111'])

    const second = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsEnsureWithKey, {
        providerId: 'openrouter',
        secret: 'sk-or-bbbb2222'
      })
    )
    expect(second.id).toBe(first.id)
    expect(second.keys.map((key) => key.tail)).toEqual(['1111', '2222'])
  })

  it('refuses a provider it has no preset for', async () => {
    const result = await call(setup(), CHANNELS.aiConnectionsEnsureWithKey, {
      providerId: 'nous',
      secret: 'x'
    })
    expect(result.ok).toBe(false)
  })

  it('probes with the stored key of a connection and never returns it', async () => {
    let auth: string | null = null
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      auth = new Headers(init?.headers).get('authorization')
      return String(input).endsWith('/models')
        ? new Response(JSON.stringify({ data: [{ id: 'm' }] }), {
            headers: { 'content-type': 'application/json' }
          })
        : new Response('{}')
    }) as typeof fetch
    const handlers = setup(fetchImpl)
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, gatewayInput)
    )
    unwrap(await call(handlers, CHANNELS.aiKeysAdd, { id: created.id, secret: 'sk-gateway-9999' }))
    const probe = unwrap(
      await call<Record<string, unknown>>(handlers, CHANNELS.aiConnectionsProbe, {
        baseUrl: created.baseUrl,
        connectionId: created.id
      })
    )
    expect(auth).toBe('Bearer sk-gateway-9999')
    expect(probe).toMatchObject({ ok: true, models: ['m'] })
    expect(JSON.stringify(probe)).not.toContain('sk-gateway')
  })
})

describe('main model and fallbacks', () => {
  async function withEntries(): Promise<{
    handlers: ReturnType<typeof createLibraryHandlers>
    connection: ConnectionView
  }> {
    const handlers = setup()
    const created = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiConnectionsCreate, gatewayInput)
    )
    const connection = unwrap(
      await call<ConnectionView>(handlers, CHANNELS.aiModelsAdd, {
        connectionId: created.id,
        items: [{ model: 'gemini-2.5-flash' }, { model: 'gemini-2.5-pro' }]
      })
    )
    return { handlers, connection }
  }

  it('saves the main model and the fallbacks, and reads them back', async () => {
    const { handlers, connection } = await withEntries()
    const [flash, pro] = connection.models
    unwrap(
      await call(handlers, CHANNELS.aiPreferencesSetMain, {
        main: { connectionId: connection.id, entryId: flash!.id, thinking: 'high' }
      })
    )
    unwrap(
      await call(handlers, CHANNELS.aiPreferencesSetFallbacks, {
        fallbacks: [
          { connectionId: connection.id, entryId: pro!.id },
          { connectionId: connection.id, entryId: pro!.id }
        ]
      })
    )
    const prefs = unwrap(await call<Record<string, unknown>>(handlers, CHANNELS.aiPreferencesGet))
    expect(prefs).toEqual({
      main: { connectionId: connection.id, entryId: flash!.id, thinking: 'high' },
      fallbacks: [{ connectionId: connection.id, entryId: pro!.id }],
      auxiliary: null,
      onboardingSkipped: false
    })
  })

  it('forgets an entry that is deleted, and everything of a deleted connection', async () => {
    const { handlers, connection } = await withEntries()
    const [flash, pro] = connection.models
    unwrap(
      await call(handlers, CHANNELS.aiPreferencesSetMain, {
        main: { connectionId: connection.id, entryId: flash!.id }
      })
    )
    unwrap(
      await call(handlers, CHANNELS.aiPreferencesSetFallbacks, {
        fallbacks: [{ connectionId: connection.id, entryId: pro!.id }]
      })
    )
    unwrap(await call(handlers, CHANNELS.aiModelsDelete, { entryId: flash!.id }))
    let prefs = unwrap(
      await call<{ main: unknown; fallbacks: unknown[] }>(handlers, CHANNELS.aiPreferencesGet)
    )
    expect(prefs.main).toBeNull()
    expect(prefs.fallbacks).toHaveLength(1)

    unwrap(await call(handlers, CHANNELS.aiConnectionsDelete, { id: connection.id }))
    prefs = unwrap(await call(handlers, CHANNELS.aiPreferencesGet))
    expect(prefs.fallbacks).toEqual([])
  })

  it('saves the auxiliary model and reads it as unset once its entry is deleted', async () => {
    const { handlers, connection } = await withEntries()
    const [flash] = connection.models
    const auxiliary = { connectionId: connection.id, entryId: flash!.id }
    unwrap(await call(handlers, CHANNELS.aiPreferencesSetAuxiliary, { auxiliary }))
    let prefs = unwrap(await call<{ auxiliary: unknown }>(handlers, CHANNELS.aiPreferencesGet))
    expect(prefs.auxiliary).toEqual(auxiliary)
    unwrap(await call(handlers, CHANNELS.aiModelsDelete, { entryId: flash!.id }))
    prefs = unwrap(await call<{ auxiliary: unknown }>(handlers, CHANNELS.aiPreferencesGet))
    expect(prefs.auxiliary).toBeNull()
  })

  it('refuses a main model that does not exist', async () => {
    const result = await call(setup(), CHANNELS.aiPreferencesSetMain, {
      main: {
        connectionId: '00000000-0000-4000-8000-000000000099',
        entryId: '00000000-0000-4000-8000-000000000098'
      }
    })
    expect(result.ok).toBe(false)
  })

  it('remembers that onboarding was put off', async () => {
    const handlers = setup()
    const prefs = unwrap(
      await call<{ onboardingSkipped: boolean }>(
        handlers,
        CHANNELS.aiPreferencesSetOnboardingSkipped,
        {
          skipped: true
        }
      )
    )
    expect(prefs.onboardingSkipped).toBe(true)
  })
})
