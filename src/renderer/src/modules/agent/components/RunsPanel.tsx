import { useState, type JSX } from 'react'
import type { AgentTaskDetailView } from '../../../../../shared/contracts/agentTask'
import { Field } from '../../../components/ui/Field'
import { Select } from '../../../components/ui/Select'
import { isProblem } from '../model/chapters'
import { RunLog } from './RunLog'

/** The chapter whose runs show first: one that failed, else the one running, else the latest that ran. */
export function defaultRunsItem(items: AgentTaskDetailView['items']): string | null {
  const ran = items.filter((item) => item.lastRun)
  return (
    (ran.find(isProblem) ?? ran.find((item) => item.state === 'running') ?? ran.at(-1))?.id ?? null
  )
}

/** "Lần chạy": the runs of one chapter, chosen here instead of nested under every chapter row. */
export function RunsPanel({
  taskId,
  detail,
  itemId
}: {
  taskId: string
  detail: AgentTaskDetailView
  /** The chapter asked for from a row's menu, if any. */
  itemId: string | null
}): JSX.Element {
  const ran = detail.items.filter((item) => item.lastRun)
  const [picked, setPicked] = useState<string | null>(null)
  const wanted = picked ?? itemId ?? defaultRunsItem(detail.items)
  const current = ran.find((item) => item.id === wanted)?.id ?? ran[0]?.id ?? null
  if (current === null) {
    return <p className="m-0 text-body-sm text-muted">Chưa có chương nào chạy lần nào.</p>
  }
  return (
    <div className="flex flex-col gap-sm">
      <Field label="Chương" className="max-w-[28rem]">
        {({ id }) => (
          <Select
            id={id}
            label="Chương"
            value={current}
            options={ran.map((item) => ({ value: item.id, label: item.chapterLabel }))}
            onChange={setPicked}
          />
        )}
      </Field>
      <RunLog key={current} taskId={taskId} itemId={current} />
    </div>
  )
}
