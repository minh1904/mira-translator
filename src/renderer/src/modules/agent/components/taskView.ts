import type {
  AgentTaskCommand,
  AgentTaskItemState,
  AgentTaskReason,
  AgentTaskState,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import type { QaRuleCode } from '../../../../../shared/contracts/taskQuality'
import type { TokenUsage } from '../../../../../shared/contracts/usage'
import type { BadgeColor } from '../../../components/ui/Badge'

export const STATE_COLORS: Record<AgentTaskState, BadgeColor> = {
  queued: 'neutral',
  running: 'info',
  pausing: 'info',
  paused: 'warning',
  waiting_user: 'warning',
  cancelling: 'neutral',
  cancelled: 'neutral',
  completed: 'success',
  partially_completed: 'warning',
  failed: 'error'
}

export const ITEM_LABELS: Record<AgentTaskItemState, { label: string; color: BadgeColor }> = {
  queued: { label: 'Đang chờ', color: 'neutral' },
  running: { label: 'Đang dịch', color: 'info' },
  waiting_user: { label: 'Chờ bạn', color: 'warning' },
  completed: { label: 'Xong', color: 'success' },
  failed: { label: 'Lỗi', color: 'error' },
  skipped: { label: 'Bỏ qua', color: 'neutral' },
  cancelled: { label: 'Đã hủy', color: 'neutral' }
}

export const REASON_LABELS: Record<AgentTaskReason, string> = {
  missing_raw: 'chương chưa có bản gốc',
  conflict: 'nội dung đã đổi, cần bạn xem lại',
  budget: 'đã chạm trần ngân sách',
  provider: 'kết nối hoặc model báo lỗi',
  refused: 'nhà cung cấp từ chối một số đoạn',
  context_review: 'cần duyệt ngữ cảnh',
  app_closed: 'ứng dụng đã đóng',
  recovered_after_restart: 'khôi phục sau khi mở lại',
  user: 'bạn đã tạm dừng'
}

/** The commands a task in `state` accepts (transition table of the spec). */
export const COMMANDS: Record<
  AgentTaskState,
  Array<{ command: AgentTaskCommand; label: string }>
> = {
  queued: [
    { command: 'pause', label: 'Tạm dừng' },
    { command: 'cancel', label: 'Hủy' }
  ],
  running: [
    { command: 'pause', label: 'Tạm dừng' },
    { command: 'cancel', label: 'Hủy' }
  ],
  pausing: [{ command: 'cancel', label: 'Hủy' }],
  paused: [
    { command: 'continue', label: 'Tiếp tục' },
    { command: 'cancel', label: 'Hủy' }
  ],
  waiting_user: [
    { command: 'continue', label: 'Tiếp tục' },
    { command: 'cancel', label: 'Hủy' }
  ],
  cancelling: [],
  failed: [
    { command: 'retry', label: 'Thử lại' },
    { command: 'run_again', label: 'Chạy lại tất cả' }
  ],
  partially_completed: [
    { command: 'retry', label: 'Chạy lại chương lỗi' },
    { command: 'run_again', label: 'Chạy lại tất cả' }
  ],
  completed: [{ command: 'run_again', label: 'Chạy lại tất cả' }],
  cancelled: [{ command: 'run_again', label: 'Chạy lại tất cả' }]
}

/** Every rule has a written label: colour is never the only signal. */
export const QA_RULE_LABELS: Record<QaRuleCode, string> = {
  'glossary.forbidden_used': 'Từ bị cấm',
  'glossary.missing_target': 'Thiếu thuật ngữ',
  'addressing.unexpected_pronoun': 'Xưng hô lệch',
  'addressing.inconsistent_pair': 'Xưng hô không nhất quán',
  'text.residual_source': 'Còn chữ gốc',
  'text.length_ratio': 'Độ dài bất thường',
  'text.repetition': 'Lặp bất thường',
  'text.unbalanced_quotes': 'Ngoặc không cân'
}

/** What the screens do with a chapter or paragraph; passed down instead of reaching into stores. */
export interface TaskActions {
  onOpenChapter: (workId: string, chapterId: string) => void
  /** "Xem ngữ cảnh" of a task left waiting for context review before review was dropped. */
  /** `review` opens the Glossary on its open questions. */
  onReviewContext?: (workId: string, view?: 'review') => void
  /** "Mở đoạn" of a quality warning: the chapter, scrolled to the source paragraph. */
  onOpenSegment?: (workId: string, chapterId: string, paragraphIndex: number) => void
  /** "Mở Kết nối AI" of a key or quota error. */
  onOpenConnections?: () => void
  /** "Hỏi trợ lý AI": puts the scrubbed text in the Assistant's composer, unsent. */
  onAskAssistant?: (text: string) => void
}

export const taskTotal = (task: AgentTaskSummary): number =>
  Object.values(task.counts).reduce((sum, count) => sum + count, 0)

/** Progress in words: never "done" while an item failed or waits. */
export function taskProgressLabel(task: AgentTaskSummary): string {
  const parts = [`${task.counts.completed}/${taskTotal(task)} chương`]
  if (task.counts.failed > 0) parts.push(`${task.counts.failed} lỗi`)
  if (task.counts.waiting_user > 0) parts.push(`${task.counts.waiting_user} chờ bạn`)
  if (task.counts.skipped > 0) parts.push(`${task.counts.skipped} bỏ qua`)
  return parts.join(' · ')
}

export function durationLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} giây`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes} phút ${seconds % 60} giây`
    : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`
}

/** Tokens in a line; a provider that did not report says so, never 0. */
export const usageBrief = (usage: TokenUsage | null | undefined): string =>
  usage
    ? `${usage.inputTokens.toLocaleString('vi')} vào · ${usage.outputTokens.toLocaleString('vi')} ra`
    : 'không rõ'

/** Same rounding as `UsageDisplay`; callers print nothing when there is no price. */
export const costLabel = (usd: number): string =>
  usd < 0.01 ? '<0,01' : usd.toFixed(4).replace('.', ',')

export const clockLabel = (at: number): string =>
  new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
