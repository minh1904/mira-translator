import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTaskChanged, AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import { resetAllStores } from '../../../lib/testing/resetStores'
import type { TaskQualityView } from '../../../../../shared/contracts/taskQuality'
import { useTaskStore } from '../store/taskStore'
import { TaskList } from './TaskList'

const summary = (patch: Partial<AgentTaskSummary> = {}): AgentTaskSummary => ({
  id: 'k1',
  kind: 'translate_chapters',
  workId: 'w1',
  originTurnId: null,
  sourceTaskId: null,
  state: 'partially_completed',
  reason: null,
  model: { connectionId: 'c', entryId: 'e', settingsKey: 's' },
  overwritePolicy: 'fill_untranslated',
  options: {},
  budget: {},
  stateVersion: 7,
  createdAt: 1,
  updatedAt: 2,
  workTitle: 'Kiếm Lai',
  modelLabel: 'Gemini · Flash',
  counts: {
    queued: 0,
    running: 0,
    waiting_user: 0,
    completed: 29,
    failed: 1,
    skipped: 0,
    cancelled: 0
  },
  usage: null,
  ...patch
})

/** Server rendering reads zustand's initial state, so copy the live state into it first. */
function render(): string {
  Object.assign(useTaskStore.getInitialState(), useTaskStore.getState())
  return renderToStaticMarkup(createElement(TaskList, { onOpenChapter: () => {} }))
}

function bridge(tasks: AgentTaskSummary[]) {
  let changed: (event: AgentTaskChanged) => void = () => {}
  const api = {
    list: vi.fn(async () => ({ ok: true, value: { tasks } })),
    get: vi.fn(),
    create: vi.fn(),
    control: vi.fn(async () => ({ ok: true, value: tasks[0] })),
    quality: vi.fn(async () => ({
      ok: true,
      value: { taskId: 'k1', openCount: 0, items: [] } as TaskQualityView
    })),
    dismiss: vi.fn(async () => ({ ok: true, value: undefined })),
    onChanged: vi.fn((listener: (event: AgentTaskChanged) => void) => {
      changed = listener
      return () => {}
    })
  }
  ;(globalThis as unknown as { window: unknown }).window = { mira: { agent: { tasks: api } } }
  return { api, emit: (event: AgentTaskChanged) => changed(event) }
}

describe('TaskList', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  it('shows 29 of 30 as partially done with the failed chapter, never as all done', async () => {
    bridge([summary()])
    await useTaskStore.getState().refresh()
    const html = render()
    expect(html).toContain('Xong một phần')
    expect(html).toContain('29/30 chương · 1 lỗi')
    expect(html).not.toContain('30/30')
    expect(html).toContain('aria-label="Tác vụ dịch Kiếm Lai: 29/30 chương · 1 lỗi"')
    expect(html).toContain('Thử lại mục lỗi')
    expect(html).not.toContain('Tạm dừng')
    expect(html).toContain('— (Provider không báo lượng dùng)')
    expect(html).toContain('aria-live="polite"')
  })

  it('offers only the controls a running task accepts', async () => {
    bridge([summary({ state: 'running' })])
    await useTaskStore.getState().refresh()
    const html = render()
    expect(html).toContain('Tạm dừng')
    expect(html).toContain('Hủy')
    expect(html).not.toContain('Thử lại')
    expect(html).not.toContain('Tiếp tục')
  })

  it('offers "Xem ngữ cảnh" on a task waiting for context review', async () => {
    bridge([summary({ state: 'waiting_user', reason: 'context_review' })])
    await useTaskStore.getState().refresh()
    Object.assign(useTaskStore.getInitialState(), useTaskStore.getState())
    const html = renderToStaticMarkup(
      createElement(TaskList, { onOpenChapter: () => {}, onReviewContext: () => {} })
    )
    expect(html).toContain('Xem ngữ cảnh')
    expect(html).toContain('cần duyệt ngữ cảnh')
    expect(render()).not.toContain('Xem ngữ cảnh')
  })

  it('sends commands with the version it saw and refetches and announces on a change event', async () => {
    const { api, emit } = bridge([summary({ state: 'running' })])
    await useTaskStore.getState().refresh()
    const stop = useTaskStore.getState().listen()
    await useTaskStore.getState().control('k1', 'pause')
    expect(api.control).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'k1', command: 'pause', stateVersion: 7 })
    )
    const calls = api.list.mock.calls.length
    emit({ taskId: 'k1', workId: 'w1', state: 'paused', stateVersion: 8 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.list.mock.calls.length).toBe(calls + 1)
    expect(useTaskStore.getState().announcement).toBe('Tác vụ dịch Kiếm Lai: Tạm dừng.')
    stop()
  })

  it('lists steering with where it applies, each pinned instruction, and steers from the form', async () => {
    const { api } = bridge([summary({ state: 'paused', reason: 'user' })])
    const item = (n: number, instruction: string | null | undefined) => ({
      id: 'i' + n,
      taskId: 'k1',
      ordinal: n,
      chapterId: 'c' + n,
      state: instruction === undefined ? 'queued' : 'completed',
      reason: null,
      runKey: instruction === undefined ? null : 'task:i' + n,
      sourceRev: null,
      expectedTargetRev: null,
      skippedSegments: [],
      progress: null,
      contextChanged: false,
      stateVersion: 1,
      createdAt: 1,
      updatedAt: 1,
      chapterLabel: 'Chương ' + n,
      ...(instruction === undefined ? {} : { instruction })
    })
    api.get.mockResolvedValue({
      ok: true,
      value: {
        task: summary({ state: 'paused', reason: 'user' }),
        items: [item(1, null), item(2, 'B'), item(3, undefined)],
        steerings: [
          {
            id: 's1',
            taskId: 'k1',
            requestedChapterId: 'c1',
            resolvedFromItemId: 'i2',
            kind: 'instruction',
            instructionText: 'B',
            contextRef: null,
            state: 'applied',
            createdAt: 1,
            updatedAt: 1,
            requestedLabel: 'Chương 1',
            effectiveLabel: 'Chương 2'
          }
        ],
        currentInstruction: 'B'
      }
    })
    ;(api as unknown as { steer: unknown }).steer = vi.fn(async () => ({
      ok: true,
      value: { effectiveFrom: { itemId: 'i3', chapterId: 'c3', chapterLabel: 'Chương 3' } }
    }))
    await useTaskStore.getState().refresh()
    await useTaskStore.getState().expand('k1')
    const html = render()
    expect(html).toContain('yêu cầu từ Chương 1 · áp dụng từ Chương 2')
    expect(html).toContain('Đã áp dụng')
    expect(html).toContain('Không có chỉ dẫn')
    expect(html).toContain('Chỉ dẫn: B')
    expect(html).toContain('Áp dụng điều chỉnh')

    expect(await useTaskStore.getState().steer('k1', 2, 'C')).toBe(true)
    expect((api as unknown as { steer: ReturnType<typeof vi.fn> }).steer).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'k1',
        chapterNumber: 2,
        change: { kind: 'instruction', text: 'C' }
      })
    )
    expect(useTaskStore.getState().announcement).toBe('Điều chỉnh áp dụng từ Chương 3.')
  })

  it('shows open quality warnings by item with a written label, N/A, and refetches after a dismissal', async () => {
    const { api } = bridge([summary({ state: 'completed' })])
    const finding = {
      ruleCode: 'glossary.missing_target' as const,
      ruleVersion: 1,
      chapterId: 'c1',
      segmentId: 's1',
      paragraphIndex: 0,
      message: 'Bản gốc có "dragon" nhưng bản dịch không có "rồng".',
      evidence: 'dragon → rồng'
    }
    api.get.mockResolvedValue({
      ok: true,
      value: {
        task: summary({ state: 'completed' }),
        items: [],
        steerings: [],
        currentInstruction: null
      }
    })
    api.quality.mockResolvedValueOnce({
      ok: true,
      value: {
        taskId: 'k1',
        openCount: 1,
        items: [
          {
            itemId: 'i1',
            chapterId: 'c1',
            chapterLabel: 'Chương 1',
            status: 'checked',
            findings: [finding]
          },
          { itemId: 'i2', chapterId: 'c2', chapterLabel: 'Chương 2', status: 'na', findings: [] }
        ]
      }
    })
    await useTaskStore.getState().refresh()
    await useTaskStore.getState().expand('k1')
    const html = render()
    expect(html).toContain('Cảnh báo chất lượng: 1 đang mở')
    expect(html).toContain('Cảnh báo · Thiếu thuật ngữ')
    expect(html).toContain('Bằng chứng: dragon → rồng')
    expect(html).toContain('Chương 2: N/A')
    expect(html).not.toMatch(/100%|đúng hoàn toàn/)

    await useTaskStore.getState().dismiss('k1', 'i1', finding, ' báo nhầm ')
    expect(api.dismiss).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'k1',
        itemId: 'i1',
        segmentId: 's1',
        ruleVersion: 1,
        reason: 'báo nhầm'
      })
    )
    expect(useTaskStore.getState().quality.k1?.openCount).toBe(0)
    expect(render()).toContain('Chưa có chương nào để kiểm')
  })
})
