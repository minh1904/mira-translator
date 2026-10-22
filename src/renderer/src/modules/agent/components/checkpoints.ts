import type {
  AgentOperation,
  AgentToolCallView,
  AgentTurnView
} from '../../../../../shared/contracts/agent'

const CREATE_TRANSLATION_TASK = 'create_translation_task'

/** What restoring the checkpoint before a turn touches: chapters it undoes and tasks that keep running. */
export interface RevertImpact {
  /** Turns hidden: this one and every later one. */
  turnIds: string[]
  /** Chapters whose agent writes are undone. */
  chapters: number
  /** Durable translation tasks those turns created; they are not cancelled. */
  tasks: number
}

export function revertImpact(
  turnId: string,
  turns: AgentTurnView[],
  operations: Record<string, AgentOperation>,
  toolCalls: Record<string, AgentToolCallView>
): RevertImpact {
  const from = turns.find((turn) => turn.id === turnId)
  if (!from) return { turnIds: [], chapters: 0, tasks: 0 }
  const turnIds = turns.filter((turn) => turn.createdAt >= from.createdAt).map((turn) => turn.id)
  const hidden = new Set(turnIds)
  const chapters = new Set(
    Object.values(operations)
      .filter(
        (op) =>
          op.turnId !== null &&
          hidden.has(op.turnId) &&
          op.state !== 'undone' &&
          op.target.kind === 'chapter'
      )
      .map((op) => (op.target.kind === 'chapter' ? op.target.chapterId : ''))
  )
  const tasks = Object.values(toolCalls).filter(
    (call) =>
      call.name === CREATE_TRANSLATION_TASK && call.state === 'completed' && hidden.has(call.turnId)
  ).length
  return { turnIds, chapters: chapters.size, tasks }
}

/** The confirmation of a restore, naming what it undoes and what keeps running. */
export function revertMessage(impact: RevertImpact): string {
  const parts = [
    impact.turnIds.length > 1
      ? `Lệnh này và ${impact.turnIds.length - 1} lệnh sau sẽ bị ẩn khỏi cuộc trò chuyện.`
      : 'Lệnh này sẽ bị ẩn khỏi cuộc trò chuyện.',
    impact.chapters > 0
      ? `Thay đổi của agent ở ${impact.chapters} chương sẽ được hoàn tác.`
      : 'Không có chương nào cần hoàn tác.'
  ]
  if (impact.tasks > 0) {
    parts.push(
      `${impact.tasks} tác vụ dịch do các lệnh này tạo vẫn tiếp tục chạy; dừng ở màn Tác vụ nếu cần.`
    )
  }
  parts.push('Không làm lại được sau khi khôi phục.')
  return parts.join(' ')
}

const SKIP_EDIT_CONFIRM_KEY = 'mira.agent.skipEditConfirm'

export function readSkipEditConfirm(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem(SKIP_EDIT_CONFIRM_KEY) === '1'
    )
  } catch {
    return false
  }
}

export function writeSkipEditConfirm(): void {
  try {
    localStorage.setItem(SKIP_EDIT_CONFIRM_KEY, '1')
  } catch {
    // Không lưu được thì hộp xác nhận chỉ hiện lại lần sau.
  }
}
