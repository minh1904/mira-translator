import { FORBIDDEN_BODY_FIELDS } from '../../../../shared/contracts/modelSettings'
import { classifyHttpError } from '../classifyError'
import { parseSseStream } from '../chatStream'
import type { Compat } from '../compat'
import { normalizeModelId } from '../modelCatalog'
import { readFilterReason, type FilterReason } from '../filterReason'
import { ProviderError, type SentParameters } from '../types'
import { normalizeUsage, type Usage } from '../usage'
import {
  Attempt,
  DEFAULT_TIMEOUTS,
  baseFor,
  buildHeaders,
  errorMessage,
  joinUrl,
  sendWithRefresh,
  toProviderError,
  type CallOptions,
  type ChatTransport,
  type TransportTimeouts
} from './transportShared'

export {
  DEFAULT_TIMEOUTS,
  buildHeaders,
  joinUrl,
  toProviderError,
  type CallOptions,
  type TransportTimeouts
} from './transportShared'

/**
 * Thực thi cuộc gọi tới endpoint `/chat/completions` tương thích OpenAI.
 *
 * Chức năng:
 * - Xây dựng body yêu cầu, chỉ gửi các tham số đã được thiết lập.
 * - Phân tích dữ liệu phản hồi (văn bản, gọi công cụ, lý do kết thúc, mức sử dụng token) ở cả hai chế độ thông thường và streaming.
 * - Quản lý thời hạn (deadline) và hủy bỏ yêu cầu (cancel).
 * - Chuyển đổi lỗi thành `ProviderError` có phân loại cụ thể và che giấu bí mật (secret scrubbing).
 */

/** Lượt tin nhắn trong hội thoại theo định dạng tương thích OpenAI. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Lượt của `assistant` chứa yêu cầu gọi công cụ (cần gửi lại nguyên vẹn ở vòng tiếp theo). */
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
    /** Dữ liệu riêng của nhà cung cấp, gửi lại nguyên vẹn (Gemini đặt `thought_signature` ở đây). */
    extra_content?: unknown
  }>
  /** Lượt của `tool` trả lời chính xác cho lệnh gọi này. */
  tool_call_id?: string
}

/** Cuộc gọi công cụ hoàn chỉnh sau khi ghép các mảnh phân đoạn lại với nhau. */
export interface AssembledToolCall {
  id: string
  name: string
  arguments: string
  /** `extra_content` của lệnh gọi; Gemini từ chối lượt sau nếu thiếu `thought_signature` trong đó. */
  extra?: unknown
}

/** Lý do kết thúc phản hồi (`unknown` khi máy chủ không trả về lý do). */
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'filter' | 'unknown'

/**
 * Các sự kiện phát ra từ luồng stream: các sự kiện `delta`/`reasoning` và kết thúc bằng `done` hoặc `tool-calls`.
 */
export type ChatStreamEvent =
  | { kind: 'delta'; text: string }
  /**
   * Nội dung suy luận của mô hình trước khi trả lời (`reasoning_content` hoặc `reasoning`).
   */
  | { kind: 'reasoning'; text: string }
  | {
      kind: 'tool-calls'
      calls: AssembledToolCall[]
      usage: Usage | null
      finishReason: FinishReason
    }
  | { kind: 'done'; usage: Usage | null; finishReason: FinishReason; filter?: FilterReason }

/** Cấu trúc yêu cầu tạo văn bản (các tham số sinh là tùy chọn và chỉ gửi khi được chỉ định). */
export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  tools?: readonly unknown[]
  /** Giới hạn số token đầu ra (tên trường tương ứng theo cấu hình `Compat.maxTokensField`). */
  maxTokens?: number
  temperature?: number
  topP?: number
  /** Mức độ nỗ lực suy luận (được gửi đi khi có thiết lập). */
  reasoningEffort?: string
  /** Định dạng phản hồi mong muốn (`response_format`) cho cuộc gọi này. */
  responseFormat?: unknown
  /** Các trường bổ sung gộp vào body yêu cầu (loại bỏ các trường bị cấm trong `FORBIDDEN_BODY_FIELDS`). */
  extraBody?: Record<string, unknown>
  /** Các tiêu đề HTTP bổ sung gửi kèm yêu cầu (loại bỏ các tiêu đề thuộc `FORBIDDEN_HEADERS`). */
  extraHeaders?: Record<string, string>
}

/** Kết quả của một cuộc gọi thông thường (không streaming). */
export interface CompleteResult {
  text: string
  finishReason: FinishReason
  /** Lý do chặn từ bộ lọc nội dung khi `finishReason` là `filter`. */
  filter?: FilterReason
  usage: Usage | null
  /** Mã trạng thái HTTP của phản hồi. */
  status: number
}

export interface TransportOptions {
  /** Địa chỉ URL cơ sở. */
  baseUrl: string
  compat: Compat
  fetchImpl: typeof fetch
  now: () => number
  timeouts?: Partial<TransportTimeouts>
  /** Hàm tạo các tiêu đề bổ sung cho nhà cung cấp trên mỗi cuộc gọi. */
  headers?: (call: CallOptions, request?: ChatRequest) => Record<string, string>
  /** Điều kiện kiểm tra lỗi để thử làm mới token một lần (ngoài mã 401). */
  refreshWhen?: (status: number, body: string) => boolean
}

/** Tạo nội dung body của yêu cầu; chỉ bao gồm các trường đã được cấu hình. */
export function buildChatBody(
  request: ChatRequest,
  compat: Compat,
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: request.model, messages: request.messages }
  if (stream) {
    body.stream = true
    // Bật tùy chọn trả về thông tin sử dụng token trong luồng stream nếu được hỗ trợ.
    if (compat.streamUsage) body.stream_options = { include_usage: true }
  }
  if (request.tools !== undefined && request.tools.length > 0) body.tools = request.tools
  if (request.maxTokens !== undefined) body[compat.maxTokensField] = request.maxTokens
  if (request.temperature !== undefined) body.temperature = request.temperature
  if (request.topP !== undefined) body.top_p = request.topP
  if (request.reasoningEffort !== undefined) body.reasoning_effort = request.reasoningEffort
  if (request.responseFormat !== undefined) body.response_format = request.responseFormat
  return { ...body, ...withoutForbiddenFields(request.extraBody) }
}

/**
 * Lọc bỏ các trường bị cấm khỏi `extraBody` để tránh ghi đè các tham số điều khiển cốt lõi (như stream).
 */
function withoutForbiddenFields(
  extra: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (extra === undefined) return {}
  const allowed: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(extra)) {
    if (!(FORBIDDEN_BODY_FIELDS as readonly string[]).includes(name)) allowed[name] = value
  }
  return allowed
}

/** Ánh xạ giá trị `finish_reason` sang định dạng chuẩn của ứng dụng. */
export function mapFinishReason(raw: unknown): FinishReason {
  switch (raw) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls'
    case 'content_filter':
      return 'filter'
    default:
      // Gemini qua endpoint tương thích OpenAI ghi kèm lý do: "content_filter: PROHIBITED_CONTENT",
      // "content_filter: RECITATION". Bỏ sót dạng này thì lô bị lọc trông như một phản hồi thiếu id.
      return typeof raw === 'string' && raw.startsWith('content_filter') ? 'filter' : 'unknown'
  }
}

/** Một mảnh phân đoạn của lệnh gọi công cụ trong luồng stream. */
export interface ToolCallFragment {
  index: number
  id?: string
  name?: string
  arguments?: string
  extra?: unknown
}

/** Khung dữ liệu sự kiện từ luồng SSE sau khi phân tích JSON. */
export interface ChatFrame {
  /** Đoạn văn bản mới trong khung sự kiện này. */
  text: string
  /** Đoạn văn bản suy luận mới trong khung sự kiện này. */
  reasoning: string
  usage: Usage | null
  /** Các phân đoạn gọi công cụ trong khung này (nếu có). */
  toolCalls: ToolCallFragment[]
  /** Lý do kết thúc thô trả về từ máy chủ. */
  finishReason?: string
  /** Đối tượng lỗi khi nhà cung cấp báo lỗi ở giữa luồng stream. */
  error?: Record<string, unknown>
}

function readToolFragments(raw: unknown): ToolCallFragment[] {
  if (!Array.isArray(raw)) return []
  const fragments: ToolCallFragment[] = []
  for (const entry of raw) {
    const item = entry as {
      index?: unknown
      id?: unknown
      function?: { name?: unknown; arguments?: unknown }
      extra_content?: unknown
    }
    // Mặc định index là 0 nếu thiếu (một số endpoint bỏ qua khi chỉ có một lệnh gọi).
    const index = typeof item?.index === 'number' ? item.index : 0
    const fragment: ToolCallFragment = { index }
    if (typeof item?.id === 'string') fragment.id = item.id
    if (typeof item?.function?.name === 'string') fragment.name = item.function.name
    if (typeof item?.function?.arguments === 'string') fragment.arguments = item.function.arguments
    if (item?.extra_content !== undefined) fragment.extra = item.extra_content
    fragments.push(fragment)
  }
  return fragments
}

/**
 * Phân tích một khung dữ liệu `data:` từ SSE.
 * Trả về `null` nếu khung không hợp lệ (không ném lỗi để tránh ngắt cả luồng); trả về đối tượng lỗi nếu là khung báo lỗi.
 */
export function parseChatFrame(data: string): ChatFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const payload = parsed as {
    error?: unknown
    usage?: unknown
    choices?: Array<{
      delta?: {
        content?: unknown
        tool_calls?: unknown
        reasoning_content?: unknown
        reasoning?: unknown
      }
      finish_reason?: unknown
    }>
  }

  if (payload.error !== null && typeof payload.error === 'object') {
    return {
      text: '',
      reasoning: '',
      usage: null,
      toolCalls: [],
      error: payload.error as Record<string, unknown>
    }
  }

  const choice = payload.choices?.[0]
  const content = choice?.delta?.content
  // Trích xuất nội dung suy luận từ trường `reasoning_content` hoặc `reasoning`.
  const thinking = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning
  const frame: ChatFrame = {
    text: typeof content === 'string' ? content : '',
    reasoning: typeof thinking === 'string' ? thinking : '',
    usage: normalizeUsage(payload.usage),
    toolCalls: readToolFragments(choice?.delta?.tool_calls)
  }
  if (typeof choice?.finish_reason === 'string') frame.finishReason = choice.finish_reason
  return frame
}

/** Tổng hợp các tham số đã gửi trong yêu cầu (dùng để chẩn đoán lỗi). */
export function sentParameters(request: ChatRequest): SentParameters {
  const sent: SentParameters = {
    extraBodyKeys: Object.keys(withoutForbiddenFields(request.extraBody)).sort(),
    responseFormat:
      request.responseFormat !== undefined || request.extraBody?.response_format !== undefined
  }
  if (request.reasoningEffort !== undefined) sent.reasoningEffort = request.reasoningEffort
  if (request.temperature !== undefined) sent.temperature = request.temperature
  if (request.topP !== undefined) sent.topP = request.topP
  if (request.maxTokens !== undefined) sent.maxTokens = request.maxTokens
  return sent
}

export class OpenAiChatTransport implements ChatTransport {
  private readonly timeouts: TransportTimeouts

  constructor(private readonly options: TransportOptions) {
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts }
  }

  /** Lấy danh sách định danh mô hình từ `GET /models`. */
  async listModels(call: CallOptions): Promise<string[]> {
    const attempt = new Attempt(call.signal)
    attempt.deadline.arm(this.timeouts.totalMs)
    try {
      const { response, apiKey } = await this.send('models', { method: 'GET' }, attempt, call)
      if (!response.ok) throw await this.failure(response, apiKey, attempt)
      const body = (await this.readJson(response, attempt, apiKey)) as {
        data?: Array<{ id?: unknown }>
      }
      return (body.data ?? [])
        .map((entry) => entry?.id)
        .filter((id): id is string => typeof id === 'string')
        .map(normalizeModelId)
    } finally {
      attempt.finish()
    }
  }

  /** Thực thi yêu cầu thông thường (không streaming): một yêu cầu, một phản hồi. */
  async complete(request: ChatRequest, call: CallOptions): Promise<CompleteResult> {
    const attempt = new Attempt(call.signal)
    attempt.deadline.arm(this.timeouts.totalMs)
    try {
      const body = JSON.stringify(buildChatBody(request, this.options.compat, false))
      const { response, apiKey } = await this.send(
        'chat/completions',
        { method: 'POST', body, extraHeaders: request.extraHeaders },
        attempt,
        call,
        request
      )
      if (!response.ok) throw await this.failure(response, apiKey, attempt, sentParameters(request))

      const payload = (await this.readJson(response, attempt, apiKey)) as {
        choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>
        usage?: unknown
      }
      const content = payload.choices?.[0]?.message?.content
      const finishReason = mapFinishReason(payload.choices?.[0]?.finish_reason)
      const filter = readFilterReason(payload.choices?.[0]?.finish_reason)
      // Bị bộ lọc nội dung chặn thì không có chữ: đó là một câu trả lời ("từ chối"), không phải phản hồi
      // hỏng. Ném lỗi ở đây thì lõi dịch không biết để chia nhỏ lô, và cả lô mất.
      if (typeof content !== 'string' && finishReason === 'filter') {
        return {
          text: '',
          finishReason,
          filter: filter ?? { group: 'other', raw: '' },
          usage: normalizeUsage(payload.usage),
          status: response.status
        }
      }
      if (typeof content !== 'string') {
        throw new ProviderError('invalid_response', 'Phản hồi không có nội dung văn bản.', {
          status: response.status
        })
      }
      return {
        text: content,
        finishReason,
        ...(finishReason === 'filter' ? { filter: filter ?? { group: 'other', raw: '' } } : {}),
        usage: normalizeUsage(payload.usage),
        status: response.status
      }
    } finally {
      attempt.finish()
    }
  }

  /**
   * Thực thi yêu cầu dạng luồng stream. Phát ra các sự kiện delta và kết thúc bằng `done` hoặc `tool-calls`.
   * Đóng generator sớm sẽ tự động hủy yêu cầu và giải phóng kết nối trong khối `finally`.
   */
  async *stream(request: ChatRequest, call: CallOptions): AsyncGenerator<ChatStreamEvent> {
    const { signal } = call
    const attempt = new Attempt(signal)
    attempt.deadline.arm(this.timeouts.firstByteMs)
    try {
      const body = JSON.stringify(buildChatBody(request, this.options.compat, true))
      const { response, apiKey } = await this.send(
        'chat/completions',
        { method: 'POST', body, extraHeaders: request.extraHeaders },
        attempt,
        call,
        request
      )
      if (!response.ok) throw await this.failure(response, apiKey, attempt, sentParameters(request))
      if (response.body === null) {
        throw new ProviderError('invalid_response', 'Phản hồi không có thân để đọc.', {
          status: response.status
        })
      }

      let usage: Usage | null = null
      let finishReason: FinishReason = 'unknown'
      let filter: FilterReason | undefined
      // Gom các phân đoạn gọi công cụ theo `index`.
      const pending = new Map<number, AssembledToolCall>()
      try {
        for await (const event of parseSseStream(response.body)) {
          // Sự kiện đầu tiên kết thúc thời gian chờ byte đầu; chuyển sang tính thời gian im lặng giữa các sự kiện.
          attempt.deadline.arm(this.timeouts.idleMs)
          // Kiểm tra hủy bỏ trong vòng lặp để đảm bảo dừng ngay lập tức ngay cả khi body stream chưa ngắt.
          if (signal?.aborted) throw new ProviderError('cancelled', 'Yêu cầu đã bị hủy.')
          const frame = parseChatFrame(event.data)
          if (frame === null) continue
          if (frame.error !== undefined) {
            // Lỗi ở giữa luồng stream: lấy mã lỗi trong payload hoặc mặc định là 500 để phân loại.
            throw toProviderError(
              classifyHttpError({
                status: typeof frame.error.code === 'number' ? frame.error.code : 500,
                body: JSON.stringify({ error: frame.error }),
                now: this.options.now(),
                secrets: [apiKey]
              }),
              sentParameters(request)
            )
          }
          if (frame.usage !== null) usage = frame.usage
          if (frame.finishReason !== undefined) {
            finishReason = mapFinishReason(frame.finishReason)
            filter = readFilterReason(frame.finishReason)
          }
          for (const fragment of frame.toolCalls) {
            // Gemini bỏ `index` khi gọi nhiều công cụ song song, nên mọi lệnh rơi vào index 0. Một `id`
            // hay tên hàm khác trên cùng slot nghĩa là lệnh mới; nối vào lệnh cũ sẽ ra JSON hỏng.
            let slot = fragment.index
            const existing = pending.get(slot)
            if (
              existing !== undefined &&
              ((fragment.id !== undefined && existing.id !== '' && fragment.id !== existing.id) ||
                (fragment.name !== undefined &&
                  existing.name !== '' &&
                  fragment.name !== existing.name))
            ) {
              slot = Math.max(...pending.keys()) + 1
            }
            const current = pending.get(slot) ?? { id: '', name: '', arguments: '' }
            pending.set(slot, {
              id: fragment.id ?? current.id,
              name: fragment.name ?? current.name,
              arguments: current.arguments + (fragment.arguments ?? ''),
              ...((fragment.extra ?? current.extra) !== undefined
                ? { extra: fragment.extra ?? current.extra }
                : {})
            })
          }
          if (frame.reasoning !== '') yield { kind: 'reasoning', text: frame.reasoning }
          if (frame.text !== '') yield { kind: 'delta', text: frame.text }
        }
      } catch (error) {
        const stop = attempt.interruption()
        if (stop !== null) throw stop
        if (error instanceof ProviderError) throw error
        throw new ProviderError('network', 'Mất kết nối: ' + errorMessage(error, apiKey))
      }

      // Bỏ qua các lệnh gọi công cụ thiếu tên hàm hợp lệ.
      const calls = [...pending.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
        .filter((call) => call.name !== '')
      if (calls.length > 0) {
        yield {
          kind: 'tool-calls',
          calls,
          usage,
          finishReason: finishReason === 'unknown' ? 'tool_calls' : finishReason
        }
        return
      }
      yield {
        kind: 'done',
        usage,
        finishReason,
        ...(finishReason === 'filter' ? { filter: filter ?? { group: 'other', raw: '' } } : {})
      }
    } finally {
      attempt.finish()
    }
  }

  /**
   * Gửi yêu cầu HTTP kèm khóa API, tự động làm mới token và thử lại một lần nếu gặp lỗi xác thực 401.
   */
  private async send(
    path: string,
    init: { method: string; body?: string; extraHeaders?: Record<string, string> },
    attempt: Attempt,
    call: CallOptions,
    request?: ChatRequest
  ): Promise<{ response: Response; apiKey: string | null }> {
    return sendWithRefresh(
      call,
      attempt,
      (current) => {
        const own: Record<string, string> = { accept: 'application/json' }
        if (init.body !== undefined) own['content-type'] = 'application/json'
        if (current.apiKey) own.authorization = 'Bearer ' + current.apiKey
        const provided = this.options.headers?.(current, request) ?? {}
        const headers = buildHeaders(own, { ...init.extraHeaders, ...provided })
        return this.options.fetchImpl(joinUrl(baseFor(this.options.baseUrl, current), path), {
          method: init.method,
          headers,
          body: init.body,
          signal: attempt.signal
        })
      },
      this.options.refreshWhen
    )
  }

  /**
   * Chuyển đổi phản hồi HTTP lỗi thành đối tượng `ProviderError` và lọc bỏ các khóa bí mật.
   */
  private async failure(
    response: Response,
    apiKey: string | null,
    attempt: Attempt,
    sent?: SentParameters
  ): Promise<ProviderError> {
    let body = ''
    try {
      body = await response.text()
    } catch {
      // Kiểm tra xem yêu cầu có bị ngắt giữa chừng trong lúc đọc nội dung hay không.
      const stop = attempt.interruption()
      if (stop !== null) return stop
      body = ''
    }
    return toProviderError(
      classifyHttpError({
        status: response.status,
        body,
        headers: response.headers,
        now: this.options.now(),
        secrets: [apiKey]
      }),
      sent
    )
  }

  private async readJson(
    response: Response,
    attempt: Attempt,
    apiKey: string | null
  ): Promise<unknown> {
    try {
      return await response.json()
    } catch (error) {
      const stop = attempt.interruption()
      if (stop !== null) throw stop
      throw new ProviderError(
        'invalid_response',
        'Phản hồi không phải JSON hợp lệ: ' + errorMessage(error, apiKey),
        {
          status: response.status
        }
      )
    }
  }
}
