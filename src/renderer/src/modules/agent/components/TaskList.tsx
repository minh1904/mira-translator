import { useEffect, useState, type JSX } from 'react'
import type {
  AgentTaskCommand,
  AgentTaskItemState,
  AgentTaskReason,
  AgentTaskDetailView,
  AgentTaskState,
  AgentTaskSteeringState,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import { STEERING_INSTRUCTION_MAX } from '../../../../../shared/contracts/agentTask'
import type {
  QaFinding,
  QaRuleCode,
  TaskQualityView
} from '../../../../../shared/contracts/taskQuality'
import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Field } from '../../../components/ui/Field'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { TASK_STATE_LABELS, useTaskStore } from '../store/taskStore'
import { UsageDisplay } from './UsageDisplay'

const STATE_COLORS: Record<AgentTaskState, BadgeColor> = {
  queued: 'neutral',
  running: 'info',
  pausing: 'info',
  paused: 'warning',
  waiting_user: 'warning',
  cancelling: 'neutral',
  cancelled: 'neutral',
  completed: 'success',
  partially_completed: 'warning',
  failed: 'error'
}

const ITEM_LABELS: Record<AgentTaskItemState, { label: string; color: BadgeColor }> = {
  queued: { label: 'Đang chờ', color: 'neutral' },
  running: { label: 'Đang dịch', color: 'info' },
  waiting_user: { label: 'Chờ bạn', color: 'warning' },
  completed: { label: 'Xong', color: 'success' },
  failed: { label: 'Lỗi', color: 'error' },
  skipped: { label: 'Bỏ qua', color: 'neutral' },
  cancelled: { label: 'Đã hủy', color: 'neutral' }
}

export const REASON_LABELS: Record<AgentTaskReason, string> = {
  missing_raw: 'chương chưa có bản gốc',
  conflict: 'nội dung đã đổi, cần bạn xem lại',
  budget: 'đã chạm trần ngân sách',
  provider: 'kết nối hoặc model báo lỗi',
  refused: 'nhà cung cấp từ chối một số đoạn',
  context_review: 'cần duyệt ngữ cảnh',
  app_closed: 'ứng dụng đã đóng',
  recovered_after_restart: 'khôi phục sau khi mở lại',
  user: 'bạn đã tạm dừng'
}

/** The commands a task in `state` accepts (transition table of the spec). */
const COMMANDS: Record<AgentTaskState, Array<{ command: AgentTaskCommand; label: string }>> = {
  queued: [
    { command: 'pause', label: 'Tạm dừng' },
    { command: 'cancel', label: 'Hủy' }
  ],
  running: [
    { command: 'pause', label: 'Tạm dừng' },
    { command: 'cancel', label: 'Hủy' }
  ],
  pausing: [{ command: 'cancel', label: 'Hủy' }],
  paused: [
    { command: 'continue', label: 'Tiếp tục' },
    { command: 'cancel', label: 'Hủy' }
  ],
  waiting_user: [
    { command: 'continue', label: 'Tiếp tục' },
    { command: 'cancel', label: 'Hủy' }
  ],
  cancelling: [],
  failed: [
    { command: 'retry', label: 'Thử lại' },
    { command: 'run_again', label: 'Chạy lại' }
  ],
  partially_completed: [
    { command: 'retry', label: 'Thử lại mục lỗi' },
    { command: 'run_again', label: 'Chạy lại' }
  ],
  completed: [{ command: 'run_again', label: 'Chạy lại' }],
  cancelled: [{ command: 'run_again', label: 'Chạy lại' }]
}

const STEERING_STATES: Record<AgentTaskSteeringState, { label: string; color: BadgeColor }> = {
  accepted: { label: 'Chờ áp dụng', color: 'info' },
  applied: { label: 'Đã áp dụng', color: 'success' },
  superseded: { label: 'Bị thay', color: 'neutral' }
}

/** States that still take steering (the rest are finished or cancelling). */
const STEERABLE: readonly AgentTaskState[] = [
  'queued',
  'running',
  'pausing',
  'paused',
  'waiting_user'
]

/**
 * Steering of a task: what was asked and where it really applies, and a form for a new full
 * instruction from a chapter on (change `add-agent-steering`).
 */
function SteeringPanel({
  task,
  detail
}: {
  task: AgentTaskSummary
  detail: AgentTaskDetailView
}): JSX.Element {
  const steer = useTaskStore((s) => s.steer)
  const [chapter, setChapter] = useState('')
  const [text, setText] = useState(detail.currentInstruction ?? '')
  const number = Number(chapter)
  const ready = Number.isInteger(number) && number >= 1 && text.trim() !== ''

  return (
    <div className="flex flex-col gap-xs">
      {detail.steerings.length > 0 && (
        <ul aria-label="Các lần điều chỉnh" className="m-0 flex list-none flex-col gap-2xs p-0">
          {detail.steerings.map((steering) => (
            <li key={steering.id} className="flex flex-wrap items-center gap-xs text-body-sm">
              <span className="min-w-0 flex-1">
                {steering.kind === 'instruction' ? 'Chỉ dẫn' : 'Xưng hô'} · yêu cầu từ{' '}
                {steering.requestedLabel} · áp dụng từ {steering.effectiveLabel}
              </span>
              <Badge color={STEERING_STATES[steering.state].color} variant="plain" dot>
                {STEERING_STATES[steering.state].label}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {STEERABLE.includes(task.state) && (
        <form
          aria-label="Điều chỉnh tác vụ"
          className="flex flex-col gap-xs"
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) void steer(task.id, number, text.trim()).then((ok) => ok && setChapter(''))
          }}
        >
          <Field label="Từ chương" hint="Chương đang dịch hoặc đã dịch giữ bản cũ.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                min={1}
                className="w-32"
                value={chapter}
                onChange={(event) => setChapter(event.target.value)}
              />
            )}
          </Field>
          <Field label="Chỉ dẫn (toàn văn, thay chỉ dẫn cũ)">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                maxLength={STEERING_INSTRUCTION_MAX}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
          <div>
            <Button type="submit" disabled={!ready}>
              Áp dụng điều chỉnh
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Every rule has a written label: colour is never the only signal. */
export const QA_RULE_LABELS: Record<QaRuleCode, string> = {
  'glossary.forbidden_used': 'Từ bị cấm',
  'glossary.missing_target': 'Thiếu thuật ngữ',
  'addressing.unexpected_pronoun': 'Xưng hô lệch',
  'addressing.inconsistent_pair': 'Xưng hô không nhất quán',
  'text.residual_source': 'Còn chữ gốc',
  'text.length_ratio': 'Độ dài bất thường',
  'text.repetition': 'Lặp bất thường',
  'text.unbalanced_quotes': 'Ngoặc không cân'
}

function FindingRow({
  task,
  itemId,
  finding,
  onOpenSegment
}: {
  task: AgentTaskSummary
  itemId: string
  finding: QaFinding
  onOpenSegment: TaskListProps['onOpenSegment']
}): JSX.Element {
  const dismiss = useTaskStore((s) => s.dismiss)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <li className="flex flex-col gap-2xs text-body-sm">
      <div className="flex flex-wrap items-center gap-xs">
        <Badge color="warning" variant="plain">
          Cảnh báo · {QA_RULE_LABELS[finding.ruleCode]}
        </Badge>
        <span className="min-w-0 flex-1">{finding.message}</span>
        {onOpenSegment && (
          <Button
            variant="ghost"
            onClick={() => onOpenSegment(task.workId, finding.chapterId, finding.paragraphIndex)}
          >
            Mở đoạn
          </Button>
        )}
        {!asking && (
          <Button variant="ghost" onClick={() => setAsking(true)}>
            Bỏ qua
          </Button>
        )}
      </div>
      <span className="text-body-xs text-muted">Bằng chứng: {finding.evidence}</span>
      {asking && (
        <form
          aria-label="Bỏ qua cảnh báo"
          className="flex flex-wrap items-end gap-xs"
          onSubmit={(event) => {
            event.preventDefault()
            void dismiss(task.id, itemId, finding, reason)
          }}
        >
          <Field label="Lý do (không bắt buộc)" className="min-w-0 flex-1">
            {({ id }) => (
              <Input id={id} value={reason} onChange={(event) => setReason(event.target.value)} />
            )}
          </Field>
          <Button type="submit">Xác nhận bỏ qua</Button>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Hủy
          </Button>
        </form>
      )}
    </li>
  )
}

/**
 * Quality warnings of a task (change `add-translation-task-qa`): only warnings, counted, never a score or
 * "100% correct"; an item with nothing to check says N/A.
 */
function QualityPanel({
  task,
  quality,
  onOpenSegment
}: {
  task: AgentTaskSummary
  quality: TaskQualityView
  onOpenSegment: TaskListProps['onOpenSegment']
}): JSX.Element {
  const checked = quality.items.filter((item) => item.status === 'checked')
  return (
    <section aria-label="Cảnh báo chất lượng" className="flex flex-col gap-xs">
      <h4 className="m-0 text-label-sm">
        {quality.openCount > 0
          ? `Cảnh báo chất lượng: ${quality.openCount} đang mở`
          : checked.length > 0
            ? 'Không có cảnh báo đang mở'
            : 'Chưa có chương nào để kiểm'}
      </h4>
      {quality.items.map((item) =>
        item.status === 'na' ? (
          <p key={item.itemId} className="m-0 text-body-xs text-muted">
            {item.chapterLabel}: N/A, chưa có bản dịch để kiểm
          </p>
        ) : item.findings.length > 0 ? (
          <div key={item.itemId} className="flex flex-col gap-2xs">
            <span className="text-body-xs text-muted">{item.chapterLabel}</span>
            <ul className="m-0 flex list-none flex-col gap-xs p-0">
              {item.findings.map((finding) => (
                <FindingRow
                  key={finding.ruleCode + finding.segmentId}
                  task={task}
                  itemId={item.itemId}
                  finding={finding}
                  onOpenSegment={onOpenSegment}
                />
              ))}
            </ul>
          </div>
        ) : null
      )}
    </section>
  )
}

export interface TaskListProps {
  /** Only the tasks of this work (the work's Tasks area); all tasks when absent. */
  workId?: string
  onOpenChapter: (workId: string, chapterId: string) => void
  /** "Xem ngữ cảnh" of a task left waiting for context review before review was dropped. */
  onReviewContext?: (workId: string) => void
  /** "Mở đoạn" of a quality warning: the chapter, scrolled to the source paragraph. */
  onOpenSegment?: (workId: string, chapterId: string, paragraphIndex: number) => void
}

/** Progress in words: never "done" while an item failed or waits. */
export function taskProgressLabel(task: AgentTaskSummary): string {
  const total = Object.values(task.counts).reduce((sum, count) => sum + count, 0)
  const parts = [`${task.counts.completed}/${total} chương`]
  if (task.counts.failed > 0) parts.push(`${task.counts.failed} lỗi`)
  if (task.counts.waiting_user > 0) parts.push(`${task.counts.waiting_user} chờ bạn`)
  if (task.counts.skipped > 0) parts.push(`${task.counts.skipped} bỏ qua`)
  return parts.join(' · ')
}

function TaskRow({
  task,
  onOpenChapter,
  onReviewContext,
  onOpenSegment
}: {
  task: AgentTaskSummary
  onOpenChapter: TaskListProps['onOpenChapter']
  onReviewContext: TaskListProps['onReviewContext']
  onOpenSegment: TaskListProps['onOpenSegment']
}): JSX.Element {
  const detail = useTaskStore((s) => s.details[task.id])
  const quality = useTaskStore((s) => s.quality[task.id])
  const control = useTaskStore((s) => s.control)
  const expand = useTaskStore((s) => s.expand)
  const collapse = useTaskStore((s) => s.collapse)
  const total = Object.values(task.counts).reduce((sum, count) => sum + count, 0)
  const running = task.state === 'running' || task.state === 'pausing'
  const progressLabel = taskProgressLabel(task)

  return (
    <li className="flex flex-col gap-sm border-b border-subtle px-md py-sm last:border-b-0">
      <div className="flex flex-wrap items-start gap-sm">
        <div className="flex min-w-0 flex-1 flex-col gap-3xs">
          <span className="truncate text-label-sm">
            Dịch {total} chương · {task.workTitle}
          </span>
          <span className="truncate text-body-xs text-muted">{task.modelLabel}</span>
        </div>
        <Badge color={STATE_COLORS[task.state]} dot>
          {TASK_STATE_LABELS[task.state]}
          {task.reason ? ` · ${REASON_LABELS[task.reason]}` : ''}
        </Badge>
      </div>
      <div className="flex items-center gap-xs">
        <ProgressBar
          value={total === 0 ? 0 : (task.counts.completed / total) * 100}
          tone={task.state === 'failed' ? 'error' : running ? 'info' : 'neutral'}
          label={`Tác vụ dịch ${task.workTitle}: ${progressLabel}`}
        />
        <span className="shrink-0 text-body-xs whitespace-nowrap text-muted tabular-nums">
          {progressLabel}
        </span>
      </div>
      {running && task.extracting && (
        <p role="status" className="m-0 text-body-xs text-muted motion-safe:animate-pulse">
          Đang trích thuật ngữ trước khi dịch · {task.extracting.calls.toLocaleString('vi')} lượt
          gọi
        </p>
      )}
      <UsageDisplay usage={task.usage} />
      <div className="flex flex-wrap items-center gap-xs">
        {task.reason === 'context_review' && onReviewContext && (
          <Button variant="solid" onClick={() => onReviewContext(task.workId)}>
            Xem ngữ cảnh
          </Button>
        )}
        {COMMANDS[task.state].map(({ command, label }) => (
          <Button
            key={command}
            variant={command === 'continue' || command === 'retry' ? 'solid' : 'outline'}
            color={command === 'cancel' ? 'danger' : 'neutral'}
            onClick={() => void control(task.id, command)}
          >
            {label}
          </Button>
        ))}
        <Button
          variant="ghost"
          aria-expanded={detail !== undefined}
          onClick={() => (detail ? collapse(task.id) : void expand(task.id))}
        >
          {detail ? 'Ẩn các chương' : 'Xem các chương'}
        </Button>
      </div>
      {detail && (
        <ol aria-label="Các chương của tác vụ" className="m-0 flex list-none flex-col gap-2xs p-0">
          {detail.items.map((item) => {
            const look = ITEM_LABELS[item.state]
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-xs text-body-sm">
                <span className="min-w-0 flex-1 truncate">{item.chapterLabel}</span>
                {item.progress && (
                  <span className="text-body-xs text-muted tabular-nums">
                    {item.progress.applied}/{item.progress.total} câu
                    {item.skippedSegments.length > 0
                      ? ` · bỏ qua ${item.skippedSegments.length} đoạn`
                      : ''}
                  </span>
                )}
                <Badge color={look.color} variant="plain" dot>
                  {look.label}
                  {item.reason ? ` · ${REASON_LABELS[item.reason]}` : ''}
                </Badge>
                {item.state === 'failed' && item.reason === 'refused' && (
                  <Button onClick={() => void control(task.id, 'skip_refused', item.id)}>
                    Bỏ qua đoạn bị từ chối
                  </Button>
                )}
                {(item.state === 'queued' ||
                  item.state === 'waiting_user' ||
                  item.state === 'failed') && (
                  <Button
                    variant="ghost"
                    onClick={() => void control(task.id, 'skip_item', item.id)}
                  >
                    Bỏ qua chương
                  </Button>
                )}
                <Button variant="ghost" onClick={() => onOpenChapter(task.workId, item.chapterId)}>
                  Mở đích
                </Button>
                {item.instruction !== undefined && (
                  <span className="basis-full truncate text-body-xs text-muted">
                    {item.instruction ? `Chỉ dẫn: ${item.instruction}` : 'Không có chỉ dẫn'}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {detail && quality && (
        <QualityPanel task={task} quality={quality} onOpenSegment={onOpenSegment} />
      )}
      {detail && <SteeringPanel task={task} detail={detail} />}
    </li>
  )
}

/** Durable tasks read from Main; refetched on mount and on every `agentTaskChanged`. */
export function TaskList({
  workId,
  onOpenChapter,
  onReviewContext,
  onOpenSegment
}: TaskListProps): JSX.Element {
  const tasks = useTaskStore((s) => s.tasks)
  const load = useTaskStore((s) => s.load)
  const lastError = useTaskStore((s) => s.lastError)
  const announcement = useTaskStore((s) => s.announcement)
  const refresh = useTaskStore((s) => s.refresh)
  const listen = useTaskStore((s) => s.listen)

  useEffect(() => {
    void refresh()
    return listen()
  }, [refresh, listen])

  const shown = workId ? tasks.filter((task) => task.workId === workId) : tasks
  return (
    <div className="flex flex-col gap-sm">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {lastError && (
        <p role="alert" className="m-0 text-body-sm text-error">
          {lastError}
        </p>
      )}
      {shown.length === 0 ? (
        <EmptyState title={load === 'loading' ? 'Đang tải tác vụ…' : 'Chưa có tác vụ'}>
          Nhờ Trợ lý dịch một dải chương, tác vụ sẽ hiện ở đây.
        </EmptyState>
      ) : (
        <ul
          aria-label="Tác vụ"
          className="m-0 list-none overflow-hidden rounded-sm border border-default bg-surface p-0"
        >
          {shown.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpenChapter={onOpenChapter}
              onReviewContext={onReviewContext}
              onOpenSegment={onOpenSegment}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
