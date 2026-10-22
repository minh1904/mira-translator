import type { JSX, ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { cn } from '../../lib/cn'
import { focusRing } from './focus'

export interface ActivityBarItemProps
  extends Omit<BaseButton.Props, 'className' | 'children' | 'aria-label'> {
  /** Biểu tượng 18px. Nút chỉ có icon, nên nhãn đi qua `aria-label` và tooltip của nơi dùng. */
  icon: ReactNode
  'aria-label': string
  /** Panel của nút đang mở: vạch chỉ báo bên trái và chữ đậm màu, kèm `aria-pressed`. */
  active?: boolean
  /** Số đếm góc dưới phải (kết quả, lỗi, mục chờ). Không hiện khi 0 hoặc bỏ trống. */
  badge?: number
  className?: string
}

/**
 * Một nút trên activity bar: ô vuông 40px, icon 18px, theo activity bar của VS Code. Kích thước này
 * nằm ngoài thang control 24/28/32 vì đây là cột điều hướng chỉ có icon, cần dễ nhìn và dễ bấm.
 */
export function ActivityBarItem({
  icon,
  active = false,
  badge,
  className,
  type = 'button',
  ...props
}: ActivityBarItemProps): JSX.Element {
  return (
    <BaseButton
      data-slot="activity-bar-item"
      type={type}
      aria-pressed={active}
      {...props}
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center select-none',
        'transition-colors duration-(--mira-duration-fast) ease-standard [&_svg]:shrink-0',
        // Vạch 2px ở mép trái đánh dấu panel đang mở; màu không phải dấu hiệu duy nhất (còn aria-pressed và chữ đậm).
        'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full',
        active
          ? 'text-emphasis before:bg-inverted'
          : 'text-muted hover:text-default before:bg-transparent',
        focusRing,
        'focus-visible:-outline-offset-4',
        className
      )}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1 bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-inverted px-1 text-label-xs leading-none text-inverted tabular-nums"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </BaseButton>
  )
}
