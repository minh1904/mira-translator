import type {
  AgentTaskBudget,
  AgentTaskItemState,
  AgentTaskItemView,
  AgentTaskProgress,
  AgentTaskReason,
  AgentTaskState,
  AgentTaskSteeringState,
  AgentTaskSteeringView,
  AgentTaskView,
  SteeringContextRef
} from '../../../shared/contracts/agentTask'
import {
  canTransitionItem,
  canTransitionTask,
  ITEM_STATES_WITH_REASON,
  TASK_STATES_WITH_REASON
} from '../../../shared/contracts/agentTask'
import type { ModelRef } from '../../../shared/contracts/aiPreferences'
import type { TokenUsage } from '../../../shared/contracts/usage'
import { StorageError } from './errors'
import type { Db } from './sqlite'

interface TaskRow {
  id: string
  kind: 'translate_chapters'
  work_id: string
  origin_turn_id: string | null
  source_task_id: string | null
  client_command_id: string
  payload_digest: string
  state: AgentTaskState
  reason: AgentTaskReason | null
  model_ref_json: string
  overwrite_policy: 'fill_untranslated'
  options_json: string
  budget_json: string
  state_version: number
  created_at: number
  updated_at: number
}

interface ItemRow {
  id: string
  task_id: string
  ordinal: number
  chapter_id: string
  state: AgentTaskItemState
  reason: AgentTaskReason | null
  run_key: string | null
  source_rev: number | null
  expected_target_rev: number | null
  skipped_segments_json: string
  progress_json: string
  context_changed: number
  state_version: number
  created_at: number
  updated_at: number
}

interface SteeringRow {
  id: string
  task_id: string
  payload_digest: string
  requested_chapter_id: string
  resolved_from_item_id: string
  kind: 'instruction' | 'context_ref'
  instruction_text: string | null
  context_ref_json: string | null
  state: AgentTaskSteeringState
  created_at: number
  updated_at: number
}

const steeringFrom = (row: SteeringRow): AgentTaskSteeringView => ({
  id: row.id,
  taskId: row.task_id,
  requestedChapterId: row.requested_chapter_id,
  resolvedFromItemId: row.resolved_from_item_id,
  kind: row.kind,
  instructionText: row.instruction_text,
  contextRef: row.context_ref_json
    ? (JSON.parse(row.context_ref_json) as SteeringContextRef)
    : null,
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const taskFrom = (row: TaskRow): AgentTaskView => ({
  id: row.id,
  kind: row.kind,
  workId: row.work_id,
  originTurnId: row.origin_turn_id,
  sourceTaskId: row.source_task_id,
  state: row.state,
  reason: row.reason,
  model: JSON.parse(row.model_ref_json),
  overwritePolicy: row.overwrite_policy,
  options: JSON.parse(row.options_json),
  budget: JSON.parse(row.budget_json),
  stateVersion: row.state_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const itemFrom = (row: ItemRow): AgentTaskItemView => {
  const progress = JSON.parse(row.progress_json) as Partial<AgentTaskProgress>
  return {
    id: row.id,
    taskId: row.task_id,
    ordinal: row.ordinal,
    chapterId: row.chapter_id,
    state: row.state,
    reason: row.reason,
    runKey: row.run_key,
    sourceRev: row.source_rev,
    expectedTargetRev: row.expected_target_rev,
    skippedSegments: JSON.parse(row.skipped_segments_json),
    progress: progress.total === undefined ? null : (progress as AgentTaskProgress),
    contextChanged: row.context_changed === 1,
    stateVersion: row.state_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const stale = () =>
  new StorageError('conflict', 'Tác vụ đã đổi trạng thái; hãy tải lại rồi thử lại.')

export interface CreateTaskInput {
  id: string
  workId: string
  originTurnId?: string
  sourceTaskId?: string
  clientCommandId: string
  payloadDigest: string
  model: ModelRef & { settingsKey: string }
  options?: Record<string, unknown>
  budget?: AgentTaskBudget
  chapterIds: string[]
  newId: () => string
  now: number
}

export interface ItemPatch {
  runKey?: string
  sourceRev?: number
  expectedTargetRev?: number
  skippedSegments?: string[]
  progress?: AgentTaskProgress
  contextChanged?: boolean
}

/**
 * Durable tasks in `library.db`. Every state change is a compare-and-set on `state_version`: the row
 * changes only if nobody changed it since the caller read it, so two windows pressing Pause at once
 * change it once. The transition tables live in `shared/contracts/agentTask.ts`.
 */
export class AgentTaskRepository {
  constructor(private readonly db: Db) {}

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)
  }

  /** Task and every item in one transaction; the same command returns the task it created. */
  createTask(input: CreateTaskInput): { task: AgentTaskView; created: boolean } {
    return this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM agent_task WHERE client_command_id = ?')
        .get<TaskRow>(input.clientCommandId)
      if (existing) {
        if (existing.payload_digest !== input.payloadDigest) {
          throw new StorageError('conflict', 'Mã lệnh đã được dùng với nội dung khác.')
        }
        return { task: taskFrom(existing), created: false }
      }
      if (input.chapterIds.length === 0) {
        throw new StorageError('validation', 'Tác vụ cần ít nhất một chương.')
      }
      this.db
        .prepare(
          `INSERT INTO agent_task (id, kind, work_id, origin_turn_id, source_task_id, client_command_id,
             payload_digest, state, model_ref_json, overwrite_policy, options_json, budget_json,
             created_at, updated_at)
           VALUES (?, 'translate_chapters', ?, ?, ?, ?, ?, 'queued', ?, 'fill_untranslated', ?, ?, ?, ?)`
        )
        .run(
          input.id,
          input.workId,
          input.originTurnId ?? null,
          input.sourceTaskId ?? null,
          input.clientCommandId,
          input.payloadDigest,
          JSON.stringify(input.model),
          JSON.stringify(input.options ?? {}),
          JSON.stringify(input.budget ?? {}),
          input.now,
          input.now
        )
      const insert = this.db.prepare(
        `INSERT INTO agent_task_item (id, task_id, ordinal, chapter_id, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', ?, ?)`
      )
      input.chapterIds.forEach((chapterId, index) =>
        insert.run(input.newId(), input.id, index + 1, chapterId, input.now, input.now)
      )
      return { task: this.getTask(input.id)!, created: true }
    })
  }

  getTask(id: string): AgentTaskView | null {
    const row = this.db.prepare('SELECT * FROM agent_task WHERE id = ?').get<TaskRow>(id)
    return row ? taskFrom(row) : null
  }

  /** Newest first, as the Tasks screen lists them. */
  listTasks(filter: { workId?: string } = {}): AgentTaskView[] {
    const rows =
      filter.workId === undefined
        ? this.db
            .prepare('SELECT * FROM agent_task ORDER BY created_at DESC, id DESC')
            .all<TaskRow>()
        : this.db
            .prepare('SELECT * FROM agent_task WHERE work_id = ? ORDER BY created_at DESC, id DESC')
            .all<TaskRow>(filter.workId)
    return rows.map(taskFrom)
  }

  listTasksIn(states: readonly AgentTaskState[]): AgentTaskView[] {
    return this.db
      .prepare(
        `SELECT * FROM agent_task WHERE state IN (${states.map(() => '?').join(', ')})
         ORDER BY created_at, id`
      )
      .all<TaskRow>(...states)
      .map(taskFrom)
  }

  getItem(id: string): AgentTaskItemView | null {
    const row = this.db.prepare('SELECT * FROM agent_task_item WHERE id = ?').get<ItemRow>(id)
    return row ? itemFrom(row) : null
  }

  listItems(taskId: string): AgentTaskItemView[] {
    return this.db
      .prepare('SELECT * FROM agent_task_item WHERE task_id = ? ORDER BY ordinal')
      .all<ItemRow>(taskId)
      .map(itemFrom)
  }

  /**
   * Every item the scheduler may start, with its task's model, by `(task.created_at, task.id, item.ordinal)`;
   * the scheduler picks among them (`pickNextItem`).
   */
  queuedItems(): Array<AgentTaskItemView & ModelRef> {
    return this.db
      .prepare(
        `SELECT i.*, t.model_ref_json FROM agent_task_item i JOIN agent_task t ON t.id = i.task_id
         WHERE t.state IN ('queued', 'running') AND i.state = 'queued'
         ORDER BY t.created_at, t.id, i.ordinal`
      )
      .all<ItemRow & { model_ref_json: string }>()
      .map((row) => {
        const { connectionId, entryId } = JSON.parse(row.model_ref_json) as ModelRef
        return { ...itemFrom(row), connectionId, entryId }
      })
  }

  runningItems(): AgentTaskItemView[] {
    return this.db
      .prepare("SELECT * FROM agent_task_item WHERE state = 'running'")
      .all<ItemRow>()
      .map(itemFrom)
  }

  transitionTask(
    id: string,
    to: AgentTaskState,
    options: { now: number; reason?: AgentTaskReason | null; expectedVersion?: number }
  ): AgentTaskView {
    return this.db.transaction(() => {
      const current = this.getTask(id)
      if (!current) throw new StorageError('not_found', 'Không tìm thấy tác vụ.')
      if (
        options.expectedVersion !== undefined &&
        options.expectedVersion !== current.stateVersion
      ) {
        throw stale()
      }
      const reason = options.reason ?? null
      if (!canTransitionTask(current.state, to)) {
        throw new StorageError(
          'conflict',
          `Không thể chuyển tác vụ từ ${current.state} sang ${to}.`
        )
      }
      if (TASK_STATES_WITH_REASON.includes(to) !== (reason !== null)) {
        throw new StorageError('validation', `Trạng thái ${to} ${reason ? 'không' : ''} cần lý do.`)
      }
      const changed = this.db
        .prepare(
          `UPDATE agent_task SET state = ?, reason = ?, state_version = state_version + 1, updated_at = ?
           WHERE id = ? AND state_version = ?`
        )
        .run(to, reason, options.now, id, current.stateVersion)
      if (changed.changes === 0) throw stale()
      return this.getTask(id)!
    })
  }

  transitionItem(
    id: string,
    to: AgentTaskItemState,
    options: { now: number; reason?: AgentTaskReason | null; patch?: ItemPatch }
  ): AgentTaskItemView {
    return this.db.transaction(() => {
      const current = this.getItem(id)
      if (!current) throw new StorageError('not_found', 'Không tìm thấy mục tác vụ.')
      const reason = options.reason ?? null
      if (current.state !== to && !canTransitionItem(current.state, to, current.reason)) {
        throw new StorageError(
          'conflict',
          `Không thể chuyển mục tác vụ từ ${current.state} sang ${to}.`
        )
      }
      if (ITEM_STATES_WITH_REASON.includes(to) !== (reason !== null)) {
        throw new StorageError(
          'validation',
          `Trạng thái mục ${to} ${reason ? 'không' : ''} cần lý do.`
        )
      }
      const patch = options.patch ?? {}
      const changed = this.db
        .prepare(
          `UPDATE agent_task_item SET state = ?, reason = ?, run_key = ?, source_rev = ?,
             expected_target_rev = ?, skipped_segments_json = ?, progress_json = ?, context_changed = ?,
             state_version = state_version + 1, updated_at = ?
           WHERE id = ? AND state_version = ?`
        )
        .run(
          to,
          reason,
          patch.runKey ?? current.runKey,
          patch.sourceRev ?? current.sourceRev,
          patch.expectedTargetRev ?? current.expectedTargetRev,
          JSON.stringify(patch.skippedSegments ?? current.skippedSegments),
          JSON.stringify(patch.progress ?? current.progress ?? {}),
          (patch.contextChanged ?? current.contextChanged) ? 1 : 0,
          options.now,
          id,
          current.stateVersion
        )
      if (changed.changes === 0) throw stale()
      return this.getItem(id)!
    })
  }

  /** Records progress of the running item without changing its state. */
  updateItemProgress(id: string, progress: AgentTaskProgress, now: number): void {
    this.db
      .prepare(
        `UPDATE agent_task_item SET progress_json = ?, state_version = state_version + 1, updated_at = ?
         WHERE id = ?`
      )
      .run(JSON.stringify(progress), now, id)
  }

  /** One attempt per run of an item; the number is metadata only. */
  addAttempt(itemId: string, operationId: string, now: number): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(attempt), 0) AS last FROM agent_task_attempt WHERE item_id = ?')
      .get<{ last: number }>(itemId)
    const attempt = (row?.last ?? 0) + 1
    this.db
      .prepare(
        'INSERT INTO agent_task_attempt (item_id, attempt, operation_id, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(itemId, attempt, operationId, now)
    return attempt
  }

  /** Operations of the item's runs, oldest first. */
  attemptOperationIds(itemId: string): string[] {
    return this.db
      .prepare('SELECT operation_id FROM agent_task_attempt WHERE item_id = ? ORDER BY attempt')
      .all<{ operation_id: string }>(itemId)
      .map((row) => row.operation_id)
  }

  latestOperationId(itemId: string): string | null {
    return this.attemptOperationIds(itemId).at(-1) ?? null
  }

  // -------------------------------------------------------------------------------------------------
  // Steering

  getSteeringByCommand(
    clientCommandId: string
  ): (AgentTaskSteeringView & { digest: string }) | null {
    const row = this.db
      .prepare('SELECT * FROM agent_task_steering WHERE client_command_id = ?')
      .get<SteeringRow>(clientCommandId)
    return row ? { ...steeringFrom(row), digest: row.payload_digest } : null
  }

  /** The task's steering in the order it was accepted. */
  listSteerings(taskId: string): AgentTaskSteeringView[] {
    return this.db
      .prepare('SELECT * FROM agent_task_steering WHERE task_id = ? ORDER BY created_at, rowid')
      .all<SteeringRow>(taskId)
      .map(steeringFrom)
  }

  createSteering(input: {
    id: string
    taskId: string
    clientCommandId: string
    digest: string
    requestedChapterId: string
    resolvedFromItemId: string
    kind: 'instruction' | 'context_ref'
    instructionText?: string
    contextRef?: SteeringContextRef
    now: number
  }): AgentTaskSteeringView {
    this.db
      .prepare(
        `INSERT INTO agent_task_steering (id, task_id, client_command_id, payload_digest,
           requested_chapter_id, resolved_from_item_id, kind, instruction_text, context_ref_json,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.taskId,
        input.clientCommandId,
        input.digest,
        input.requestedChapterId,
        input.resolvedFromItemId,
        input.kind,
        input.instructionText ?? null,
        input.contextRef ? JSON.stringify(input.contextRef) : null,
        input.now,
        input.now
      )
    return steeringFrom(
      this.db.prepare('SELECT * FROM agent_task_steering WHERE id = ?').get<SteeringRow>(input.id)!
    )
  }

  /** `accepted → applied | superseded`; anything else is a programming error. */
  settleSteering(id: string, state: 'applied' | 'superseded', now: number): void {
    const changed = this.db
      .prepare(
        "UPDATE agent_task_steering SET state = ?, updated_at = ? WHERE id = ? AND state = 'accepted'"
      )
      .run(state, now, id).changes
    if (changed !== 1)
      throw new StorageError('conflict', 'Steering không còn ở trạng thái chờ áp dụng.')
  }

  /** Every operation of the task's items (runs and term extraction), oldest first. */
  operationIds(taskId: string): string[] {
    return this.db
      .prepare(
        `SELECT o.id FROM agent_operation o JOIN agent_task_item i ON i.id = o.task_item_id
         WHERE i.task_id = ? ORDER BY o.created_at, o.id`
      )
      .all<{ id: string }>(taskId)
      .map((row) => row.id)
  }

  /** Reported usage of every operation of the task's items; summed by the caller. */
  taskUsages(taskId: string): Array<TokenUsage | null> {
    return this.db
      .prepare(
        `SELECT o.usage_json FROM agent_operation o JOIN agent_task_item i ON i.id = o.task_item_id
         WHERE i.task_id = ? ORDER BY o.created_at`
      )
      .all<{ usage_json: string | null }>(taskId)
      .map((row) => (row.usage_json ? (JSON.parse(row.usage_json) as TokenUsage) : null))
  }
}
