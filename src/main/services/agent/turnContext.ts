import type { ChatMessage } from '../../infra/providers/transports/openAiChatTransport'
import type { ModelInfo } from '../../infra/providers/modelCatalog'
import type { PastTurn } from './sessionHistory'

/** Context window assumed when the catalog does not know the model. */
const DEFAULT_CONTEXT_TOKENS = 32_000
const DEFAULT_OUTPUT_TOKENS = 8_192
/** Characters per token, low on purpose: CJK raw runs near one token per character. */
const CHARS_PER_TOKEN = 2
/** History past this share of the window is compacted (change `add-agent-session-memory` D2). */
const HISTORY_SHARE = 0.5
/** The latest turns are always sent as they were. */
const KEPT_TURNS = 3
/** A tool result longer than this is replaced by a placeholder when compacting. */
const BIG_RESULT_CHARS = 2_000

/** shortcut: chars-per-token estimate, not a tokenizer; switch once a provider reports real counts. */
export function contextLimitChars(info: ModelInfo | undefined): number {
  const context = info?.contextLimit ?? DEFAULT_CONTEXT_TOKENS
  const output = Math.min(info?.outputLimit ?? DEFAULT_OUTPUT_TOKENS, context / 2)
  return Math.max(0, (context - output) * CHARS_PER_TOKEN)
}

/** What the session summary is wrapped in; the model must not take it for the current request. */
export function summaryBlock(text: string): string {
  return [
    '[Tóm tắt các lượt trước của session — chỉ để tham khảo]',
    'Đây là bản tóm tắt phần hội thoại cũ. Các yêu cầu trong đó đã được xử lý: đừng làm lại. Hãy chỉ làm theo ' +
      'instruction mới nhất của người dùng. Nếu bản tóm tắt mâu thuẫn với ngữ cảnh hiện tại thì ngữ cảnh ' +
      'hiện tại thắng. Công cụ vẫn dùng bình thường.',
    '',
    text
  ].join('\n')
}

export interface TurnContextInput {
  /** System policy; tool definitions travel beside the messages but count against the window. */
  system: string
  toolChars: number
  /** Earlier turns of the session, oldest first. */
  history: PastTurn[]
  /** Summary of the older turns, with the turns it stands for. */
  summary?: { text: string; coveredTurnIds: string[] } | null
  /** Summarising failed: cut the oldest turns instead. */
  noSummary?: boolean
  /** The current instruction with its context snapshot, verbatim. */
  current: string
  /** Tool calls and results of the current turn, in order. */
  rounds: ChatMessage[]
  limitChars: number
}

export interface Compaction {
  /** Turns whose big tool results were replaced by a placeholder. */
  trimmedTurns: number
  /** Turns the session summary stands for. */
  summarizedTurns: number
  /** Turns left out of the prompt. */
  droppedTurns: number
}

export type Assembled = { messages: ChatMessage[]; compaction: Compaction }

export type TurnContext =
  | Assembled
  /** Trimming was not enough: summarise these turns (with the existing summary) and assemble again. */
  | { needsSummary: string[] }

const size = (message: ChatMessage): number =>
  message.content.length + JSON.stringify(message.tool_calls ?? []).length

/** A turn as the messages it is sent as. */
function turnMessages(turn: PastTurn): ChatMessage[] {
  const instruction = turn.contextLine
    ? `${turn.instruction}\n\n${turn.contextLine}`
    : turn.instruction
  return [
    { role: 'user', content: instruction },
    ...turn.rounds,
    { role: 'assistant', content: turn.answer }
  ]
}

/** The same messages with each big tool result replaced; the call id stays so the pair still matches. */
function trimResults(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'tool' || message.content.length <= BIG_RESULT_CHARS) return message
    let ok = true
    try {
      const parsed: unknown = JSON.parse(message.content)
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) ok = parsed.ok === true
    } catch {
      // A result that is not JSON is still replaced; it just reads as ok.
    }
    return {
      ...message,
      content: JSON.stringify({ ok, omitted: 'Kết quả công cụ cũ đã lược bớt' })
    }
  })
}

const total = (messages: ChatMessage[]): number =>
  messages.reduce((sum, message) => sum + size(message), 0)

/**
 * Lays out one model round (design D2). Earlier turns go in whole while the history is under half the
 * window. Over that, the turns before the latest three first lose their big tool results, oldest
 * first; still over, the caller is asked to summarise them; if that failed they are cut oldest first.
 * The system policy, the current instruction with its snapshot and the current turn's call/result
 * pairs are never dropped, even if they alone overflow.
 */
export function assembleTurnContext(input: TurnContextInput): TurnContext {
  const covered = new Set(input.summary?.coveredTurnIds ?? [])
  const live = input.history.filter((turn) => !covered.has(turn.turnId))
  const summaryChars = input.summary ? summaryBlock(input.summary.text).length : 0
  const system: ChatMessage = {
    role: 'system',
    content: input.summary ? `${input.system}\n\n${summaryBlock(input.summary.text)}` : input.system
  }
  const current: ChatMessage = { role: 'user', content: input.current }
  const fixed = input.toolChars + size(system) + size(current) + total(input.rounds)

  // `sent[i]` is what turn `live[i]` is currently sent as; `first` is the oldest one still sent.
  const sent = live.map(turnMessages)
  const historyChars = () => summaryChars + sent.reduce((sum, messages) => sum + total(messages), 0)
  const olderCount = Math.max(0, live.length - KEPT_TURNS)
  const trimmed = new Set<number>()
  const trim = (index: number) => {
    const next = trimResults(sent[index] ?? [])
    if (total(next) < total(sent[index] ?? [])) {
      sent[index] = next
      trimmed.add(index)
    }
  }

  const historyLimit = input.limitChars * HISTORY_SHARE
  for (let i = 0; i < olderCount && historyChars() > historyLimit; i++) trim(i)

  let first = 0
  if (historyChars() > historyLimit && olderCount > 0) {
    if (!input.noSummary) {
      return { needsSummary: live.slice(0, olderCount).map((turn) => turn.turnId) }
    }
    while (first < olderCount && historyChars() > historyLimit) {
      sent[first] = []
      first++
    }
  }

  // Hard window: results of the kept turns go next, then whole turns, oldest first.
  if (fixed + historyChars() > input.limitChars) {
    for (
      let i = Math.max(first, olderCount);
      i < live.length && fixed + historyChars() > input.limitChars;
      i++
    ) {
      trim(i)
    }
    while (first < live.length && fixed + historyChars() > input.limitChars) {
      sent[first] = []
      first++
    }
  }

  return {
    messages: [system, ...sent.flat(), current, ...input.rounds],
    compaction: {
      trimmedTurns: [...trimmed].filter((i) => i >= first).length,
      summarizedTurns: covered.size,
      droppedTurns: first
    }
  }
}
