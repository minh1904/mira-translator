import type { JSX } from 'react'
import {
  AltArrowRightIcon,
  CheckIcon,
  ChecklistMinimalisticIcon,
  CloseIcon
} from '@renderer/components/ui/reicon'
import type { AgentTodoItem, AgentTodoStatus } from '../../../../../shared/contracts/agentTodo'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'

/** Tên trạng thái cho trình đọc màn hình; icon và kiểu chữ nói lại cùng ý, không chỉ dựa vào màu. */
export const TODO_STATUS_LABEL: Record<AgentTodoStatus, string> = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  completed: 'Đã xong',
  cancelled: 'Đã bỏ'
}

function StatusIcon({ status }: { status: AgentTodoStatus }): JSX.Element {
  if (status === 'completed') {
    return <CheckIcon size={ICON['2xs']} className="text-success-emphasis" aria-hidden="true" />
  }
  if (status === 'in_progress') {
    return <AltArrowRightIcon size={ICON['2xs']} className="text-info" aria-hidden="true" />
  }
  if (status === 'cancelled') {
    return <CloseIcon size={ICON['2xs']} className="text-muted" aria-hidden="true" />
  }
  return (
    <span aria-hidden="true" className="flex size-3 items-center justify-center">
      <span className="size-2 rounded-full border border-strong" />
    </span>
  )
}

/**
 * Danh sách bước model tự ghi bằng `todo_list` (change `add-agent-todo-list`): chỉ hiện tiến độ, không có
 * control. Không phải thẻ kế hoạch: không duyệt, không cấp quyền.
 */
export function TodoCard({ items }: { items: readonly AgentTodoItem[] }): JSX.Element {
  const done = items.filter((item) => item.status === 'completed').length
  return (
    <section
      aria-label="Danh sách bước"
      className="my-1 flex flex-col gap-1.5 rounded-sm border border-default bg-surface p-2 text-body-xs"
    >
      <div className="flex items-center gap-1.5 text-subtle">
        <ChecklistMinimalisticIcon size={ICON['2xs']} aria-hidden="true" />
        <span className="text-label-xs font-semibold text-emphasis">Danh sách bước</span>
        <span className="tabular-nums text-muted">
          {done}/{items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="m-0 text-muted">Danh sách đã được xóa.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <span className="mt-0.5 flex shrink-0">
                <StatusIcon status={item.status} />
              </span>
              <span className="sr-only">{TODO_STATUS_LABEL[item.status]}: </span>
              <span
                className={cn(
                  'min-w-0 wrap-anywhere',
                  item.status === 'in_progress' && 'font-medium text-emphasis',
                  item.status === 'pending' && 'text-default',
                  item.status === 'completed' && 'text-subtle',
                  item.status === 'cancelled' && 'text-muted line-through'
                )}
              >
                {item.content}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
