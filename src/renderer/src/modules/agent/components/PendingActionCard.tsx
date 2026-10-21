import { useState, type JSX } from 'react'
import type { AgentPendingAction } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'

export interface PendingActionCardProps {
  action: AgentPendingAction
  onReply: (action: AgentPendingAction, choice: string, label: string) => Promise<boolean>
}

/**
 * Câu hỏi của một lượt đang chờ: duyệt một thao tác ghi, hoặc chọn một trong các đích mơ hồ. Câu trả
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

  const isQuestion = action.kind === 'question'
  const isChoose = action.kind === 'choose'

  return (
    <div
      role="group"
      aria-label={isQuestion ? 'Câu hỏi của Trợ lý' : isChoose ? 'Chọn đích' : 'Cần duyệt'}
      data-pending-call={action.toolCallId}
      className="my-1 flex flex-col gap-1.5 rounded-md border border-default bg-surface/90 p-2 text-body-xs shadow-xs"
    >
      <p className="m-0 text-body-sm font-medium text-default">
        {isChoose ? 'Có nhiều đích khớp. Bạn muốn dùng đích nào?' : action.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {isQuestion || isChoose ? (
          action.candidates.map((candidate) => (
            <Button
              key={candidate.handle}
              variant={isQuestion ? 'outline' : 'ghost'}
              loading={sending}
              onClick={() => void reply(candidate.handle, candidate.label)}
              className="!h-6 !px-2.5 text-label-xs"
            >
              {candidate.label}
            </Button>
          ))
        ) : (
          <>
            <Button
              variant="solid"
              loading={sending}
              onClick={() => void reply('approve', 'Duyệt')}
              className="!h-6 !px-2.5"
            >
              Duyệt
            </Button>
            <Button
              loading={sending}
              onClick={() => void reply('reject', 'Không duyệt')}
              className="!h-6 !px-2.5"
            >
              Không duyệt
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
