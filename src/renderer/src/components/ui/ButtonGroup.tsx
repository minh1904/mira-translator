import type { JSX } from 'react'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { cn } from '../../lib/cn'
import { focusRing } from './focus'

export interface ButtonGroupOption<T extends string> {
  value: T
  label: string
}

export interface ButtonGroupProps<T extends string> {
  /** Nhãn mô tả nhóm nút cho công nghệ hỗ trợ tiếp cận. */
  label: string
  value: T
  options: ReadonlyArray<ButtonGroupOption<T>>
  onChange(value: T): void
  size?: 'md' | 'sm'
  className?: string
}

/**
 * Nhóm nút chọn một trong nhiều tùy chọn đặt cạnh nhau: thanh nền chứa các tùy chọn,
 * tùy chọn được chọn sẽ nổi bật trên nền bề mặt. Luôn có đúng một tùy chọn được chọn.
 */
export function ButtonGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className
}: ButtonGroupProps<T>): JSX.Element {
  return (
    <ToggleGroup
      data-slot="button-group"
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const chosen = next[0]
        if (chosen !== undefined) onChange(chosen as T)
      }}
      className={cn(
        'inline-flex items-center gap-3xs bg-muted p-3xs',
        'rounded-xs',
        size === 'md' ? 'h-7' : 'h-6',
        className
      )}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={cn(
            'h-full rounded-xs px-2.5 whitespace-nowrap text-subtle transition-colors duration-(--mira-duration-fast) hover:text-default data-pressed:bg-surface data-pressed:text-default data-pressed:shadow-xs',
            size === 'md' ? 'text-label-xs' : 'px-2 text-label-xs',
            focusRing
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
