import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { librarySchema } from './librarySchema'
import { migrate, readPragmas } from './migrate'
import { openDatabase } from './sqlite'

const tempDir = createTempDirs()
const upTo8 = {
  ...librarySchema,
  migrations: librarySchema.migrations.filter((m) => m.version <= 8)
}

function throws(fn: () => unknown): boolean {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

describe('library agent schema', () => {
  it('migrates v8 data and creates constrained app-agent tables', () => {
    const db = openDatabase(join(tempDir(), 'library.db'))
    migrate(db, upTo8)
    db.exec(`
      INSERT INTO work_index
        (id, file_name, title, source_lang, status, archived, chapter_count, created_at, updated_at)
      VALUES ('work', 'work.mira', 'A', 'ja', 'not-started', 0, 0, 1, 2);
      INSERT INTO ai_connection
        (id, name, base_url, enabled, ord, created_at, updated_at)
      VALUES ('connection', 'AI', 'https://example.test/v1', 1, 0, 1, 2);
    `)

    migrate(db, librarySchema)

    expect(readPragmas(db).userVersion).toBe(17)
    expect(db.prepare("SELECT title FROM work_index WHERE id = 'work'").get()).toEqual({
      title: 'A'
    })
    expect(db.prepare("SELECT name FROM ai_connection WHERE id = 'connection'").get()).toEqual({
      name: 'AI'
    })
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_%' ORDER BY name"
      )
      .all<{ name: string }>()
      .map((row) => row.name)
    expect(tables).toEqual([
      'agent_activity',
      'agent_legacy_import',
      'agent_legacy_turn_import',
      'agent_operation',
      'agent_session',
      'agent_session_approval',
      'agent_task',
      'agent_task_attempt',
      'agent_task_item',
      'agent_task_steering',
      'agent_tool_call',
      'agent_turn',
      'agent_turn_part'
    ])
    db.close()
  })

  it('enforces command, activity sequence, mapping and one-active-turn uniqueness', () => {
    const db = openDatabase(join(tempDir(), 'constraints.db'))
    migrate(db, librarySchema)
    db.exec(`
      INSERT INTO agent_session (id, title, created_at, updated_at) VALUES ('s', '', 1, 1);
      INSERT INTO agent_turn
        (id, session_id, instruction, context_json, status, created_at, updated_at)
      VALUES ('t1', 's', 'one', '{}', 'running', 1, 1);
    `)
    expect(
      throws(() =>
        db.exec(`INSERT INTO agent_turn
          (id, session_id, instruction, context_json, status, created_at, updated_at)
          VALUES ('t2', 's', 'two', '{}', 'queued', 2, 2)`)
      )
    ).toBe(true)
    db.exec("UPDATE agent_turn SET status = 'completed' WHERE id = 't1'")
    db.exec(`INSERT INTO agent_turn
      (id, session_id, instruction, context_json, status, created_at, updated_at)
      VALUES ('t2', 's', 'two', '{}', 'queued', 2, 2)`)
    db.exec(`INSERT INTO agent_operation
      (id, turn_id, command_id, capability, target_json, state, created_at, updated_at)
      VALUES ('o1', 't2', 'command', 'read_chapter', '{}', 'queued', 2, 2)`)
    expect(
      throws(() =>
        db.exec(`INSERT INTO agent_operation
          (id, turn_id, command_id, capability, target_json, state, created_at, updated_at)
          VALUES ('o2', 't2', 'command', 'read_chapter', '{}', 'queued', 2, 2)`)
      )
    ).toBe(true)
    db.exec(`INSERT INTO agent_activity
      (id, turn_id, operation_id, step_seq, kind, state, label, created_at, updated_at)
      VALUES ('a1', 't2', 'o1', 1, 'read', 'running', 'Read', 2, 2)`)
    expect(
      throws(() =>
        db.exec(`INSERT INTO agent_activity
          (id, turn_id, step_seq, kind, state, label, created_at, updated_at)
          VALUES ('a2', 't2', 1, 'read', 'running', 'Again', 2, 2)`)
      )
    ).toBe(true)
    db.close()
  })

  it('counts waiting_user as active, accepts expired and keeps tool calls unique per turn', () => {
    const db = openDatabase(join(tempDir(), 'v11.db'))
    migrate(db, librarySchema)
    const insertTurn = (id: string, status: string) =>
      db.exec(`INSERT INTO agent_turn
        (id, session_id, instruction, context_json, status, created_at, updated_at)
        VALUES ('${id}', 's', 'x', '{}', '${status}', 1, 1)`)
    db.exec("INSERT INTO agent_session (id, title, created_at, updated_at) VALUES ('s', '', 1, 1)")
    insertTurn('t1', 'waiting_user')
    expect(throws(() => insertTurn('t2', 'queued'))).toBe(true)
    db.exec("UPDATE agent_turn SET status = 'expired' WHERE id = 't1'")
    insertTurn('t2', 'running')

    const insertCall = (id: string, callId: string, decision = 'allow') =>
      db.exec(`INSERT INTO agent_tool_call
        (id, turn_id, round, call_id, name, args_json, args_digest, decision, state, created_at)
        VALUES ('${id}', 't2', 1, '${callId}', 'list_works', '{}', 'd', '${decision}', 'pending', 1)`)
    insertCall('c1', 'call-1')
    expect(throws(() => insertCall('c2', 'call-1'))).toBe(true)
    expect(throws(() => insertCall('c3', 'call-3', 'maybe'))).toBe(true)
    db.close()
  })

  it('v12 keeps task states in the vocabulary, one running item and one operation owner', () => {
    const db = openDatabase(join(tempDir(), 'v12.db'))
    migrate(db, librarySchema)
    db.exec(`
      INSERT INTO agent_session (id, title, created_at, updated_at) VALUES ('s', '', 1, 1);
      INSERT INTO agent_turn (id, session_id, instruction, context_json, status, created_at, updated_at)
      VALUES ('t', 's', 'x', '{}', 'completed', 1, 1);
      INSERT INTO agent_task (id, kind, work_id, client_command_id, payload_digest, state,
        model_ref_json, overwrite_policy, created_at, updated_at)
      VALUES ('k', 'translate_chapters', 'w', 'cmd', 'd', 'running', '{}', 'fill_untranslated', 1, 1);
    `)
    const task = (state: string, reason: string | null) =>
      db.exec(`INSERT INTO agent_task (id, kind, work_id, client_command_id, payload_digest, state,
        reason, model_ref_json, overwrite_policy, created_at, updated_at)
        VALUES ('${state}${reason}', 'translate_chapters', 'w', '${state}${reason}', 'd', '${state}',
        ${reason === null ? 'NULL' : `'${reason}'`}, '{}', 'fill_untranslated', 1, 1)`)
    expect(throws(() => task('needs_attention', null))).toBe(true)
    expect(throws(() => task('paused', 'whatever'))).toBe(true)
    expect(throws(() => task('running', 'budget'))).toBe(true)
    task('paused', 'budget')

    const item = (id: string, ordinal: number, state: string) =>
      db.exec(`INSERT INTO agent_task_item (id, task_id, ordinal, chapter_id, state, created_at, updated_at)
        VALUES ('${id}', 'k', ${ordinal}, 'c${ordinal}', '${state}', 1, 1)`)
    item('i1', 1, 'running')
    expect(throws(() => item('i2', 2, 'running'))).toBe(true)
    expect(throws(() => item('i3', 1, 'queued'))).toBe(true)
    item('i2', 2, 'queued')

    const operation = (id: string, turn: string, taskItem: string) =>
      db.exec(`INSERT INTO agent_operation (id, turn_id, task_item_id, command_id, capability,
        target_json, state, created_at, updated_at)
        VALUES ('${id}', ${turn}, ${taskItem}, '${id}', 'translate_chapter', '{}', 'running', 1, 1)`)
    operation('o1', 'NULL', "'i1'")
    operation('o2', "'t'", 'NULL')
    expect(throws(() => operation('o3', "'t'", "'i1'"))).toBe(true)
    expect(throws(() => operation('o4', 'NULL', 'NULL'))).toBe(true)
    db.exec(
      "INSERT INTO agent_task_attempt (item_id, attempt, operation_id, created_at) VALUES ('i1', 1, 'o1', 1)"
    )
    expect(
      throws(() =>
        db.exec(
          "INSERT INTO agent_task_attempt (item_id, attempt, operation_id, created_at) VALUES ('i1', 2, 'o1', 1)"
        )
      )
    ).toBe(true)
    db.close()
  })
})
