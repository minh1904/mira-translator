import type { JSX, ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'
import { BUTTON_ICON, buttonVariants, linkButtonVariants } from './variants'

export interface ButtonProps extends Omit<BaseButton.Props, 'className' | 'color'> {
  /** Màu sắc: neutral (mặc định) | danger (dành cho thao tác xóa, nguy hiểm). */
  color?: 'neutral' | 'danger'
  /** Kiểu nút: solid (hành động chính trên màn hình); outline (mặc định cho các hành động khác); light; ghost. */
  variant?: 'solid' | 'outline' | 'light' | 'ghost'
  /** Kích thước: lg 32px (hành động chính nổi bật) · md 28px (mặc định theo chuẩn VS Code) · sm 24px (bảng, hàng, thanh công cụ). */
  size?: 'lg' | 'md' | 'sm'
  className?: string
  /** Biểu tượng hiển thị trước nhãn văn bản. */
  leftIcon?: ReactNode
  /** Biểu tượng hiển thị sau nhãn văn bản. */
  rightIcon?: ReactNode
  /** Nút chỉ chứa biểu tượng (hình vuông), yêu cầu aria-label. Nếu kích thước từ 24px trở xuống nên dùng CompactButton. */
  icon?: ReactNode
  /** Thay biểu tượng bên trái bằng biểu tượng xoay tải (spinner), khóa nút và giữ nguyên chiều rộng. */
  loading?: boolean
  children?: ReactNode
}

/** Nút bấm chuẩn với đầy đủ các biến thể màu sắc, kiểu dáng và kích thước. */
export function Button({
  color,
  variant,
  size = 'md',
  className,
  leftIcon,
  rightIcon,
  icon,
  loading = false,
  disabled,
  focusableWhenDisabled,
  type = 'button',
  children,
  ...props
}: ButtonProps): JSX.Element {
  const iconOnly = icon !== undefined
  return (
    <BaseButton
      data-slot="button"
      type={type}
      {...props}
      disabled={disabled || loading}
      focusableWhenDisabled={loading || focusableWhenDisabled}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ color, variant, size, iconOnly }), className)}
    >
      {iconOnly ? (
        loading ? (
          <Spinner size={BUTTON_ICON[size]} />
        ) : (
          icon
        )
      ) : (
        <>
          {loading ? <Spinner size={BUTTON_ICON[size]} /> : leftIcon}
          {children != null && <span className="inline-flex items-center gap-2xs">{children}</span>}
          {rightIcon}
        </>
      )}
    </BaseButton>
  )
}

export interface LinkButtonProps extends Omit<BaseButton.Props, 'className' | 'color'> {
  /** Màu sắc: link (mặc định, màu liên kết) | neutral (chữ mờ nhẹ) | warning (cần chú ý). */
  color?: 'link' | 'neutral' | 'warning'
  size?: 'md' | 'sm'
  className?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  children: ReactNode
}

/** Nút hành động dạng văn bản: màu liên kết, gạch chân khi hover. */
export function LinkButton({
  color,
  size,
  className,
  leftIcon,
  rightIcon,
  type = 'button',
  children,
  ...props
}: LinkButtonProps): JSX.Element {
  return (
    <BaseButton
      data-slot="link-button"
      type={type}
      {...props}
      className={cn(linkButtonVariants({ color, size }), className)}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </BaseButton>
  )
}
