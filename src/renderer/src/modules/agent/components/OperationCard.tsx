import { useState, type JSX } from 'react'
import type { AgentOperation, ResolvedTarget } from '../../../../../shared/contracts/agent'
import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ProgressBar } from '../../../components/ui/ProgressBar'

export interface OperationCardProps {
  operation: AgentOperation
  onOpenTarget?: (target: ResolvedTarget) => void
  onCancel?: (operationId: string) => void
  onUndo?: (operationId: string) => void
}

export function stateInfo(state: AgentOperation['state']): { label: string; color: BadgeColor } {
  switch (state) {
    case 'queued':
      return { label: 'Đang chờ', color: 'neutral' }
    case 'running':
      return { label: 'Đang chạy', color: 'info' }
    case 'completed':
      return { label: 'Hoàn tất', color: 'success' }
    case 'partially_completed':
      return { label: 'Một phần', color: 'warning' }
    case 'conflict':
      return { label: 'Xung đột', color: 'error' }
    case 'failed':
      return { label: 'Lỗi', color: 'error' }
    case 'cancelled':
      return { label: 'Đã dừng', color: 'neutral' }
    case 'undone':
      return { label: 'Đã hoàn tác', color: 'accent' }
    default:
      return { label: state, color: 'neutral' }
  }
}

export const CAPABILITY_LABELS: Record<string, string> = {
  translate_chapter: 'Dịch chương',
  extract_terms: 'Trích thuật ngữ',
  edit_translation: 'Sửa bản dịch'
}

export function OperationCard({
  operation,
  onOpenTarget,
  onCancel,
  onUndo
}: OperationCardProps): JSX.Element {
  const [showDetail, setShowDetail] = useState(false)
  const st = stateInfo(operation.state)
  const target = operation.target

  const targetLabel =
    target?.kind === 'chapter'
      ? `${target.workLabel} › ${target.chapterLabel}`
      : target?.kind === 'work'
        ? target.workLabel
        : 'Toàn thư viện'

  const progress = operation.progress
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : null

  const isRunning = operation.state === 'running' || operation.state === 'queued'
  const canUndo = operation.state === 'completed' || operation.state === 'partially_completed'

  return (
    <div
      data-operation-id={operation.id}
      data-operation-state={operation.state}
      className="my-1 flex flex-col gap-1.5 rounded-sm border border-default bg-surface/90 p-2 text-body-xs shadow-xs"
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-label-xs font-semibold text-emphasis">
            {CAPABILITY_LABELS[operation.capability] ?? operation.capability}
          </span>
          <span className="truncate text-body-xs text-subtle">{targetLabel}</span>
        </div>
        <Badge color={st.color} dot>
          {st.label}
        </Badge>
      </div>

      {progress && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-body-xs text-muted">
            <span>Tiến độ:</span>
            <span className="tabular-nums">
              {progress.completed} / {progress.total} {progress.unit} ({percent}%)
            </span>
          </div>
          <ProgressBar
            value={percent ?? 0}
            tone={isRunning ? 'info' : operation.state === 'completed' ? 'success' : 'neutral'}
            label={`Tiến độ ${progress.completed} trên ${progress.total}`}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-1.5 border-t border-subtle pt-1.5">
        <div className="flex items-center gap-1">
          {target && onOpenTarget && (
            <Button variant="ghost" onClick={() => onOpenTarget(target)} className="!h-6 !px-2">
              Mở đích
            </Button>
          )}
          {isRunning && onCancel && (
            <Button
              variant="ghost"
              color="danger"
              onClick={() => onCancel(operation.id)}
              className="!h-6 !px-2"
            >
              Dừng
            </Button>
          )}
          {canUndo && onUndo && (
            <Button variant="ghost" onClick={() => onUndo(operation.id)} className="!h-6 !px-2">
              Hoàn tác
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          aria-expanded={showDetail}
          onClick={() => setShowDetail(!showDetail)}
          className="!h-6 !px-2 text-muted hover:text-default"
        >
          {showDetail ? 'Ẩn' : 'Chi tiết'}
        </Button>
      </div>

      {showDetail && (
        <pre className="max-h-40 overflow-auto rounded-sm bg-subtle p-xs font-mono text-body-xs text-subtle">
          {JSON.stringify(
            {
              id: operation.id,
              commandId: operation.commandId,
              target: operation.target,
              progress: operation.progress,
              result: operation.result,
              error: operation.error
            },
            null,
            2
          )}
        </pre>
      )}
    </div>
  )
}
