import type {
  TaskError,
  TaskErrorCode,
  TaskErrorGroup,
  TaskErrorOption,
  TaskErrorScope
} from '../../../shared/contracts/agentTask'
import type { TranslateErrorKind, TranslateFailure } from '../../../shared/contracts/aiTranslate'
import { ProviderError } from '../../infra/providers/types'
import { redactSecrets } from '../../infra/providers/redact'
import { StorageError } from '../../infra/storage/errors'

/** Segment ids kept per failure group; the total count is kept beside them. */
export const FAILURE_SEGMENTS_MAX = 20

/**
 * One cause of failed paragraphs in a chapter run, as the runner saw it. Stored in the operation's
 * `result.failures`; `recoverAt` is an absolute time, turned into `retryAfterMs` when the record is read.
 */
export interface RunFailure {
  code: TaskErrorCode
  message: string
  segmentIds: string[]
  segmentCount: number
  recoverAt?: number
  quotaScope?: 'minute' | 'day'
  detail?: string
}

/** Thrown by the runner when a chapter run produced nothing but a failure; carries what failed. */
export class RunFailedError extends StorageError {
  constructor(
    message: string,
    readonly failures: RunFailure[]
  ) {
    super('io', message)
  }
}

export class MissingSourceError extends StorageError {
  constructor(message: string) {
    super('validation', message)
  }
}

export const codeOfKind = (kind: TranslateErrorKind): TaskErrorCode =>
  kind === 'budget_exhausted' ? 'budget' : kind

const RETRYABLE: Record<TaskErrorCode, boolean> = {
  rate_limited: true,
  network: true,
  timeout: true,
  invalid_response: true,
  budget: true,
  auth: false,
  quota: false,
  refused: false,
  invalid_request: false,
  cancelled: false,
  missing_raw: false,
  conflict: false,
  unknown: false
}

const OPTIONS: Record<TaskErrorCode, TaskErrorOption[]> = {
  rate_limited: ['retry_now', 'ask_assistant'],
  network: ['retry_now', 'ask_assistant'],
  timeout: ['retry_now', 'ask_assistant'],
  invalid_response: ['retry_now', 'ask_assistant'],
  auth: ['open_connections', 'ask_assistant'],
  quota: ['open_connections', 'switch_model', 'ask_assistant'],
  refused: ['skip_refused', 'open_chapter', 'ask_assistant'],
  invalid_request: ['reduce_batch', 'open_connections', 'ask_assistant'],
  cancelled: ['retry_now'],
  missing_raw: ['open_chapter', 'ask_assistant'],
  conflict: ['open_chapter', 'ask_assistant'],
  budget: ['retry_now', 'ask_assistant'],
  unknown: ['retry_now', 'ask_assistant']
}

const VERBS: Record<TaskErrorCode, string> = {
  rate_limited: 'bị giới hạn tốc độ',
  network: 'mất kết nối mạng',
  timeout: 'không nhận được phản hồi kịp',
  invalid_response: 'nhận phản hồi sai định dạng',
  auth: 'bị từ chối khóa API',
  quota: 'hết hạn mức hoặc tín dụng',
  refused: 'bị bộ lọc nội dung chặn',
  invalid_request: 'bị nhà cung cấp từ chối yêu cầu',
  cancelled: 'đã bị hủy',
  missing_raw: 'chưa có bản gốc',
  conflict: 'có nội dung đã đổi trong lúc dịch',
  budget: 'đã chạm trần ngân sách',
  unknown: 'gặp lỗi không rõ loại'
}

/** Errors that make every later chapter fail the same way, so the whole task stops. */
export const haltsTask = (code: TaskErrorCode): boolean => code === 'auth' || code === 'quota'

/** The heaviest cause names the chapter: blocked first, then what only the person can fix. */
const WEIGHT: TaskErrorCode[] = [
  'auth',
  'quota',
  'refused',
  'invalid_request',
  'missing_raw',
  'conflict',
  'rate_limited',
  'network',
  'timeout',
  'invalid_response',
  'budget',
  'cancelled',
  'unknown'
]

const causeOf = (failure: {
  code: TaskErrorCode
  message?: string
  quotaScope?: 'minute' | 'day'
}): string | undefined => {
  // Only what the provider said: no scope, no cause.
  if (failure.code === 'quota' && failure.quotaScope)
    return failure.quotaScope === 'day' ? 'hạn mức theo ngày' : 'hạn mức theo phút'
  if ((failure.code === 'refused' || failure.code === 'invalid_request') && failure.message)
    return redactSecrets(failure.message)
  return undefined
}

function describe(
  code: TaskErrorCode,
  scope: TaskErrorScope,
  chapterLabel: string | undefined
): string {
  // The label is the work's own text and goes to the assistant: scrubbed like the rest of the record.
  if (scope === 'task') return `Cả tác vụ dừng: ${VERBS[code]}`
  return redactSecrets(`${chapterLabel ?? 'Một lượt dịch'} ${VERBS[code]}`)
}

/** Builds the record of one chapter from the failure groups of its run. */
export function taskErrorFromFailures(
  failures: readonly RunFailure[],
  context: { chapterLabel?: string; at: number }
): TaskError | null {
  if (failures.length === 0) return null
  const main = [...failures].sort((a, b) => WEIGHT.indexOf(a.code) - WEIGHT.indexOf(b.code))[0]
  const scope: TaskErrorScope = haltsTask(main.code) ? 'task' : 'chapter'
  const cause = causeOf(main)
  const groups: TaskErrorGroup[] = failures.map((failure) => ({
    code: failure.code,
    segmentCount: failure.segmentCount,
    ...(causeOf(failure) ? { cause: causeOf(failure) } : {})
  }))
  return {
    code: main.code,
    scope,
    what: describe(main.code, scope, context.chapterLabel),
    ...(cause ? { cause } : {}),
    retryable: RETRYABLE[main.code],
    ...(main.recoverAt !== undefined
      ? { retryAfterMs: Math.max(0, main.recoverAt - context.at) }
      : {}),
    options: OPTIONS[main.code],
    ...(main.detail ? { detail: redactSecrets(main.detail) } : {}),
    ...(failures.length > 1 ? { groups } : {})
  }
}

/** Records the failure groups of one batch outcome into `into`, merging groups of the same cause. */
export function collectFailures(
  into: RunFailure[],
  outcome: {
    failedIds: readonly string[]
    refusedIds: readonly string[]
    budgetIds: readonly string[]
    error: TranslateFailure | Omit<TranslateFailure, 'haltsRun'> | null
  }
): void {
  const refused = new Set(outcome.refusedIds)
  const budget = new Set(outcome.budgetIds)
  const other = outcome.failedIds.filter((id) => !refused.has(id) && !budget.has(id))
  const error = outcome.error
  const add = (
    failure: Omit<RunFailure, 'segmentCount' | 'segmentIds'>,
    ids: readonly string[]
  ): void => {
    if (ids.length === 0) return
    const known = into.find(
      (each) => each.code === failure.code && each.message === failure.message
    )
    if (known) {
      known.segmentCount += ids.length
      known.segmentIds.push(
        ...ids.slice(0, Math.max(0, FAILURE_SEGMENTS_MAX - known.segmentIds.length))
      )
      return
    }
    into.push({
      ...failure,
      segmentIds: ids.slice(0, FAILURE_SEGMENTS_MAX),
      segmentCount: ids.length
    })
  }
  add(
    {
      code: 'refused',
      message: error?.kind === 'refused' ? error.message : 'Bộ lọc nội dung chặn đoạn này.'
    },
    outcome.refusedIds
  )
  add(
    { code: 'budget', message: 'Hết ngân sách lời gọi; đoạn này chưa được gửi.' },
    outcome.budgetIds
  )
  // What is left failed for the provider's own reason, or for a short answer after retries.
  const code: TaskErrorCode =
    error && error.kind !== 'refused' && error.kind !== 'budget_exhausted'
      ? codeOfKind(error.kind)
      : 'invalid_response'
  const own = error && code === codeOfKind(error.kind)
  add(
    {
      code,
      message: own && error ? error.message : 'Thiếu đoạn sau khi đã thử lại.',
      ...(own && error?.recoverAt != null ? { recoverAt: error.recoverAt } : {}),
      ...(own && error?.quotaScope ? { quotaScope: error.quotaScope } : {}),
      ...(own && error?.detail ? { detail: error.detail } : {})
    },
    other
  )
}

/** Turns an error a run threw into the record of the chapter (or task) it ended. */
export function toTaskError(
  error: unknown,
  context: { scope?: TaskErrorScope; chapterLabel?: string; at: number }
): TaskError {
  if (error instanceof RunFailedError) {
    const record = taskErrorFromFailures(error.failures, context)
    if (record) return record
  }
  const base = (code: TaskErrorCode, rest: Partial<TaskError> = {}): TaskError => {
    const scope = context.scope ?? (haltsTask(code) ? 'task' : 'chapter')
    return {
      code,
      scope,
      what: describe(code, scope, context.chapterLabel),
      retryable: RETRYABLE[code],
      options: OPTIONS[code],
      ...rest
    }
  }
  if (error instanceof ProviderError) {
    const code: TaskErrorCode = error.kind
    const cause = causeOf({ code, message: error.message, quotaScope: error.quotaScope })
    return base(code, {
      ...(cause ? { cause } : {}),
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      detail: redactSecrets([error.message, error.bodySnippet].filter(Boolean).join('\n'))
    })
  }
  if (error instanceof MissingSourceError) return base('missing_raw')
  const detail = error instanceof Error ? error.message : String(error)
  if (error instanceof StorageError && error.code === 'conflict')
    return base('conflict', { detail: redactSecrets(detail) })
  return base('unknown', { detail: redactSecrets(detail) })
}
