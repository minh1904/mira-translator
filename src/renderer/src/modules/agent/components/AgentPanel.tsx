import { useEffect, type JSX } from 'react'
import { AltArrowDownIcon, CloseIcon, PenNewRoundIcon } from '@renderer/components/ui/reicon'
import type { ResolvedTarget } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { useAgentStore } from '../store/agentStore'
import { AgentComposer } from './AgentComposer'
import { AgentTranscript } from './AgentTranscript'

export interface AgentPanelProps {
  onOpenTarget?: (target: ResolvedTarget) => void
  onClose?: () => void
  className?: string
}

/**
 * Answers the main process's write intents on every screen. Main waits for every window before a
 * task or chat writes a chapter; a window that does not answer turns the write into a conflict.
 */
export function useAgentWriteIntents(): void {
  const listenCoordinator = useAgentStore((s) => s.listenCoordinator)
  useEffect(() => listenCoordinator(), [listenCoordinator])
}

/** Subscribes to agent events while mounted and loads the session list once. */
export function useAgentConnection(): void {
  const loadSessions = useAgentStore((s) => s.loadSessions)
  const listenCoordinator = useAgentStore((s) => s.listenCoordinator)
  useEffect(() => {
    void loadSessions()
    return listenCoordinator()
  }, [loadSessions, listenCoordinator])
}

/** Trợ lý gọn cho side panel của màn chương: chọn phiên, transcript và ô soạn. */
export function AgentPanel({ onOpenTarget, onClose, className }: AgentPanelProps): JSX.Element {
  useAgentConnection()
  const sessions = useAgentStore((s) => s.sessions)
  const activeSessionId = useAgentStore((s) => s.activeSessionId)
  const selectSession = useAgentStore((s) => s.selectSession)
  const newChat = useAgentStore((s) => s.newChat)

  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ''}`}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-default px-2.5">
        <span className="min-w-0 truncate text-label-xs font-semibold text-emphasis">
          {sessions.find((session) => session.id === activeSessionId)?.title || 'Trợ lý'}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {sessions.length > 0 && (
            <MenuRoot>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    aria-label="Mở lịch sử hội thoại"
                    rightIcon={<AltArrowDownIcon size={ICON.xs} aria-hidden="true" />}
                  >
                    Lịch sử
                  </Button>
                }
              />
              <MenuPopup align="end">
                {sessions.map((session) => (
                  <MenuItem key={session.id} onClick={() => void selectSession(session.id)}>
                    <span className="max-w-52 truncate">{session.title || 'Hội thoại'}</span>
                    {session.id === activeSessionId && <span aria-hidden="true">✓</span>}
                  </MenuItem>
                ))}
              </MenuPopup>
            </MenuRoot>
          )}
          <CompactButton
            aria-label="Hội thoại mới"
            title="Hội thoại mới"
            disabled={activeSessionId === null}
            onClick={newChat}
            icon={<PenNewRoundIcon size={ICON.sm} />}
          />
          {onClose && (
            <CompactButton
              aria-label="Đóng (Esc)"
              title="Đóng (Esc)"
              onClick={onClose}
              icon={<CloseIcon size={ICON.sm} />}
            />
          )}
        </span>
      </div>
      <AgentTranscript onOpenTarget={onOpenTarget} />
      <div className="shrink-0 p-2">
        <AgentComposer onOpenTarget={onOpenTarget} />
      </div>
    </div>
  )
}
