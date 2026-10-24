import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTaskChanged, AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import { resetAllStores } from '../../../lib/testing/resetStores'
import type { TaskQualityView } from '../../../../../shared/contracts/taskQuality'
import { useTaskStore } from '../store/taskStore'
import { TaskList } from './TaskList'
import { TaskDetail, type DetailTab } from './TaskDetail'

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
function render(props: Record<string, unknown> = {}): string {
  Object.assign(useTaskStore.getInitialState(), useTaskStore.getState())
  return renderToStaticMarkup(createElement(TaskList, { onOpenChapter: () => {}, ...props }))
}

/** The same screen opened on task k1's page, as arriving from a link does. */
const renderOpen = (props: Record<string, unknown> = {}): string =>
  render({ initialTaskId: 'k1', ...props })

/** The chosen task's pane on its own, opened on a tab: the tabs show one panel at a time. */
function renderDetail(initialTab: DetailTab, props: Record<string, unknown> = {}): string {
  Object.assign(useTaskStore.getInitialState(), useTaskStore.getState())
  const state = useTaskStore.getState()
  return renderToStaticMarkup(
    createElement(TaskDetail, {
      task: state.tasks[0],
      detail: state.details.k1,
      quality: state.quality.k1,
      initialTab,
      onOpenChapter: () => {},
      ...props
    })
  )
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

const day = new Date(2026, 9, 23, 12).getTime()

describe('TaskList (Activity screen)', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  it('shows a completed 12-chapter task as one quiet row, with no bar, no chapter list and no green badge', async () => {
    const counts = {
      queued: 0,
      running: 0,
      waiting_user: 0,
      completed: 12,
      failed: 0,
      skipped: 0,
      cancelled: 0
    }
    bridge([summary({ state: 'completed', counts, updatedAt: Date.now() })])
    await useTaskStore.getState().refresh()
    const html = render()
    expect(html).toContain('title="Dịch 12 chương · Kiếm Lai"')
    expect(html).toContain('aria-label="Các chương của tác vụ dịch Kiếm Lai: 12/12 chương"')
    expect(html).toContain('Xong')
    expect(html).not.toContain('role="progressbar"')
    expect(html).not.toContain('Hoàn tất')
    expect(html).not.toContain('Các chương của tác vụ"')
  })
  it('lists a failed task above the running one', async () => {
    bridge([
      summary({ id: 'run', workTitle: 'Chạy', state: 'running', updatedAt: day }),
      summary({
        id: 'bad',
        workTitle: 'Lỗi',
        state: 'failed',
        reason: 'provider',
        updatedAt: day - 1
      })
    ])
    await useTaskStore.getState().refresh()
    const html = render()
    const bad = html.indexOf('title="Dịch 30 chương · Lỗi"')
    expect(bad).toBeGreaterThan(-1)
    expect(bad).toBeLessThan(html.indexOf('title="Dịch 30 chương · Chạy"'))
    // The table names its columns and gives way to a narrower screen by its own width.
    for (const column of ['Trạng thái', 'Hoạt động', 'Tạo bởi', 'Chương'])
      expect(html).toContain(column)
    expect(html).toContain('@container')
    expect(html).toContain('@min-[880px]:table-cell')
  })
  it('offers retrying failures in the row and asks before running everything again', async () => {
    bridge([summary()])
    await useTaskStore.getState().refresh()
    const row = render()
    expect(row).toContain('aria-label="Chạy lại chương lỗi: Kiếm Lai"')
    const page = renderOpen()
    expect(page).toContain('Chạy lại tất cả')
    expect(page).toContain('Chạy lại chương lỗi')
    // Nothing overwrites until the person confirms.
    expect(page).not.toContain('ghi đè')
  })
})

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
    const page = renderOpen()
    expect(page).toContain('aria-label="Tác vụ dịch Kiếm Lai: 29/30 chương · 1 lỗi"')
    expect(page).toContain('— (Provider không báo lượng dùng)')
    expect(page).not.toContain('Tạm dừng')
    expect(page).toContain('aria-live="polite"')
  })
  it('offers only the controls a running task accepts', async () => {
    bridge([summary({ state: 'running' })])
    await useTaskStore.getState().refresh()
    const row = render()
    expect(row).toContain('aria-label="Tạm dừng: Kiếm Lai"')
    expect(row).not.toContain('Thử lại')
    expect(row).not.toContain('Tiếp tục')
    const page = renderOpen()
    expect(page).toContain('Tạm dừng')
    expect(page).toContain('Hủy')
    expect(page).not.toContain('Thử lại')
    expect(page).not.toContain('Tiếp tục')
  })
  it('offers "Xem ngữ cảnh" on a task waiting for context review', async () => {
    bridge([summary({ state: 'waiting_user', reason: 'context_review' })])
    await useTaskStore.getState().refresh()
    const html = renderOpen({ onReviewContext: () => {} })
    expect(html).toContain('Xem ngữ cảnh')
    expect(html).toContain('cần duyệt ngữ cảnh')
    expect(renderOpen()).not.toContain('Xem ngữ cảnh')
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
    const chapters = renderDetail('chapters')
    expect(chapters).not.toContain('Không có chỉ dẫn')
    // Only the chapter that has an instruction gets the marker; its text opens on demand.
    expect(chapters.match(/>Chỉ dẫn</g)).toHaveLength(1)
    expect(chapters).not.toContain('Chỉ dẫn: B')

    const how = renderDetail('steering')
    expect(how).toContain('yêu cầu từ Chương 1 · áp dụng từ Chương 2')
    expect(how).toContain('Đã áp dụng')
    expect(how).toContain('Chỉ dẫn hiện tại')
    expect(how).toContain('“B”')
    // The form stays closed until asked for.
    expect(how).toContain('Đổi chỉ dẫn dịch…')
    expect(how).not.toContain('Áp dụng từ Chương')

    expect(await useTaskStore.getState().steer('k1', 2, 'C')).toBe(true)
    expect((api as unknown as { steer: ReturnType<typeof vi.fn> }).steer).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'k1',
        chapterNumber: 2,
        change: { kind: 'instruction', text: 'C' }
      })
    )
    expect(useTaskStore.getState().announcement).toBe('Điều chỉnh áp dụng từ Chương 3.')

    // The form names a chapter by id, so nobody types a number.
    expect(await useTaskStore.getState().steer('k1', { chapterId: 'c3' }, 'D')).toBe(true)
    expect((api as unknown as { steer: ReturnType<typeof vi.fn> }).steer).toHaveBeenLastCalledWith(
      expect.objectContaining({ chapterId: 'c3', change: { kind: 'instruction', text: 'D' } })
    )
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
    const html = renderDetail('warnings')
    expect(html).toContain('Cảnh báo (1)')
    expect(html).toContain('Cảnh báo chất lượng: 1 đang mở')
    expect(html).toContain('Cảnh báo · Thiếu thuật ngữ')
    expect(html).toContain('Bằng chứng: dragon → rồng')
    // A chapter with nothing to check is counted once, not named with an "N/A" line each.
    expect(html).toContain('1 chương chưa dịch nên chưa kiểm')
    expect(html).not.toContain('N/A')
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
    expect(renderDetail('warnings')).toContain('Chưa có chương nào để kiểm')
  })
})

describe('TaskList errors', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  const failedItem = (n: number, error: unknown) => ({
    id: `i${n}`,
    taskId: 'k1',
    ordinal: n,
    chapterId: `c${n}`,
    state: 'failed',
    reason: 'provider',
    runKey: `task:i${n}`,
    sourceRev: null,
    expectedTargetRev: null,
    skippedSegments: [],
    progress: null,
    contextChanged: false,
    stateVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    chapterLabel: `Chương ${n}`,
    instruction: null,
    lastRun: {
      operationId: `o${n}`,
      startedAt: 1000,
      endedAt: 2000,
      state: 'failed',
      usage: null,
      error
    }
  })

  const rateLimited = {
    code: 'rate_limited',
    scope: 'chapter',
    what: 'Chương một bị giới hạn tốc độ',
    retryable: true,
    retryAfterMs: 30_000,
    options: ['retry_now', 'ask_assistant']
  }

  async function open(items: unknown[], state: AgentTaskSummary['state'] = 'failed') {
    const { api } = bridge([summary({ state, reason: 'provider' })])
    api.get.mockResolvedValue({
      ok: true,
      value: {
        task: summary({ state }),
        items,
        steerings: [],
        currentInstruction: null
      }
    })
    await useTaskStore.getState().refresh()
    await useTaskStore.getState().expand('k1')
    Object.assign(useTaskStore.getInitialState(), useTaskStore.getState())
    return (props: Record<string, unknown> = {}) => renderOpen(props)
  }

  it('groups chapters failing for the same cause into one line and keeps the four parts', async () => {
    const render = await open([1, 2, 3].map((n) => failedItem(n, rateLimited)))
    const html = render({ onAskAssistant: () => {} })
    expect(html).toContain('3 chương chờ hạn mức')
    expect(html).toContain('Cảnh báo · chờ hạn mức')
    expect(html).toContain('Vì sao:')
    expect(html).toContain('Thử lại được lúc')
    expect(html).toContain('Bạn có thể:')
    expect(html).toContain('Thử ngay')
    expect(html).toContain('Hỏi trợ lý AI')
    // No app action was claimed: `tried` is empty, so there is no "App đã" line.
    expect(html).not.toContain('App đã:')
  })

  it('offers "Mở Kết nối AI" for a key error only where the screen can open it', async () => {
    const auth = {
      ...rateLimited,
      code: 'auth',
      scope: 'task',
      what: 'Cả tác vụ dừng: bị từ chối khóa API',
      retryable: false,
      options: ['open_connections', 'ask_assistant']
    }
    const render = await open([failedItem(1, auth)])
    expect(render()).not.toContain('Mở Kết nối AI')
    const html = render({ onOpenConnections: () => {} })
    expect(html).toContain('Lỗi · bị từ chối khóa API')
    expect(html).toContain('Mở Kết nối AI')
  })

  it('names every chapter translating at once in the task header', async () => {
    const running = (n: number, startedAt: number) => ({
      ...failedItem(n, null),
      state: 'running',
      reason: null,
      lastRun: { ...failedItem(n, null).lastRun, startedAt, endedAt: null, state: 'running' }
    })
    const render = await open([running(4, 3000), running(5, 1000), running(7, 2000)], 'running')
    expect(render()).toContain('Đang dịch Chương 4, Chương 5, Chương 7')
  })

  it('shows an old { code, message } error as unclassified with retry and ask only', async () => {
    const render = await open([failedItem(1, { code: 'provider', message: 'Hết hạn mức' })])
    const html = render({ onAskAssistant: () => {} })
    expect(html).toContain('Lỗi không rõ loại')
    expect(html).toContain('Hết hạn mức')
    expect(html).toContain('Hỏi trợ lý AI')
    expect(html).not.toContain('Mở Kết nối AI')
  })
})

describe('TaskList layout', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  it('opens on the table, with a way into a task and no detail until one is opened', async () => {
    bridge([summary({ state: 'running' })])
    await useTaskStore.getState().refresh()
    const html = render()
    expect(html).toContain('aria-label="Lọc hoạt động theo tên tác phẩm hoặc model"')
    expect(html).toContain('data-task-id="k1"')
    expect(html).not.toContain('aria-label="Chi tiết tác vụ"')
  })

  it('opens a task on its own page, which a breadcrumb leaves', async () => {
    bridge([summary({ state: 'running' })])
    await useTaskStore.getState().refresh()
    const html = renderOpen()
    expect(html).toContain('aria-label="Đường dẫn điều hướng"')
    expect(html).toContain('Về danh sách')
    expect(html).not.toContain('aria-label="Lọc hoạt động theo tên tác phẩm hoặc model"')
  })

  it('offers "Dịch các chương…" in an empty work, and no button where it cannot start one', async () => {
    bridge([])
    await useTaskStore.getState().refresh()
    expect(render({ onStartTranslate: () => {} })).toContain('Dịch các chương…')
    expect(render()).not.toContain('Dịch các chương…')
    expect(render()).toContain('Chưa có hoạt động')
  })

  it('leaves the chosen task out of the store once it is no longer on screen', async () => {
    bridge([summary()])
    await useTaskStore.getState().refresh()
    await useTaskStore.getState().expand('k1')
    useTaskStore.getState().collapse('k1')
    expect(useTaskStore.getState().details.k1).toBeUndefined()
  })
})

describe('steering form', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  const queued = (n: number) => ({
    id: 'i' + n,
    taskId: 'k1',
    ordinal: n,
    chapterId: 'c' + n,
    state: 'queued',
    reason: null,
    runKey: null,
    sourceRev: null,
    expectedTargetRev: null,
    skippedSegments: [],
    progress: null,
    contextChanged: false,
    stateVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    chapterLabel: 'Chương ' + n
  })

  async function open(state: AgentTaskSummary['state']) {
    const { api } = bridge([summary({ state })])
    api.get.mockResolvedValue({
      ok: true,
      value: {
        task: summary({ state }),
        items: [queued(3), queued(4)],
        steerings: [],
        currentInstruction: null
      }
    })
    await useTaskStore.getState().refresh()
    await useTaskStore.getState().expand('k1')
  }

  it('says what it does and that nothing is set yet, with the form closed', async () => {
    await open('running')
    const html = renderDetail('steering')
    expect(html).toContain(
      'Đổi chỉ dẫn dịch cho các chương chưa dịch. Chương đã dịch giữ nguyên bản cũ.'
    )
    expect(html).toContain('Chưa có chỉ dẫn.')
    expect(html).toContain('Đổi chỉ dẫn dịch…')
    expect(html).not.toContain('Chỉ dẫn mới')
  })

  it('is read only once the task is done', async () => {
    await open('completed')
    const html = renderDetail('steering')
    expect(html).toContain('Chưa có chỉ dẫn.')
    expect(html).not.toContain('Đổi chỉ dẫn dịch…')
  })
})

describe('task events', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
    vi.useRealTimers()
  })

  it('refetches the first event at once and folds the burst after it into one more', async () => {
    vi.useFakeTimers()
    const { api, emit } = bridge([summary({ state: 'running' })])
    await useTaskStore.getState().refresh()
    const stop = useTaskStore.getState().listen()
    const base = api.list.mock.calls.length
    for (let n = 0; n < 5; n++)
      emit({ taskId: 'k1', workId: 'w1', state: 'running', stateVersion: n })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.list.mock.calls.length).toBe(base + 1)
    await vi.advanceTimersByTimeAsync(600)
    expect(api.list.mock.calls.length).toBe(base + 2)
    stop()
  })
})

describe('context questions of a task', () => {
  it('links the questions its extraction left to the Glossary, and says nothing when there are none', async () => {
    const { api } = bridge([summary({ state: 'completed' })])
    const detail = (contextQuestions: number) => ({
      ok: true,
      value: {
        task: summary({ state: 'completed' }),
        items: [],
        steerings: [],
        currentInstruction: null,
        contextQuestions
      }
    })
    api.get.mockResolvedValue(detail(3))
    await useTaskStore.getState().refresh()
    await useTaskStore.getState().expand('k1')
    expect(renderDetail('chapters', { onReviewContext: () => {} })).toContain('3 câu hỏi ngữ cảnh')

    api.get.mockResolvedValue(detail(0))
    await useTaskStore.getState().expand('k1')
    expect(renderDetail('chapters', { onReviewContext: () => {} })).not.toContain(
      'câu hỏi ngữ cảnh'
    )
  })
})
