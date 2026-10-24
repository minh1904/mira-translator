import { useEffect, useMemo, type JSX } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { partitionActivities } from '../model/activity'
import { useTaskStore } from '../store/taskStore'

/**
 * A small mark beside a work's "Hoạt động" tab: how many things need the person, else a dot while something
 * runs. Nothing when all is quiet. The words are for screen readers; the mark is never colour alone.
 */
export function ActivityTabBadge({ workId }: { workId: string }): JSX.Element | null {
  const tasks = useTaskStore((s) => s.tasks)
  const operations = useTaskStore((s) => s.operations)
  const refresh = useTaskStore((s) => s.refresh)
  const listen = useTaskStore((s) => s.listen)

  useEffect(() => {
    void refresh()
    return listen()
  }, [refresh, listen])

  const parts = useMemo(
    () =>
      partitionActivities(
        tasks.filter((task) => task.workId === workId),
        operations.filter((operation) => operation.target.workId === workId),
        Date.now()
      ),
    [tasks, operations, workId]
  )
  if (parts.attention.length > 0) {
    return (
      <Badge color="warning">
        {parts.attention.length}
        <span className="sr-only"> việc cần xử lý</span>
      </Badge>
    )
  }
  if (parts.running.length > 0) {
    return (
      <>
        <span aria-hidden className="size-1.5 rounded-full bg-info" />
        <span className="sr-only">đang chạy</span>
      </>
    )
  }
  return null
}
