import type { AgentTaskSteerInput } from '../../../shared/contracts/agentTask'
import { listContextEntries } from '../../infra/storage/contextEntries'
import { StorageError } from '../../infra/storage/errors'
import type { LibraryStore } from '../library/library'

/**
 * The steering change for "translate this term differently from chapter N" asked in chat: the model
 * names the term by its source form; this finds the entry that applies at that chapter.
 */
export function termSteeringChange(
  library: LibraryStore,
  workId: string,
  fromChapter: number,
  term: { source: string; target: string; notes?: string }
): Extract<AgentTaskSteerInput['change'], { kind: 'term' }> {
  const chapter = library.listChapters(workId).find((each) => each.number === fromChapter)
  if (!chapter) throw new StorageError('not_found', `Không có chương ${fromChapter}.`)
  const form = term.source.trim().toLowerCase()
  const entry = library
    .withWork(workId, (db) => listContextEntries(db, { kind: 'term', chapterId: chapter.id }))
    .find(
      (each) =>
        each.status !== 'rejected' &&
        [each.source, ...each.aliases].some((value) => value.toLowerCase() === form)
    )
  if (!entry) {
    throw new StorageError(
      'not_found',
      `Không có thuật ngữ "${term.source}" áp dụng ở chương ${fromChapter}.`
    )
  }
  return {
    kind: 'term',
    entryId: entry.id,
    target: term.target.trim(),
    ...(term.notes !== undefined ? { notes: term.notes } : {})
  }
}
