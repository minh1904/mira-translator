import { useState, type JSX, type KeyboardEvent } from 'react'
import type { AgentTurnView, ResolvedTarget } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { focusRing } from '../../../components/ui/focus'
import { ICON } from '../../../components/ui/icon'
import { HistoryIcon } from '../../../components/ui/reicon'
import { cn } from '../../../lib/cn'
import { useAgentStore } from '../store/agentStore'
import { AgentComposer, editDraftKey } from './AgentComposer'
import { revertImpact, revertMessage } from './checkpoints'

/** The main context a command was sent with, without the chips added beside it. */
function mainContext(turn: AgentTurnView) {
  const { attachments: _attachments, ...context } = turn.context
  return context
}

/**
 * Lệnh của một lượt (C9, C24): bong bóng căn phải; phía trên là "Khôi phục checkpoint" (lệnh đầu:
 * "Bắt đầu lại"), hiện khi hover hoặc focus. Bấm bong bóng, hoặc Enter/Space khi nó có focus, để sửa
 * lệnh tại chỗ; gửi bản đã sửa là khôi phục checkpoint rồi gửi lệnh mới. Cả hai bị khóa khi có lượt
 * đang chạy.
 */
export function TurnRequest({
  turn,
  first,
  onOpenTarget
}: {
  turn: AgentTurnView
  first: boolean
  onOpenTarget?: (target: ResolvedTarget) => void
}): JSX.Element {
  const busy = useAgentStore((s) => s.isStreaming)
  const revertToTurn = useAgentStore((s) => s.revertToTurn)
  const setDraft = useAgentStore((s) => s.setDraft)
  const setAttachments = useAgentStore((s) => s.setAttachments)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const label = first ? 'Bắt đầu lại' : 'Khôi phục checkpoint'

  const startEdit = (): void => {
    if (busy) return
    const key = editDraftKey(turn.id)
    setDraft(turn.instruction, key)
    setAttachments(turn.context.attachments ?? [], key)
    setEditing(true)
  }
  const askRevert = (): void => {
    const { turns, operations, toolCalls } = useAgentStore.getState()
    setConfirming(revertMessage(revertImpact(turn.id, turns, operations, toolCalls)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      startEdit()
    }
  }

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[90%]">
        <AgentComposer
          onOpenTarget={onOpenTarget}
          edit={{ turnId: turn.id, context: mainContext(turn), onDone: () => setEditing(false) }}
        />
      </div>
    )
  }

  return (
    <div className="group flex flex-col items-end gap-0.5">
      <div className="flex w-full items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <span className="h-px flex-1 border-t border-dashed border-subtle" />
        <Button
          variant="ghost"
          disabled={busy}
          leftIcon={<HistoryIcon size={ICON.xs} aria-hidden="true" />}
          onClick={askRevert}
          className="!h-5 !px-1.5 text-label-xs text-subtle"
        >
          {label}
        </Button>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: bong bóng chứa chữ nhiều dòng, bấm để sửa tại chỗ. */}
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        aria-label={`Sửa lệnh: ${turn.instruction}`}
        title={busy ? undefined : 'Bấm để sửa lệnh'}
        onClick={startEdit}
        onKeyDown={onKeyDown}
        className={cn(
          'max-w-[90%] rounded-md bg-muted px-2.5 py-1.5',
          !busy && 'cursor-pointer hover:bg-hover',
          focusRing
        )}
      >
        <p className="selectable m-0 whitespace-pre-wrap wrap-anywhere text-body-sm leading-normal text-default">
          {turn.instruction}
        </p>
      </div>
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        size="sm"
        title={first ? 'Bắt đầu lại cuộc trò chuyện?' : 'Khôi phục checkpoint?'}
        description={confirming ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Hủy
            </Button>
            <Button
              variant="solid"
              color="danger"
              onClick={() => {
                setConfirming(null)
                void revertToTurn(turn.id)
              }}
            >
              {label}
            </Button>
          </>
        }
      />
    </div>
  )
}
