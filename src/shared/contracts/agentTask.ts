import * as v from 'valibot'
import { idSchema } from './library'
import type { ModelRef } from './aiPreferences'
import { TERM_NOTES_MAX, TERM_TEXT_MAX } from './glossary'
import type { TokenUsage } from './usage'

/** State vocabulary of durable tasks (change `add-durable-translation-tasks` owns it). */
export const TASK_STATES = [
  'queued',
  'running',
  'pausing',
  'paused',
  'waiting_user',
  'cancelling',
  'cancelled',
  'completed',
  'partially_completed',
  'failed'
] as const
export type AgentTaskState = (typeof TASK_STATES)[number]

export const TASK_ITEM_STATES = [
  'queued',
  'running',
  'waiting_user',
  'completed',
  'failed',
  'skipped',
  'cancelled'
] as const
export type AgentTaskItemState = (typeof TASK_ITEM_STATES)[number]

export const TASK_REASONS = [
  'missing_raw',
  'conflict',
  'budget',
  'provider',
  'refused',
  'context_review',
  'app_closed',
  'recovered_after_restart',
  'user'
] as const
export type AgentTaskReason = (typeof TASK_REASONS)[number]

/** States that must carry a reason (and the only ones that may). */
export const TASK_STATES_WITH_REASON: readonly AgentTaskState[] = [
  'waiting_user',
  'paused',
  'failed'
]
export const ITEM_STATES_WITH_REASON: readonly AgentTaskItemState[] = ['waiting_user', 'failed']

const taskTransitions: Record<AgentTaskState, readonly AgentTaskState[]> = {
  queued: ['running', 'paused', 'cancelled'],
  running: [
    'pausing',
    'cancelling',
    'paused',
    'waiting_user',
    'completed',
    'partially_completed',
    'failed'
  ],
  pausing: ['paused', 'cancelling'],
  paused: ['queued', 'cancelled'],
  waiting_user: ['queued', 'cancelled'],
  cancelling: ['cancelled'],
  failed: ['queued'],
  partially_completed: ['queued'],
  completed: [],
  cancelled: []
}

const itemTransitions: Record<AgentTaskItemState, readonly AgentTaskItemState[]> = {
  queued: ['running', 'skipped', 'cancelled'],
  running: ['completed', 'failed', 'waiting_user', 'queued', 'cancelled'],
  waiting_user: ['queued', 'skipped', 'cancelled'],
  // failed → completed only for `refused` ("skip the refused paragraphs"); checked with the reason.
  failed: ['queued', 'skipped', 'completed'],
  completed: [],
  skipped: [],
  cancelled: []
}

export const canTransitionTask = (from: AgentTaskState, to: AgentTaskState): boolean =>
  taskTransitions[from].includes(to)

export function canTransitionItem(
  from: AgentTaskItemState,
  to: AgentTaskItemState,
  fromReason: AgentTaskReason | null = null
): boolean {
  if (from === 'failed' && to === 'completed') return fromReason === 'refused'
  return itemTransitions[from].includes(to)
}

export interface AgentTaskBudget {
  maxCalls?: number
  maxTokens?: number
  maxCostUsd?: number
}

export interface AgentTaskProgress {
  applied: number
  kept: number
  total: number
  failed: number
  refused: number
}

export interface AgentTaskView {
  id: string
  kind: 'translate_chapters'
  workId: string
  originTurnId: string | null
  sourceTaskId: string | null
  state: AgentTaskState
  reason: AgentTaskReason | null
  model: ModelRef & { settingsKey: string }
  overwritePolicy: 'fill_untranslated'
  options: Record<string, unknown>
  budget: AgentTaskBudget
  stateVersion: number
  createdAt: number
  updatedAt: number
}

export interface AgentTaskItemView {
  id: string
  taskId: string
  ordinal: number
  chapterId: string
  state: AgentTaskItemState
  reason: AgentTaskReason | null
  runKey: string | null
  sourceRev: number | null
  expectedTargetRev: number | null
  skippedSegments: string[]
  progress: AgentTaskProgress | null
  contextChanged: boolean
  stateVersion: number
  createdAt: number
  updatedAt: number
}

export interface AgentTaskSummary extends AgentTaskView {
  workTitle: string
  /** `Kết nối · Mục model`, or a note that the model no longer exists. */
  modelLabel: string
  counts: Record<AgentTaskItemState, number>
  /** Sum of the reported usage of the task's operations; `null` when nothing was reported. */
  usage: TokenUsage | null
  /** Term extraction is running before the first item; `calls` counts the model calls started. */
  extracting?: { calls: number }
}

export interface AgentTaskDetailView {
  task: AgentTaskSummary
  items: Array<
    AgentTaskItemView & {
      chapterLabel: string
      /** The steering instruction the item pinned; `null` none, `undefined` not pinned yet. */
      instruction?: string | null
    }
  >
  steerings: Array<AgentTaskSteeringView & { requestedLabel: string; effectiveLabel: string }>
  /** The instruction in effect for the chapters not started yet; `null` when there is none. */
  currentInstruction: string | null
}

export const TASK_COMMANDS = [
  'pause',
  'continue',
  'cancel',
  'retry',
  'skip_item',
  'skip_refused',
  'run_again'
] as const
export type AgentTaskCommand = (typeof TASK_COMMANDS)[number]

const budgetSchema = v.strictObject({
  maxCalls: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  maxCostUsd: v.optional(v.pipe(v.number(), v.minValue(0)))
})

/**
 * How a translation task gets its context (change `add-agent-context-workflow`): extract terms and wait
 * for review first, or translate with the approved context as it is. Optional since 2026-10-14 (product
 * owner): left out, a work with no glossary yet extracts first; "translate right away" is `approved_only`.
 */
export const CONTEXT_STRATEGIES = ['extract_then_review', 'approved_only'] as const
export type ContextStrategy = (typeof CONTEXT_STRATEGIES)[number]

export interface AgentTaskCreateInput {
  clientCommandId: string
  /** Left out: `extract_then_review` when the work has no glossary yet, else `approved_only`. */
  contextStrategy?: ContextStrategy
  workId: string
  /** Chapters in work order; or a 1-based number range of the work's chapters. */
  chapterIds?: string[]
  range?: { from: number; to: number }
  modelSelection?: { connectionId: string; entryId: string; settingsKey?: string }
  budget?: AgentTaskBudget
}

export const agentTaskCreateInputSchema = v.pipe(
  v.strictObject({
    clientCommandId: idSchema,
    contextStrategy: v.optional(v.picklist(CONTEXT_STRATEGIES)),
    workId: idSchema,
    chapterIds: v.optional(v.pipe(v.array(idSchema), v.minLength(1), v.maxLength(2000))),
    range: v.optional(
      v.pipe(
        v.strictObject({
          from: v.pipe(v.number(), v.integer(), v.minValue(1)),
          to: v.pipe(v.number(), v.integer(), v.minValue(1))
        }),
        v.check((range) => range.from <= range.to, 'Khoảng chương bị ngược.')
      )
    ),
    modelSelection: v.optional(
      v.strictObject({
        connectionId: idSchema,
        entryId: idSchema,
        settingsKey: v.optional(v.pipe(v.string(), v.minLength(1)))
      })
    ),
    budget: v.optional(budgetSchema)
  }),
  v.check(
    (input) => (input.chapterIds === undefined) !== (input.range === undefined),
    'Cần đúng một trong danh sách chương hoặc khoảng chương.'
  )
)

export interface AgentTaskControlInput {
  taskId: string
  command: AgentTaskCommand
  /** The version the client saw; a stale one is a `conflict`. */
  stateVersion: number
  clientCommandId: string
  itemId?: string
}

export const agentTaskControlInputSchema = v.pipe(
  v.strictObject({
    taskId: idSchema,
    command: v.picklist(TASK_COMMANDS),
    stateVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    clientCommandId: idSchema,
    itemId: v.optional(idSchema)
  }),
  v.check(
    (input) =>
      (input.command === 'skip_item' || input.command === 'skip_refused') ===
      (input.itemId !== undefined),
    'Lệnh bỏ qua cần itemId, lệnh khác thì không.'
  )
)

// ---------------------------------------------------------------------------------------------------
// Steering (change `add-agent-steering`)

export const STEERING_STATES = ['accepted', 'applied', 'superseded'] as const
export type AgentTaskSteeringState = (typeof STEERING_STATES)[number]

export const STEERING_INSTRUCTION_MAX = 2000

/** The pair a `context_ref` steering wrote in the work DB: the new one and the one it closed. */
/** What a `context_ref` steering wrote: an addressing pair, or a term, from its chapter on. */
export type SteeringContextRef =
  | { newDyadId: string; closedDyadId: string | null }
  | { newEntryId: string; closedEntryId: string }

export interface AgentTaskSteeringView {
  id: string
  taskId: string
  requestedChapterId: string
  resolvedFromItemId: string
  kind: 'instruction' | 'context_ref'
  instructionText: string | null
  contextRef: SteeringContextRef | null
  state: AgentTaskSteeringState
  createdAt: number
  updatedAt: number
}

const pronoun = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))

/**
 * A steering command. The chapter is a number of the work or an id, exactly one. `instruction` is the
 * full text from that chapter on (it replaces, never adds); `addressing` changes how one character
 * addresses another from that chapter on; `third_person` is always refused (no chapter scope yet).
 */
export const agentTaskSteerInputSchema = v.pipe(
  v.strictObject({
    taskId: idSchema,
    clientCommandId: idSchema,
    chapterNumber: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    chapterId: v.optional(idSchema),
    change: v.variant('kind', [
      v.strictObject({
        kind: v.literal('instruction'),
        text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(STEERING_INSTRUCTION_MAX))
      }),
      v.strictObject({
        kind: v.literal('addressing'),
        speakerCharacterId: idSchema,
        listenerCharacterId: idSchema,
        speakerPronoun: pronoun,
        recipientPronoun: pronoun,
        secondPerson: v.optional(pronoun)
      }),
      v.strictObject({
        kind: v.literal('term'),
        entryId: idSchema,
        target: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(TERM_TEXT_MAX)),
        notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(TERM_NOTES_MAX)))
      }),
      v.strictObject({
        kind: v.literal('third_person'),
        characterId: idSchema,
        thirdPerson: pronoun
      })
    ])
  }),
  v.check(
    (input) => (input.chapterNumber === undefined) !== (input.chapterId === undefined),
    'Cần đúng một chương: số chương hoặc id chương.'
  )
)
export type AgentTaskSteerInput = v.InferOutput<typeof agentTaskSteerInputSchema>

export interface AgentTaskSteerResult {
  steering: AgentTaskSteeringView
  /** Where it really starts: the first item no run has pinned yet, at or after the asked chapter. */
  effectiveFrom: { itemId: string; chapterId: string; chapterLabel: string }
}

export const agentTaskListInputSchema = v.nullable(v.strictObject({ workId: v.optional(idSchema) }))

export const agentTaskGetInputSchema = v.strictObject({ taskId: idSchema })

/** Pushed to every window after each task state or progress change. */
export interface AgentTaskChanged {
  taskId: string
  workId: string
  state: AgentTaskState
  stateVersion: number
}
