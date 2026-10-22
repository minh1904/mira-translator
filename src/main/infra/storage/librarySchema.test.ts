import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StorageError } from './errors'
import { librarySchema } from './librarySchema'
import { migrate, readPragmas, type SchemaSpec } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { createTempDirs } from '../../testing/testing'

/**
 * The v4 → v5 upgrade of `library.db` (change `ai-model-settings`, design D2): a model stops being a
 * `(connection, name)` pair and becomes an entry with its own id. The frozen shape of each version is
 * checked by `schemaSnapshot.test.ts`; what is checked here is what happens to the **data** on the way.
 */
const tempDir = createTempDirs()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function upTo(version: number): SchemaSpec {
  return {
    ...librarySchema,
    migrations: librarySchema.migrations.filter((m) => m.version <= version)
  }
}

interface EntryRow {
  id: string
  connection_id: string
  name: string
  model_id: string
  ord: number
  settings: string
}

const entriesOf = (db: Db, connectionId: string): EntryRow[] =>
  db
    .prepare(
      'SELECT id, connection_id, name, model_id, ord, settings FROM ai_model' +
        ' WHERE connection_id = ? ORDER BY ord'
    )
    .all<EntryRow>(connectionId)

const defaultOf = (db: Db, connectionId: string): string | null =>
  db
    .prepare('SELECT default_model FROM ai_connection WHERE id = ?')
    .get<{ default_model: string | null }>(connectionId)!.default_model

/**
 * A v4 file the way a user would have it: four connections that cover every shape the upgrade has to
 * handle, one key with a cipher to prove nothing around the models is touched.
 */
function v4Library(): { db: Db; path: string } {
  const path = join(tempDir(), 'library.db')
  const db = openDatabase(path)
  migrate(db, upTo(4))
  const connection = db.prepare(
    'INSERT INTO ai_connection (id, name, base_url, enabled, provider_id, default_model, checked_at,' +
      ' ord, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1, 2)'
  )
  connection.run('conn-a', 'Google', 'https://a.example/v1', 'google', 'm2', 99, 0)
  connection.run('conn-b', 'Gateway', 'http://127.0.0.1:8317/v1', null, 'not-in-the-list', null, 1)
  connection.run('conn-c', 'Trống', 'http://c.example/v1', null, null, null, 2)
  connection.run('conn-d', 'Mặc định rỗng', 'http://d.example/v1', null, '', null, 3)

  const model = db.prepare('INSERT INTO ai_model (connection_id, model_id, ord) VALUES (?, ?, ?)')
  // Listed out of order on purpose: `ord`, not insertion order, is what the user arranged.
  model.run('conn-a', 'm3', 2)
  model.run('conn-a', 'm1', 0)
  model.run('conn-a', 'm2', 1)
  model.run('conn-b', 'x', 0)

  db.prepare(
    'INSERT INTO ai_key (id, connection_id, secret, tail, ord, state, frozen_until, frozen_scope,' +
      ' freeze_strikes, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 2, 5)'
  ).run('key-1', 'conn-a', new Uint8Array([1, 2, 3, 255]), 'wxyz', 'ok', 12345, 'day')
  return { db, path }
}

describe('library.db v4 → v5', () => {
  it('turns each old model into an entry named after it, in the order the user arranged', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    const entries = entriesOf(db, 'conn-a')
    expect(entries.map((entry) => entry.model_id)).toEqual(['m1', 'm2', 'm3'])
    expect(entries.map((entry) => entry.name)).toEqual(['m1', 'm2', 'm3'])
    expect(entries.map((entry) => entry.ord)).toEqual([0, 1, 2])
    db.close()
  })

  it('gives every entry its own id and empty settings, so nothing extra is sent until the user sets it', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    const all = db
      .prepare('SELECT id, settings FROM ai_model')
      .all<{ id: string; settings: string }>()
    expect(all).toHaveLength(5) // m1 m2 m3 x + the default that was not in the list
    for (const row of all) {
      expect(row.id).toMatch(UUID)
      expect(row.settings).toBe('{}')
    }
    expect(new Set(all.map((row) => row.id)).size).toBe(all.length)
    db.close()
  })

  it('points the default at the entry of the model that was the default', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    const m2 = entriesOf(db, 'conn-a').find((entry) => entry.model_id === 'm2')!
    expect(defaultOf(db, 'conn-a')).toBe(m2.id)
    db.close()
  })

  it('keeps a default that was not in the list usable by giving it an entry, after the others', () => {
    // Before, the translate dialog still offered the default model even when it was not in the list.
    const { db } = v4Library()
    migrate(db, librarySchema)

    const entries = entriesOf(db, 'conn-b')
    expect(entries.map((entry) => entry.model_id)).toEqual(['x', 'not-in-the-list'])
    expect(entries.map((entry) => entry.ord)).toEqual([0, 1])
    expect(defaultOf(db, 'conn-b')).toBe(entries[1].id)
    db.close()
  })

  it('leaves a connection with no default without one, and reads an empty default as none', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    expect(defaultOf(db, 'conn-c')).toBeNull()
    expect(entriesOf(db, 'conn-c')).toEqual([])
    expect(defaultOf(db, 'conn-d')).toBeNull()
    expect(entriesOf(db, 'conn-d')).toEqual([])
    db.close()
  })

  it('leaves the connections and their keys exactly as they were', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    const connection = db
      .prepare(
        'SELECT name, base_url, provider_id, checked_at, ord FROM ai_connection WHERE id = ?'
      )
      .get<Record<string, unknown>>('conn-a')
    expect(connection).toEqual({
      name: 'Google',
      base_url: 'https://a.example/v1',
      provider_id: 'google',
      checked_at: 99,
      ord: 0
    })
    const key = db
      .prepare('SELECT secret, tail, state, frozen_until, frozen_scope, freeze_strikes FROM ai_key')
      .get<{
        secret: Uint8Array
        tail: string
        state: string
        frozen_until: number
        frozen_scope: string
        freeze_strikes: number
      }>()!
    expect([...key.secret]).toEqual([1, 2, 3, 255])
    expect(key).toMatchObject({
      tail: 'wxyz',
      state: 'ok',
      frozen_until: 12345,
      frozen_scope: 'day',
      freeze_strikes: 2
    })
    expect(readPragmas(db).userVersion).toBe(17)
    db.close()
  })

  it('lets two entries share a model name, which the old primary key did not allow', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    db.prepare(
      "INSERT INTO ai_model (id, connection_id, name, model_id, ord, settings) VALUES (?, 'conn-a', ?, 'm1', 9, '{}')"
    ).run('00000000-0000-4000-8000-000000000001', 'm1 nhanh')
    expect(entriesOf(db, 'conn-a').filter((entry) => entry.model_id === 'm1')).toHaveLength(2)
    db.close()
  })

  it("deletes a connection's entries with it", () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    db.prepare('DELETE FROM ai_connection WHERE id = ?').run('conn-a')
    expect(entriesOf(db, 'conn-a')).toEqual([])
    expect(entriesOf(db, 'conn-b')).toHaveLength(2)
    db.close()
  })

  it('is complete from nothing: a new file has the latest tables and no rows', () => {
    const db = openDatabase(join(tempDir(), 'fresh.db'))
    migrate(db, librarySchema)
    expect(readPragmas(db).userVersion).toBe(17)
    expect(db.prepare('SELECT COUNT(*) AS n FROM ai_model').get<{ n: number }>()!.n).toBe(0)
    db.close()
  })

  it('leaves the file at v4, old table and all, when the step fails halfway', () => {
    const { db } = v4Library()
    const real = librarySchema.migrations.find((m) => m.version === 5)!
    const failing: SchemaSpec = {
      ...librarySchema,
      migrations: [
        ...upTo(4).migrations,
        {
          version: 5,
          up(inner) {
            real.up(inner) // drops the old table and fills the new one …
            throw new Error('boom') // … and then something goes wrong
          }
        }
      ]
    }
    expect(() => migrate(db, failing)).toThrow('boom')

    expect(readPragmas(db).userVersion).toBe(4)
    const old = db
      .prepare('SELECT connection_id, model_id, ord FROM ai_model ORDER BY connection_id, ord')
      .all<{ connection_id: string; model_id: string; ord: number }>()
    expect(old.map((row) => row.model_id)).toEqual(['m1', 'm2', 'm3', 'x'])
    expect(defaultOf(db, 'conn-a')).toBe('m2') // still a model name, not an id
    db.close()
  })

  it('is refused by code that only knows v4', () => {
    const { db } = v4Library()
    migrate(db, librarySchema)

    let error: unknown
    try {
      migrate(db, upTo(4))
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(StorageError)
    expect((error as StorageError).code).toBe('unsupported_version')
    expect(readPragmas(db).userVersion).toBe(17)
    db.close()
  })
})

describe('library schema v6', () => {
  it('files a connection on the Ollama preset address under the ollama provider, and nothing else', () => {
    const db = openDatabase(join(tempDir(), 'v5.db'))
    migrate(db, upTo(5))
    const insert = db.prepare(
      'INSERT INTO ai_connection (id, name, base_url, enabled, provider_id, ord, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, 1, 1)'
    )
    insert.run('ollama', 'Ollama', 'http://127.0.0.1:11434/v1/', null, 0)
    insert.run('gateway', 'Gateway', 'http://127.0.0.1:8317/v1', null, 1)
    insert.run('moved', 'Ollama khác', 'http://192.168.1.5:11434/v1', null, 2)
    insert.run(
      'gemini',
      'Gemini',
      'https://generativelanguage.googleapis.com/v1beta/openai/',
      'google',
      3
    )

    migrate(db, librarySchema)
    const providers = db
      .prepare('SELECT id, provider_id FROM ai_connection ORDER BY ord')
      .all<{ id: string; provider_id: string | null }>()
    expect(providers).toEqual([
      { id: 'ollama', provider_id: 'ollama' },
      { id: 'gateway', provider_id: null },
      { id: 'moved', provider_id: null },
      { id: 'gemini', provider_id: 'google' }
    ])
    db.close()
  })
})

describe('library schema v8', () => {
  const thrown = (fn: () => unknown): boolean => {
    try {
      fn()
    } catch {
      return true
    }
    return false
  }

  it('creates adapter, auth, job and rebuildable schedule storage with constrained states', () => {
    const db = openDatabase(join(tempDir(), 'v8.db'))
    migrate(db, librarySchema)
    expect(readPragmas(db).userVersion).toBe(17)
    db.exec(`
      INSERT INTO source_adapter_install (adapter_id, version, manifest_json, artifact_sha256,
        trust_level, state, installed_at, updated_at)
      VALUES ('builtin.folder', '1.0.0', '{}', 'sha', 'builtin', 'enabled', 1, 1);
      INSERT INTO source_auth_profile (id, adapter_id, label, encrypted_secret, account_partition,
        state, created_at, updated_at)
      VALUES ('auth', 'builtin.folder', 'Tài khoản', x'0102ff', 'persist:source-auth', 'ok', 1, 1);
      INSERT INTO source_job (id, work_id, binding_id, kind, state, attempt, created_at, updated_at)
      VALUES ('job', 'work', 'binding', 'catalog_sync', 'queued', 0, 1, 1);
      INSERT INTO source_schedule_index (work_id, binding_id, enabled, next_check_at, priority, last_result)
      VALUES ('work', 'binding', 1, 10, 0, 'ok');
    `)
    expect(
      db
        .prepare(
          "SELECT typeof(encrypted_secret) AS storage FROM source_auth_profile WHERE id = 'auth'"
        )
        .get()
    ).toEqual({ storage: 'blob' })
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_auth_profile
          (id, adapter_id, label, encrypted_secret, account_partition, state, created_at, updated_at)
          VALUES ('bad', 'builtin.folder', 'Bad', x'01', 'p', 'unknown', 1, 1)`)
      )
    ).toBe(true)
    expect(
      thrown(() =>
        db.exec(`INSERT INTO source_schedule_index
          (work_id, binding_id, enabled, priority) VALUES ('work', 'binding', 1, 0)`)
      )
    ).toBe(true)
    db.exec("DELETE FROM source_adapter_install WHERE adapter_id = 'builtin.folder'")
    expect(db.prepare('SELECT count(*) AS n FROM source_auth_profile').get()).toEqual({ n: 0 })
    db.close()
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    'upgrades a library v%i file without losing old rows',
    (version) => {
      const db = openDatabase(join(tempDir(), 'library-from-v' + version + '.db'))
      migrate(db, upTo(version))
      db.exec(`INSERT INTO work_index
      (id, file_name, title, source_lang, status, archived, chapter_count, created_at, updated_at)
      VALUES ('w', 'w.mira', 'Tác phẩm', 'ja', 'not-started', 0, 0, 1, 2)`)
      migrate(db, librarySchema)
      expect(readPragmas(db).userVersion).toBe(17)
      expect(db.prepare("SELECT title FROM work_index WHERE id = 'w'").get()).toEqual({
        title: 'Tác phẩm'
      })
      db.close()
    }
  )
})
