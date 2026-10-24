import type { AgentTaskDetailView } from '../../../../../shared/contracts/agentTask'

export type ChapterItem = AgentTaskDetailView['items'][number]

export type ChapterFilter = 'all' | 'failed' | 'running' | 'todo'

export const CHAPTER_FILTERS: Array<{ value: ChapterFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'failed', label: 'Lỗi' },
  { value: 'running', label: 'Đang chạy' },
  { value: 'todo', label: 'Chưa dịch' }
]

/** A failed or waiting chapter is one the person has to look at. */
export const isProblem = (item: ChapterItem): boolean =>
  item.state === 'failed' || item.state === 'waiting_user'

export function filterChapters(
  items: readonly ChapterItem[],
  filter: ChapterFilter
): ChapterItem[] {
  switch (filter) {
    case 'failed':
      return items.filter(isProblem)
    case 'running':
      return items.filter((item) => item.state === 'running')
    case 'todo':
      return items.filter((item) => item.state === 'queued')
    default:
      return [...items]
  }
}

export type ChapterRowModel =
  | { kind: 'item'; item: ChapterItem }
  | { kind: 'done'; key: string; items: ChapterItem[] }

/** Chapters that finished with nothing to say: no instruction pinned, no paragraph skipped. */
const plainDone = (item: ChapterItem): boolean =>
  item.state === 'completed' && !item.instruction && item.skippedSegments.length === 0

/** Fewer finished chapters than this in a row stay as they are; folding two rows saves nothing. */
export const MIN_DONE_RUN = 3

/**
 * Finished chapters in a row become one line, "7 chương xong". Chapters with something to read (an
 * instruction, skipped paragraphs) and every unfinished chapter keep their own row.
 */
export function collapseCompleted(items: readonly ChapterItem[]): ChapterRowModel[] {
  const rows: ChapterRowModel[] = []
  let run: ChapterItem[] = []
  const flush = (): void => {
    if (run.length >= MIN_DONE_RUN) rows.push({ kind: 'done', key: run[0].id, items: run })
    else for (const item of run) rows.push({ kind: 'item', item })
    run = []
  }
  for (const item of items) {
    if (plainDone(item)) run.push(item)
    else {
      flush()
      rows.push({ kind: 'item', item })
    }
  }
  flush()
  return rows
}

/** The filter a task opens on: its failures when it has any, otherwise everything. */
export const defaultChapterFilter = (items: readonly ChapterItem[]): ChapterFilter =>
  items.some(isProblem) ? 'failed' : 'all'

/**
 * The chapters a new instruction can still reach: no run has pinned them yet. The newest steering is sent
 * by chapter id, so the person never types a number.
 */
export const steerableChapters = (items: readonly ChapterItem[]): ChapterItem[] =>
  items.filter(
    (item) =>
      item.instruction === undefined && (item.state === 'queued' || item.state === 'waiting_user')
  )
