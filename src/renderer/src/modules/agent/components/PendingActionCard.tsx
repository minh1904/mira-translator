import { useState, type JSX, type KeyboardEvent } from 'react'
import { AltArrowDownIcon } from '@renderer/components/ui/reicon'
import type { AgentPendingAction } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'

const APPROVE_SESSION = 'Cho phép trong phiên này'
const APPROVE_ONCE = 'Cho phép một lần'
const SKIP = 'Bỏ qua'

/** Phím tắt của thẻ duyệt như VS Code: Ctrl+Enter cho phép trong phiên, Ctrl+Alt+Enter bỏ qua. */
export function approvalShortcut(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
}): 'approve_session' | 'reject' | null {
  if (!event.ctrlKey || event.key !== 'Enter') return null
  return event.altKey ? 'reject' : 'approve_session'
}

export interface PendingActionCardProps {
  action: AgentPendingAction
  onReply: (action: AgentPendingAction, choice: string, label: string) => Promise<boolean>
}

/**
 * Thẻ của một lượt đang chờ: duyệt một thao tác ghi, hoặc chọn một trong các đích mơ hồ (câu hỏi của
 * agent nằm ở `QuestionCard` phía trên ô nhập). Câu trả
 * lời gắn với đúng call đang chờ (ID + digest), nên bấm hai lần hay bấm sau khi lượt đã đổi đều bị
 * Main từ chối thay vì chạy nhầm.
 */
export function PendingActionCard({ action, onReply }: PendingActionCardProps): JSX.Element {
  const [sending, setSending] = useState(false)
  const reply = async (choice: string, label: string): Promise<void> => {
    setSending(true)
    try {
      await onReply(action, choice, label)
    } finally {
      setSending(false)
    }
  }

  const isChoose = action.kind === 'choose'
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const choice = action.kind === 'approve' && !sending ? approvalShortcut(event) : null
    if (!choice) return
    event.preventDefault()
    void reply(choice, choice === 'reject' ? SKIP : APPROVE_SESSION)
  }

  return (
    <div
      role="group"
      aria-label={isChoose ? 'Chọn đích' : 'Cần duyệt'}
      aria-keyshortcuts={action.kind === 'approve' ? 'Control+Enter Control+Alt+Enter' : undefined}
      onKeyDown={onKeyDown}
      data-pending-call={action.toolCallId}
      className="my-1 flex flex-col gap-1.5 rounded-sm border border-default bg-surface/90 p-2 text-body-xs shadow-xs"
    >
      <p className="m-0 text-body-sm font-medium text-default">
        {isChoose ? 'Có nhiều đích khớp. Bạn muốn dùng đích nào?' : action.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {isChoose ? (
          action.candidates.map((candidate) => (
            <Button
              key={candidate.handle}
              variant="ghost"
              loading={sending}
              onClick={() => void reply(candidate.handle, candidate.label)}
              className="h-6 px-2.5 text-label-xs"
            >
              {candidate.label}
            </Button>
          ))
        ) : (
          <>
            <span className="inline-flex">
              <Button
                variant="solid"
                loading={sending}
                title="Cho phép trong phiên này (Ctrl+Enter)"
                onClick={() => void reply('approve_session', APPROVE_SESSION)}
                className="h-6 rounded-r-none px-2.5"
              >
                {APPROVE_SESSION}
              </Button>
              <MenuRoot>
                <MenuTrigger
                  render={
                    <Button
                      variant="solid"
                      disabled={sending}
                      aria-label="Lựa chọn cho phép khác"
                      className="h-6 rounded-l-none border-l border-l-(--mira-border-strong) px-1"
                    >
                      <AltArrowDownIcon size={ICON['2xs']} aria-hidden="true" />
                    </Button>
                  }
                />
                <MenuPopup align="start">
                  <MenuItem onClick={() => void reply('approve', APPROVE_ONCE)}>
                    {APPROVE_ONCE}
                  </MenuItem>
                </MenuPopup>
              </MenuRoot>
            </span>
            <Button
              loading={sending}
              title="Bỏ qua (Ctrl+Alt+Enter)"
              onClick={() => void reply('reject', SKIP)}
              className="h-6 px-2.5"
            >
              {SKIP}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
