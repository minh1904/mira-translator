import { useEffect, useRef, useState, type JSX } from 'react'
import { SafeMarkdown } from '../../../components/ui/SafeMarkdown'
import {
  closeOpenFence,
  countWords,
  estimateRate,
  nextWordCount,
  sliceWords
} from './progressiveRender'

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The words of `text` to show now: they appear at the rate text arrives instead of in chunks, and
 * drain quickly once the stream is done. Text that was already complete shows at once.
 */
function useProgressiveText(text: string, live: boolean): string {
  const total = countWords(text)
  const [shown, setShown] = useState(() => (live ? 0 : total))
  const clock = useRef<{ started: number; last: number } | null>(null)
  const reduced = reducedMotion()

  useEffect(() => {
    if (reduced || shown >= total) return
    const frame = requestAnimationFrame((now) => {
      clock.current ??= { started: now, last: now }
      const { started, last } = clock.current
      clock.current.last = now
      setShown((current) =>
        nextWordCount({
          rendered: current,
          total,
          elapsedMs: now - last,
          rate: estimateRate(total, now - started),
          done: !live
        })
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [shown, total, live, reduced])

  return reduced || shown >= total ? text : sliceWords(text, shown)
}

/** Chữ trả lời của một vòng, chạy theo tốc độ từ khi đang stream. */
export function MarkdownPart({ text, live }: { text: string; live: boolean }): JSX.Element {
  const shown = useProgressiveText(text, live)
  const complete = !live && shown === text
  return (
    <div className="text-body-sm leading-normal">
      <SafeMarkdown text={complete ? text : closeOpenFence(shown)} />
    </div>
  )
}
