import { useState, type JSX } from 'react'
import { AltArrowDownIcon } from '@renderer/components/ui/reicon'
import type { AgentPermissionLevel } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { Checkbox } from '../../../components/ui/Checkbox'
import { Dialog } from '../../../components/ui/Dialog'
import {
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger
} from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { useAgentStore } from '../store/agentStore'

/** Nhãn và mô tả của ba mức quyền, theo bộ chọn quyền của VS Code. */
export const PERMISSION_LEVELS: Record<
  AgentPermissionLevel,
  { label: string; description: string; warning?: string }
> = {
  default: { label: 'Mặc định', description: 'Hỏi trước thao tác cần duyệt' },
  allow_all: {
    label: 'Cho phép tất cả',
    description: 'Chạy mọi thao tác không hỏi',
    warning:
      'Trợ lý sẽ chạy mọi thao tác cần duyệt mà không hỏi, kể cả ghi vào chương bạn không nêu và tạo tác vụ dịch nhiều chương tốn chi phí. Chỉ áp dụng cho phiên này.'
  },
  autopilot: {
    label: 'Autopilot',
    description: 'Tự làm, bỏ qua thao tác rủi ro cao',
    warning:
      'Trợ lý sẽ tự duyệt thao tác và tự trả lời câu hỏi của chính nó. Thao tác rủi ro cao (tạo tác vụ dịch nhiều chương, ghi vào chương bạn không nêu) bị bỏ qua. Có thể tốn chi phí hơn. Chỉ áp dụng cho phiên này.'
  }
}

const SKIP_CONFIRM_KEY = 'mira.agent.skipPermissionConfirm'

export function readSkipConfirm(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SKIP_CONFIRM_KEY) === '1'
  } catch {
    return false
  }
}

function writeSkipConfirm(): void {
  try {
    localStorage.setItem(SKIP_CONFIRM_KEY, '1')
  } catch {
    // Không lưu được thì hộp xác nhận chỉ hiện lại lần sau.
  }
}

/**
 * Chọn mức quyền của phiên ở thanh dưới ô soạn. Nâng lên Cho phép tất cả hoặc Autopilot cần xác
 * nhận, trừ khi người dùng đã chọn Không hỏi lại.
 */
export function PermissionLevelMenu(): JSX.Element {
  const level = useAgentStore((s) => s.permissionLevel)
  const setPermissionLevel = useAgentStore((s) => s.setPermissionLevel)
  const [asking, setAsking] = useState<AgentPermissionLevel | null>(null)
  const [skipNextTime, setSkipNextTime] = useState(false)

  const choose = (next: AgentPermissionLevel): void => {
    if (next === level) return
    if (next === 'default' || readSkipConfirm()) {
      void setPermissionLevel(next)
      return
    }
    setSkipNextTime(false)
    setAsking(next)
  }

  const confirm = (): void => {
    if (!asking) return
    if (skipNextTime) writeSkipConfirm()
    void setPermissionLevel(asking)
    setAsking(null)
  }

  const current = PERMISSION_LEVELS[level]
  return (
    <>
      <MenuRoot>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              aria-label={`Mức quyền: ${current.label}`}
              title={current.description}
              rightIcon={<AltArrowDownIcon size={ICON['2xs']} aria-hidden="true" />}
              className="h-[20px] shrink-0 px-1.5 text-label-xs font-medium text-subtle hover:text-default"
            >
              {current.label}
            </Button>
          }
        />
        <MenuPopup align="start">
          <MenuRadioGroup
            value={level}
            onValueChange={(value) => choose(value as AgentPermissionLevel)}
          >
            {(Object.keys(PERMISSION_LEVELS) as AgentPermissionLevel[]).map((key) => (
              <MenuRadioItem key={key} value={key} className="h-auto py-1">
                <span className="flex flex-col">
                  <span>{PERMISSION_LEVELS[key].label}</span>
                  <span className="text-body-xs text-muted">
                    {PERMISSION_LEVELS[key].description}
                  </span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </MenuRoot>
      <Dialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        size="sm"
        title={asking ? `Bật ${PERMISSION_LEVELS[asking].label}?` : ''}
        description={asking ? PERMISSION_LEVELS[asking].warning : undefined}
        footer={
          <>
            <Checkbox
              checked={skipNextTime}
              onCheckedChange={(checked) => setSkipNextTime(checked)}
              className="mr-auto"
            >
              Không hỏi lại
            </Checkbox>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Hủy
            </Button>
            <Button variant="solid" onClick={confirm}>
              Bật
            </Button>
          </>
        }
      />
    </>
  )
}
