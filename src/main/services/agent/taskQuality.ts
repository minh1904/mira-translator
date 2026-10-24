import { createHash } from 'node:crypto'
import type { AgentTaskItemView } from '../../../shared/contracts/agentTask'
import { buildRows } from '../../../shared/contracts/rows'
import type {
  QaDismissInput,
  QaItemView,
  TaskQualityView
} from '../../../shared/contracts/taskQuality'
import { evaluateTaskItem, type QaSegment } from '../../../shared/translation/taskQuality'
import { StorageError } from '../../infra/storage/errors'
import { addDismissal, dismissalKey, listDismissalKeys } from '../../infra/storage/qaDismissals'
import { getRunContext } from '../../infra/storage/translateRunContext'
import { parseSnapshot } from '../ai/translate/contextSnapshot'
import type { LibraryStore } from '../library/library'

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Paragraphs of a chapter that have a committed translation, matched by source segment ID. */
export function translatedSegments(
  library: LibraryStore,
  workId: string,
  chapterId: string
): QaSegment[] {
  const source = library.readText(workId, chapterId, 'source')
  const target = library.readText(workId, chapterId, 'target')
  return buildRows(source, target, library.listLinks(workId, chapterId))
    .rows.filter((row) => row.targetIds.length > 0 && row.targetText.trim() !== '')
    .map((row) => ({
      segmentId: row.sourceId,
      paragraphIndex: row.index,
      source: row.sourceText,
      target: row.targetText
    }))
}

function checkItem(
  library: LibraryStore,
  workId: string,
  item: AgentTaskItemView,
  chapterLabel: string
): QaItemView {
  const na: QaItemView = {
    itemId: item.id,
    chapterId: item.chapterId,
    chapterLabel,
    status: 'na',
    findings: []
  }
  if (!item.runKey) return na
  const runKey = item.runKey
  try {
    return library.withWork(workId, (db) => {
      const stored = getRunContext(db, runKey)
      if (!stored) return na
      const segments = translatedSegments(library, workId, item.chapterId)
      if (segments.length === 0) return na
      // The context the item sent the model, not today's: a later glossary edit does not move old warnings.
      const snapshot = parseSnapshot(stored.snapshotJson)
      const targets = new Map(
        segments.map((segment) => [segment.segmentId, hashOf(segment.target)])
      )
      const dismissed = listDismissalKeys(db, item.chapterId)
      const findings = evaluateTaskItem(
        item.chapterId,
        { sourceLang: snapshot.sourceLang, glossary: snapshot.glossary, dyads: snapshot.dyads },
        segments
      ).filter(
        (finding) =>
          !dismissed.has(
            dismissalKey(
              finding.ruleCode,
              finding.ruleVersion,
              finding.segmentId,
              targets.get(finding.segmentId) ?? ''
            )
          )
      )
      return { ...na, status: 'checked', findings }
    })
  } catch {
    // The chapter or work file is gone: nothing left to check.
    return na
  }
}

/** Open warnings of every item of a task, computed now (change `add-translation-task-qa`). */
export function readTaskQuality(
  library: LibraryStore,
  task: { id: string; workId: string },
  items: Array<AgentTaskItemView & { chapterLabel: string }>
): TaskQualityView {
  const checked = items.map((item) => checkItem(library, task.workId, item, item.chapterLabel))
  return {
    taskId: task.id,
    openCount: checked.reduce((sum, item) => sum + item.findings.length, 0),
    items: checked
  }
}

/** Stores "ignore this warning" for the paragraph's current text; the text itself is not touched. */
export function dismissFinding(
  library: LibraryStore,
  workId: string,
  item: AgentTaskItemView,
  input: QaDismissInput,
  now: number
): void {
  const segment = translatedSegments(library, workId, item.chapterId).find(
    (each) => each.segmentId === input.segmentId
  )
  if (!segment)
    throw new StorageError('not_found', 'Đoạn này không còn bản dịch để bỏ qua cảnh báo.')
  library.withWork(workId, (db) =>
    addDismissal(db, {
      ruleCode: input.ruleCode,
      ruleVersion: input.ruleVersion,
      chapterId: item.chapterId,
      segmentId: input.segmentId,
      targetHash: hashOf(segment.target),
      reason: input.reason?.trim() || null,
      now
    })
  )
}
