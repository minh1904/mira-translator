import { useState, type JSX } from 'react'
import type { AgentTaskCommand, AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ConfirmDialog, type ConfirmRequest } from '../../../components/ui/ConfirmDialog'
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { MenuDotsIcon, PauseIcon, PlayIcon, RestartIcon } from '../../../components/ui/reicon'
import { useTaskStore } from '../store/taskStore'
import { COMMANDS } from './taskView'

/** The one command a row offers at hand, by state: the thing a person most likely came to do. */
const PRIMARY: Partial<Record<AgentTaskCommand, JSX.Element>> = {
  pause: <PauseIcon size={ICON.sm} />,
  continue: <PlayIcon size={ICON.sm} />,
  retry: <RestartIcon size={ICON.sm} />
}

const primaryOf = (task: AgentTaskSummary): AgentTaskCommand | null => {
  const commands = COMMANDS[task.state].map((each) => each.command)
  return (['retry', 'continue', 'pause'] as const).find((each) => commands.includes(each)) ?? null
}

/**
 * The end of a task's row: its main command as an icon, and every other command in a menu. Running everything
 * again overwrites translations, so it asks first, like in the task's own detail.
 */
export function TaskRowActions({ task }: { task: AgentTaskSummary }): JSX.Element | null {
  const control = useTaskStore((s) => s.control)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const primary = primaryOf(task)
  const label = (command: AgentTaskCommand): string =>
    COMMANDS[task.state].find((each) => each.command === command)?.label ?? ''
  const rest = COMMANDS[task.state].filter((each) => each.command !== primary)
  if (primary === null && rest.length === 0) return null

  const run = (command: AgentTaskCommand): void => {
    if (command === 'run_again') {
      setConfirm({
        title: 'Chạy lại tất cả chương?',
        description: `Chạy lại sẽ ghi đè bản dịch hiện có của ${task.workTitle}. Muốn chỉ dịch lại chương lỗi thì chọn "Chạy lại chương lỗi".`,
        confirmLabel: 'Ghi đè và chạy lại',
        onConfirm: () => void control(task.id, command)
      })
      return
    }
    void control(task.id, command)
  }

  return (
    <span className="flex items-center justify-end gap-3xs">
      {primary !== null && (
        <CompactButton
          aria-label={`${label(primary)}: ${task.workTitle}`}
          title={label(primary)}
          icon={PRIMARY[primary]}
          onClick={() => run(primary)}
        />
      )}
      {rest.length > 0 && (
        <MenuRoot>
          <MenuTrigger
            render={
              <CompactButton
                aria-label={`Thao tác với tác vụ ${task.workTitle}`}
                icon={<MenuDotsIcon size={ICON.sm} />}
              />
            }
          />
          <MenuPopup>
            {rest.map(({ command, label: text }) => (
              <MenuItem
                key={command}
                tone={command === 'cancel' ? 'danger' : 'default'}
                onClick={() => run(command)}
              >
                {text}
              </MenuItem>
            ))}
          </MenuPopup>
        </MenuRoot>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </span>
  )
}
