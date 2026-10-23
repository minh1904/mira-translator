import { afterEach, describe, expect, it } from 'vitest'
import type { SecretCrypto } from '../infra/storage/secretStore'
import { createTempDirs } from '../testing/testing'
import { ChapterTranslator } from './ai/chapterTranslation'
import { ChatService } from './ai/chatService'
import { ConnectionService } from './ai/connectionService'
import { createServices } from './createServices'
import { LibraryStore } from './library/library'
import type { ChatChunk, ChatSendInput } from '../../shared/contracts/aiChat'
import { getProposal } from '../infra/storage/aiProposals'
import { getAiTurn } from '../infra/storage/aiSessions'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/** A stand-in for Electron's safeStorage that also counts how often it is asked to encrypt. */
function countingCrypto(): SecretCrypto & { encrypted: number } {
  const xor = (bytes: Uint8Array): Uint8Array => new Uint8Array([...bytes].map((b) => b ^ 0xff))
  const crypto = {
    encrypted: 0,
    isEncryptionAvailable: () => true,
    async encrypt(plain: string) {
      crypto.encrypted++
      return xor(Buffer.from(plain, 'utf-8'))
    },
    async decrypt(cipher: Uint8Array) {
      return { value: Buffer.from(xor(cipher)).toString('utf-8'), shouldReEncrypt: false }
    }
  }
  return crypto
}

function openLibrary(): LibraryStore {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  return library
}

describe('createServices', () => {
  it('builds the three AI services over one library', () => {
    const services = createServices({ library: openLibrary(), crypto: countingCrypto() })
    expect(services.connections).toBeInstanceOf(ConnectionService)
    expect(services.translator).toBeInstanceOf(ChapterTranslator)
    expect(services.chat).toBeInstanceOf(ChatService)
  })

  it('protects keys with the crypto it was given and stores nothing readable', async () => {
    const library = openLibrary()
    const crypto = countingCrypto()
    const { connections } = createServices({ library, crypto })

    const created = connections.create({
      name: 'Gateway thử',
      baseUrl: 'http://127.0.0.1:8317/v1',
      providerId: null
    })
    const withKey = await connections.addApiKey(created.id, 'AIzaSyFAKEKEY01')
    expect(withKey.keys[0].tail).toBe('EY01')
    expect(crypto.encrypted).toBe(1)

    const stored = library.appDb
      .prepare('SELECT secret FROM ai_key WHERE connection_id = ?')
      .all<{ secret: Uint8Array }>(created.id)
    expect(stored).toHaveLength(1)
    // What reaches the database is the crypto's output, never the key as typed.
    expect(Buffer.from(stored[0].secret).toString('utf-8')).not.toContain('AIzaSyFAKEKEY01')
  })

  it('sends provider requests through the fetch it was given', async () => {
    const library = openLibrary()
    const seen: string[] = []
    const fetchLike = (async (url: string | URL | Request) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ data: [{ id: 'gemini-test' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }) as typeof fetch
    const { connections } = createServices({ library, crypto: countingCrypto(), fetch: fetchLike })
    const created = connections.create({
      name: 'Gateway thử',
      baseUrl: 'http://127.0.0.1:8317/v1/chat/completions',
      providerId: null
    })

    const result = await connections.test(created.id)
    // The pasted endpoint was cut back to its base, and the request went out through the injected fetch.
    expect(seen).toEqual(['http://127.0.0.1:8317/v1/models'])
    expect(result.models.map((model) => model.id)).toEqual(['gemini-test'])
  })

  it('refuses to keep a key when the crypto cannot protect it', async () => {
    const library = openLibrary()
    const crypto = { ...countingCrypto(), isEncryptionAvailable: () => false }
    const { connections } = createServices({ library, crypto })
    const created = connections.create({
      name: 'Gateway thử',
      baseUrl: 'http://127.0.0.1:8317/v1',
      providerId: null
    })

    await expect(connections.addApiKey(created.id, 'AIzaSyFAKEKEY01')).rejects.toThrow()
    const stored = library.appDb.prepare('SELECT secret FROM ai_key').all()
    expect(stored).toEqual([])
  })

  it('lets the chat tools propose against the real store, and only through them', async () => {
    const library = openLibrary()
    const work = library.create({ title: 'Tác phẩm', sourceLang: 'en' })
    const chapter = library.createChapter(work.id).chapter
    library.saveText(work.id, chapter.id, 'source', 'Winter came.', 0, [])
    const call = (id: string, name: string, args: unknown): unknown => ({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: id === 't1' ? 0 : 1,
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) }
              }
            ]
          }
        }
      ]
    })
    const rounds = [
      [
        call('t1', 'propose_translation', { chapter: 1, from: 1, to: 1, text: 'Mùa đông đã tới.' }),
        call('t2', 'propose_glossary_term', { term: 'Winter', translation: 'Mùa đông' })
      ],
      // The answer carries a fenced block; with the modes gone it is only text.
      [
        { choices: [{ delta: { content: 'Đã đề xuất.\n```\nMùa đông khác\n```' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] }
      ]
    ]
    let round = 0
    const fetchLike = (async () => {
      const frames = rounds[Math.min(round++, rounds.length - 1)]
      const body =
        frames.map((value) => 'data: ' + JSON.stringify(value) + '\n\n').join('') +
        'data: [DONE]\n\n'
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch
    const services = createServices({ library, crypto: countingCrypto(), fetch: fetchLike })
    const connection = services.connections.create({
      name: 'Mock',
      baseUrl: 'http://127.0.0.1:8317/v1',
      providerId: 'google'
    })
    const entryId = services.connections.addModels(connection.id, [
      { model: 'gemini-flash-latest' }
    ]).models[0].id
    const input: ChatSendInput = {
      workId: work.id,
      chapterId: chapter.id,
      connectionId: connection.id,
      entryId,
      sourceLang: 'en',
      question: 'Dịch đoạn 1 và thêm thuật ngữ',
      history: [],
      location: { caret: { source: 1, target: null }, selection: null }
    }
    const chunks: ChatChunk[] = []
    await new Promise<void>((resolve, reject) => {
      services.chat.startWithSession(input, (chunk) => {
        chunks.push(chunk)
        if (chunk.kind === 'error') reject(new Error(chunk.error.message))
        if (chunk.kind === 'done') resolve()
      })
    })
    const proposals = chunks.flatMap((chunk) => (chunk.kind === 'proposal' ? [chunk.proposal] : []))
    expect(proposals.map((proposal) => proposal.type)).toEqual(['translation', 'term'])
    const done = chunks.find((chunk) => chunk.kind === 'done')!
    const text = proposals[0].type === 'translation' ? proposals[0] : null
    const stored = library.withWork(work.id, (db) => ({
      turn: getAiTurn(db, done.requestId),
      proposal: getProposal(db, text!.proposalId),
      all: db.prepare('SELECT count(*) AS n FROM proposal').get<{ n: number }>()!.n
    }))
    expect(stored.turn).toMatchObject({ status: 'done', action: 'chat', location: input.location })
    expect(stored.proposal).toMatchObject({
      turnId: done.requestId,
      policy: 'review',
      origin: 'chat'
    })
    expect(stored.proposal.parts[0]).toMatchObject({
      afterText: 'Mùa đông đã tới.',
      status: 'pending'
    })
    // One proposal, from the tool: the fenced answer made none.
    expect(stored.all).toBe(1)
    expect(library.readText(work.id, chapter.id, 'target').content).toBe('')
    const term = services.glossary.list(work.id).find((entry) => entry.source === 'Winter')
    expect(term).toMatchObject({ target: 'Mùa đông', status: 'approved', origin: 'ai' })
  })
})
