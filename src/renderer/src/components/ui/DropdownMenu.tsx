import type { JSX, ReactNode } from 'react'
import { CheckIcon } from '@renderer/components/ui/reicon'
import { Menu as BaseMenu } from '@base-ui/react/menu'

import { cn } from '../../lib/cn'

/** Bề mặt nổi (floating surface) dùng chung cho các menu và danh sách chọn. */
export const menuSurfaceClass =
  'rounded-sm border border-default bg-surface p-2xs text-body-sm text-default shadow-sm outline-none transition-[opacity,scale] duration-(--mira-duration-fast) ease-enter data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:ease-exit origin-(--transform-origin)'

/** Một hàng trong menu hoặc danh sách chọn: chiều cao 28px theo chuẩn VS Code, hiển thị hiệu ứng hover mềm mại. */
export const menuItemClass =
  'flex h-7 cursor-default items-center gap-xs rounded-xs px-xs outline-none select-none transition-colors duration-(--mira-duration-fast) ease-standard active:scale-[0.99] data-disabled:text-disabled data-disabled:active:scale-100 data-highlighted:bg-hover'

/** Lớp z-index định vị menu để luôn hiển thị phía trên các lớp giao diện khác bao gồm cả hộp thoại. */
const positionerClass = 'z-(--mira-z-dropdown)'

export function MenuRoot(props: BaseMenu.Root.Props): JSX.Element {
  return <BaseMenu.Root {...props} />
}

export function MenuTrigger(props: BaseMenu.Trigger.Props): JSX.Element {
  return <BaseMenu.Trigger {...props} />
}

export function MenuPopup({
  children,
  align = 'end'
}: {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}): JSX.Element {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner className={positionerClass} sideOffset={6} align={align}>
        <BaseMenu.Popup className={cn(menuSurfaceClass, 'min-w-48')}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export function MenuItem({
  className,
  tone = 'default',
  ...props
}: Omit<BaseMenu.Item.Props, 'className'> & {
  className?: string
  tone?: 'default' | 'danger'
}): JSX.Element {
  return (
    <BaseMenu.Item
      className={cn(menuItemClass, tone === 'danger' && 'text-error', className)}
      {...props}
    />
  )
}

/** Tiêu đề nhỏ phía trên một nhóm hàng. */
export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="px-xs pt-xs pb-2xs text-label-xs text-muted">{children}</div>
}

export function MenuSeparator(): JSX.Element {
  return <BaseMenu.Separator className="-mx-2xs my-2xs h-px bg-(--mira-border)" />
}

/** Menu con lồng bên trong menu: `MenuSubmenuTrigger` là hàng kích hoạt, `MenuSubmenuPopup` là menu mở ra. */
export function MenuSubmenu(props: BaseMenu.SubmenuRoot.Props): JSX.Element {
  return <BaseMenu.SubmenuRoot {...props} />
}

export function MenuSubmenuTrigger({
  className,
  ...props
}: Omit<BaseMenu.SubmenuTrigger.Props, 'className'> & { className?: string }): JSX.Element {
  return <BaseMenu.SubmenuTrigger className={cn(menuItemClass, className)} {...props} />
}

export function MenuSubmenuPopup({ children }: { children: ReactNode }): JSX.Element {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        className={positionerClass}
        sideOffset={4}
        alignOffset={-5}
        align="start"
      >
        <BaseMenu.Popup className={cn(menuSurfaceClass, 'min-w-40')}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export function MenuRadioGroup(props: BaseMenu.RadioGroup.Props): JSX.Element {
  return <BaseMenu.RadioGroup {...props} />
}

/** Tùy chọn trong nhóm radio menu, đánh dấu bằng biểu tượng dấu tích khi được chọn. */
export function MenuRadioItem({
  className,
  children,
  ...props
}: Omit<BaseMenu.RadioItem.Props, 'className'> & { className?: string }): JSX.Element {
  return (
    <BaseMenu.RadioItem className={cn(menuItemClass, 'pr-sm', className)} {...props}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <BaseMenu.RadioItemIndicator>
          <CheckIcon size={14} />
        </BaseMenu.RadioItemIndicator>
      </span>
      {children}
    </BaseMenu.RadioItem>
  )
}
