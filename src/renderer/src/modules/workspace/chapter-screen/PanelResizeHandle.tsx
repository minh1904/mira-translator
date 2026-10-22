import type { JSX } from 'react'

const MIN_WIDTH = 320
const MAX_WIDTH = 720

/** Tay nắm kéo thả ở cạnh trái side panel để đổi bề rộng; dùng chung cho mọi tab của panel. */
export function PanelResizeHandle({
  width,
  onWidthChange,
  onDraggingChange
}: {
  width: number
  onWidthChange(width: number): void
  /** Đang kéo: khung chứa phải tắt hiệu ứng đổi bề rộng để bám theo con trỏ ngay. */
  onDraggingChange?(dragging: boolean): void
}): JSX.Element {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Kéo để đổi bề rộng"
      className="absolute top-0 left-0 z-(--mira-z-sticky) flex h-full w-1.5 cursor-col-resize touch-none items-center justify-center hover:bg-focus/30"
      onPointerDown={(event) => {
        event.preventDefault()
        const pointerId = event.pointerId
        const target = event.currentTarget
        target.setPointerCapture(pointerId)
        const startX = event.clientX
        const startWidth = width
        onDraggingChange?.(true)

        const onMove = (moveEvent: PointerEvent): void => {
          const next = startWidth + (startX - moveEvent.clientX)
          onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)))
        }
        const onUp = (): void => {
          target.releasePointerCapture(pointerId)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          onDraggingChange?.(false)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      }}
    >
      <span aria-hidden="true" className="h-6 w-px bg-line-strong" />
    </span>
  )
}
