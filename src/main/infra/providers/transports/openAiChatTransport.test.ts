import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveCompat, type Compat } from '../compat'
import {
  OpenAiChatTransport,
  buildChatBody,
  buildHeaders,
  mapFinishReason,
  parseChatFrame,
  type ChatRequest,
  type ChatStreamEvent,
  type TransportTimeouts
} from './openAiChatTransport'
import { ProviderError } from '../types'

const NOW = 1_700_000_000_000
const KEY = 'AIzaSyD-test-key-0123456789'
const STANDARD: Compat = resolveCompat(null)
const GEMINI: Compat = resolveCompat('google')

const ask: ChatRequest = { model: 'gemini-test', messages: [{ role: 'user', content: 'xin chào' }] }

afterEach(() => {
  vi.useRealTimers()
})

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response

/** Triển khai `fetch` giả lập ghi nhận các yêu cầu và trả về kết quả qua `handler`. */
function fetchFake(
  handler: Handler
): typeof fetch & { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fake = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init })
    return handler(String(input), init)
  }) as typeof fetch & { calls: typeof calls }
  fake.calls = calls
  return fake
}

/** Từ chối yêu cầu tương tự như `fetch` thật khi signal bị hủy. */
function untilAborted(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = (): void => reject(new DOMException('The operation was aborted.', 'AbortError'))
    if (signal?.aborted) fail()
    else signal?.addEventListener('abort', fail, { once: true })
  })
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

/** Thân luồng SSE phát các khối dữ liệu ngay lập tức rồi giữ im lặng cho đến khi bị hủy. */
function sseThenSilence(chunks: string[], signal?: AbortSignal | null): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      signal?.addEventListener('abort', () => controller.error(new Error('aborted')), {
        once: true
      })
    }
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** Thân luồng SSE phát toàn bộ các khối dữ liệu rồi kết thúc. */
function sse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) controller.close()
      else controller.enqueue(encoder.encode(chunks[index++]))
    }
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const frame = (payload: unknown): string => 'data: ' + JSON.stringify(payload) + '\n\n'
const delta = (text: string): string => frame({ choices: [{ delta: { content: text } }] })
const finish = (reason: string): string =>
  frame({ choices: [{ delta: {}, finish_reason: reason }] })
const usageFrame = (usage: unknown): string => frame({ choices: [], usage })
const DONE = 'data: [DONE]\n\n'

function transport(
  fetchImpl: typeof fetch,
  over: { compat?: Compat; timeouts?: Partial<TransportTimeouts>; baseUrl?: string } = {}
): OpenAiChatTransport {
  return new OpenAiChatTransport({
    baseUrl: over.baseUrl ?? 'https://api.example.test/v1',
    compat: over.compat ?? STANDARD,
    fetchImpl,
    now: () => NOW,
    timeouts: over.timeouts
  })
}

async function collect(stream: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

/** Dữ liệu luồng stream phát ra trước khi gặp lỗi cùng với lỗi tương ứng. */
async function collectUntilError(
  stream: AsyncGenerator<ChatStreamEvent>
): Promise<{ events: ChatStreamEvent[]; error: unknown }> {
  const events: ChatStreamEvent[] = []
  try {
    for await (const event of stream) events.push(event)
  } catch (error) {
    return { events, error }
  }
  return { events, error: null }
}

describe('buildChatBody', () => {
  it('sends only the model and messages when the caller set nothing else', () => {
    expect(Object.keys(buildChatBody(ask, STANDARD, false)).sort()).toEqual(['messages', 'model'])
  })

  it('writes a call’s response_format, and lets extra_body have the last word', () => {
    const format = { type: 'json_schema', json_schema: { name: 't', schema: {} } }
    expect(buildChatBody({ ...ask, responseFormat: format }, STANDARD, false)).toMatchObject({
      response_format: format
    })
    const mine = { type: 'json_object' }
    expect(
      buildChatBody(
        { ...ask, responseFormat: format, extraBody: { response_format: mine } },
        STANDARD,
        false
      ).response_format
    ).toEqual(mine)
  })

  it('adds the stream flags for a streamed call, and asks for usage only where that is accepted', () => {
    expect(buildChatBody(ask, STANDARD, true)).toMatchObject({
      stream: true,
      stream_options: { include_usage: true }
    })
    const quiet = buildChatBody(ask, { ...STANDARD, streamUsage: false }, true)
    expect(quiet.stream).toBe(true)
    expect(quiet).not.toHaveProperty('stream_options')
  })

  it('puts the output cap in the field the endpoint uses, and in no other', () => {
    const gemini = buildChatBody({ ...ask, maxTokens: 64 }, GEMINI, false)
    expect(gemini.max_tokens).toBe(64)
    expect(gemini).not.toHaveProperty('max_completion_tokens')
    const openai = buildChatBody({ ...ask, maxTokens: 64 }, STANDARD, false)
    expect(openai.max_completion_tokens).toBe(64)
    expect(openai).not.toHaveProperty('max_tokens')
  })

  it('sends temperature, top_p and reasoning effort only when set', () => {
    const set = buildChatBody(
      { ...ask, temperature: 0.3, topP: 0.9, reasoningEffort: 'low' },
      STANDARD,
      false
    )
    expect(set).toMatchObject({ temperature: 0.3, top_p: 0.9, reasoning_effort: 'low' })
    const bare = buildChatBody(ask, STANDARD, false)
    for (const field of ['temperature', 'top_p', 'reasoning_effort']) {
      expect(bare).not.toHaveProperty(field)
    }
  })

  it('sends top_p of 0 and a temperature of 0, which are values and not "unset"', () => {
    const body = buildChatBody({ ...ask, temperature: 0, topP: 0 }, STANDARD, false)
    expect(body).toMatchObject({ temperature: 0, top_p: 0 })
  })

  it('sends the reasoning effort the person chose to every endpoint, and never drops it', () => {
    // Tham số cấu hình được gửi đi trực tiếp đến endpoint thay vì bị lược bỏ trước.
    for (const compat of [STANDARD, GEMINI, resolveCompat('some-gateway')]) {
      expect(buildChatBody({ ...ask, reasoningEffort: 'none' }, compat, false)).toMatchObject({
        reasoning_effort: 'none'
      })
    }
  })

  it('lists tools only when there are some', () => {
    expect(buildChatBody({ ...ask, tools: [] }, STANDARD, false)).not.toHaveProperty('tools')
    expect(buildChatBody({ ...ask, tools: [{ type: 'function' }] }, STANDARD, false).tools).toEqual(
      [{ type: 'function' }]
    )
  })

  it('lets the extra body have the last word', () => {
    const body = buildChatBody(
      { ...ask, temperature: 0.3, extraBody: { temperature: 1, top_k: 5 } },
      STANDARD,
      false
    )
    expect(body).toMatchObject({ temperature: 1, top_k: 5 })
  })

  it('does not let the extra body overwrite the fields the answer is read by', () => {
    const tools = [{ type: 'function' }]
    const body = buildChatBody(
      {
        ...ask,
        tools,
        extraBody: {
          model: 'other',
          messages: [],
          stream: false,
          stream_options: { include_usage: false },
          tools: [],
          top_k: 5
        }
      },
      STANDARD,
      true
    )
    expect(body.model).toBe('gemini-test')
    expect(body.messages).toEqual(ask.messages)
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.tools).toEqual(tools)
    // Các trường không thuộc danh sách bảo vệ vẫn được truyền qua.
    expect(body.top_k).toBe(5)
  })

  it('leaves the body alone when the extra body is empty or absent', () => {
    expect(buildChatBody({ ...ask, extraBody: {} }, STANDARD, false)).toEqual(
      buildChatBody(ask, STANDARD, false)
    )
  })
})

describe('buildHeaders', () => {
  const own = { accept: 'application/json', authorization: 'Bearer real' }

  it('adds the extra headers beside the ones Mira sets', () => {
    expect(buildHeaders(own, { 'HTTP-Referer': 'https://mira.app' })).toEqual({
      ...own,
      'HTTP-Referer': 'https://mira.app'
    })
  })

  it('returns only its own when there are no extras', () => {
    expect(buildHeaders(own, undefined)).toEqual(own)
    expect(buildHeaders(own, {})).toEqual(own)
  })

  it('never lets an extra header replace or sit beside the real authorization, in any case', () => {
    for (const name of ['Authorization', 'AUTHORIZATION', 'authorization']) {
      const merged = buildHeaders(own, { [name]: 'Bearer stolen' })
      expect(merged.authorization).toBe('Bearer real')
      expect(Object.keys(merged).filter((key) => key.toLowerCase() === 'authorization')).toEqual([
        'authorization'
      ])
    }
  })

  it('drops the other headers that carry a key or describe the body', () => {
    const merged = buildHeaders(own, {
      'X-Api-Key': 'k',
      'x-goog-api-key': 'k',
      'api-key': 'k',
      Host: 'evil.example',
      'Content-Type': 'text/plain',
      'Content-Length': '1',
      Accept: 'text/html',
      'X-Kept': 'yes'
    })
    expect(merged).toEqual({ ...own, 'X-Kept': 'yes' })
  })
})

describe('mapFinishReason', () => {
  it('translates the endpoint words, and calls anything else unknown', () => {
    expect(mapFinishReason('stop')).toBe('stop')
    expect(mapFinishReason('length')).toBe('length')
    expect(mapFinishReason('tool_calls')).toBe('tool_calls')
    expect(mapFinishReason('function_call')).toBe('tool_calls')
    expect(mapFinishReason('content_filter')).toBe('filter')
    expect(mapFinishReason('content_filter: PROHIBITED_CONTENT')).toBe('filter')
    expect(mapFinishReason('content_filter: RECITATION')).toBe('filter')
    expect(mapFinishReason('weird')).toBe('unknown')
    expect(mapFinishReason(undefined)).toBe('unknown')
    expect(mapFinishReason(null)).toBe('unknown')
  })
})

describe('parseChatFrame finish_reason', () => {
  it('carries the reason on the frame that closes the choice', () => {
    expect(
      parseChatFrame(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] }))
        ?.finishReason
    ).toBe('length')
    expect(
      parseChatFrame(
        JSON.stringify({ choices: [{ delta: { content: 'a' }, finish_reason: null }] })
      )
    ).not.toHaveProperty('finishReason')
  })
})

describe('complete', () => {
  it('returns the text, why it ended, the usage and the status', async () => {
    const t = transport(
      fetchFake(() =>
        json({
          choices: [{ message: { content: 'Xin chào' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3 }
        })
      )
    )
    expect(await t.complete(ask, { apiKey: KEY })).toEqual({
      text: 'Xin chào',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 3 },
      status: 200
    })
  })

  it('says "cut off" when the endpoint ended the answer because it ran out of room', async () => {
    const t = transport(
      fetchFake(() =>
        json({ choices: [{ message: { content: '[{"id":' }, finish_reason: 'length' }] })
      )
    )
    expect((await t.complete(ask, { apiKey: null })).finishReason).toBe('length')
  })

  it('returns a filtered answer with no text as "filter", not as a broken response', async () => {
    // Trường hợp endpoint tương thích OpenAI của Gemini chặn phản hồi bằng bộ lọc nội dung.
    const t = transport(
      fetchFake(() =>
        json({
          choices: [
            { message: { role: 'assistant' }, finish_reason: 'content_filter: PROHIBITED_CONTENT' }
          ],
          usage: { prompt_tokens: 50, completion_tokens: 0 }
        })
      )
    )
    expect(await t.complete(ask, { apiKey: KEY })).toEqual({
      text: '',
      finishReason: 'filter',
      filter: { group: 'prohibited', raw: 'PROHIBITED_CONTENT' },
      usage: { inputTokens: 50, outputTokens: 0 },
      status: 200
    })
  })

  it('still rejects an answer with no text that was not filtered', async () => {
    const t = transport(fetchFake(() => json({ choices: [{ finish_reason: 'stop' }] })))
    const error = (await t.complete(ask, { apiKey: KEY }).catch((e: unknown) => e)) as ProviderError
    expect(error.kind).toBe('invalid_response')
  })

  it('reports no usage as no usage, and no finish_reason as unknown', async () => {
    const t = transport(fetchFake(() => json({ choices: [{ message: { content: 'a' } }] })))
    expect(await t.complete(ask, { apiKey: null })).toMatchObject({
      usage: null,
      finishReason: 'unknown'
    })
  })

  it('posts to the base with the key, once, and with only the fields that were set', async () => {
    const fake = fetchFake(() => json({ choices: [{ message: { content: 'a' } }] }))
    await transport(fake, { baseUrl: 'https://api.example.test/v1/chat/completions/' }).complete(
      ask,
      { apiKey: KEY }
    )
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]!.url).toBe('https://api.example.test/v1/chat/completions')
    expect((fake.calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer ' + KEY
    )
    expect(Object.keys(JSON.parse(String(fake.calls[0]!.init.body))).sort()).toEqual([
      'messages',
      'model'
    ])
  })

  it('sends no Authorization header for an endpoint that wants no key', async () => {
    const fake = fetchFake(() => json({ choices: [{ message: { content: 'a' } }] }))
    await transport(fake).complete(ask, { apiKey: null })
    expect(fake.calls[0]!.init.headers).not.toHaveProperty('authorization')
  })

  it('sends the extra headers of the request, and the key still goes by the one path', async () => {
    const fake = fetchFake(() => json({ choices: [{ message: { content: 'a' } }] }))
    await transport(fake).complete(
      {
        ...ask,
        extraHeaders: { 'HTTP-Referer': 'https://mira.app', Authorization: 'Bearer stolen' }
      },
      { apiKey: KEY }
    )
    const headers = fake.calls[0]!.init.headers as Record<string, string>
    expect(headers['HTTP-Referer']).toBe('https://mira.app')
    expect(headers.authorization).toBe('Bearer ' + KEY)
    expect(JSON.stringify(headers)).not.toContain('stolen')
  })

  it('does not put the extra headers on the model list, which has no entry behind it', async () => {
    const fake = fetchFake(() => json({ data: [] }))
    await transport(fake).listModels({ apiKey: KEY })
    expect(fake.calls[0]!.init.headers).not.toHaveProperty('HTTP-Referer')
  })

  it('tells the person what the provider said when it refuses a parameter, and asks only once', async () => {
    const fake = fetchFake(() =>
      json(
        {
          error: {
            code: 400,
            message: 'Unsupported parameter: temperature',
            status: 'INVALID_ARGUMENT'
          }
        },
        400
      )
    )
    const error = await transport(fake)
      .complete({ ...ask, temperature: 0.3 }, { apiKey: KEY })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    expect((error as ProviderError).kind).toBe('invalid_request')
    expect((error as ProviderError).message).toContain('Unsupported parameter: temperature')
    // Lỗi ghi nhận các tham số đã gửi để có thể thông báo chi tiết trong thông điệp.
    expect((error as ProviderError).sent).toEqual({
      temperature: 0.3,
      extraBodyKeys: [],
      responseFormat: false
    })
    // Không tự ý gọi lại lần hai mà thiếu tham số: việc bỏ tham số do người dùng quyết định.
    expect(fake.calls).toHaveLength(1)
    expect(JSON.parse(String(fake.calls[0]!.init.body))).toMatchObject({ temperature: 0.3 })
  })

  it('throws a typed error carrying the status, the wait and an excerpt of the body', async () => {
    const body = {
      error: {
        code: 429,
        message: 'slow down',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }]
      }
    }
    const t = transport(fetchFake(() => json(body, 429)))
    const error = await t.complete(ask, { apiKey: KEY }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({
      kind: 'rate_limited',
      status: 429,
      retryAfterMs: 7_000,
      receivedAt: NOW
    })
    expect((error as ProviderError).bodySnippet).toContain('slow down')
  })

  it('never lets the key it sent come back out in an error', async () => {
    const t = transport(fetchFake(() => json({ error: { message: 'bad key ' + KEY } }, 400)))
    const error = (await t.complete(ask, { apiKey: KEY }).catch((e: unknown) => e)) as ProviderError
    expect(error.message).not.toContain(KEY)
    expect(error.bodySnippet).not.toContain(KEY)
  })

  it('scrubs the key out of a network failure message too', async () => {
    const t = transport(
      fetchFake(() => {
        throw new TypeError('connect failed for Bearer ' + KEY)
      })
    )
    const error = (await t.complete(ask, { apiKey: KEY }).catch((e: unknown) => e)) as ProviderError
    expect(error).toMatchObject({ kind: 'network' })
    expect(error.message).not.toContain(KEY)
  })

  it('is invalid_response, not a stray exception, when a 200 is not JSON or has no text', async () => {
    const notJson = transport(fetchFake(() => new Response('<html>oops</html>', { status: 200 })))
    expect(await notJson.complete(ask, { apiKey: null }).catch((e: unknown) => e)).toMatchObject({
      kind: 'invalid_response'
    })
    const noText = transport(fetchFake(() => json({ choices: [{ message: {} }] })))
    expect(await noText.complete(ask, { apiKey: null }).catch((e: unknown) => e)).toMatchObject({
      kind: 'invalid_response'
    })
  })
})

describe('stream', () => {
  it('yields the text as it comes and ends with one done carrying the reason and usage', async () => {
    const t = transport(
      fetchFake(() =>
        sse([
          delta('xin '),
          delta('chào'),
          finish('stop'),
          usageFrame({ prompt_tokens: 12, completion_tokens: 3 }),
          DONE
        ])
      )
    )
    expect(await collect(t.stream(ask, { apiKey: KEY }))).toEqual([
      { kind: 'delta', text: 'xin ' },
      { kind: 'delta', text: 'chào' },
      { kind: 'done', usage: { inputTokens: 12, outputTokens: 3 }, finishReason: 'stop' }
    ])
  })

  it('ends a filtered stream with the reason the provider gave', async () => {
    const t = transport(fetchFake(() => sse([finish('content_filter: RECITATION'), DONE])))
    expect(await collect(t.stream(ask, { apiKey: KEY }))).toEqual([
      {
        kind: 'done',
        usage: null,
        finishReason: 'filter',
        filter: { group: 'recitation', raw: 'RECITATION' }
      }
    ])
  })

  it('names what it sent when the provider rejects the request, and never the key', async () => {
    const t = transport(
      fetchFake(() =>
        json({ error: { code: 400, message: 'Request contains an invalid argument.' } }, 400)
      )
    )
    const error = (await collect(
      t.stream(
        {
          ...ask,
          reasoningEffort: 'none',
          maxTokens: 800,
          extraBody: { google: { thinking_config: {} }, seed: 1 },
          extraHeaders: { 'x-trace': 'abc' }
        },
        { apiKey: KEY }
      )
    ).catch((caught: unknown) => caught)) as ProviderError
    expect(error.kind).toBe('invalid_request')
    expect(error.sent).toEqual({
      reasoningEffort: 'none',
      maxTokens: 800,
      extraBodyKeys: ['google', 'seed'],
      responseFormat: false
    })
    expect(JSON.stringify(error.sent)).not.toContain(KEY)
    expect(JSON.stringify(error.sent)).not.toContain('x-trace')
  })

  it('reports a cut-off answer as such', async () => {
    const t = transport(fetchFake(() => sse([delta('abc'), finish('length'), DONE])))
    expect((await collect(t.stream(ask, { apiKey: null }))).at(-1)).toMatchObject({
      kind: 'done',
      finishReason: 'length'
    })
  })

  it('reports an endpoint that never says why as unknown', async () => {
    const t = transport(fetchFake(() => sse([delta('abc'), DONE])))
    expect((await collect(t.stream(ask, { apiKey: null }))).at(-1)).toEqual({
      kind: 'done',
      usage: null,
      finishReason: 'unknown'
    })
  })

  it('asks for usage in the stream and sends nothing nobody set', async () => {
    const fake = fetchFake(() => sse([delta('a'), DONE]))
    await collect(transport(fake).stream(ask, { apiKey: null }))
    expect(Object.keys(JSON.parse(String(fake.calls[0]!.init.body))).sort()).toEqual([
      'messages',
      'model',
      'stream',
      'stream_options'
    ])
  })

  it('sends the extra headers on a stream too, and the key is not theirs to replace', async () => {
    const fake = fetchFake(() => sse([delta('a'), DONE]))
    await collect(
      transport(fake).stream(
        { ...ask, extraHeaders: { 'X-Title': 'Mira', 'x-api-key': 'stolen' } },
        { apiKey: KEY }
      )
    )
    const headers = fake.calls[0]!.init.headers as Record<string, string>
    expect(headers['X-Title']).toBe('Mira')
    expect(headers.authorization).toBe('Bearer ' + KEY)
    expect(headers).not.toHaveProperty('x-api-key')
  })

  it('puts a tool call back together from its fragments', async () => {
    const t = transport(
      fetchFake(() =>
        sse([
          frame({
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, id: 'c1', function: { name: 'read_chapter', arguments: '{"chap' } }
                  ]
                }
              }
            ]
          }),
          frame({
            choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ter":2}' } }] } }]
          }),
          finish('tool_calls'),
          DONE
        ])
      )
    )
    expect(await collect(t.stream(ask, { apiKey: null }))).toEqual([
      {
        kind: 'tool-calls',
        calls: [{ id: 'c1', name: 'read_chapter', arguments: '{"chapter":2}' }],
        usage: null,
        finishReason: 'tool_calls'
      }
    ])
  })

  it('keeps parallel calls apart when the endpoint leaves out their index', async () => {
    const t = transport(
      fetchFake(() =>
        sse([
          frame({
            choices: [
              {
                delta: {
                  tool_calls: [
                    { id: 'c1', function: { name: 'read_task', arguments: '{"task":"a"}' } },
                    { id: 'c2', function: { name: 'resolve_target', arguments: '{"name":"New"}' } }
                  ]
                }
              }
            ]
          }),
          finish('tool_calls'),
          DONE
        ])
      )
    )
    expect(await collect(t.stream(ask, { apiKey: null }))).toEqual([
      {
        kind: 'tool-calls',
        calls: [
          { id: 'c1', name: 'read_task', arguments: '{"task":"a"}' },
          { id: 'c2', name: 'resolve_target', arguments: '{"name":"New"}' }
        ],
        usage: null,
        finishReason: 'tool_calls'
      }
    ])
  })

  it("keeps Gemini's thought signature on a tool call", async () => {
    const extra = { google: { thought_signature: 'sig' } }
    const t = transport(
      fetchFake(() =>
        sse([
          frame({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'c1',
                      function: { name: 'list_works', arguments: '{}' },
                      extra_content: extra
                    }
                  ]
                }
              }
            ]
          }),
          finish('tool_calls'),
          DONE
        ])
      )
    )
    const [event] = await collect(t.stream(ask, { apiKey: null }))
    expect(event).toMatchObject({ calls: [{ id: 'c1', extra }] })
  })

  it('keeps the text it already gave when an error frame arrives in the middle', async () => {
    const t = transport(
      fetchFake(() =>
        sse([delta('một nửa'), frame({ error: { code: 503, message: 'overloaded' } })])
      )
    )
    const { events, error } = await collectUntilError(t.stream(ask, { apiKey: KEY }))
    expect(events).toEqual([{ kind: 'delta', text: 'một nửa' }])
    expect(error).toMatchObject({ kind: 'network', status: 503 })
  })

  it('throws before any event when the answer is an HTTP error', async () => {
    const t = transport(fetchFake(() => json({ error: { message: 'no key' } }, 401)))
    const { events, error } = await collectUntilError(t.stream(ask, { apiKey: KEY }))
    expect(events).toEqual([])
    expect(error).toMatchObject({ kind: 'auth', status: 401 })
  })

  it('stops with `cancelled` when the caller aborts mid-stream, and keeps what it had', async () => {
    const controller = new AbortController()
    const t = transport(fetchFake((_url, init) => sseThenSilence([delta('đã có')], init.signal)))
    const stream = t.stream(ask, { apiKey: null, signal: controller.signal })
    const events: ChatStreamEvent[] = []
    let error: unknown = null
    try {
      for await (const event of stream) {
        events.push(event)
        controller.abort()
      }
    } catch (caught) {
      error = caught
    }
    expect(events).toEqual([{ kind: 'delta', text: 'đã có' }])
    expect(error).toMatchObject({ kind: 'cancelled' })
  })

  it('releases the connection when the reader walks away early', async () => {
    let seen: AbortSignal | null | undefined
    const t = transport(
      fetchFake((_url, init) => {
        seen = init.signal
        return sseThenSilence([delta('a'), delta('b')], init.signal)
      })
    )
    const stream = t.stream(ask, { apiKey: null })
    await stream.next()
    // Bên đọc ngừng nhận dữ liệu sau sự kiện đầu tiên.
    await stream.return(undefined)
    expect(seen?.aborted).toBe(true)
  })
})

describe('deadlines', () => {
  it('times a plain call out as `timeout`, not as a network error', async () => {
    vi.useFakeTimers()
    const t = transport(
      fetchFake((_url, init) => untilAborted(init.signal)),
      { timeouts: { totalMs: 5_000 } }
    )
    const pending = t.complete(ask, { apiKey: KEY }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await pending).toMatchObject({ kind: 'timeout', retryable: true })
  })

  it('times out a stream that never produces a first event', async () => {
    vi.useFakeTimers()
    const t = transport(
      fetchFake((_url, init) => untilAborted(init.signal)),
      { timeouts: { firstByteMs: 3_000 } }
    )
    const pending = collectUntilError(t.stream(ask, { apiKey: KEY }))
    await vi.advanceTimersByTimeAsync(3_000)
    expect((await pending).error).toMatchObject({ kind: 'timeout' })
  })

  it('times out a stream that goes silent, and still hands over what arrived first', async () => {
    vi.useFakeTimers()
    const t = transport(
      fetchFake((_url, init) => sseThenSilence([delta('một phần')], init.signal)),
      {
        timeouts: { firstByteMs: 60_000, idleMs: 2_000 }
      }
    )
    const pending = collectUntilError(t.stream(ask, { apiKey: null }))
    await vi.advanceTimersByTimeAsync(2_000)
    const { events, error } = await pending
    expect(events).toEqual([{ kind: 'delta', text: 'một phần' }])
    expect(error).toMatchObject({ kind: 'timeout' })
  })

  it('does not count the wait for a first event against the silence limit', async () => {
    vi.useFakeTimers()
    const t = transport(
      fetchFake((_url, init) => untilAborted(init.signal)),
      {
        timeouts: { firstByteMs: 10_000, idleMs: 1_000 }
      }
    )
    const pending = collectUntilError(t.stream(ask, { apiKey: null }))
    await vi.advanceTimersByTimeAsync(9_000)
    // Tại giây thứ 9: đã quá giới hạn im lặng nhưng vẫn trong hạn byte đầu nên tiếp tục chờ.
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await pending).error).toMatchObject({ kind: 'timeout' })
  })

  it('answers `cancelled`, not `timeout`, when Cancel and the deadline both happened by the time the call fails', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    // `fetch` giả lập bỏ qua tín hiệu hủy cho đến khi được chỉ định.
    let failNow!: () => void
    const t = transport(
      fetchFake(
        () =>
          new Promise<Response>(
            (_resolve, reject) => (failNow = () => reject(new Error('socket closed')))
          )
      ),
      { timeouts: { totalMs: 1_000 } }
    )
    const pending = t
      .complete(ask, { apiKey: null, signal: controller.signal })
      .catch((e: unknown) => e)
    controller.abort()
    await vi.advanceTimersByTimeAsync(1_000)
    failNow()
    expect(await pending).toMatchObject({ kind: 'cancelled' })
  })

  it('answers `timeout` when only the deadline passed', async () => {
    vi.useFakeTimers()
    let failNow!: () => void
    const t = transport(
      fetchFake(
        () =>
          new Promise<Response>(
            (_resolve, reject) => (failNow = () => reject(new Error('socket closed')))
          )
      ),
      { timeouts: { totalMs: 1_000 } }
    )
    const pending = t.complete(ask, { apiKey: null }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1_000)
    failNow()
    expect(await pending).toMatchObject({ kind: 'timeout' })
  })

  it('is `cancelled` without even asking when the signal was already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fake = fetchFake((_url, init) => untilAborted(init.signal))
    const error = await transport(fake)
      .complete(ask, { apiKey: null, signal: controller.signal })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'cancelled' })
  })
})

describe('listModels', () => {
  it('returns the ids, without the `models/` prefix Google adds', async () => {
    const t = transport(
      fetchFake(() =>
        json({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'gemini-2.5-pro' }, { nope: 1 }] })
      )
    )
    expect(await t.listModels({ apiKey: KEY })).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
  })

  it('throws a typed error when the endpoint refuses', async () => {
    const t = transport(fetchFake(() => json({ error: { message: 'Unsupported parameter' } }, 400)))
    expect(await t.listModels({ apiKey: KEY }).catch((e: unknown) => e)).toMatchObject({
      kind: 'invalid_request',
      status: 400
    })
  })

  it('reads a 400 that says the key is wrong as `auth` (Gemini answers a bad key that way)', async () => {
    const t = transport(fetchFake(() => json({ error: { message: 'API key not valid' } }, 400)))
    expect(await t.listModels({ apiKey: KEY }).catch((e: unknown) => e)).toMatchObject({
      kind: 'auth',
      status: 400
    })
  })
})
