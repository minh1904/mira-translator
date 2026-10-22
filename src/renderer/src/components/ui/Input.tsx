import type { InputHTMLAttributes, JSX, ReactNode, Ref } from 'react'
import { MinimalisticMagnifierIcon } from '@renderer/components/ui/reicon'

import { cn } from '../../lib/cn'
import { inputFrameVariants } from './variants'

// w-0: ô nhập lấy độ rộng từ khung bao thay vì độ rộng mặc định 20 ký tự của trình duyệt,
// giúp khung có thể co nhỏ lại và không làm tràn hộp thoại hay bố cục cha.
export const inputElementClass =
  'h-full w-0 min-w-0 flex-1 bg-transparent outline-none placeholder:text-placeholder disabled:cursor-not-allowed'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'md' | 'sm'
  /** Lớp CSS cho khung bao ngoài (độ rộng, khoảng cách viền). */
  className?: string
  inputClassName?: string
  leftIcon?: ReactNode
  /** Vị trí hiển thị sau chữ: biểu tượng, gợi ý ngắn hoặc nút thu gọn. */
  rightSlot?: ReactNode
  ref?: Ref<HTMLInputElement>
}

/**
 * Khung tự động lấp đầy dòng trừ khi được chỉ định độ rộng: kiểm tra xem className có chứa
 * tiền tố định chiều rộng hay không trước khi áp dụng `w-full`.
 */
const SETS_WIDTH = /(^|\s)(w-|flex-1|basis-)/

/** Trường nhập liệu một dòng chưa có nhãn: nên bọc trong Field hoặc cung cấp aria-label. */
export function Input({
  size,
  className,
  inputClassName,
  leftIcon,
  rightSlot,
  ref,
  ...props
}: InputProps): JSX.Element {
  return (
    <div
      data-slot="input"
      className={cn(
        inputFrameVariants({ size }),
        !SETS_WIDTH.test(className ?? '') && 'w-full',
        className
      )}
    >
      {leftIcon}
      <input ref={ref} className={cn(inputElementClass, inputClassName)} {...props} />
      {rightSlot}
    </div>
  )
}

export interface SearchInputProps extends Omit<InputProps, 'type' | 'leftIcon'> {
  /** Đặt tên trường nhập liệu cho công nghệ hỗ trợ tiếp cận. */
  label: string
  /** Phím tắt hiển thị ở cuối trường nhập liệu, ví dụ "Ctrl F". */
  shortcut?: string
}

/** Hộp tìm kiếm: biểu tượng kính lúp, trường nhập dữ liệu và gợi ý phím tắt tùy chọn. */
export function SearchInput({ label, shortcut, size, ...props }: SearchInputProps): JSX.Element {
  return (
    <Input
      type="search"
      aria-label={label}
      size={size}
      leftIcon={<MinimalisticMagnifierIcon size={16} aria-hidden="true" />}
      inputClassName="[&::-webkit-search-cancel-button]:hidden"
      rightSlot={shortcut && <Kbd>{shortcut}</Kbd>}
      {...props}
    />
  )
}

/** Phím bàn phím hoặc phím tắt, hiển thị trong ô tìm kiếm hoặc hàng menu. */
export function Kbd({
  children,
  size = 'md'
}: {
  children: ReactNode
  /** `sm` cao 16px, dùng trong control cao 24px (ô tìm kiếm trên thanh tiêu đề). */
  size?: 'md' | 'sm'
}): JSX.Element {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex shrink-0 items-center rounded-xs border border-default font-sans text-body-xs whitespace-nowrap text-muted',
        size === 'sm' ? 'h-4 px-1 leading-none' : 'h-5 px-1.5'
      )}
    >
      {children}
    </kbd>
  )
}
