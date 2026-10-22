import * as v from 'valibot'
import { idSchema } from './library'
import type { ModelRef } from './aiPreferences'
import type { TokenUsage } from './usage'

const paragraphSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
const sequenceSchema = v.pipe(v.number(), v.integer(), v.minValue(1))

export interface AgentSelection {
  side: 'source' | 'target'
  from: number
  to: number
}

/** Most attachments a turn carries besides its main context. */
export const AGENT_ATTACHMENT_LIMIT = 10

/**
 * A chip the user added with + or by pinning a selection. Main fills `content` of a glossary or
 * addressing attachment when it accepts the turn (null once the entry is no longer approved), so the
 * turn keeps what it sent; whatever the renderer passes there is overwritten.
 */
export type AgentAttachment =
  | { kind: 'work'; workId: string; label: string }
  | { kind: 'chapter'; workId: string; chapterId: string; label: string; range?: AgentSelection }
  | {
      kind: 'glossary' | 'addressing'
      workId: string
      entryId: string
      label: string
      content?: string | null
    }

export interface AgentContext {
  workId?: string
  chapterId?: string
  caret?: { source: number | null; target: number | null }
  selection?: AgentSelection
  attachments?: AgentAttachment[]
}

const selectionSchema = v.pipe(
  v.strictObject({
    side: v.picklist(['source', 'target']),
    from: paragraphSchema,
    to: paragraphSchema
  }),
  v.check((selection) => selection.from <= selection.to, 'Vùng chọn bị ngược.')
)
const attachmentLabelSchema = v.pipe(v.string(), v.maxLength(200))

export const agentAttachmentSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('work'), workId: idSchema, label: attachmentLabelSchema }),
  v.strictObject({
    kind: v.literal('chapter'),
    workId: idSchema,
    chapterId: idSchema,
    label: attachmentLabelSchema,
    range: v.optional(selectionSchema)
  }),
  v.strictObject({
    kind: v.picklist(['glossary', 'addressing']),
    workId: idSchema,
    entryId: idSchema,
    label: attachmentLabelSchema,
    content: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(4000))))
  })
])

export const agentContextSchema = v.pipe(
  v.strictObject({
    workId: v.optional(idSchema),
    chapterId: v.optional(idSchema),
    caret: v.optional(
      v.strictObject({
        source: v.nullable(paragraphSchema),
        target: v.nullable(paragraphSchema)
      })
    ),
    selection: v.optional(selectionSchema),
    attachments: v.optional(
      v.pipe(
        v.array(agentAttachmentSchema),
        v.maxLength(AGENT_ATTACHMENT_LIMIT, 'Tối đa 10 ngữ cảnh đính kèm.')
      )
    )
  }),
  v.check(
    (context) => context.chapterId === undefined || context.workId !== undefined,
    'Chương cần tác phẩm.'
  )
)

export type ResolvedTarget =
  | { kind: 'work'; workId: string; workLabel: string }
  | {
      kind: 'chapter'
      workId: string
      workLabel: string
      chapterId: string
      chapterLabel: string
      side?: 'source' | 'target'
      range?: { from: number; to: number }
    }

const workTargetSchema = v.strictObject({
  kind: v.literal('work'),
  workId: idSchema,
  workLabel: v.pipe(v.string(), v.trim(), v.minLength(1))
})
const chapterTargetSchema = v.strictObject({
  kind: v.literal('chapter'),
  workId: idSchema,
  workLabel: v.pipe(v.string(), v.trim(), v.minLength(1)),
  chapterId: idSchema,
  chapterLabel: v.pipe(v.string(), v.trim(), v.minLength(1)),
  side: v.optional(v.picklist(['source', 'target'])),
  range: v.optional(
    v.pipe(
      v.strictObject({ from: paragraphSchema, to: paragraphSchema }),
      v.check((range) => range.from <= range.to, 'Khoảng target bị ngược.')
    )
  )
})
export const resolvedTargetSchema = v.variant('kind', [workTargetSchema, chapterTargetSchema])

export const TURN_STATES = [
  'queued',
  'running',
  'completed',
  'waiting_user',
  'failed',
  'cancelled',
  'interrupted',
  'expired'
] as const
export type AgentTurnState = (typeof TURN_STATES)[number]

export const OPERATION_STATES = [
  'queued',
  'running',
  'completed',
  'partially_completed',
  'conflict',
  'failed',
  'cancelled',
  'interrupted',
  'undone'
] as const
export type AgentOperationState = (typeof OPERATION_STATES)[number]

export const ACTIVITY_STATES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const
export type AgentActivityState = (typeof ACTIVITY_STATES)[number]

const turnTransitions: Record<AgentTurnState, readonly AgentTurnState[]> = {
  queued: ['running', 'cancelled', 'interrupted'],
  running: ['completed', 'waiting_user', 'failed', 'cancelled', 'interrupted'],
  waiting_user: ['running', 'cancelled', 'expired'],
  completed: [],
  failed: [],
  cancelled: [],
  interrupted: [],
  expired: []
}
const operationTransitions: Record<AgentOperationState, readonly AgentOperationState[]> = {
  queued: ['running', 'cancelled', 'interrupted'],
  running: ['completed', 'partially_completed', 'conflict', 'failed', 'cancelled', 'interrupted'],
  completed: ['undone'],
  partially_completed: ['undone'],
  cancelled: ['undone'],
  conflict: [],
  failed: [],
  interrupted: [],
  undone: []
}
const activityTransitions: Record<AgentActivityState, readonly AgentActivityState[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: []
}

export const canTransitionTurn = (from: AgentTurnState, to: AgentTurnState): boolean =>
  turnTransitions[from].includes(to)
export const canTransitionOperation = (
  from: AgentOperationState,
  to: AgentOperationState,
  hasChanges = false
): boolean => operationTransitions[from].includes(to) && (to !== 'undone' || hasChanges)
export const canTransitionActivity = (from: AgentActivityState, to: AgentActivityState): boolean =>
  activityTransitions[from].includes(to)

export interface AgentProgress {
  completed: number
  total: number
  unit: 'batches' | 'segments' | 'items'
  message?: string
}

export interface AgentOperation {
  id: string
  /** Chat operations belong to a turn, task operations to a task item; exactly one is set. */
  turnId: string | null
  taskItemId: string | null
  commandId: string
  capability: string
  target: ResolvedTarget
  state: AgentOperationState
  progress: AgentProgress | null
  model: (ModelRef & { settingsKey?: string }) | null
  usage: TokenUsage | null
  result: unknown | null
  error: unknown | null
  createdAt: number
  updatedAt: number
}

export interface AgentActivity {
  id: string
  turnId: string
  operationId: string | null
  stepSeq: number
  kind: 'thinking' | 'resolve' | 'read' | 'write' | 'progress' | 'result'
  state: AgentActivityState
  label: string
  detail: unknown | null
  createdAt: number
  updatedAt: number
}

/** One element of a turn's answer, in the order it happened (`add-agent-response-parts`). */
export const RESPONSE_PART_KINDS = ['text', 'reasoning', 'tool_call', 'progress'] as const
export type AgentResponsePartKind = (typeof RESPONSE_PART_KINDS)[number]

export interface AgentResponsePart {
  id: string
  turnId: string
  /** Order within the turn, starting at 1. */
  seq: number
  /** Model round the part belongs to; 0 for parts outside a round. */
  round: number
  kind: AgentResponsePartKind
  /** Answer text, reasoning, or the progress message; empty for a tool call. */
  text: string
  toolCallId: string | null
  /** How long the reasoning streamed, when measured. */
  durationMs: number | null
  createdAt: number
  updatedAt: number
}

export const TOOL_CALL_VIEW_STATES = [
  'waiting_user',
  'running',
  'completed',
  'failed',
  'cancelled',
  'skipped'
] as const
export type AgentToolCallViewState = (typeof TOOL_CALL_VIEW_STATES)[number]

/** A tool call as the transcript shows it; the full result is read with `toolCalls.get`. */
export interface AgentToolCallView {
  id: string
  turnId: string
  round: number
  /** The `run_subagent` call this call ran under, if any. */
  parentToolCallId: string | null
  name: string
  args: unknown
  state: AgentToolCallViewState
  /** "Đang …" while the call waits or runs. */
  invocationMessage: string
  /** "Đã …" once it completed. */
  pastTenseMessage: string
  /** Short summary of a completed result. */
  summary: string | null
  /** Why the call failed, was skipped or was cancelled. */
  reason: string | null
  /** How long a subagent call worked, when it reported it. */
  durationMs: number | null
  /** What the user answered to `ask_questions`, or `skipped`; only on an answered question call. */
  questionAnswers?: AgentAnsweredQuestion[] | 'skipped'
  createdAt: number
}

export interface AgentToolCallDetailView {
  toolCall: AgentToolCallView
  /** The stored result, exactly as the model received it. */
  result: unknown
}

export const agentToolCallGetInputSchema = v.strictObject({ toolCallId: idSchema })

/** One row of the + picker: what is attached when picked, and a dimmer second line. */
export interface AgentContextSearchItem {
  attachment: AgentAttachment
  detail: string | null
}

export interface AgentContextSearchGroup {
  kind: AgentAttachment['kind']
  items: AgentContextSearchItem[]
}

/** Most rows the picker shows for one query. */
export const AGENT_CONTEXT_SEARCH_LIMIT = 50

export const agentContextSearchInputSchema = v.strictObject({
  query: v.pipe(v.string(), v.maxLength(200)),
  workId: v.optional(idSchema)
})
export type AgentContextSearchInput = v.InferOutput<typeof agentContextSearchInputSchema>

const streamBase = {
  requestId: idSchema,
  turnId: idSchema,
  eventSeq: sequenceSchema
}
const activityEventBase = {
  ...streamBase,
  activityId: idSchema,
  stepSeq: sequenceSchema,
  activity: v.unknown()
}

export const agentStreamEventSchema = v.variant('kind', [
  v.strictObject({
    ...streamBase,
    kind: v.literal('reasoning-delta'),
    text: v.string(),
    round: v.optional(sequenceSchema)
  }),
  v.strictObject({
    ...streamBase,
    kind: v.literal('answer-delta'),
    text: v.string(),
    round: v.optional(sequenceSchema)
  }),
  v.strictObject({ ...streamBase, kind: v.literal('tool-call'), toolCall: v.unknown() }),
  v.strictObject({ ...activityEventBase, kind: v.literal('activity-start') }),
  v.strictObject({ ...activityEventBase, kind: v.literal('activity-update') }),
  v.strictObject({ ...activityEventBase, kind: v.literal('activity-finish') }),
  v.strictObject({ ...streamBase, kind: v.literal('operation'), operation: v.unknown() }),
  v.strictObject({
    ...streamBase,
    kind: v.literal('done'),
    turnState: v.picklist(['completed', 'waiting_user']),
    usage: v.nullable(v.unknown())
  }),
  v.strictObject({ ...streamBase, kind: v.literal('error'), error: v.unknown() }),
  v.strictObject({ ...streamBase, kind: v.literal('cancelled'), usage: v.nullable(v.unknown()) })
])

export type AgentStreamEvent = v.InferOutput<typeof agentStreamEventSchema>

export function validateAgentEventSequence(
  events: readonly Pick<AgentStreamEvent, 'eventSeq' | 'kind'>[]
): { ok: true } | { ok: false; reason: 'event_order' | 'terminal_count' | 'event_after_terminal' } {
  let previous = 0
  let terminalCount = 0
  let terminalSeen = false
  for (const event of events) {
    if (event.eventSeq <= previous) return { ok: false, reason: 'event_order' }
    if (terminalSeen) return { ok: false, reason: 'event_after_terminal' }
    previous = event.eventSeq
    if (event.kind === 'done' || event.kind === 'error' || event.kind === 'cancelled') {
      terminalSeen = true
      terminalCount++
    }
  }
  return terminalCount === 1 ? { ok: true } : { ok: false, reason: 'terminal_count' }
}

/** Ask chỉ có capability đọc; Agent có đủ. Lưu trên turn khi được chấp nhận. */
export const AGENT_CHAT_MODES = ['ask', 'agent'] as const
export type AgentChatMode = (typeof AGENT_CHAT_MODES)[number]

/** Mức quyền của session; turn chụp mức này khi được chấp nhận. */
export const AGENT_PERMISSION_LEVELS = ['default', 'allow_all', 'autopilot'] as const
export type AgentPermissionLevel = (typeof AGENT_PERMISSION_LEVELS)[number]

/** Vì sao một call `needs_user` được chạy hoặc bị Autopilot bỏ qua. */
export type AgentToolApproval =
  | 'user_once'
  | 'user_session'
  | 'level_allow_all'
  | 'level_autopilot'
  | 'autopilot_skip'

export interface AgentSessionView {
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

export interface AgentTurnView {
  id: string
  sessionId: string
  instruction: string
  answer: string
  reasoning: string
  context: AgentContext
  mode: AgentChatMode
  permissionLevel: AgentPermissionLevel
  /** Name of the model the turn ran on; `null` before it ran or for older turns. */
  modelLabel: string | null
  status: AgentTurnState
  usage: TokenUsage | null
  costUsd: number | null
  legacyRef: AgentLegacyRef | null
  createdAt: number
  updatedAt: number
}

export const AGENT_QUESTION_TYPES = ['single', 'multi', 'text'] as const
export type AgentQuestionType = (typeof AGENT_QUESTION_TYPES)[number]

/** Most questions in one `ask_questions` call, and options of one question. */
export const AGENT_QUESTION_LIMIT = 5
export const AGENT_OPTION_LIMIT = 9

/** One question of an `ask_questions` call. Options are labels; answers are labels or free text. */
export interface AgentQuestion {
  id: string
  title: string
  description?: string
  type: AgentQuestionType
  options?: string[]
  /** Label (or labels for `multi`) chosen before the user answers; Autopilot answers with it. */
  default?: string | string[]
  /** Whether the user may type an answer instead of picking an option. */
  allowFreeText?: boolean
  /** Required unless `false`. */
  required?: boolean
}

const questionTextSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500))

export const agentQuestionSchema = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
    title: questionTextSchema,
    description: v.optional(v.pipe(v.string(), v.maxLength(1000))),
    type: v.picklist(AGENT_QUESTION_TYPES),
    options: v.optional(v.array(questionTextSchema)),
    default: v.optional(v.union([v.string(), v.array(v.string())])),
    allowFreeText: v.optional(v.boolean()),
    required: v.optional(v.boolean())
  }),
  v.check(
    (q) =>
      q.type === 'text' ||
      (q.options !== undefined && q.options.length >= 2 && q.options.length <= AGENT_OPTION_LIMIT),
    `Câu chọn một hoặc chọn nhiều cần 2–${AGENT_OPTION_LIMIT} lựa chọn.`
  ),
  v.check(
    (q) => q.options === undefined || new Set(q.options).size === q.options.length,
    'Các lựa chọn của một câu không được trùng nhau.'
  ),
  v.check((q) => {
    if (q.default === undefined) return true
    if (q.type === 'multi') {
      const values = Array.isArray(q.default) ? q.default : [q.default]
      return values.every((value) => q.allowFreeText || q.options?.includes(value))
    }
    if (Array.isArray(q.default)) return false
    return q.type === 'text' || q.allowFreeText === true || q.options?.includes(q.default) === true
  }, 'Đáp án mặc định phải là một lựa chọn của câu.')
)

export const askQuestionsArgsSchema = v.pipe(
  v.object({
    questions: v.pipe(
      v.array(agentQuestionSchema),
      v.minLength(1, 'Cần ít nhất 1 câu hỏi.'),
      v.maxLength(AGENT_QUESTION_LIMIT, `Tối đa ${AGENT_QUESTION_LIMIT} câu hỏi một lần.`)
    ),
    allowSkip: v.optional(v.boolean())
  }),
  v.check(
    (input) => new Set(input.questions.map((q) => q.id)).size === input.questions.length,
    'ID câu hỏi không được trùng nhau.'
  )
)

/** Answers by question id: a label or text for `single`/`text`, labels for `multi`. */
export type AgentQuestionAnswers = Record<string, string | string[]>

/** What the transcript and the model see of one answered question. */
export interface AgentAnsweredQuestion {
  id: string
  title: string
  answer: string
}

function isEmptyAnswer(answer: string | string[] | undefined): boolean {
  return (
    answer === undefined || (Array.isArray(answer) ? answer.length === 0 : answer.trim() === '')
  )
}

/**
 * Why answers do not fit their questions, or null when they do: a required question without an
 * answer, an answer of the wrong shape, or a label outside the options when free text is off.
 */
export function checkQuestionAnswers(
  questions: AgentQuestion[],
  answers: AgentQuestionAnswers
): string | null {
  for (const id of Object.keys(answers)) {
    if (!questions.some((q) => q.id === id)) return `Không có câu hỏi "${id}".`
  }
  for (const q of questions) {
    const answer = answers[q.id]
    if (isEmptyAnswer(answer)) {
      if (q.required !== false) return `Câu "${q.title}" cần trả lời.`
      continue
    }
    if ((q.type === 'multi') !== Array.isArray(answer)) {
      return `Câu "${q.title}" cần ${q.type === 'multi' ? 'danh sách lựa chọn' : 'một câu trả lời'}.`
    }
    if (q.type === 'text' || q.allowFreeText) continue
    const values = Array.isArray(answer) ? answer : [answer!]
    if (values.some((value) => !q.options?.includes(value))) {
      return `Câu trả lời của "${q.title}" không nằm trong các lựa chọn.`
    }
  }
  return null
}

/** Answers in question order, as the model receives them; unanswered optional questions are left out. */
export function answeredQuestions(
  questions: AgentQuestion[],
  answers: AgentQuestionAnswers
): AgentAnsweredQuestion[] {
  return questions
    .filter((q) => !isEmptyAnswer(answers[q.id]))
    .map((q) => {
      const answer = answers[q.id]!
      return {
        id: q.id,
        title: q.title,
        answer: Array.isArray(answer) ? answer.join(', ') : answer
      }
    })
}

/** The answer Autopilot gives: the default, else the first option. */
export function defaultAnswers(questions: AgentQuestion[]): AgentQuestionAnswers {
  const answers: AgentQuestionAnswers = {}
  for (const q of questions) {
    if (q.default !== undefined) answers[q.id] = q.default
    else if (q.options?.[0] !== undefined)
      answers[q.id] = q.type === 'multi' ? [q.options[0]] : q.options[0]
    else answers[q.id] = 'Tự quyết định'
  }
  return answers
}

/** A tool call that waits for the user: a write needing approval, an ambiguous target or questions. */
export interface AgentPendingAction {
  turnId: string
  toolCallId: string
  argsDigest: string
  name: string
  kind: 'approve' | 'choose' | 'question'
  label: string
  /** Targets to choose from (`choose`). */
  candidates: Array<{ handle: string; label: string }>
  /** Questions in order (`question`). */
  questions?: AgentQuestion[]
  /** Whether the user may skip every question (`question`). */
  allowSkip?: boolean
  createdAt: number
}

export interface AgentSessionDetailView {
  session: AgentSessionView
  turns: AgentTurnView[]
  /** Answer elements of every turn, ordered by turn then `seq`. */
  parts: AgentResponsePart[]
  /** Every tool call of the session, subagent calls included. */
  toolCalls: AgentToolCallView[]
  activities: AgentActivity[]
  operations: AgentOperation[]
  pending: AgentPendingAction[]
  /** Capability người dùng đã cho phép trong phiên này. */
  sessionApprovals: string[]
  /** Chương agent đã sửa trong phiên mà người dùng chưa giữ hay hoàn tác. */
  editedChapters: AgentEditedChapter[]
}

/**
 * The user's answer to one pending call: `choice` is `approve` (once), `approve_session` or `reject` for
 * an approval and a candidate's handle for an ambiguous target; questions get `answers` or `skipped`.
 */
export type AgentPendingReply = { toolCallId: string; argsDigest: string } & (
  | { choice: string }
  | { answers: AgentQuestionAnswers }
  | { skipped: true }
)

const replyBase = { toolCallId: idSchema, argsDigest: v.pipe(v.string(), v.minLength(1)) }

export const agentPendingReplySchema = v.union([
  v.strictObject({ ...replyBase, choice: v.pipe(v.string(), v.minLength(1)) }),
  v.strictObject({
    ...replyBase,
    answers: v.record(
      v.pipe(v.string(), v.maxLength(64)),
      v.union([
        v.pipe(v.string(), v.maxLength(2000)),
        v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(AGENT_OPTION_LIMIT))
      ])
    )
  }),
  v.strictObject({ ...replyBase, skipped: v.literal(true) })
])

export interface AgentSendInput {
  sessionId?: string
  clientCommandId: string
  instruction: string
  context?: AgentContext
  modelSelection?: {
    connectionId: string
    entryId: string
    settingsKey?: string
  }
  continuesTurnId?: string
  pendingReply?: AgentPendingReply
  /** Chỉ đọc khi tạo turn mới; lượt tiếp tục dùng chế độ đã lưu của turn. */
  mode?: AgentChatMode
}

export const agentSendInputSchema = v.strictObject({
  sessionId: v.optional(idSchema),
  clientCommandId: idSchema,
  instruction: v.pipe(
    v.string('Câu hỏi/lệnh phải là chuỗi ký tự.'),
    v.trim(),
    v.minLength(1, 'Câu hỏi/lệnh không được để trống.')
  ),
  context: v.optional(agentContextSchema),
  modelSelection: v.optional(
    v.strictObject({
      connectionId: idSchema,
      entryId: idSchema,
      settingsKey: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
    })
  ),
  continuesTurnId: v.optional(idSchema),
  pendingReply: v.optional(agentPendingReplySchema),
  mode: v.optional(v.picklist(AGENT_CHAT_MODES))
})

export interface AgentSetPermissionLevelInput {
  sessionId: string
  level: AgentPermissionLevel
}

export const agentSetPermissionLevelInputSchema = v.strictObject({
  sessionId: idSchema,
  level: v.picklist(AGENT_PERMISSION_LEVELS)
})

export interface AgentSendResult {
  requestId: string
  turnId: string
  sessionId: string
}

export interface AgentCancelInput {
  turnId: string
}

export interface AgentCancelResult {
  status: AgentTurnState
}

export const agentCancelInputSchema = v.strictObject({
  turnId: idSchema
})

export interface AgentOperationDetailView {
  operation: AgentOperation
}

export interface AgentUndoInput {
  operationId: string
}

export const agentUndoInputSchema = v.strictObject({
  operationId: idSchema
})

export interface AgentUndoResult {
  targetRev: number
}

/** One row of the "N chapters edited" bar: chat writes of a chapter the user has not kept or undone. */
export interface AgentEditedChapter {
  workId: string
  chapterId: string
  workLabel: string
  chapterLabel: string
  operationIds: string[]
  /** Units the operations changed, summed from their progress. */
  units: number
}

/** A chapter whose text changed after the agent wrote it, so its writes were not undone. */
export interface AgentUndoConflict {
  workId: string
  chapterId: string
  chapterLabel: string
  message: string
}

/** Keep or undo the rows of the edited bar: one chapter, or every row when `chapter` is absent. */
export const agentEditsInputSchema = v.strictObject({
  sessionId: idSchema,
  chapter: v.optional(v.strictObject({ workId: idSchema, chapterId: idSchema }))
})
export type AgentEditsInput = v.InferOutput<typeof agentEditsInputSchema>

export interface AgentEditsResult {
  /** Rows left in the bar. */
  editedChapters: AgentEditedChapter[]
  conflicts: AgentUndoConflict[]
}

export const agentRevertInputSchema = v.strictObject({ turnId: idSchema })

/** What restoring the checkpoint before a turn did; the composer gets the turn's command back. */
export interface AgentRevertResult {
  revertedTurnIds: string[]
  instruction: string
  context: AgentContext
}

/** Restores the checkpoint before `turnId`, then sends the edited command as a new turn. */
export const agentRevertAndResendInputSchema = v.strictObject({
  turnId: idSchema,
  clientCommandId: idSchema,
  instruction: v.pipe(
    v.string('Câu hỏi/lệnh phải là chuỗi ký tự.'),
    v.trim(),
    v.minLength(1, 'Câu hỏi/lệnh không được để trống.')
  ),
  context: v.optional(agentContextSchema),
  modelSelection: v.optional(
    v.strictObject({
      connectionId: idSchema,
      entryId: idSchema,
      settingsKey: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
    })
  ),
  mode: v.optional(v.picklist(AGENT_CHAT_MODES))
})
export type AgentRevertAndResendInput = v.InferOutput<typeof agentRevertAndResendInputSchema>

export interface AgentWriteIntent {
  intentId: string
  operationId: string
  target: {
    workId: string
    chapterId: string
    side: 'source' | 'target'
  }
}

export interface AgentWriteIntentAck {
  intentId: string
  status: 'ack' | 'not-open' | 'flush-failed'
  revision?: number
}

export const agentWriteIntentAckSchema = v.strictObject({
  intentId: idSchema,
  status: v.picklist(['ack', 'not-open', 'flush-failed']),
  revision: v.optional(v.number())
})

export interface AgentTargetChanged {
  target: {
    workId: string
    chapterId: string
    side: 'source' | 'target'
  }
  lastAppliedRev: number
  operationId: string
}
