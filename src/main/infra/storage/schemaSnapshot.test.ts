import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIBRARY_APPLICATION_ID, librarySchema } from './librarySchema'
import { migrate, type SchemaSpec } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { createTempDirs } from '../../testing/testing'
import { WORK_APPLICATION_ID, workSchema } from './workSchema'

/**
 * Freezes every released schema version. A version must never be edited once users may have it:
 * changes go in a new migration, and these tests fail if an old migration drifts. Each version has
 * its own fixture. To create the fixture for a new version (or accept a change made before any
 * release), regenerate with `MIRA_UPDATE_SNAPSHOTS=1 pnpm test`.
 */
const tempDir = createTempDirs()
const fixtures = join(__dirname, '__fixtures__')

/** The schema as a database that stopped at `version` would have it. */
function upTo(spec: SchemaSpec, version: number): SchemaSpec {
  return { ...spec, migrations: spec.migrations.filter((m) => m.version <= version) }
}

function dumpSchema(db: Db): string {
  const rows = db
    .prepare('SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name')
    .all<{ type: string; name: string; sql: string }>()
  return (
    rows.map((row) => '-- ' + row.type + ' ' + row.name + '\n' + row.sql + ';').join('\n\n') + '\n'
  )
}

function check(name: string, spec: SchemaSpec, version: number): void {
  const db = openDatabase(join(tempDir(), name + '.db'))
  migrate(db, upTo(spec, version))
  const actual = dumpSchema(db)
  db.close()

  const path = join(fixtures, name)
  if (process.env.MIRA_UPDATE_SNAPSHOTS === '1') writeFileSync(path, actual, 'utf-8')
  // Git may check the fixture out with CRLF; the schema itself always uses LF.
  expect(actual).toBe(readFileSync(path, 'utf-8').replaceAll('\r\n', '\n'))
}

describe('work file schema', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])(
    'version %i matches its frozen snapshot',
    (version) => {
      check('work-v' + version + '.schema.sql', workSchema, version)
    }
  )

  it('has one fixture per migration and a stable application id', () => {
    expect(workSchema.migrations.map((m) => m.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
    ])
    expect(WORK_APPLICATION_ID).toBe(0x4d495241)
  })
})

describe('library index schema', () => {
  it.each([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])(
    'version %i matches its frozen snapshot',
    (version) => {
      check('library-v' + version + '.schema.sql', librarySchema, version)
    }
  )

  it('has one fixture per migration and a stable application id', () => {
    expect(librarySchema.migrations.map((m) => m.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18
    ])
    expect(LIBRARY_APPLICATION_ID).toBe(0x4d49524c)
  })
})
