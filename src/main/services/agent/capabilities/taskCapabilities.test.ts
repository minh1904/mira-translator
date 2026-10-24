import { afterEach, describe, expect, it } from 'vitest'
import type {
  AgentTaskDetailView,
  AgentTaskRunsView,
  AgentTaskSummary
} from '../../../../shared/contracts/agentTask'
import type { QaFinding, TaskQualityView } from '../../../../shared/contracts/taskQuality'
import { appendAiCall, configureAiCallLog } from '../../../infra/storage/aiCallLog'
import { createTempDirs } from '../../../testing/testing'
import { setupAgent } from '../agentTestKit'
import {
  readAiCallLogCapability,
  readTaskQualityCapability,
  readTaskRunsCapability,
  readTranslationTasksCapability
} from './taskCapabilities'

const FAKE_KEY = 'sk-live-0123456789abcdef'

const detail = {
  currentInstruction: null,
  steerings: [],
  items: [
    {
      id: 'i1',
      chapterId: 'c1',
      state: 'failed',
      lastRun: {
        error: {
          code: 'quota',
          scope: 'task',
          what: 'Cả tác vụ dừng',
          cause: 'hạn mức theo ngày',
          retryable: false,
          options: ['open_connections'],
          // A record built without scrubbing the detail: the capability must still not pass it on.
          detail: `Bearer ${FAKE_KEY}`
        }
      }
    },
    {
      id: 'i2',
      chapterId: 'c2',
      state: 'completed',
      lastRun: { error: { code: 'rate_limited', message: 'old' } }
    },
    {
      id: 'i3',
      chapterId: 'c3',
      state: 'failed',
      lastRun: { error: { code: 'provider', message: 'Lỗi cũ' } }
    }
  ]
} as unknown as AgentTaskDetailView

describe('read_translation_tasks', () => {
  it('returns the error record without its detail, and unclassified for the old shape', async () => {
    const capability = readTranslationTasksCapability({
      list: () => [{ id: 'k1', state: 'failed', reason: 'provider' } as AgentTaskSummary],
      get: () => detail
    })
    const library = {
      listChapters: () => [
        { id: 'c1', number: 1 },
        { id: 'c2', number: 2 },
        { id: 'c3', number: 3 }
      ]
    }
    const res = await capability.handler({
      target: { workId: 'w', workLabel: 'W' },
      library
    } as never)
    expect(res.ok).toBe(true)
    const [task] = (res as { value: Array<Record<string, unknown>> }).value
    const chapters = task?.chapters as Array<Record<string, unknown>>
    expect(task?.error).toMatchObject({ code: 'quota', scope: 'task', cause: 'hạn mức theo ngày' })
    expect(chapters[0]?.error).toMatchObject({ code: 'quota', options: ['open_connections'] })
    // A completed chapter's earlier error is history, not a problem.
    expect(chapters[1]).not.toHaveProperty('error')
    expect(chapters[2]?.error).toEqual({ unclassified: true, message: 'Lỗi cũ' })
    expect(JSON.stringify(res)).not.toContain(FAKE_KEY)
    expect(JSON.stringify(res)).not.toContain('"detail"')
  })
})

const finding = (chapterId: string, ruleCode: QaFinding['ruleCode'], paragraphIndex: number) =>
  ({
    ruleCode,
    ruleVersion: 1,
    chapterId,
    segmentId: `s${paragraphIndex}`,
    paragraphIndex,
    message: ruleCode,
    evidence: 'e'
  }) as QaFinding

describe('read_task_quality', () => {
  it('counts by rule and chapter, judges each chapter by its newest task, and pages', async () => {
    const { library, work1, ch1_1, ch1_2 } = setupAgent()
    const views: Record<string, TaskQualityView> = {
      // Newest task: chapter 2 again; its item for chapter 1 has not run yet.
      new: {
        taskId: 'new',
        openCount: 1,
        items: [
          {
            itemId: 'a',
            chapterId: ch1_2.id,
            chapterLabel: '',
            status: 'checked',
            findings: [finding(ch1_2.id, 'text.repetition', 0)]
          },
          { itemId: 'b', chapterId: ch1_1.id, chapterLabel: '', status: 'na', findings: [] }
        ]
      },
      old: {
        taskId: 'old',
        openCount: 3,
        items: [
          {
            itemId: 'c',
            chapterId: ch1_1.id,
            chapterLabel: '',
            status: 'checked',
            findings: [
              finding(ch1_1.id, 'text.unbalanced_quotes', 2),
              finding(ch1_1.id, 'text.unbalanced_quotes', 0)
            ]
          },
          {
            itemId: 'd',
            chapterId: ch1_2.id,
            chapterLabel: '',
            status: 'checked',
            findings: [finding(ch1_2.id, 'text.length_ratio', 0)]
          }
        ]
      }
    }
    const capability = readTaskQualityCapability({
      list: () => [{ id: 'new' }, { id: 'old' }] as AgentTaskSummary[],
      quality: (taskId) => views[taskId]!
    })
    const work = { kind: 'work', workId: work1.id, workLabel: 'W' } as const
    const res = await capability.handler({ library, target: work, args: { limit: 2 } } as never)
    const value = (res as { value: Record<string, unknown> }).value
    expect(value).toMatchObject({
      checkedChapters: 2,
      openCount: 3,
      byRule: { 'text.unbalanced_quotes': 2, 'text.repetition': 1 },
      byChapter: [
        { chapter: 1, count: 2 },
        { chapter: 2, count: 1 }
      ],
      nextOffset: 2
    })
    expect(value.findings).toMatchObject([
      { chapter: 1, paragraph: 1, sourceId: 's0', rule: 'text.unbalanced_quotes' },
      { chapter: 1, paragraph: 3, sourceId: 's2' }
    ])

    const chapter = { ...work, kind: 'chapter', chapterId: ch1_2.id, chapterLabel: 'C2' }
    const one = await capability.handler({ library, target: chapter, args: {} } as never)
    expect((one as { value: { findings: unknown[] } }).value.findings).toMatchObject([
      { chapter: 2, rule: 'text.repetition' }
    ])
  })
})

describe('read_task_runs', () => {
  it('lists the runs of the chapter only, with the error record without its detail', async () => {
    const capability = readTaskRunsCapability({
      list: () => [{ id: 'k1', state: 'completed', modelLabel: 'M' }] as AgentTaskSummary[],
      get: () =>
        ({
          items: [
            { id: 'i1', chapterId: 'c1', state: 'completed', reason: null, progress: null },
            { id: 'i2', chapterId: 'c2', state: 'failed', reason: 'provider', progress: null }
          ]
        }) as unknown as AgentTaskDetailView,
      runs: (_taskId, itemId) =>
        ({
          runs: [
            {
              startedAt: 0,
              endedAt: 1000,
              state: 'failed',
              usage: null,
              error: { code: 'provider', scope: 'chapter', detail: 'raw body' },
              summary: null,
              batchesDone: 1,
              itemId
            }
          ]
        }) as unknown as AgentTaskRunsView
    })
    const library = {
      listChapters: () => [
        { id: 'c1', number: 1 },
        { id: 'c2', number: 2 }
      ]
    }
    const target = {
      kind: 'chapter',
      workId: 'w',
      workLabel: 'W',
      chapterId: 'c2',
      chapterLabel: 'C'
    }
    const res = await capability.handler({ library, target } as never)
    const [task] = (res as { value: Array<{ chapters: Array<Record<string, unknown>> }> }).value
    expect(task?.chapters).toMatchObject([
      {
        number: 2,
        state: 'failed',
        runs: [{ endedAt: '1970-01-01T00:00:01.000Z', error: { code: 'provider' }, batchesDone: 1 }]
      }
    ])
    expect(JSON.stringify(res)).not.toContain('raw body')
  })
})

describe('read_ai_call_log', () => {
  const tempDir = createTempDirs()
  afterEach(() => configureAiCallLog(null))

  it('returns the chapter records newest first, without prompts or detail, clipped', async () => {
    configureAiCallLog(tempDir())
    appendAiCall('w1', { kind: 'extract', runId: 'r', raw: 'terms' })
    appendAiCall('w1', {
      kind: 'translate.main',
      chapterId: 'c1',
      messages: ['sys'],
      raw: 'x'.repeat(9000)
    })
    appendAiCall('w1', {
      kind: 'translate.result',
      chapterId: 'c1',
      items: [{ id: 's1', src: 'a', dst: 'b' }],
      error: { kind: 'server', detail: 'Bearer secret' }
    })
    appendAiCall('w1', { kind: 'translate.main', chapterId: 'c2', raw: 'other' })
    const library = { listChapters: () => [{ id: 'c1', number: 1 }] }
    const target = {
      kind: 'chapter',
      workId: 'w1',
      workLabel: 'W',
      chapterId: 'c1',
      chapterLabel: 'C'
    }

    const res = await readAiCallLogCapability.handler({ library, target, args: {} } as never)
    const value = (res as { value: { total: number; records: Array<Record<string, unknown>> } })
      .value
    expect(value.total).toBe(2)
    expect(value.records.map((record) => record.kind)).toEqual([
      'translate.result',
      'translate.main'
    ])
    expect(value.records[0]).toMatchObject({ chapter: 1, error: { kind: 'server' } })
    expect(value.records[1]).not.toHaveProperty('messages')
    expect(String(value.records[1]?.raw)).toContain('[cắt 1000 ký tự]')
    expect(JSON.stringify(res)).not.toContain('secret')

    const work = { kind: 'work', workId: 'w1', workLabel: 'W' }
    const prompts = await readAiCallLogCapability.handler({
      library,
      target: work,
      args: { kind: 'translate', withMessages: true }
    } as never)
    const records = (prompts as { value: { records: Array<Record<string, unknown>> } }).value
      .records
    expect(records).toHaveLength(3)
    expect(records[2]).toMatchObject({ messages: ['sys'] })
  })
})
