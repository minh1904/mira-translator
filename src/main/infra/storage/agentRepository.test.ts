import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { librarySchema } from './librarySchema'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { AgentRepository } from './agentRepository'
import { StorageError } from './errors'

const tempDir = createTempDirs()
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

function repository(): { repo: AgentRepository; close(): void } {
  const db = openDatabase(join(tempDir(), 'library.db'))
  migrate(db, librarySchema)
  return { repo: new AgentRepository(db), close: () => db.close() }
}

describe('AgentRepository', () => {
  it('creates, reads and lists app sessions and turns', () => {
    const { repo, close } = repository()
    repo.createSession({ id: id(1), title: 'Phiên', now: 1 })
    repo.createTurn({
      id: id(2),
      sessionId: id(1),
      instruction: 'dịch chương này',
      context: { workId: id(3), chapterId: id(4) },
      now: 2
    })
    expect(repo.getSession(id(1))).toMatchObject({ id: id(1), title: 'Phiên' })
    expect(repo.listSessions()).toHaveLength(1)
    expect(repo.getTurn(id(2))).toMatchObject({
      sessionId: id(1),
      status: 'queued',
      context: { workId: id(3), chapterId: id(4) }
    })
    expect(repo.listTurns(id(1)).map((turn) => turn.id)).toEqual([id(2)])
    close()
  })

  it('keeps a session summary until a turn it covers is reverted or the session is gone', () => {
    const { repo, close } = repository()
    repo.createSession({ id: id(1), title: '', now: 1 })
    repo.createTurn({ id: id(2), sessionId: id(1), instruction: 'a', context: {}, now: 2 })
    repo.transitionTurn(id(2), 'running', 3)
    repo.transitionTurn(id(2), 'completed', 4)
    repo.createTurn({ id: id(3), sessionId: id(1), instruction: 'b', context: {}, now: 5 })
    const summary = { text: 'tóm tắt', coveredTurnIds: [id(2)], modelLabel: 'm' }
    repo.saveSessionSummary(id(1), summary, 6)
    expect(repo.getSessionSummary(id(1))).toEqual(summary)
    repo.saveSessionSummary(id(1), { ...summary, text: 'bản dồn' }, 7)
    expect(repo.getSessionSummary(id(1))?.text).toBe('bản dồn')
    repo.markTurnsReverted([id(2)], 8)
    expect(repo.getSessionSummary(id(1))).toBeNull()
    repo.saveSessionSummary(id(1), summary, 9)
    const raw = (repo as unknown as { db: Db }).db
    raw.prepare('DELETE FROM agent_session WHERE id = ?').run(id(1))
    expect(repo.getSessionSummary(id(1))).toBeNull()
    close()
  })

  describe('steer messages', () => {
    const running = () => {
      const { repo, close } = repository()
      repo.createSession({ id: id(1), now: 1 })
      repo.createTurn({
        id: id(2),
        sessionId: id(1),
        instruction: 'rà chương 1–5',
        context: {},
        now: 2
      })
      repo.transitionTurn(id(2), 'running', 3)
      return { repo, close }
    }

    it('queues once per command id, delivers as steer parts and never twice', () => {
      const { repo, close } = running()
      const first = repo.addSteer({
        turnId: id(2),
        text: 'chỉ chương 3',
        clientCommandId: 'c1',
        now: 4
      })
      expect(repo.addSteer({ turnId: id(2), text: 'khác', clientCommandId: 'c1', now: 5 }).id).toBe(
        first.id
      )
      repo.addSteer({ turnId: id(2), text: 'bỏ chương 4', clientCommandId: 'c2', now: 6 })
      expect(repo.listSessionSteers(id(1)).map((steer) => steer.text)).toEqual([
        'chỉ chương 3',
        'bỏ chương 4'
      ])
      const delivered = repo.deliverSteers(id(2), 2, 7)
      expect(delivered.map((steer) => [steer.state, steer.deliveredRound])).toEqual([
        ['delivered', 2],
        ['delivered', 2]
      ])
      expect(repo.listParts(id(2)).map((part) => [part.kind, part.round, part.text])).toEqual([
        ['steer', 2, 'chỉ chương 3'],
        ['steer', 2, 'bỏ chương 4']
      ])
      expect(repo.deliverSteers(id(2), 3, 8)).toEqual([])
      expect(repo.listSessionSteers(id(1))).toEqual([])
      expect(() => repo.withdrawSteer(first.id, 9)).toThrow(StorageError)
      close()
    })

    it('refuses a sixth waiting message and any message once the turn ended', () => {
      const { repo, close } = running()
      for (let i = 0; i < 5; i++) {
        repo.addSteer({ turnId: id(2), text: 'tin ' + i, clientCommandId: null, now: 4 })
      }
      expect(() =>
        repo.addSteer({ turnId: id(2), text: 'tin 5', clientCommandId: null, now: 5 })
      ).toThrow(/5 tin/)
      repo.transitionTurn(id(2), 'completed', 6)
      expect(() =>
        repo.addSteer({ turnId: id(2), text: 'muộn', clientCommandId: null, now: 7 })
      ).toThrow(/kết thúc/)
      close()
    })

    it('withdraws a waiting or returned message and hands the rest back or on', () => {
      const { repo, close } = running()
      const a = repo.addSteer({ turnId: id(2), text: 'a', clientCommandId: null, now: 4 })
      const b = repo.addSteer({ turnId: id(2), text: 'b', clientCommandId: null, now: 5 })
      expect(repo.withdrawSteer(a.id, 6).state).toBe('withdrawn')
      expect(repo.settleSteers(id(2), { state: 'returned' }, 7).map((s) => s.id)).toEqual([b.id])
      expect(repo.listSessionSteers(id(1)).map((s) => s.state)).toEqual(['returned'])
      expect(repo.withdrawSteer(b.id, 8).state).toBe('withdrawn')

      const c = repo.addSteer({ turnId: id(2), text: 'c', clientCommandId: null, now: 9 })
      repo.transitionTurn(id(2), 'completed', 10)
      repo.createTurn({ id: id(5), sessionId: id(1), instruction: 'c', context: {}, now: 10 })
      expect(repo.settleSteers(id(2), { state: 'forwarded', turnId: id(5) }, 10)).toMatchObject([
        { id: c.id, state: 'forwarded', forwardedTurnId: id(5) }
      ])
      close()
    })
  })

  it('rejects a second active turn and permits another after a terminal transition', () => {
    const { repo, close } = repository()
    repo.createSession({ id: id(1), title: '', now: 1 })
    repo.createTurn({ id: id(2), sessionId: id(1), instruction: 'one', context: {}, now: 2 })
    expect(() =>
      repo.createTurn({ id: id(3), sessionId: id(1), instruction: 'two', context: {}, now: 3 })
    ).toThrowError(StorageError)
    repo.transitionTurn(id(2), 'running', 4)
    repo.transitionTurn(id(2), 'completed', 5)
    expect(() =>
      repo.createTurn({ id: id(3), sessionId: id(1), instruction: 'two', context: {}, now: 6 })
    ).not.toThrow()
    close()
  })

  it('deduplicates operation creation by command id and rejects reverse transitions', () => {
    const { repo, close } = repository()
    repo.createSession({ id: id(1), title: '', now: 1 })
    repo.createTurn({ id: id(2), sessionId: id(1), instruction: 'run', context: {}, now: 2 })
    const first = repo.createOperation({
      id: id(3),
      turnId: id(2),
      commandId: 'command-1',
      capability: 'translate_chapter',
      target: {
        kind: 'chapter',
        workId: id(4),
        workLabel: 'A',
        chapterId: id(5),
        chapterLabel: 'C1'
      },
      now: 3
    })
    const retry = repo.createOperation({
      id: id(6),
      turnId: id(2),
      commandId: 'command-1',
      capability: 'translate_chapter',
      target: {
        kind: 'chapter',
        workId: id(4),
        workLabel: 'A',
        chapterId: id(5),
        chapterLabel: 'C1'
      },
      now: 4
    })
    expect(retry.id).toBe(first.id)
    repo.transitionOperation(first.id, 'running', { now: 5 })
    repo.transitionOperation(first.id, 'completed', { now: 6, result: { applied: 2 } })
    expect(() => repo.transitionOperation(first.id, 'running', { now: 7 })).toThrowError(
      StorageError
    )
    close()
  })

  it('updates one activity row while preserving activity id and step sequence', () => {
    const { repo, close } = repository()
    repo.createSession({ id: id(1), title: '', now: 1 })
    repo.createTurn({ id: id(2), sessionId: id(1), instruction: 'run', context: {}, now: 2 })
    repo.putActivity({
      id: id(3),
      turnId: id(2),
      operationId: null,
      stepSeq: 1,
      kind: 'read',
      state: 'pending',
      label: 'Đọc',
      detail: { done: 0 },
      now: 3
    })
    repo.putActivity({
      id: id(3),
      turnId: id(2),
      operationId: null,
      stepSeq: 1,
      kind: 'read',
      state: 'running',
      label: 'Đang đọc',
      detail: { done: 7 },
      now: 4
    })
    expect(repo.listActivities(id(2))).toEqual([
      expect.objectContaining({ id: id(3), stepSeq: 1, state: 'running', detail: { done: 7 } })
    ])
    expect(() =>
      repo.putActivity({
        id: id(9),
        turnId: id(2),
        operationId: null,
        stepSeq: 1,
        kind: 'read',
        state: 'completed',
        label: 'Wrong id',
        detail: null,
        now: 5
      })
    ).toThrowError(StorageError)
    close()
  })

  it('stores tool calls in order, expires a waiting turn on a new command and lists session state', () => {
    const { repo, close } = repository()
    repo.createSession({ id: id(1), title: '', now: 1 })
    const accept = (turnId: number, command: string) =>
      repo.acceptTurn({
        id: id(turnId),
        sessionId: id(1),
        clientCommandId: command,
        payloadDigest: command,
        instruction: 'x',
        context: {},
        now: turnId
      })
    accept(2, id(90))
    repo.transitionTurn(id(2), 'running', 3)
    const call = (n: number, callId: string, state: 'pending' | 'completed') => ({
      id: id(n),
      turnId: id(2),
      round: 1,
      callId,
      name: 'translate_chapter',
      args: { target: 't1' },
      argsDigest: 'd' + n,
      decision: 'needs_user' as const,
      state,
      createdAt: 4
    })
    repo.insertToolCalls([call(10, 'b', 'completed'), call(11, 'a', 'pending')])
    expect(() => repo.insertToolCalls([call(12, 'a', 'pending')])).toThrow()
    expect(repo.listToolCalls(id(2)).map((row) => row.callId)).toEqual(['b', 'a'])
    repo.transitionTurn(id(2), 'waiting_user', 5)
    expect(repo.listSessionPendingToolCalls(id(1)).map((row) => row.id)).toEqual([id(11)])

    accept(3, id(91))
    expect(repo.getTurn(id(2))?.status).toBe('expired')
    expect(repo.getToolCall(id(11))?.state).toBe('expired')
    expect(repo.getToolCall(id(10))?.state).toBe('completed')
    expect(repo.listSessionPendingToolCalls(id(1))).toEqual([])

    repo.createOperation({
      id: id(20),
      turnId: id(3),
      commandId: 'op',
      capability: 'translate_chapter',
      target: { kind: 'work', workId: id(30), workLabel: 'A' },
      now: 6
    })
    expect(repo.listSessionOperations(id(1)).map((op) => op.id)).toEqual([id(20)])
    expect(repo.operationSessionId(id(20))).toBe(id(1))
    expect(repo.operationSessionId(id(99))).toBeNull()
    close()
  })
})
