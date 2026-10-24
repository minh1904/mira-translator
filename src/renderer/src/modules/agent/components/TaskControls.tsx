import { useState, type JSX } from 'react'
import type { AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog, type ConfirmRequest } from '../../../components/ui/ConfirmDialog'
import { useTaskStore } from '../store/taskStore'
import { COMMANDS, type TaskActions } from './taskView'

/** The commands a task accepts in its state; running everything again asks first (it overwrites). */
export function TaskControls({
  task,
  onReviewContext
}: {
  task: AgentTaskSummary
  onReviewContext: TaskActions['onReviewContext']
}): JSX.Element {
  const control = useTaskStore((s) => s.control)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-xs">
      {task.reason === 'context_review' && onReviewContext && (
        <Button variant="solid" onClick={() => onReviewContext(task.workId)}>
          Xem ngữ cảnh
        </Button>
      )}
      {COMMANDS[task.state].map(({ command, label }) => (
        <Button
          key={command}
          variant={command === 'continue' || command === 'retry' ? 'solid' : 'outline'}
          color={command === 'cancel' ? 'danger' : 'neutral'}
          onClick={() =>
            command === 'run_again'
              ? setConfirm({
                  title: 'Chạy lại tất cả chương?',
                  description: `Chạy lại sẽ ghi đè bản dịch hiện có của ${task.workTitle}. Muốn chỉ dịch lại chương lỗi thì chọn "Chạy lại chương lỗi".`,
                  confirmLabel: 'Ghi đè và chạy lại',
                  onConfirm: () => void control(task.id, command)
                })
              : void control(task.id, command)
          }
        >
          {label}
        </Button>
      ))}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
