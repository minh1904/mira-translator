import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionView } from '../../shared/contracts/aiConnections'
import type { TranslateBatchResult, TranslatePlan } from '../../shared/contracts/aiTranslate'
import { CHANNELS } from '../../shared/contracts/channels'
import type { ModelSettingsPatch } from '../../shared/contracts/modelSettings'
import type { LinkRecord } from '../../shared/contracts/links'
import type { Result } from '../../shared/contracts/result'
import { segment } from '../../shared/segmentation/segmenter'
import { ChapterTranslator } from '../services/ai/chapterTranslation'
import { ConnectionService } from '../services/ai/connectionService'
import { LibraryStore } from '../services/library/library'
import { SecretStore, type SecretCrypto } from '../infra/storage/secretStore'
import { createTempDirs } from '../testing/testing'
import { createLibraryHandlers } from './libraryHandlers'

/**
 * Dịch chương bằng AI, gọi đúng như app gọi: qua handler, trên kho thật, với một endpoint giả.
 * Điều phải đúng trước mọi thứ khác: **không ghi đè câu người dùng đã viết hay đã soát**.
 */

const tempDir = createTempDirs()
const stores: LibraryStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

const NOW = 1_700_000_000_000
const MODEL = 'gemini-flash-latest'
const SOURCE = 'One. Two. Three.'

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

interface Reply {
  status?: number
  /** Trả về `dst` cho từng `src`; mặc định là tiền tố "VI:". */
  translate?: (src: string) => string
  /** Bỏ câu ở vị trí này trong lô, để thử nhánh thiếu segment. */
  skipIndex?: number
  body?: string
  usage?: { prompt_tokens: number; completion_tokens: number }
}

/** Endpoint tương thích OpenAI giả. Mỗi phần tử của `replies` phục vụ một lời gọi, rồi lặp cái cuối. */
function fakeEndpoint(replies: Reply[]): {
  fetchImpl: typeof fetch
  calls: string[][]
  bodies: Array<Record<string, unknown>>
} {
  const calls: string[][] = []
  const bodies: Array<Record<string, unknown>> = []
  let index = 0
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const reply = replies[Math.min(index++, replies.length - 1)]
    const sent = JSON.parse(String(init?.body ?? '{}')) as {
      messages?: Array<{ content?: string }>
    }
    bodies.push(sent as Record<string, unknown>)
    const asked = JSON.parse(
      /<source>\n([\s\S]*?)\n<\/source>/.exec(sent.messages?.[1]?.content ?? '')?.[1] ?? '[]'
    ) as Array<{
      id: string
      src: string
    }>
    calls.push(asked.map((item) => item.id))

    if (reply.status !== undefined && reply.status >= 400) {
      return new Response(reply.body ?? '{"error":{"message":"nope"}}', { status: reply.status })
    }
    const items = asked
      .filter((_item, at) => at !== reply.skipIndex)
      .map((item) => ({ id: item.id, dst: (reply.translate ?? ((src) => 'VI:' + src))(item.src) }))
    const payload: Record<string, unknown> = {
      choices: [{ message: { content: JSON.stringify(items) } }]
    }
    if (reply.usage) payload.usage = reply.usage
    return new Response(JSON.stringify(payload), { status: 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls, bodies }
}

interface Harness {
  handlers: ReturnType<typeof createLibraryHandlers>
  library: LibraryStore
  workId: string
  chapterId: string
  sourceIds: string[]
  connectionId: string
  /** The model entry the chapter is translated with. */
  entryId: string
  /** The key of that entry's configuration right now; refresh it with `keyOf` after editing the entry. */
  settingsKey: string
  connections: ConnectionService
  calls: string[][]
  bodies: Array<Record<string, unknown>>
}

async function setup(replies: Reply[] = [{}], options: { key?: string } = {}): Promise<Harness> {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  let counter = 0
  const fakeId = (n: number): string => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const { fetchImpl, calls, bodies } = fakeEndpoint(replies)
  const connections = new ConnectionService({
    db: library.appDb,
    secrets: new SecretStore(crypto),
    now: () => NOW,
    newId: () => fakeId(++counter),
    fetchImpl,
    // A retry waits; no test needs to wait with it.
    retry: { sleep: async () => {} }
  })
  const translator = new ChapterTranslator({ library, connections, now: () => NOW })
  const handlers = createLibraryHandlers(library, undefined, connections, translator)

  const work = library.create({ title: 'Thử', sourceLang: 'en' })
  const chapter = library.createChapter(work.id, 'Một').chapter
  const saved = library.saveText(work.id, chapter.id, 'source', SOURCE, 0, segment(SOURCE, 'en'))

  const connection = connections.create({
    name: 'Gateway',
    baseUrl: 'http://127.0.0.1:8317/v1',
    providerId: 'google'
  })
  if (options.key) await connections.addApiKey(connection.id, options.key)
  const entryId = connections.addModels(connection.id, [{ model: MODEL }]).models[0]!.id

  return {
    handlers,
    library,
    workId: work.id,
    chapterId: chapter.id,
    sourceIds: saved.segments.map((item) => item.id),
    connectionId: connection.id,
    entryId,
    settingsKey: connections.translator(connection.id, entryId).settingsKey,
    connections,
    calls,
    bodies
  }
}

/** Edits the entry's settings the way the screen does, and returns the key of the result. */
function editEntry(
  harness: Harness,
  settings: ModelSettingsPatch,
  entryId = harness.entryId
): string {
  harness.connections.updateEntry(entryId, { settings })
  return harness.connections.translator(harness.connectionId, entryId).settingsKey
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message)
  return result.value
}

async function plan(harness: Harness, entryId = harness.entryId): Promise<TranslatePlan> {
  return unwrap(
    (await harness.handlers[CHANNELS.aiTranslatePlan]({
      workId: harness.workId,
      chapterId: harness.chapterId,
      connectionId: harness.connectionId,
      entryId
    })) as Result<TranslatePlan>
  )
}

async function runBatch(
  harness: Harness,
  sourceIds: string[],
  expectedRev: number,
  settingsKey = harness.settingsKey
): Promise<TranslateBatchResult> {
  return unwrap(await runBatchRaw(harness, sourceIds, expectedRev, settingsKey))
}

function runBatchRaw(
  harness: Harness,
  sourceIds: string[],
  expectedRev: number,
  settingsKey = harness.settingsKey,
  entryId = harness.entryId
): Promise<Result<TranslateBatchResult>> {
  return harness.handlers[CHANNELS.aiTranslateBatch]({
    workId: harness.workId,
    chapterId: harness.chapterId,
    connectionId: harness.connectionId,
    entryId,
    settingsKey,
    sourceIds,
    expectedRev
  }) as Promise<Result<TranslateBatchResult>>
}

async function links(harness: Harness): Promise<LinkRecord[]> {
  return harness.library.listLinks(harness.workId, harness.chapterId)
}

describe('translating with a model entry', () => {
  it('names the entry and the model it plans with, and fingerprints the configuration', async () => {
    const harness = await setup()
    const planned = await plan(harness)
    expect(planned).toMatchObject({
      entryId: harness.entryId,
      entryName: MODEL,
      model: MODEL,
      settingsKey: harness.settingsKey
    })
    expect(planned.settingsKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it("cuts the chapter by the entry's input limit, and the limit is part of the fingerprint", async () => {
    const harness = await setup()
    const before = await plan(harness)
    expect(before.batches).toHaveLength(1)

    // A limit of 1 token puts every sentence in a batch of its own.
    editEntry(harness, { inputTokenLimit: 1 })
    const after = await plan(harness)
    expect(after.batches).toHaveLength(3)
    expect(after.batches.flatMap((batch) => batch.sourceIds)).toEqual(harness.sourceIds)
    expect(after.settingsKey).not.toBe(before.settingsKey)

    // 0 is "default", so it goes back to the single batch and to the first fingerprint.
    editEntry(harness, { inputTokenLimit: 0 })
    const reset = await plan(harness)
    expect(reset.batches).toHaveLength(1)
    expect(reset.settingsKey).toBe(before.settingsKey)
  })

  it("sends the entry's settings with every batch, and each batch is one request", async () => {
    const harness = await setup()
    editEntry(harness, {
      inputTokenLimit: 1,
      // A level the catalog lists for this model: "off" is not one, and main now refuses to save it.
      thinking: 'low',
      temperature: { enabled: true, value: 0.3 }
    })
    const planned = await plan(harness)
    let rev = planned.targetRev
    for (const batch of planned.batches) {
      rev = (await runBatch(harness, batch.sourceIds, rev, planned.settingsKey)).targetRev
    }
    expect(harness.bodies).toHaveLength(3)
    for (const body of harness.bodies) {
      expect(body).toMatchObject({ temperature: 0.3, reasoning_effort: 'low', model: MODEL })
    }
  })

  it('sends a batch the plan cut with a larger limit as one request, not cut again at the default size', async () => {
    const harness = await setup()
    // About 6,000 estimated tokens: more than one batch at the default size (100 units / 4,500 tokens).
    const long = Array.from(
      { length: 110 },
      (_, n) => 'Sentence ' + n + ' ' + 'x'.repeat(190) + '.'
    ).join(' ')
    const chapter = harness.library.createChapter(harness.workId, 'Dài').chapter
    const saved = harness.library.saveText(
      harness.workId,
      chapter.id,
      'source',
      long,
      0,
      segment(long, 'en')
    )
    const request = {
      workId: harness.workId,
      chapterId: chapter.id,
      connectionId: harness.connectionId,
      entryId: harness.entryId
    }

    const byDefault = unwrap(
      (await harness.handlers[CHANNELS.aiTranslatePlan](request)) as Result<TranslatePlan>
    )
    expect(byDefault.batches.length).toBeGreaterThan(1)

    editEntry(harness, { inputTokenLimit: 100_000 })
    const planned = unwrap(
      (await harness.handlers[CHANNELS.aiTranslatePlan](request)) as Result<TranslatePlan>
    )
    expect(planned.batches).toHaveLength(1)
    expect(planned.batches[0]!.sourceIds).toEqual(saved.segments.map((item) => item.id))

    const result = unwrap(
      (await harness.handlers[CHANNELS.aiTranslateBatch]({
        ...request,
        settingsKey: planned.settingsKey,
        sourceIds: planned.batches[0]!.sourceIds,
        expectedRev: planned.targetRev
      })) as Result<TranslateBatchResult>
    )
    expect(result.error).toBeNull()
    // One planned batch is one call. If the provider cut it again at the default size, this would be 3.
    expect(harness.calls).toHaveLength(1)
  })

  it('sends the request it always sent for an entry nobody has set anything on', async () => {
    const harness = await setup()
    await runBatch(harness, harness.sourceIds, 0)
    expect(Object.keys(harness.bodies[0]!).sort()).toEqual(['messages', 'model'])
  })

  it('refuses the next batch when the entry was edited in the middle, and keeps what was done', async () => {
    const harness = await setup()
    editEntry(harness, { inputTokenLimit: 1 })
    const planned = await plan(harness)
    expect(planned.batches).toHaveLength(3)

    const first = await runBatch(
      harness,
      planned.batches[0]!.sourceIds,
      planned.targetRev,
      planned.settingsKey
    )
    const second = await runBatch(
      harness,
      planned.batches[1]!.sourceIds,
      first.targetRev,
      planned.settingsKey
    )
    expect(harness.calls).toHaveLength(2)

    // The temperature changes after the second batch.
    editEntry(harness, { temperature: { enabled: true, value: 0.3 } })
    const third = await runBatchRaw(
      harness,
      planned.batches[2]!.sourceIds,
      second.targetRev,
      planned.settingsKey
    )

    expect(third.ok).toBe(false)
    if (!third.ok) {
      expect(third.error.code).toBe('conflict')
      expect(third.error.message).toContain('lập kế hoạch lại')
    }
    // Nothing was sent for the third batch, and the first two are still in the translation.
    expect(harness.calls).toHaveLength(2)
    const target = harness.library.readText(harness.workId, harness.chapterId, 'target')
    expect(target.content).toContain('VI:One.')
    expect(target.content).toContain('VI:Two.')
    expect(target.content).not.toContain('VI:Three.')
  })

  it('lets a new plan finish the chapter with the new configuration', async () => {
    const harness = await setup()
    editEntry(harness, { inputTokenLimit: 1 })
    const planned = await plan(harness)
    const first = await runBatch(
      harness,
      planned.batches[0]!.sourceIds,
      planned.targetRev,
      planned.settingsKey
    )

    editEntry(harness, { temperature: { enabled: true, value: 0.3 } })
    const replanned = await plan(harness)
    expect(replanned.settingsKey).not.toBe(planned.settingsKey)
    await runBatch(harness, planned.batches[1]!.sourceIds, first.targetRev, replanned.settingsKey)

    // The first batch went out without a temperature, the one after the new plan with it: never mixed within
    // one plan, which is the point.
    expect(harness.bodies[0]).not.toHaveProperty('temperature')
    expect(harness.bodies[1]).toMatchObject({ temperature: 0.3 })
  })

  it.each<[string, ModelSettingsPatch]>([
    ['the thinking level', { thinking: 'low' }],
    ['top_p', { topP: { enabled: true, value: 0.9 } }],
    ['the output limit', { outputTokenLimit: 4000 }],
    ['an extra header', { extraHeaders: { enabled: true, value: { 'X-A': 'b' } } }],
    ['the extra body', { extraBody: { enabled: true, value: { top_k: 5 } } }]
  ])('refuses the next batch when %s was edited in the middle', async (_label, patch) => {
    const harness = await setup()
    const planned = await plan(harness)
    editEntry(harness, patch)
    const result = await runBatchRaw(
      harness,
      harness.sourceIds,
      planned.targetRev,
      planned.settingsKey
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
    expect(harness.calls).toEqual([])
  })

  it('does not refuse when only the pace was edited, because that changes how fast and not what', async () => {
    const harness = await setup()
    editEntry(harness, { inputTokenLimit: 1 })
    const planned = await plan(harness)
    const first = await runBatch(
      harness,
      planned.batches[0]!.sourceIds,
      planned.targetRev,
      planned.settingsKey
    )

    // Slowing the run down and capping its parallelism in the middle of it is allowed.
    editEntry(harness, { rpmLimit: 6, concurrencyLimit: 1 })
    const second = await runBatchRaw(
      harness,
      planned.batches[1]!.sourceIds,
      first.targetRev,
      planned.settingsKey
    )
    expect(second.ok).toBe(true)
    expect(harness.calls).toHaveLength(2)
  })

  it('does not refuse for a value that is switched off, or for a rename', async () => {
    const harness = await setup()
    editEntry(harness, { temperature: { enabled: false, value: 0.3 } })
    const planned = await plan(harness)
    harness.connections.updateEntry(harness.entryId, { name: 'Tên khác' })
    editEntry(harness, { temperature: { enabled: false, value: 1.9 } })
    const result = await runBatchRaw(
      harness,
      harness.sourceIds,
      planned.targetRev,
      planned.settingsKey
    )
    expect(result.ok).toBe(true)
  })

  it('reports an entry deleted in the middle as not_found, and sends nothing', async () => {
    const harness = await setup()
    const planned = await plan(harness)
    harness.connections.deleteEntry(harness.entryId)
    const result = await runBatchRaw(
      harness,
      harness.sourceIds,
      planned.targetRev,
      planned.settingsKey
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_found')
    expect(harness.calls).toEqual([])
  })

  it('refuses an entry of another connection', async () => {
    const harness = await setup()
    const other = harness.connections.create({
      name: 'Khác',
      baseUrl: 'http://127.0.0.1:9999/v1',
      providerId: null
    })
    const foreign = harness.connections.addModels(other.id, [{ model: MODEL }]).models[0]!.id
    const result = await runBatchRaw(harness, harness.sourceIds, 0, harness.settingsKey, foreign)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_found')
    expect(harness.calls).toEqual([])
  })
})

describe('ai translate channels', () => {
  it('plans before sending anything: segments, batches and an estimate with a price', async () => {
    const harness = await setup()
    const planned = await plan(harness)

    expect(planned.segmentCount).toBe(3)
    expect(planned.batches.flatMap((batch) => batch.sourceIds)).toEqual(harness.sourceIds)
    expect(planned.hasTranslation).toBe(false)
    expect(planned.protectedCount).toBe(0)
    expect(planned.estimate.inputTokens).toBeGreaterThan(0)
    expect(planned.estimate.usd).toBeGreaterThan(0)
    expect(planned.catalogReadAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Lập kế hoạch không gửi gì ra ngoài.
    expect(harness.calls).toEqual([])
  })

  it('says a model with no price is unpriced instead of showing zero', async () => {
    const harness = await setup()
    const unpriced = harness.connections
      .addModels(harness.connectionId, [{ model: 'khong-co-trong-bang' }])
      .models.at(-1)!.id
    const planned = await plan(harness, unpriced)
    expect(planned.estimate.usd).toBeUndefined()
    expect(planned.estimate.inputTokens).toBeGreaterThan(0)
  })

  it('writes a batch into the translation as an unconfirmed AI suggestion', async () => {
    const harness = await setup([{ usage: { prompt_tokens: 120, completion_tokens: 90 } }])
    const result = await runBatch(harness, harness.sourceIds, 0)

    expect(result.written).toEqual(harness.sourceIds)
    expect(result.held).toEqual([])
    expect(result.failed).toEqual([])
    expect(result.error).toBeNull()
    expect(result.usage).toEqual({
      inputTokens: 120,
      uncachedInputTokens: 120,
      outputTokens: 90,
      source: 'provider',
      complete: true
    })

    const target = harness.library.readText(harness.workId, harness.chapterId, 'target')
    expect(target.content).toContain('VI:One.')
    expect(target.content).toContain('VI:Three.')
    expect(target.rev).toBe(result.targetRev)

    const all = await links(harness)
    expect(all).toHaveLength(3)
    for (const link of all) {
      expect(link.kind).toBe('ai')
      // Máy dịch chưa ai soát: hàng phải hiện là "AI", không phải "đã soát".
      expect(link.reviewedAt).toBeNull()
    }

    const first = target.segments[0]
    expect(harness.library.getProvenance(harness.workId, first.id)).toMatchObject({
      origin: 'ai',
      model: MODEL
    })
  })

  it('keeps a row the user wrote and hands back the AI version as a suggestion', async () => {
    const harness = await setup()
    // Người dùng tự dịch câu đầu.
    const mine = harness.library.saveRow(harness.workId, {
      chapterId: harness.chapterId,
      sourceId: harness.sourceIds[0],
      text: 'Bản của tôi.',
      expectedRev: 0
    })

    const planned = await plan(harness)
    expect(planned.hasTranslation).toBe(true)
    expect(planned.protectedCount).toBe(1)

    const result = await runBatch(harness, harness.sourceIds, mine.target.rev)
    expect(result.written).toEqual([harness.sourceIds[1], harness.sourceIds[2]])
    expect(result.held).toEqual([
      {
        sourceId: harness.sourceIds[0],
        sourceText: 'One.',
        userText: 'Bản của tôi.',
        aiText: 'VI:One.'
      }
    ])
    expect(result.error).toBeNull()

    const target = harness.library.readText(harness.workId, harness.chapterId, 'target')
    expect(target.content).toContain('Bản của tôi.')
    expect(target.content).not.toContain('VI:One.')

    const own = (await links(harness)).filter((link) => link.members.includes(harness.sourceIds[0]))
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ kind: 'user' })
    expect(own[0].reviewedAt).not.toBeNull()
  })

  it('overwrites its own earlier suggestion, since nobody has confirmed it', async () => {
    const harness = await setup([
      { translate: (src) => 'VI:' + src },
      { translate: () => 'Lần hai.' }
    ])
    const first = await runBatch(harness, [harness.sourceIds[0]], 0)
    const second = await runBatch(harness, [harness.sourceIds[0]], first.targetRev)

    expect(second.written).toEqual([harness.sourceIds[0]])
    expect(second.held).toEqual([])
    const target = harness.library.readText(harness.workId, harness.chapterId, 'target')
    expect(target.content).toBe('Lần hai.')
  })

  it('a failed batch loses nothing and lists its own segments for a retry', async () => {
    // Kết nối này không có khóa để đổi, nên 429 được thử lại có chờ: lần đầu cộng hai lần thử lại của
    // gateway, tức ba lần 429 liên tiếp lô mới coi là lỗi.
    const fail429 = { status: 429, body: '{"error":{"message":"hết hạn mức"}}' }
    const harness = await setup([fail429, fail429, fail429, {}])
    const failedRun = await runBatch(harness, harness.sourceIds, 0)

    expect(failedRun.written).toEqual([])
    expect(failedRun.failed).toEqual(harness.sourceIds)
    expect(failedRun.error?.kind).toBe('rate_limited')
    expect(harness.library.readText(harness.workId, harness.chapterId, 'target').content).toBe('')

    // "Dịch lại phần lỗi": chỉ gửi lại đúng các câu lỗi.
    const retry = await runBatch(harness, failedRun.failed, failedRun.targetRev)
    expect(retry.written).toEqual(harness.sourceIds)
    expect(retry.error).toBeNull()
  })

  it('reports the segments the provider never answered instead of passing silently', async () => {
    const harness = await setup([{ skipIndex: 0 }])
    const result = await runBatch(harness, harness.sourceIds, 0)
    // Hai câu về được thì vẫn ghi; câu không bao giờ về nằm trong nhóm chạy lại.
    expect(result.written).toEqual([harness.sourceIds[1], harness.sourceIds[2]])
    expect(result.failed).toEqual([harness.sourceIds[0]])
    expect(result.error?.kind).toBe('invalid_response')
    expect(harness.library.readText(harness.workId, harness.chapterId, 'target').content).toContain(
      'VI:Two.'
    )
  })

  it('names the key it used, so a switch between batches can be announced', async () => {
    const harness = await setup([{}], { key: 'AIzaSy-khoa-gia-0001' })
    const result = await runBatch(harness, harness.sourceIds, 0)
    expect(result.keyTail).toBe('0001')
  })

  it('refuses a stale revision rather than writing over a change made elsewhere', async () => {
    const harness = await setup()
    const result = await runBatchRaw(harness, harness.sourceIds, 7)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
    expect(harness.calls).toEqual([])
  })

  it('refuses to plan a chapter with no source text', async () => {
    const harness = await setup()
    const empty = harness.library.createChapter(harness.workId, 'Rỗng').chapter
    const result = (await harness.handlers[CHANNELS.aiTranslatePlan]({
      workId: harness.workId,
      chapterId: empty.id,
      connectionId: harness.connectionId,
      entryId: harness.entryId
    })) as Result<TranslatePlan>
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('bản gốc')
  })

  it('refuses a connection the user switched off', async () => {
    const harness = await setup()
    unwrap(
      (await harness.handlers[CHANNELS.aiConnectionsUpdate]({
        id: harness.connectionId,
        patch: { enabled: false }
      })) as Result<ConnectionView>
    )
    const result = (await harness.handlers[CHANNELS.aiTranslatePlan]({
      workId: harness.workId,
      chapterId: harness.chapterId,
      connectionId: harness.connectionId,
      entryId: harness.entryId
    })) as Result<TranslatePlan>
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('đang tắt')
  })

  it('refuses input that is not what the channel takes', async () => {
    const harness = await setup()
    const base = {
      workId: harness.workId,
      chapterId: harness.chapterId,
      connectionId: harness.connectionId,
      entryId: harness.entryId,
      settingsKey: harness.settingsKey,
      sourceIds: harness.sourceIds,
      expectedRev: 0
    }
    const bad = [
      { ...base, workId: 'x' },
      // A model name is not an entry id, and a batch cannot go without the key of its plan.
      { ...base, entryId: MODEL },
      { ...base, settingsKey: 'abc' },
      { ...base, settingsKey: undefined },
      { ...base, model: MODEL },
      { ...base, sourceIds: [] },
      { ...base, sourceIds: ['not-a-uuid'] },
      { ...base, expectedRev: -1 },
      { ...base, extra: 1 }
    ]
    for (const payload of bad) {
      const result = (await harness.handlers[CHANNELS.aiTranslateBatch](
        payload
      )) as Result<TranslateBatchResult>
      expect(result.ok).toBe(false)
    }
  })
})
