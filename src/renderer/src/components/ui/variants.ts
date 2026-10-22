import { cn, variants } from '../../lib/cn'
import { focusRing, focusWithinRing } from './focus'
import { ICON } from './icon'

/*
 * Bảng biến thể của các component trong thư mục, tách riêng để các tệp component chỉ export
 * component (hỗ trợ React Fast Refresh). Có thể dùng để định kiểu cho phần tử HTML gốc như component:
 * <a className={buttonVariants({ size: 'sm' })}>.
 */

/*
 * Biến thể nút bấm: màu sắc × kiểu dáng × kích thước.
 *   colour  neutral (mặc định; solid là hành động chính của màn hình) | danger (thao tác xóa)
 *   style   solid | outline | light | ghost
 *   size    lg 32px (hành động nổi bật) · md 28px (mặc định theo chuẩn VS Code) · sm 24px (bảng, hàng, thanh công cụ)
 * Thang kích thước chuẩn cho nút, ô nhập và nhóm theo chuẩn VS Code: chiều cao 24 / 28 / 32, nhãn chữ 12 / 12 / 13,
 * đệm ngang 8 / 10 / 12, bo góc 4px (rounded-xs).
 */
export const buttonVariants = variants({
  base: cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-(--mira-duration-fast) ease-standard active:scale-[0.98]',
    'data-disabled:cursor-not-allowed data-disabled:active:scale-100 [&_svg]:shrink-0',
    focusRing
  ),
  variants: {
    color: { neutral: '', danger: '' },
    variant: { solid: '', outline: 'border', light: '', ghost: '' },
    size: {
      lg: 'h-8 gap-xs rounded-xs px-sm text-label-sm',
      md: 'h-7 gap-2xs rounded-xs px-2.5 text-label-xs',
      sm: 'h-6 gap-2xs rounded-xs px-2 text-label-xs'
    },
    iconOnly: { true: 'px-0', false: '' }
  },
  compound: [
    { when: { size: 'lg', iconOnly: true }, className: 'w-8' },
    { when: { size: 'md', iconOnly: true }, className: 'w-7' },
    { when: { size: 'sm', iconOnly: true }, className: 'w-6' },
    {
      when: { color: 'neutral', variant: 'solid' },
      className:
        'bg-(--mira-button-neutral-solid-bg) text-(--mira-button-neutral-solid-fg) hover:bg-(--mira-button-neutral-solid-bg-hover) data-disabled:bg-(--mira-button-bg-disabled) data-disabled:text-(--mira-button-fg-disabled)'
    },
    {
      when: { color: 'neutral', variant: 'outline' },
      className:
        'border-(--mira-button-neutral-border) bg-surface text-(--mira-button-neutral-fg) shadow-xs hover:border-(--mira-button-neutral-border-hover) hover:bg-(--mira-button-neutral-bg-hover) data-disabled:bg-transparent data-disabled:text-(--mira-button-fg-disabled) data-disabled:shadow-none'
    },
    {
      when: { color: 'neutral', variant: 'light' },
      className:
        'bg-(--mira-button-neutral-light-bg) text-(--mira-button-neutral-fg) hover:bg-(--mira-button-neutral-light-bg-hover) data-disabled:bg-(--mira-button-bg-disabled) data-disabled:text-(--mira-button-fg-disabled)'
    },
    {
      when: { color: 'neutral', variant: 'ghost' },
      className:
        'text-(--mira-button-neutral-fg-muted) hover:bg-(--mira-button-neutral-bg-hover) hover:text-(--mira-button-neutral-fg) data-disabled:text-(--mira-button-fg-disabled)'
    },
    {
      when: { color: 'danger', variant: 'solid' },
      className:
        'bg-(--mira-button-danger-solid-bg) text-(--mira-button-danger-solid-fg) hover:bg-(--mira-button-danger-solid-bg-hover) data-disabled:bg-(--mira-button-bg-disabled) data-disabled:text-(--mira-button-fg-disabled)'
    },
    {
      when: { color: 'danger', variant: 'outline' },
      className:
        'border-(--mira-button-danger-border) text-(--mira-button-danger-fg) hover:bg-(--mira-button-danger-light-bg) data-disabled:text-(--mira-button-fg-disabled)'
    },
    {
      when: { color: 'danger', variant: 'light' },
      className:
        'bg-(--mira-button-danger-light-bg) text-(--mira-button-danger-fg) hover:bg-(--mira-button-danger-light-bg-hover) data-disabled:bg-(--mira-button-bg-disabled) data-disabled:text-(--mira-button-fg-disabled)'
    },
    {
      when: { color: 'danger', variant: 'ghost' },
      className:
        'text-(--mira-button-danger-fg) hover:bg-(--mira-button-danger-light-bg) data-disabled:text-(--mira-button-fg-disabled)'
    }
  ],
  defaults: { color: 'neutral', variant: 'outline', size: 'md', iconOnly: false }
})

/** Kích thước biểu tượng theo từng cỡ nút (biểu tượng Reicon nhận giá trị pixel). */
export const BUTTON_ICON = { lg: ICON.sm, md: ICON.sm, sm: ICON.xs } as const

/** Nút hành động dạng văn bản: màu liên kết, gạch chân khi hover. */
export const linkButtonVariants = variants({
  base: cn(
    'inline-flex items-center gap-2xs rounded-xs whitespace-nowrap underline-offset-4 hover:underline',
    'transition-colors duration-(--mira-duration-fast) ease-standard',
    'data-disabled:cursor-not-allowed data-disabled:text-disabled data-disabled:no-underline [&_svg]:shrink-0',
    focusRing
  ),
  variants: {
    color: {
      link: 'text-link',
      neutral: 'text-subtle hover:text-default',
      /** Đang có việc chờ người dùng xử lý, ví dụ các đề xuất cần xem xét. */
      warning: 'text-warning-emphasis'
    },
    size: {
      md: 'text-label-sm',
      sm: 'text-label-xs'
    }
  },
  defaults: { color: 'link', size: 'md' }
})

/*
 * Biến thể nút thu gọn: nút chỉ chứa biểu tượng dùng cho thanh công cụ, hàng và thẻ nhãn.
 *   style  ghost (mặc định) | light | dark | outline
 *   size   lg 28px · md 24px · sm 20px
 */
export const compactButtonVariants = variants({
  base: cn(
    'inline-flex shrink-0 items-center justify-center select-none',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-(--mira-duration-fast) ease-standard active:scale-[0.96]',
    'data-disabled:cursor-not-allowed data-disabled:bg-transparent data-disabled:text-disabled data-disabled:shadow-none data-disabled:active:scale-100',
    '[&_svg]:shrink-0',
    focusRing
  ),
  variants: {
    variant: {
      ghost:
        'text-(--mira-button-neutral-fg-muted) hover:bg-(--mira-button-neutral-bg-hover) hover:text-(--mira-button-neutral-fg) aria-pressed:bg-selected aria-pressed:text-default data-popup-open:bg-selected data-popup-open:text-default',
      light:
        'bg-(--mira-button-neutral-light-bg) text-(--mira-button-neutral-fg) hover:bg-(--mira-button-neutral-light-bg-hover)',
      dark: 'bg-(--mira-button-neutral-solid-bg) text-(--mira-button-neutral-solid-fg) hover:bg-(--mira-button-neutral-solid-bg-hover)',
      outline:
        'border border-(--mira-button-neutral-border) bg-surface text-(--mira-button-neutral-fg) shadow-xs hover:bg-(--mira-button-neutral-bg-hover)'
    },
    size: {
      lg: 'size-7 rounded-sm',
      md: 'size-6 rounded-sm',
      sm: 'size-5 rounded-sm'
    },
    round: { true: 'rounded-full', false: '' },
    /** Nút dạng ghost có ý nghĩa hành động cụ thể: chấp nhận (success) hoặc xóa (danger). */
    tone: {
      neutral: '',
      success: 'hover:bg-success-subtle hover:text-success-emphasis',
      danger: 'hover:bg-error-subtle hover:text-error-emphasis'
    }
  },
  defaults: { variant: 'ghost', size: 'md', round: false, tone: 'neutral' }
})

/** Kích thước biểu tượng theo từng cỡ nút thu gọn. */
export const COMPACT_ICON = { lg: ICON.md, md: ICON.sm, sm: ICON['2xs'] } as const

/*
 * Nhãn ngắn thể hiện trạng thái hoặc danh mục phân loại. Màu sắc biểu thị ý nghĩa:
 * success đã xong · info đang thực hiện, mới · warning tạm dừng, cần xem xét · error thất bại · accent nổi bật
 * · neutral chưa bắt đầu, không áp dụng. Nội dung văn bản luôn thể hiện rõ trạng thái.
 *   style  light (nền màu nhạt) | outline (chỉ viền ngoài) | plain (chấm tròn và chữ)
 */
export const badgeVariants = variants({
  base: 'inline-flex shrink-0 items-center gap-2xs whitespace-nowrap text-label-xs',
  variants: {
    color: {
      neutral: 'text-subtle',
      success: 'text-success-emphasis',
      info: 'text-info-emphasis',
      warning: 'text-warning-emphasis',
      error: 'text-error-emphasis',
      accent: 'text-accent-emphasis'
    },
    variant: { light: 'h-5 rounded-xs px-1.5', outline: 'h-5 rounded-xs border px-1.5', plain: '' }
  },
  compound: [
    { when: { variant: 'light', color: 'neutral' }, className: 'bg-muted' },
    { when: { variant: 'light', color: 'success' }, className: 'bg-success-subtle' },
    { when: { variant: 'light', color: 'info' }, className: 'bg-info-subtle' },
    { when: { variant: 'light', color: 'warning' }, className: 'bg-warning-subtle' },
    { when: { variant: 'light', color: 'error' }, className: 'bg-error-subtle' },
    { when: { variant: 'light', color: 'accent' }, className: 'bg-accent-subtle' },
    { when: { variant: 'outline', color: 'neutral' }, className: 'border-default' },
    { when: { variant: 'outline', color: 'success' }, className: 'border-success-muted' },
    { when: { variant: 'outline', color: 'info' }, className: 'border-info-muted' },
    { when: { variant: 'outline', color: 'warning' }, className: 'border-warning-muted' },
    { when: { variant: 'outline', color: 'error' }, className: 'border-error-muted' },
    { when: { variant: 'outline', color: 'accent' }, className: 'border-accent-muted' }
  ],
  defaults: { color: 'neutral', variant: 'light' }
})

/*
 * Khung dùng chung cho trường nhập một dòng và trigger chọn: hộp bề mặt có viền màu ô nhập,
 * hiệu ứng hover, viền focus nhẹ ôm khít kiểu VS Code quanh toàn khung và viền đỏ khi không hợp lệ.
 * Kích thước: md 28px · sm 24px (thanh công cụ, hàng bảng), tương ứng chiều cao các nút cạnh bên.
 */
export const inputFrameVariants = variants({
  base: cn(
    'flex min-w-0 items-center gap-xs border border-(--mira-input-border) bg-(--mira-input-bg) text-(--mira-input-fg)',
    'transition-colors duration-(--mira-duration-fast) ease-standard hover:bg-(--mira-input-bg-hover)',
    'has-[[aria-invalid=true]]:border-error has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-disabled has-[:disabled]:text-disabled',
    '[&_svg]:shrink-0 [&_svg]:text-muted',
    focusWithinRing
  ),
  variants: {
    size: {
      md: 'h-7 rounded-xs px-2.5 text-body-sm',
      sm: 'h-6 rounded-xs px-xs text-body-xs'
    }
  },
  defaults: { size: 'md' }
})
