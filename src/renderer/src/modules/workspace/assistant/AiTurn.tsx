import { useEffect, useRef, useState, type JSX } from 'react'
import {
  CopyIcon,
  DangerCircleIcon,
  RefreshIcon,
  StopCircleIcon
} from '@renderer/components/ui/reicon'

import type { ProposalQueueItem } from '../../../../../shared/contracts/aiProposals'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { Disclosure } from '../../../components/ui/Disclosure'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'
import { useAiOverlayStore } from '../../ai-connections/public'
import { keyProblem } from '../../ai-connections/public'
import type { TurnView } from './chatTurns'
import { SafeMarkdown } from '../../../components/ui/SafeMarkdown'
import { TermProposalCard, TextProposalCard, type ProposalActions } from './ProposalCard'
import { summarizeTools, toolCalls } from './toolSummary'
import { thoughtSeconds, turnTime } from './turnTime'

/**
 * Hiển thị một lượt hỏi đáp gồm câu hỏi, quá trình suy nghĩ, các lệnh gọi công cụ,
 * câu trả lời và thanh thông tin thời gian kèm thao tác.
 */

/**
 * Quá trình suy nghĩ của model: hiển thị xem trước trực tiếp khi đang phản hồi,
 * giữ mở nếu người dùng đã xem và mặc định thu gọn khi khôi phục từ lịch sử.
 */
function Thought({ turn, running }: { turn: TurnView; running: boolean }): JSX.Element | null {
  const pending = running && turn.answer === ''
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const [sawLive, setSawLive] = useState(false)
  if (pending && !sawLive) setSawLive(true)
  const open = userOpen ?? sawLive
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scroller.current
    if (pending && userOpen === null && element) element.scrollTop = element.scrollHeight
  }, [turn.reasoning, pending, userOpen])

  if (turn.reasoning === '') return null
  const seconds = thoughtSeconds(turn.createdAt, turn.finishedAt)
  const label = pending
    ? 'Đang suy nghĩ'
    : seconds === null || seconds < 1
      ? 'Đã suy nghĩ'
      : 'Đã suy nghĩ ' + seconds + ' giây'
  return (
    <Disclosure label={label} open={open} pending={pending} onOpenChange={setUserOpen}>
      <div
        ref={scroller}
        className={cn(
          'selectable overflow-auto whitespace-pre-wrap wrap-anywhere text-body-xs leading-relaxed text-muted',
          pending && userOpen === null && 'max-h-40'
        )}
      >
        {turn.reasoning}
      </div>
    </Disclosure>
  )
}

/** Danh sách các lệnh gọi công cụ trong lượt hỏi, hiển thị dạng dòng tóm tắt có thể mở rộng. */
function ToolRow({ turn, running }: { turn: TurnView; running: boolean }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const calls = toolCalls(turn.tools)
  if (calls.length === 0) return null
  const last = calls[calls.length - 1]
  const pending = running && turn.answer === ''
  return (
    <Disclosure
      label={pending ? last.detail : summarizeTools(turn.tools)}
      open={open}
      pending={pending}
      onOpenChange={setOpen}
    >
      <ul className="m-0 list-none space-y-0.5 p-0 text-body-xs text-muted">
        {calls.map((step, index) => (
          <li key={step.name + String(index)} className="flex items-start gap-1.5">
            {step.status === 'error' && (
              <DangerCircleIcon size={12} className="mt-px shrink-0 text-error" aria-label="Lỗi" />
            )}
            <span className="wrap-anywhere">{step.detail}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}

function usageLine(turn: TurnView): string {
  if (turn.usage === null) return 'Nhà cung cấp không báo lượng dùng'
  return (
    turn.usage.inputTokens +
    ' + ' +
    turn.usage.outputTokens +
    ' token · ' +
    // Không có giá nghĩa là thông tin mô hình chưa có bảng giá, không đồng nghĩa với miễn phí.
    (turn.usd === null ? 'chưa biết giá' : '$' + turn.usd.toFixed(4))
  )
}

export function AiTurn({
  turn,
  workId,
  currentChapterId,
  chapterLabel,
  targetChapterExists = true,
  queueItem,
  actions,
  onRetry,
  retryWith,
  onFixKey,
  onNavigateChapter
}: {
  turn: TurnView
  workId: string
  currentChapterId?: string
  /** Nhãn chương của lượt hỏi được gửi từ chương khác, ví dụ "Chương 3". */
  chapterLabel?: string
  targetChapterExists?: boolean
  /** Lấy thông tin đề xuất từ hàng chờ của chương. */
  queueItem(proposalId: string): ProposalQueueItem | undefined
  actions: ProposalActions
  onRetry(question: string): void
  /** Tùy chọn gửi lại câu hỏi bằng model dự phòng khi lượt hỏi bị lỗi. */
  retryWith?: { label: string; onClick(): void }
  /** Mở cấu hình khóa API của kết nối khi gặp lỗi xác thực hoặc hết hạn mức. */
  onFixKey?: () => void
  onNavigateChapter?(chapterId: string): void
}): JSX.Element {
  const running = turn.status === 'sending' || turn.status === 'running'
  const otherChapter = Boolean(
    turn.chapterId && currentChapterId && turn.chapterId !== currentChapterId
  )
  const waiting =
    running && turn.answer === '' && turn.reasoning === '' && toolCalls(turn.tools).length === 0

  return (
    <article className="flex flex-col gap-1.5">
      <div className="group/question relative rounded-sm border border-default bg-muted/50 px-3 py-2">
        <p className="selectable m-0 whitespace-pre-wrap wrap-anywhere text-body-sm leading-normal text-default">
          {turn.question}
        </p>
        <span className="pointer-events-none absolute top-2 right-3 text-body-xs text-muted opacity-0 transition-opacity group-hover/question:opacity-100">
          {turnTime(turn.createdAt)}
        </span>
      </div>

      {/* Thông báo khi câu trả lời được xử lý bởi model dự phòng. */}
      {turn.tools
        .filter((step) => step.name === 'fallback')
        .map((step, index) => (
          <p
            key={'fallback' + String(index)}
            role="status"
            className="m-0 text-body-xs text-warning"
          >
            {step.detail}
          </p>
        ))}

      <Thought turn={turn} running={running} />
      <ToolRow turn={turn} running={running} />

      {waiting && (
        <p className="m-0 text-body-xs text-muted motion-safe:animate-pulse">Đang suy nghĩ</p>
      )}

      {turn.answer !== '' && <SafeMarkdown text={turn.answer} />}

      {turn.proposals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {turn.proposals.map((proposal, index) => {
            const key = proposal.label + String(index)
            if (proposal.type === 'term') {
              return <TermProposalCard key={key} workId={workId} proposal={proposal} />
            }
            if (otherChapter || proposal.chapterId !== currentChapterId) {
              return (
                <div
                  key={key}
                  className="flex flex-col gap-1.5 rounded-sm border border-default p-2 text-body-xs"
                >
                  {targetChapterExists ? (
                    <>
                      <p className="m-0 text-subtle">
                        {proposal.label} · thuộc <strong>{chapterLabel ?? 'chương khác'}</strong>.
                      </p>
                      {onNavigateChapter && (
                        <Button
                          className="self-start"
                          onClick={() => onNavigateChapter(proposal.chapterId)}
                        >
                          Mở {chapterLabel ?? 'chương'} để duyệt
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="m-0 text-error">Chương của đề xuất này đã bị xóa.</p>
                  )}
                </div>
              )
            }
            return (
              <TextProposalCard
                key={key}
                proposal={proposal}
                item={queueItem(proposal.proposalId)}
                actions={actions}
              />
            )
          })}
        </div>
      )}

      {turn.status === 'cancelled' && (
        <p className="m-0 flex items-center gap-1 text-body-xs text-muted">
          <StopCircleIcon size={12} aria-hidden="true" />
          Đã dừng
        </p>
      )}

      {turn.status === 'interrupted' && (
        <p className="m-0 flex items-center gap-1 text-body-xs text-muted">
          <StopCircleIcon size={12} aria-hidden="true" />
          Bị ngắt khi app đóng
        </p>
      )}

      {turn.status === 'error' && turn.error !== null && (
        <div className="flex flex-col gap-1.5 rounded-sm border border-error/35 bg-error/7 px-3 py-2 text-body-xs leading-normal text-default">
          <p className="m-0 flex items-start gap-1.5">
            <DangerCircleIcon size={14} className="mt-px shrink-0 text-error" />
            <span className="min-w-0">
              {keyProblem(turn.error) && (
                <span className="block font-medium">{keyProblem(turn.error)}</span>
              )}
              {turn.error.message}
            </span>
          </p>
          {turn.error.recoverAt !== null && (
            <p className="m-0 text-subtle">
              Hạn mức hồi phục khoảng{' '}
              {new Date(turn.error.recoverAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit'
              })}
              .
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {turn.error.account && (
              <Button
                variant="solid"
                onClick={() =>
                  useAiOverlayStore.getState().openSettings({
                    group: 'connections',
                    page: 'accounts',
                    key: 'account:' + turn.error!.account
                  })
                }
              >
                Đăng nhập lại
              </Button>
            )}
            {onFixKey && !turn.error.account && keyProblem(turn.error) && (
              <Button variant="solid" onClick={onFixKey}>
                Cập nhật khóa
              </Button>
            )}
            {turn.error.retryable && (
              <Button variant="ghost" onClick={() => onRetry(turn.question)}>
                Hỏi lại
              </Button>
            )}
            {retryWith && (
              <Button variant="ghost" onClick={retryWith.onClick}>
                Thử bằng {retryWith.label}
              </Button>
            )}
          </div>
        </div>
      )}

      {turn.status === 'done' && (
        <div className="flex items-center justify-end gap-1.5 text-body-xs text-muted">
          <span title={usageLine(turn) + (turn.keyTail !== null ? ' · khóa …' + turn.keyTail : '')}>
            {turnTime(turn.finishedAt ?? turn.createdAt)}
          </span>
          <CompactButton
            aria-label="Sao chép"
            title="Sao chép"
            onClick={() => void navigator.clipboard.writeText(turn.answer)}
            icon={<CopyIcon size={ICON.sm} aria-hidden="true" />}
          />
          <CompactButton
            aria-label="Hỏi lại"
            title="Hỏi lại"
            onClick={() => onRetry(turn.question)}
            icon={<RefreshIcon size={ICON.sm} aria-hidden="true" />}
          />
        </div>
      )}
    </article>
  )
}
