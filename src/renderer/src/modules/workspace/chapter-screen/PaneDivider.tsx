import type { JSX, RefObject } from 'react'
import { MAX_SOURCE_RATIO, MIN_SOURCE_RATIO } from '../store/paneLayoutStore'

const STEP = 0.05

/**
 * Thanh phân chia giữa bản gốc và bản dịch, có thể kéo thả để điều chỉnh tỷ lệ chiều rộng.
 */
export function PaneDivider({
  ratio,
  container,
  onRatioChange
}: {
  /** Tỷ lệ chiều rộng của khung bản gốc bên trái so với khung chứa. */
  ratio: number
  /** Phần tử chứa cả hai khung bản gốc và bản dịch. */
  container: RefObject<HTMLElement | null>
  onRatioChange(ratio: number): void
}): JSX.Element {
  return (
    // biome-ignore lint/a11y/useSemanticElements: Thẻ hr không nhận focus hoặc kéo thả; bộ phân tách hỗ trợ focus là chuẩn ARIA cho splitter.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Chia bề rộng bản gốc và bản dịch"
      aria-valuemin={MIN_SOURCE_RATIO * 100}
      aria-valuemax={MAX_SOURCE_RATIO * 100}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      title="Kéo để chia lại bề rộng; bấm đúp để chia đôi"
      className="group relative z-(--mira-z-sticky) w-px shrink-0 cursor-col-resize touch-none bg-line outline-none"
      onDoubleClick={() => onRatioChange(0.5)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onRatioChange(ratio - STEP)
        else if (event.key === 'ArrowRight') onRatioChange(ratio + STEP)
        else return
        event.preventDefault()
      }}
      onPointerDown={(event) => {
        const box = container.current?.getBoundingClientRect()
        if (!box || box.width === 0) return
        event.preventDefault()
        const pointerId = event.pointerId
        const target = event.currentTarget
        target.setPointerCapture(pointerId)

        // Bắt sự kiện con trỏ để di chuyển thanh chia; dừng kéo khi thả chuột hoặc mất focus
        const end = (): void => {
          if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
          target.removeEventListener('pointermove', onMove)
          target.removeEventListener('pointerup', end)
          target.removeEventListener('pointercancel', end)
          target.removeEventListener('lostpointercapture', end)
        }
        const onMove = (moveEvent: PointerEvent): void => {
          if (moveEvent.buttons === 0) {
            end()
            return
          }
          onRatioChange((moveEvent.clientX - box.left) / box.width)
        }
        target.addEventListener('pointermove', onMove)
        target.addEventListener('pointerup', end)
        target.addEventListener('pointercancel', end)
        target.addEventListener('lostpointercapture', end)
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 -left-[3px] w-[7px] transition-colors duration-(--mira-duration-fast) group-hover:bg-focus/30 group-focus-visible:bg-focus/40"
      />
    </div>
  )
}
