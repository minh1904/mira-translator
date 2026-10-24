import { useState, type JSX } from 'react'
import type {
  AgentTaskSummary,
  OperationError,
  TaskError
} from '../../../../../shared/contracts/agentTask'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import {
  type ChapterError,
  ERROR_INFO,
  errorAskText,
  errorLabel,
  groupErrors,
  OPTION_HINTS,
  OPTION_LABELS
} from '../model/taskErrorView'
import { useTaskStore } from '../store/taskStore'
import { clockLabel, COMMANDS, type TaskActions } from './taskView'

const OLD_ERROR_OPTIONS: TaskError['options'] = ['retry_now', 'ask_assistant']

const waitLabel = (ms: number): string =>
  `${Math.max(1, Math.round(ms / 1000)).toLocaleString('vi')} giây`

function ErrorActions({
  task,
  error,
  itemId,
  chapterId,
  actions
}: {
  task: AgentTaskSummary
  error: OperationError
  /** The chapter the record belongs to; chapter actions need it. */
  itemId?: string
  chapterId?: string
  actions: TaskActions
}): JSX.Element | null {
  const control = useTaskStore((s) => s.control)
  const options = 'scope' in error ? error.options : OLD_ERROR_OPTIONS
  const accepts = (command: 'retry' | 'continue'): boolean =>
    COMMANDS[task.state].some((each) => each.command === command)
  const buttons: JSX.Element[] = []
  for (const option of options) {
    const label = OPTION_LABELS[option]
    if (option === 'retry_now' && (accepts('retry') || accepts('continue'))) {
      const retry = accepts('retry')
      buttons.push(
        <Button
          key={option}
          variant="outline"
          onClick={() => void control(task.id, retry ? 'retry' : 'continue')}
        >
          {error.code === 'rate_limited' ? 'Thử ngay' : retry ? label : 'Tiếp tục'}
        </Button>
      )
    } else if (option === 'open_connections' && actions.onOpenConnections) {
      buttons.push(
        <Button key={option} variant="outline" onClick={actions.onOpenConnections}>
          {label}
        </Button>
      )
    } else if (option === 'skip_refused' && itemId) {
      buttons.push(
        <Button
          key={option}
          variant="outline"
          onClick={() => void control(task.id, 'skip_refused', itemId)}
        >
          {label}
        </Button>
      )
    } else if (option === 'open_chapter' && chapterId) {
      buttons.push(
        <Button
          key={option}
          variant="ghost"
          onClick={() => actions.onOpenChapter(task.workId, chapterId)}
        >
          {label}
        </Button>
      )
    } else if (option === 'ask_assistant' && actions.onAskAssistant) {
      const ask = actions.onAskAssistant
      buttons.push(
        <Button
          key={option}
          variant="ghost"
          onClick={() => ask(errorAskText(task.workTitle, error))}
        >
          {label}
        </Button>
      )
    }
  }
  const hints = options.map((option) => OPTION_HINTS[option]).filter(Boolean)
  if (buttons.length === 0 && hints.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-xs">
      {buttons}
      {hints.map((hint) => (
        <span key={hint} className="text-body-xs text-muted">
          {hint}
        </span>
      ))}
    </span>
  )
}

/**
 * One error in four parts: what happened, why, what the app did, what you can do. Colour only repeats the
 * written level. Parts without evidence (`tried`, an unknown cause) are left out, not guessed.
 */
export function ErrorBlock({
  task,
  error,
  itemId,
  chapterId,
  title,
  retryAt,
  actions
}: {
  task: AgentTaskSummary
  error: OperationError
  itemId?: string
  chapterId?: string
  /** Replaces the record's own sentence, e.g. "12 chương chờ hạn mức". */
  title?: string
  retryAt?: number | null
  actions: TaskActions
}): JSX.Element {
  const record = 'scope' in error ? error : null
  const legacy = 'scope' in error ? null : error
  const info = ERROR_INFO[record?.code ?? 'unknown']
  const why = record?.cause ?? legacy?.message ?? info.why
  const tried = record?.tried
  const did = [
    tried?.attempts !== undefined ? `đã thử ${tried.attempts} lần` : null,
    tried?.keySwitched ? 'đã đổi sang khóa khác' : null
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-2xs text-body-sm">
      <p className="m-0 flex flex-wrap items-center gap-xs">
        <Badge color={info.level === 'warning' ? 'warning' : 'error'} variant="plain" dot>
          {info.level === 'warning' ? 'Cảnh báo' : 'Lỗi'} · {errorLabel(error)}
        </Badge>
        <span className="min-w-0 flex-1 wrap-anywhere">
          {title ?? record?.what ?? 'Lỗi không rõ loại'}
        </span>
      </p>
      <p className="m-0 wrap-anywhere text-body-xs text-muted">
        <span className="text-subtle">Vì sao: </span>
        {why}
        {record?.retryAfterMs !== undefined && !retryAt
          ? ` Nhà cung cấp báo chờ ${waitLabel(record.retryAfterMs)}.`
          : ''}
        {retryAt ? ` Thử lại được lúc ${clockLabel(retryAt)}.` : ''}
      </p>
      {did.length > 0 && (
        <p className="m-0 text-body-xs text-muted">
          <span className="text-subtle">App đã: </span>
          {did.join(', ')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-xs">
        <span className="text-body-xs text-subtle">Bạn có thể:</span>
        <ErrorActions
          task={task}
          error={error}
          itemId={itemId}
          chapterId={chapterId}
          actions={actions}
        />
      </div>
    </div>
  )
}

function GroupBlock({
  task,
  group,
  actions
}: {
  task: AgentTaskSummary
  group: ReturnType<typeof groupErrors>[number]
  actions: TaskActions
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const many = group.chapters.length > 1
  const [first] = group.chapters
  return (
    <li className="flex flex-col gap-xs">
      <ErrorBlock
        task={task}
        error={group.error}
        // A single chapter keeps its own actions; a group acts on the task.
        itemId={many ? undefined : first?.itemId}
        chapterId={many ? undefined : first?.chapterId}
        title={many ? `${group.chapters.length} chương ${ERROR_INFO[group.code].short}` : undefined}
        retryAt={many ? group.retryAt : null}
        actions={actions}
      />
      {many && (
        <>
          <Button
            variant="ghost"
            aria-expanded={open}
            className="self-start"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Ẩn danh sách chương' : 'Xem danh sách chương'}
          </Button>
          {open && (
            <ul className="m-0 flex list-none flex-col gap-3xs p-0 pl-md text-body-xs text-muted">
              {group.chapters.map((each) => (
                <li key={each.itemId} className="flex flex-wrap items-center gap-xs">
                  <span className="min-w-0 flex-1 truncate">{each.chapterLabel}</span>
                  <Button
                    variant="ghost"
                    onClick={() => actions.onOpenChapter(task.workId, each.chapterId)}
                  >
                    Mở chương
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

/** The errors of a task grouped by cause: twelve chapters waiting on the same quota are one line. */
export function ErrorGroups({
  task,
  errors,
  actions
}: {
  task: AgentTaskSummary
  errors: ChapterError[]
  actions: TaskActions
}): JSX.Element | null {
  if (errors.length === 0) return null
  return (
    <ul aria-label="Lỗi cần xử lý" className="m-0 flex list-none flex-col gap-sm p-0">
      {groupErrors(errors).map((group) => (
        <GroupBlock key={group.key} task={task} group={group} actions={actions} />
      ))}
    </ul>
  )
}
