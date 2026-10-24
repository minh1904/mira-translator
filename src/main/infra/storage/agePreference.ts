import type { Db } from './sqlite'

/**
 * The user's 18+ confirmation for R18 sources, kept in the library's `meta` table so it is an
 * application preference and never travels inside a work file.
 */
const AGE_KEY = 'sources.ageConfirmed'

export function readAgeConfirmed(db: Db): boolean {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get<{ value: string }>(AGE_KEY)
  return row?.value === 'true'
}

export function writeAgeConfirmed(db: Db, confirmed: boolean): void {
  if (!confirmed) {
    db.prepare('DELETE FROM meta WHERE key = ?').run(AGE_KEY)
    return
  }
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(AGE_KEY, 'true')
}
