import type { HTMLAttributes, JSX, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Khối nội dung có đường viền hiển thị trên bề mặt. Thẻ tĩnh chỉ có viền, không đổ bóng. */
export function Card({
  title,
  aside,
  className,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: string
  /** Số lượng hoặc nút hành động phụ nằm trên dòng tiêu đề. */
  aside?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <section
      data-slot="card"
      aria-label={title}
      className={cn(
        'flex min-w-0 flex-col gap-sm rounded-sm border border-default bg-surface p-md',
        className
      )}
      {...props}
    >
      {(title || aside) && (
        <div className="flex items-center gap-xs">
          {title && <h2 className="m-0 text-label-sm text-default">{title}</h2>}
          {aside && <span className="ml-auto flex items-center gap-xs">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  )
}
