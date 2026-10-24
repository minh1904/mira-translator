import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import {
  isTaskError,
  type AgentTaskRunsView,
  type AgentTaskRunView
} from '../../../../../shared/contracts/agentTask'
import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ButtonGroup } from '../../../components/ui/ButtonGroup'
import { Disclosure } from '../../../components/ui/Disclosure'
import { ERROR_INFO, errorLabel } from '../model/taskErrorView'
import { getScrollBehavior, shouldAutoScroll } from './AutoScrollSentinel'
import { durationLabel } from './taskView'

type Filter = 'all' | 'warning' | 'error'
type Level = 'ok' | 'warning' | 'error'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'warning', label: 'Cảnh báo' },
  { value: 'error', label: 'Lỗi' }
]

const RESULT: Record<string, { label: string; color: BadgeColor }> = {
  queued: { label: 'Đang chờ', color: 'neutral' },
  running: { label: 'Đang chạy', color: 'info' },
  completed: { label: 'Xong', color: 'neutral' },
  partially_completed: { label: 'Một phần', color: 'warning' },
  conflict: { label: 'Xung đột', color: 'error' },
  failed: { label: 'Lỗi', color: 'error' },
  cancelled: { label: 'Đã dừng', color: 'neutral' },
  interrupted: { label: 'Bị ngắt', color: 'neutral' }
}

/** A run's level: only warnings and errors are coloured; a success is plain text. */
export function runLevel(run: Pick<AgentTaskRunView, 'state' | 'error'>): Level {
  if (run.error)
    return isTaskError(run.error) && ERROR_INFO[run.error.code].level === 'warning'
      ? 'warning'
      : 'error'
  return run.state === 'failed' || run.state === 'conflict'
    ? 'error'
    : run.state === 'partially_completed'
      ? 'warning'
      : 'ok'
}

export const runsOfLevel = (
  runs: readonly AgentTaskRunView[],
  filter: Filter
): AgentTaskRunView[] =>
  filter === 'all' ? [...runs] : runs.filter((run) => runLevel(run) === filter)

/** Runs that arrived since the last look. A changed filter reshuffles the list; that is not news. */
export const newRuns = (seen: number, shown: number, filterChanged: boolean): number =>
  filterChanged ? 0 : Math.max(0, shown - seen)

const timeOf = (at: number): string =>
  new Date(at).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

const detailOf = (run: AgentTaskRunView): string | null =>
  run.error ? ('scope' in run.error ? (run.error.detail ?? null) : run.error.message) : null

function RunRow({ run, modelLabel }: { run: AgentTaskRunView; modelLabel: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const result = RESULT[run.state] ?? { label: run.state, color: 'neutral' as const }
  const detail = detailOf(run)
  const level = runLevel(run)
  return (
    <li className="flex flex-col gap-2xs py-2xs text-body-xs">
      <div className="flex flex-wrap items-center gap-x-sm gap-y-2xs">
        <span className="font-mono text-muted tabular-nums">{timeOf(run.startedAt)}</span>
        <span className="min-w-0 max-w-48 truncate text-muted">{modelLabel}</span>
        <span className="font-mono text-muted tabular-nums">
          {run.usage
            ? `${run.usage.inputTokens.toLocaleString('vi')} vào · ${run.usage.outputTokens.toLocaleString('vi')} ra`
            : 'token không rõ'}
        </span>
        {run.endedAt !== null && (
          <span className="font-mono text-muted tabular-nums">
            {durationLabel(run.endedAt - run.startedAt)}
          </span>
        )}
        {run.batchesDone !== null && (
          <span className="font-mono text-muted tabular-nums">{run.batchesDone} lô</span>
        )}
        {level === 'ok' ? (
          <span>{result.label}</span>
        ) : (
          <Badge color={result.color} variant="plain" dot>
            {result.label}
            {run.error ? ` · ${errorLabel(run.error)}` : ''}
          </Badge>
        )}
      </div>
      {run.summary && !run.error && <span className="text-muted">{run.summary}</span>}
      {run.error && (
        <Disclosure
          label={'scope' in run.error ? run.error.what : 'Lỗi không rõ loại'}
          open={open}
          onOpenChange={setOpen}
        >
          <div className="flex flex-col gap-xs pt-2xs">
            {detail ? (
              <pre className="m-0 max-h-40 overflow-auto rounded-sm bg-subtle p-xs font-mono wrap-anywhere whitespace-pre-wrap text-subtle">
                {detail}
              </pre>
            ) : (
              <span className="text-muted">Không có chi tiết kỹ thuật cho lần chạy này.</span>
            )}
            {detail && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  void navigator.clipboard?.writeText(detail).then(() => setCopied(true))
                }}
              >
                {copied ? 'Đã sao chép' : 'Sao chép chi tiết'}
              </Button>
            )}
          </div>
        </Disclosure>
      )}
    </li>
  )
}

/**
 * The runs of one chapter (change `unify-activity-screen`): one line each with time, model, tokens, duration
 * and result, from the structured record only — no prompts and no raw replies. Follows new runs while the
 * person is at the bottom; scrolled up, it holds the place and counts what arrived.
 */
export function RunLog({ taskId, itemId }: { taskId: string; itemId: string }): JSX.Element {
  const [view, setView] = useState<AgentTaskRunsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [unseen, setUnseen] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const seen = useRef(0)
  const lastFilter = useRef(filter)
  const seq = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const api = window.mira?.agent?.tasks
    if (!api) return
    const mine = ++seq.current
    const res = await api.runs(taskId, itemId)
    if (mine !== seq.current) return
    if (res.ok) {
      setView(res.value)
      setError(null)
    } else setError(res.error.message)
  }, [taskId, itemId])

  useEffect(() => {
    void load()
    return window.mira?.agent?.tasks?.onChanged((event) => {
      if (event.taskId === taskId) void load()
    })
  }, [load, taskId])

  const shown = view ? runsOfLevel(view.runs, filter) : []
  useLayoutEffect(() => {
    const el = box.current
    const changed = lastFilter.current !== filter
    lastFilter.current = filter
    const added = newRuns(seen.current, shown.length, changed)
    seen.current = shown.length
    if (changed) setUnseen(0)
    if (!el || added <= 0) return
    if (atBottom.current) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      el.scrollTo?.({ top: el.scrollHeight, behavior: getScrollBehavior(() => reduced) })
    } else setUnseen((count) => count + added)
  }, [shown.length, filter])

  return (
    <section aria-label="Các lần chạy" className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <ButtonGroup
          label="Lọc lần chạy theo mức"
          value={filter}
          options={FILTERS}
          onChange={(value) => setFilter(value)}
        />
        {unseen > 0 && (
          <Button
            variant="solid"
            onClick={() => {
              const el = box.current
              el?.scrollTo?.({ top: el.scrollHeight })
              atBottom.current = true
              setUnseen(0)
            }}
          >
            {unseen} lần chạy mới ↓
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 text-body-xs text-error">
          Không đọc được các lần chạy: {error}
        </p>
      )}
      {view && shown.length === 0 && (
        <p className="m-0 text-body-xs text-muted">
          {view.runs.length === 0
            ? 'Chương này chưa chạy lần nào.'
            : 'Không có lần chạy ở mức này.'}
        </p>
      )}
      <div
        ref={box}
        onScroll={(event) => {
          const el = event.currentTarget
          atBottom.current = shouldAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight)
          if (atBottom.current) setUnseen(0)
        }}
        className="max-h-64 overflow-auto"
      >
        <ul aria-label="Các lần chạy" className="m-0 list-none divide-y divide-subtle p-0">
          {shown.map((run) => (
            <RunRow key={run.operationId} run={run} modelLabel={view?.modelLabel ?? ''} />
          ))}
        </ul>
      </div>
    </section>
  )
}
