import type { JSX } from 'react'
import type { AgentOperation } from '../../../../../shared/contracts/agent'
import type { AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import { Badge } from '../../../components/ui/Badge'
import { CardButton } from '../../../components/ui/CardButton'
import { ICON } from '../../../components/ui/icon'
import { CheckIcon } from '../../../components/ui/reicon'
import { cn } from '../../../lib/cn'
import {
  type ActivityBlock,
  type ActivityRow,
  isCleanCompletion,
  operationMessage,
  whenLabel
} from '../model/activity'
import { TASK_STATE_LABELS } from '../store/taskStore'
import { ChapterStrip } from './ChapterStrip'
import { CAPABILITY_LABELS, stateInfo } from './OperationCard'
import { TaskRowActions } from './TaskRowActions'
import { durationLabel, REASON_LABELS, STATE_COLORS, taskTotal } from './taskView'

/** Columns that give way first when the screen's own width runs short. */
const WIDE = 'hidden @min-[880px]:table-cell'
const WIDER = 'hidden @min-[760px]:table-cell'

const cell = 'px-sm py-sm align-top'

/** A finished task is a quiet "Xong"; only what runs or went wrong gets a coloured badge. */
function TaskStatus({ task }: { task: AgentTaskSummary }): JSX.Element {
  if (isCleanCompletion(task)) {
    return (
      <span className="inline-flex items-center gap-2xs text-label-xs text-subtle">
        <CheckIcon size={ICON.xs} aria-hidden />
        Xong
      </span>
    )
  }
  return (
    <Badge color={STATE_COLORS[task.state]} dot>
      {TASK_STATE_LABELS[task.state]}
    </Badge>
  )
}

function TaskRow({
  task,
  block,
  now,
  onOpen
}: {
  task: AgentTaskSummary
  block: ActivityBlock
  now: number
  onOpen: (taskId: string) => void
}): JSX.Element {
  const total = taskTotal(task)
  return (
    <tr className="border-b border-subtle last:border-b-0 hover:bg-hover">
      <td className={cell}>
        <span className="flex flex-col gap-2xs">
          <TaskStatus task={task} />
          <span className="flex flex-col gap-3xs text-body-xs text-muted tabular-nums">
            <span>{durationLabel(task.updatedAt - task.createdAt)}</span>
            <span>{whenLabel(task.updatedAt, now)}</span>
          </span>
        </span>
      </td>
      <td className={cn(cell, 'min-w-0')}>
        <span className="flex min-w-0 flex-col gap-2xs">
          <CardButton
            data-task-id={task.id}
            onClick={() => onOpen(task.id)}
            title={`Dịch ${total} chương · ${task.workTitle}`}
            className="block w-full rounded-none border-0 bg-transparent p-0 text-label-sm shadow-none hover:border-0 hover:shadow-none hover:underline"
          >
            <span className="block truncate">
              Dịch {total} chương · {task.workTitle}
            </span>
          </CardButton>
          <span className="flex min-w-0 flex-wrap items-center gap-xs text-body-xs">
            <Badge variant="outline" className="max-w-full truncate">
              {task.modelLabel}
            </Badge>
            {block === 'attention' && task.reason && (
              <span className="text-subtle">{REASON_LABELS[task.reason]}</span>
            )}
          </span>
        </span>
      </td>
      <td className={cn(cell, WIDE, 'text-body-sm text-subtle')}>
        {task.originTurnId ? 'Trợ lý' : 'Bạn'}
      </td>
      <td className={cn(cell, WIDER)}>
        <ChapterStrip task={task} />
      </td>
      <td className={cn(cell, 'text-right')}>
        <TaskRowActions task={task} />
      </td>
    </tr>
  )
}

/** A chat run (an edit by the Assistant): the same columns, no detail to open and nothing to control. */
function ChatRow({ operation, now }: { operation: AgentOperation; now: number }): JSX.Element {
  const state = stateInfo(operation.state)
  const problem = operation.state === 'failed' || operation.state === 'conflict'
  const message = operationMessage(operation)
  const { target } = operation
  return (
    <tr className="border-b border-subtle last:border-b-0 hover:bg-hover">
      <td className={cell}>
        <span className="flex flex-col gap-2xs">
          {problem ? (
            <Badge color={state.color} dot>
              {state.label}
            </Badge>
          ) : (
            <span className="inline-flex items-center gap-2xs text-label-xs text-subtle">
              <CheckIcon size={ICON.xs} aria-hidden />
              Xong
            </span>
          )}
          <span className="text-body-xs text-muted tabular-nums">
            {whenLabel(operation.updatedAt, now)}
          </span>
        </span>
      </td>
      <td className={cn(cell, 'min-w-0')}>
        <span className="flex min-w-0 flex-col gap-2xs">
          <span
            className="truncate text-label-sm"
            title={`${CAPABILITY_LABELS[operation.capability] ?? operation.capability}`}
          >
            {CAPABILITY_LABELS[operation.capability] ?? operation.capability} ·{' '}
            {target.kind === 'chapter'
              ? `${target.workLabel} › ${target.chapterLabel}`
              : target.workLabel}
          </span>
          {problem && message && (
            <span className="wrap-anywhere text-body-xs text-error">{message}</span>
          )}
          <Badge variant="outline" className="self-start">
            Chat
          </Badge>
        </span>
      </td>
      <td className={cn(cell, WIDE, 'text-body-sm text-subtle')}>Trợ lý</td>
      <td className={cn(cell, WIDER, 'text-body-xs text-muted')}>—</td>
      <td className={cell} />
    </tr>
  )
}

/**
 * Activity as a table, the way a pipelines page lists runs: status with how long and how long ago, what it
 * is, who started it, its chapters as a strip, and its commands. A task opens on its title.
 */
export function ActivityTable({
  rows,
  now,
  onOpen
}: {
  rows: readonly ActivityRow[]
  now: number
  onOpen: (taskId: string) => void
}): JSX.Element {
  return (
    <table className="w-full table-fixed border-collapse text-body-sm">
      <colgroup>
        <col className="w-40" />
        <col />
        <col className="hidden w-28 @min-[880px]:table-column" />
        <col className="hidden w-56 @min-[760px]:table-column" />
        <col className="w-24" />
      </colgroup>
      <thead>
        <tr className="border-b border-default text-left text-label-xs text-subtle">
          <th scope="col" className={cn(cell, 'font-medium')}>
            Trạng thái
          </th>
          <th scope="col" className={cn(cell, 'font-medium')}>
            Hoạt động
          </th>
          <th scope="col" className={cn(cell, WIDE, 'font-medium')}>
            Tạo bởi
          </th>
          <th scope="col" className={cn(cell, WIDER, 'font-medium')}>
            Chương
          </th>
          <th scope="col" className={cn(cell, 'text-right font-medium')}>
            <span className="sr-only">Thao tác</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ block, entry }) =>
          entry.kind === 'task' ? (
            <TaskRow
              key={entry.task.id}
              task={entry.task}
              block={block}
              now={now}
              onOpen={onOpen}
            />
          ) : (
            <ChatRow key={entry.operation.id} operation={entry.operation} now={now} />
          )
        )}
      </tbody>
    </table>
  )
}
