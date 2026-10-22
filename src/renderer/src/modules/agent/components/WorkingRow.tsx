import { useEffect, useState, type JSX } from 'react'
import { Spinner } from '../../../components/ui/Spinner'
import { ICON } from '../../../components/ui/icon'

/** Nhãn luân phiên của dòng đang làm, như "Thinking / Working…" của VS Code. */
export const WORKING_LABELS = [
  'Đang suy nghĩ',
  'Đang phân tích',
  'Đang cân nhắc',
  'Đang làm'
] as const
export const WORKING_DWELL_MS = 1200
export const SLOW_AFTER_MS = 90_000

export function workingLabel(elapsedMs: number): string {
  const label = WORKING_LABELS[Math.floor(elapsedMs / WORKING_DWELL_MS) % WORKING_LABELS.length]
  return elapsedMs >= SLOW_AFTER_MS ? `${label}… Lâu hơn bình thường` : `${label}…`
}

/** "Đang chờ bạn trả lời" for a question or a choice, "{n} thao tác cần duyệt" for approvals. */
export function waitingLabel(pending: ReadonlyArray<{ kind: string }>): string {
  const approvals = pending.filter((item) => item.kind === 'approve').length
  if (approvals === 0) return 'Đang chờ bạn trả lời'
  return approvals === 1 ? '1 thao tác cần duyệt' : `${approvals} thao tác cần duyệt`
}

/**
 * Dòng cuối câu trả lời khi chưa có gì khác đang hiện: nhãn luân phiên mỗi 1,2 giây, báo chờ lâu sau
 * 90 giây; hoặc trạng thái chờ người dùng.
 */
export function WorkingRow({
  waiting
}: {
  waiting: ReadonlyArray<{ kind: string }> | null
}): JSX.Element {
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(started)
  useEffect(() => {
    if (waiting) return
    const timer = setInterval(() => setNow(Date.now()), WORKING_DWELL_MS)
    return () => clearInterval(timer)
  }, [waiting])

  return (
    <div className="flex items-center gap-1.5 px-1 text-body-xs text-subtle">
      {waiting ? (
        <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      ) : (
        <Spinner size={ICON['2xs']} />
      )}
      <span className={waiting ? 'text-default' : 'motion-safe:animate-pulse'}>
        {waiting ? waitingLabel(waiting) : workingLabel(now - started)}
      </span>
    </div>
  )
}
