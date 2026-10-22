import type { JSX } from 'react'
import { Button } from '../../../components/ui/Button'

export interface ScrollControllerOptions {
  threshold?: number
  isPrefersReducedMotion?: () => boolean
}

export function shouldAutoScroll(distanceFromBottom: number, threshold = 80): boolean {
  return distanceFromBottom <= threshold
}

export function getScrollBehavior(
  isPrefersReducedMotion: () => boolean = () => false
): ScrollBehavior {
  return isPrefersReducedMotion() ? 'auto' : 'smooth'
}

export interface AutoScrollSentinelProps {
  showNewContentPill: boolean
  onScrollToBottom: () => void
}

export function AutoScrollSentinel({
  showNewContentPill,
  onScrollToBottom
}: AutoScrollSentinelProps): JSX.Element {
  return (
    <div className="relative w-full">
      {/* Floating button when user scrolled up and new content arrived (Task 6.6) */}
      {showNewContentPill && (
        <div className="sticky bottom-3 z-(--mira-z-sticky) flex justify-center">
          <Button variant="solid" onClick={onScrollToBottom} className="rounded-full shadow-md">
            Về mới nhất ↓
          </Button>
        </div>
      )}
      <div data-sentinel="bottom" className="h-px w-full pointer-events-none" />
    </div>
  )
}
