import * as v from 'valibot'
import {
  mainModelSchema,
  modelRefSchema,
  MAX_FALLBACKS,
  type AiPreferences,
  type MainModel,
  type ModelRef
} from '../../../shared/contracts/aiPreferences'
import type { Db } from './sqlite'

/**
 * Settings › Model in the library's \`meta\` table (design D6 of change \`hermes-settings-modal\`): one JSON value
 * per key. A value that does not parse, or that points at a connection or model entry that is gone, reads as
 * absent, so a deleted connection can never leave the app pointing at nothing.
 */
const MAIN_KEY = 'ai.main'
const FALLBACKS_KEY = 'ai.fallbacks'
const AUXILIARY_KEY = 'ai.auxiliary'
const ONBOARDING_KEY = 'ai.onboarding.skipped'

function readMeta(db: Db, key: string): unknown {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get<{ value: string }>(key)
  if (!row) return undefined
  try {
    return JSON.parse(row.value)
  } catch {
    return undefined
  }
}

function writeMeta(db: Db, key: string, value: unknown): void {
  if (value === null || value === undefined) {
    db.prepare('DELETE FROM meta WHERE key = ?').run(key)
    return
  }
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value))
}

function entryExists(db: Db, ref: ModelRef): boolean {
  return (
    db
      .prepare('SELECT 1 AS hit FROM ai_model WHERE id = ? AND connection_id = ?')
      .get<{ hit: number }>(ref.entryId, ref.connectionId) !== undefined
  )
}

export function readAiPreferences(db: Db): AiPreferences {
  const mainRaw = v.safeParse(mainModelSchema, readMeta(db, MAIN_KEY))
  const main = mainRaw.success && entryExists(db, mainRaw.output) ? mainRaw.output : null

  const listRaw = readMeta(db, FALLBACKS_KEY)
  const fallbacks = (Array.isArray(listRaw) ? listRaw : [])
    .map((item) => v.safeParse(modelRefSchema, item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.output as ModelRef)
    .filter((ref) => entryExists(db, ref))
    .slice(0, MAX_FALLBACKS)

  const auxRaw = v.safeParse(modelRefSchema, readMeta(db, AUXILIARY_KEY))
  const auxiliary = auxRaw.success && entryExists(db, auxRaw.output) ? auxRaw.output : null

  return { main, fallbacks, auxiliary, onboardingSkipped: readMeta(db, ONBOARDING_KEY) === true }
}

export function writeMainModel(db: Db, main: MainModel | null): void {
  writeMeta(db, MAIN_KEY, main)
}

export function writeFallbacks(db: Db, fallbacks: ModelRef[]): void {
  // A model listed twice would only be tried twice; keep the first.
  const seen = new Set<string>()
  const unique = fallbacks.filter((ref) => {
    if (seen.has(ref.entryId)) return false
    seen.add(ref.entryId)
    return true
  })
  writeMeta(db, FALLBACKS_KEY, unique.length > 0 ? unique : null)
}

export function writeAuxiliaryModel(db: Db, auxiliary: ModelRef | null): void {
  writeMeta(db, AUXILIARY_KEY, auxiliary)
}

export function writeOnboardingSkipped(db: Db, skipped: boolean): void {
  writeMeta(db, ONBOARDING_KEY, skipped ? true : null)
}

/** Drops references to entries that no longer exist; called after a connection or an entry is deleted. */
export function pruneAiPreferences(db: Db): void {
  const current = readAiPreferences(db)
  writeMainModel(db, current.main)
  writeFallbacks(db, current.fallbacks)
  writeAuxiliaryModel(db, current.auxiliary)
}
