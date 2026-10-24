import * as v from 'valibot'

/** The capability that keeps the session's step list (`add-agent-todo-list`). */
export const TODO_LIST = 'todo_list'

export const AGENT_TODO_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const
export type AgentTodoStatus = (typeof AGENT_TODO_STATUSES)[number]

export interface AgentTodoItem {
  content: string
  status: AgentTodoStatus
}

export const AGENT_TODO_LIMIT = 20
export const AGENT_TODO_CHARS = 200

export const agentTodoItemSchema = v.object({
  content: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Nội dung bước không được để trống.'),
    v.maxLength(AGENT_TODO_CHARS, `Mỗi bước tối đa ${AGENT_TODO_CHARS} ký tự.`)
  ),
  status: v.picklist(
    AGENT_TODO_STATUSES,
    'Trạng thái là pending, in_progress, completed hoặc cancelled.'
  )
})

export const todoListArgsSchema = v.object({
  todos: v.optional(
    v.pipe(
      v.array(agentTodoItemSchema),
      v.maxLength(AGENT_TODO_LIMIT, `Tối đa ${AGENT_TODO_LIMIT} bước.`)
    )
  )
})

/** The list a `todo_list` call wrote, or `null` for a call that only read (or args that do not parse). */
export function todosOf(args: unknown): AgentTodoItem[] | null {
  const parsed = v.safeParse(todoListArgsSchema, args)
  return parsed.success && parsed.output.todos ? parsed.output.todos : null
}

const MARKERS: Record<AgentTodoStatus, string> = {
  completed: '[x]',
  in_progress: '[>]',
  pending: '[ ]',
  cancelled: '[~]'
}

/** The list as plain lines for the model, one step per line. */
export function todoLines(items: readonly AgentTodoItem[]): string {
  return items.map((item) => `${MARKERS[item.status]} ${item.content}`).join('\n')
}
