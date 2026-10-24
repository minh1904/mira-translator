import type { JSX } from 'react'
import { CloseIcon } from '@renderer/components/ui/reicon'
import type { AgentSteer } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'

export interface SteerListProps {
  steers: readonly AgentSteer[]
  onWithdraw(steerId: string): void
  onResend(steer: AgentSteer): void
}

/**
 * Tin gửi thêm khi lượt đang chạy (change `add-agent-turn-steering`), phía trên ô nhập: tin đang chờ có X
 * để rút; tin bị trả lại (lượt dừng, lỗi, chờ duyệt, app mở lại) có Gửi và Bỏ, không tự gửi.
 */
export function SteerList({ steers, onWithdraw, onResend }: SteerListProps): JSX.Element | null {
  if (steers.length === 0) return null
  return (
    <section
      aria-label="Tin gửi thêm"
      className="flex flex-col rounded-sm border border-default bg-surface text-body-xs shadow-xs"
    >
      <ul className="m-0 flex list-none flex-col p-0">
        {steers.map((steer) => (
          <li key={steer.id} className="flex min-w-0 items-center gap-1.5 px-2 py-1">
            <span className="shrink-0 text-muted">
              {steer.state === 'pending' ? 'Đang chờ' : 'Chưa gửi'}
            </span>
            <span className="min-w-0 flex-1 truncate text-default" title={steer.text}>
              {steer.text}
            </span>
            {steer.state === 'pending' ? (
              <CompactButton
                variant="ghost"
                aria-label={`Rút lại: ${steer.text}`}
                icon={<CloseIcon size={ICON.xs} />}
                onClick={() => onWithdraw(steer.id)}
                className="size-6 shrink-0 p-0"
              />
            ) : (
              <>
                <Button
                  variant="ghost"
                  aria-label={`Gửi: ${steer.text}`}
                  onClick={() => onResend(steer)}
                  className="h-6 px-2 text-label-xs"
                >
                  Gửi
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Bỏ: ${steer.text}`}
                  onClick={() => onWithdraw(steer.id)}
                  className="h-6 px-2 text-label-xs"
                >
                  Bỏ
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
