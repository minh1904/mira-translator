import type { JSX } from 'react'
import type {
  AgentTaskItemState,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import { cn } from '../../../lib/cn'
import { taskProgressLabel, taskTotal } from './taskView'

/** Left to right: what is done, then what went wrong, then what waits, runs or is still to come. */
const SEGMENTS: Array<{ state: AgentTaskItemState; className: string }> = [
  { state: 'completed', className: 'bg-success' },
  { state: 'failed', className: 'bg-error' },
  { state: 'waiting_user', className: 'bg-warning' },
  { state: 'running', className: 'bg-info' },
  { state: 'skipped', className: 'bg-line' },
  { state: 'cancelled', className: 'bg-line' },
  { state: 'queued', className: 'bg-muted' }
]

/**
 * The chapters of a task as one strip, like the stages of a pipeline: a segment per kind of state, as wide as
 * its share of the chapters. The words beneath say the same, so colour is never the only signal.
 */
export function ChapterStrip({ task }: { task: AgentTaskSummary }): JSX.Element {
  const total = taskTotal(task)
  const label = taskProgressLabel(task)
  return (
    <span className="flex min-w-0 flex-col gap-2xs">
      <span
        role="img"
        aria-label={`Các chương của tác vụ dịch ${task.workTitle}: ${label}`}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {total > 0 &&
          SEGMENTS.map(({ state, className }) =>
            task.counts[state] > 0 ? (
              <span
                key={state}
                className={cn('block h-full', className)}
                style={{ width: `${(task.counts[state] / total) * 100}%` }}
              />
            ) : null
          )}
      </span>
      <span className="truncate text-body-xs text-muted tabular-nums">{label}</span>
    </span>
  )
}
