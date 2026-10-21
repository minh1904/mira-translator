import type { JSX, ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { cn } from '../../lib/cn'
import { focusRing } from './focus'

export interface NavItemProps extends Omit<BaseButton.Props, 'className' | 'children'> {
  /** Hàng trang hoặc mục đang hoạt động: hiển thị trạng thái đã chọn và thuộc tính `aria-current`. */
  active?: boolean
  /** Chữ in đậm, dùng cho hàng tiêu đề nhóm phía trên các trang con. */
  strong?: boolean
  /** Dấu chấm, biểu tượng hoặc ảnh bìa phía trước nhãn. */
  leading?: ReactNode
  /** Số lượng, huy hiệu hoặc mũi tên ở cuối hàng. */
  trailing?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Một hàng trong cột danh sách hoặc thanh điều hướng: chiều cao 28px theo chuẩn VS Code, chữ mờ nhẹ,
 * hiệu ứng hover và lớp nền nổi bật cho hàng đang hoạt động. Nhãn văn bản tự động cắt ngắn khi quá dài.
 */
export function NavItem({
  active = false,
  strong = false,
  leading,
  trailing,
  className,
  type = 'button',
  children,
  ...props
}: NavItemProps): JSX.Element {
  return (
    <BaseButton
      data-slot="nav-item"
      type={type}
      aria-current={active ? 'page' : undefined}
      {...props}
      className={cn(
        'flex h-7 w-full min-w-0 shrink-0 items-center gap-xs rounded-xs px-xs text-left text-body-sm select-none',
        'transition-[color,background-color,transform] duration-(--mira-duration-fast) ease-standard active:scale-[0.99] data-disabled:cursor-not-allowed data-disabled:text-disabled data-disabled:active:scale-100',
        active
          ? 'bg-(--mira-nav-bg-active) text-(--mira-nav-fg-active)'
          : 'text-(--mira-nav-fg) hover:bg-(--mira-nav-bg-hover) hover:text-(--mira-nav-fg-active)',
        strong && 'font-medium',
        '[&_svg]:shrink-0',
        focusRing,
        className
      )}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </BaseButton>
  )
}
