import type { JSX, ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { cn } from '../../lib/cn'
import { focusRing } from './focus'

/**
 * Thẻ có thể nhấp toàn bộ để mở nội dung (như một tác phẩm trong lưới thư viện): giao diện viền
 * như Card, viền đậm hơn khi hover và có viền focus. Không đặt control tương tác khác bên trong.
 */
export function CardButton({
  onClick,
  className,
  children,
  ...props
}: Omit<BaseButton.Props, 'className' | 'children'> & {
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <BaseButton
      data-slot="card-button"
      type="button"
      onClick={onClick}
      {...props}
      className={cn(
        'flex min-w-0 rounded-sm border border-default bg-surface p-md text-left',
        'transition-[color,border-color,box-shadow,transform] duration-(--mira-duration-fast) ease-standard hover:border-strong hover:shadow-xs active:scale-[0.99]',
        focusRing,
        className
      )}
    >
      {children}
    </BaseButton>
  )
}
