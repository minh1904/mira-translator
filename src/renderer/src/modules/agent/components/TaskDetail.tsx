import { useState, type JSX } from 'react'
import type {
  AgentTaskDetailView,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import type { TaskQualityView } from '../../../../../shared/contracts/taskQuality'
import { Badge } from '../../../components/ui/Badge'
import { LinkButton } from '../../../components/ui/Button'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { TabsList, TabsPanel, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import { isCleanCompletion } from '../model/activity'
import { chapterErrorsOf } from '../model/taskErrorView'
import { TASK_STATE_LABELS } from '../store/taskStore'
import { ChaptersPanel } from './ChaptersPanel'
import { ErrorGroups } from './ErrorBlock'
import { QualityPanel, warningsTabLabel } from './QualityPanel'
import { RunsPanel } from './RunsPanel'
import { SteeringPanel } from './SteeringPanel'
import { TaskControls } from './TaskControls'
import {
  durationLabel,
  REASON_LABELS,
  STATE_COLORS,
  taskProgressLabel,
  taskTotal,
  type TaskActions
} from './taskView'
import { useElapsed } from './useTaskDetail'
import { UsageDisplay } from './UsageDisplay'

export type DetailTab = 'chapters' | 'warnings' | 'steering' | 'runs'

/**
 * The chosen task: a header that stays in view (name, state, progress, controls, tabs) over four tabs, one
 * at a time: the chapters, the quality warnings, how it translates, and its runs. Errors stay above the
 * tabs while there are any, so they are not hidden by whichever tab is open.
 */
export function TaskDetail({
  task,
  detail,
  quality,
  initialTab = 'chapters',
  ...actions
}: {
  task: AgentTaskSummary
  detail: AgentTaskDetailView | undefined
  quality: TaskQualityView | undefined
  initialTab?: DetailTab
} & TaskActions): JSX.Element {
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [runsItem, setRunsItem] = useState<string | null>(null)
  const total = taskTotal(task)
  const running = task.state === 'running' || task.state === 'pausing'
  const clean = isCleanCompletion(task)
  const progressLabel = taskProgressLabel(task)
  // Every chapter being translated, and how long the earliest has been going; a local clock, no events.
  const current = running ? (detail?.items.filter((item) => item.state === 'running') ?? []) : []
  const earliest = current
    .map((item) => item.lastRun?.startedAt)
    .filter((at): at is number => at !== undefined)
    .sort((a, b) => a - b)[0]
  const elapsed = useElapsed(earliest ?? null)
  const errors = detail ? chapterErrorsOf(detail) : []

  return (
    <TabsRoot value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
      <header className="sticky top-0 z-(--mira-z-sticky) flex flex-col gap-xs bg-surface px-md pt-sm">
        <div className="flex flex-wrap items-center gap-x-sm gap-y-xs">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-xs">
            <h3 className="m-0 min-w-0 truncate text-label-md">
              Dịch {total} chương · {task.workTitle}
            </h3>
            {!clean && (
              <Badge color={STATE_COLORS[task.state]} dot className="shrink-0">
                {TASK_STATE_LABELS[task.state]}
                {task.reason ? ` · ${REASON_LABELS[task.reason]}` : ''}
              </Badge>
            )}
          </div>
          <TaskControls task={task} onReviewContext={actions.onReviewContext} />
        </div>
        {clean ? (
          <p className="m-0 text-body-xs text-muted tabular-nums">
            xong {task.counts.completed}/{total} chương
          </p>
        ) : (
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
        )}
        {running && task.extracting && (
          <p role="status" className="m-0 text-body-xs text-muted motion-safe:animate-pulse">
            Đang trích thuật ngữ trước khi dịch · {task.extracting.calls.toLocaleString('vi')} lượt
            gọi
          </p>
        )}
        <p className="m-0 flex flex-wrap items-center gap-x-xs text-body-xs text-muted tabular-nums">
          <span>{task.modelLabel}</span>
          <span>· {durationLabel(task.updatedAt - task.createdAt)}</span>
          {current.length > 0 && (
            <span>
              · Đang dịch {current.map((item) => item.chapterLabel).join(', ')}
              {elapsed !== null ? ` · ${durationLabel(elapsed)}` : ''}
            </span>
          )}
        </p>
        <UsageDisplay usage={task.usage} costUsd={task.costUsd ?? null} />
        {detail && detail.contextQuestions > 0 && actions.onReviewContext && (
          <p className="m-0 text-body-xs">
            <LinkButton onClick={() => actions.onReviewContext?.(task.workId, 'review')}>
              {detail.contextQuestions} câu hỏi ngữ cảnh
            </LinkButton>
          </p>
        )}
        {detail && (
          <TabsList aria-label="Chi tiết tác vụ" className="mt-2xs">
            <TabsTab value="chapters">Chương</TabsTab>
            <TabsTab value="warnings">{warningsTabLabel(quality)}</TabsTab>
            <TabsTab value="steering">Cách dịch</TabsTab>
            <TabsTab value="runs">Lần chạy</TabsTab>
          </TabsList>
        )}
      </header>
      <div className="flex flex-col gap-md p-md">
        {!detail ? (
          <p role="status" className="m-0 text-body-sm text-muted">
            Đang tải chi tiết…
          </p>
        ) : (
          <>
            <ErrorGroups task={task} errors={errors} actions={actions} />
            <TabsPanel value="chapters" className="outline-none">
              <ChaptersPanel
                task={task}
                detail={detail}
                onOpenChapter={actions.onOpenChapter}
                onShowRuns={(itemId) => {
                  setRunsItem(itemId)
                  setTab('runs')
                }}
              />
            </TabsPanel>
            <TabsPanel value="warnings" className="outline-none">
              {quality ? (
                <QualityPanel task={task} quality={quality} onOpenSegment={actions.onOpenSegment} />
              ) : (
                <p className="m-0 text-body-sm text-muted">Đang đọc cảnh báo…</p>
              )}
            </TabsPanel>
            <TabsPanel value="steering" className="outline-none">
              <SteeringPanel task={task} detail={detail} onAskAssistant={actions.onAskAssistant} />
            </TabsPanel>
            <TabsPanel value="runs" className="outline-none">
              <RunsPanel taskId={task.id} detail={detail} itemId={runsItem} />
            </TabsPanel>
          </>
        )}
      </div>
    </TabsRoot>
  )
}
