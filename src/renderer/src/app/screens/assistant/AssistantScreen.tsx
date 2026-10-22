import type { JSX } from 'react'
import type { ResolvedTarget } from '../../../../../shared/contracts/agent'
import { TopBarTitle } from '../../../components/ui/TopBarActions'
import {
  AgentComposer,
  AgentSessionList,
  AgentTranscript,
  useAgentConnection,
  useAgentStore
} from '../../../modules/agent/public'

/**
 * Màn Trợ lý toàn ứng dụng: lịch sử phiên bên trái, transcript và ô soạn bên phải. Dùng chung store với
 * panel trong màn chương, nên một phiên và draft của nó đi theo người dùng giữa hai bề mặt.
 */
export function AssistantScreen({
  onOpenTarget
}: {
  onOpenTarget: (target: ResolvedTarget) => void
}): JSX.Element {
  useAgentConnection()
  const title = useAgentStore(
    (s) => s.sessions.find((session) => session.id === s.activeSessionId)?.title ?? 'Chat mới'
  )
  return (
    <div className="flex h-full min-h-0">
      <TopBarTitle note={title}>Trợ lý</TopBarTitle>
      <div className="flex w-[260px] shrink-0 flex-col border-r border-default bg-surface p-xs">
        <AgentSessionList />
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-default">
        <AgentTranscript onOpenTarget={onOpenTarget} />
        <div className="mx-auto w-full max-w-[720px] shrink-0 px-md pb-lg">
          <AgentComposer onOpenTarget={onOpenTarget} />
        </div>
      </div>
    </div>
  )
}
