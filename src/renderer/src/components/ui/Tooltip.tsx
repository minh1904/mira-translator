import type { JSX, ReactElement, ReactNode } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'

/** Tooltip mở sau 200ms; khi con trỏ di chuyển giữa các phần tử cùng hàng, tooltip tiếp theo sẽ mở ngay lập tức. */
const OPEN_DELAY = 200

/** Bọc ứng dụng một lần để các tooltip lân cận chia sẻ chung độ trễ mở. */
export function TooltipProvider({ children }: { children: ReactNode }): JSX.Element {
  return <BaseTooltip.Provider delay={OPEN_DELAY}>{children}</BaseTooltip.Provider>
}

export interface TipProps {
  /** Mô tả ngắn gọn chức năng của phần tử điều khiển. */
  label: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Phần tử điều khiển mà tooltip mô tả: phải chấp nhận ref và props (nút bấm, không dùng fragment). */
  children: ReactElement
}

/**
 * Chú thích văn bản khi hover chuột, màu tương phản ngược. Dùng để đặt tên cho nút chỉ có biểu tượng;
 * phần giải thích chức năng của trường nhập nên đặt cạnh trường đó vì tooltip không hoạt động với cảm ứng.
 */
export function Tip({ label, side = 'bottom', children }: TipProps): JSX.Element {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="z-(--mira-z-tooltip)" side={side} sideOffset={6}>
          <BaseTooltip.Popup
            data-slot="tooltip"
            className="max-w-80 rounded-md bg-(--mira-tooltip-bg) px-xs py-2xs text-label-xs text-(--mira-tooltip-fg) shadow-sm transition-[opacity,scale] duration-(--mira-duration-fast) ease-enter data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
          >
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
