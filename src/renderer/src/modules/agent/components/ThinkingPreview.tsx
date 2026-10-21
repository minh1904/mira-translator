import { useState, type JSX } from 'react'
import { AltArrowRightIcon } from '@renderer/components/ui/reicon'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'

export interface ThinkingPreviewProps {
  reasoning: string | null | undefined
  isThinking?: boolean
  isAnswerStarted?: boolean
  durationMs?: number
}

export function formatThinkingDuration(ms?: number): string | null {
  if (ms === undefined || ms === null || ms <= 0) return null
  const seconds = (ms / 1000).toFixed(1)
  return `${seconds}s`
}

export function ThinkingPreview({
  reasoning,
  isThinking = false,
  isAnswerStarted = false,
  durationMs
}: ThinkingPreviewProps): JSX.Element | null {
  const [userOpened, setUserOpened] = useState<boolean | null>(null)

  // If no reasoning text at all, never render fake thinking
  if (!reasoning || reasoning.trim().length === 0) {
    return null
  }

  // Auto-collapse if answer started and user hasn't manually opened
  const isOpen = userOpened ?? (isThinking && !isAnswerStarted)
  const durationLabel = formatThinkingDuration(durationMs)

  const title = isThinking
    ? 'Thinking...'
    : durationLabel
      ? `Thinking - ${durationLabel}`
      : 'Thinking'

  return (
    <div className="my-1 flex flex-col text-body-xs text-subtle">
      <Button
        variant="ghost"
        aria-expanded={isOpen}
        onClick={() => setUserOpened(!isOpen)}
        className="h-5 w-fit gap-1.5 px-1 text-left text-subtle select-none hover:text-default"
      >
        <span
          className={cn(
            'flex shrink-0 items-center text-muted transition-transform duration-150',
            isOpen && 'rotate-90'
          )}
        >
          <AltArrowRightIcon size={ICON['2xs']} />
        </span>
        <span
          className={cn(
            'text-label-xs font-medium tracking-tight',
            isThinking ? 'text-emphasis motion-safe:animate-pulse' : 'text-subtle'
          )}
        >
          {title}
        </span>
      </Button>

      {isOpen && (
        <div className="mt-1 ml-1.5 border-l border-default/70 pl-2.5 font-mono text-body-xs leading-normal text-subtle whitespace-pre-wrap">
          {reasoning}
        </div>
      )}
    </div>
  )
}
