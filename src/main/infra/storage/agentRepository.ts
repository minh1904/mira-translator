import type {
  AgentActivity,
  AgentActivityState,
  AgentChatMode,
  AgentContext,
  AgentOperation,
  AgentOperationState,
  AgentPermissionLevel,
  AgentProgress,
  AgentToolApproval,
  AgentTurnState,
  ResolvedTarget
} from '../../../shared/contracts/agent'
import {
  canTransitionActivity,
  canTransitionOperation,
  canTransitionTurn
} from '../../../shared/contracts/agent'
import type { ModelRef } from '../../../shared/contracts/aiPreferences'
import type { TokenUsage } from '../../../shared/contracts/usage'
import { StorageError } from './errors'
import type { Db } from './sqlite'

export interface AgentSession {
  id: string
  title: string
  permissionLevel: AgentPermissionLevel
  createdAt: number
  updatedAt: number
}

export interface AgentLegacyRef {
  workId: string
  sessionId: string
  turnId: string
}

export interface AgentTurn {
  id: string
  sessionId: string
  instruction: string
  answer: string
  reasoning: string
  context: AgentContext
  mode: AgentChatMode
  permissionLevel: AgentPermissionLevel
  status: AgentTurnState
  usage: TokenUsage | null
  costUsd: number | null
  legacyRef: AgentLegacyRef | null
  clientCommandId: string | null
  payloadDigest: string | null
  createdAt: number
  updatedAt: number
}

interface SessionRow {
  id: string
  title: string
  permission_level: AgentPermissionLevel
  created_at: number
  updated_at: number
}

interface TurnRow {
  id: string
  session_id: string
  instruction: string
  answer: string
  reasoning: string
  context_json: string
  mode: AgentChatMode
  permission_level: AgentPermissionLevel
  status: AgentTurnState
  usage_json: string | null
  cost_usd: number | null
  legacy_ref_json: string | null
  client_command_id: string | null
  payload_digest: string | null
  created_at: number
  updated_at: number
}

interface OperationRow {
  id: string
  turn_id: string | null
  task_item_id: string | null
  command_id: string
  capability: string
  target_json: string
  state: AgentOperationState
  progress_json: string | null
  model_ref_json: string | null
  usage_json: string | null
  result_json: string | null
  error_json: string | null
  created_at: number
  updated_at: number
}

interface ActivityRow {
  id: string
  turn_id: string
  operation_id: string | null
  step_seq: number
  kind: AgentActivity['kind']
  state: AgentActivityState
  label: string
  detail_json: string | null
  created_at: number
  updated_at: number
}

export type AgentToolDecision = 'allow' | 'deny' | 'needs_user'
export type AgentToolCallState = 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired'

export interface AgentToolCall {
  id: string
  turnId: string
  round: number
  callId: string
  name: string
  args: unknown
  /** Provider data sent back with the call next round (Gemini's `thought_signature`). */
  extra?: unknown
  argsDigest: string
  decision: AgentToolDecision
  /** Vì sao call `needs_user` được chạy hoặc bị Autopilot bỏ qua; `null` khi chưa ai duyệt. */
  approval: AgentToolApproval | null
  state: AgentToolCallState
  result: unknown | null
  createdAt: number
}

interface ToolCallRow {
  id: string
  turn_id: string
  round: number
  call_id: string
  name: string
  args_json: string
  extra_json: string | null
  args_digest: string
  decision: AgentToolDecision
  approval: AgentToolApproval | null
  state: AgentToolCallState
  result_json: string | null
  created_at: number
}

const TOOL_CALL_COLUMNS = `id, turn_id, round, call_id, name, args_json, args_digest, decision, state,
  result_json, created_at, extra_json, approval`

const SESSION_COLUMNS = 'id, title, permission_level, created_at, updated_at'

const TURN_COLUMNS = `id, session_id, instruction, answer, reasoning, context_json, mode, permission_level,
  status, usage_json, cost_usd, legacy_ref_json, client_command_id, payload_digest, created_at, updated_at`

const toolCallFrom = (row: ToolCallRow): AgentToolCall => ({
  id: row.id,
  turnId: row.turn_id,
  round: row.round,
  callId: row.call_id,
  name: row.name,
  args: JSON.parse(row.args_json),
  ...(row.extra_json ? { extra: JSON.parse(row.extra_json) } : {}),
  argsDigest: row.args_digest,
  decision: row.decision,
  approval: row.approval,
  state: row.state,
  result: row.result_json ? JSON.parse(row.result_json) : null,
  createdAt: row.created_at
})

const sessionFrom = (row: SessionRow): AgentSession => ({
  id: row.id,
  title: row.title,
  permissionLevel: row.permission_level,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const turnFrom = (row: TurnRow): AgentTurn => ({
  id: row.id,
  sessionId: row.session_id,
  instruction: row.instruction,
  answer: row.answer,
  reasoning: row.reasoning,
  context: JSON.parse(row.context_json || '{}'),
  mode: row.mode,
  permissionLevel: row.permission_level,
  status: row.status,
  usage: row.usage_json ? JSON.parse(row.usage_json) : null,
  costUsd: row.cost_usd,
  legacyRef: row.legacy_ref_json ? JSON.parse(row.legacy_ref_json) : null,
  clientCommandId: row.client_command_id,
  payloadDigest: row.payload_digest,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const operationFrom = (row: OperationRow): AgentOperation => ({
  id: row.id,
  turnId: row.turn_id,
  taskItemId: row.task_item_id,
  commandId: row.command_id,
  capability: row.capability,
  target: JSON.parse(row.target_json),
  state: row.state,
  progress: row.progress_json ? JSON.parse(row.progress_json) : null,
  model: row.model_ref_json ? JSON.parse(row.model_ref_json) : null,
  usage: row.usage_json ? JSON.parse(row.usage_json) : null,
  result: row.result_json ? JSON.parse(row.result_json) : null,
  error: row.error_json ? JSON.parse(row.error_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const activityFrom = (row: ActivityRow): AgentActivity => ({
  id: row.id,
  turnId: row.turn_id,
  operationId: row.operation_id,
  stepSeq: row.step_seq,
  kind: row.kind,
  state: row.state,
  label: row.label,
  detail: row.detail_json ? JSON.parse(row.detail_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export class AgentRepository {
  constructor(private readonly db: Db) {}

  createSession(input: { id: string; title?: string; now: number }): AgentSession {
    this.db
      .prepare('INSERT INTO agent_session (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(input.id, input.title ?? '', input.now, input.now)
    return this.getSession(input.id)!
  }

  getSession(id: string): AgentSession | null {
    const row = this.db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM agent_session WHERE id = ?`)
      .get<SessionRow>(id)
    return row ? sessionFrom(row) : null
  }

  listSessions(): AgentSession[] {
    return this.db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM agent_session ORDER BY updated_at DESC, id`)
      .all<SessionRow>()
      .map(sessionFrom)
  }

  setSessionPermissionLevel(id: string, level: AgentPermissionLevel, now: number): AgentSession {
    const changed = this.db
      .prepare('UPDATE agent_session SET permission_level = ?, updated_at = ? WHERE id = ?')
      .run(level, now, id)
    if (changed.changes === 0) throw new StorageError('not_found', 'Không tìm thấy phiên agent.')
    return this.getSession(id)!
  }

  addSessionApproval(sessionId: string, capability: string, now: number): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_session_approval (session_id, capability, created_at)
         VALUES (?, ?, ?)`
      )
      .run(sessionId, capability, now)
  }

  listSessionApprovals(sessionId: string): string[] {
    return this.db
      .prepare(
        `SELECT capability FROM agent_session_approval WHERE session_id = ?
         ORDER BY created_at, capability`
      )
      .all<{ capability: string }>(sessionId)
      .map((row) => row.capability)
  }

  createTurn(input: {
    id: string
    sessionId: string
    instruction: string
    context: AgentContext
    mode?: AgentChatMode
    permissionLevel?: AgentPermissionLevel
    now: number
    legacyRef?: AgentLegacyRef
    clientCommandId?: string
    payloadDigest?: string
  }): AgentTurn {
    const active = this.db
      .prepare(
        "SELECT id FROM agent_turn WHERE session_id = ? AND status IN ('queued', 'running', 'waiting_user')"
      )
      .get<{ id: string }>(input.sessionId)
    if (active) {
      throw new StorageError('conflict', 'Đã có lượt đang chạy hoặc chờ trong cùng phiên.')
    }

    try {
      this.db
        .prepare(
          `INSERT INTO agent_turn
            (id, session_id, instruction, answer, reasoning, context_json, mode, permission_level,
             status, legacy_ref_json, client_command_id, payload_digest, created_at, updated_at)
           VALUES (?, ?, ?, '', '', ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`
        )
        .run(
          input.id,
          input.sessionId,
          input.instruction,
          JSON.stringify(input.context ?? {}),
          input.mode ?? 'agent',
          input.permissionLevel ?? 'default',
          input.legacyRef ? JSON.stringify(input.legacyRef) : null,
          input.clientCommandId ?? null,
          input.payloadDigest ?? null,
          input.now,
          input.now
        )
    } catch (error) {
      if (error instanceof Error && error.message.includes('agent_turn_one_active')) {
        throw new StorageError('conflict', 'Đã có lượt đang chạy hoặc chờ trong cùng phiên.')
      }
      throw error
    }

    this.db
      .prepare('UPDATE agent_session SET updated_at = ? WHERE id = ?')
      .run(input.now, input.sessionId)
    return this.getTurn(input.id)!
  }

  getTurn(id: string): AgentTurn | null {
    const row = this.db
      .prepare(
        `SELECT ${TURN_COLUMNS}
         FROM agent_turn WHERE id = ?`
      )
      .get<TurnRow>(id)
    return row ? turnFrom(row) : null
  }

  listTurns(sessionId: string): AgentTurn[] {
    return this.db
      .prepare(
        `SELECT ${TURN_COLUMNS}
         FROM agent_turn WHERE session_id = ? ORDER BY created_at ASC, id ASC`
      )
      .all<TurnRow>(sessionId)
      .map(turnFrom)
  }

  listUnsettledTurns(): AgentTurn[] {
    return this.db
      .prepare(
        `SELECT ${TURN_COLUMNS}
         FROM agent_turn WHERE status IN ('queued', 'running') ORDER BY created_at ASC, id ASC`
      )
      .all<TurnRow>()
      .map(turnFrom)
  }

  findTurnByClientCommandId(clientCommandId: string): AgentTurn | null {
    const row = this.db
      .prepare(
        `SELECT ${TURN_COLUMNS}
         FROM agent_turn WHERE client_command_id = ?`
      )
      .get<TurnRow>(clientCommandId)
    return row ? turnFrom(row) : null
  }

  acceptTurn(input: {
    id: string
    sessionId: string
    clientCommandId: string
    payloadDigest: string
    instruction: string
    context: AgentContext
    mode?: AgentChatMode
    now: number
  }): { turn: AgentTurn; created: boolean } {
    return this.db.transaction(() => {
      const existing = this.findTurnByClientCommandId(input.clientCommandId)
      if (existing) {
        if (existing.payloadDigest !== input.payloadDigest) {
          throw new StorageError('conflict', 'Mã lệnh đã được dùng với nội dung khác.')
        }
        return { turn: existing, created: false }
      }
      // A new command, not an answer, ends the turn that waits for the user (D7).
      const waiting = this.db
        .prepare("SELECT id FROM agent_turn WHERE session_id = ? AND status = 'waiting_user'")
        .get<{ id: string }>(input.sessionId)
      if (waiting) this.settleWaitingTurn(waiting.id, 'expired', input.now)
      return {
        turn: this.createTurn({
          id: input.id,
          sessionId: input.sessionId,
          clientCommandId: input.clientCommandId,
          payloadDigest: input.payloadDigest,
          instruction: input.instruction,
          context: input.context,
          mode: input.mode,
          // The turn keeps the level its session had when it was accepted.
          permissionLevel: this.getSession(input.sessionId)?.permissionLevel,
          now: input.now
        }),
        created: true
      }
    })
  }

  transitionTurn(
    id: string,
    status: AgentTurnState,
    now: number,
    updates?: {
      answer?: string
      reasoning?: string
      usage?: TokenUsage | null
      costUsd?: number | null
    }
  ): AgentTurn {
    const current = this.getTurn(id)
    if (!current) throw new StorageError('not_found', 'Không tìm thấy lượt agent.')
    if (!canTransitionTurn(current.status, status)) {
      throw new StorageError(
        'conflict',
        `Không thể chuyển trạng thái lượt từ ${current.status} sang ${status}.`
      )
    }

    const answer = updates?.answer !== undefined ? updates.answer : current.answer
    const reasoning = updates?.reasoning !== undefined ? updates.reasoning : current.reasoning
    const usage = updates?.usage !== undefined ? updates.usage : current.usage
    const costUsd = updates?.costUsd !== undefined ? updates.costUsd : current.costUsd

    this.db
      .prepare(
        `UPDATE agent_turn
         SET status = ?, answer = ?, reasoning = ?, usage_json = ?, cost_usd = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(status, answer, reasoning, usage ? JSON.stringify(usage) : null, costUsd, now, id)

    this.db
      .prepare('UPDATE agent_session SET updated_at = ? WHERE id = ?')
      .run(now, current.sessionId)

    return this.getTurn(id)!
  }

  createOperation(input: {
    id: string
    /** Exactly one owner: a chat turn or a task item (CHECK of library v12). */
    turnId?: string
    taskItemId?: string
    commandId: string
    capability: string
    target: ResolvedTarget
    now: number
    model?: ModelRef & { settingsKey?: string }
  }): AgentOperation {
    const existing = this.db
      .prepare('SELECT id FROM agent_operation WHERE command_id = ?')
      .get<{ id: string }>(input.commandId)
    if (existing) {
      return this.getOperation(existing.id)!
    }

    this.db
      .prepare(
        `INSERT INTO agent_operation
          (id, turn_id, task_item_id, command_id, capability, target_json, state, model_ref_json,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
      )
      .run(
        input.id,
        input.turnId ?? null,
        input.taskItemId ?? null,
        input.commandId,
        input.capability,
        JSON.stringify(input.target),
        input.model ? JSON.stringify(input.model) : null,
        input.now,
        input.now
      )

    return this.getOperation(input.id)!
  }

  getOperation(id: string): AgentOperation | null {
    const row = this.db
      .prepare(
        `SELECT id, turn_id, task_item_id, command_id, capability, target_json, state, progress_json,
                model_ref_json, usage_json, result_json, error_json, created_at, updated_at
         FROM agent_operation WHERE id = ?`
      )
      .get<OperationRow>(id)
    return row ? operationFrom(row) : null
  }

  listOperations(turnId: string): AgentOperation[] {
    return this.db
      .prepare(
        `SELECT id, turn_id, task_item_id, command_id, capability, target_json, state, progress_json,
                model_ref_json, usage_json, result_json, error_json, created_at, updated_at
         FROM agent_operation WHERE turn_id = ? ORDER BY created_at ASC, id ASC`
      )
      .all<OperationRow>(turnId)
      .map(operationFrom)
  }

  /** The latest operations of chats and tasks alike, newest change first: the AI log. */
  listRecentOperations(limit: number): AgentOperation[] {
    return this.db
      .prepare(
        `SELECT id, turn_id, task_item_id, command_id, capability, target_json, state, progress_json,
                model_ref_json, usage_json, result_json, error_json, created_at, updated_at
         FROM agent_operation ORDER BY updated_at DESC, id DESC LIMIT ?`
      )
      .all<OperationRow>(limit)
      .map(operationFrom)
  }

  listUnsettledOperations(): AgentOperation[] {
    return this.db
      .prepare(
        `SELECT id, turn_id, task_item_id, command_id, capability, target_json, state, progress_json,
                model_ref_json, usage_json, result_json, error_json, created_at, updated_at
         FROM agent_operation WHERE state IN ('queued', 'running') ORDER BY created_at ASC, id ASC`
      )
      .all<OperationRow>()
      .map(operationFrom)
  }

  transitionOperation(
    id: string,
    state: AgentOperationState,
    options: {
      now: number
      progress?: AgentProgress
      result?: unknown
      error?: unknown
      hasChanges?: boolean
      usage?: TokenUsage | null
    }
  ): AgentOperation {
    const current = this.getOperation(id)
    if (!current) throw new StorageError('not_found', 'Không tìm thấy operation.')
    if (
      current.state !== state &&
      !canTransitionOperation(current.state, state, options.hasChanges ?? false)
    ) {
      throw new StorageError(
        'conflict',
        `Không thể chuyển trạng thái operation từ ${current.state} sang ${state}.`
      )
    }

    const progress = options.progress !== undefined ? options.progress : current.progress
    const result = options.result !== undefined ? options.result : current.result
    const error = options.error !== undefined ? options.error : current.error
    const usage = options.usage !== undefined ? options.usage : current.usage

    this.db
      .prepare(
        `UPDATE agent_operation
         SET state = ?, progress_json = ?, usage_json = ?, result_json = ?, error_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        state,
        progress ? JSON.stringify(progress) : null,
        usage ? JSON.stringify(usage) : null,
        result ? JSON.stringify(result) : null,
        error ? JSON.stringify(error) : null,
        options.now,
        id
      )

    return this.getOperation(id)!
  }

  putActivity(input: {
    id: string
    turnId: string
    operationId: string | null
    stepSeq: number
    kind: AgentActivity['kind']
    state: AgentActivityState
    label: string
    detail: unknown
    now: number
  }): AgentActivity {
    const existing = this.db
      .prepare(
        `SELECT id, turn_id, operation_id, step_seq, kind, state, label, detail_json, created_at, updated_at
         FROM agent_activity WHERE turn_id = ? AND step_seq = ?`
      )
      .get<ActivityRow>(input.turnId, input.stepSeq)

    if (existing) {
      if (existing.id !== input.id) {
        throw new StorageError(
          'conflict',
          `Bước ${input.stepSeq} đã có activity ${existing.id}, không thể ghi đè bằng ${input.id}.`
        )
      }
      if (!canTransitionActivity(existing.state, input.state) && existing.state !== input.state) {
        throw new StorageError(
          'conflict',
          `Không thể chuyển trạng thái activity từ ${existing.state} sang ${input.state}.`
        )
      }
      this.db
        .prepare(
          `UPDATE agent_activity
           SET operation_id = ?, kind = ?, state = ?, label = ?, detail_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.operationId,
          input.kind,
          input.state,
          input.label,
          input.detail ? JSON.stringify(input.detail) : null,
          input.now,
          input.id
        )
      return this.getActivity(input.id)!
    }

    this.db
      .prepare(
        `INSERT INTO agent_activity
          (id, turn_id, operation_id, step_seq, kind, state, label, detail_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.turnId,
        input.operationId,
        input.stepSeq,
        input.kind,
        input.state,
        input.label,
        input.detail ? JSON.stringify(input.detail) : null,
        input.now,
        input.now
      )

    return this.getActivity(input.id)!
  }

  getActivity(id: string): AgentActivity | null {
    const row = this.db
      .prepare(
        `SELECT id, turn_id, operation_id, step_seq, kind, state, label, detail_json, created_at, updated_at
         FROM agent_activity WHERE id = ?`
      )
      .get<ActivityRow>(id)
    return row ? activityFrom(row) : null
  }

  listActivities(turnId: string): AgentActivity[] {
    return this.db
      .prepare(
        `SELECT id, turn_id, operation_id, step_seq, kind, state, label, detail_json, created_at, updated_at
         FROM agent_activity WHERE turn_id = ? ORDER BY step_seq ASC, id ASC`
      )
      .all<ActivityRow>(turnId)
      .map(activityFrom)
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)
  }

  /** Ends a `waiting_user` turn by Stop (`cancelled`) or a new command (`expired`), with its pending calls. */
  settleWaitingTurn(turnId: string, status: 'cancelled' | 'expired', now: number): AgentTurn {
    return this.db.transaction(() => {
      const turn = this.transitionTurn(turnId, status, now)
      this.db
        .prepare("UPDATE agent_tool_call SET state = ? WHERE turn_id = ? AND state = 'pending'")
        .run(status, turnId)
      return turn
    })
  }

  insertToolCalls(
    calls: Array<
      Omit<AgentToolCall, 'result' | 'approval'> & {
        result?: unknown
        approval?: AgentToolApproval | null
      }
    >
  ): void {
    this.db.transaction(() => {
      const insert = this.db.prepare(
        `INSERT INTO agent_tool_call (${TOOL_CALL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const call of calls) {
        insert.run(
          call.id,
          call.turnId,
          call.round,
          call.callId,
          call.name,
          JSON.stringify(call.args ?? {}),
          call.argsDigest,
          call.decision,
          call.state,
          call.result === undefined ? null : JSON.stringify(call.result),
          call.createdAt,
          call.extra === undefined ? null : JSON.stringify(call.extra),
          call.approval ?? null
        )
      }
    })
  }

  /** `approval` is kept when not given. */
  updateToolCall(
    id: string,
    state: AgentToolCallState,
    result: unknown,
    approval?: AgentToolApproval
  ): AgentToolCall {
    const changed = this.db
      .prepare(
        `UPDATE agent_tool_call SET state = ?, result_json = ?, approval = COALESCE(?, approval)
         WHERE id = ?`
      )
      .run(state, result === undefined ? null : JSON.stringify(result), approval ?? null, id)
    if (changed.changes === 0) throw new StorageError('not_found', 'Không tìm thấy tool call.')
    return this.getToolCall(id)!
  }

  getToolCall(id: string): AgentToolCall | null {
    const row = this.db
      .prepare(`SELECT ${TOOL_CALL_COLUMNS} FROM agent_tool_call WHERE id = ?`)
      .get<ToolCallRow>(id)
    return row ? toolCallFrom(row) : null
  }

  listToolCalls(turnId: string): AgentToolCall[] {
    return this.db
      .prepare(
        `SELECT ${TOOL_CALL_COLUMNS} FROM agent_tool_call WHERE turn_id = ?
         ORDER BY round ASC, created_at ASC, rowid ASC`
      )
      .all<ToolCallRow>(turnId)
      .map(toolCallFrom)
  }

  listSessionPendingToolCalls(sessionId: string): AgentToolCall[] {
    return this.db
      .prepare(
        `SELECT ${TOOL_CALL_COLUMNS.replace(/(\w+)/g, 'c.$1')} FROM agent_tool_call c
         JOIN agent_turn t ON t.id = c.turn_id
         WHERE t.session_id = ? AND t.status = 'waiting_user' AND c.state = 'pending'
         ORDER BY c.round ASC, c.created_at ASC, c.rowid ASC`
      )
      .all<ToolCallRow>(sessionId)
      .map(toolCallFrom)
  }

  listSessionActivities(sessionId: string): AgentActivity[] {
    return this.db
      .prepare(
        `SELECT a.id, a.turn_id, a.operation_id, a.step_seq, a.kind, a.state, a.label, a.detail_json,
                a.created_at, a.updated_at
         FROM agent_activity a JOIN agent_turn t ON t.id = a.turn_id
         WHERE t.session_id = ? ORDER BY t.created_at ASC, t.id ASC, a.step_seq ASC`
      )
      .all<ActivityRow>(sessionId)
      .map(activityFrom)
  }

  listSessionOperations(sessionId: string): AgentOperation[] {
    return this.db
      .prepare(
        `SELECT o.id, o.turn_id, o.task_item_id, o.command_id, o.capability, o.target_json, o.state, o.progress_json,
                o.model_ref_json, o.usage_json, o.result_json, o.error_json, o.created_at, o.updated_at
         FROM agent_operation o JOIN agent_turn t ON t.id = o.turn_id
         WHERE t.session_id = ? ORDER BY o.created_at ASC, o.id ASC`
      )
      .all<OperationRow>(sessionId)
      .map(operationFrom)
  }

  /** The session an operation belongs to, for the `undo_operation` policy. */
  operationSessionId(operationId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT t.session_id FROM agent_operation o JOIN agent_turn t ON t.id = o.turn_id
         WHERE o.id = ?`
      )
      .get<{ session_id: string }>(operationId)
    return row ? row.session_id : null
  }

  recordLegacyImport(
    workId: string,
    legacySessionId: string,
    agentSessionId: string,
    now: number
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_legacy_import
          (work_id, legacy_session_id, agent_session_id, imported_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(workId, legacySessionId, agentSessionId, now)
  }

  recordLegacyTurnImport(
    workId: string,
    legacySessionId: string,
    legacyTurnId: string,
    agentTurnId: string,
    now: number
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_legacy_turn_import
          (work_id, legacy_session_id, legacy_turn_id, agent_turn_id, imported_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(workId, legacySessionId, legacyTurnId, agentTurnId, now)
  }

  findLegacyImport(workId: string, legacySessionId: string): string | null {
    const row = this.db
      .prepare(
        'SELECT agent_session_id FROM agent_legacy_import WHERE work_id = ? AND legacy_session_id = ?'
      )
      .get<{ agent_session_id: string }>(workId, legacySessionId)
    return row ? row.agent_session_id : null
  }

  findLegacyTurnImport(
    workId: string,
    legacySessionId: string,
    legacyTurnId: string
  ): string | null {
    const row = this.db
      .prepare(
        `SELECT agent_turn_id FROM agent_legacy_turn_import
         WHERE work_id = ? AND legacy_session_id = ? AND legacy_turn_id = ?`
      )
      .get<{ agent_turn_id: string }>(workId, legacySessionId, legacyTurnId)
    return row ? row.agent_turn_id : null
  }
}
