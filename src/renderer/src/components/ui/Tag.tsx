import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { AddIcon, CloseIcon } from './reicon'
import { focusRing } from './focus'
import { ICON } from './icon'
import { cn } from '../../lib/cn'

const tagClass =
  'inline-flex h-6 min-w-0 max-w-full items-center gap-2xs rounded-xs border text-label-xs'

const tagButtonClass = cn(
  'inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-subtle hover:bg-(--mira-input-bg-hover) hover:text-default',
  focusRing
)

/** Nút vuông 20 px bên trong nhãn, ví dụ nút ghim của chip vùng chọn. */
export function TagAction({
  label,
  title,
  icon,
  onClick
}: {
  /** Tên đọc được của nút. */
  label: string
  title?: string
  icon: ReactNode
  onClick(): void
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={tagButtonClass}
    >
      {icon}
    </button>
  )
}

/**
 * Nhãn 24 px bỏ được, như chip ngữ cảnh trên ô soạn của VS Code: nút × bên trái, icon, nhãn và nút
 * phụ tùy chọn. Backspace hoặc Delete khi nhãn có focus thì bỏ nhãn. Có `onOpen` thì bấm nhãn để mở.
 */
export function Tag({
  children,
  icon,
  removeLabel,
  onRemove,
  onOpen,
  openLabel,
  action,
  className
}: {
  children: ReactNode
  icon?: ReactNode
  /** Tên đọc được của nút ×, ví dụ "Bỏ Chương 1 khỏi ngữ cảnh"; không có thì nhãn không bỏ được. */
  removeLabel?: string
  onRemove?: () => void
  onOpen?: () => void
  /** Tooltip của phần nhãn bấm được. */
  openLabel?: string
  /** Nút phụ ở cuối nhãn (`TagAction`). */
  action?: ReactNode
  className?: string
}): JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (onRemove && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      onRemove()
    }
  }
  const content = (
    <>
      {icon}
      <span className="truncate">{children}</span>
    </>
  )
  return (
    <span
      data-slot="tag"
      className={cn(
        tagClass,
        'border-default bg-muted text-default',
        onRemove ? 'pl-0.5' : 'pl-1.5',
        action ? 'pr-0.5' : 'pr-1.5',
        className
      )}
    >
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          onKeyDown={onKeyDown}
          className={tagButtonClass}
        >
          <CloseIcon size={ICON.xs} aria-hidden="true" />
        </button>
      )}
      {onOpen ? (
        <button
          type="button"
          title={openLabel}
          onClick={onOpen}
          onKeyDown={onKeyDown}
          className={cn(
            'inline-flex min-w-0 cursor-pointer items-center gap-2xs rounded-xs hover:underline',
            focusRing
          )}
        >
          {content}
        </button>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2xs">{content}</span>
      )}
      {action}
    </span>
  )
}

/**
 * Nhãn gợi ý chưa được thêm (ngữ cảnh ngầm của VS Code): viền nét đứt, chữ nghiêng, dấu + bên trái;
 * hover thì viền liền. Cả nhãn là một nút, bấm hoặc Enter/Space để thêm.
 */
export function SuggestedTag({
  children,
  icon,
  label,
  title,
  onAdd
}: {
  children: ReactNode
  icon?: ReactNode
  /** Tên đọc được, ví dụ "Thêm Chương 1 vào ngữ cảnh". */
  label: string
  title?: string
  onAdd(): void
}): JSX.Element {
  return (
    <button
      type="button"
      data-slot="tag"
      data-suggested="true"
      aria-label={label}
      title={title ?? label}
      onClick={onAdd}
      className={cn(
        tagClass,
        'cursor-pointer border-dashed border-default bg-transparent px-1.5 text-subtle italic hover:border-solid hover:border-strong hover:text-default',
        focusRing
      )}
    >
      <AddIcon size={ICON.xs} aria-hidden="true" className="shrink-0" />
      {icon}
      <span className="truncate">{children}</span>
    </button>
  )
}
