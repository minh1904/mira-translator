import { useEffect, useRef, useState, type JSX } from 'react'
import { AltArrowRightIcon, CheckIcon } from '@renderer/components/ui/reicon'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'

export interface ThinkingPartProps {
  text: string
  /** The reasoning is still streaming. */
  live: boolean
  /** Another part started after it: it folds unless the user opened it. */
  superseded: boolean
  durationMs: number | null
}

/** "1,2 giây" or "12 giây", as VS Code's "Finished thinking after …". */
export function formatThinkingDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || ms <= 0) return null
  const seconds = ms / 1000
  return seconds < 10
    ? `${seconds.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây`
    : `${Math.round(seconds)} giây`
}

/** The title a streaming reasoning gives itself when it opens with a bold line (`**Tiêu đề**`). */
export function thinkingHeading(text: string): string | null {
  const match = /^\s*\*\*([^*\n]+)\*\*/.exec(text)
  return match ? match[1].trim() : null
}

export function thinkingTitle(text: string, live: boolean, durationMs: number | null): string {
  if (live) {
    const heading = thinkingHeading(text)
    return heading ? `Đang suy nghĩ: ${heading}` : 'Đang suy nghĩ'
  }
  const duration = formatThinkingDuration(durationMs)
  return duration ? `Đã suy nghĩ trong ${duration}` : 'Đã suy nghĩ'
}

/**
 * Khối suy nghĩ tại vị trí của nó trong câu trả lời: cao tối đa 200px và tự cuộn khi đang stream,
 * thu gọn khi phần tiếp theo bắt đầu nếu người dùng chưa tự mở.
 */
export function ThinkingPart({
  text,
  live,
  superseded,
  durationMs
}: ThinkingPartProps): JSX.Element | null {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const open = userOpen ?? (live && !superseded)

  useEffect(() => {
    if (live && open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  })

  if (text.trim() === '') return null
  return (
    <div className="flex flex-col text-body-xs text-subtle">
      <Button
        variant="ghost"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="h-5 w-fit gap-1.5 px-1 text-left text-subtle select-none hover:text-default"
      >
        <span className="flex size-3 shrink-0 items-center justify-center text-muted">
          {open ? (
            <AltArrowRightIcon size={ICON['2xs']} className="rotate-90" aria-hidden="true" />
          ) : live ? (
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          ) : (
            <CheckIcon size={ICON['2xs']} aria-hidden="true" />
          )}
        </span>
        <span
          className={cn(
            'text-label-xs font-medium',
            live ? 'text-emphasis motion-safe:animate-pulse' : 'text-subtle'
          )}
        >
          {thinkingTitle(text, live, durationMs)}
        </span>
      </Button>
      {open && (
        <div
          ref={bodyRef}
          className="selectable mt-1 ml-1.5 max-h-[200px] overflow-y-auto border-l border-default pl-2.5 whitespace-pre-wrap leading-normal"
        >
          {text}
        </div>
      )}
    </div>
  )
}
