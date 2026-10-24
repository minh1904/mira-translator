import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { Breadcrumb } from '../../../components/ui/Breadcrumb'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { TabsList, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import {
  ACTIVITY_TABS,
  type ActivityTab,
  activityRows,
  countsOfTabs,
  matchesText,
  partitionActivities,
  rowsOfTab
} from '../model/activity'
import { useTaskStore } from '../store/taskStore'
import { ActivityTable } from './ActivityTable'
import { TaskDetail } from './TaskDetail'
import type { TaskActions } from './taskView'
import { useTaskDetail } from './useTaskDetail'

export { QA_RULE_LABELS, REASON_LABELS, taskProgressLabel } from './taskView'

export interface TaskListProps extends TaskActions {
  /** Only the activity of this work (the work's Activity area); all of it when absent. */
  workId?: string
  /** The empty state's main action, "Dịch các chương…"; left out, the empty state has none. */
  onStartTranslate?: () => void
  /** Opens on this task's detail instead of the table, e.g. when arriving from a link. */
  initialTaskId?: string
}

/** Rows shown before "Xem thêm"; a long history does not have to be drawn at once. */
const PAGE = 25

/** The chosen task: its detail is read while it is on screen and dropped after. */
function SelectedTask({
  taskId,
  actions
}: {
  taskId: string
  actions: TaskActions
}): JSX.Element | null {
  const task = useTaskStore((s) => s.tasks.find((each) => each.id === taskId))
  const { detail, quality } = useTaskDetail(taskId)
  if (!task) return null
  return <TaskDetail task={task} detail={detail} quality={quality} {...actions} />
}

/**
 * The Activity screen (change `unify-activity-screen`), laid out like a pipelines page: a table of what
 * needs the person, what runs and what finished, filtered by tab and by text; a task opens on its title
 * into its own page, which a breadcrumb leaves. Durable tasks come from Main and are refetched on mount and
 * on task events.
 */
export function TaskList({
  workId,
  initialTaskId,
  onOpenChapter,
  onReviewContext,
  onOpenSegment,
  onOpenConnections,
  onAskAssistant,
  onStartTranslate
}: TaskListProps): JSX.Element {
  const tasks = useTaskStore((s) => s.tasks)
  const operations = useTaskStore((s) => s.operations)
  const load = useTaskStore((s) => s.load)
  const lastError = useTaskStore((s) => s.lastError)
  const announcement = useTaskStore((s) => s.announcement)
  const refresh = useTaskStore((s) => s.refresh)
  const listen = useTaskStore((s) => s.listen)
  const [tab, setTab] = useState<ActivityTab>('all')
  const [text, setText] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [openedId, setOpenedId] = useState<string | null>(initialTaskId ?? null)
  const table = useRef<HTMLDivElement>(null)
  const lastOpened = useRef<string | null>(null)

  useEffect(() => {
    void refresh()
    return listen()
  }, [refresh, listen])

  // Back from a task puts the focus on the title that was opened.
  useEffect(() => {
    if (openedId === null && lastOpened.current !== null) {
      table.current?.querySelector<HTMLElement>(`[data-task-id="${lastOpened.current}"]`)?.focus()
    }
    lastOpened.current = openedId
  }, [openedId])

  const parts = useMemo(
    () =>
      partitionActivities(
        workId ? tasks.filter((task) => task.workId === workId) : tasks,
        workId ? operations.filter((op) => op.target.workId === workId) : operations,
        Date.now()
      ),
    [tasks, operations, workId]
  )
  const all = useMemo(() => activityRows(parts), [parts])
  const counts = countsOfTabs(all)
  const rows = rowsOfTab(all, tab).filter((row) => matchesText(row.entry, text))

  const actions: TaskActions = {
    onOpenChapter,
    onReviewContext,
    onOpenSegment,
    onOpenConnections,
    onAskAssistant
  }
  const opened = openedId === null ? undefined : tasks.find((task) => task.id === openedId)

  return (
    <div className="@container flex flex-col gap-md">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {lastError && (
        <p role="alert" className="m-0 text-body-sm text-error">
          {lastError}
        </p>
      )}
      {opened ? (
        <>
          <Breadcrumb
            items={[
              { label: 'Hoạt động', onClick: () => setOpenedId(null), title: 'Về danh sách' },
              { label: `Dịch ${opened.workTitle}` }
            ]}
          />
          <div className="rounded-sm border border-default bg-surface">
            <SelectedTask key={opened.id} taskId={opened.id} actions={actions} />
          </div>
        </>
      ) : all.length === 0 ? (
        <EmptyState
          title={load === 'loading' ? 'Đang tải hoạt động…' : 'Chưa có hoạt động'}
          actions={
            onStartTranslate && load !== 'loading' ? (
              <Button variant="solid" onClick={onStartTranslate}>
                Dịch các chương…
              </Button>
            ) : undefined
          }
        >
          Nhờ Trợ lý dịch một dải chương, tác vụ sẽ hiện ở đây.
        </EmptyState>
      ) : (
        <>
          <TabsRoot
            value={tab}
            onValueChange={(value) => {
              setTab(value as ActivityTab)
              setShown(PAGE)
            }}
          >
            <TabsList aria-label="Lọc hoạt động theo trạng thái">
              {ACTIVITY_TABS.map(({ value, label }) => (
                <TabsTab key={value} value={value} className="shrink-0 pb-2xs">
                  {label}
                  <Badge
                    color={value === 'attention' && counts[value] > 0 ? 'warning' : 'neutral'}
                    className="tabular-nums"
                  >
                    {counts[value]}
                  </Badge>
                </TabsTab>
              ))}
            </TabsList>
          </TabsRoot>
          <Input
            aria-label="Lọc hoạt động theo tên tác phẩm hoặc model"
            placeholder="Lọc theo tên tác phẩm hoặc model…"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setShown(PAGE)
            }}
          />
          <div ref={table} className="overflow-hidden rounded-sm border border-default bg-surface">
            {rows.length === 0 ? (
              <p className="m-0 p-md text-body-sm text-muted">Không có hoạt động nào khớp.</p>
            ) : (
              <ActivityTable
                rows={rows.slice(0, shown)}
                now={Date.now()}
                onOpen={(taskId) => setOpenedId(taskId)}
              />
            )}
          </div>
          {rows.length > shown && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShown((count) => count + PAGE)}>
                Xem thêm ({rows.length - shown})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
