import {
  WORK_CONVENTION_DEFAULTS,
  WORK_CONVENTIONS,
  type WorkConventionKey,
  type WorkConventions
} from '../../../shared/contracts/contextQuestions'
import { StorageError } from './errors'
import type { Db } from './sqlite'

/** The work's conventions: what is stored, else the default, not settled. */
export function readConventions(db: Db): WorkConventions {
  const rows = new Map(
    db
      .prepare('SELECT key, value, settled FROM work_convention')
      .all<{ key: string; value: string; settled: number }>()
      .map((row) => [row.key, row])
  )
  const out = {} as Record<WorkConventionKey, { value: string; settled: boolean }>
  for (const key of Object.keys(WORK_CONVENTIONS) as WorkConventionKey[]) {
    const row = rows.get(key)
    const known = row && (WORK_CONVENTIONS[key] as readonly string[]).includes(row.value)
    out[key] = known
      ? { value: row.value, settled: row.settled === 1 }
      : { value: WORK_CONVENTION_DEFAULTS[key], settled: false }
  }
  return out as WorkConventions
}

/** Sets one convention; a person choosing it settles it. */
export function writeConvention(
  db: Db,
  key: WorkConventionKey,
  value: string,
  settled: boolean,
  now: number
): void {
  if (!(WORK_CONVENTIONS[key] as readonly string[]).includes(value)) {
    throw new StorageError('validation', `Giá trị "${value}" không hợp lệ cho quy ước ${key}.`)
  }
  db.prepare(
    `INSERT INTO work_convention (key, value, settled, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, settled = excluded.settled,
       updated_at = excluded.updated_at`
  ).run(key, value, settled ? 1 : 0, now)
}
