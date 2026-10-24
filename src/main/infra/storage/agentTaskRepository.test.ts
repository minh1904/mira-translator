import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ITEM_STATES_WITH_REASON,
  TASK_ITEM_STATES,
  TASK_STATES,
  TASK_STATES_WITH_REASON,
  type AgentTaskItemState,
  type AgentTaskState
} from '../../../shared/contracts/agentTask'
import { createTempDirs } from '../../testing/testing'
import { AgentTaskRepository } from './agentTaskRepository'
import { StorageError } from './errors'
import { librarySchema } from './librarySchema'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'

const tempDir = createTempDirs()
let counter = 0
const newId = () => 'id-' + ++counter

function setup(): { db: Db; repo: AgentTaskRepository } {
  const db = openDatabase(join(tempDir(), 'library.db'))
  migrate(db, librarySchema)
  return { db, repo: new AgentTaskRepository(db) }
}

const model = { connectionId: 'c', entryId: 'e', settingsKey: 'k' }
const create = (repo: AgentTaskRepository, command: string, chapters = ['a', 'b']) =>
  repo.createTask({
    id: newId(),
    workId: 'w',
    clientCommandId: command,
    payloadDigest: 'digest-' + chapters.join(','),
    model,
    chapterIds: chapters,
    newId,
    now: 1
  })

/** Expected task moves, read straight off the spec's table (not off the code under test). */
const TASK_TABLE: Record<AgentTaskState, AgentTaskState[]> = {
  queued: ['running', 'paused', 'cancelled'],
  running: [
    'pausing',
    'cancelling',
    'paused',
    'waiting_user',
    'completed',
    'partially_completed',
    'failed'
  ],
  pausing: ['paused', 'cancelling'],
  paused: ['queued', 'cancelled'],
  waiting_user: ['queued', 'cancelled'],
  cancelling: ['cancelled'],
  failed: ['queued'],
  partially_completed: ['queued'],
  completed: [],
  cancelled: []
}
const ITEM_TABLE: Record<AgentTaskItemState, AgentTaskItemState[]> = {
  queued: ['running', 'skipped', 'cancelled'],
  running: ['completed', 'failed', 'waiting_user', 'queued', 'cancelled'],
  waiting_user: ['queued', 'skipped', 'cancelled'],
  failed: ['queued', 'skipped'],
  completed: [],
  skipped: [],
  cancelled: []
}

describe('AgentTaskRepository', () => {
  it('creates a task with fixed, ordered items and returns it again for the same command', () => {
    const { repo, db } = setup()
    const chapters = Array.from({ length: 30 }, (_, i) => 'ch-' + (i + 1))
    const first = create(repo, 'cmd-1', chapters)
    expect(first.created).toBe(true)
    const items = repo.listItems(first.task.id)
    expect(items.map((item) => item.chapterId)).toEqual(chapters)
    expect(items.map((item) => item.ordinal)).toEqual(chapters.map((_, i) => i + 1))
    expect(new Set(items.map((item) => item.state))).toEqual(new Set(['queued']))

    expect(create(repo, 'cmd-1', chapters)).toEqual({ task: first.task, created: false })
    expect(repo.listItems(first.task.id)).toHaveLength(30)
    expect(() => create(repo, 'cmd-1', ['other'])).toThrow(StorageError)
    db.close()
  })

  it('allows exactly the task moves of the spec table and keeps terminal states final', () => {
    const { repo, db } = setup()
    for (const from of TASK_STATES) {
      for (const to of TASK_STATES) {
        const { task } = create(repo, `${from}->${to}`)
        db.prepare('UPDATE agent_task SET state = ?, reason = ? WHERE id = ?').run(
          from,
          TASK_STATES_WITH_REASON.includes(from) ? 'user' : null,
          task.id
        )
        const reason = TASK_STATES_WITH_REASON.includes(to) ? 'user' : null
        const move = () => repo.transitionTask(task.id, to, { now: 2, reason })
        if (TASK_TABLE[from].includes(to)) expect(move().state).toBe(to)
        else expect(move).toThrow(/Không thể chuyển/)
      }
    }
    db.close()
  })

  it('allows exactly the item moves of the spec table; failed → completed only when refused', () => {
    const { repo, db } = setup()
    const { task } = create(repo, 'items', ['x'])
    const [item] = repo.listItems(task.id)
    for (const from of TASK_ITEM_STATES) {
      for (const to of TASK_ITEM_STATES) {
        if (from === to) continue
        db.prepare('UPDATE agent_task_item SET state = ?, reason = ? WHERE id = ?').run(
          from,
          ITEM_STATES_WITH_REASON.includes(from) ? 'provider' : null,
          item.id
        )
        const reason = ITEM_STATES_WITH_REASON.includes(to) ? 'provider' : null
        const move = () => repo.transitionItem(item.id, to, { now: 2, reason })
        if (ITEM_TABLE[from].includes(to)) expect(move().state).toBe(to)
        else expect(move).toThrow(/Không thể chuyển/)
      }
    }
    db.prepare("UPDATE agent_task_item SET state = 'failed', reason = 'refused' WHERE id = ?").run(
      item.id
    )
    expect(repo.transitionItem(item.id, 'completed', { now: 3 }).state).toBe('completed')
    db.close()
  })

  it('applies the first of two commands with the same version and rejects the second', () => {
    const { repo, db } = setup()
    const { task } = create(repo, 'race')
    const running = repo.transitionTask(task.id, 'running', { now: 2 })
    expect(
      repo.transitionTask(task.id, 'pausing', { now: 3, expectedVersion: running.stateVersion })
        .state
    ).toBe('pausing')
    expect(() =>
      repo.transitionTask(task.id, 'pausing', { now: 3, expectedVersion: running.stateVersion })
    ).toThrow(/đã đổi trạng thái/)
    expect(repo.getTask(task.id)?.stateVersion).toBe(running.stateVersion + 1)
    db.close()
  })

  it('requires a reason exactly for waiting_user, paused and failed', () => {
    const { repo, db } = setup()
    const { task } = create(repo, 'reason')
    expect(() => repo.transitionTask(task.id, 'paused', { now: 2 })).toThrow(StorageError)
    expect(() => repo.transitionTask(task.id, 'running', { now: 2, reason: 'user' })).toThrow(
      StorageError
    )
    expect(repo.transitionTask(task.id, 'paused', { now: 2, reason: 'user' }).reason).toBe('user')
    db.close()
  })

  it('lists startable items by task age then ordinal and numbers attempts', () => {
    const { repo, db } = setup()
    const older = create(repo, 'older', ['o1', 'o2']).task
    create(repo, 'newer', ['n1'])
    expect(repo.queuedItems().map((item) => item.chapterId)).toEqual(['o1', 'o2', 'n1'])
    repo.transitionTask(older.id, 'paused', { now: 2, reason: 'user' })
    expect(repo.queuedItems().map((item) => item.chapterId)).toEqual(['n1'])

    const [item] = repo.listItems(older.id)
    db.exec(`INSERT INTO agent_operation (id, task_item_id, command_id, capability, target_json, state,
      created_at, updated_at) VALUES ('op1', '${item.id}', 'c1', 'translate_chapter', '{}', 'running', 1, 1),
      ('op2', '${item.id}', 'c2', 'translate_chapter', '{}', 'running', 2, 2)`)
    expect(repo.addAttempt(item.id, 'op1', 1)).toBe(1)
    expect(repo.addAttempt(item.id, 'op2', 2)).toBe(2)
    expect(repo.attemptOperationIds(item.id)).toEqual(['op1', 'op2'])
    db.close()
  })
})
