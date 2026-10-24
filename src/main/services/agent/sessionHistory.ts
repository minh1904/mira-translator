import type { ChatMessage } from '../../infra/providers/transports/openAiChatTransport'
import type { AgentToolCall } from '../../infra/storage/agentRepository'

/** The part of a stored call result that reaches the model. */
interface CallResult {
  ok?: boolean
  value?: unknown
  error?: unknown
}

/** One earlier turn of the session as the model sees it again. */
export interface PastTurn {
  turnId: string
  instruction: string
  /** One line saying what the context was when the turn ran. */
  contextLine: string
  /** Its tool call / result rounds, in order. */
  rounds: ChatMessage[]
  answer: string
}

const HANDLE = /^(ctx\d*|t\d+)$/
const UNKNOWN_TARGET = 'đích của lượt cũ'
const TEXT_RESULT_CHARS = 300

/** A handle only means something inside the turn that was issued it, so an old one becomes its target's label. */
export function relabelHandles(value: unknown, labels: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    return HANDLE.test(value) ? (labels.get(value) ?? UNKNOWN_TARGET) : value
  }
  if (Array.isArray(value)) return value.map((item) => relabelHandles(item, labels))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, relabelHandles(item, labels)])
    )
  }
  return value
}

/** How a message typed while the turn ran is told apart from tool results (add-agent-turn-steering D2). */
export const STEER_LABEL = '[Người dùng gửi thêm khi lượt đang chạy]'

/** Every message delivered after one round's results, in the order sent, as one user message. */
export function steerMessage(texts: readonly string[]): ChatMessage {
  return { role: 'user', content: `${STEER_LABEL}\n${texts.join('\n\n')}` }
}

/** The texts of a turn's `steer` parts by the round they were delivered after. */
export function steersByRound(
  parts: ReadonlyArray<{ kind: string; round: number; text: string }>
): Map<number, string[]> {
  const byRound = new Map<number, string[]>()
  for (const part of parts) {
    if (part.kind === 'steer')
      byRound.set(part.round, [...(byRound.get(part.round) ?? []), part.text])
  }
  return byRound
}

/**
 * The OpenAI-format messages of a turn's persisted rounds: call, then each result, then what the user
 * typed meanwhile (`steers`, by round). `labels` marks an earlier turn: its handles are replaced by
 * labels and the provider's private call data (a thought signature is valid only for the round that
 * produced it) is left out.
 */
export function roundMessages(
  rows: AgentToolCall[],
  labels?: ReadonlyMap<string, string>,
  steers?: ReadonlyMap<number, string[]>
): ChatMessage[] {
  const relabel = (value: unknown): unknown => (labels ? relabelHandles(value, labels) : value)
  const messages: ChatMessage[] = []
  const rounds = [...new Set(rows.map((row) => row.round))].sort((a, b) => a - b)
  for (const round of rounds) {
    const calls = rows.filter((row) => row.round === round)
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: calls.map((row) => ({
        id: row.callId,
        type: 'function' as const,
        function: { name: row.name, arguments: JSON.stringify(relabel(row.args ?? {})) },
        ...(!labels && row.extra !== undefined ? { extra_content: row.extra } : {})
      }))
    })
    for (const row of calls) {
      const result = (row.result ?? {}) as CallResult
      const content =
        row.state === 'completed' || row.state === 'failed'
          ? {
              ok: result.ok ?? false,
              ...(result.ok ? { value: relabel(result.value) } : { error: relabel(result.error) })
            }
          : { ok: false, error: { code: row.state, message: 'Công cụ không chạy.' } }
      messages.push({ role: 'tool', content: JSON.stringify(content), tool_call_id: row.callId })
    }
    const typed = steers?.get(round)
    if (typed?.length) messages.push(steerMessage(typed))
  }
  return messages
}

/**
 * Call / result messages as plain assistant text, for a model that takes no tools: some providers
 * refuse a tool message in a request that carries no tool definitions.
 */
export function textRounds(rounds: ChatMessage[], resultChars = TEXT_RESULT_CHARS): ChatMessage[] {
  const results = new Map(
    rounds.filter((m) => m.role === 'tool').map((m) => [m.tool_call_id, m.content])
  )
  return rounds
    .filter(
      (message) => (message.role === 'assistant' && message.tool_calls) || message.role === 'user'
    )
    .map((message): ChatMessage => {
      // A message the user typed meanwhile stays theirs.
      if (message.role === 'user') return message
      return {
        role: 'assistant',
        content: (message.tool_calls ?? [])
          .map((call) => {
            const args = parseObject(call.function.arguments)
            const target = typeof args.target === 'string' ? ` (${args.target})` : ''
            const result = (results.get(call.id) ?? '').slice(0, resultChars)
            return `Đã gọi \`${call.function.name}\`${target} → ${result}`
          })
          .join('\n')
      }
    })
}

function parseObject(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * An earlier turn, ready to resend. `labels` maps its handles to target labels; `steers` holds what the
 * user typed while it ran, by the round it was delivered after.
 */
export function pastTurnOf(
  turn: { id: string; instruction: string; answer: string },
  rows: AgentToolCall[],
  contextLine: string,
  labels: ReadonlyMap<string, string>,
  toolsEnabled: boolean,
  steers?: ReadonlyMap<number, string[]>
): PastTurn {
  const rounds = roundMessages(rows, labels, steers)
  return {
    turnId: turn.id,
    instruction: turn.instruction,
    contextLine,
    rounds: toolsEnabled ? rounds : textRounds(rounds),
    answer: turn.answer
  }
}
