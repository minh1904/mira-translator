import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { CHANNELS, EVENT_CHANNELS, type Channel } from '../../shared/contracts/channels'
import type { TaskQualityView } from '../../shared/contracts/taskQuality'
import type {
  AgentStreamEvent,
  AgentCancelInput,
  AgentOperation,
  AgentOperationDetailView,
  AgentSendInput,
  AgentSendResult,
  AgentSessionDetailView,
  AgentSessionView,
  AgentUndoInput,
  AgentUndoResult,
  AgentWriteIntentAck
} from '../../shared/contracts/agent'
import type { Result } from '../../shared/contracts/result'
import { LibraryStore } from '../services/library/library'
import { createTempDirs } from '../testing/testing'
import { createLibraryHandlers } from './libraryHandlers'
import { AgentRepository } from '../infra/storage/agentRepository'
import { createServices } from '../services/createServices'
import type { SecretCrypto } from '../infra/storage/secretStore'
import { segment } from '../../shared/segmentation/segmenter'
import { callTools, say, setupAgent } from '../services/agent/agentTestKit'
import type { ChunkSink, WindowBroadcast } from './handler'
import type {
  AgentTaskControlInput,
  AgentTaskCreateInput,
  AgentTaskDetailView,
  AgentTaskSummary,
  AgentTaskView
} from '../../shared/contracts/agentTask'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

interface Setup {
  library: LibraryStore
  call<T = unknown>(channel: Channel, raw?: unknown): Result<T>
}

function setup(): Setup {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  const crypto: SecretCrypto = {
    isEncryptionAvailable: () => true,
    encrypt: async (plain) => Buffer.from(plain),
    decrypt: async (cipher) => ({ value: Buffer.from(cipher).toString(), shouldReEncrypt: false })
  }
  const services = createServices({ library, crypto })
  const handlers = createLibraryHandlers(
    library,
    undefined,
    services.connections,
    services.translator,
    services.chat,
    services.glossary,
    undefined,
    services.paragraphTranslator,
    undefined,
    services.sources,
    services.agent,
    undefined,
    services.tasks
  )
  return { library, call: (channel, raw) => handlers[channel](raw) as Result<never> }
}

const value = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error('expected ok, got ' + result.error.code)
  return result.value
}

describe('agent IPC handlers', () => {
  it('creates, lists and gets sessions through validated calls', () => {
    const { call } = setup()

    const created = value(
      call<AgentSessionView>(CHANNELS.agentSessionsCreate, { title: 'Phiên dịch 1' })
    )
    expect(created.title).toBe('Phiên dịch 1')

    const listed = value<{ sessions: AgentSessionView[] }>(
      call(CHANNELS.agentSessionsList, { limit: 10 })
    )
    expect(listed.sessions).toHaveLength(1)
    expect(listed.sessions[0].id).toBe(created.id)

    const detail = value<AgentSessionDetailView>(
      call(CHANNELS.agentSessionsGet, { sessionId: created.id })
    )
    expect(detail.session.id).toBe(created.id)
    expect(detail.turns).toHaveLength(0)
  })

  it('sets a session permission level and refuses one on the send command', () => {
    const { call } = setup()
    const created = value(call<AgentSessionView>(CHANNELS.agentSessionsCreate, { title: 'Quyền' }))
    expect(created.permissionLevel).toBe('default')

    const raised = value(
      call<AgentSessionView>(CHANNELS.agentSessionsSetPermissionLevel, {
        sessionId: created.id,
        level: 'autopilot'
      })
    )
    expect(raised.permissionLevel).toBe('autopilot')
    const unknown = call(CHANNELS.agentSessionsSetPermissionLevel, {
      sessionId: created.id,
      level: 'normal'
    })
    expect(unknown.ok).toBe(false)

    // The level belongs to the session: a send command cannot carry one.
    const sent = call(CHANNELS.agentTurnSend, {
      sessionId: created.id,
      clientCommandId: randomUUID(),
      instruction: 'Dịch chương 1',
      permissionLevel: 'autopilot'
    })
    expect(sent.ok).toBe(false)
    if (sent.ok) return
    expect(sent.error.code).toBe('validation')

    const accepted = value(
      call<AgentSendResult>(CHANNELS.agentTurnSend, {
        sessionId: created.id,
        clientCommandId: randomUUID(),
        instruction: 'Dịch chương 1',
        mode: 'ask'
      } satisfies AgentSendInput)
    )
    const detail = value<AgentSessionDetailView>(
      call(CHANNELS.agentSessionsGet, { sessionId: accepted.sessionId })
    )
    expect(detail.turns[0]).toMatchObject({ mode: 'ask', permissionLevel: 'autopilot' })
    expect(detail.sessionApprovals).toEqual([])
  })

  it('reads a stored tool call by id and reports one that does not exist', () => {
    const { call } = setup()
    const missing = call(CHANNELS.agentToolCallGet, { toolCallId: randomUUID() })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.error.code).toBe('not_found')
    const invalid = call(CHANNELS.agentToolCallGet, { toolCallId: 'x' })
    expect(invalid.ok).toBe(false)
  })

  it('rejects an invalid session id when getting session detail', () => {
    const { call } = setup()
    const result = call(CHANNELS.agentSessionsGet, { sessionId: 'not-a-uuid' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('validation')
  })

  it('sends turn and cancels active turn', () => {
    const { call } = setup()

    const sent = value<AgentSendResult>(
      call<AgentSendResult>(CHANNELS.agentTurnSend, {
        clientCommandId: randomUUID(),
        instruction: 'Dịch chương 1',
        context: {}
      } satisfies AgentSendInput)
    )
    expect(sent.turnId).toBeDefined()
    expect(sent.sessionId).toBeDefined()

    const cancelled = call<void>(CHANNELS.agentTurnCancel, {
      turnId: sent.turnId
    } satisfies AgentCancelInput)
    expect(cancelled.ok).toBe(true)

    const detail = value<AgentSessionDetailView>(
      call(CHANNELS.agentSessionsGet, { sessionId: sent.sessionId })
    )
    expect(detail.turns).toHaveLength(1)
    expect(detail.turns[0].status).toBe('cancelled')
  })

  it('gets operation detail and executes undo', () => {
    const { library, call } = setup()
    const repo = new AgentRepository(library.appDb)
    const work = library.create({ title: 'Test', sourceLang: 'en' })
    const chapter = library.createChapter(work.id, 'Một').chapter
    const source = library.saveText(work.id, chapter.id, 'source', 'One.', 0, segment('One.', 'en'))
    const session = repo.createSession({ id: randomUUID(), now: 10 })
    const turn = repo.createTurn({
      id: randomUUID(),
      sessionId: session.id,
      instruction: 'test',
      context: {},
      now: 10
    })
    const op = repo.createOperation({
      id: randomUUID(),
      turnId: turn.id,
      commandId: randomUUID(),
      capability: 'translate_chapter',
      target: {
        kind: 'chapter',
        workId: work.id,
        workLabel: 'Test',
        chapterId: chapter.id,
        chapterLabel: 'Một',
        side: 'target'
      },
      now: 10
    })
    repo.transitionOperation(op.id, 'running', { now: 10 })
    repo.transitionOperation(op.id, 'completed', { now: 11, hasChanges: true })
    library.prepareAgentOperation(work.id, {
      operationId: op.id,
      chapterId: chapter.id,
      side: 'target',
      totalUnits: 1
    })
    const release = library.acquireTargetWriteLease(
      { workId: work.id, chapterId: chapter.id, side: 'target' },
      op.id
    )
    library.applyAgentTranslationBatch(work.id, {
      operationId: op.id,
      batchKey: 'batch-1',
      expectedRev: 0,
      checksum: 'sha256:test',
      rows: [{ sourceId: source.segments[0]!.id, text: 'Một.' }],
      by: { origin: 'ai', provider: 'fake', model: 'test' }
    })
    library.markAgentOperationTerminal(work.id, op.id, 'completed', { translated: 1 })
    release()

    const opDetail = value<AgentOperationDetailView>(
      call(CHANNELS.agentOperationGet, { operationId: op.id })
    )
    expect(opDetail.operation.id).toBe(op.id)
    expect(opDetail.operation.state).toBe('completed')
    const log = value<AgentOperation[]>(call(CHANNELS.agentOperationList, { limit: 50 }))
    expect(log.map((each) => each.id)).toContain(op.id)
    expect(call(CHANNELS.agentOperationList, { limit: 0 }).ok).toBe(false)

    const undoRes = value<AgentUndoResult>(
      call(CHANNELS.agentOperationUndo, { operationId: op.id } satisfies AgentUndoInput)
    )
    expect(undoRes.targetRev).toBe(2)
    expect(library.readText(work.id, chapter.id, 'target').content).toBe('')

    const opAfter = value<AgentOperationDetailView>(
      call(CHANNELS.agentOperationGet, { operationId: op.id })
    )
    expect(opAfter.operation.state).toBe('undone')
  })

  describe('turn owned by Main', () => {
    function windowed() {
      const kit = setupAgent()
      const received = new Map<number, AgentStreamEvent[]>([
        [1, []],
        [2, []]
      ])
      let finished: () => void = () => {}
      const done = new Promise<void>((resolve) => {
        finished = resolve
      })
      const windows: WindowBroadcast = {
        send(channel, payload) {
          if (channel !== EVENT_CHANNELS.agentStreamEvent) return [...received.keys()]
          const event = payload as AgentStreamEvent
          for (const events of received.values()) events.push(event)
          if (['done', 'error', 'cancelled'].includes(event.kind)) finished()
          return [...received.keys()]
        },
        onClosed: () => {}
      }
      let destroy: () => void = () => {}
      const sink: ChunkSink = {
        send: () => {},
        isDestroyed: () => false,
        onDestroyed: (callback) => {
          destroy = callback
        },
        senderId: 1
      }
      const handlers = createLibraryHandlers(
        kit.library,
        undefined,
        kit.services.connections,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        kit.agent,
        windows
      )
      const send = (raw: AgentSendInput) =>
        value(handlers[CHANNELS.agentTurnSend](raw, sink) as Result<AgentSendResult>)
      return { ...kit, received, done, send, destroyWindow: () => destroy(), handlers }
    }

    it('sends the same events to every open window', async () => {
      const { model, modelSelection, received, done, send, handlers } = windowed()
      model.script(callTools({ name: 'list_works', args: {} }), say('Có 2 tác phẩm.'))
      const sent = send({
        clientCommandId: randomUUID(),
        instruction: 'mấy truyện?',
        modelSelection
      })
      await done
      expect(received.get(1)).toEqual(received.get(2))
      expect(received.get(2)?.some((event) => event.kind === 'activity-finish')).toBe(true)
      const detail = value(
        handlers[CHANNELS.agentSessionsGet]({
          sessionId: sent.sessionId
        }) as Result<AgentSessionDetailView>
      )
      expect(detail.turns[0]).toMatchObject({ status: 'completed', answer: 'Có 2 tác phẩm.' })
      expect(detail.activities).toHaveLength(1)
    })

    it('keeps running after the window that sent the turn closes', async () => {
      const { agent, model, modelSelection, done, send, destroyWindow } = windowed()
      model.script(() => {
        destroyWindow()
        return say('Vẫn trả lời.')
      })
      const sent = send({ clientCommandId: randomUUID(), instruction: 'chào', modelSelection })
      await done
      expect(agent.getTurn(sent.turnId)).toMatchObject({
        status: 'completed',
        answer: 'Vẫn trả lời.'
      })
    })
  })

  describe('durable tasks', () => {
    function taskHandlers() {
      const kit = setupAgent()
      const handlers = createLibraryHandlers(
        kit.library,
        undefined,
        kit.services.connections,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        kit.services.agent,
        undefined,
        kit.services.tasks
      )
      const call = <T>(channel: Channel, raw?: unknown) => handlers[channel](raw) as Result<T>
      return { ...kit, call }
    }

    it('validates create input and creates, lists and reads a task', async () => {
      const { call, work1, ch1_1, ch1_2, services } = taskHandlers()
      const both = call(CHANNELS.agentTaskCreate, {
        clientCommandId: randomUUID(),
        contextStrategy: 'approved_only',
        workId: work1.id,
        chapterIds: [ch1_1.id],
        range: { from: 1, to: 2 }
      })
      expect(both.ok ? null : both.error.code).toBe('validation')
      // A context choice outside the list is refused and creates nothing.
      const badChoice = call(CHANNELS.agentTaskCreate, {
        clientCommandId: randomUUID(),
        contextStrategy: 'guess',
        workId: work1.id,
        range: { from: 1, to: 2 }
      })
      expect(badChoice.ok ? null : badChoice.error.code).toBe('validation')
      expect(services.tasks.list()).toEqual([])

      const created = value(
        call<AgentTaskView>(CHANNELS.agentTaskCreate, {
          clientCommandId: randomUUID(),
          contextStrategy: 'approved_only',
          workId: work1.id,
          range: { from: 1, to: 2 }
        } satisfies AgentTaskCreateInput)
      )
      const detail = value(call<AgentTaskDetailView>(CHANNELS.agentTaskGet, { taskId: created.id }))
      expect(detail.items.map((item) => item.chapterId)).toEqual([ch1_1.id, ch1_2.id])
      const listed = value(
        call<{ tasks: AgentTaskSummary[] }>(CHANNELS.agentTaskList, { workId: work1.id })
      )
      expect(listed.tasks.map((task) => task.id)).toEqual([created.id])
      await services.tasks.idle()
    })

    it('reads quality warnings and refuses a dismissal with an unknown rule', async () => {
      const { call, work1, ch1_1, services } = taskHandlers()
      const created = value(
        call<AgentTaskView>(CHANNELS.agentTaskCreate, {
          clientCommandId: randomUUID(),
          contextStrategy: 'approved_only',
          workId: work1.id,
          chapterIds: [ch1_1.id]
        })
      )
      await services.tasks.idle()
      const quality = value(
        call<TaskQualityView>(CHANNELS.agentTaskQuality, { taskId: created.id })
      )
      expect(quality.taskId).toBe(created.id)
      expect(quality.items).toHaveLength(1)
      const refused = call(CHANNELS.agentTaskDismiss, {
        taskId: created.id,
        itemId: randomUUID(),
        segmentId: 's',
        ruleCode: 'text.made_up',
        ruleVersion: 1
      })
      expect(refused.ok ? null : refused.error.code).toBe('validation')
    })

    it('rejects a control with a stale state version', async () => {
      const { call, work1, ch1_1, services } = taskHandlers()
      const created = value(
        call<AgentTaskView>(CHANNELS.agentTaskCreate, {
          clientCommandId: randomUUID(),
          contextStrategy: 'approved_only',
          workId: work1.id,
          chapterIds: [ch1_1.id]
        })
      )
      await services.tasks.idle()
      const stale = call(CHANNELS.agentTaskControl, {
        taskId: created.id,
        command: 'run_again',
        stateVersion: created.stateVersion,
        clientCommandId: randomUUID()
      } satisfies AgentTaskControlInput)
      expect(stale.ok ? null : stale.error.code).toBe('conflict')
      const skipWithoutItem = call(CHANNELS.agentTaskControl, {
        taskId: created.id,
        command: 'skip_item',
        stateVersion: 0,
        clientCommandId: randomUUID()
      })
      expect(skipWithoutItem.ok ? null : skipWithoutItem.error.code).toBe('validation')
    })
  })

  it('rejects a write ack that has no pending intent', () => {
    const { call } = setup()
    const ack = call<void>(CHANNELS.agentTargetWriteAck, {
      intentId: randomUUID(),
      status: 'ack',
      revision: 1
    } satisfies AgentWriteIntentAck)
    expect(ack.ok).toBe(false)
    if (ack.ok) return
    expect(ack.error.code).toBe('not_found')
  })
})
