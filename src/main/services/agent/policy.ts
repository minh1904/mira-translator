import type {
  AgentPermissionLevel,
  AgentToolApproval,
  ResolvedTarget
} from '../../../shared/contracts/agent'
import type { AgentToolDecision } from '../../infra/storage/agentRepository'
import type { CapabilityKind } from './types'

/** The capability that creates a multi-chapter translation task (`add-durable-translation-tasks`). */
export const CREATE_TRANSLATION_TASK = 'create_translation_task'
/** The capability that steers a running task from a chapter on (`add-agent-steering`). */
export const STEER_TRANSLATION_TASK = 'steer_translation_task'
/** The capability that edits a work's details and chapter titles; neither has operation undo. */
export const UPDATE_WORK = 'update_work'
export const RESOLVE_TARGET = 'resolve_target'
export const UNDO_OPERATION = 'undo_operation'
export const ASK_QUESTIONS = 'ask_questions'
export const RUN_SUBAGENT = 'run_subagent'
/** Handle of the context snapshot's main target; attached works and chapters get `ctx2`, `ctx3`… */
export const CONTEXT_HANDLE = 'ctx'

/** Handle `n` (1-based) of the targets the user put in the turn's context. */
export function contextHandle(n: number): string {
  return n === 1 ? CONTEXT_HANDLE : CONTEXT_HANDLE + n
}

/** Whether a handle names a target the user put in the turn's context, so they named it. */
export function isContextHandle(handle: string | undefined): boolean {
  return handle !== undefined && /^ctx\d*$/.test(handle)
}

export interface PolicyInput {
  name: string
  /** Kind of a registered chat capability; `undefined` for a name the turn does not offer. */
  kind: CapabilityKind | undefined
  /** The target handle the call names, if any. */
  handle?: string
  /** What that handle resolves to in this turn; `undefined` when the turn never issued it. */
  target?: ResolvedTarget
  /** The user picked this handle among the candidates of an ambiguous `resolve_target`. */
  chosenByUser?: boolean
  /** Number of the target chapter, so "chương 3" in the instruction counts as naming it. */
  chapterNumber?: number
  /** Work of the context snapshot, so "chương 3" while reading that work names its chapter. */
  contextWorkId?: string
  /** The instruction stored on the turn: what the user said, never what the model or raw said. */
  instruction: string
  sessionId: string
  /** For `undo_operation`: the session that owns the operation, `null` when it does not exist. */
  operationSessionId?: string | null
}

export interface PolicyDecision {
  decision: AgentToolDecision
  reason: string
  /** `high`: a `needs_user` call that Autopilot skips instead of approving. */
  risk?: 'high'
}

const normalize = (text: string): string =>
  text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** `needle` occurs in `haystack` and is not the prefix of a longer word ("chương 1" in "chương 10"). */
function containsPhrase(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const next = haystack.charAt(at + needle.length)
    if (!/[\p{L}\p{N}]/u.test(next)) return true
  }
  return false
}

function mentionsChapter(instruction: string, number: number): boolean {
  return new RegExp(`(?:chương|chapter|第)\\s*0*${number}(?!\\d)`, 'i').test(instruction)
}

/** Whether the user named this target: the label or chapter number appears in their instruction. */
export function namedByUser(input: PolicyInput): boolean {
  const target = input.target
  if (!target) return false
  const instruction = normalize(input.instruction)
  const workLabelNamed = containsPhrase(instruction, normalize(target.workLabel))
  if (target.kind === 'work') return workLabelNamed
  const workNamed = workLabelNamed || target.workId === input.contextWorkId
  const chapterNamed =
    containsPhrase(instruction, normalize(target.chapterLabel)) ||
    (input.chapterNumber !== undefined && mentionsChapter(instruction, input.chapterNumber))
  return workNamed && chapterNamed
}

/**
 * Policy table of design D4, as a pure function. Story text, history and tool output never reach
 * it: "named by the user" is checked against the turn's stored instruction only.
 */
export function decideToolCall(input: PolicyInput): PolicyDecision {
  if (input.kind === undefined && input.name !== RESOLVE_TARGET) {
    return { decision: 'deny', reason: 'Công cụ không có trong danh sách được phép của lượt.' }
  }
  if (input.handle !== undefined && input.target === undefined) {
    return {
      decision: 'deny',
      reason: 'Đích không do lượt này cấp. Gọi resolve_target để lấy handle, không dùng ID.'
    }
  }
  if (input.name === ASK_QUESTIONS) {
    return { decision: 'needs_user', reason: 'Cần người dùng chọn câu trả lời.' }
  }
  if (input.name === RESOLVE_TARGET || input.kind === 'read') {
    return { decision: 'allow', reason: 'Chỉ đọc.' }
  }
  if (input.name === UNDO_OPERATION) {
    return input.operationSessionId === input.sessionId
      ? { decision: 'allow', reason: 'Hoàn tác thao tác của phiên này.' }
      : { decision: 'deny', reason: 'Thao tác không thuộc phiên này.' }
  }
  if (input.name === CREATE_TRANSLATION_TASK) {
    return {
      decision: 'needs_user',
      reason: 'Tác vụ dịch nhiều chương tốn chi phí, cần duyệt.',
      risk: 'high'
    }
  }
  if (input.name === STEER_TRANSLATION_TASK) {
    return {
      decision: 'needs_user',
      reason: 'Điều chỉnh tác vụ đổi cách dịch các chương sau, cần duyệt.'
    }
  }
  if (input.name === UPDATE_WORK) {
    return {
      decision: 'needs_user',
      reason: 'Sửa thông tin tác phẩm hoặc tên chương không hoàn tác được, cần duyệt.'
    }
  }
  if (input.kind === 'reversible-write') {
    if (isContextHandle(input.handle) || input.chosenByUser || namedByUser(input)) {
      return { decision: 'allow', reason: 'Đích do người dùng nêu; có thể hoàn tác.' }
    }
    return {
      decision: 'needs_user',
      reason: 'Đích không do người dùng nêu, cần duyệt.',
      risk: 'high'
    }
  }
  return { decision: 'deny', reason: 'Loại công cụ này không được phép trong chat.' }
}

export type PermissionOutcome =
  | { run: 'allow'; approval?: AgentToolApproval }
  | { run: 'needs_user' }
  | { run: 'deny' }
  | { run: 'skip'; approval: 'autopilot_skip' }

/**
 * What the turn's permission level and the session's approvals make of a policy decision
 * (`fix-agent-chat-permissions` D3). Nothing here outranks `deny`; a question is only answered
 * for the user in Autopilot.
 */
export function applyPermission(input: {
  name: string
  decision: PolicyDecision
  level: AgentPermissionLevel
  sessionApproved: boolean
}): PermissionOutcome {
  const { decision, level } = input
  if (decision.decision === 'allow') return { run: 'allow' }
  if (decision.decision === 'deny') return { run: 'deny' }
  if (input.name === ASK_QUESTIONS) {
    return level === 'autopilot'
      ? { run: 'allow', approval: 'level_autopilot' }
      : { run: 'needs_user' }
  }
  if (input.sessionApproved) return { run: 'allow', approval: 'user_session' }
  if (level === 'allow_all') return { run: 'allow', approval: 'level_allow_all' }
  if (level === 'autopilot') {
    return decision.risk === 'high'
      ? { run: 'skip', approval: 'autopilot_skip' }
      : { run: 'allow', approval: 'level_autopilot' }
  }
  return { run: 'needs_user' }
}
