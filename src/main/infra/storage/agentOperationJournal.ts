import type { TextSide } from '../../../shared/contracts/text'
import { StorageError } from './errors'
import type { RowAuthor } from './sentenceRows'
import { saveRow } from './sentenceRows'
import type { Db } from './sqlite'
import { readText, saveText } from './textFile'
import { segment } from '../../../shared/segmentation/segmenter'

export type AgentOperationTerminalState =
  | 'completed'
  | 'partially_completed'
  | 'cancelled'
  | 'conflict'
  | 'failed'
  | 'interrupted'
  | 'undone'

export interface AgentOperationCheckpoint {
  operationId: string
  chapterId: string
  side: TextSide
  state: 'prepared' | 'applied' | 'terminal' | 'undone'
  beforeRev: number
  beforeContent: string
  lastAppliedRev: number | null
  appliedUnits: number
  totalUnits: number
  terminalState: AgentOperationTerminalState | null
  terminalResult: unknown | null
  createdAt: number
  updatedAt: number
  terminalAt: number | null
}

export interface AgentOperationBatch {
  operationId: string
  batchKey: string
  expectedRev: number
  afterRev: number
  appliedUnits: number
  checksum: string
  createdAt: number
}

export interface AgentOperationEvidence {
  checkpoint: AgentOperationCheckpoint
  batches: AgentOperationBatch[]
}

interface CheckpointRow {
  operation_id: string
  chapter_id: string
  side: TextSide
  state: AgentOperationCheckpoint['state']
  before_rev: number
  before_content: string
  last_applied_rev: number | null
  applied_units: number
  total_units: number
  terminal_state: AgentOperationTerminalState | null
  terminal_result_json: string | null
  created_at: number
  updated_at: number
  terminal_at: number | null
}

interface BatchRow {
  operation_id: string
  batch_key: string
  expected_rev: number
  after_rev: number
  applied_units: number
  checksum: string
  created_at: number
}

const checkpointFrom = (row: CheckpointRow): AgentOperationCheckpoint => ({
  operationId: row.operation_id,
  chapterId: row.chapter_id,
  side: row.side,
  state: row.state,
  beforeRev: row.before_rev,
  beforeContent: row.before_content,
  lastAppliedRev: row.last_applied_rev,
  appliedUnits: row.applied_units,
  totalUnits: row.total_units,
  terminalState: row.terminal_state,
  terminalResult: row.terminal_result_json === null ? null : JSON.parse(row.terminal_result_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  terminalAt: row.terminal_at
})

const batchFrom = (row: BatchRow): AgentOperationBatch => ({
  operationId: row.operation_id,
  batchKey: row.batch_key,
  expectedRev: row.expected_rev,
  afterRev: row.after_rev,
  appliedUnits: row.applied_units,
  checksum: row.checksum,
  createdAt: row.created_at
})

function checkpointRow(db: Db, operationId: string): CheckpointRow | undefined {
  return db
    .prepare(`SELECT operation_id, chapter_id, side, state, before_rev, before_content,
      last_applied_rev, applied_units, total_units, terminal_state, terminal_result_json,
      created_at, updated_at, terminal_at
      FROM agent_operation_checkpoint WHERE operation_id = ?`)
    .get<CheckpointRow>(operationId)
}

export function prepareAgentOperation(
  db: Db,
  input: { operationId: string; chapterId: string; side: TextSide; totalUnits: number },
  now: number
): AgentOperationCheckpoint {
  return db.transaction(() => {
    const old = checkpointRow(db, input.operationId)
    if (old) {
      if (
        old.chapter_id !== input.chapterId ||
        old.side !== input.side ||
        old.total_units !== input.totalUnits
      ) {
        throw new StorageError(
          'validation',
          'ID operation đã được dùng cho target hoặc kế hoạch khác.'
        )
      }
      return checkpointFrom(old)
    }
    if (!Number.isInteger(input.totalUnits) || input.totalUnits < 0) {
      throw new StorageError('validation', 'Tổng đơn vị của operation không hợp lệ.')
    }
    const before = readText(db, input.chapterId, input.side)
    db.prepare(`INSERT INTO agent_operation_checkpoint
      (operation_id, chapter_id, side, state, before_rev, before_content, applied_units,
       total_units, created_at, updated_at)
      VALUES (?, ?, ?, 'prepared', ?, ?, 0, ?, ?, ?)`).run(
      input.operationId,
      input.chapterId,
      input.side,
      before.rev,
      before.content,
      input.totalUnits,
      now,
      now
    )
    return checkpointFrom(checkpointRow(db, input.operationId)!)
  })
}

export function readAgentOperationEvidence(
  db: Db,
  operationId: string
): AgentOperationEvidence | null {
  const checkpoint = checkpointRow(db, operationId)
  if (!checkpoint) return null
  const batches = db
    .prepare(`SELECT operation_id, batch_key, expected_rev, after_rev, applied_units, checksum, created_at
      FROM agent_operation_batch WHERE operation_id = ? ORDER BY created_at, batch_key`)
    .all<BatchRow>(operationId)
    .map(batchFrom)
  return { checkpoint: checkpointFrom(checkpoint), batches }
}

export interface ApplyAgentTranslationBatchInput {
  operationId: string
  batchKey: string
  expectedRev: number
  checksum: string
  rows: Array<{ sourceId: string; text: string }>
  by: RowAuthor
}

export function applyAgentTranslationBatch(
  db: Db,
  input: ApplyAgentTranslationBatchInput,
  now: number,
  newId: () => string
): AgentOperationBatch {
  return db.transaction(() => {
    const old = db
      .prepare(`SELECT operation_id, batch_key, expected_rev, after_rev, applied_units, checksum, created_at
        FROM agent_operation_batch WHERE operation_id = ? AND batch_key = ?`)
      .get<BatchRow>(input.operationId, input.batchKey)
    if (old) {
      if (
        old.expected_rev !== input.expectedRev ||
        old.applied_units !== input.rows.length ||
        old.checksum !== input.checksum
      ) {
        throw new StorageError('validation', 'Khóa batch đã được dùng cho nội dung khác.')
      }
      return batchFrom(old)
    }
    if (input.rows.length === 0 || input.checksum.length === 0) {
      throw new StorageError('validation', 'Batch operation phải có hàng và checksum.')
    }
    const checkpoint = checkpointRow(db, input.operationId)
    if (!checkpoint) throw new StorageError('not_found', 'Không tìm thấy checkpoint operation.')
    if (checkpoint.side !== 'target') {
      throw new StorageError('validation', 'Batch dịch chỉ được ghi vào phía bản dịch.')
    }
    if (checkpoint.state === 'terminal' || checkpoint.state === 'undone') {
      throw new StorageError('conflict', 'Operation đã kết thúc nên không thể ghi batch mới.')
    }
    const expectedFromEvidence = checkpoint.last_applied_rev ?? checkpoint.before_rev
    if (input.expectedRev !== expectedFromEvidence) {
      throw new StorageError('conflict', 'Revision batch không tiếp nối checkpoint operation.')
    }

    let rev = input.expectedRev
    for (const row of input.rows) {
      const saved = saveRow(
        db,
        {
          chapterId: checkpoint.chapter_id,
          sourceId: row.sourceId,
          text: row.text,
          expectedRev: rev,
          by: input.by
        },
        now,
        newId
      )
      rev = saved.target.rev
    }
    if (rev <= input.expectedRev) {
      throw new StorageError('validation', 'Batch không tạo thay đổi nào để ghi journal.')
    }
    db.prepare(`INSERT INTO agent_operation_batch
      (operation_id, batch_key, expected_rev, after_rev, applied_units, checksum, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      input.operationId,
      input.batchKey,
      input.expectedRev,
      rev,
      input.rows.length,
      input.checksum,
      now
    )
    db.prepare(`UPDATE agent_operation_checkpoint
      SET state = 'applied', last_applied_rev = ?, applied_units = applied_units + ?, updated_at = ?
      WHERE operation_id = ?`).run(rev, input.rows.length, now, input.operationId)
    return batchFrom(
      db
        .prepare(`SELECT operation_id, batch_key, expected_rev, after_rev, applied_units, checksum, created_at
          FROM agent_operation_batch WHERE operation_id = ? AND batch_key = ?`)
        .get<BatchRow>(input.operationId, input.batchKey)!
    )
  })
}

export function markAgentOperationTerminal(
  db: Db,
  operationId: string,
  state: AgentOperationTerminalState,
  result: unknown,
  now: number
): AgentOperationCheckpoint {
  return db.transaction(() => {
    const checkpoint = checkpointRow(db, operationId)
    if (!checkpoint) throw new StorageError('not_found', 'Không tìm thấy checkpoint operation.')
    if (checkpoint.state === 'terminal' || checkpoint.state === 'undone') {
      if (
        checkpoint.terminal_state !== state ||
        checkpoint.terminal_result_json !== JSON.stringify(result)
      ) {
        throw new StorageError('conflict', 'Operation đã có terminal evidence khác.')
      }
      return checkpointFrom(checkpoint)
    }
    const nextState = state === 'undone' ? 'undone' : 'terminal'
    db.prepare(`UPDATE agent_operation_checkpoint
      SET state = ?, terminal_state = ?, terminal_result_json = ?, updated_at = ?, terminal_at = ?
      WHERE operation_id = ?`).run(nextState, state, JSON.stringify(result), now, now, operationId)
    return checkpointFrom(checkpointRow(db, operationId)!)
  })
}

export function undoAgentOperation(
  db: Db,
  operationId: string,
  now: number,
  newId: () => string
): { checkpoint: AgentOperationCheckpoint; restoredRev: number } {
  return db.transaction(() => {
    const checkpoint = checkpointRow(db, operationId)
    if (!checkpoint) {
      throw new StorageError('not_found', 'Không tìm thấy checkpoint operation để hoàn tác.')
    }
    if (checkpoint.state === 'undone') {
      const current = readText(db, checkpoint.chapter_id, checkpoint.side)
      return { checkpoint: checkpointFrom(checkpoint), restoredRev: current.rev }
    }
    if (checkpoint.last_applied_rev === null) {
      db.prepare(`UPDATE agent_operation_checkpoint
        SET state = 'undone', terminal_state = 'undone', updated_at = ?, terminal_at = ?
        WHERE operation_id = ?`).run(now, now, operationId)
      return {
        checkpoint: checkpointFrom(checkpointRow(db, operationId)!),
        restoredRev: checkpoint.before_rev
      }
    }
    const current = readText(db, checkpoint.chapter_id, checkpoint.side)
    if (current.rev !== checkpoint.last_applied_rev) {
      throw new StorageError(
        'conflict',
        'Bản dịch đã được chỉnh sửa sau operation; không thể hoàn tác tự động.'
      )
    }
    const segments = segment(checkpoint.before_content, 'vi')
    const saved = saveText(
      db,
      {
        chapterId: checkpoint.chapter_id,
        side: checkpoint.side,
        content: checkpoint.before_content,
        expectedRev: current.rev,
        segments
      },
      now,
      newId
    )
    db.prepare(`UPDATE agent_operation_checkpoint
      SET state = 'undone', terminal_state = 'undone', updated_at = ?, terminal_at = ?
      WHERE operation_id = ?`).run(now, now, operationId)
    return { checkpoint: checkpointFrom(checkpointRow(db, operationId)!), restoredRev: saved.rev }
  })
}

/** What undoing a chain of operations on one chapter side did, or would do on a dry run. */
export interface AgentUndoChainResult {
  /** Operations undone (or undoable), newest first. */
  undone: string[]
  /** The newest operation that could not be undone because the text changed after it. */
  conflict: { operationId: string; message: string } | null
  /** Revision of the text after the undo; the current one on a dry run or when nothing changed. */
  restoredRev: number
}

/**
 * Undoes several operations that wrote one chapter side, newest first. Undoing them one at a time
 * would fail the revision guard from the second one on, because each undo writes a new revision; so
 * the chain is walked back from the current text while every operation starts where the next one
 * ended, and the text of the oldest operation reached is restored once. Where the user changed the
 * text between two operations the walk stops: the older ones stay as they are and the first of them
 * is reported as the conflict. `dryRun` reports the same without writing.
 */
export function undoAgentOperationChain(
  db: Db,
  operationIds: string[],
  now: number,
  newId: () => string,
  options: { dryRun?: boolean } = {}
): AgentUndoChainResult {
  return db.transaction(() => {
    const rows = operationIds
      .map((id) => checkpointRow(db, id))
      .filter((row): row is CheckpointRow => row !== undefined && row.state !== 'undone')
      .sort((a, b) => a.created_at - b.created_at || a.before_rev - b.before_rev)
    if (rows.length === 0) return { undone: [], conflict: null, restoredRev: 0 }
    const sides = new Set(rows.map((row) => `${row.chapter_id}:${row.side}`))
    if (sides.size > 1) {
      throw new StorageError('validation', 'Chuỗi hoàn tác phải cùng một chương và một bản.')
    }
    const { chapter_id: chapterId, side } = rows[0]!
    const current = readText(db, chapterId, side)

    // Operations that never wrote anything are undone without touching the text.
    const unapplied = rows.filter((row) => row.last_applied_rev === null)
    const applied = rows.filter((row) => row.last_applied_rev !== null).reverse()
    const reached: CheckpointRow[] = []
    let expected = current.rev
    let conflict: AgentUndoChainResult['conflict'] = null
    for (const row of applied) {
      if (row.last_applied_rev !== expected) {
        conflict = {
          operationId: row.operation_id,
          message: 'Bản dịch đã được chỉnh sửa sau operation; không thể hoàn tác tự động.'
        }
        break
      }
      reached.push(row)
      expected = row.before_rev
    }
    const undone = [...reached, ...unapplied].map((row) => row.operation_id)
    if (options.dryRun) return { undone, conflict, restoredRev: current.rev }

    let restoredRev = current.rev
    const oldest = reached.at(-1)
    if (oldest) {
      restoredRev = saveText(
        db,
        {
          chapterId,
          side,
          content: oldest.before_content,
          expectedRev: current.rev,
          segments: segment(oldest.before_content, 'vi')
        },
        now,
        newId
      ).rev
    }
    const mark = db.prepare(`UPDATE agent_operation_checkpoint
      SET state = 'undone', terminal_state = 'undone', updated_at = ?, terminal_at = ?
      WHERE operation_id = ?`)
    for (const id of undone) mark.run(now, now, id)
    return { undone, conflict, restoredRev }
  })
}
