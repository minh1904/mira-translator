import { useEffect, useState } from 'react'
import type { AgentTaskDetailView } from '../../../../../shared/contracts/agentTask'
import type { TaskQualityView } from '../../../../../shared/contracts/taskQuality'
import { useTaskStore } from '../store/taskStore'

/**
 * The detail (and quality warnings) of a task, held in the store only while the task is chosen. The store
 * refetches what it holds on every task event, so only the one on screen costs anything.
 */
export function useTaskDetail(taskId: string): {
  detail: AgentTaskDetailView | undefined
  quality: TaskQualityView | undefined
} {
  const detail = useTaskStore((s) => s.details[taskId])
  const quality = useTaskStore((s) => s.quality[taskId])
  const expand = useTaskStore((s) => s.expand)
  const collapse = useTaskStore((s) => s.collapse)
  useEffect(() => {
    void expand(taskId)
    return () => collapse(taskId)
  }, [taskId, expand, collapse])
  return { detail, quality }
}

/** Seconds since `since`, ticking once a second while it is set, the window is visible and motion is not reduced. */
export function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null || typeof document === 'undefined') return
    // A counter is not an animation, but a person who asked for less motion gets no ticking text either.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let timer: ReturnType<typeof setInterval> | null = null
    const start = (): void => {
      setNow(Date.now())
      timer ??= setInterval(() => setNow(Date.now()), 1000)
    }
    const stop = (): void => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibility = (): void => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [since])
  return since === null ? null : Math.max(0, now - since)
}
