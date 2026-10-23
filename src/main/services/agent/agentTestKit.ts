import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import type {
  ChatMessage,
  ChatStreamEvent
} from '../../infra/providers/transports/openAiChatTransport'
import type { ModelInfo } from '../../infra/providers/modelCatalog'
import type { SecretCrypto } from '../../infra/storage/secretStore'
import { AgentRepository } from '../../infra/storage/agentRepository'
import { segment } from '../../../shared/segmentation/segmenter'
import { LibraryStore } from '../library/library'
import { createServices } from '../createServices'
import { AgentService, type AgentChatModel } from './agentService'
import { defaultReadCapabilities } from './capabilities/readCapabilities'
import { CapabilityRegistry } from './registry'

/** Test-only: a library with two works and an agent whose model follows a script. */

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

const USAGE = { inputTokens: 10, outputTokens: 5 }

export const say = (text: string, usage: typeof USAGE | null = USAGE): ChatStreamEvent[] => [
  { kind: 'delta', text },
  { kind: 'done', usage, finishReason: 'stop' }
]

export const callTools = (
  ...calls: Array<
    { name: string; args: unknown; id?: string } | { raw: string; name: string; id?: string }
  >
): ChatStreamEvent[] => [
  {
    kind: 'tool-calls',
    calls: calls.map((call, index) => ({
      id: call.id ?? 'call-' + Math.random().toString(36).slice(2) + index,
      name: call.name,
      arguments: 'raw' in call ? call.raw : JSON.stringify(call.args)
    })),
    usage: USAGE,
    finishReason: 'tool_calls'
  }
]

export interface ModelRequest {
  messages: ChatMessage[]
  tools?: readonly unknown[]
}

/** Each chat round takes the next step; a step may inspect the request (tool results so far). */
export type ScriptStep = ChatStreamEvent[] | ((request: ModelRequest) => ChatStreamEvent[]) | Error

export class ScriptedModel {
  readonly requests: ModelRequest[] = []
  private steps: ScriptStep[] = []
  info: ModelInfo | undefined = { id: 'mock-model', name: 'Mock', toolCall: true }

  script(...steps: ScriptStep[]): this {
    this.steps.push(...steps)
    return this
  }

  /** `settingsKey` must be the connection's real one: `translate_chapter` checks it. */
  settingsKeyOf: (selection: { connectionId: string; entryId: string }) => string = () => 'settings'

  open(selection: { connectionId: string; entryId: string }): AgentChatModel {
    return {
      modelRef: { ...selection, settingsKey: this.settingsKeyOf(selection) },
      info: this.info,
      chat: (messages, options) => this.chat(messages, options.tools, options.signal)
    }
  }

  /** The tool result the model saw for a call, parsed. */
  lastToolResult(): { ok: boolean; value?: any; error?: { code: string; message: string } } {
    const last = this.requests
      .at(-1)!
      .messages.filter((m) => m.role === 'tool')
      .at(-1)
    return JSON.parse(last?.content ?? 'null')
  }

  private async *chat(
    messages: ChatMessage[],
    tools: readonly unknown[] | undefined,
    signal: AbortSignal
  ): AsyncGenerator<ChatStreamEvent> {
    const request = { messages: structuredClone(messages), tools }
    this.requests.push(request)
    const step = this.steps.shift()
    if (step === undefined) throw new Error('Scripted model ran out of steps.')
    if (step instanceof Error) throw step
    const events = typeof step === 'function' ? step(request) : step
    for (const event of events) {
      if (signal.aborted) throw new Error('aborted')
      await Promise.resolve()
      yield event
    }
  }
}

const tempDirs: string[] = []
const stores: LibraryStore[] = []

afterEach(() => {
  for (const s of stores.splice(0)) {
    try {
      s.close()
    } catch {
      // ignore
    }
  }
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

/** Translation requests (`translate_chapter`) go through fetch; the chat model is scripted. */
/** What the fake translation endpoint saw, and a way to make one call fail. */
export interface TranslationLog {
  /** Source texts of every translation request, in order. */
  requests: string[][]
  /** Full messages of every translation request, as JSON. */
  prompts: string[]
  /** 1-based number of the request that answers HTTP 400; no fallback, no retry. */
  failOn?: number
  omitUsage: boolean
}

function translationFetch(log: TranslationLog): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMsg = body.messages.find((m) => m.role === 'user')?.content ?? '[]'
    const sourceBlock = /<source>\n([\s\S]*?)\n<\/source>/.exec(userMsg)?.[1] ?? userMsg
    const inputSegments = JSON.parse(sourceBlock) as Array<{ id: string; src: string }>
    log.requests.push(inputSegments.map((s) => s.src))
    log.prompts.push(JSON.stringify(body.messages))
    if (log.requests.length === log.failOn) {
      return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 })
    }
    const items = inputSegments.map((s) => ({ id: s.id, dst: `Dịch: ${s.src}` }))
    return new Response(
      JSON.stringify({
        id: 'mock',
        choices: [{ message: { role: 'assistant', content: JSON.stringify(items) } }],
        usage: log.omitUsage
          ? undefined
          : { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof fetch
}

export function setupAgent(options: { omitTranslationUsage?: boolean } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-test-'))
  tempDirs.push(dataDir)
  const library = LibraryStore.open({ dataDir })
  stores.push(library)
  const translations: TranslationLog = {
    requests: [],
    prompts: [],
    omitUsage: options.omitTranslationUsage ?? false
  }
  const services = createServices({ library, crypto, fetch: translationFetch(translations) })
  const connection = services.connections.create({
    name: 'Mock LLM',
    baseUrl: 'https://mock.provider.local/v1',
    providerId: 'google'
  })
  services.connections.addApiKey(connection.id, 'key')
  const entries = services.connections.addModels(connection.id, [
    { model: 'mock-model', name: 'Mock Model' },
    { model: 'aux-model', name: 'Aux Model' }
  ]).models
  const entryId = entries[0]!.id
  const auxEntryId = entries[1]!.id

  const work1 = library.create({ title: 'Đại Đạo Triều Thiên', sourceLang: 'zh-Hans' })
  const ch1_1 = library.createChapter(work1.id, 'Chương 1').chapter
  const ch1_2 = library.createChapter(work1.id, 'Chương 2').chapter
  const ch1_amb1 = library.createChapter(work1.id, 'Tiết tử Thượng').chapter
  const ch1_amb2 = library.createChapter(work1.id, 'Tiết tử Hạ').chapter
  const src1 = 'Đoạn một của chương một.\n\nĐoạn hai của chương một.'
  const src2 = 'Đoạn một của chương hai.\n\nĐoạn hai của chương hai.'
  for (const [chapter, text] of [
    [ch1_1, src1],
    [ch1_2, src2],
    [ch1_amb1, src1],
    [ch1_amb2, src2]
  ] as const) {
    library.saveText(work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
  }
  const work2 = library.create({ title: 'Phàm Nhân Tu Tiên', sourceLang: 'zh-Hans' })
  const ch2_1 = library.createChapter(work2.id, 'Chương 1').chapter
  library.saveText(work2.id, ch2_1.id, 'source', src1, 0, segment(src1, 'zh-Hans'))

  const repository = new AgentRepository(library.appDb)
  const registry = new CapabilityRegistry()
  for (const cap of defaultReadCapabilities) registry.register(cap)
  const model = new ScriptedModel()
  // The auxiliary model (summaries) is scripted apart from the turn's own model.
  const auxModel = new ScriptedModel()
  model.settingsKeyOf = (selection) =>
    services.connections.translator(selection.connectionId, selection.entryId).settingsKey
  const agent = new AgentService({
    library,
    connections: services.connections,
    repository,
    registry,
    openChatModel: (selection) =>
      (selection.entryId === auxEntryId ? auxModel : model).open(selection)
  })
  const modelSelection = { connectionId: connection.id, entryId }

  return {
    library,
    services,
    repository,
    registry,
    agent,
    model,
    auxModel,
    auxEntryId,
    modelSelection,
    translations,
    work1,
    ch1_1,
    ch1_2,
    ch1_amb1,
    ch1_amb2,
    work2,
    ch2_1
  }
}
