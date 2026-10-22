import type {
  AgentResponsePart,
  AgentToolCallView,
  AgentTurnView
} from '../../../../../shared/contracts/agent'
import type { LiveRound } from '../store/agentStore'

/** One element of a turn's answer as the transcript draws it, in the order it happened. */
export type TurnItem =
  | { kind: 'reasoning'; key: string; text: string; live: boolean; durationMs: number | null }
  | { kind: 'text'; key: string; text: string; live: boolean }
  | { kind: 'tool'; key: string; call: AgentToolCallView }
  | { kind: 'progress'; key: string; text: string }

/**
 * The answer of a turn: the parts Main stored, then the rounds still streaming (their reasoning, text
 * and tool calls). Keys stay the same when a streamed round is later read back as parts, so the text
 * keeps its place instead of being drawn again.
 */
export function turnItems(input: {
  turn: AgentTurnView
  parts: readonly AgentResponsePart[]
  toolCalls: Readonly<Record<string, AgentToolCallView>>
  /** Rounds not yet stored; only for the streaming turn. */
  live?: Readonly<Record<number, LiveRound>>
}): TurnItem[] {
  const { turn, toolCalls } = input
  const items: TurnItem[] = []
  const placed = new Set<string>()
  const storedRounds = new Set<number>()
  const own = input.parts.filter((part) => part.turnId === turn.id).sort((a, b) => a.seq - b.seq)
  for (const part of own) {
    storedRounds.add(part.round)
    if (part.kind === 'tool_call') {
      const call = part.toolCallId ? toolCalls[part.toolCallId] : undefined
      if (!call) continue
      placed.add(call.id)
      items.push({ kind: 'tool', key: `tool:${call.id}`, call })
    } else if (part.kind === 'reasoning') {
      items.push({
        kind: 'reasoning',
        key: `${turn.id}:${part.round}:reasoning`,
        text: part.text,
        live: false,
        durationMs: part.durationMs
      })
    } else if (part.kind === 'text') {
      items.push({
        kind: 'text',
        key: `${turn.id}:${part.round}:text`,
        text: part.text,
        live: false
      })
    } else {
      items.push({ kind: 'progress', key: `progress:${part.id}`, text: part.text })
    }
  }

  // Calls of rounds Main has not handed back as parts yet, with what those rounds streamed.
  const pendingCalls = Object.values(toolCalls)
    .filter(
      (call) => call.turnId === turn.id && call.parentToolCallId === null && !placed.has(call.id)
    )
    .sort((a, b) => a.round - b.round || a.createdAt - b.createdAt)
  const live = input.live ?? {}
  const rounds = new Set<number>([
    ...Object.keys(live).map(Number),
    ...pendingCalls.map((call) => call.round)
  ])
  for (const round of [...rounds].sort((a, b) => a - b)) {
    if (storedRounds.has(round)) continue
    const streamed = live[round]
    if (streamed?.reasoning) {
      items.push({
        kind: 'reasoning',
        key: `${turn.id}:${round}:reasoning`,
        text: streamed.reasoning,
        live: streamed.reasoningEndedAt === null,
        durationMs:
          streamed.reasoningStartedAt !== null && streamed.reasoningEndedAt !== null
            ? streamed.reasoningEndedAt - streamed.reasoningStartedAt
            : null
      })
    }
    if (streamed?.text) {
      items.push({ kind: 'text', key: `${turn.id}:${round}:text`, text: streamed.text, live: true })
    }
    for (const call of pendingCalls.filter((item) => item.round === round)) {
      items.push({ kind: 'tool', key: `tool:${call.id}`, call })
    }
  }
  return items
}

/** The calls a subagent made under `parentId`, in order. */
export function childCalls(
  toolCalls: Readonly<Record<string, AgentToolCallView>>,
  parentId: string
): AgentToolCallView[] {
  return Object.values(toolCalls)
    .filter((call) => call.parentToolCallId === parentId)
    .sort((a, b) => a.round - b.round || a.createdAt - b.createdAt)
}
