import type { JSX, ReactNode } from 'react'
import type { SessionStatus } from '../chapter-editor/editorSession'

const STATE_LABEL: Record<SessionStatus['state'], string> = {
  saved: 'Đã lưu',
  dirty: 'Chưa lưu',
  saving: 'Đang lưu…',
  conflict: 'Chưa lưu',
  error: 'Chưa lưu'
}

/**
 * Khung chứa của một bên soạn thảo (bản gốc hoặc bản dịch), bao gồm thanh tiêu đề,
 * trạng thái lưu, các nút thao tác và vùng nội dung soạn thảo bên dưới.
 */
export function EditorPane({
  title,
  subtitle,
  status,
  lockLabel,
  lockIcon,
  actions,
  notice,
  children
}: {
  title: string
  subtitle: string
  status: SessionStatus
  /** Nhãn mô tả trạng thái khóa bản gốc cho trình đọc màn hình. */
  lockLabel?: string
  /** Biểu tượng khóa hiển thị cạnh tiêu đề. */
  lockIcon?: ReactNode
  actions?: ReactNode
  notice?: ReactNode
  children: ReactNode
}): JSX.Element {
  // Khung chỉ hiển thị trạng thái khi có nội dung chưa lưu ở chính bên đó.
  const saved = status.state === 'saved'
  return (
    <section
      aria-label={title}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-default bg-surface overflow-hidden shadow-xs"
    >
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-default bg-subtle/30 px-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-label-xs font-semibold text-emphasis">{title}</h3>
          {lockIcon}
          <p className="truncate text-body-xs text-subtle">{subtitle}</p>
          <p
            role="status"
            className="flex shrink-0 items-center gap-1 text-body-xs whitespace-nowrap text-subtle"
          >
            {/* Biểu tượng trạng thái khóa được ẩn đối với trình đọc màn hình. */}
            {lockLabel && <span className="sr-only">{lockLabel}</span>}
            {!saved && (
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
            )}
            {!saved && STATE_LABEL[status.state]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      </div>
      {notice && <div className="border-b border-default bg-warning/10 p-2">{notice}</div>}
      <div className="min-h-0 flex-1 p-2">{children}</div>
    </section>
  )
}
