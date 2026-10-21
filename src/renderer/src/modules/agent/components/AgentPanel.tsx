import { useEffect, type JSX } from 'react'
import { AltArrowDownIcon, PenNewRoundIcon } from '@renderer/components/ui/reicon'
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
export function AgentPanel({ onOpenTarget, className }: AgentPanelProps): JSX.Element {
  useAgentConnection()
  const sessions = useAgentStore((s) => s.sessions)
  const activeSessionId = useAgentStore((s) => s.activeSessionId)
  const selectSession = useAgentStore((s) => s.selectSession)
  const newChat = useAgentStore((s) => s.newChat)

  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ''}`}>
      <div className="flex h-[34px] shrink-0 items-center gap-2 border-b border-default px-3">
        <span className="min-w-0 truncate text-body-xs font-semibold">
          {sessions.find((session) => session.id === activeSessionId)?.title || 'Hội thoại mới'}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {sessions.length > 0 && (
            <MenuRoot>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    aria-label="Mở lịch sử hội thoại"
                    rightIcon={<AltArrowDownIcon size={ICON.sm} aria-hidden="true" />}
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
        </span>
      </div>
      <AgentTranscript onOpenTarget={onOpenTarget} />
      <div className="shrink-0 p-2">
        <AgentComposer />
      </div>
    </div>
  )
}
