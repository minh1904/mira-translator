import { taskLimit } from '../../../shared/contracts/modelSettings'
import { resolveCompat, type Compat } from './compat'
import type { Generation } from './generation'
import { Gateway, DEFAULT_CONCURRENCY, type GatewayOptions } from './gateway/gateway'
import type { AdaptiveLimit } from './gateway/adaptiveLimit'
import { type CallPriority, Limiter } from './gateway/limiter'
import type { RatePacer } from './gateway/ratePacer'
import type { RetryOptions } from './gateway/retryPolicy'
import type { KeyLease, KeySource } from './gateway/keys'
import type { CallOptions, ChatTransport } from './transports/transportShared'
import {
  OpenAiChatTransport,
  type ChatMessage,
  type ChatStreamEvent,
  type TransportTimeouts
} from './transports/openAiChatTransport'
import { reconcile } from './reconcile'
import {
  ProviderError,
  type SegmentText,
  type TranslateOptions,
  type TranslateRequest,
  type TranslateResponse,
  type TranslationProvider
} from './types'
import type {
  ModelCompletionResult,
  TranslationModelCaller
} from '../../../shared/contracts/translateCore'
import { addUsage, type Usage } from './usage'

/**
 * Provider duy nhất gọi ra ngoài: một endpoint **tương thích OpenAI**.
 *
 * Từ change `ai-gateway` lớp này là **mặt tiền** trên hai tầng: `OpenAiChatTransport` làm việc gọi HTTP
 * (xây thân yêu cầu, đọc SSE, thời hạn, hủy, phân loại và che lỗi), còn `Gateway` quyết định *gọi bằng
 * khóa nào, bao nhiêu lượt cùng lúc, thử lại khi nào*. Ở đây còn lại **mã dịch MVP** — prompt, chia lô,
 * parse JSON, `reconcile`, thử lại theo nội dung — vẫn đứng nguyên vì nó sẽ được viết lại ở module 3 và
 * không thuộc change này (D1).
 *
 * Không dùng SDK nhà cung cấp: với `fetch` trần, thân lỗi thô (kể cả `RetryInfo` của Gemini nằm trong
 * `error.details`) luôn nằm trong tay `classifyError`. pi-ai ghi cùng nhận xét về các SDK hãng làm rơi
 * thân lỗi; với Vercel AI SDK thì điều này **không** đúng (nó giữ `responseBody`) nên lý do loại nó là
 * trọng lượng và cách thử lại, không phải chuyện mất chi tiết.
 */

const BATCH_TARGET_TOKENS = 1500
/** Câu hỏi của nút "Kiểm tra": ngắn, không cần dịch gì, và câu trả lời đúng chỉ vài token. */
const PROBE_PROMPT = 'Trả lời đúng một từ: OK'
/** Phỏng đoán, chưa đo: dùng để ước lượng token của một segment khi chia lô. */
const CHARS_PER_TOKEN = 2
/**
 * Số lần hỏi lại **vì nội dung**: phản hồi không parse được, hoặc thiếu ID. Tách hẳn khỏi việc thử lại
 * vì mạng/khóa, vốn do `Gateway` giữ với bộ đếm riêng — hai loại không dùng chung một ngân sách.
 */
const MAX_CONTENT_RETRIES_PER_BATCH = 3

// Các kiểu và hàm này sống ở tầng dưới; giữ đường import cũ để mọi nơi dùng chúng không phải đổi.
export {
  joinUrl,
  parseChatFrame,
  type AssembledToolCall,
  type ChatFrame,
  type ChatMessage,
  type ChatStreamEvent,
  type ToolCallFragment
} from './transports/openAiChatTransport'
export type { KeyExhausted, KeyLease, KeyOutcome, KeySource } from './gateway/keys'

export const SYSTEM_PROMPT = [
  'Bạn là người dịch truyện sang tiếng Việt.',
  'Đầu vào là một mảng JSON các đối tượng {"id","src"}.',
  'Trả về đúng một mảng JSON các đối tượng {"id","dst"}, không kèm giải thích hay dấu ```.',
  'Giữ nguyên mọi id đã nhận, đủ số lượng, không thêm id mới.',
  'Dịch tự nhiên, giữ xuống dòng và dấu câu của bản gốc.'
].join(' ')

export interface OpenAiCompatibleOptions {
  /** Địa chỉ gốc, ví dụ `http://127.0.0.1:8317/v1` hoặc endpoint tương thích của Gemini. */
  baseUrl: string
  model: string
  keys: KeySource
  /** Khác biệt của endpoint so với OpenAI chuẩn; thiếu thì coi là OpenAI chuẩn. */
  compat?: Compat
  /** Thời hạn một lượt gọi; thiếu thì dùng mặc định của transport. */
  timeouts?: Partial<TransportTimeouts>
  /**
   * Hàng chờ đồng thời của mục model. Phải là **cùng một cái** giữa các lời gọi của một mục thì trần mới
   * có nghĩa; thiếu thì dựng riêng cho provider này (đúng cho test và một lời gọi lẻ).
   */
  limiter?: Limiter
  /** Mức đồng thời tự điều chỉnh của mục model, đặt lên `limiter`; thiếu thì mức cố định. */
  adaptive?: AdaptiveLimit
  /** Hàng chờ suất: lượt chat (`interactive`, mặc định) được cấp trước tác vụ nền (`background`). */
  priority?: CallPriority
  /**
   * Bộ giãn nhịp RPM của mục model. Cũng phải là **cùng một cái** giữa các lời gọi của một mục để nhịp có nghĩa;
   * thiếu thì không giãn nhịp.
   */
  pacer?: RatePacer
  retry?: Partial<RetryOptions>
  /** Tiêm vào để test: giấc ngủ và độ xáo trộn của thử lại. */
  sleep?: GatewayOptions['sleep']
  random?: GatewayOptions['random']
  /** Khi mọi khóa đang đóng băng: chờ (`true`) hay báo lỗi ngay (`false`, mặc định). */
  waitForKeys?: boolean
  /**
   * Tham số sinh của mục model đang dùng (`buildGeneration`): đưa vào **mọi** yêu cầu của provider này, dịch
   * lẫn chat, nên hai bên không thể lệch nhau. Thiếu thì yêu cầu y như trước khi có cài đặt.
   */
  generation?: Generation
  /**
   * Token đầu vào mỗi lô dịch; 0 hoặc thiếu là cỡ lô mặc định. Phải là **cùng con số** kế hoạch dịch đã dùng
   * để chia lô: nếu không, một lô đã chia theo giới hạn lớn sẽ bị chia lại theo giới hạn mặc định và gọi
   * hai lần.
   */
  inputTokenLimit?: number
  /**
   * Lỗi đã biết trước khi gọi, ví dụ mức suy luận model không nhận (`checkThinkingLevel`). Có thì mọi lời
   * gọi của provider ném nó ngay, **không** đi ra mạng: một request chắc chắn bị từ chối không đáng tốn một
   * lượt gọi, và lỗi vẫn là `invalid_request` kèm tham số đã định gửi.
   */
  blockedBy?: ProviderError
  /** Tiêm vào để test; mặc định là `fetch` của Node. */
  fetchImpl?: typeof fetch
  now?: () => number
  /**
   * Cách nói chuyện với model (change `subscription-providers`): Responses, Anthropic Messages, hay Chat
   * Completions có header của tài khoản. Thiếu thì là Chat Completions trên `baseUrl`, như trước.
   */
  transport?: ChatTransport
}

/** What one attempt sends besides the request: the lease's key, credential and refresh, and the round. */
function callOf(
  lease: KeyLease,
  signal: AbortSignal | undefined,
  extra: Partial<CallOptions> = {}
): CallOptions {
  return {
    apiKey: lease.secret,
    signal,
    ...(lease.credential ? { credential: lease.credential } : {}),
    ...(lease.refresh ? { refresh: lease.refresh } : {}),
    ...extra
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN))
}

/**
 * Chia segment thành lô. Cắt ở **ranh giới segment**, không bao giờ cắt giữa một segment; một
 * segment dài hơn cả lô vẫn đi riêng một lô thay vì bị chia đôi.
 */
export function splitIntoBatches(
  segments: SegmentText[],
  targetTokens = BATCH_TARGET_TOKENS
): SegmentText[][] {
  const batches: SegmentText[][] = []
  let current: SegmentText[] = []
  let tokens = 0
  for (const segment of segments) {
    const cost = estimateTokens(segment.text)
    if (current.length > 0 && tokens + cost > targetTokens) {
      batches.push(current)
      current = []
      tokens = 0
    }
    current.push(segment)
    tokens += cost
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** Tách mảng JSON ra khỏi phản hồi, chịu được rào ```json và chữ thừa quanh nó. */
export function parseItems(content: string): SegmentText[] {
  const withoutFence = content.replace(/```(?:json)?/gi, '').trim()
  const start = withoutFence.indexOf('[')
  const end = withoutFence.lastIndexOf(']')
  if (start === -1 || end <= start) {
    throw new ProviderError('invalid_response', 'Phản hồi không chứa mảng JSON nào.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1))
  } catch {
    throw new ProviderError('invalid_response', 'Phản hồi không phải JSON hợp lệ.')
  }
  if (!Array.isArray(parsed)) {
    throw new ProviderError('invalid_response', 'Phản hồi không phải một mảng.')
  }
  const items: SegmentText[] = []
  for (const entry of parsed) {
    const id = (entry as { id?: unknown })?.id
    const dst = (entry as { dst?: unknown })?.dst
    if (typeof id === 'string' && typeof dst === 'string') items.push({ id, text: dst })
  }
  return items
}

export class OpenAiCompatibleProvider implements TranslationProvider, TranslationModelCaller {
  readonly id = 'openai-compatible'
  private readonly now: () => number
  private readonly transport: ChatTransport
  private readonly gateway: Gateway

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.now = options.now ?? Date.now
    this.transport =
      options.transport ??
      new OpenAiChatTransport({
        baseUrl: options.baseUrl,
        compat: options.compat ?? resolveCompat(null),
        fetchImpl: options.fetchImpl ?? fetch,
        now: this.now,
        timeouts: options.timeouts
      })
    this.gateway = new Gateway({
      keys: options.keys,
      limiter: options.limiter ?? new Limiter(DEFAULT_CONCURRENCY),
      adaptive: options.adaptive,
      priority: options.priority,
      pacer: options.pacer,
      now: this.now,
      retry: options.retry,
      sleep: options.sleep,
      random: options.random,
      waitForKeys: options.waitForKeys
    })
  }

  /**
   * Kiểm tra kết nối bằng `GET {base}/models` — rẻ, hầu hết nhà cung cấp không tính tiền, và trả
   * luôn danh sách model để người dùng chọn. Endpoint không có `/models` **không phải lỗi kết
   * nối**: báo nối được nhưng chưa liệt kê được, để người dùng khai model bằng tay.
   *
   * Phải gửi khóa như mọi lời gọi khác. Thiếu nó, Gemini trả **404 "Requested entity was not
   * found."** cho `GET /v1beta/openai/models` — mà 404 không phải `auth` cũng không phải `network`,
   * nên nó rơi đúng vào nhánh "endpoint không liệt kê model" và kết nối hiện ra là nối được nhưng
   * không có model nào. Một lỗi xác thực đội lốt một endpoint thiếu tính năng.
   */
  /** Ném lỗi đã biết trước (`blockedBy`) trước khi có lời gọi nào. */
  private guard(): void {
    if (this.options.blockedBy !== undefined) throw this.options.blockedBy
  }

  async listModels(signal?: AbortSignal): Promise<{ models: string[]; listed: boolean }> {
    try {
      const models = await this.gateway.call(
        (lease) => this.transport.listModels(callOf(lease, signal)),
        signal
      )
      return { models, listed: true }
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error
      // Khóa sai, không nối được, hết thời hạn hay bị hủy là chuyện của kết nối thật.
      if (['auth', 'network', 'timeout', 'cancelled'].includes(error.kind)) throw error
      // Hết khóa dùng được cũng là chuyện của kết nối: lỗi đó không có trạng thái HTTP vì chưa gửi gì.
      if (error.kind === 'rate_limited' && error.status === undefined) throw error
      // Còn lại chỉ là endpoint không liệt kê; một `/models` thật sự không có không phạt khóa
      // (`decideFreeze` để khóa yên với `refused`).
      return { models: [], listed: false }
    }
  }

  async translate(
    request: TranslateRequest,
    { signal }: TranslateOptions = {}
  ): Promise<TranslateResponse> {
    this.guard()
    const matched: SegmentText[] = []
    let spent: Usage | null = null
    for (const batch of splitIntoBatches(
      request.segments,
      taskLimit(this.options.inputTokenLimit)
    )) {
      const result = await this.translateBatch(request, batch, signal)
      matched.push(...result.items)
      spent = addUsage(spent, result.usage)
    }
    const response: TranslateResponse = {
      provider: this.id,
      model: this.options.model,
      items: matched
    }
    if (spent !== null) response.usage = spent
    return response
  }

  /**
   * Dịch một lô, chỉ gửi lại các ID còn thiếu khi phản hồi không khớp tập ID.
   *
   * Hỏi lại ở đây là **vì nội dung** (không parse được, thiếu ID). Lỗi mạng, hết thời hạn và chuyện của
   * khóa đã được `Gateway` xử lý trước khi tới đây; một lỗi đi lên tới đây là lỗi đã hết cách thử, nên
   * ném ngay thay vì thử lại lần nữa và nhân số lần gọi lên.
   *
   * Thử lại tới trần mà vẫn thiếu vài câu thì **trả về phần đã có**, không ném: tầng trên ghi phần
   * đó vào bản dịch và liệt kê phần còn thiếu để chạy lại. Chỉ khi không có câu nào dùng được thì
   * lô mới coi là lỗi.
   */
  private async translateBatch(
    request: TranslateRequest,
    batch: SegmentText[],
    signal?: AbortSignal
  ): Promise<{ items: SegmentText[]; usage: Usage | null }> {
    const done: SegmentText[] = []
    let spent: Usage | null = null
    let pending = batch
    let lastError: ProviderError | undefined

    for (
      let attempt = 0;
      attempt < MAX_CONTENT_RETRIES_PER_BATCH && pending.length > 0;
      attempt++
    ) {
      let items: SegmentText[]
      try {
        const call = await this.callOnce(pending, signal)
        items = call.items
        // Every attempt costs, including the ones whose answer was unusable.
        spent = addUsage(spent, call.usage)
      } catch (error) {
        if (error instanceof ProviderError && error.kind === 'invalid_response') {
          lastError = error
          continue
        }
        throw error
      }
      const result = reconcile(
        { ...request, segments: pending },
        {
          provider: this.id,
          model: this.options.model,
          items
        }
      )
      done.push(...result.matched)
      pending = pending.filter((segment) => result.missing.includes(segment.id))
      if (pending.length > 0) {
        lastError = new ProviderError(
          'invalid_response',
          'Phản hồi thiếu ' + pending.length + ' segment.'
        )
      }
    }

    if (done.length === 0) {
      throw lastError ?? new ProviderError('invalid_response', 'Lô không dịch được.')
    }
    return { items: done, usage: spent }
  }

  /**
   * Một lượt hội thoại, trả về theo dòng.
   *
   * Khác `translate()` ở mọi điểm đáng kể, nên nó **không** nằm trong `TranslationProvider`: không
   * chia lô, không khớp theo ID, không `reconcile`. Dùng chung với lối dịch đúng những thứ đáng dùng
   * chung — `Gateway` (chọn khóa, trần đồng thời, thử lại trước byte đầu) và transport.
   *
   * Báo cho tầng khóa **đúng một lần, ở cuối**: `ok` khi xong êm, lỗi đã phân loại khi hỏng, và `neutral`
   * khi bị hủy — một lần dùng chưa xong không kết luận được gì, nên nói `ok` là nói dối còn nói lỗi sẽ
   * đóng băng một khóa hoàn toàn lành (D4 của change `ai-chat`).
   */
  async *chat(
    messages: ChatMessage[],
    {
      signal,
      tools,
      turnRound,
      sessionId
    }: TranslateOptions & {
      tools?: readonly unknown[]
      turnRound?: number
      sessionId?: string
    } = {}
  ): AsyncGenerator<ChatStreamEvent> {
    this.guard()
    yield* this.gateway.stream(
      (lease) =>
        this.transport.stream(
          { model: this.options.model, messages, tools, ...this.options.generation },
          callOf(lease, signal, {
            ...(turnRound === undefined ? {} : { turnRound }),
            ...(sessionId === undefined ? {} : { sessionId })
          })
        ),
      signal,
      // Sự kiện kết thúc là dấu hiệu duy nhất cho thấy lượt xong êm.
      (event) => event.kind === 'done' || event.kind === 'tool-calls'
    )
  }

  /**
   * Một yêu cầu nhỏ bằng **đúng cài đặt của mục** (nút "Kiểm tra", design D10 của change
   * `ai-model-settings`): trả thời gian và token nếu nhà cung cấp nhận, ném lỗi gốc của nó nếu không. Đi qua
   * gateway như mọi lời gọi (hàng chờ, nhịp RPM, khóa), nên kiểm luôn rằng các thứ đó không làm treo.
   *
   * Không đọc nội dung câu trả lời: cái cần biết là nhà cung cấp có nhận cấu hình này không, không phải model
   * trả lời gì. Một mục đặt trần token ra rất nhỏ khi suy luận đang bật có thể ra câu rỗng hoặc cụt; lúc đó
   * lỗi nói đúng điều đó (`invalid_response`), vì đó là cấu hình người dùng đã đặt.
   */
  async probe(signal?: AbortSignal): Promise<{ ms: number; usage: Usage | null }> {
    this.guard()
    const startedAt = this.now()
    const result = await this.gateway.call(
      (lease) =>
        this.transport.complete(
          {
            model: this.options.model,
            messages: [{ role: 'user', content: PROBE_PROMPT }],
            ...this.options.generation
          },
          callOf(lease, signal)
        ),
      signal
    )
    return { ms: this.now() - startedAt, usage: result.usage }
  }

  /**
   * Gọi mô hình sinh văn bản (không phân tích cú pháp hay đối soát ID).
   */
  async complete(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { signal?: AbortSignal; responseFormat?: unknown }
  ): Promise<ModelCompletionResult> {
    this.guard()
    let attempts = 0
    const result = await this.gateway.call(
      (lease) =>
        this.transport.complete(
          {
            model: this.options.model,
            messages,
            ...this.options.generation,
            ...(options?.responseFormat !== undefined
              ? { responseFormat: options.responseFormat }
              : {})
          },
          callOf(lease, options?.signal)
        ),
      options?.signal,
      () => attempts++
    )
    return {
      text: result.text,
      attempts,
      usage: result.usage,
      finishReason: result.finishReason,
      ...(result.filter !== undefined ? { filter: result.filter } : {}),
      status: result.status
    }
  }

  /** Một lần gọi tới nhà cung cấp, qua gateway. */
  private async callOnce(
    segments: SegmentText[],
    signal?: AbortSignal
  ): Promise<{ items: SegmentText[]; usage: Usage | null }> {
    const result = await this.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(segments.map((s) => ({ id: s.id, src: s.text })))
        }
      ],
      { signal }
    )
    // Một phản hồi bị cắt vì hết giới hạn đầu ra gần như chắc chắn là JSON dở. Nói đúng nguyên nhân thay
    // vì để `parseItems` báo "không phải JSON hợp lệ", để người dùng biết lô quá lớn chứ không phải model hỏng.
    if (result.finishReason === 'length') {
      throw new ProviderError(
        'invalid_response',
        'Phản hồi bị cắt vì hết giới hạn đầu ra nên không đủ để dùng.',
        { status: result.status }
      )
    }
    return { items: parseItems(result.text), usage: result.usage }
  }
}
