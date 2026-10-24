import { describe, expect, it } from 'vitest'
import { TASK_ERROR_CODES } from '../../../shared/contracts/agentTask'
import { ProviderError, type ProviderErrorKind } from '../../infra/providers/types'
import { StorageError } from '../../infra/storage/errors'
import {
  collectFailures,
  MissingSourceError,
  RunFailedError,
  taskErrorFromFailures,
  toTaskError,
  type RunFailure
} from './taskError'

const at = 1_000_000
const FAKE_KEY = 'sk-live-0123456789abcdef'

describe('toTaskError', () => {
  it('keeps each provider kind as its own code, never one "provider"', () => {
    const kinds: ProviderErrorKind[] = [
      'rate_limited',
      'network',
      'timeout',
      'invalid_response',
      'auth',
      'quota',
      'refused',
      'invalid_request',
      'cancelled'
    ]
    const codes = kinds.map((kind) => toTaskError(new ProviderError(kind, 'x'), { at }).code)
    expect(codes).toEqual(kinds)
    expect(new Set(codes).size).toBe(kinds.length)
  })

  it('gives a daily quota a cause, no retry, and an account-level scope', () => {
    const record = toTaskError(new ProviderError('quota', 'hết hạn mức', { quotaScope: 'day' }), {
      chapterLabel: 'Chương 28',
      at
    })
    expect(record).toMatchObject({
      code: 'quota',
      scope: 'task',
      retryable: false,
      cause: 'hạn mức theo ngày'
    })
    expect(record.options).toContain('open_connections')
  })

  it('reads the wait the provider asked for, and invents none when it did not', () => {
    const waited = toTaskError(new ProviderError('rate_limited', 'x', { retryAfterMs: 30_000 }), {
      chapterLabel: 'Chương 9',
      at
    })
    expect(waited).toMatchObject({ code: 'rate_limited', retryable: true, retryAfterMs: 30_000 })
    expect(waited.what).toContain('Chương 9')
    const silent = toTaskError(new ProviderError('rate_limited', 'x'), { at })
    expect(silent).not.toHaveProperty('retryAfterMs')
    expect(silent).not.toHaveProperty('cause')
    expect(silent).not.toHaveProperty('tried')
  })

  it("uses Mira's own codes for a missing source and a conflict, and unknown for the rest", () => {
    expect(toTaskError(new MissingSourceError('thiếu'), { at }).code).toBe('missing_raw')
    expect(toTaskError(new StorageError('conflict', 'đổi'), { at }).code).toBe('conflict')
    expect(toTaskError(new Error('lạ'), { at })).toMatchObject({
      code: 'unknown',
      retryable: false
    })
  })

  it('scrubs a key out of the detail of a provider body', () => {
    // The provider layer scrubs the keys it knows; this is the second net for a key in a field.
    const error = new ProviderError('invalid_request', 'Yêu cầu sai', {
      bodySnippet: `{"error":"bad","api_key":"${FAKE_KEY}","note":"Bearer ${FAKE_KEY}"}`
    })
    const record = toTaskError(error, { at })
    expect(record.detail).toBeDefined()
    expect(record.detail).not.toContain(FAKE_KEY)
    expect(JSON.stringify(record)).not.toContain(FAKE_KEY)
  })

  it('scrubs a key out of the cause, which reaches the assistant, and out of the chapter label', () => {
    const error = new ProviderError('invalid_request', `Yêu cầu sai: ?key=${FAKE_KEY}`)
    const record = toTaskError(error, { chapterLabel: `Chương ?key=${FAKE_KEY}`, at })
    expect(record.cause).toBeDefined()
    expect(JSON.stringify(record)).not.toContain(FAKE_KEY)
  })

  it('has an option list and a sentence for every code', () => {
    for (const code of TASK_ERROR_CODES) {
      const record = taskErrorFromFailures(
        [{ code, message: 'm', segmentIds: ['a'], segmentCount: 1 }],
        { chapterLabel: 'Chương 1', at }
      )
      expect(record?.what.length, code).toBeGreaterThan(0)
      expect(record?.options.length, code).toBeGreaterThan(0)
    }
  })
})

describe('collectFailures', () => {
  it('keeps two causes of one chapter apart, with their paragraph counts', () => {
    const failures: RunFailure[] = []
    collectFailures(failures, {
      failedIds: ['a', 'b', 'c'],
      refusedIds: ['a', 'b', 'c'],
      budgetIds: [],
      error: { kind: 'refused', message: 'Bị chặn: SAFETY', recoverAt: null }
    })
    collectFailures(failures, {
      failedIds: ['f', 'g'],
      refusedIds: [],
      budgetIds: [],
      error: { kind: 'network', message: 'Mất mạng', recoverAt: null }
    })
    expect(failures.map((f) => [f.code, f.segmentCount])).toEqual([
      ['refused', 3],
      ['network', 2]
    ])
    const record = taskErrorFromFailures(failures, { chapterLabel: 'Chương 17', at })
    // Blocked content names the chapter: retrying cannot help it.
    expect(record).toMatchObject({ code: 'refused', cause: 'Bị chặn: SAFETY' })
    expect(record?.groups).toEqual([
      { code: 'refused', segmentCount: 3, cause: 'Bị chặn: SAFETY' },
      { code: 'network', segmentCount: 2 }
    ])
  })

  it('merges the same cause across batches and caps the ids it keeps', () => {
    const failures: RunFailure[] = []
    const ids = (from: number) => Array.from({ length: 15 }, (_, i) => `s${from + i}`)
    for (const from of [0, 15]) {
      collectFailures(failures, {
        failedIds: ids(from),
        refusedIds: [],
        budgetIds: [],
        error: { kind: 'rate_limited', message: 'Chờ', recoverAt: at + 30_000 }
      })
    }
    expect(failures).toHaveLength(1)
    expect(failures[0]?.segmentCount).toBe(30)
    expect(failures[0]?.segmentIds).toHaveLength(20)
    expect(taskErrorFromFailures(failures, { at })?.retryAfterMs).toBe(30_000)
  })

  it('reads a short answer after retries as an invalid response, not as the provider failing', () => {
    const failures: RunFailure[] = []
    collectFailures(failures, {
      failedIds: ['a'],
      refusedIds: [],
      budgetIds: [],
      error: null
    })
    expect(failures[0]?.code).toBe('invalid_response')
  })

  it('is what a run that produced nothing throws', () => {
    const failures: RunFailure[] = []
    collectFailures(failures, {
      failedIds: ['a'],
      refusedIds: [],
      budgetIds: [],
      error: { kind: 'auth', message: 'Khóa sai', recoverAt: null }
    })
    const record = toTaskError(new RunFailedError('Khóa sai', failures), {
      chapterLabel: 'Chương 3',
      at
    })
    expect(record).toMatchObject({ code: 'auth', scope: 'task' })
  })
})
