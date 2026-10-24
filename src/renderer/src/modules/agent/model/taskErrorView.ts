import {
  type AgentTaskDetailView,
  type OperationError,
  type TaskErrorCode,
  type TaskErrorOption
} from '../../../../../shared/contracts/agentTask'

export type ErrorLevel = 'warning' | 'error'

export interface ErrorInfo {
  /** The error in a few words, for a grouped line ("12 chương chờ hạn mức"). */
  short: string
  /** What the code means, said once; the record's `cause` says more when the provider gave evidence. */
  why: string
  /** "warning" when waiting or trying again is likely enough; "error" when the person has to act. */
  level: ErrorLevel
}

/** Keyed by the stable `code`; no Vietnamese string is ever used to branch (spec `task-error-record`). */
export const ERROR_INFO: Record<TaskErrorCode, ErrorInfo> = {
  rate_limited: {
    short: 'chờ hạn mức',
    why: 'Nhà cung cấp giới hạn số lượt gọi trong một khoảng thời gian.',
    level: 'warning'
  },
  network: {
    short: 'mất kết nối mạng',
    why: 'Không nối được tới nhà cung cấp.',
    level: 'warning'
  },
  timeout: {
    short: 'hết thời gian chờ',
    why: 'Nhà cung cấp không trả lời kịp.',
    level: 'warning'
  },
  invalid_response: {
    short: 'nhận phản hồi sai định dạng',
    why: 'Model trả về nội dung app không đọc được hoặc thiếu đoạn.',
    level: 'warning'
  },
  auth: {
    short: 'bị từ chối khóa API',
    why: 'Khóa API sai, hết hiệu lực hoặc không có quyền dùng model này.',
    level: 'error'
  },
  quota: {
    short: 'hết hạn mức hoặc tín dụng',
    why: 'Tài khoản đã hết hạn mức hoặc tín dụng; chờ không giúp ích ngay.',
    level: 'error'
  },
  refused: {
    short: 'bị chặn nội dung',
    why: 'Bộ lọc của nhà cung cấp chặn một số đoạn; thử lại nguyên văn cũng bị chặn.',
    level: 'error'
  },
  invalid_request: {
    short: 'bị từ chối yêu cầu',
    why: 'Nhà cung cấp từ chối chính yêu cầu; gửi lại y nguyên không đổi được gì.',
    level: 'error'
  },
  cancelled: { short: 'đã bị hủy', why: 'Lượt dịch đã bị dừng.', level: 'warning' },
  missing_raw: {
    short: 'chưa có bản gốc',
    why: 'Chương chưa có nội dung gốc để dịch.',
    level: 'error'
  },
  conflict: {
    short: 'nội dung đã đổi',
    why: 'Nội dung chương đổi trong lúc dịch nên app không ghi đè.',
    level: 'error'
  },
  budget: {
    short: 'chạm trần ngân sách',
    why: 'Tác vụ đã dùng hết số lượt gọi hoặc token được phép.',
    level: 'error'
  },
  unknown: {
    short: 'lỗi không rõ loại',
    why: 'App không phân loại được lỗi này.',
    level: 'error'
  }
}

/** The button of an option; options without an entry are only hints (`OPTION_HINTS`). */
export const OPTION_LABELS: Partial<Record<TaskErrorOption, string>> = {
  retry_now: 'Thử lại',
  open_connections: 'Mở Kết nối AI',
  skip_refused: 'Bỏ qua đoạn bị từ chối',
  open_chapter: 'Mở chương',
  ask_assistant: 'Hỏi trợ lý AI'
}

export const OPTION_HINTS: Partial<Record<TaskErrorOption, string>> = {
  switch_model: 'Hoặc chọn model khác cho tác vụ.',
  reduce_batch: 'Giảm cỡ lô hoặc kiểm tra cài đặt model.'
}

/** The label of a run's error: a record names its kind, an old `{ code, message }` is "không rõ loại". */
export function errorLabel(error: OperationError): string {
  return 'scope' in error ? ERROR_INFO[error.code].short : ERROR_INFO.unknown.short
}

export interface ChapterError {
  itemId: string
  chapterId: string
  chapterLabel: string
  error: OperationError
  /** When the run ended; with `retryAfterMs` it gives the time to try again. */
  at: number | null
}

export interface ErrorGroup {
  key: string
  code: TaskErrorCode
  cause: string | undefined
  /** The first chapter's record stands for the group; the others stay in `chapters`. */
  error: OperationError
  chapters: ChapterError[]
  /** Common time to try again, only when every chapter of the group has one. */
  retryAt: number | null
}

/**
 * Chapters failing for the same code and cause become one group. Display only: each chapter keeps its own
 * record in `chapters`, and a chapter with one cause appears under its main code.
 */
export function groupErrors(errors: readonly ChapterError[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>()
  for (const each of errors) {
    // An old record has no kind to group by: equal messages group, nothing is read out of them.
    const record = 'scope' in each.error ? each.error : null
    const key = record
      ? `${record.code}|${record.cause ?? ''}`
      : `legacy|${'message' in each.error ? each.error.message : ''}`
    const known = groups.get(key)
    if (known) known.chapters.push(each)
    else
      groups.set(key, {
        key,
        code: record?.code ?? 'unknown',
        cause: record?.cause,
        error: each.error,
        chapters: [each],
        retryAt: null
      })
  }
  for (const group of groups.values()) {
    const times = group.chapters.map((each) =>
      each.at !== null && 'scope' in each.error && each.error.retryAfterMs !== undefined
        ? each.at + each.error.retryAfterMs
        : null
    )
    group.retryAt = times.every((time) => time !== null) ? Math.max(...(times as number[])) : null
  }
  // An error that stopped the whole task comes first.
  const stops = (group: ErrorGroup): number =>
    'scope' in group.error && group.error.scope === 'task' ? 0 : 1
  return [...groups.values()].sort((a, b) => stops(a) - stops(b))
}

/** The chapters of a task that ended in failure or wait, each with the error of its latest run. */
export function chapterErrorsOf(detail: AgentTaskDetailView): ChapterError[] {
  return detail.items.flatMap((item): ChapterError[] =>
    (item.state === 'failed' || item.state === 'waiting_user') && item.lastRun?.error
      ? [
          {
            itemId: item.id,
            chapterId: item.chapterId,
            chapterLabel: item.chapterLabel,
            error: item.lastRun.error,
            at: item.lastRun.endedAt
          }
        ]
      : []
  )
}

/** The text "Hỏi trợ lý AI" puts in the composer: the scrubbed record, never its raw `detail`. */
export function errorAskText(title: string, error: OperationError): string {
  if (!('scope' in error)) {
    return `Tác vụ dịch "${title}" gặp một lỗi cũ không rõ loại: ${error.message}\nXin giải thích và đề xuất cách xử lý.`
  }
  const lines = [
    `Tác vụ dịch "${title}" gặp lỗi. Hãy giải thích nguyên nhân và đề xuất cách xử lý.`,
    `- Chuyện gì: ${error.what}`,
    `- Mã lỗi: ${error.code} (phạm vi: ${error.scope})`,
    `- Thử lại nguyên trạng có ích không: ${error.retryable ? 'có' : 'không'}`
  ]
  if (error.cause) lines.push(`- Nguyên nhân nhà cung cấp nêu: ${error.cause}`)
  if (error.retryAfterMs !== undefined)
    lines.push(`- Nhà cung cấp báo chờ: ${Math.round(error.retryAfterMs / 1000)} giây`)
  if (error.groups)
    lines.push(
      `- Các nhóm: ${error.groups.map((g) => `${g.code} (${g.segmentCount} đoạn)`).join(', ')}`
    )
  return lines.join('\n')
}
