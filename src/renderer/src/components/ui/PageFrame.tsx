import type { JSX, ReactNode } from 'react'
import { Badge } from './Badge'
import { SOON_LABEL } from '../../lib/mockFeatures'
import { cn } from '../../lib/cn'
import { TopBarTitle } from './TopBarActions'

export type PageWidth = 'default' | 'wide' | 'full'

const PAGE_WIDTH: Record<PageWidth, string> = {
  default: 'max-w-[1080px]',
  wide: 'max-w-[1240px]',
  full: 'max-w-[1600px]'
}

/**
 * Khung trang ứng dụng từ thanh bên: hiển thị tiêu đề trên thanh trên cùng, các nút ở đầu cột nội
 * dung căn giữa. Thuộc tính `soon` đánh dấu trang chỉ là giao diện minh họa sắp có.
 */
export function PageFrame({
  title,
  note,
  actions,
  soon = false,
  wide = false,
  width = wide ? 'wide' : 'default',
  className,
  children
}: {
  title: string
  note?: ReactNode
  actions?: ReactNode
  soon?: boolean
  /** Viết tắt của `width="wide"`. */
  wide?: boolean
  /** Độ rộng tối đa của nội dung: 1080px, 1240px (bảng, hai cột) hoặc 1600px (bảng rộng trên màn 1920). */
  width?: PageWidth
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="min-h-full bg-default">
      <TopBarTitle
        note={
          soon || note ? (
            <span className="inline-flex items-center gap-xs">
              {soon && <Badge color="accent">{SOON_LABEL}</Badge>}
              {note}
            </span>
          ) : undefined
        }
      >
        {title}
      </TopBarTitle>
      <div className={cn('mx-auto flex flex-col gap-lg px-xl py-xl', PAGE_WIDTH[width], className)}>
        {actions && (
          <div data-slot="page-actions" className="flex flex-wrap items-center justify-end gap-xs">
            {actions}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/** Tiêu đề phần giao diện mẫu: tiêu đề kèm huy hiệu "Sắp có". */
export function SoonTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-xs">
      {children}
      <Badge color="accent">{SOON_LABEL}</Badge>
    </span>
  )
}
