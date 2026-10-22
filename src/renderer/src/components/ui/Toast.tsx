import type { JSX } from 'react'
import { CloseIcon } from '@renderer/components/ui/reicon'

import { cn } from '../../lib/cn'
import { useNotificationStore, type Toast } from './notificationStore'
import { CompactButton } from './CompactButton'
import { LinkButton } from './Button'

const DOT: Record<Toast['kind'], string> = {
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  error: 'bg-error'
}

function ToastCard({ toast }: { toast: Toast }): JSX.Element {
  const dismiss = useNotificationStore((state) => state.dismiss)
  const loud = toast.kind === 'error' || toast.kind === 'warning'
  const animClass = toast.placement === 'top-center' ? 'animate-toast-top' : 'animate-toast-right'
  return (
    <div
      role={loud ? 'alert' : 'status'}
      data-slot="toast"
      className={cn(
        'pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-sm rounded-md border border-default bg-surface px-sm py-xs text-default shadow-sm',
        animClass
      )}
    >
      <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', DOT[toast.kind])} />
      <div className="flex min-w-0 flex-1 flex-col gap-3xs">
        <span className="text-label-sm">{toast.title}</span>
        {toast.message && (
          <span className="selectable text-body-xs break-words text-subtle">{toast.message}</span>
        )}
        {toast.action && (
          <LinkButton
            size="sm"
            className="mt-2xs self-start"
            onClick={() => {
              toast.action?.onClick()
              dismiss(toast.id)
            }}
          >
            {toast.action.label}
          </LinkButton>
        )}
      </div>
      <CompactButton
        aria-label="Đóng thông báo"
        icon={<CloseIcon size={14} />}
        onClick={() => dismiss(toast.id)}
      />
    </div>
  )
}

/** Gắn một lần duy nhất: thông báo nhẹ nhàng xếp ở góc dưới bên phải, thông báo cần chú ý xếp ở giữa phía trên. */
export function Toaster(): JSX.Element {
  return <ToastStacks toasts={useNotificationStore((state) => state.toasts)} />
}

export function ToastStacks({ toasts }: { toasts: Toast[] }): JSX.Element {
  const quiet = toasts.filter((toast) => toast.placement === 'bottom-right')
  const sticky = toasts.filter((toast) => toast.placement === 'top-center')
  return (
    <>
      <div className="pointer-events-none fixed top-14 left-1/2 z-(--mira-z-toast) flex -translate-x-1/2 flex-col gap-xs">
        {sticky.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
      <div className="pointer-events-none fixed right-md bottom-md z-(--mira-z-toast) flex flex-col items-end gap-xs">
        {quiet.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </>
  )
}
