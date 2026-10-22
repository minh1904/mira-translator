import type { AgentAttachment, AgentTurnView } from '../../../../../shared/contracts/agent'

export interface RecalledCommand {
  text: string
  attachments: AgentAttachment[]
}

/** Instructions of the session, oldest first, with the chips each was sent with. */
export function commandHistory(turns: AgentTurnView[]): RecalledCommand[] {
  return turns
    .filter((turn) => turn.instruction.trim() !== '')
    .map((turn) => ({ text: turn.instruction, attachments: turn.context.attachments ?? [] }))
}

/**
 * The next position when browsing with Up/Down: `null` is the draft being written. Up from the draft
 * goes to the newest command; Down past the newest returns to the draft.
 */
export function historyStep(
  length: number,
  index: number | null,
  direction: 'up' | 'down'
): number | null {
  if (length === 0) return null
  if (direction === 'up') return index === null ? length - 1 : Math.max(0, index - 1)
  if (index === null) return null
  return index + 1 >= length ? null : index + 1
}
