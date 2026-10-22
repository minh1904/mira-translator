import type { JSX, ReactNode } from 'react'
import {
  CheckCircleIcon,
  CloseIcon,
  DangerCircleIcon,
  InfoCircleIcon
} from '@renderer/components/ui/reicon'

import { cn } from '../../lib/cn'
import { Button } from './Button'
import { CompactButton } from './CompactButton'

export type AlertTone = 'info' | 'success' | 'warning' | 'error'

const TONES: Record<AlertTone, { box: string; icon: JSX.Element }> = {
  info: {
    box: 'border-info-muted bg-info-subtle',
    icon: <InfoCircleIcon size={16} className="text-info" />
  },
  success: {
    box: 'border-success-muted bg-success-subtle',
    icon: <CheckCircleIcon size={16} className="text-success" />
  },
  warning: {
    box: 'border-warning-muted bg-warning-subtle',
    icon: <DangerCircleIcon size={16} className="text-warning" />
  },
  error: {
    box: 'border-error-muted bg-error-subtle',
    icon: <DangerCircleIcon size={16} className="text-error" />
  }
}

export interface AlertProps {
  /** Sắc thái thông báo: `error` và `warning` được đọc ngay lập tức; các loại khác thông báo nhẹ nhàng. */
  tone: AlertTone
  title?: string
  children: ReactNode
  /** Hành động bổ sung tùy chọn, ví dụ: "Mở tác phẩm". */
  action?: { label: string; onClick(): void }
  /** Hiển thị nút đóng khi được truyền hàm xử lý. */
  onDismiss?(): void
  className?: string
}

/** Hộp thông báo gắn với một khu vực cụ thể trên giao diện (phía trên danh sách, bên trong biểu mẫu). */
export function Alert({
  tone,
  title,
  children,
  action,
  onDismiss,
  className
}: AlertProps): JSX.Element {
  const loud = tone === 'error' || tone === 'warning'
  return (
    <div
      data-slot="alert"
      role={loud ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-xs rounded-sm border px-sm py-xs text-body-sm text-default',
        TONES[tone].box,
        className
      )}
    >
      <span className="mt-0.5 flex shrink-0">{TONES[tone].icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-3xs">
        {title && <span className="text-label-sm">{title}</span>}
        <div className="min-w-0 break-words">{children}</div>
      </div>
      {(action || onDismiss) && (
        <span className="flex shrink-0 items-center gap-2xs">
          {action && (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {onDismiss && (
            <CompactButton
              aria-label="Đóng thông báo"
              icon={<CloseIcon size={14} />}
              onClick={onDismiss}
            />
          )}
        </span>
      )}
    </div>
  )
}
