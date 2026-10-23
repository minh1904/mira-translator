import { describe, expect, it } from 'vitest'
import type { ChatChunk, ChatSendInput } from '../../../shared/contracts/aiChat'
import type { ChapterItem } from '../../../shared/contracts/chapters'
import type { LinkRecord } from '../../../shared/contracts/links'
import type { ConnectionView } from '../../../shared/contracts/aiConnections'
import type { TextRecord } from '../../../shared/contracts/text'
import { StorageError } from '../../infra/storage/errors'
import { ChatService, MAX_TOOL_ROUNDS, type ChatConnections } from './chatService'
import type { ConnectionTranslator } from './connectionService'
import type { Generation } from '../../infra/providers/generation'
import { OpenAiCompatibleProvider, type KeySource } from '../../infra/providers/openAiCompatible'
import { createTransport } from '../../infra/providers/transports/transportFactory'
import { resolveCompat } from '../../infra/providers/compat'
import type { ChatTransport } from '../../infra/providers/transports/transportShared'

/**
 * Vòng đời một lượt, chạy qua provider thật trên một endpoint giả.
 *
 * Ba luật bất biến là nội dung chính của tệp này: một `requestId` nhận
 * **đúng một** `done` hoặc `error`, không bao giờ cả hai, và không `delta` nào sau khi kết thúc. Hai
 * lượt chồng nhau có test riêng vì đó là ca mà `requestId` tồn tại để xử lý — nếu nó sai thì chữ của
 * hai câu trả lời trộn vào nhau, một lỗi người dùng thấy ngay nhưng test "đường thẳng" không bắt.
 */

const NOW = 1_700_000_000_000
const CONNECTION_ID = '7f1c2e5a-5b4d-4d5e-9c3a-1b2c3d4e5f60'
const WORK_ID = '11111111-2222-4333-8444-555555555555'
const CHAPTER_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa'
const ENTRY_ID = '5d6e7f80-9a1b-4c2d-8e3f-405162738495'

const delta = (text: string): string =>
  'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n'

const usageFrame = (input: number, output: number): string =>
  'data: ' +
  JSON.stringify({ choices: [], usage: { prompt_tokens: input, completion_tokens: output } }) +
  '\n\n'

const DONE = 'data: [DONE]\n\n'

/** Khung đóng lựa chọn, mang `finish_reason`. */
const finish = (reason: string): string =>
  'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] }) + '\n\n'

/** Phát từng chunk, chờ `gate` trước mỗi chunk khi có — để dựng hai lượt chạy song le. */
function sseResponse(
  chunks: string[],
  options: { signal?: AbortSignal; gate?: () => Promise<void> } = {}
): Response {
  const encoder = new TextEncoder()
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (options.gate) await options.gate()
      if (options.signal?.aborted) {
        controller.error(new Error('The operation was aborted.'))
        return
      }
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[index++]))
    }
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const keys: KeySource = {
  acquire: () => Promise.resolve({ id: 'k1', secret: 'SECRET' }),
  // Không ghi nhận số liệu: các bài kiểm tra này tập trung vào vòng đời của lượt hội thoại.
  report: () => Promise.resolve()
}

function connection(patch: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: CONNECTION_ID,
    name: 'Gemini',
    baseUrl: 'http://127.0.0.1:8317/v1',
    enabled: true,
    authKind: 'api_key',
    oauthProvider: null,
    apiMode: 'auto',
    account: null,
    providerId: 'google',
    defaultEntryId: null,
    checkedAt: null,
    keys: [{ id: 'k1', tail: '9f3a', state: 'ok', frozenUntil: null, frozenScope: null }],
    models: [],
    ...patch
  }
}

/** Một `ChatConnections` giả: mỗi lần `translator` được gọi thì dựng provider trên `fetchImpl`. */
function connections(
  fetchImpl: typeof fetch,
  options: {
    view?: ConnectionView
    throws?: StorageError
    /** Tên model thật của mục; quyết định giá lấy từ bảng dữ liệu. */
    model?: string
    /** Tham số sinh của mục, như `ConnectionService` dựng từ cài đặt của nó. */
    generation?: Generation
    /** Cách nói chuyện với model, như `createTransport` chọn cho kết nối. */
    transport?: ChatTransport
  } = {}
): ChatConnections & { calls: number; asked: string[] } {
  const holder = {
    calls: 0,
    asked: [] as string[],
    translator(_id: string, entryId: string): ConnectionTranslator {
      holder.calls += 1
      holder.asked.push(entryId)
      if (options.throws) throw options.throws
      const view = options.view ?? connection()
      const model = options.model ?? 'gemini-flash-latest'
      return {
        connection: view,
        entry: { id: entryId, name: model, model, settings: {} },
        settingsKey: 'k'.repeat(64),
        provider: new OpenAiCompatibleProvider({
          baseUrl: view.baseUrl,
          model,
          keys,
          generation: options.generation,
          ...(options.transport ? { transport: options.transport } : {}),
          fetchImpl,
          now: () => NOW
        }),
        lastKeyTail: () => '9f3a'
      }
    }
  }
  return holder
}

function input(patch: Partial<ChatSendInput> = {}): ChatSendInput {
  return {
    workId: WORK_ID,
    chapterId: CHAPTER_ID,
    connectionId: CONNECTION_ID,
    entryId: ENTRY_ID,
    sourceLang: 'en',
    question: 'Dịch tự nhiên hơn',
    history: [],
    location: { caret: { source: null, target: 2 }, selection: null },
    ...patch
  }
}

function service(conns: ChatConnections, ids: string[] = ['r1', 'r2', 'r3']): ChatService {
  const queue = [...ids]
  return new ChatService({
    connections: conns,
    newId: () => queue.shift() ?? 'rx',
    now: () => NOW
  })
}

/** Thu chunk và một promise chờ tới khi lượt `requestId` kết thúc. */
function collector(): {
  emit: (chunk: ChatChunk) => void
  chunks: ChatChunk[]
  settled(requestId: string): Promise<void>
} {
  const chunks: ChatChunk[] = []
  const waiting: Array<{ requestId: string; resolve: () => void }> = []
  return {
    chunks,
    emit(chunk) {
      chunks.push(chunk)
      // 'tool' là báo cáo tiến trình, không phải kết thúc: lượt hội thoại vẫn đang tiếp tục.
      if (
        chunk.kind === 'delta' ||
        chunk.kind === 'tool' ||
        chunk.kind === 'proposal' ||
        chunk.kind === 'reasoning'
      )
        return
      for (const entry of waiting.splice(0)) {
        if (entry.requestId === chunk.requestId) entry.resolve()
        else waiting.push(entry)
      }
    },
    settled(requestId) {
      const already = chunks.some(
        (c) =>
          c.requestId === requestId &&
          c.kind !== 'delta' &&
          c.kind !== 'tool' &&
          c.kind !== 'proposal' &&
          c.kind !== 'reasoning'
      )
      if (already) return Promise.resolve()
      return new Promise((resolve) => waiting.push({ requestId, resolve }))
    }
  }
}

const textOf = (chunks: ChatChunk[], requestId: string): string =>
  chunks
    .filter((c) => c.requestId === requestId && c.kind === 'delta')
    .map((c) => (c.kind === 'delta' ? c.text : ''))
    .join('')

const endingsOf = (chunks: ChatChunk[], requestId: string): string[] =>
  chunks
    .filter(
      (c) =>
        c.requestId === requestId &&
        c.kind !== 'delta' &&
        c.kind !== 'tool' &&
        c.kind !== 'proposal' &&
        c.kind !== 'reasoning'
    )
    .map((c) => c.kind)

describe('ChatService', () => {
  it('trả requestId ngay và phát chữ rồi đúng một done', async () => {
    const sink = collector()
    const conns = connections(async () =>
      sseResponse([delta('Nhờ '), delta('ngoại hình'), usageFrame(100, 20), DONE])
    )
    const chat = service(conns)

    const requestId = chat.start(input(), sink.emit)
    // Chưa có chunk nào lúc `start` trả về: nội dung không bao giờ đi qua đường trả về của `send`.
    expect(requestId).toBe('r1')
    expect(sink.chunks).toEqual([])

    await sink.settled(requestId)
    expect(textOf(sink.chunks, requestId)).toBe('Nhờ ngoại hình')
    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])
  })

  it('done mang usage, tiền và bốn ký tự cuối của khóa', async () => {
    const sink = collector()
    const conns = connections(async () =>
      sseResponse([delta('a'), usageFrame(1_000_000, 1_000_000), DONE])
    )
    const chat = service(conns)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const done = sink.chunks.find((c) => c.kind === 'done')
    expect(done).toMatchObject({
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      // gemini-flash-latest trong bản chụp: 0,75 vào + 3,75 ra cho một triệu token.
      usd: 4.5,
      keyTail: '9f3a'
    })
  })

  it('done nói câu trả lời bị cắt khi nhà cung cấp báo hết giới hạn đầu ra', async () => {
    const sink = collector()
    const conns = connections(async () => sseResponse([delta('Nửa câu'), finish('length'), DONE]))
    const chat = service(conns)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(sink.chunks.find((c) => c.kind === 'done')).toMatchObject({ finishReason: 'length' })
  })

  it('done nói câu trả lời xong êm khi nhà cung cấp báo stop', async () => {
    const sink = collector()
    const chat = service(
      connections(async () => sseResponse([delta('Xong'), finish('stop'), DONE]))
    )
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(sink.chunks.find((c) => c.kind === 'done')).toMatchObject({ finishReason: 'stop' })
  })

  it('done không có finishReason khi nhà cung cấp không nói: thiếu nghĩa là không biết', async () => {
    const sink = collector()
    const chat = service(connections(async () => sseResponse([delta('a'), DONE])))
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const done = sink.chunks.find((c) => c.kind === 'done')
    expect(done).toBeDefined()
    expect(done).not.toHaveProperty('finishReason')
  })

  it('dọn sổ sau khi lượt kết thúc, dù êm hay lỗi', async () => {
    const sink = collector()
    const chat = service(connections(async () => sseResponse([delta('a'), DONE])))
    const requestId = chat.start(input(), sink.emit)
    expect(chat.activeCount).toBe(1)
    await sink.settled(requestId)
    expect(chat.activeCount).toBe(0)
  })

  it('lỗi phát đúng một error, không kèm done, và nói rõ đã có chữ trước đó', async () => {
    const sink = collector()
    const errorFrame = 'data: ' + JSON.stringify({ error: { code: 429, message: 'hết' } }) + '\n\n'
    const chat = service(connections(async () => sseResponse([delta('một nửa'), errorFrame])))

    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(endingsOf(sink.chunks, requestId)).toEqual(['error'])
    const failure = sink.chunks.find((c) => c.kind === 'error')
    expect(failure).toMatchObject({ partial: true })
    expect(failure && failure.kind === 'error' && failure.error.kind).toBe('rate_limited')
    expect(textOf(sink.chunks, requestId)).toBe('một nửa')
  })

  it('lỗi ngay từ đầu nói partial là false', async () => {
    const sink = collector()
    const chat = service(
      connections(
        async () =>
          new Response(JSON.stringify({ error: { message: 'sai khóa' } }), { status: 401 })
      )
    )
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const failure = sink.chunks.find((c) => c.kind === 'error')
    expect(failure).toMatchObject({ partial: false })
    expect(failure && failure.kind === 'error' && failure.error.retryable).toBe(false)
  })

  it('yêu cầu sai cấu hình là lỗi cấu hình, không thử lại được, không phải "nhà cung cấp từ chối"', async () => {
    const sink = collector()
    const chat = service(
      connections(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 400, message: 'Request contains an invalid argument.' }
            }),
            { status: 400 }
          )
      )
    )
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const failure = sink.chunks.find((c) => c.kind === 'error')
    expect(failure && failure.kind === 'error' && failure.error).toMatchObject({
      kind: 'invalid_request',
      retryable: false
    })
    expect(failure && failure.kind === 'error' && failure.error.message).toContain(
      'Kiểm tra cài đặt model'
    )
  })

  it('hết hạn mức mang mốc hồi phục tính từ now', async () => {
    const sink = collector()
    const body = {
      error: {
        code: 429,
        message: 'Quota exceeded',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }]
      }
    }
    const chat = service(
      connections(async () => new Response(JSON.stringify(body), { status: 429 }))
    )
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const failure = sink.chunks.find((c) => c.kind === 'error')
    expect(failure && failure.kind === 'error' && failure.error.recoverAt).toBe(NOW + 30_000)
  })

  it('từ chối ngay khi kết nối đang tắt, không gọi ra ngoài', async () => {
    const sink = collector()
    let called = false
    const conns = connections(
      async () => {
        called = true
        return sseResponse([DONE])
      },
      { throws: new StorageError('validation', 'Kết nối “Gemini” đang tắt.') }
    )
    const chat = service(conns)

    expect(() => chat.start(input(), sink.emit)).toThrow('đang tắt')
    expect(called).toBe(false)
    expect(sink.chunks).toEqual([])
    expect(chat.activeCount).toBe(0)
  })

  // Hai lượt hội thoại chạy chồng nhau.
  it('giữ chữ của hai lượt tách biệt', async () => {
    const sink = collector()
    // Lượt đầu bị giữ ở cổng cho tới khi lượt hai xong, nên hai lượt thật sự chồng nhau.
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = true
    const conns = connections(async () => {
      if (first) {
        first = false
        let opened = false
        return sseResponse([delta('MỘT-a'), delta('MỘT-b'), DONE], {
          gate: async () => {
            if (opened) return
            opened = true
            await held
          }
        })
      }
      return sseResponse([delta('HAI-a'), delta('HAI-b'), DONE])
    })
    const chat = service(conns)

    const one = chat.start(input(), sink.emit)
    const two = chat.start(input(), sink.emit)
    expect(one).not.toBe(two)

    await sink.settled(two)
    release()
    await sink.settled(one)

    expect(textOf(sink.chunks, one)).toBe('MỘT-aMỘT-b')
    expect(textOf(sink.chunks, two)).toBe('HAI-aHAI-b')
    expect(endingsOf(sink.chunks, one)).toEqual(['done'])
    expect(endingsOf(sink.chunks, two)).toEqual(['done'])
  })

  it('hủy một lượt không dừng lượt còn lại', async () => {
    const sink = collector()
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = true
    const conns = connections(async (_url, init) => {
      const signal = init?.signal ?? undefined
      if (first) {
        first = false
        let opened = false
        return sseResponse([delta('MỘT'), delta('MỘT-nữa'), DONE], {
          signal: signal as AbortSignal,
          gate: async () => {
            if (opened) return
            opened = true
            await held
          }
        })
      }
      return sseResponse([delta('HAI'), DONE])
    })
    const chat = service(conns)

    const one = chat.start(input(), sink.emit)
    const two = chat.start(input(), sink.emit)

    chat.cancel(one)
    release()
    await sink.settled(two)
    await sink.settled(one)

    expect(endingsOf(sink.chunks, two)).toEqual(['done'])
    expect(textOf(sink.chunks, two)).toBe('HAI')
    const failure = sink.chunks.find((c) => c.requestId === one && c.kind === 'error')
    expect(failure && failure.kind === 'error' && failure.error.kind).toBe('cancelled')
  })

  it('cancelAll dọn sổ và không phát gì thêm', async () => {
    const sink = collector()
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const conns = connections(async (_url, init) =>
      sseResponse([delta('a'), delta('b'), DONE], {
        signal: (init?.signal ?? undefined) as AbortSignal,
        gate: () => held
      })
    )
    const chat = service(conns)
    chat.start(input(), sink.emit)

    chat.cancelAll()
    expect(chat.activeCount).toBe(0)
    release()
    // Lượt đã bị dọn khỏi sổ nên không có chunk nào được phát, kể cả lỗi.
    await Promise.resolve()
    await Promise.resolve()
    expect(sink.chunks).toEqual([])
  })

  it('usd là null khi model không có giá, không phải 0', async () => {
    const sink = collector()
    const chat = service(
      connections(async () => sseResponse([delta('a'), usageFrame(1000, 500), DONE]), {
        model: 'gemma-4-31b-it'
      })
    )
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const done = sink.chunks.find((c) => c.kind === 'done')
    expect(done).toMatchObject({ usage: { inputTokens: 1000, outputTokens: 500 }, usd: null })
  })

  it('usd là null khi model không có trong bản chụp', async () => {
    const sink = collector()
    const chat = service(
      connections(async () => sseResponse([delta('a'), usageFrame(1000, 500), DONE]), {
        model: 'model-khong-ton-tai'
      })
    )
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(sink.chunks.find((c) => c.kind === 'done')).toMatchObject({ usd: null })
  })

  it('usd là null khi nhà cung cấp không báo usage', async () => {
    const sink = collector()
    const chat = service(connections(async () => sseResponse([delta('a'), DONE])))
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(sink.chunks.find((c) => c.kind === 'done')).toMatchObject({ usage: null, usd: null })
  })
})

/**
 * Quy trình gọi công cụ để đọc dữ liệu trước khi trả lời.
 *
 * Các tham số gọi tool có thể truyền thành nhiều frame chia nhỏ, cần ghép đầy đủ trước khi thực thi.
 * Giới hạn số vòng gọi tool đảm bảo vòng lặp luôn dừng lại và kiểm soát chi phí token.
 */
const toolFrame = (fragment: unknown): string =>
  'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [fragment] } }] }) + '\n\n'

function fakeLibrary(): {
  listChapters: () => ChapterItem[]
  readText: () => TextRecord
  listLinks: () => LinkRecord[]
  reads: number
} {
  const holder = {
    reads: 0,
    listChapters: (): ChapterItem[] => [
      {
        id: 'ch-2',
        number: 2,
        title: 'Chương 2',
        createdAt: 0,
        updatedAt: 0,
        hasSource: true,
        hasTarget: false
      }
    ],
    readText: (): TextRecord => {
      holder.reads += 1
      return { content: 'Nội dung chương hai.', rev: 1, segments: [], updatedAt: 0 } as TextRecord
    },
    listLinks: (): LinkRecord[] => []
  }
  return holder
}

function serviceWithTools(
  conns: ChatConnections,
  library: ReturnType<typeof fakeLibrary>
): ChatService {
  const queue = ['r1', 'r2', 'r3']
  return new ChatService({
    connections: conns,
    library,
    newId: () => queue.shift() ?? 'rx',
    now: () => NOW
  })
}

describe('đọc bằng công cụ', () => {
  it('gom tham số bị cắt qua nhiều khung rồi đọc đúng chương', async () => {
    const sink = collector()
    const library = fakeLibrary()
    let round = 0
    const bodies: string[] = []

    const conns = connections(async (_url, init) => {
      bodies.push(String(init?.body ?? ''))
      round += 1
      if (round === 1) {
        return sseResponse([
          toolFrame({
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'read_chapter', arguments: '{"chapter":2,' }
          }),
          toolFrame({ index: 0, function: { arguments: '"side":"source"}' } }),
          DONE
        ])
      }
      return sseResponse([delta('Chương 2 nói về...'), usageFrame(50, 10), DONE])
    })

    const chat = serviceWithTools(conns, library)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(library.reads).toBe(1)
    expect(textOf(sink.chunks, requestId)).toBe('Chương 2 nói về...')
    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])

    // Lệnh gọi thứ hai truyền kết quả tool để model dựa vào đó trả lời.
    expect(bodies[1]).toContain('Nội dung chương hai.')
    expect(bodies[1]).toContain('call_1')
  })

  it('nói cho panel biết đã đọc gì, nhưng không gửi nội dung đã đọc', async () => {
    const sink = collector()
    let round = 0
    const conns = connections(async () => {
      round += 1
      if (round === 1) {
        return sseResponse([
          toolFrame({
            index: 0,
            id: 'c1',
            function: { name: 'read_chapter', arguments: '{"chapter":2,"side":"source"}' }
          }),
          DONE
        ])
      }
      return sseResponse([delta('xong'), DONE])
    })

    const chat = serviceWithTools(conns, fakeLibrary())
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const tool = sink.chunks.find((chunk) => chunk.kind === 'tool')
    expect(tool).toMatchObject({ name: 'read_chapter' })
    expect(tool && tool.kind === 'tool' && tool.detail).toContain('Chương 2 · bản gốc')
    expect(JSON.stringify(tool)).not.toContain('Nội dung chương hai')
  })

  it('hết ngân sách đọc của lượt thì công cụ báo hết, và lượt vẫn kết thúc bằng câu trả lời', async () => {
    const sink = collector()
    const long = Array.from({ length: 400 }, (_, i) => `Đoạn ${i + 1}. ` + 'chữ '.repeat(60)).join(
      '\n'
    )
    const library = {
      ...fakeLibrary(),
      readText: (): TextRecord => ({ content: long, rev: 1, segments: [] }) as unknown as TextRecord
    }
    const bodies: Array<{ tools?: unknown[] }> = []
    let round = 0
    // Model liên tục yêu cầu đọc trang tiếp theo chừng nào còn được cung cấp tool.
    const conns = connections(async (_url, init) => {
      const sent = JSON.parse(String(init?.body ?? '{}')) as {
        tools?: unknown[]
        messages: Array<{ role: string; content: string }>
      }
      bodies.push(sent)
      round += 1
      if (sent.tools === undefined) return sseResponse([delta('trả lời từ phần đã đọc'), DONE])
      const last = [...sent.messages].reverse().find((message) => message.role === 'tool')
      const cursor = last ? /con trỏ: (\S+)/.exec(last.content)?.[1] : undefined
      const args = cursor ? { chapter: 2, side: 'source', cursor } : { chapter: 2, side: 'source' }
      return sseResponse([
        toolFrame({
          index: 0,
          id: 'c' + round,
          function: { name: 'read_chapter', arguments: JSON.stringify(args) }
        }),
        DONE
      ])
    })

    const chat = serviceWithTools(conns, library)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const details = sink.chunks.flatMap((chunk) => (chunk.kind === 'tool' ? [chunk.detail] : []))
    expect(details).toHaveLength(MAX_TOOL_ROUNDS)
    // Các trang ngắt theo ranh giới đoạn văn bản.
    expect(details.slice(0, -1).every((detail) => detail.includes('còn tiếp'))).toBe(true)
    expect(details.at(-1)).toBe(`Hết ngân sách đọc của lượt (80.000 ký tự)`)
    expect(textOf(sink.chunks, requestId)).toBe('trả lời từ phần đã đọc')
    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])
    // Yêu cầu cuối cùng không cung cấp tool, buộc model phải đưa ra câu trả lời.
    expect(bodies).toHaveLength(MAX_TOOL_ROUNDS + 1)
    expect(bodies.at(-1)!.tools).toBeUndefined()
    expect(bodies.slice(0, -1).every((body) => Array.isArray(body.tools))).toBe(true)
  })

  it('cộng dồn hóa đơn của mọi vòng, không chỉ vòng cuối', async () => {
    const sink = collector()
    let round = 0
    const conns = connections(async () => {
      round += 1
      if (round === 1) {
        return sseResponse([
          toolFrame({
            index: 0,
            id: 'c1',
            function: { name: 'list_chapters', arguments: '{}' }
          }),
          usageFrame(100, 10),
          DONE
        ])
      }
      return sseResponse([delta('xong'), usageFrame(200, 20), DONE])
    })

    const chat = serviceWithTools(conns, fakeLibrary())
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(sink.chunks.find((chunk) => chunk.kind === 'done')).toMatchObject({
      usage: { inputTokens: 300, outputTokens: 30 }
    })
  })

  it('chạm trần số vòng thì trả lời bằng những gì đã có, không đọc tiếp mãi', async () => {
    const sink = collector()
    const library = fakeLibrary()
    let round = 0
    // Model liên tục yêu cầu đọc dữ liệu nếu không bị chặn lại.
    const conns = connections(async (_url, init) => {
      round += 1
      const sent = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown[] }
      if (sent.tools === undefined) return sseResponse([delta('đành trả lời vậy'), DONE])
      return sseResponse([
        toolFrame({
          index: 0,
          id: 'c' + round,
          function: { name: 'list_chapters', arguments: '{}' }
        }),
        DONE
      ])
    })

    const chat = serviceWithTools(conns, library)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])
    expect(textOf(sink.chunks, requestId)).toBe('đành trả lời vậy')
    // Cung cấp tool tối đa MAX_TOOL_ROUNDS vòng, sau đó là vòng cuối cùng không cung cấp tool.
    expect(round).toBe(MAX_TOOL_ROUNDS + 1)
  })

  it('đọc mục model một lần ở đầu lượt, và mọi vòng đọc công cụ gửi cùng một cấu hình', async () => {
    const sink = collector()
    const library = fakeLibrary()
    const bodies: Array<Record<string, unknown>> = []
    let round = 0
    const conns = connections(
      async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
        round += 1
        // Hai vòng đọc, sau đó là câu trả lời: tổng cộng 3 lần gọi provider trong một lượt.
        if (round <= 2) {
          return sseResponse([
            toolFrame({
              index: 0,
              id: 'c' + round,
              function: { name: 'list_chapters', arguments: '{}' }
            }),
            DONE
          ])
        }
        return sseResponse([delta('xong'), DONE])
      },
      { generation: { temperature: 0.3, reasoningEffort: 'none', extraBody: { top_k: 5 } } }
    )

    const chat = serviceWithTools(conns, library)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(bodies).toHaveLength(3)
    for (const body of bodies) {
      expect(body).toMatchObject({ temperature: 0.3, reasoning_effort: 'none', top_k: 5 })
    }
    // Cấu hình mục được đọc một lần cho cả lượt; thay đổi cài đặt giữa chừng chỉ áp dụng cho lượt kế tiếp.
    expect(conns.calls).toBe(1)
    expect(conns.asked).toEqual([ENTRY_ID])
  })

  it('không có kho thì lượt vẫn chạy, chỉ là không mời công cụ', async () => {
    const sink = collector()
    let sentTools: unknown
    const conns = connections(async (_url, init) => {
      sentTools = (JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown }).tools
      return sseResponse([delta('ok'), DONE])
    })

    const chat = service(conns)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    expect(sentTools).toBeUndefined()
    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])
  })
})

describe('tool ghi và vị trí (agentic-chat)', () => {
  const TARGET = 'Một.\n\nHai.\n\nBa.'
  function writableLibrary(): ReturnType<typeof fakeLibrary> {
    return {
      ...fakeLibrary(),
      listChapters: (): ChapterItem[] => [
        {
          id: CHAPTER_ID,
          number: 2,
          title: 'Chương 2',
          createdAt: 0,
          updatedAt: 0,
          hasSource: true,
          hasTarget: true
        }
      ],
      readText: (_work?: string, _chapter?: string, side?: string): TextRecord =>
        ({
          content: side === 'source' ? '一。\n\n二。\n\n三。' : TARGET,
          rev: 3,
          segments: [],
          updatedAt: 0
        }) as unknown as TextRecord
    }
  }

  function proposeOnce(args: unknown): ReturnType<typeof connections> {
    let round = 0
    return connections(async () => {
      round += 1
      if (round === 1) {
        return sseResponse([
          toolFrame({
            index: 0,
            id: 'w1',
            function: { name: 'propose_edit', arguments: JSON.stringify(args) }
          }),
          DONE
        ])
      }
      // Phản hồi có chứa khối code markdown nhưng không phải là đề xuất chỉnh sửa.
      return sseResponse([delta('Đã đề xuất.\n\n```\nHai khác.\n```'), finish('stop'), DONE])
    })
  }

  it('gửi chunk proposal trước done, và không tạo đề xuất từ chữ của câu trả lời', async () => {
    const sink = collector()
    const created: unknown[] = []
    const updates: Array<{ status: string; tools: unknown[] }> = []
    const chat = new ChatService({
      connections: proposeOnce({ chapter: 2, from: 2, to: 2, text: 'Hai đã sửa.' }),
      library: writableLibrary(),
      writes: {
        createProposal: (_workId, input) => {
          created.push(input)
          return { proposalId: 'p1', partIds: ['part1'] }
        },
        createTerm: () => {
          throw new Error('not used')
        }
      },
      records: {
        start: () => 's1',
        update: (_id, _work, patch) => updates.push(patch)
      },
      newId: () => 'r1',
      now: () => NOW
    })
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)

    const kinds = sink.chunks.map((chunk) => chunk.kind)
    expect(kinds.indexOf('proposal')).toBeGreaterThan(-1)
    expect(kinds.indexOf('proposal')).toBeLessThan(kinds.indexOf('done'))
    expect(sink.chunks.find((chunk) => chunk.kind === 'proposal')).toMatchObject({
      proposal: { type: 'edit', proposalId: 'p1', partIds: ['part1'], label: 'Sửa đoạn 2 bản dịch' }
    })
    expect(created).toEqual([
      expect.objectContaining({
        turnId: 'r1',
        commandId: 'r1:1',
        targetBaseRev: 3,
        part: expect.objectContaining({ beforeText: 'Hai.', afterText: 'Hai đã sửa.' })
      })
    ])
    const final = updates.at(-1)!
    expect(final.status).toBe('done')
    expect(final.tools).toEqual([
      expect.objectContaining({ name: 'propose_edit', status: 'ok', proposal: expect.anything() })
    ])
  })

  it('không có lối ghi thì tool ghi báo lỗi, lượt vẫn xong', async () => {
    const sink = collector()
    const chat = new ChatService({
      connections: proposeOnce({ chapter: 2, from: 2, to: 2, text: 'Hai đã sửa.' }),
      library: writableLibrary(),
      newId: () => 'r1',
      now: () => NOW
    })
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)
    expect(sink.chunks.find((chunk) => chunk.kind === 'tool')).toMatchObject({
      name: 'propose_edit',
      status: 'error',
      detail: 'Lượt này không được tạo đề xuất.'
    })
    expect(sink.chunks.some((chunk) => chunk.kind === 'proposal')).toBe(false)
    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])
  })

  it('đặt vị trí người dùng ở cuối system prompt, không gửi kèm văn bản chương', async () => {
    let sent: Array<{ role: string; content: string }> = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = (JSON.parse(String(init?.body)) as { messages: typeof sent }).messages
      return sseResponse([delta('ok'), DONE])
    }) as typeof fetch
    const sink = collector()
    const chat = new ChatService({
      connections: connections(fetchImpl),
      chapter: () => ({ workTitle: 'Tác phẩm', number: 2, title: 'Chương 2' }),
      newId: () => 'r1',
      now: () => NOW
    })
    const requestId = chat.start(
      input({
        location: { caret: { source: 1, target: 2 }, selection: { side: 'target', from: 2, to: 3 } }
      }),
      sink.emit
    )
    await sink.settled(requestId)
    expect(sent[0].content).toMatch(/Đang chọn đoạn 2–3 bản dịch\.\n<\/location>$/)
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'Dịch tự nhiên hơn' })
  })
})

describe('Copilot qua chat (subscription-providers, 4.3)', () => {
  it('vòng đầu là của người dùng, các vòng trả lời tool là của agent', async () => {
    const initiators: string[] = []
    let round = 0
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      initiators.push((init.headers as Record<string, string>)['x-initiator'])
      round += 1
      if (round <= 2) {
        return sseResponse([
          toolFrame({
            index: 0,
            id: 'c' + round,
            function: { name: 'list_chapters', arguments: '{}' }
          }),
          DONE
        ])
      }
      return sseResponse([delta('xong'), DONE])
    }) as typeof fetch
    const transport = createTransport(
      { baseUrl: '', providerId: null, oauthProvider: 'copilot', apiMode: 'auto' },
      'claude-sonnet-4.6',
      { fetchImpl, now: () => NOW, compat: resolveCompat(null), userAgent: 'Mira/test' }
    )
    const sink = collector()
    const chat = new ChatService({
      connections: connections(fetchImpl, { transport, model: 'claude-sonnet-4.6' }),
      library: fakeLibrary(),
      newId: () => 'r1',
      now: () => NOW
    })
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)
    expect(initiators).toEqual(['user', 'agent', 'agent'])
  })
})

describe('suy luận của model', () => {
  it('gửi phần suy luận lên panel tách khỏi câu trả lời, và lưu cùng lượt', async () => {
    const reasoning = (text: string): string =>
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: text } }] }) + '\n\n'
    const sink = collector()
    const updates: Array<{ status: string; reasoning?: string; answer: string }> = []
    const chat = new ChatService({
      connections: connections((async () =>
        sseResponse([
          reasoning('Người dùng '),
          reasoning('chào.'),
          delta('Chào bạn!'),
          DONE
        ])) as typeof fetch),
      records: { start: () => 's1', update: (_id, _work, patch) => updates.push(patch) },
      newId: () => 'r1',
      now: () => NOW
    })
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)
    expect(sink.chunks.filter((chunk) => chunk.kind === 'reasoning')).toEqual([
      { requestId, kind: 'reasoning', text: 'Người dùng ' },
      { requestId, kind: 'reasoning', text: 'chào.' }
    ])
    expect(textOf(sink.chunks, requestId)).toBe('Chào bạn!')
    expect(updates.at(-1)).toMatchObject({
      status: 'done',
      reasoning: 'Người dùng chào.',
      answer: 'Chào bạn!'
    })
  })
})

describe('Chuyển đổi model dự phòng trong ChatService', () => {
  const FALLBACK_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

  /** Mục chính phản hồi bằng `primary`; mục dự phòng phản hồi bằng stream hợp lệ. */
  function withFallback(primary: () => Response): ChatConnections & { asked: string[] } {
    const asked: string[] = []
    const make = (
      entryId: string,
      fetchImpl: typeof fetch,
      model: string
    ): ConnectionTranslator => ({
      connection: connection({ name: entryId === FALLBACK_ID ? 'Dự phòng' : 'Gemini' }),
      entry: { id: entryId, name: model, model, settings: {} },
      settingsKey: 'k'.repeat(64),
      provider: new OpenAiCompatibleProvider({
        baseUrl: 'http://127.0.0.1:8317/v1',
        model,
        keys,
        fetchImpl,
        now: () => NOW,
        retry: { maxRetries: 0 }
      }),
      lastKeyTail: () => '9f3a'
    })
    return {
      asked,
      translator(_id, entryId) {
        asked.push(entryId)
        return entryId === FALLBACK_ID
          ? make(entryId, async () => sseResponse([delta('Từ dự phòng'), DONE]), 'deepseek-v4')
          : make(entryId, async () => primary(), 'gemini-gone')
      },
      preferences: () => ({ fallbacks: [{ connectionId: CONNECTION_ID, entryId: FALLBACK_ID }] })
    }
  }

  const gone = (): Response =>
    new Response(JSON.stringify({ error: { message: 'model gemini-gone not found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })

  it('moves on to the fallback when the main model is gone, and says so on the turn', async () => {
    const sink = collector()
    const conns = withFallback(gone)
    const chat = service(conns)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)
    expect(textOf(sink.chunks, requestId)).toBe('Từ dự phòng')
    expect(endingsOf(sink.chunks, requestId)).toEqual(['done'])
    const line = sink.chunks.find((c) => c.kind === 'tool' && c.name === 'fallback')
    expect(line && line.kind === 'tool' ? line.detail : '').toMatch(
      /^Đã chuyển sang Dự phòng · deepseek-v4 vì Gemini · gemini-gone model không tồn tại/
    )
    expect(conns.asked).toEqual([ENTRY_ID, FALLBACK_ID])
  })

  it('does not move on for a refused request', async () => {
    const sink = collector()
    const conns = withFallback(
      () =>
        new Response(JSON.stringify({ error: { message: 'bad parameter temperature' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
    )
    const chat = service(conns)
    const requestId = chat.start(input(), sink.emit)
    await sink.settled(requestId)
    expect(endingsOf(sink.chunks, requestId)).toEqual(['error'])
    expect(conns.asked).toEqual([ENTRY_ID])
  })
})
