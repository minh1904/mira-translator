import type { JSX, ReactNode, RefObject } from 'react'
import { CloseIcon } from '@renderer/components/ui/reicon'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'

import { cn } from '../../lib/cn'
import { CompactButton } from './CompactButton'

export interface DialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  /** Kích thước: sm 400px (xác nhận) · md 512px (mặc định) · lg 760px (biểu mẫu lớn kèm ảnh bìa). */
  size?: 'sm' | 'md' | 'lg'
  /** Phần tử nhận lại focus khi đóng hộp thoại; dùng cho hộp thoại không mở qua trigger trực tiếp. */
  finalFocus?: RefObject<HTMLElement | null>
  /** Các nút hành động ở chân hộp thoại, căn lề phải. */
  footer?: ReactNode
  children?: ReactNode
}

const SIZES = {
  sm: 'w-[min(400px,calc(100vw-32px))]',
  md: 'w-[min(512px,calc(100vw-32px))]',
  lg: 'w-[min(760px,calc(100vw-32px))]'
} as const

/** Hộp thoại nội dung nổi trên màn hình: tiêu đề, phần thân cuộn được và chân hộp thoại tùy chọn. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  finalFocus,
  footer,
  children
}: DialogProps): JSX.Element {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-(--mira-z-backdrop) bg-backdrop transition-opacity duration-(--mira-duration-base) ease-standard data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup
          finalFocus={finalFocus}
          className={cn(
            'fixed top-1/2 left-1/2 z-(--mira-z-modal) flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-default bg-surface text-default shadow-lg outline-none',
            'transition-[opacity,scale] duration-(--mira-duration-base) ease-enter data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-(--mira-duration-fast) data-ending-style:ease-exit',
            SIZES[size]
          )}
        >
          <div className="flex items-start gap-sm px-lg pt-lg pb-sm">
            <div className="flex min-w-0 flex-1 flex-col gap-2xs">
              <BaseDialog.Title className="text-heading">{title}</BaseDialog.Title>
              {description && (
                <BaseDialog.Description className="text-body-sm text-subtle">
                  {description}
                </BaseDialog.Description>
              )}
            </div>
            <BaseDialog.Close
              render={<CompactButton aria-label="Đóng" icon={<CloseIcon size={16} />} />}
            />
          </div>
          {children && (
            <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto px-lg pb-lg">
              {children}
            </div>
          )}
          {footer && (
            <div className="flex items-center justify-end gap-xs border-t border-default px-lg py-sm">
              {footer}
            </div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

export const DialogClose = BaseDialog.Close
