import { useEffect, useRef, useState, type JSX } from 'react'
import type { ResolvedTarget } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SafeMarkdown } from '../../../components/ui/SafeMarkdown'
import { useAgentStore } from '../store/agentStore'
import { useAgentModel } from './AgentComposer'
import { AutoScrollSentinel, getScrollBehavior, shouldAutoScroll } from './AutoScrollSentinel'
import { DeltaBuffer } from './DeltaBuffer'
import { PendingActionCard } from './PendingActionCard'
import { ThinkingPreview } from './ThinkingPreview'

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export interface AgentTranscriptProps {
  onOpenTarget?: (target: ResolvedTarget) => void
  className?: string
}

/**
 * Lịch sử của phiên đang mở: prompt người dùng, suy nghĩ thu gọn, câu trả lời và câu hỏi phê duyệt.
 * Tinh gọn tối đa theo phong cách VS Code Copilot Agent.
 */
export function AgentTranscript({ onOpenTarget, className }: AgentTranscriptProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showNewPill, setShowNewPill] = useState(false)
  const turns = useAgentStore((s) => s.turns)
  const activities = useAgentStore((s) => s.activities)
  const operations = useAgentStore((s) => s.operations)
  const undo = useAgentStore((s) => s.undo)
  const pending = useAgentStore((s) => s.pending)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const streamingTurnId = useAgentStore((s) => s.streamingTurnId)
  const streamingAnswer = useAgentStore((s) => s.streamingAnswer)
  const streamingReasoning = useAgentStore((s) => s.streamingReasoning)
  const lastError = useAgentStore((s) => s.lastError)
  const reply = useAgentStore((s) => s.reply)
  // The continuation runs on the model the composer shows, not on the main process default.
  const model = useAgentModel().selection ?? undefined

  const nearBottom = (): boolean => {
    const el = scrollRef.current
    return !el || shouldAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight, 80)
  }
  const scrollToBottom = (behavior: ScrollBehavior): void => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
    setShowNewPill(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy lại khi có nội dung mới.
  useEffect(() => {
    if (nearBottom()) scrollToBottom('auto')
    else setShowNewPill(true)
  }, [streamingAnswer, turns.length, pending.length])

  const status = lastError
    ? `Lỗi: ${lastError}`
    : pending.length > 0
      ? 'Trợ lý đang chờ bạn chọn hoặc duyệt.'
      : isStreaming
        ? 'Trợ lý đang trả lời…'
        : ''

  return (
    <div
      ref={scrollRef}
      onScroll={() => nearBottom() && setShowNewPill(false)}
      className={`min-h-0 flex-1 overflow-y-auto ${className ?? ''}`}
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2.5 px-2.5 py-2">
        {turns.length === 0 && !isStreaming && (
          <EmptyState title="Trợ lý sẵn sàng">
            Hỏi về truyện, nhờ dịch hoặc sửa một chương.
          </EmptyState>
        )}

        {turns.map((turn) => {
          const live = turn.id === streamingTurnId
          const turnPending = pending.filter((item) => item.turnId === turn.id)
          const answer = live && streamingAnswer ? streamingAnswer : turn.answer
          return (
            <article
              key={turn.id}
              aria-label={`Lượt: ${turn.instruction}`}
              className="flex flex-col gap-1.5"
            >
              <div className="rounded-sm bg-muted/40 px-2.5 py-1.5">
                <p className="selectable m-0 whitespace-pre-wrap wrap-anywhere text-body-sm leading-normal text-default">
                  {turn.instruction}
                </p>
              </div>
              {(live ? streamingReasoning : turn.reasoning) && (
                <ThinkingPreview
                  reasoning={live ? streamingReasoning : turn.reasoning}
                  isThinking={live}
                  isAnswerStarted={answer.length > 0}
                />
              )}
              {(activities[turn.id] ?? [])
                .filter((act) => act.label.startsWith('Subagent:'))
                .map((act) => (
                  <div
                    key={act.id}
                    className="inline-flex h-[20px] select-none items-center gap-1.5 rounded bg-muted/60 px-2 text-body-xs text-subtle"
                  >
                    <span className="font-medium text-default">🤖 {act.label}</span>
                    <span className="text-label-xs text-muted">
                      (
                      {act.state === 'running'
                        ? 'Đang chạy…'
                        : act.state === 'completed'
                          ? 'Hoàn tất'
                          : 'Lỗi'}
                      )
                    </span>
                  </div>
                ))}
              {answer && (
                <div className="text-body-sm leading-normal">
                  <SafeMarkdown text={live ? DeltaBuffer.safeTailFence(answer) : answer} />
                </div>
              )}
              {Object.values(operations)
                .filter((op) => op.turnId === turn.id)
                .map((op) => {
                  const isCompleted = op.state === 'completed' || op.state === 'partially_completed'
                  const isUndone = op.state === 'undone'
                  const isRunning = op.state === 'running' || op.state === 'queued'
                  const target = op.target
                  const targetLabel =
                    target?.kind === 'chapter'
                      ? target.chapterLabel
                      : target?.kind === 'work'
                        ? target.workLabel
                        : 'nội dung'
                  return (
                    <div
                      key={op.id}
                      className="inline-flex h-[20px] select-none items-center gap-1.5 rounded bg-muted/60 px-2 text-body-xs text-subtle"
                    >
                      <span className="font-medium text-default">
                        {isUndone
                          ? 'Đã hoàn tác:'
                          : isCompleted
                            ? 'Đã sửa:'
                            : isRunning
                              ? 'Đang sửa:'
                              : 'Thao tác:'}
                      </span>
                      <span className="max-w-44 truncate">{targetLabel}</span>
                      {op.progress && op.progress.completed > 0 && (
                        <span className="text-body-xs text-muted">
                          (+{op.progress.completed} {op.progress.unit})
                        </span>
                      )}
                      {target && onOpenTarget && (
                        <Button
                          variant="ghost"
                          onClick={() => onOpenTarget(target)}
                          className="!h-4 !px-1 text-label-xs text-link hover:underline"
                        >
                          Xem
                        </Button>
                      )}
                      {isCompleted && (
                        <Button
                          variant="ghost"
                          onClick={() => void undo(op.id)}
                          className="!h-4 !px-1 text-label-xs text-subtle hover:text-default hover:underline"
                        >
                          Hoàn tác
                        </Button>
                      )}
                    </div>
                  )
                })}
              {turnPending.map((action) => (
                <PendingActionCard
                  key={action.toolCallId}
                  action={action}
                  onReply={(item, choice, label) => reply(item, choice, label, model)}
                />
              ))}
            </article>
          )
        })}

        <p role="status" aria-live="polite" className="m-0 text-body-xs text-subtle empty:hidden">
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
