import { getEffectiveGlossary } from './contextEntries'
import { reviseEntry } from './contextRevisions'
import type { Db } from './sqlite'

/**
 * Learning from hand edits (change `add-context-progression`): when a person replaces a term's
 * translation X with Y in a chapter whose source has the term, that is a signal; the same X → Y for the
 * same entry in two chapters changes the entry, as a correction by `user_edit_signal`.
 */

const Y_MAX = 40
const SENTENCE_END = /[。！？.!?]/u
const SIGNAL_CHAPTERS = 2

/**
 * What replaced `from` in one edited line: the new text at the place `from` was, after the prefix and
 * suffix both lines share. `null` when the line still has `from` or the change is not a replacement.
 */
export function replacementOf(before: string, after: string, from: string): string | null {
  const at = before.indexOf(from)
  if (at === -1 || after.includes(from)) return null
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++
  const start = Math.min(prefix, at)
  const tail = before.length - Math.max(at + from.length, before.length - suffix)
  const replaced = after.slice(start, after.length - tail).trim()
  if (replaced === '' || replaced.length > Y_MAX || SENTENCE_END.test(replaced)) return null
  return replaced
}

/**
 * Records the signals of one save of a chapter's translation and applies those seen in two chapters.
 * shortcut: compares line by line and skips a save that adds or removes lines; a segment-level diff
 * would catch edits made together with a split or a merge.
 */
export function recordEditSignals(
  db: Db,
  chapterId: string,
  before: string,
  after: string,
  now: number
): void {
  const oldLines = before.split(/\r?\n/)
  const newLines = after.split(/\r?\n/)
  if (oldLines.length !== newLines.length) return
  const source =
    db
      .prepare("SELECT content FROM chapter_text WHERE chapter_id = ? AND side = 'source'")
      .get<{ content: string }>(chapterId)?.content ?? ''
  const terms = getEffectiveGlossary(db, chapterId).filter(
    (entry) =>
      entry.kind === 'term' &&
      entry.target.trim() !== '' &&
      [entry.source, ...entry.aliases].some((form) => source.includes(form))
  )
  db.transaction(() => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO context_edit_signal (entry_id, chapter_id, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    const chapters = db.prepare(
      `SELECT count(DISTINCT chapter_id) AS n FROM context_edit_signal
       WHERE entry_id = ? AND old_value = ? AND new_value = ?`
    )
    oldLines.forEach((line, index) => {
      if (line === newLines[index]) return
      for (const entry of terms) {
        const replaced = replacementOf(line, newLines[index]!, entry.target)
        if (!replaced) continue
        insert.run(entry.id, chapterId, entry.target, replaced, now)
        const seen = chapters.get<{ n: number }>(entry.id, entry.target, replaced)?.n ?? 0
        if (seen >= SIGNAL_CHAPTERS) {
          reviseEntry(
            db,
            {
              entryId: entry.id,
              actor: 'user_edit_signal',
              kind: 'correction',
              fields: { target: replaced },
              evidence: [{ chapterId, quote: newLines[index]!.trim().slice(0, 200) }]
            },
            now
          )
        }
      }
    })
  })
}
