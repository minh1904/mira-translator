import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrate, readPragmas } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { createTempDirs } from '../../testing/testing'
import { WORK_APPLICATION_ID, workSchema } from './workSchema'

const tempDir = createTempDirs()

function fresh(): Db {
  const db = openDatabase(join(tempDir(), 'work.mira'))
  migrate(db, workSchema)
  db.exec(
    `INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'en', 1, 1);
     INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1)`
  )
  return db
}

const thrown = (fn: () => unknown): boolean => {
  try {
    fn()
  } catch {
    return true
  }
  return false
}

describe('work schema', () => {
  it('stamps the Mira application id and the latest schema version', () => {
    const db = openDatabase(join(tempDir(), 'work.mira'))
    migrate(db, workSchema)
    expect(readPragmas(db)).toEqual({ userVersion: 17, applicationId: WORK_APPLICATION_ID })
    db.close()
  })

  it('creates durable operation checkpoints and batch journals with safe initial evidence', () => {
    const db = fresh()
    db.prepare(`INSERT INTO agent_operation_checkpoint
      (operation_id, chapter_id, side, state, before_rev, before_content, applied_units,
       total_units, created_at, updated_at)
      VALUES (?, ?, ?, 'prepared', ?, ?, 0, ?, ?, ?)`).run(
      'operation-1',
      'c',
      'target',
      0,
      '',
      2,
      1,
      1
    )

    expect(
      db
        .prepare(`SELECT state, last_applied_rev, terminal_state
        FROM agent_operation_checkpoint WHERE operation_id = ?`)
        .get('operation-1')
    ).toEqual({ state: 'prepared', last_applied_rev: null, terminal_state: null })

    db.prepare(`INSERT INTO agent_operation_batch
      (operation_id, batch_key, expected_rev, after_rev, applied_units, checksum, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('operation-1', 'batch-1', 0, 1, 1, 'checksum', 2)
    expect(
      thrown(() =>
        db
          .prepare(`INSERT INTO agent_operation_batch
          (operation_id, batch_key, expected_rev, after_rev, applied_units, checksum, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run('operation-1', 'batch-1', 0, 1, 1, 'checksum', 2)
      )
    ).toBe(true)
    db.close()
  })

  it('allows exactly one work per file', () => {
    const db = fresh()
    expect(
      thrown(() =>
        db.exec(
          "INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('x', 'U', 'en', 1, 1)"
        )
      )
    ).toBe(true)
    db.close()
  })

  it('allows open BCP-47 source languages while enforcing statuses and a non-blank title', () => {
    const db = fresh()
    db.exec("UPDATE work SET source_lang = 'ko'")
    db.exec("UPDATE work SET source_lang = 'fr-CA'")
    expect(db.prepare('SELECT source_lang FROM work').get()).toEqual({ source_lang: 'fr-CA' })
    expect(thrown(() => db.exec("UPDATE work SET status = 'done'"))).toBe(true)
    expect(thrown(() => db.exec("UPDATE work SET title = '   '"))).toBe(true)
    expect(thrown(() => db.exec("UPDATE work SET source_lang = '   '"))).toBe(true)
    expect(thrown(() => db.exec("UPDATE work SET target_lang = 'en'"))).toBe(true)
    db.close()
  })

  it('enforces source ownership uniques, foreign keys and binding cascades', () => {
    const db = fresh()
    db.exec(`
      INSERT INTO source_binding (id, adapter_id, adapter_version, remote_work_id, language_tag, label,
        created_at, updated_at)
      VALUES ('b', 'builtin.folder', '1.0.0', 'folder:a', 'ko', 'Bản thư mục', 1, 1);
      INSERT INTO source_sync_run (id, binding_id, trigger, state, adapter_version, started_at)
      VALUES ('r', 'b', 'manual', 'completed', '1.0.0', 2);
      INSERT INTO source_catalog_item (id, binding_id, remote_chapter_id, chapter_id, ordinal_key, title,
        kind, access_state, first_seen_at, last_seen_at, metadata_hash)
      VALUES ('i', 'b', 'chapter-1', 'c', '0001', 'Chương 1', 'chapter', 'public', 2, 2, 'meta');
      INSERT INTO source_content_revision (id, catalog_item_id, content_hash, payload_hash, normalized_text,
        normalization_version, fetched_at, adapter_version, access_state, is_complete)
      VALUES ('rev', 'i', 'content', 'payload', 'Raw', 1, 3, '1.0.0', 'public', 1);
      INSERT INTO source_update_event (id, binding_id, catalog_item_id, kind, dedupe_key, payload_json,
        detected_at)
      VALUES ('e', 'b', 'i', 'added', 'b:i:added', '{}', 3);
    `)
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_binding
          (id, adapter_id, adapter_version, remote_work_id, language_tag, label, created_at, updated_at)
          VALUES ('b2', 'builtin.folder', '1.1.0', 'folder:a', 'ja', 'Trùng', 1, 1)`)
      )
    ).toBe(true)
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_catalog_item
          (id, binding_id, remote_chapter_id, ordinal_key, title, kind, access_state, first_seen_at,
           last_seen_at, metadata_hash)
          VALUES ('i2', 'b', 'chapter-1', '0002', 'Trùng', 'chapter', 'public', 2, 2, 'meta2')`)
      )
    ).toBe(true)
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_content_revision
          (id, catalog_item_id, content_hash, payload_hash, normalized_text, normalization_version,
           fetched_at, adapter_version, access_state, is_complete)
          VALUES ('rev2', 'i', 'content', 'payload2', 'Raw 2', 1, 4, '1.0.0', 'public', 1)`)
      )
    ).toBe(true)
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_update_event
          (id, binding_id, kind, dedupe_key, payload_json, detected_at)
          VALUES ('e2', 'b', 'renamed', 'b:i:added', '{}', 4)`)
      )
    ).toBe(true)

    db.exec("DELETE FROM chapter WHERE id = 'c'")
    expect(db.prepare("SELECT chapter_id FROM source_catalog_item WHERE id = 'i'").get()).toEqual({
      chapter_id: null
    })
    expect(
      db.prepare("SELECT normalized_text FROM source_content_revision WHERE id = 'rev'").get()
    ).toEqual({
      normalized_text: 'Raw'
    })

    db.exec("DELETE FROM source_binding WHERE id = 'b'")
    for (const table of [
      'source_sync_run',
      'source_catalog_item',
      'source_content_revision',
      'source_update_event'
    ]) {
      expect(db.prepare('SELECT count(*) AS n FROM ' + table).get()).toEqual({ n: 0 })
    }
    db.close()
  })

  it('permits at most one primary source binding', () => {
    const db = fresh()
    db.exec(`INSERT INTO source_binding
      (id, adapter_id, adapter_version, remote_work_id, language_tag, label, is_primary, created_at, updated_at)
      VALUES ('b1', 'a', '1', 'w1', 'ja', 'Một', 1, 1, 1)`)
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_binding
          (id, adapter_id, adapter_version, remote_work_id, language_tag, label, is_primary, created_at, updated_at)
          VALUES ('b2', 'a', '1', 'w2', 'ja', 'Hai', 1, 1, 1)`)
      )
    ).toBe(true)
    db.close()
  })

  it('cascades a chapter delete to its texts, segments and links', () => {
    const db = fresh()
    db.exec(
      `INSERT INTO chapter_text (chapter_id, side, updated_at) VALUES ('c', 'source', 1);
       INSERT INTO segment (id, chapter_id, side, position, start_offset, end_offset, text_rev)
         VALUES ('s1', 'c', 'source', 0, 0, 5, 0);
       INSERT INTO link (id, chapter_id, kind, created_at) VALUES ('l1', 'c', 'ai', 1);
       INSERT INTO link_member (link_id, segment_id) VALUES ('l1', 's1')`
    )
    db.exec("DELETE FROM chapter WHERE id = 'c'")
    for (const table of ['chapter_text', 'segment', 'link', 'link_member']) {
      expect(db.prepare('SELECT count(*) AS n FROM ' + table).get<{ n: number }>()!.n).toBe(0)
    }
    db.close()
  })

  it('flags a link as needs_review instead of dropping it when a member segment is deleted', () => {
    const db = fresh()
    db.exec(
      `INSERT INTO segment (id, chapter_id, side, position, start_offset, end_offset, text_rev)
         VALUES ('s1', 'c', 'source', 0, 0, 5, 0), ('t1', 'c', 'target', 0, 0, 4, 0);
       INSERT INTO link (id, chapter_id, kind, created_at) VALUES ('l1', 'c', 'ai', 1);
       INSERT INTO link_member (link_id, segment_id) VALUES ('l1', 's1'), ('l1', 't1');
       DELETE FROM segment WHERE id = 's1'`
    )
    const link = db.prepare("SELECT status FROM link WHERE id = 'l1'").get<{ status: string }>()
    expect(link?.status).toBe('needs_review')
    const members = db.prepare('SELECT segment_id FROM link_member').all<{ segment_id: string }>()
    expect(members.map((m) => m.segment_id)).toEqual(['t1'])
    db.close()
  })

  it('rejects an inverted segment range and a link to a missing segment', () => {
    const db = fresh()
    expect(
      thrown(() =>
        db.exec(
          `INSERT INTO segment (id, chapter_id, side, position, start_offset, end_offset, text_rev)
           VALUES ('bad', 'c', 'source', 0, 5, 2, 0)`
        )
      )
    ).toBe(true)
    db.exec("INSERT INTO link (id, chapter_id, kind, created_at) VALUES ('l1', 'c', 'ai', 1)")
    expect(
      thrown(() => db.exec("INSERT INTO link_member (link_id, segment_id) VALUES ('l1', 'nope')"))
    ).toBe(true)
    db.close()
  })

  it('rejects an image with an unaccepted mime or empty bytes', () => {
    const db = fresh()
    expect(
      thrown(() =>
        db.exec(
          "INSERT INTO image (id, mime, data, created_at) VALUES ('i1', 'image/svg+xml', x'00', 1)"
        )
      )
    ).toBe(true)
    expect(
      thrown(() =>
        db.exec("INSERT INTO image (id, mime, data, created_at) VALUES ('i1', 'image/png', x'', 1)")
      )
    ).toBe(true)
    db.exec(
      "INSERT INTO image (id, mime, data, created_at) VALUES ('i1', 'image/png', x'89504e47', 1)"
    )
    expect(db.prepare('SELECT count(*) AS n FROM image').get<{ n: number }>()!.n).toBe(1)
    db.close()
  })

  it('keeps the work when its last chapter pointer is cleared by deleting that chapter', () => {
    const db = fresh()
    db.exec("UPDATE work SET last_chapter_id = 'c'")
    db.exec("DELETE FROM chapter WHERE id = 'c'")
    expect(
      db.prepare('SELECT last_chapter_id AS id FROM work').get<{ id: string | null }>()!.id
    ).toBeNull()
    db.close()
  })

  it('migrates an existing v5 database to v6 preserving data and creating context tables', () => {
    const path = join(tempDir(), 'v5_to_v6.mira')
    const db = openDatabase(path)
    // Run up to version 5
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.slice(0, 5)
    })
    expect(readPragmas(db).userVersion).toBe(5)
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w1', 'Tiêu đề', 'zh-Hans', 1, 1);
      INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c1', 0, 'Chương 1', 1, 1);
    `)

    // Upgrade through the current schema.
    migrate(db, workSchema)
    expect(readPragmas(db).userVersion).toBe(17)

    // Data preserved
    const row = db.prepare('SELECT title FROM work WHERE id = ?').get<{ title: string }>('w1')
    expect(row?.title).toBe('Tiêu đề')

    // Context tables functional
    db.exec(`
      INSERT INTO context_entry (id, kind, source, target, status, origin, forbidden, from_chapter_id, to_chapter_id, notes, created_at, updated_at)
      VALUES ('e1', 'term', '筑基', 'Trúc Cơ', 'approved', 'user', 0, 'c1', 'c1', 'Cảnh giới', 1, 1);
      INSERT INTO context_alias (id, entry_id, form, created_at)
      VALUES ('a1', 'e1', 'Trúc Cơ Kỳ', 1);
    `)
    const entry = db
      .prepare('SELECT * FROM context_entry WHERE id = ?')
      .get<{ source: string }>('e1')
    expect(entry?.source).toBe('筑基')

    const alias = db.prepare('SELECT * FROM context_alias WHERE id = ?').get<{ form: string }>('a1')
    expect(alias?.form).toBe('Trúc Cơ Kỳ')
    db.close()
  })

  it('upgrades v6 to v7 without changing text, alignment or provenance', () => {
    const db = openDatabase(join(tempDir(), 'v6_to_v7.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.slice(0, 6)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at)
        VALUES ('w', 'Tác phẩm', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1);
      INSERT INTO chapter_text (chapter_id, side, content, rev, updated_at, size)
        VALUES ('c', 'target', 'Bản dịch cũ', 4, 1, 11);
      INSERT INTO segment (id, chapter_id, side, position, start_offset, end_offset, text_rev)
        VALUES ('s', 'c', 'target', 0, 0, 11, 4);
      INSERT INTO link (id, chapter_id, kind, created_at) VALUES ('l', 'c', 'user', 1);
      INSERT INTO link_member (link_id, segment_id) VALUES ('l', 's');
      INSERT INTO provenance (segment_id, origin, at) VALUES ('s', 'human', 1);
    `)
    migrate(db, workSchema)
    expect(readPragmas(db).userVersion).toBe(17)
    expect(
      db
        .prepare("SELECT content, rev FROM chapter_text WHERE chapter_id = 'c' AND side = 'target'")
        .get()
    ).toEqual({ content: 'Bản dịch cũ', rev: 4 })
    expect(db.prepare("SELECT id, status FROM segment WHERE id = 's'").get()).toEqual({
      id: 's',
      status: 'ok'
    })
    expect(
      db.prepare("SELECT link_id, segment_id FROM link_member WHERE link_id = 'l'").get()
    ).toEqual({ link_id: 'l', segment_id: 's' })
    expect(db.prepare("SELECT origin FROM provenance WHERE segment_id = 's'").get()).toEqual({
      origin: 'human'
    })

    db.exec(`
      INSERT INTO ai_session (id, title, created_at, updated_at) VALUES ('session', 'Dịch', 2, 2);
      INSERT INTO ai_turn (id, session_id, chapter_id, action, question, status, created_at, updated_at)
        VALUES ('turn', 'session', 'c', 'apply', 'Dịch', 'done', 2, 2);
      INSERT INTO proposal (id, chapter_id, session_id, turn_id, origin, policy, source_rev, source_hash,
        target_base_rev, target_base_content, created_at, updated_at)
        VALUES ('p', 'c', 'session', 'turn', 'chat', 'auto', 0, 'hash', 4, 'Bản dịch cũ', 2, 2);
      INSERT INTO proposal_part (id, proposal_id, ordinal, base_from, base_to, before_text, after_text)
        VALUES ('part', 'p', 0, 0, 11, 'Bản dịch cũ', 'Bản dịch mới');
      INSERT INTO text_snapshot (id, command_id, chapter_id, before_rev, after_rev, before_content, decisions_json, actor, created_at)
        VALUES ('snapshot', 'command', 'c', 4, 5, 'Bản dịch cũ', '[]', 'auto', 3);
    `)
    expect(
      thrown(() =>
        db.exec(
          "INSERT INTO proposal_part (id, proposal_id, ordinal, after_text, status) VALUES ('bad', 'p', 1, 'x', 'unknown')"
        )
      )
    ).toBe(true)
    db.exec("DELETE FROM chapter WHERE id = 'c'")
    expect(db.prepare('SELECT count(*) AS n FROM proposal').get<{ n: number }>()!.n).toBe(0)
    expect(db.prepare('SELECT count(*) AS n FROM text_snapshot').get<{ n: number }>()!.n).toBe(0)
    expect(db.prepare("SELECT chapter_id FROM ai_turn WHERE id = 'turn'").get()).toEqual({
      chapter_id: null
    })
    db.close()
  })

  it('upgrades v7 to v8: chat actions get English codes and proposals keep their turn', () => {
    const db = openDatabase(join(tempDir(), 'v7_to_v8.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.slice(0, 7)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1);
      INSERT INTO ai_session (id, title, created_at, updated_at) VALUES ('s', 'Dịch', 1, 1);
      INSERT INTO ai_turn (id, session_id, chapter_id, action, question, answer, status, created_at, updated_at)
        VALUES ('t-ask', 's', 'c', 'hoi', 'Hỏi', 'Đáp', 'done', 1, 1),
               ('t-edit', 's', 'c', 'sua', 'Sửa', 'Bản sửa', 'done', 2, 2),
               ('t-apply', 's', 'c', 'ap_dung', 'Áp', 'Bản áp', 'done', 3, 3);
      INSERT INTO proposal (id, chapter_id, session_id, turn_id, origin, policy, source_rev, source_hash,
        target_base_rev, target_base_content, created_at, updated_at)
        VALUES ('p-edit', 'c', 's', 't-edit', 'chat', 'review', 0, 'h', 0, '', 2, 2),
               ('p-free', 'c', 's', NULL, 'translate', 'review', 0, 'h', 0, '', 3, 3);
    `)

    migrate(db, workSchema)

    expect(readPragmas(db).userVersion).toBe(17)
    expect(db.prepare('SELECT id, action, answer FROM ai_turn ORDER BY created_at').all()).toEqual([
      { id: 't-ask', action: 'ask', answer: 'Đáp' },
      { id: 't-edit', action: 'edit', answer: 'Bản sửa' },
      { id: 't-apply', action: 'apply', answer: 'Bản áp' }
    ])
    // The rebuild must not unlink proposals from their turn.
    expect(db.prepare('SELECT id, turn_id FROM proposal ORDER BY id').all()).toEqual([
      { id: 'p-edit', turn_id: 't-edit' },
      { id: 'p-free', turn_id: null }
    ])
    expect(
      thrown(() =>
        db.exec(
          "INSERT INTO ai_turn (id, session_id, action, question, status, created_at, updated_at) VALUES ('x', 's', 'hoi', 'q', 'done', 4, 4)"
        )
      )
    ).toBe(true)
    // The foreign keys and indexes of the new table still work.
    db.exec("DELETE FROM chapter WHERE id = 'c'")
    expect(db.prepare("SELECT chapter_id FROM ai_turn WHERE id = 't-edit'").get()).toEqual({
      chapter_id: null
    })
    db.exec("DELETE FROM ai_session WHERE id = 's'")
    expect(db.prepare('SELECT count(*) AS n FROM ai_turn').get<{ n: number }>()!.n).toBe(0)
    db.close()
  })

  it('cascades context_entry deletion to aliases and sets chapter references to null', () => {
    const db = fresh()
    db.exec(`
      INSERT INTO context_entry (id, kind, source, target, status, origin, forbidden, from_chapter_id, to_chapter_id, created_at, updated_at)
      VALUES ('e1', 'term', '韩立', 'Hàn Lập', 'approved', 'user', 0, 'c', 'c', 1, 1);
      INSERT INTO context_alias (id, entry_id, form, created_at)
      VALUES ('a1', 'e1', 'Lập Ca', 1);
    `)

    // Deleting chapter nullifies from_chapter_id and to_chapter_id
    db.exec("DELETE FROM chapter WHERE id = 'c'")
    const entryAfterChapDel = db
      .prepare('SELECT from_chapter_id, to_chapter_id FROM context_entry WHERE id = ?')
      .get<{
        from_chapter_id: string | null
        to_chapter_id: string | null
      }>('e1')
    expect(entryAfterChapDel?.from_chapter_id).toBeNull()
    expect(entryAfterChapDel?.to_chapter_id).toBeNull()

    // Deleting context_entry cascades to context_alias
    db.exec("DELETE FROM context_entry WHERE id = 'e1'")
    const countAlias = db
      .prepare('SELECT count(*) as count FROM context_alias WHERE entry_id = ?')
      .get<{ count: number }>('e1')
    expect(countAlias?.count).toBe(0)

    db.close()
  })

  it('enforces context_alias unique form constraint', () => {
    const db = fresh()
    db.exec(`
      INSERT INTO context_entry (id, kind, source, target, created_at, updated_at)
      VALUES ('e1', 'term', 's1', 't1', 1, 1), ('e2', 'term', 's2', 't2', 1, 1);
      INSERT INTO context_alias (id, entry_id, form, created_at)
      VALUES ('a1', 'e1', 'alias1', 1);
    `)
    expect(
      thrown(() =>
        db.exec(
          "INSERT INTO context_alias (id, entry_id, form, created_at) VALUES ('a2', 'e2', 'alias1', 1)"
        )
      )
    ).toBe(true)
    db.close()
  })

  it('upgrades v9 to v10: chat turns without a mode keep old turns and their proposals', () => {
    const db = openDatabase(join(tempDir(), 'v9_to_v10.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.slice(0, 9)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1);
      INSERT INTO ai_session (id, title, created_at, updated_at) VALUES ('s', 'Sửa', 1, 1);
      INSERT INTO ai_turn (id, session_id, chapter_id, action, question, answer, status, context_json,
        target_range_json, created_at, updated_at)
        VALUES ('t-edit', 's', 'c', 'edit', 'Sửa', 'Bản sửa', 'done', '[]',
          '{"from":0,"to":3,"text":"abc","targetIds":[]}', 2, 2);
      INSERT INTO proposal (id, chapter_id, session_id, turn_id, origin, policy, source_rev, source_hash,
        target_base_rev, target_base_content, created_at, updated_at)
        VALUES ('p-edit', 'c', 's', 't-edit', 'chat', 'review', 0, 'h', 0, 'abc', 2, 2);
      INSERT INTO proposal_part (id, proposal_id, ordinal, base_from, base_to, before_text, after_text)
        VALUES ('part', 'p-edit', 0, 0, 3, 'abc', 'xyz');
    `)

    migrate(db, workSchema)

    expect(readPragmas(db).userVersion).toBe(17)
    expect(
      db.prepare('SELECT id, action, answer, target_range_json, location_json FROM ai_turn').all()
    ).toEqual([
      {
        id: 't-edit',
        action: 'edit',
        answer: 'Bản sửa',
        target_range_json: '{"from":0,"to":3,"text":"abc","targetIds":[]}',
        location_json: null
      }
    ])
    // The rebuild must not unlink the old proposal from its turn.
    expect(db.prepare('SELECT id, turn_id FROM proposal').all()).toEqual([
      { id: 'p-edit', turn_id: 't-edit' }
    ])
    db.exec(`
      INSERT INTO ai_turn (id, session_id, chapter_id, action, question, status, location_json,
        created_at, updated_at)
        VALUES ('t-chat', 's', 'c', 'chat', 'Hỏi', 'done', '{"caret":{"source":null,"target":2},"selection":null}', 3, 3)
    `)
    expect(db.prepare("SELECT action FROM ai_turn WHERE id = 't-chat'").get()).toEqual({
      action: 'chat'
    })
    expect(
      thrown(() =>
        db.exec(
          "INSERT INTO ai_turn (id, session_id, action, question, status, created_at, updated_at) VALUES ('x', 's', 'agent', 'q', 'done', 4, 4)"
        )
      )
    ).toBe(true)
    db.exec("DELETE FROM ai_session WHERE id = 's'")
    expect(db.prepare('SELECT count(*) AS n FROM ai_turn').get<{ n: number }>()!.n).toBe(0)
    db.close()
  })

  it('upgrades v8 to v9: adds the run context table, which goes with its chapter', () => {
    const db = openDatabase(join(tempDir(), 'v8_to_v9.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.slice(0, 8)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1);
    `)

    migrate(db, workSchema)

    expect(readPragmas(db).userVersion).toBe(17)
    db.exec(`
      INSERT INTO translate_run_context (run_key, chapter_id, snapshot_json, snapshot_hash, created_at)
      VALUES ('translate:r', 'c', '{}', 'h', 1);
      DELETE FROM chapter WHERE id = 'c';
    `)
    expect(db.prepare('SELECT count(*) AS n FROM translate_run_context').get()).toEqual({ n: 0 })
    db.close()
  })

  it('upgrades v14 to v15: a dismissal goes with its chapter and is unique per rule, paragraph and text', () => {
    const db = openDatabase(join(tempDir(), 'v14_to_v15.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.filter((m) => m.version <= 14)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1);
    `)
    migrate(db, workSchema)
    expect(readPragmas(db).userVersion).toBe(17)
    const insert = () =>
      db.exec(`INSERT INTO qa_dismissal (rule_code, rule_version, chapter_id, segment_id, target_hash, created_at)
        VALUES ('text.length_ratio', 1, 'c', 's1', 'h', 1)`)
    insert()
    expect(thrown(insert)).toBe(true)
    db.exec("DELETE FROM chapter WHERE id = 'c'")
    expect(db.prepare('SELECT count(*) AS n FROM qa_dismissal').get()).toEqual({ n: 0 })
    db.close()
  })

  it('upgrades v15 to v16: a downloaded source without segments gets them at its revision', () => {
    const db = openDatabase(join(tempDir(), 'v15_to_v16.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.filter((m) => m.version <= 15)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1), ('e', 1, 1, 1);
      INSERT INTO chapter_text (chapter_id, side, content, rev, updated_at)
      VALUES ('c', 'source', '五歳になった。魔力を感じた。', 3, 1), ('e', 'source', '  ', 1, 1);
    `)
    migrate(db, workSchema)
    const rows = db
      .prepare(
        'SELECT chapter_id, start_offset, end_offset, text_rev FROM segment ORDER BY position'
      )
      .all()
    expect(rows).toEqual([
      { chapter_id: 'c', start_offset: 0, end_offset: 7, text_rev: 3 },
      { chapter_id: 'c', start_offset: 7, end_offset: 14, text_rev: 3 }
    ])
    expect(db.prepare("SELECT rev FROM chapter_text WHERE chapter_id = 'c'").get()).toEqual({
      rev: 3
    })
    db.close()
  })

  it('upgrades v16 to v17: entries waiting for review apply, rejected ones stay rejected', () => {
    const db = openDatabase(join(tempDir(), 'v16_to_v17.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.filter((m) => m.version <= 16)
    })
    db.exec(`
      INSERT INTO context_entry (id, kind, source, target, status, created_at, updated_at) VALUES
        ('p', 'term', '韩立', 'Hàn Lập', 'pending', 1, 1),
        ('r', 'term', '东西', '', 'rejected', 1, 1);
    `)
    migrate(db, workSchema)
    expect(db.prepare('SELECT id, status FROM context_entry ORDER BY id').all()).toEqual([
      { id: 'p', status: 'approved' },
      { id: 'r', status: 'rejected' }
    ])
    db.close()
  })

  it('upgrades v13 to v14: old entries read with no flags, evidence and scans go with their rows', () => {
    const db = openDatabase(join(tempDir(), 'v13_to_v14.mira'))
    migrate(db, {
      applicationId: WORK_APPLICATION_ID,
      migrations: workSchema.migrations.filter((m) => m.version <= 13)
    })
    db.exec(`
      INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'T', 'ja', 1, 1);
      INSERT INTO chapter (id, position, created_at, updated_at) VALUES ('c', 0, 1, 1);
      INSERT INTO context_entry (id, kind, source, target, created_at, updated_at)
        VALUES ('e', 'term', 'ミリィ', 'Milly', 1, 1);
      INSERT INTO context_alias (id, entry_id, form, created_at) VALUES ('a', 'e', 'ミリ', 1);
    `)

    migrate(db, workSchema)

    expect(readPragmas(db).userVersion).toBe(17)
    expect(
      db
        .prepare("SELECT source, status, term_type, review_flags FROM context_entry WHERE id = 'e'")
        .get()
    ).toEqual({ source: 'ミリィ', status: 'approved', term_type: null, review_flags: '[]' })
    expect(db.prepare('SELECT form FROM context_alias').all()).toEqual([{ form: 'ミリ' }])

    db.exec(`
      INSERT INTO context_entry_evidence (id, entry_id, run_id, chapter_id, quote, model, prompt_hash, created_at)
        VALUES ('ev', 'e', 'r', 'c', 'ミリィが言った', 'm', 'h', 2);
      INSERT INTO context_extraction_scan (chapter_id, run_id, model, prompt_hash, scanned_at)
        VALUES ('c', 'r', 'm', 'h', 2);
      DELETE FROM chapter WHERE id = 'c';
    `)
    // A deleted chapter forgets its scan but keeps the quote, unlinked.
    expect(db.prepare('SELECT count(*) AS n FROM context_extraction_scan').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT chapter_id FROM context_entry_evidence').get()).toEqual({
      chapter_id: null
    })
    db.exec("DELETE FROM context_entry WHERE id = 'e'")
    expect(db.prepare('SELECT count(*) AS n FROM context_entry_evidence').get()).toEqual({ n: 0 })
    db.close()
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
    'upgrades a work v%i file to v16 preserving data and allowing ko/BCP-47',
    (version) => {
      const db = openDatabase(join(tempDir(), 'work-from-v' + version + '.mira'))
      migrate(db, {
        applicationId: WORK_APPLICATION_ID,
        migrations: workSchema.migrations.filter((m) => m.version <= version)
      })
      db.exec(`
        INSERT INTO work (id, title, source_lang, created_at, updated_at)
        VALUES ('w', 'Tác phẩm cũ', 'ja', 1, 1);
        INSERT INTO chapter (id, position, title, created_at, updated_at)
        VALUES ('c', 0, 'Chương 1', 1, 1);
        INSERT INTO chapter_text (chapter_id, side, content, rev, updated_at)
        VALUES ('c', 'source', 'Raw text', 0, 1), ('c', 'target', 'Bản dịch', 0, 1);
      `)
      if (version >= 7) {
        const action = version === 7 ? 'hoi' : 'ask'
        db.exec(`
          INSERT INTO ai_session (id, title, created_at, updated_at)
          VALUES ('s', 'Hỏi đáp', 1, 1);
          INSERT INTO ai_turn (id, session_id, chapter_id, action, question, answer, status, created_at, updated_at)
          VALUES ('t', 's', 'c', '${action}', 'Hỏi', 'Đáp', 'done', 1, 1);
        `)
      }
      migrate(db, workSchema)
      expect(readPragmas(db).userVersion).toBe(17)
      expect(db.prepare("SELECT title FROM work WHERE id = 'w'").get()).toEqual({
        title: 'Tác phẩm cũ'
      })
      expect(
        db
          .prepare("SELECT content FROM chapter_text WHERE chapter_id = 'c' AND side = 'source'")
          .get()
      ).toEqual({ content: 'Raw text' })

      db.exec("UPDATE work SET source_lang = 'ko'")
      expect(db.prepare("SELECT source_lang FROM work WHERE id = 'w'").get()).toEqual({
        source_lang: 'ko'
      })
      db.exec("UPDATE work SET source_lang = 'fr-CA'")
      expect(db.prepare("SELECT source_lang FROM work WHERE id = 'w'").get()).toEqual({
        source_lang: 'fr-CA'
      })
      db.close()
    }
  )
})
