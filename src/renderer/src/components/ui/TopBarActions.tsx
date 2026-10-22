import { useContext, type JSX, type ReactNode } from 'react'
import { AltArrowLeftIcon } from '@renderer/components/ui/reicon'
import { createPortal } from 'react-dom'

import { CompactButton } from './CompactButton'
import { ICON } from './icon'
import { cn } from '../../lib/cn'
import {
  StatusBarSlotContext,
  TopBarSlotContext,
  TopBarTitleSlotContext,
  WorkTabActiveContext
} from './topBarSlot'

/**
 * Hiển thị các phần tử con lên thanh trên cùng (top bar) qua React portal thay vì tại vị trí khai báo.
 *
 * Các nút điều khiển vẫn giữ nguyên closure với state nội bộ của màn hình (chỉ di chuyển DOM node),
 * giúp màn hình có thể gắn các nút như "Lưu" lên thanh trên cùng mà không cần truyền cờ dirty hay hàm
 * lưu ra shell cha. Khi rời màn hình, các nút sẽ tự động biến mất.
 */
export function TopBarActions({ children }: { children: ReactNode }): JSX.Element | null {
  const slot = useContext(TopBarSlotContext)
  const active = useContext(WorkTabActiveContext)
  return slot === null || !active ? null : createPortal(children, slot)
}

/**
 * Hiển thị trạng thái của màn hình lên thanh trạng thái đáy cửa sổ qua React portal, thay cho
 * trạng thái mặc định của ứng dụng. Chỉ tab đang hiển thị được gắn nội dung.
 */
export function StatusBarItems({ children }: { children: ReactNode }): JSX.Element | null {
  const slot = useContext(StatusBarSlotContext)
  const active = useContext(WorkTabActiveContext)
  return slot === null || !active ? null : createPortal(children, slot)
}

export interface TopBarTitleProps {
  children: ReactNode
  note?: ReactNode
  onBack?: () => void
  backLabel?: string
  size?: 'md' | 'sm'
  className?: string
}

/** Tiêu đề trang hiển thị ở bên trái thanh trên cùng, có thể kèm ghi chú và nút quay lại. */
export function TopBarTitle({
  children,
  note,
  onBack,
  backLabel = 'Quay lại',
  size = 'sm',
  className
}: TopBarTitleProps): JSX.Element | null {
  const slot = useContext(TopBarTitleSlotContext)
  const active = useContext(WorkTabActiveContext)
  if (slot === null || !active) return null
  return createPortal(
    <div className="flex min-w-0 items-center gap-1.5 text-body-sm">
      {onBack && (
        <CompactButton
          aria-label={backLabel}
          title={backLabel}
          onClick={onBack}
          icon={<AltArrowLeftIcon size={ICON.sm} />}
        />
      )}
      {typeof children === 'string' ? (
        <h1
          className={cn(
            'm-0 truncate',
            size === 'sm'
              ? 'text-body-sm font-medium text-default'
              : 'text-label-md font-semibold text-default',
            className
          )}
        >
          {children}
        </h1>
      ) : (
        children
      )}
      {note && (
        <>
          <span className="select-none text-body-xs font-normal text-muted/60" aria-hidden="true">
            /
          </span>
          <span className="truncate text-body-xs text-muted">{note}</span>
        </>
      )}
    </div>,
    slot
  )
}
