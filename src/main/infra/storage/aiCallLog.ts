import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Raw model calls, one JSONL file per work in `<dataDir>/logs/<workId>.jsonl`: what was sent, what came
 * back, and what the app kept, so prompt work can read real runs instead of guessing from the final text.
 * It is not part of the work file, so backups and exports leave it out. Until `configureAiCallLog` runs
 * (tests, tools), every append is a no-op.
 */

/** Records older than this are dropped when the app starts. */
export const AI_CALL_LOG_KEEP_MS = 30 * 24 * 60 * 60 * 1000

const SAFE_ID = /^[\w-]+$/

let logDir: string | null = null

export function configureAiCallLog(dataDir: string | null, now: number = Date.now()): void {
  if (dataDir === null) {
    logDir = null
    return
  }
  logDir = join(dataDir, 'logs')
  mkdirSync(logDir, { recursive: true })
  pruneAiCallLogs(logDir, now - AI_CALL_LOG_KEEP_MS)
}

export function appendAiCall(workId: string, record: Record<string, unknown>): void {
  if (logDir === null || !SAFE_ID.test(workId)) return
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), ...record })
    appendFileSync(join(logDir, workId + '.jsonl'), line + '\n')
  } catch {
    // A log that cannot be written must never break a translation.
  }
}

/** Every record of a work's log, oldest first; unreadable lines are skipped, a missing log is empty. */
export function readAiCalls(workId: string): Record<string, unknown>[] {
  if (logDir === null || !SAFE_ID.test(workId)) return []
  let text: string
  try {
    text = readFileSync(join(logDir, workId + '.jsonl'), 'utf8')
  } catch {
    return []
  }
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
}

/** Rewrites each log without the records written before `cutoff`; unreadable lines are dropped too. */
export function pruneAiCallLogs(dir: string, cutoff: number): void {
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue
    const path = join(dir, name)
    try {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
      const kept = lines.filter((line) => {
        try {
          return Date.parse((JSON.parse(line) as { at: string }).at) >= cutoff
        } catch {
          return false
        }
      })
      if (kept.length !== lines.length) {
        writeFileSync(path, kept.length > 0 ? kept.join('\n') + '\n' : '')
      }
    } catch {
      // Leave a log that cannot be read as it is.
    }
  }
}
