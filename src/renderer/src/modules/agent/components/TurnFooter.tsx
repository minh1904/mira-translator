import { useState, type JSX } from 'react'
import { CheckIcon, CopyIcon, RestartIcon } from '@renderer/components/ui/reicon'
import type { AgentTurnView } from '../../../../../shared/contracts/agent'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'
import { UsageDisplay } from './UsageDisplay'

const ENDED_LABEL: Partial<Record<AgentTurnView['status'], string>> = {
  cancelled: 'Đã dừng',
  interrupted: 'Bị gián đoạn',
  expired: 'Đã bỏ qua vì có lệnh mới'
}

/** A turn that ended in a way Thử lại can redo. */
export const RETRYABLE: ReadonlyArray<AgentTurnView['status']> = [
  'completed',
  'failed',
  'cancelled',
  'interrupted'
]

/**
 * Chân của một lượt đã kết thúc: khối lỗi hoặc nhãn dừng, Sao chép, Thử lại (chỉ lượt cuối) và usage
 * provider báo.
 */
export function TurnFooter({
  turn,
  error,
  isLast,
  onRetry
}: {
  turn: AgentTurnView
  /** What went wrong, for a failed turn. */
  error: string | null
  isLast: boolean
  onRetry(): void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(turn.answer)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; nothing else depends on it.
    }
  }
  const ended = ENDED_LABEL[turn.status]

  return (
    <div className="flex flex-col gap-1">
      {turn.status === 'failed' && (
        <div
          role="alert"
          className="rounded-sm border border-(--mira-border-subtle) bg-error-subtle px-2 py-1.5 text-body-xs text-error"
        >
          {error ?? 'Lượt trả lời bị lỗi.'}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 text-label-xs text-muted">
        {ended && <span>{ended}</span>}
        {turn.answer && (
          <CompactButton
            aria-label={copied ? 'Đã sao chép' : 'Sao chép câu trả lời'}
            title={copied ? 'Đã sao chép' : 'Sao chép'}
            icon={copied ? <CheckIcon size={ICON['2xs']} /> : <CopyIcon size={ICON['2xs']} />}
            onClick={() => void copy()}
          />
        )}
        {isLast && RETRYABLE.includes(turn.status) && (
          <CompactButton
            aria-label="Thử lại"
            title="Thử lại"
            icon={<RestartIcon size={ICON['2xs']} />}
            onClick={onRetry}
          />
        )}
        {turn.modelLabel && <span>{turn.modelLabel}</span>}
        {(turn.status === 'completed' || turn.status === 'failed') && (
          <UsageDisplay usage={turn.usage} costUsd={turn.costUsd} />
        )}
      </div>
    </div>
  )
}
