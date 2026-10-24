import { describe, expect, it } from 'vitest'
import {
  TASK_ERROR_CODES,
  TASK_ERROR_OPTIONS,
  type TaskError
} from '../../../../../shared/contracts/agentTask'
import {
  ERROR_INFO,
  errorAskText,
  errorLabel,
  groupErrors,
  OPTION_HINTS,
  OPTION_LABELS,
  type ChapterError
} from './taskErrorView'

const error = (patch: Partial<TaskError> = {}): TaskError => ({
  code: 'rate_limited',
  scope: 'chapter',
  what: 'Chương 9 bị giới hạn tốc độ',
  retryable: true,
  options: ['retry_now', 'ask_assistant'],
  ...patch
})

const chapter = (
  n: number,
  patch: Partial<TaskError> = {},
  at: number | null = 1000
): ChapterError => ({
  itemId: `i${n}`,
  chapterId: `c${n}`,
  chapterLabel: `Chương ${n}`,
  error: error({ what: `Chương ${n}`, ...patch }),
  at
})

describe('error lookup tables', () => {
  it('has a sentence and a level for every code, and a button or hint for every option', () => {
    for (const code of TASK_ERROR_CODES) {
      expect(ERROR_INFO[code].short.length, code).toBeGreaterThan(0)
      expect(['warning', 'error']).toContain(ERROR_INFO[code].level)
    }
    for (const option of TASK_ERROR_OPTIONS) {
      expect(OPTION_LABELS[option] ?? OPTION_HINTS[option], option).toBeTruthy()
    }
  })

  it('calls an old record "không rõ loại" instead of reading a kind out of its message', () => {
    expect(errorLabel({ code: 'provider', message: 'Hết hạn mức' })).toBe('lỗi không rõ loại')
    expect(errorLabel(error({ code: 'quota' }))).toBe('hết hạn mức hoặc tín dụng')
  })
})

describe('groupErrors', () => {
  it('turns twelve chapters with the same cause into one group with a shared retry time', () => {
    const errors = Array.from({ length: 12 }, (_, i) =>
      chapter(i + 1, { retryAfterMs: 30_000 }, 1000)
    )
    const groups = groupErrors(errors)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.chapters).toHaveLength(12)
    expect(groups[0]?.retryAt).toBe(31_000)
  })

  it('keeps different codes or causes apart, and gives no retry time unless every chapter has one', () => {
    const groups = groupErrors([
      chapter(1, { code: 'network' }),
      chapter(2, { code: 'network', retryAfterMs: 5000 }),
      chapter(3, { code: 'refused', cause: 'SAFETY' }),
      chapter(4, { code: 'refused', cause: 'RECITATION' })
    ])
    expect(groups.map((g) => [g.code, g.chapters.length])).toEqual([
      ['network', 2],
      ['refused', 1],
      ['refused', 1]
    ])
    expect(groups[0]?.retryAt).toBeNull()
  })

  it('does not merge records: each chapter keeps its own', () => {
    const [group] = groupErrors([chapter(1), chapter(2)])
    expect(group?.chapters.map((each) => (each.error as TaskError).what)).toEqual([
      'Chương 1',
      'Chương 2'
    ])
  })
})

describe('errorAskText', () => {
  it('carries the record but never the raw detail', () => {
    const text = errorAskText(
      'Hehe',
      error({ code: 'quota', cause: 'hạn mức theo ngày', detail: 'Bearer sk-secret-value' })
    )
    expect(text).toContain('quota')
    expect(text).toContain('hạn mức theo ngày')
    expect(text).not.toContain('sk-secret-value')
  })

  it('says an old error is unclassified', () => {
    expect(errorAskText('Hehe', { code: 'provider', message: 'x' })).toContain('không rõ loại')
  })
})
