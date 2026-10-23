import type { SecretCrypto } from '../infra/storage/secretStore'
import { SecretStore } from '../infra/storage/secretStore'
import { ChapterTranslator } from './ai/chapterTranslation'
import { ParagraphTranslator } from './ai/paragraphTranslation'
import { ChatService } from './ai/chatService'
import { ConnectionService } from './ai/connectionService'
import { GlossaryService } from './context/glossaryService'
import { ContextExtractionService } from './context/contextExtractionService'
import type { LibraryStore } from './library/library'
import { createSourceServices, type SourceServices } from '../sources/sourceServices'
import {
  createAiSession,
  getAiSession,
  interruptAiTurns,
  startAiTurn,
  updateAiTurn
} from '../infra/storage/aiSessions'
import { createToolProposalInDb } from './proposals/chatProposalService'
import { createContextEntry, listContextEntries } from '../infra/storage/contextEntries'
import { getEffectiveDyadsForChapter } from '../infra/storage/addressingEntries'
import { AgentRepository } from '../infra/storage/agentRepository'
import { AgentService } from './agent/agentService'
import { defaultReadCapabilities } from './agent/capabilities/readCapabilities'
import { CapabilityRegistry } from './agent/registry'
import { AgentTaskRepository } from '../infra/storage/agentTaskRepository'
import { AgentTaskService } from './agent/taskService'
import { AgentWriteCoordinator } from './agent/writeCoordinator'

/** The AI services of the app, built over one library and one way of protecting keys. */
export interface Services {
  connections: ConnectionService
  translator: ChapterTranslator
  paragraphTranslator: ParagraphTranslator
  chat: ChatService
  glossary: GlossaryService
  sources: SourceServices
  agent: AgentService
  tasks: AgentTaskService
}

/**
 * Wires the services together. It takes the key-protection capability as an argument instead of
 * reaching for Electron's `safeStorage`, so this file needs nothing from Electron and the wiring can
 * be built and tested without a window. The Electron layer passes the real `SecretCrypto`.
 */
export function createServices({
  library,
  crypto,
  fetch: fetchImpl,
  userAgent,
  openExternal
}: {
  library: LibraryStore
  crypto: SecretCrypto
  /**
   * How requests reach the provider. The Electron layer passes `net.fetch` so they follow the system proxy;
   * left out, the global `fetch` is used, which is what tests and any non-Electron caller want.
   */
  fetch?: typeof fetch
  /** `Mira/<phiên bản>`, for the headers where Mira names itself. */
  userAgent?: string
  /** Opens a login's verification page; Electron passes `shell.openExternal`. */
  openExternal?: (url: string) => Promise<void>
}): Services {
  const connections = new ConnectionService({
    db: library.appDb,
    secrets: new SecretStore(crypto),
    now: () => library.appNow(),
    newId: () => library.newAppId(),
    fetchImpl,
    userAgent,
    openExternal
  })
  const translator = new ChapterTranslator({
    library,
    connections,
    now: () => library.appNow()
  })
  const paragraphTranslator = new ParagraphTranslator({
    library,
    connections,
    now: () => library.appNow()
  })
  for (const work of library.list().works) {
    library.withWork(work.id, (db) => db.transaction(() => interruptAiTurns(db, library.appNow())))
  }
  const chat = new ChatService({
    connections,
    // Tên tác phẩm và chương cho khối vị trí. Đọc lỗi thì khối chỉ nói số đoạn, không chặn lượt.
    chapter: (input) => {
      try {
        const chapter = library
          .listChapters(input.workId)
          .find((item) => item.id === input.chapterId)
        return chapter
          ? {
              workTitle: library.get(input.workId).title,
              number: chapter.number,
              title: chapter.title
            }
          : null
      } catch {
        return null
      }
    },
    records: {
      start: (requestId, input, provider, model) =>
        library.withWork(input.workId, (db) =>
          db.transaction(() => {
            const sessionId = input.sessionId ?? library.newAppId()
            if (input.sessionId) getAiSession(db, sessionId)
            else createAiSession(db, sessionId, input.question.slice(0, 80), library.appNow())
            startAiTurn(db, {
              id: requestId,
              sessionId,
              chapterId: input.chapterId,
              action: 'chat',
              question: input.question,
              location: input.location,
              droppedTurns: input.droppedTurns ?? 0,
              provider,
              model,
              now: library.appNow()
            })
            return sessionId
          })
        ),
      update: (requestId, workId, patch) =>
        library.withWork(workId, (db) => {
          updateAiTurn(db, requestId, patch, library.appNow())
        })
    },
    // The store the rest of the app reads through. The tools read text, links, the glossary and the
    // addressing pairs; the only writes they reach are the two below, and both make something that waits
    // for the user.
    library: {
      listChapters: (workId) => library.listChapters(workId),
      readText: (workId, chapterId, side) => library.readText(workId, chapterId, side),
      listLinks: (workId, chapterId) => library.listLinks(workId, chapterId),
      readSideContents: (workId, side) => library.readSideContents(workId, side),
      listGlossary: (workId) =>
        library.withWork(workId, (db) =>
          listContextEntries(db, { kind: 'term', status: 'approved' })
        ),
      listAddressing: (workId, chapterId) =>
        library.withWork(workId, (db) => getEffectiveDyadsForChapter(db, chapterId))
    },
    writes: {
      createProposal: (workId, input) =>
        library.withWork(workId, (db) =>
          db.transaction(() =>
            createToolProposalInDb(db, input, library.appNow(), () => library.newAppId())
          )
        ),
      createTerm: (workId, input) =>
        library.withWork(workId, (db) => ({
          entryId: createContextEntry(db, {
            id: library.newAppId(),
            kind: 'term',
            source: input.term,
            target: input.translation,
            aliases: input.variants,
            notes: input.note,
            status: 'approved',
            origin: 'ai',
            now: library.appNow()
          }).id
        }))
    },
    newId: () => library.newAppId(),
    now: () => library.appNow()
  })
  const glossary = new GlossaryService(library, () => library.appNow())
  const sources = createSourceServices(library, crypto)
  const agentRegistry = new CapabilityRegistry()
  for (const capability of defaultReadCapabilities) agentRegistry.register(capability)
  const agentRepository = new AgentRepository(library.appDb)
  // Chat writes and task writes flush editors through one coordinator.
  const writeCoordinator = new AgentWriteCoordinator()
  const tasks = new AgentTaskService({
    library,
    connections,
    tasks: new AgentTaskRepository(library.appDb),
    operations: agentRepository,
    writeCoordinator,
    extraction: new ContextExtractionService(library, connections, { now: () => library.appNow() }),
    now: () => library.appNow(),
    newId: () => library.newAppId()
  })
  const agent = new AgentService({
    library,
    connections,
    repository: agentRepository,
    registry: agentRegistry,
    writeCoordinator,
    tasks,
    now: () => library.appNow()
  })
  // Operations first (journal wins), then what a crash left in tasks; neither calls a provider.
  agent.reconcileOnStartup()
  tasks.reconcileOnStartup()
  return { connections, translator, paragraphTranslator, chat, glossary, sources, agent, tasks }
}
