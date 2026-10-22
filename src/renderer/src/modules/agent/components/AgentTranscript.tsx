import { useEffect, useRef, useState, type JSX } from 'react'
import type {
  AgentAnsweredQuestion,
  AgentOperation,
  AgentPendingAction,
  AgentTurnView,
  ResolvedTarget
} from '../../../../../shared/contracts/agent'
import { isEmptyTurn } from '../../../../../shared/contracts/agentEmptyTurn'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useAgentStore } from '../store/agentStore'
import { useAgentModel } from './AgentComposer'
import { AutoScrollSentinel, getScrollBehavior, shouldAutoScroll } from './AutoScrollSentinel'
import { MarkdownPart } from './MarkdownPart'
import { OperationCard } from './OperationCard'
import { PendingActionCard } from './PendingActionCard'
import { ThinkingPart } from './ThinkingPart'
import { ToolCallRow } from './ToolCallRow'
import { TurnRequest } from './TurnRequest'
import { TurnFooter } from './TurnFooter'
import { childCalls, turnItems, type TurnItem } from './turnItems'
import { WorkingRow } from './WorkingRow'

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Within this many pixels of the bottom the transcript follows new content (VS Code: 2px). */
const AT_BOTTOM_PX = 2

/** Whether the last item still draws something, so the working row would only repeat it. */
function lastItemIsActive(items: TurnItem[]): boolean {
  const last = items.at(-1)
  if (!last) return false
  if (last.kind === 'text' || last.kind === 'reasoning') return last.live
  if (last.kind === 'tool') return last.call.state === 'running'
  return false
}

/** What the user answered, at the place of the question in the answer (C18). */
export function QuestionSummary({
  answers
}: {
  answers: AgentAnsweredQuestion[] | 'skipped'
}): JSX.Element {
  if (answers === 'skipped') {
    return <p className="m-0 px-1 text-body-xs text-muted">Đã bỏ qua câu hỏi</p>
  }
  return (
    <dl className="m-0 flex flex-col gap-0.5 px-1 text-body-xs">
      {answers.map((item) => (
        <div key={item.id} className="flex flex-col">
          <dt className="text-muted">H: {item.title}</dt>
          <dd className="m-0 text-default">Đ: {item.answer}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface AgentTranscriptProps {
  onOpenTarget?: (target: ResolvedTarget) => void
  className?: string
}

/**
 * Lịch sử của phiên theo bố cục chat của VS Code: lệnh là bong bóng căn phải; câu trả lời là chuỗi
 * suy nghĩ, chữ và dòng tool theo đúng thứ tự xảy ra; thẻ duyệt và thao tác ghi nằm ngay sau dòng
 * tool của chúng; dòng đang làm ở cuối; chân lượt có Sao chép, Thử lại và usage.
 */
export function AgentTranscript({ onOpenTarget, className }: AgentTranscriptProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [showNewPill, setShowNewPill] = useState(false)
  const turns = useAgentStore((s) => s.turns)
  const parts = useAgentStore((s) => s.parts)
  const toolCalls = useAgentStore((s) => s.toolCalls)
  const details = useAgentStore((s) => s.toolCallDetails)
  const operations = useAgentStore((s) => s.operations)
  const pending = useAgentStore((s) => s.pending)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const streamingTurnId = useAgentStore((s) => s.streamingTurnId)
  const live = useAgentStore((s) => s.live)
  const lastError = useAgentStore((s) => s.lastError)
  const reply = useAgentStore((s) => s.reply)
  const retry = useAgentStore((s) => s.retry)
  const continueAfter = useAgentStore((s) => s.continueAfter)
  const cancel = useAgentStore((s) => s.cancel)
  const undo = useAgentStore((s) => s.undo)
  const loadDetail = useAgentStore((s) => s.loadToolCallDetail)
  // The continuation runs on the model the composer shows, not on the main process default.
  const model = useAgentModel().selection ?? undefined

  const scrollToBottom = (behavior: ScrollBehavior): void => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
    atBottom.current = true
    setShowNewPill(false)
  }

  // Any growth (text, a tool row, a card) follows the end only while the reader is at the end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the observer lives as long as the view.
  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (atBottom.current) scrollToBottom('auto')
      else setShowNewPill(true)
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    atBottom.current = shouldAutoScroll(
      el.scrollHeight - el.scrollTop - el.clientHeight,
      AT_BOTTOM_PX
    )
    if (atBottom.current) setShowNewPill(false)
  }

  const status = lastError
    ? `Lỗi: ${lastError}`
    : pending.length > 0
      ? 'Trợ lý đang chờ bạn chọn hoặc duyệt.'
      : isStreaming
        ? 'Trợ lý đang trả lời…'
        : ''

  const operationOf = (callId: string): AgentOperation[] =>
    Object.values(operations).filter((op) => op.commandId === `tool-${callId}`)
  // Questions are answered on the card above the composer, not in the transcript.
  const cards = pending.filter((item) => item.kind !== 'question')
  const pendingOf = (callId: string): AgentPendingAction[] =>
    cards.filter((item) => item.toolCallId === callId)
  const onReply = (item: AgentPendingAction, choice: string, label: string) =>
    reply(item, choice, label, model)

  const renderItem = (turn: AgentTurnView, item: TurnItem, index: number, items: TurnItem[]) => {
    if (item.kind === 'reasoning') {
      return (
        <ThinkingPart
          key={item.key}
          text={item.text}
          live={item.live}
          superseded={index < items.length - 1}
          durationMs={item.durationMs}
        />
      )
    }
    if (item.kind === 'text')
      return <MarkdownPart key={item.key} text={item.text} live={item.live} />
    if (item.kind === 'progress') {
      return (
        <p key={item.key} className="m-0 px-1 text-body-xs text-muted">
          {item.text}
        </p>
      )
    }
    const { call } = item
    return (
      <div key={item.key} className="flex flex-col gap-1">
        <ToolCallRow
          call={call}
          detail={details[call.id]}
          onOpen={(id) => void loadDetail(id)}
          subagentCalls={childCalls(toolCalls, call.id)}
          details={details}
        />
        {call.questionAnswers && <QuestionSummary answers={call.questionAnswers} />}
        {operationOf(call.id).map((operation) => (
          <OperationCard
            key={operation.id}
            operation={operation}
            onOpenTarget={onOpenTarget}
            onCancel={() => void cancel(turn.id)}
            onUndo={(id) => void undo(id)}
          />
        ))}
        {pendingOf(call.id).map((action) => (
          <PendingActionCard key={action.toolCallId} action={action} onReply={onReply} />
        ))}
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`min-h-0 flex-1 overflow-y-auto ${className ?? ''}`}
    >
      <div
        ref={contentRef}
        className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-2.5 py-2"
      >
        {turns.length === 0 && !isStreaming && (
          <EmptyState title="Trợ lý sẵn sàng">
            Hỏi về truyện, nhờ dịch hoặc sửa một chương.
          </EmptyState>
        )}

        {turns.map((turn, turnIndex) => {
          const streaming = isStreaming && turn.id === streamingTurnId
          const items = turnItems({
            turn,
            parts,
            toolCalls,
            live: turn.id === streamingTurnId ? live : undefined
          })
          const placed = new Set(
            items.flatMap((item) => (item.kind === 'tool' ? [item.call.id] : []))
          )
          // A pending action whose call is not drawn yet still needs an answer.
          const loose = cards.filter(
            (item) => item.turnId === turn.id && !placed.has(item.toolCallId)
          )
          const waiting = turn.status === 'waiting_user'
          const ended =
            !streaming && !waiting && turn.status !== 'queued' && turn.status !== 'running'
          const isLast = turnIndex === turns.length - 1
          const hasText = items.some((item) => item.kind === 'text')
          // Only the newest turn can be carried on, and only when it gave the user nothing.
          const canContinue =
            isLast &&
            turn.status === 'completed' &&
            isEmptyTurn({
              parts: parts.filter((part) => part.turnId === turn.id),
              toolCalls: Object.values(toolCalls).filter((call) => call.turnId === turn.id)
            })
          return (
            <article
              key={turn.id}
              aria-label={`Lượt: ${turn.instruction}`}
              className="flex flex-col gap-1.5"
            >
              <TurnRequest turn={turn} first={turnIndex === 0} onOpenTarget={onOpenTarget} />
              {items.map((item, index) => renderItem(turn, item, index, items))}
              {loose.map((action) => (
                <PendingActionCard key={action.toolCallId} action={action} onReply={onReply} />
              ))}
              {streaming && !lastItemIsActive(items) && <WorkingRow waiting={null} />}
              {waiting && (
                <WorkingRow waiting={pending.filter((item) => item.turnId === turn.id)} />
              )}
              {ended && (
                <TurnFooter
                  turn={turn}
                  // A failed turn stores the error as its answer when it had nothing else to say.
                  error={
                    turn.status !== 'failed'
                      ? null
                      : !hasText && turn.answer
                        ? turn.answer
                        : isLast
                          ? lastError
                          : null
                  }
                  isLast={isLast}
                  onRetry={() => void retry(turn, model)}
                  onContinue={canContinue ? () => void continueAfter(turn, model) : undefined}
                />
              )}
            </article>
          )
        })}

        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>

        <AutoScrollSentinel
          showNewContentPill={showNewPill}
          onScrollToBottom={() => scrollToBottom(getScrollBehavior(reducedMotion))}
        />
      </div>
    </div>
  )
}
