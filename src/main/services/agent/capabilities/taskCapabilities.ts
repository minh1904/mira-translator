import * as v from 'valibot'
import { CONTEXT_STRATEGIES, type ContextStrategy } from '../../../../shared/contracts/agentTask'
import type { AgentTaskDetailView, AgentTaskSummary } from '../../../../shared/contracts/agentTask'
import { STEERING_INSTRUCTION_MAX } from '../../../../shared/contracts/agentTask'
import { CREATE_TRANSLATION_TASK, STEER_TRANSLATION_TASK } from '../policy'
import type { CapabilityDefinition } from '../types'
import { TARGET_PARAM } from './readCapabilities'

/**
 * Creates a durable task that translates a range of a work's chapters. Policy always asks the user
 * first (it costs money); `AgentService` runs the approved call itself, because the task belongs to the
 * task service, not to the turn.
 */
export const createTranslationTaskCapability: CapabilityDefinition<{
  fromChapter: number
  toChapter: number
  contextStrategy?: ContextStrategy
}> = {
  name: CREATE_TRANSLATION_TASK,
  description:
    'Tạo tác vụ dịch nền cho một dải chương của tác phẩm (theo số chương). Người dùng phải duyệt trước; ' +
    'tác vụ chạy tiếp sau khi lượt chat kết thúc và được điều khiển ở màn Tác vụ. contextStrategy là tùy ' +
    'chọn: bỏ trống thì tác phẩm chưa có glossary sẽ được trích thuật ngữ trước rồi chờ duyệt. Chỉ truyền ' +
    '"approved_only" khi người dùng nói rõ dịch luôn, không trích; "extract_then_review" khi họ muốn trích ' +
    'thuật ngữ cho các chương mới dù đã có glossary.',
  kind: 'external',
  // A reversed range has no chapters, which the task service rejects.
  schema: v.object({
    fromChapter: v.pipe(v.number(), v.integer(), v.minValue(1)),
    toChapter: v.pipe(v.number(), v.integer(), v.minValue(1)),
    contextStrategy: v.optional(v.picklist(CONTEXT_STRATEGIES))
  }),
  parameters: {
    type: 'object',
    properties: {
      target: TARGET_PARAM,
      fromChapter: { type: 'integer', minimum: 1 },
      toChapter: { type: 'integer', minimum: 1 },
      contextStrategy: { type: 'string', enum: [...CONTEXT_STRATEGIES] }
    },
    required: ['target', 'fromChapter', 'toChapter']
  },
  targetPolicy: 'requires_target',
  handler: async () => ({
    ok: false,
    error: { code: 'internal', message: 'Tác vụ chỉ được tạo qua AgentService sau khi duyệt.' }
  }),
  describe: ({ target, args }) =>
    `Tạo tác vụ dịch chương ${args.fromChapter}–${args.toChapter} của "${target?.workLabel ?? ''}"`
}

/**
 * Reads the translation tasks of the target work: chapters by number and state, the instruction in
 * effect and the steering so far, so the model can propose a full new instruction.
 */
export function readTranslationTasksCapability(tasks: {
  list(filter: { workId?: string }): AgentTaskSummary[]
  get(taskId: string): AgentTaskDetailView
}): CapabilityDefinition<Record<string, never>> {
  return {
    name: 'read_translation_tasks',
    description:
      'Đọc các tác vụ dịch nền của tác phẩm: trạng thái từng chương, chỉ dẫn đang áp dụng và các lần ' +
      'điều chỉnh. Dùng trước khi đề xuất điều chỉnh để viết lại toàn văn chỉ dẫn.',
    kind: 'read',
    schema: v.object({}),
    parameters: { type: 'object', properties: { target: TARGET_PARAM }, required: ['target'] },
    targetPolicy: 'requires_target',
    handler: async ({ target, library }) => {
      if (!target) return { ok: false, error: { code: 'validation', message: 'Thiếu tác phẩm.' } }
      const numbers = new Map(
        library.listChapters(target.workId).map((chapter) => [chapter.id, chapter.number])
      )
      return {
        ok: true,
        value: tasks.list({ workId: target.workId }).map((summary) => {
          const detail = tasks.get(summary.id)
          return {
            taskId: summary.id,
            state: summary.state,
            reason: summary.reason,
            chapters: detail.items.map((item) => ({
              number: numbers.get(item.chapterId) ?? null,
              state: item.state
            })),
            currentInstruction: detail.currentInstruction,
            steerings: detail.steerings.map((steering) => ({
              requested: steering.requestedLabel,
              appliesFrom: steering.effectiveLabel,
              kind: steering.kind,
              state: steering.state
            }))
          }
        })
      }
    },
    describe: ({ target }) => `Đọc tác vụ dịch của "${target?.workLabel ?? ''}"`
  }
}

/**
 * Steers a task from a chapter on with a full replacement instruction. Policy asks the user first;
 * `AgentService` runs the approved call and answers with the chapter it really applies from.
 */
export const steerTranslationTaskCapability: CapabilityDefinition<{
  taskId: string
  fromChapter: number
  instruction: string
}> = {
  name: STEER_TRANSLATION_TASK,
  description:
    'Điều chỉnh một tác vụ dịch nền từ một chương trở đi bằng chỉ dẫn mới. "instruction" là TOÀN VĂN chỉ ' +
    'dẫn sẽ áp dụng (thay thế chỉ dẫn cũ, không cộng dồn): đọc chỉ dẫn hiện hành bằng read_translation_tasks ' +
    'rồi viết lại. Chương đang dịch hoặc đã dịch giữ bản cũ; kết quả trả về chương thực sự bắt đầu áp dụng, ' +
    'hãy báo đúng chương đó. Người dùng phải duyệt trước.',
  kind: 'external',
  schema: v.object({
    taskId: v.pipe(v.string(), v.minLength(1)),
    fromChapter: v.pipe(v.number(), v.integer(), v.minValue(1)),
    instruction: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(STEERING_INSTRUCTION_MAX))
  }),
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      fromChapter: { type: 'integer', minimum: 1 },
      instruction: { type: 'string', maxLength: STEERING_INSTRUCTION_MAX }
    },
    required: ['taskId', 'fromChapter', 'instruction']
  },
  targetPolicy: 'no_target',
  handler: async () => ({
    ok: false,
    error: { code: 'internal', message: 'Điều chỉnh chỉ chạy qua AgentService sau khi duyệt.' }
  }),
  describe: ({ args }) => `Điều chỉnh tác vụ dịch từ chương ${args.fromChapter}`
}
