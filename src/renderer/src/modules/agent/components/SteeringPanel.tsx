import { useState, type JSX } from 'react'
import type {
  AgentTaskDetailView,
  AgentTaskSteeringState,
  AgentTaskState,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import { STEERING_INSTRUCTION_MAX } from '../../../../../shared/contracts/agentTask'
import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Field } from '../../../components/ui/Field'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { steerableChapters } from '../model/chapters'
import { useTaskStore } from '../store/taskStore'
import type { TaskActions } from './taskView'

const STEERING_STATES: Record<AgentTaskSteeringState, { label: string; color: BadgeColor }> = {
  accepted: { label: 'Chờ áp dụng', color: 'info' },
  applied: { label: 'Đã áp dụng', color: 'success' },
  superseded: { label: 'Bị thay', color: 'neutral' }
}

/** States that still take steering (the rest are finished or cancelling). */
const STEERABLE: readonly AgentTaskState[] = [
  'queued',
  'running',
  'pausing',
  'paused',
  'waiting_user'
]

const EXAMPLE = 'Ví dụ: Giữ nguyên tên riêng bằng Hán Việt; xưng hô anh – em giữa A và B.'

/**
 * "Cách dịch" of a task (change `add-agent-steering`): the instruction in effect, what was changed and
 * where it applies, and a form that is closed until asked for. The new text replaces the old one from the
 * chosen chapter on; chapters already translated keep their version.
 */
export function SteeringPanel({
  task,
  detail,
  onAskAssistant
}: {
  task: AgentTaskSummary
  detail: AgentTaskDetailView
  onAskAssistant?: TaskActions['onAskAssistant']
}): JSX.Element {
  const steer = useTaskStore((s) => s.steer)
  const announcement = useTaskStore((s) => s.announcement)
  const choices = steerableChapters(detail.items)
  const current = detail.currentInstruction ?? ''
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState('')
  const [text, setText] = useState(current)
  const [done, setDone] = useState(false)

  // The next chapter unless another one was picked and can still be reached.
  const chapterId = choices.some((item) => item.chapterId === picked)
    ? picked
    : (choices[0]?.chapterId ?? '')
  const chosen = choices.find((item) => item.chapterId === chapterId)
  const trimmed = text.trim()
  const missing =
    chapterId === ''
      ? 'Không còn chương nào chưa dịch để áp dụng.'
      : trimmed === ''
        ? 'Cần nhập chỉ dẫn.'
        : trimmed === current
          ? 'Chỉ dẫn chưa đổi so với hiện tại.'
          : null

  return (
    <div className="flex flex-col gap-md">
      <p className="m-0 max-w-[68ch] text-body-sm text-subtle">
        Đổi chỉ dẫn dịch cho các chương chưa dịch. Chương đã dịch giữ nguyên bản cũ.
      </p>
      <p className="m-0 max-w-[68ch] text-body-sm wrap-anywhere">
        <span className="text-subtle">Chỉ dẫn hiện tại: </span>
        {current !== '' ? `“${current}”` : 'Chưa có chỉ dẫn.'}
      </p>
      {done && announcement !== '' && (
        <p role="status" className="m-0 text-body-sm text-success">
          {announcement}
        </p>
      )}
      {STEERABLE.includes(task.state) && !open && (
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setText(current)
              setDone(false)
              setOpen(true)
            }}
          >
            Đổi chỉ dẫn dịch…
          </Button>
        </div>
      )}
      {STEERABLE.includes(task.state) && open && (
        <form
          aria-label="Đổi chỉ dẫn dịch"
          className="flex max-w-[68ch] flex-col gap-sm"
          onSubmit={(event) => {
            event.preventDefault()
            if (missing === null)
              void steer(task.id, { chapterId }, trimmed).then((ok) => {
                if (!ok) return
                setDone(true)
                setOpen(false)
              })
          }}
        >
          <Field
            label="Áp dụng từ chương"
            hint={choices.length > 0 ? 'Chỉ các chương chưa dịch.' : undefined}
          >
            {({ id }) => (
              <Select
                id={id}
                label="Áp dụng từ chương"
                value={chapterId}
                disabled={choices.length === 0}
                options={choices.map((item) => ({
                  value: item.chapterId,
                  label: item.chapterLabel
                }))}
                onChange={setPicked}
              />
            )}
          </Field>
          <Field label="Chỉ dẫn mới (thay hẳn chỉ dẫn cũ)" hint={EXAMPLE}>
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                maxLength={STEERING_INSTRUCTION_MAX}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-xs">
            <Button type="submit" variant="solid" disabled={missing !== null}>
              {chosen ? `Áp dụng từ ${chosen.chapterLabel}` : 'Áp dụng'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            {onAskAssistant && (
              <Button
                variant="ghost"
                onClick={() =>
                  onAskAssistant(
                    `Giúp tôi viết chỉ dẫn dịch mới cho tác vụ dịch "${task.workTitle}"` +
                      (chosen ? `, áp dụng từ ${chosen.chapterLabel}` : '') +
                      (current !== '' ? `. Chỉ dẫn hiện tại: ${current}` : '.')
                  )
                }
              >
                Nhờ Trợ lý viết giúp
              </Button>
            )}
          </div>
          {missing !== null && <p className="m-0 text-body-xs text-muted">{missing}</p>}
        </form>
      )}
      {detail.steerings.length > 0 && (
        <section aria-label="Lịch sử điều chỉnh" className="flex flex-col gap-xs">
          <h4 className="m-0 text-label-sm">Lịch sử điều chỉnh</h4>
          <ul aria-label="Các lần điều chỉnh" className="m-0 flex list-none flex-col gap-2xs p-0">
            {detail.steerings.map((steering) => (
              <li key={steering.id} className="flex flex-wrap items-center gap-xs text-body-sm">
                <span className="min-w-0 flex-1">
                  {steering.kind === 'instruction' ? 'Chỉ dẫn' : 'Xưng hô'} · yêu cầu từ{' '}
                  {steering.requestedLabel} · áp dụng từ {steering.effectiveLabel}
                </span>
                <Badge color={STEERING_STATES[steering.state].color} variant="plain" dot>
                  {STEERING_STATES[steering.state].label}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
