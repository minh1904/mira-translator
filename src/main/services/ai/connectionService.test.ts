import { afterEach, describe, expect, it } from 'vitest'
import { StorageError } from '../../infra/storage/errors'
import { SecretStore, type SecretCrypto } from '../../infra/storage/secretStore'
import { createTempDirs } from '../../testing/testing'
import { LibraryStore } from '../library/library'
import { ConnectionService } from './connectionService'

/**
 * Kiểm tra cách dịch vụ khởi tạo provider từ mục cấu hình model: cài đặt của mục được áp dụng vào request,
 * tốc độ gọi (RPM) và giới hạn đồng thời được thực thi, và từ chối mục không thuộc kết nối này.
 */

const tempDir = createTempDirs()
const stores: LibraryStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

const NOW = 1_700_000_000_000

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

interface Sent {
  body: Record<string, unknown>
  authorization: string | undefined
}

const completion = (): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )

function setup(handle: (sent: Sent, index: number) => Promise<Response> | Response = completion): {
  service: ConnectionService
  sent: Sent[]
  sleeps: number[]
  connectionId: string
  entryIds: string[]
} {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  let counter = 0
  const fakeId = (n: number): string => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const sent: Sent[] = []
  const sleeps: number[] = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const one: Sent = {
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      authorization: headers.authorization
    }
    sent.push(one)
    return handle(one, sent.length - 1)
  }) as typeof fetch

  const service = new ConnectionService({
    db: library.appDb,
    secrets: new SecretStore(crypto),
    now: () => NOW,
    newId: () => fakeId(++counter),
    fetchImpl,
    // Hàm sleep giả lập dùng chung cho thử lại và điều phối nhịp gọi; không tốn thời gian thực.
    retry: {
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    }
  })
  const connection = service.create({
    name: 'Gemini',
    baseUrl: 'http://127.0.0.1:8317/v1',
    providerId: 'google'
  })
  const withEntries = service.addModels(connection.id, [
    { model: 'gemini-2.5-flash' },
    { model: 'gemini-2.5-flash', name: 'Flash nhanh' }
  ])
  return {
    service,
    sent,
    sleeps,
    connectionId: connection.id,
    entryIds: withEntries.models.map((entry) => entry.id)
  }
}

describe('ConnectionService.translator, for a model entry', () => {
  it('sends the request it always sent for an entry nobody has set anything on', async () => {
    const { service, sent, connectionId, entryIds } = setup()
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    expect(Object.keys(sent[0]!.body).sort()).toEqual(['messages', 'model'])
  })

  it('sends the settings of the entry it was asked for, so two entries of one model do not mix', async () => {
    const { service, sent, connectionId, entryIds } = setup()
    service.updateEntry(entryIds[1]!, {
      settings: { thinking: 'off', temperature: { enabled: true, value: 0.3 } }
    })
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    await service.translator(connectionId, entryIds[1]!).provider.probe()

    expect(sent[0]!.body).not.toHaveProperty('temperature')
    expect(sent[0]!.body).not.toHaveProperty('reasoning_effort')
    expect(sent[1]!.body).toMatchObject({
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      reasoning_effort: 'none'
    })
  })

  it('sends the real model name of the entry, not its display name', async () => {
    const { service, sent, connectionId, entryIds } = setup()
    await service.translator(connectionId, entryIds[1]!).provider.probe()
    expect(sent[0]!.body.model).toBe('gemini-2.5-flash')
  })

  it('hands back the entry as it was read, and a key that follows its configuration', () => {
    const { service, connectionId, entryIds } = setup()
    const before = service.translator(connectionId, entryIds[0]!)
    expect(before.entry).toMatchObject({ id: entryIds[0], model: 'gemini-2.5-flash', settings: {} })

    service.updateEntry(entryIds[0]!, { settings: { thinking: 'low' } })
    const after = service.translator(connectionId, entryIds[0]!)
    expect(after.entry.settings).toEqual({ thinking: 'low' })
    expect(after.settingsKey).not.toBe(before.settingsKey)
    // Đọc lại cùng một cấu hình sẽ sinh ra cùng một mã khóa: đây là chữ ký nhận diện, không phải bộ đếm.
    expect(service.translator(connectionId, entryIds[0]!).settingsKey).toBe(after.settingsKey)
  })

  it('refuses an entry that is not there, and one of another connection', () => {
    const { service, connectionId } = setup()
    const other = service.create({
      name: 'Khác',
      baseUrl: 'http://127.0.0.1:9/v1',
      providerId: null
    })
    const foreign = service.addModels(other.id, [{ model: 'm' }]).models[0]!.id

    const refused = (run: () => unknown): unknown => {
      try {
        run()
      } catch (error) {
        return error
      }
      return null
    }
    for (const entryId of ['00000000-0000-4000-8000-0000000000ff', foreign]) {
      const error = refused(() => service.translator(connectionId, entryId))
      expect(error).toBeInstanceOf(StorageError)
      expect((error as StorageError).code).toBe('not_found')
    }
  })

  it('refuses a connection the user switched off, before looking at the entry', () => {
    const { service, connectionId, entryIds } = setup()
    service.update({ id: connectionId, patch: { enabled: false } })
    expect(() => service.translator(connectionId, entryIds[0]!)).toThrow(/đang tắt/)
  })

  it("builds a provider whose batches follow the entry's input limit", () => {
    const { service, connectionId, entryIds } = setup()
    service.updateEntry(entryIds[0]!, { settings: { inputTokenLimit: 800 } })
    expect(service.translator(connectionId, entryIds[0]!).entry.settings.inputTokenLimit).toBe(800)
  })
})

describe('the pace of an entry', () => {
  it('spaces the calls of an entry by its RPM', async () => {
    const { service, sleeps, connectionId, entryIds } = setup()
    service.updateEntry(entryIds[0]!, { settings: { rpmLimit: 6 } })
    for (let call = 0; call < 3; call++) {
      await service.translator(connectionId, entryIds[0]!).provider.probe()
    }
    // 6 lượt một phút tương ứng 10 giây một lượt. Đồng hồ giả lập không tự tăng, mỗi lượt gọi chờ đúng khoảng thời gian quy định.
    expect(sleeps).toEqual([10_000, 20_000])
  })

  it('does not space anything for an entry with no RPM', async () => {
    const { service, sleeps, connectionId, entryIds } = setup()
    for (let call = 0; call < 3; call++) {
      await service.translator(connectionId, entryIds[0]!).provider.probe()
    }
    expect(sleeps).toEqual([])
  })

  it('applies an edited RPM to the next call, and stops spacing when it is cleared', async () => {
    const { service, sleeps, connectionId, entryIds } = setup()
    service.updateEntry(entryIds[0]!, { settings: { rpmLimit: 6 } })
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    expect(sleeps).toEqual([10_000])

    service.updateEntry(entryIds[0]!, { settings: { rpmLimit: null } })
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    expect(sleeps).toEqual([10_000])
  })

  it('shares the pace between the translation and the chat that use one entry', async () => {
    const { service, sleeps, connectionId, entryIds } = setup()
    service.updateEntry(entryIds[0]!, { settings: { rpmLimit: 6 } })
    // Hai provider được dựng độc lập, tương tự như một lô dịch thuật và một lượt chat.
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    expect(sleeps).toEqual([10_000])
  })

  it('gives each entry its own pace', async () => {
    const { service, sleeps, connectionId, entryIds } = setup()
    service.updateEntry(entryIds[0]!, { settings: { rpmLimit: 6 } })
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    // Mục còn lại không bị giới hạn RPM nên không bị giữ chậm bởi nhịp gọi của mục đầu tiên.
    await service.translator(connectionId, entryIds[1]!).provider.probe()
    expect(sleeps).toEqual([])
  })
})

describe('the concurrency of an entry', () => {
  /** Giả lập fetch chỉ phản hồi khi được kích hoạt, cho phép kiểm thử giữ các yêu cầu đang bay. */
  function gated(): {
    handle: (sent: Sent, index: number) => Promise<Response>
    release: (index: number) => void
    started: () => number
  } {
    const gates = new Map<number, () => void>()
    let started = 0
    return {
      handle: (_sent, index) =>
        new Promise<Response>((resolve) => {
          started++
          gates.set(index, () => resolve(completion()))
        }),
      release: (index) => gates.get(index)?.(),
      started: () => started
    }
  }

  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))

  it('lets only as many calls of an entry run at once as its limit', async () => {
    const gate = gated()
    const { service, connectionId, entryIds } = setup(gate.handle)
    service.updateEntry(entryIds[0]!, { settings: { concurrencyLimit: 1 } })

    const first = service.translator(connectionId, entryIds[0]!).provider.probe()
    const second = service.translator(connectionId, entryIds[0]!).provider.probe()
    await tick()
    expect(gate.started()).toBe(1)

    gate.release(0)
    await first
    await tick()
    expect(gate.started()).toBe(2)
    gate.release(1)
    await second
  })

  it('does not hold an entry up for the calls of another entry of the same connection', async () => {
    const gate = gated()
    const { service, connectionId, entryIds } = setup(gate.handle)
    // Cả hai đều đặt mức đồng thời bằng 1; nếu dùng chung hàng đợi thì lượt thứ hai phải chờ lượt thứ nhất.
    service.updateEntry(entryIds[0]!, { settings: { concurrencyLimit: 1 } })
    service.updateEntry(entryIds[1]!, { settings: { concurrencyLimit: 1 } })

    const busy = service.translator(connectionId, entryIds[0]!).provider.probe()
    const other = service.translator(connectionId, entryIds[1]!).provider.probe()
    await tick()
    expect(gate.started()).toBe(2)
    gate.release(0)
    gate.release(1)
    await Promise.all([busy, other])
  })

  /** Chạy xong `count` lượt nối tiếp nhau (đánh số từ `from`): mức đồng thời của mục tăng sau lượt thành công. */
  async function warm(
    gate: ReturnType<typeof gated>,
    call: () => Promise<unknown>,
    from: number,
    count: number
  ): Promise<void> {
    for (let index = from; index < from + count; index++) {
      const pending = call()
      await tick()
      gate.release(index)
      await pending
    }
  }

  it('grows into a raised limit as calls succeed, without anything being restarted', async () => {
    const gate = gated()
    const { service, connectionId, entryIds } = setup(gate.handle)
    service.updateEntry(entryIds[0]!, { settings: { concurrencyLimit: 1 } })
    const probe = () => service.translator(connectionId, entryIds[0]!).provider.probe()
    await warm(gate, probe, 0, 2)

    // Người dùng tăng giới hạn; provider dựng tiếp theo cho mục này mang trần mới, mức tăng dần tới trần.
    service.updateEntry(entryIds[0]!, { settings: { concurrencyLimit: 2 } })
    await warm(gate, probe, 2, 2)
    const both = [probe(), probe()]
    await tick()
    expect(gate.started()).toBe(6)
    gate.release(4)
    gate.release(5)
    await Promise.all(both)
  })

  it('starts an entry at one call and opens up to the default of 4 as calls succeed', async () => {
    const gate = gated()
    const { service, connectionId, entryIds } = setup(gate.handle)
    const probe = () => service.translator(connectionId, entryIds[0]!).provider.probe()
    const first = [probe(), probe()]
    await tick()
    expect(gate.started()).toBe(1)
    gate.release(0)
    await tick()
    gate.release(1)
    await Promise.all(first)

    await warm(gate, probe, 2, 4)
    const calls = Array.from({ length: 6 }, probe)
    await tick()
    expect(gate.started()).toBe(6 + 4)
    for (let index = 6; index < 12; index++) {
      gate.release(index)
      await tick()
    }
    await Promise.all(calls)
  })
})

describe("keys are the connection's, whichever entry asks", () => {
  it('lets an entry see that another entry of the same connection found a key rate limited', async () => {
    const { service, sent, connectionId, entryIds } = setup((one, index) => {
      // Lệnh gọi đầu tiên dùng khóa thứ nhất bị giới hạn tốc độ; các lệnh gọi còn lại thành công.
      if (index === 0) {
        return new Response(
          JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted' } }),
          { status: 429, headers: { 'content-type': 'application/json' } }
        )
      }
      void one
      return completion()
    })
    await service.addApiKey(connectionId, 'KEY-ONE-0001')
    await service.addApiKey(connectionId, 'KEY-TWO-0002')

    // Mục A: khóa thứ nhất bị rate limit, tự động chuyển sang khóa thứ hai và thành công.
    await service.translator(connectionId, entryIds[0]!).provider.probe()
    expect(sent.map((one) => one.authorization)).toEqual([
      'Bearer KEY-ONE-0001',
      'Bearer KEY-TWO-0002'
    ])

    // Mục B có hàng đợi và nhịp gọi riêng, nhưng dùng chung bộ điều phối khóa, nên bắt đầu ngay với khóa
    // còn hoạt động thay vì lặp lại lỗi 429.
    await service.translator(connectionId, entryIds[1]!).provider.probe()
    expect(sent[2]!.authorization).toBe('Bearer KEY-TWO-0002')
  })
})
