import { createHash, randomUUID } from 'node:crypto'
import type {
  AgentTargetChanged,
  AgentWriteIntent,
  ResolvedTarget
} from '../../../shared/contracts/agent'
import type {
  AgentTaskChanged,
  AgentTaskControlInput,
  AgentTaskCreateInput,
  AgentTaskDetailView,
  AgentTaskItemState,
  AgentTaskItemView,
  AgentTaskProgress,
  AgentTaskReason,
  AgentTaskState,
  AgentTaskSteeringView,
  AgentTaskSteerInput,
  AgentTaskSteerResult,
  AgentTaskSummary,
  SteeringContextRef,
  AgentTaskView,
  ContextStrategy
} from '../../../shared/contracts/agentTask'
import { TASK_ITEM_STATES } from '../../../shared/contracts/agentTask'
import type { TokenUsage } from '../../../shared/contracts/usage'
import { lookupModel } from '../../infra/providers/modelCatalog'
import type { AgentRepository } from '../../infra/storage/agentRepository'
import type { AgentTaskRepository } from '../../infra/storage/agentTaskRepository'
import { StorageError } from '../../infra/storage/errors'
import { createRunContext, getRunContext } from '../../infra/storage/translateRunContext'
import type { ConnectionService } from '../ai/connectionService'
import type { ContextExtractionService } from '../context/contextExtractionService'
import { parseSnapshot, takeContextSnapshot } from '../ai/translate/contextSnapshot'
import { changeDyadFrom } from '../../infra/storage/addressingEntries'
import { hasGlossary } from '../../infra/storage/contextEntries'
import type { QaDismissInput, TaskQualityView } from '../../../shared/contracts/taskQuality'
import { dismissFinding, readTaskQuality } from './taskQuality'
import type { LibraryStore } from '../library/library'
import { aggregateTokenUsage, calculateTurnCost } from './agentUsage'
import { defaultModelSelection, digestPayload } from './agentService'
import {
  MissingSourceError,
  runChapterTranslation,
  type ChapterTranslationRunResult,
  type RunStopReason
} from './chapterTranslationRunner'
import type { AgentWriteCoordinator } from './writeCoordinator'

export interface AgentTaskServiceOptions {
  library: LibraryStore
  connections: ConnectionService
  tasks: AgentTaskRepository
  operations: AgentRepository
  writeCoordinator: AgentWriteCoordinator
  now?: () => number
  newId?: () => string
  /** The chapter runner; tests swap in a scripted one. */
  run?: typeof runChapterTranslation
  /** Term extraction for `extract_then_review` tasks. */
  extraction?: ContextExtractionService
}

/** Where a task's events go: set once windows exist (`registerIpc`). */
export interface AgentTaskOutlets {
  /** Sends a write intent to every open window and returns the ids it reached. */
  publishIntent(intent: AgentWriteIntent): number[]
  changed(event: AgentTaskChanged): void
  /** A run of a chapter ended: open editors reload the target and unlock, lists refetch. */
  targetChanged?(event: AgentTargetChanged): void
}

interface RunningItem {
  itemId: string
  taskId: string
  workId: string
  chapterId: string
  controller: AbortController
  stop: RunStopReason | null
  done: Promise<void>
  /** Calls started by the term extraction now running before the item; `null` outside it. */
  extractCalls: number | null
}

/** Tasks from before the choice existed translated with the approved context only. */
export const contextStrategyOf = (task: AgentTaskView): ContextStrategy =>
  task.options.contextStrategy === 'extract_then_review' ? 'extract_then_review' : 'approved_only'

/** Task states that take no more steering. */
const STEERING_CLOSED: readonly AgentTaskState[] = [
  'cancelling',
  'cancelled',
  'completed',
  'partially_completed',
  'failed'
]

/** A stable UUID-shaped id from a seed (the derived pair id of a steering). */
function uuidFrom(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const EMPTY_COUNTS = (): Record<AgentTaskItemState, number> =>
  Object.fromEntries(TASK_ITEM_STATES.map((state) => [state, 0])) as Record<
    AgentTaskItemState,
    number
  >

/**
 * Durable chapter-range translation (change `add-durable-translation-tasks`). One item runs at a time
 * across the app; the scheduler wakes on events (create, Continue, Retry, an item ending) and never
 * polls. Every run of an item is a new operation; work DB first, library DB after, and the journal wins.
 */
export class AgentTaskService {
  private readonly library: LibraryStore
  private readonly connections: ConnectionService
  private readonly tasks: AgentTaskRepository
  private readonly operations: AgentRepository
  private readonly writeCoordinator: AgentWriteCoordinator
  private readonly now: () => number
  private readonly newId: () => string
  private readonly run: typeof runChapterTranslation
  private readonly extraction: ContextExtractionService | null
  private outlets: AgentTaskOutlets | null = null
  private running: RunningItem | null = null
  private wakeQueued = false
  private closed = false

  constructor(options: AgentTaskServiceOptions) {
    this.library = options.library
    this.connections = options.connections
    this.tasks = options.tasks
    this.operations = options.operations
    this.writeCoordinator = options.writeCoordinator
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? randomUUID
    this.run = options.run ?? runChapterTranslation
    this.extraction = options.extraction ?? null
  }

  connect(outlets: AgentTaskOutlets): void {
    this.outlets = outlets
  }

  // ---------------------------------------------------------------------------------------------------
  // Reading

  list(filter: { workId?: string } = {}): AgentTaskSummary[] {
    return this.tasks.listTasks(filter).map((task) => this.summary(task))
  }

  /** Quality warnings of every item, from each item's pinned snapshot; read-only (change `add-translation-task-qa`). */
  quality(taskId: string): TaskQualityView {
    const { task, items } = this.get(taskId)
    return readTaskQuality(this.library, task, items)
  }

  /** "Ignore this warning" for a paragraph's current text. Changes neither the text nor any state. */
  dismiss(input: QaDismissInput): void {
    const task = this.tasks.getTask(input.taskId)
    if (!task) throw new StorageError('not_found', 'Không tìm thấy tác vụ.')
    dismissFinding(this.library, task.workId, this.itemOf(task, input.itemId), input, this.now())
  }

  get(taskId: string): AgentTaskDetailView {
    const task = this.tasks.getTask(taskId)
    if (!task) throw new StorageError('not_found', 'Không tìm thấy tác vụ.')
    const labels = this.chapterLabels(task.workId)
    const items = this.tasks.listItems(taskId)
    const pinned = this.pinnedInstructions(task.workId, items)
    const labelOf = (chapterId: string) => labels.get(chapterId) ?? 'Chương đã xóa'
    const itemChapter = new Map(items.map((item) => [item.id, item.chapterId]))
    const steerings = this.tasks.listSteerings(taskId)
    return {
      task: this.summary(task),
      items: items.map((item) => ({
        ...item,
        chapterLabel: labelOf(item.chapterId),
        ...(item.runKey ? { instruction: pinned.get(item.id) ?? null } : {})
      })),
      steerings: steerings.map((steering) => ({
        ...steering,
        requestedLabel: labelOf(steering.requestedChapterId),
        effectiveLabel: labelOf(itemChapter.get(steering.resolvedFromItemId) ?? '')
      })),
      currentInstruction:
        steerings.filter((s) => s.kind === 'instruction' && s.state !== 'superseded').at(-1)
          ?.instructionText ?? null
    }
  }

  /** What each pinned item's snapshot holds as instruction; a missing work file reads as none. */
  private pinnedInstructions(
    workId: string,
    items: AgentTaskItemView[]
  ): Map<string, string | null> {
    try {
      return this.library.withWork(workId, (db) => {
        const out = new Map<string, string | null>()
        for (const item of items) {
          const stored = item.runKey ? getRunContext(db, item.runKey) : null
          if (stored) out.set(item.id, parseSnapshot(stored.snapshotJson).instruction ?? null)
        }
        return out
      })
    } catch {
      return new Map()
    }
  }

  /** A chat write into a chapter a task item is translating right now is a conflict. */
  isChapterBusy(workId: string, chapterId: string): boolean {
    return this.running?.workId === workId && this.running.chapterId === chapterId
  }

  private summary(task: AgentTaskView): AgentTaskSummary {
    const counts = EMPTY_COUNTS()
    for (const item of this.tasks.listItems(task.id)) counts[item.state]++
    let workTitle = 'Tác phẩm đã xóa'
    try {
      workTitle = this.library.get(task.workId).title
    } catch {
      // The work file is gone; the task still reads.
    }
    let modelLabel = 'Model không còn trong cài đặt'
    try {
      const { connection, entry } = this.connections.translator(
        task.model.connectionId,
        task.model.entryId
      )
      modelLabel = connection.name + ' · ' + entry.name
    } catch {
      // Disabled or deleted connection: the task still reads.
    }
    return {
      ...task,
      workTitle,
      modelLabel,
      counts,
      usage: aggregateTokenUsage(this.tasks.taskUsages(task.id)),
      extracting:
        this.running?.taskId === task.id && this.running.extractCalls !== null
          ? { calls: this.running.extractCalls }
          : undefined
    }
  }

  private chapterLabels(workId: string): Map<string, string> {
    try {
      return new Map(
        this.library
          .listChapters(workId)
          .map((chapter) => [chapter.id, chapter.title || `Chương ${chapter.number}`])
      )
    } catch {
      return new Map()
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Creating and controlling

  create(input: AgentTaskCreateInput & { originTurnId?: string; sourceTaskId?: string }): {
    task: AgentTaskView
    created: boolean
  } {
    if (this.closed) throw new StorageError('cancelled', 'Ứng dụng đang đóng.')
    const chapters = this.library.listChapters(input.workId)
    let chapterIds: string[]
    if (input.range) {
      chapterIds = chapters
        .filter(
          (chapter) => chapter.number >= input.range!.from && chapter.number <= input.range!.to
        )
        .map((chapter) => chapter.id)
    } else {
      const wanted = new Set(input.chapterIds ?? [])
      const known = new Set(chapters.map((chapter) => chapter.id))
      const missing = [...wanted].filter((id) => !known.has(id))
      if (missing.length > 0) throw new StorageError('not_found', 'Có chương không thuộc tác phẩm.')
      chapterIds = chapters.filter((chapter) => wanted.has(chapter.id)).map((chapter) => chapter.id)
    }
    if (chapterIds.length === 0)
      throw new StorageError('validation', 'Không có chương nào trong phạm vi.')

    const selection = input.modelSelection ?? defaultModelSelection(this.connections)
    const translator = this.connections.translator(selection.connectionId, selection.entryId)
    if (selection.settingsKey && selection.settingsKey !== translator.settingsKey) {
      throw new StorageError('conflict', 'Cấu hình model đã đổi. Vui lòng gửi lại lệnh.')
    }
    const model = {
      connectionId: selection.connectionId,
      entryId: selection.entryId,
      settingsKey: translator.settingsKey
    }
    // Default (2026-10-14): a work with no glossary yet extracts first, unless the command says otherwise.
    const contextStrategy: ContextStrategy =
      input.contextStrategy ??
      (this.library.withWork(input.workId, (db) => hasGlossary(db))
        ? 'approved_only'
        : 'extract_then_review')
    const created = this.tasks.createTask({
      id: this.newId(),
      workId: input.workId,
      originTurnId: input.originTurnId,
      sourceTaskId: input.sourceTaskId,
      clientCommandId: input.clientCommandId,
      payloadDigest: digestPayload({
        workId: input.workId,
        chapterIds,
        model: selection,
        budget: input.budget ?? {},
        sourceTaskId: input.sourceTaskId,
        contextStrategy: input.contextStrategy
      }),
      model,
      budget: input.budget,
      options: { contextStrategy },
      chapterIds,
      newId: this.newId,
      now: this.now()
    })
    if (created.created) {
      this.notify(created.task)
      this.wake()
    }
    return created
  }

  control(input: AgentTaskControlInput): AgentTaskView {
    const task = this.tasks.getTask(input.taskId)
    if (!task) throw new StorageError('not_found', 'Không tìm thấy tác vụ.')
    if (task.stateVersion !== input.stateVersion) {
      throw new StorageError('conflict', 'Tác vụ đã đổi trạng thái; hãy tải lại rồi thử lại.')
    }
    const now = this.now()
    const version = { now, expectedVersion: task.stateVersion }
    let next: AgentTaskView

    switch (input.command) {
      case 'pause':
        if (task.state === 'running') {
          next = this.tasks.transitionTask(task.id, 'pausing', version)
          if (this.running?.taskId === task.id) this.running.stop = 'pause'
          else next = this.tasks.transitionTask(task.id, 'paused', { now, reason: 'user' })
        } else {
          next = this.tasks.transitionTask(task.id, 'paused', { ...version, reason: 'user' })
        }
        break
      case 'continue':
        next = this.tasks.transaction(() => {
          const moved = this.tasks.transitionTask(task.id, 'queued', version)
          this.requeue(task.id, ['waiting_user'], now)
          return moved
        })
        break
      case 'retry':
        next = this.tasks.transaction(() => {
          const moved = this.tasks.transitionTask(task.id, 'queued', version)
          this.requeue(task.id, ['failed', 'waiting_user'], now)
          return moved
        })
        break
      case 'cancel':
        if (task.state === 'running' || task.state === 'pausing') {
          next = this.tasks.transitionTask(task.id, 'cancelling', version)
          if (this.running?.taskId === task.id) this.running.controller.abort()
          else next = this.finishCancel(task.id)
        } else {
          next = this.tasks.transaction(() => {
            const moved = this.tasks.transitionTask(task.id, 'cancelled', version)
            this.cancelOpenItems(task.id, now)
            return moved
          })
        }
        break
      case 'skip_item': {
        const item = this.itemOf(task, input.itemId)
        this.tasks.transitionItem(item.id, 'skipped', { now })
        next = this.tasks.getTask(task.id)!
        break
      }
      case 'skip_refused': {
        const item = this.itemOf(task, input.itemId)
        if (item.state !== 'failed' || item.reason !== 'refused') {
          throw new StorageError('conflict', 'Mục này không có đoạn bị từ chối để bỏ qua.')
        }
        const refused = this.refusedIdsOf(item)
        this.tasks.transitionItem(item.id, 'completed', {
          now,
          patch: { skippedSegments: [...new Set([...item.skippedSegments, ...refused])] }
        })
        next = this.tasks.getTask(task.id)!
        break
      }
      case 'run_again': {
        const chapterIds = this.tasks.listItems(task.id).map((item) => item.chapterId)
        return this.create({
          clientCommandId: input.clientCommandId,
          contextStrategy: contextStrategyOf(task),
          workId: task.workId,
          chapterIds,
          modelSelection: { connectionId: task.model.connectionId, entryId: task.model.entryId },
          budget: task.budget,
          sourceTaskId: task.id
        }).task
      }
    }
    this.notify(next)
    this.wake()
    return next
  }

  private itemOf(task: AgentTaskView, itemId: string | undefined): AgentTaskItemView {
    const item = itemId ? this.tasks.getItem(itemId) : null
    if (!item || item.taskId !== task.id)
      throw new StorageError('not_found', 'Không tìm thấy mục tác vụ.')
    return item
  }

  private refusedIdsOf(item: AgentTaskItemView): string[] {
    const operationId = this.tasks.latestOperationId(item.id)
    const result = operationId ? this.operations.getOperation(operationId)?.result : null
    const ids = (result as { refusedIds?: unknown } | null)?.refusedIds
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  }

  private requeue(taskId: string, from: AgentTaskItemState[], now: number): void {
    for (const item of this.tasks.listItems(taskId)) {
      if (from.includes(item.state)) this.tasks.transitionItem(item.id, 'queued', { now })
    }
  }

  private cancelOpenItems(taskId: string, now: number): void {
    for (const item of this.tasks.listItems(taskId)) {
      if (item.state === 'queued' || item.state === 'waiting_user' || item.state === 'running') {
        this.tasks.transitionItem(item.id, 'cancelled', { now })
      }
    }
  }

  private finishCancel(taskId: string): AgentTaskView {
    const now = this.now()
    return this.tasks.transaction(() => {
      this.cancelOpenItems(taskId, now)
      return this.tasks.transitionTask(taskId, 'cancelled', { now })
    })
  }

  // ---------------------------------------------------------------------------------------------------
  // Steering (change `add-agent-steering`)

  listSteerings(taskId: string): AgentTaskSteeringView[] {
    return this.tasks.listSteerings(taskId)
  }

  /**
   * Accepts or refuses a steering command at once. It runs on the main thread between item starts, and an
   * item pins its snapshot and turns `running` in one synchronous step, so every item sees all of a
   * steering or none of it. A refusal throws and writes nothing.
   */
  steer(input: AgentTaskSteerInput): AgentTaskSteerResult {
    const digest = digestPayload({
      taskId: input.taskId,
      chapterNumber: input.chapterNumber,
      chapterId: input.chapterId,
      change: input.change
    })
    const task = this.tasks.getTask(input.taskId)
    if (!task) throw new StorageError('not_found', 'Không tìm thấy tác vụ.')
    const labels = this.chapterLabels(task.workId)
    const items = this.tasks.listItems(task.id)
    const effectiveOf = (itemId: string) => {
      const item = items.find((each) => each.id === itemId)!
      return {
        itemId,
        chapterId: item.chapterId,
        chapterLabel: labels.get(item.chapterId) ?? 'Chương đã xóa'
      }
    }

    const prior = this.tasks.getSteeringByCommand(input.clientCommandId)
    if (prior) {
      if (prior.digest !== digest || prior.taskId !== task.id) {
        throw new StorageError('conflict', 'Mã lệnh đã dùng cho một yêu cầu khác.')
      }
      const { digest: _digest, ...steering } = prior
      return { steering, effectiveFrom: effectiveOf(steering.resolvedFromItemId) }
    }

    if (STEERING_CLOSED.includes(task.state)) {
      throw new StorageError('conflict', 'Tác vụ đã kết thúc hoặc đang hủy; không nhận điều chỉnh.')
    }
    if (input.change.kind === 'third_person') {
      throw new StorageError(
        'validation',
        'Đại từ ngôi ba chưa có phạm vi chương; hãy sửa cho cả tác phẩm ở Ngữ cảnh.'
      )
    }
    const chapters = this.library.listChapters(task.workId)
    const requested = input.chapterId
      ? chapters.find((chapter) => chapter.id === input.chapterId)
      : chapters.find((chapter) => chapter.number === input.chapterNumber)
    const at = requested ? items.find((item) => item.chapterId === requested.id) : undefined
    if (!requested || !at) {
      throw new StorageError('validation', 'Chương yêu cầu không thuộc tác vụ này.')
    }
    // The first item no run has pinned: a running, finished or retried item keeps its snapshot.
    const from = items.find(
      (item) => item.ordinal >= at.ordinal && item.state === 'queued' && item.runKey === null
    )
    if (!from) {
      throw new StorageError('conflict', 'Không còn chương chưa chạy từ chương này trở đi.')
    }

    const now = this.now()
    const id = this.newId()
    let contextRef: SteeringContextRef | undefined
    if (input.change.kind === 'addressing') {
      const change = input.change
      // Work DB first; the pair id comes from the command, so a resend finds what it already wrote.
      contextRef = this.library.withWork(task.workId, (db) =>
        changeDyadFrom(
          db,
          {
            newDyadId: uuidFrom(`steering:${task.id}:${input.clientCommandId}`),
            sourceCharacterId: change.speakerCharacterId,
            targetCharacterId: change.listenerCharacterId,
            fromChapterId: from.chapterId,
            speakerPronoun: change.speakerPronoun,
            recipientPronoun: change.recipientPronoun,
            secondPerson: change.secondPerson
          },
          now
        )
      )
    }
    const steering = this.tasks.transaction(() => {
      if (input.change.kind === 'instruction') {
        const ordinal = new Map(items.map((item) => [item.id, item.ordinal]))
        for (const older of this.tasks.listSteerings(task.id)) {
          if (
            older.kind === 'instruction' &&
            older.state === 'accepted' &&
            ordinal.get(older.resolvedFromItemId)! >= from.ordinal
          ) {
            this.tasks.settleSteering(older.id, 'superseded', now)
          }
        }
      }
      return this.tasks.createSteering({
        id,
        taskId: task.id,
        clientCommandId: input.clientCommandId,
        digest,
        requestedChapterId: requested.id,
        resolvedFromItemId: from.id,
        kind: input.change.kind === 'instruction' ? 'instruction' : 'context_ref',
        instructionText: input.change.kind === 'instruction' ? input.change.text : undefined,
        contextRef,
        now
      })
    })
    this.notify(task)
    return { steering, effectiveFrom: effectiveOf(from.id) }
  }

  /**
   * The instruction an item pins: the latest instruction steering, not superseded, whose start is not
   * after the item. Each one holds the full text, so there is nothing to merge.
   */
  private instructionFor(item: AgentTaskItemView): AgentTaskSteeringView | null {
    const ordinal = new Map(
      this.tasks.listItems(item.taskId).map((each) => [each.id, each.ordinal])
    )
    return (
      this.tasks
        .listSteerings(item.taskId)
        .filter(
          (steering) =>
            steering.kind === 'instruction' &&
            steering.state !== 'superseded' &&
            (ordinal.get(steering.resolvedFromItemId) ?? Number.POSITIVE_INFINITY) <= item.ordinal
        )
        .at(-1) ?? null
    )
  }

  // ---------------------------------------------------------------------------------------------------
  // Scheduler

  /** Schedules one look at the queue; calls while a look is pending or an item runs collapse. */
  wake(): void {
    if (this.closed || this.running || this.wakeQueued) return
    this.wakeQueued = true
    queueMicrotask(() => {
      this.wakeQueued = false
      if (this.closed || this.running) return
      const item = this.tasks.nextQueuedItem()
      if (item) this.start(item)
    })
  }

  /** Resolves once nothing runs and nothing is queued; for tests and orderly shutdown. */
  async idle(): Promise<void> {
    for (;;) {
      await new Promise((resolve) => setImmediate(resolve))
      if (this.running) await this.running.done
      else if (!this.wakeQueued && !this.tasks.nextQueuedItem()) return
      else if (!this.wakeQueued) this.wake()
    }
  }

  private start(item: AgentTaskItemView): void {
    const task = this.tasks.getTask(item.taskId)!
    const controller = new AbortController()
    const running: RunningItem = {
      itemId: item.id,
      taskId: task.id,
      workId: task.workId,
      chapterId: item.chapterId,
      controller,
      stop: null,
      done: Promise.resolve(),
      extractCalls: null
    }
    this.running = running
    running.done = this.runItem(task, item, running)
      .catch((error: unknown) => {
        console.error('Task scheduler failed:', error instanceof Error ? error.message : error)
      })
      .finally(() => {
        if (this.running === running) this.running = null
        this.wake()
      })
  }

  private async runItem(
    task: AgentTaskView,
    item: AgentTaskItemView,
    running: RunningItem
  ): Promise<void> {
    const now = this.now()
    const starting = task.state === 'queued'
    if (starting) {
      task = this.tasks.transitionTask(task.id, 'running', { now })
      this.notify(task)
    }

    // The connection or its settings changed since the task was created: the user decides.
    let settingsKey: string | null = null
    try {
      settingsKey = this.connections.translator(
        task.model.connectionId,
        task.model.entryId
      ).settingsKey
    } catch {
      settingsKey = null
    }
    if (settingsKey !== task.model.settingsKey) {
      this.notify(this.tasks.transitionTask(task.id, 'waiting_user', { now, reason: 'provider' }))
      return
    }

    // Each start or Continue of an `extract_then_review` task scans the chapters no run scanned yet.
    if (starting && contextStrategyOf(task) === 'extract_then_review') {
      if (!(await this.extractTerms(task, item, running))) return
    }

    let source: { rev: number; content: string }
    let targetRev: number
    try {
      source = this.library.readText(task.workId, item.chapterId, 'source')
      targetRev = this.library.readText(task.workId, item.chapterId, 'target').rev
    } catch {
      this.tasks.transitionItem(item.id, 'running', { now })
      this.endItem(task.id, item.id, 'waiting_user', 'missing_raw')
      return
    }

    // Work DB first: pin the snapshot once; a crash between the two DBs reuses it.
    const runKey = item.runKey ?? `task:${item.id}`
    const steering = item.runKey === null ? this.instructionFor(item) : null
    const pinned = this.library.withWork(task.workId, (db) => {
      const existing = getRunContext(db, runKey)
      if (existing) return parseSnapshot(existing.snapshotJson).instruction ?? null
      const record = takeContextSnapshot(
        this.library,
        task.workId,
        item.chapterId,
        source.content,
        steering?.instructionText ?? undefined
      )
      createRunContext(db, {
        runKey,
        chapterId: item.chapterId,
        snapshotJson: record.json,
        snapshotHash: record.hash,
        createdAt: now
      })
      return record.snapshot.instruction ?? null
    })

    const target = this.chapterTarget(task.workId, item.chapterId)
    const operationId = this.newId()
    const sourceChanged = item.sourceRev !== null && item.sourceRev !== source.rev
    const priorOperations = this.tasks.attemptOperationIds(item.id)
    this.tasks.transaction(() => {
      this.tasks.transitionItem(item.id, 'running', {
        now,
        patch: { runKey, sourceRev: item.sourceRev ?? source.rev, expectedTargetRev: targetRev }
      })
      // First pin in the library: the steering the snapshot holds is now in use.
      if (steering?.state === 'accepted' && steering.instructionText === pinned) {
        this.tasks.settleSteering(steering.id, 'applied', now)
      }
      if (sourceChanged) return
      this.operations.createOperation({
        id: operationId,
        taskItemId: item.id,
        commandId: `task-run-${operationId}`,
        capability: 'translate_chapter',
        target,
        model: task.model,
        now
      })
      this.operations.transitionOperation(operationId, 'running', { now })
      this.tasks.addAttempt(item.id, operationId, now)
    })
    this.notify(this.tasks.getTask(task.id)!)
    if (sourceChanged) {
      // The source changed since the item first ran: no model call until the user decides.
      this.endItem(task.id, item.id, 'waiting_user', 'conflict')
      return
    }

    const gate = this.gateFor(task, operationId)
    let result: ChapterTranslationRunResult | null = null
    let error: unknown = null
    try {
      result = await this.run({
        library: this.library,
        connections: this.connections,
        workId: task.workId,
        chapterId: item.chapterId,
        operationId,
        modelSelection: task.model,
        runKey,
        policy: 'fill_untranslated',
        skipIds: item.skippedSegments,
        batchKeyPrefix: `item:${item.id}:`,
        priorBatch: (batchKey) => this.priorBatch(task.workId, priorOperations, batchKey),
        gate: gate.allow,
        shouldStop: () => running.stop,
        beforeCommit: () => this.flushEditors(operationId, target),
        onUsage: (usage, calls) => {
          gate.live(usage, calls)
          if (this.closed) return
          this.operations.transitionOperation(operationId, 'running', {
            now: this.now(),
            usage,
            result: { calls }
          })
          this.notify(task)
        },
        onProgress: (progress) => {
          if (this.closed) return
          this.tasks.updateItemProgress(
            item.id,
            this.progressOf(progress.completed, progress.total),
            this.now()
          )
          this.notify(this.tasks.getTask(task.id)!)
        },
        signal: running.controller.signal,
        now: this.now
      })
    } catch (caught) {
      error = caught
    }
    if (this.closed) return
    this.settleOperation(operationId, result, error, gate.calls())
    this.settleItem(task.id, item.id, result, error)
    // Sent even when nothing was written: the editor locked by the write intent unlocks on it.
    try {
      this.outlets?.targetChanged?.({
        target: { workId: task.workId, chapterId: item.chapterId, side: 'target' },
        lastAppliedRev:
          result?.lastAppliedRev ??
          this.library.readText(task.workId, item.chapterId, 'target').rev,
        operationId
      })
    } catch {
      // Best effort: the chapter may be gone; the task state is already written.
    }
  }

  /**
   * Term extraction before the first item (change `add-agent-context-workflow`), as an operation of
   * that item so its calls and usage count toward the task's caps. New `pending` entries put the task
   * in `waiting_user(context_review)` with every item still queued; `true` means go on with the item.
   */
  private async extractTerms(
    task: AgentTaskView,
    item: AgentTaskItemView,
    running: RunningItem
  ): Promise<boolean> {
    const extraction = this.extraction
    if (!extraction) return true
    const chapterIds = this.tasks.listItems(task.id).map((each) => each.chapterId)
    if (extraction.unscanned(task.workId, chapterIds).length === 0) return true

    const operationId = this.newId()
    const work = this.library.get(task.workId)
    this.tasks.transaction(() => {
      this.operations.createOperation({
        id: operationId,
        taskItemId: item.id,
        commandId: `task-extract-${operationId}`,
        capability: 'extract_terms',
        target: { kind: 'work', workId: task.workId, workLabel: work.title },
        model: task.model,
        now: this.now()
      })
      this.operations.transitionOperation(operationId, 'running', { now: this.now() })
    })
    const gate = this.gateFor(task, operationId)
    running.extractCalls = 0
    this.notify(task)
    try {
      const result = await extraction.extract({
        workId: task.workId,
        chapterIds,
        modelSelection: task.model,
        runId: operationId,
        gate: gate.allow,
        shouldStop: () => running.stop,
        signal: running.controller.signal,
        onUsage: (usage, calls) => {
          gate.live(usage, calls)
          if (this.closed) return
          running.extractCalls = calls
          this.operations.transitionOperation(operationId, 'running', {
            now: this.now(),
            usage,
            result: { calls }
          })
          this.notify(task)
        }
      })
      running.extractCalls = null
      if (this.closed) return false
      const now = this.now()
      this.operations.transitionOperation(
        operationId,
        result.state === 'completed' ? 'completed' : 'interrupted',
        {
          now,
          usage: result.usage ?? undefined,
          result: {
            calls: result.calls,
            pending: result.pending.length,
            scanned: result.scannedChapterIds.length
          }
        }
      )
      if (result.state === 'stopped') {
        const current = this.tasks.getTask(task.id)!
        if (current.state === 'cancelling') this.notify(this.finishCancel(task.id))
        else if (current.state === 'pausing' || current.state === 'running') {
          const reason = current.state === 'pausing' ? 'user' : 'budget'
          this.notify(this.tasks.transitionTask(task.id, 'paused', { now, reason }))
        }
        return false
      }
      return true
    } catch (error) {
      running.extractCalls = null
      if (this.closed) return false
      const now = this.now()
      this.operations.transitionOperation(operationId, 'failed', {
        now,
        error: {
          code: error instanceof StorageError ? error.code : 'provider',
          message: error instanceof Error ? error.message : String(error)
        },
        result: { calls: gate.calls() }
      })
      const current = this.tasks.getTask(task.id)!
      if (current.state === 'cancelling') this.notify(this.finishCancel(task.id))
      else if (current.state === 'pausing')
        this.notify(this.tasks.transitionTask(task.id, 'paused', { now, reason: 'user' }))
      else
        this.notify(this.tasks.transitionTask(task.id, 'waiting_user', { now, reason: 'provider' }))
      return false
    }
  }

  private chapterTarget(workId: string, chapterId: string): ResolvedTarget {
    const work = this.library.get(workId)
    const chapter = this.library.listChapters(workId).find((c) => c.id === chapterId)
    return {
      kind: 'chapter',
      workId,
      workLabel: work.title,
      chapterId,
      chapterLabel: chapter?.title || `Chương ${chapter?.number ?? '?'}`
    }
  }

  private priorBatch(
    workId: string,
    operationIds: string[],
    batchKey: string
  ): { checksum: string } | null {
    for (const operationId of operationIds) {
      const batch = this.library
        .readAgentOperationEvidence(workId, operationId)
        ?.batches.find((item) => item.batchKey === batchKey)
      if (batch) return { checksum: batch.checksum }
    }
    return null
  }

  /** Every open window flushes its editor before a batch commits; any failure is a conflict. */
  private async flushEditors(operationId: string, target: ResolvedTarget): Promise<void> {
    try {
      await this.writeCoordinator.request(
        operationId,
        target,
        this.outlets ? (intent) => this.outlets!.publishIntent(intent) : undefined
      )
    } catch (error) {
      throw new StorageError(
        'conflict',
        error instanceof Error ? error.message : 'Không lưu được editor trước khi ghi.'
      )
    }
  }

  private progressOf(
    applied: number,
    total: number,
    result?: ChapterTranslationRunResult
  ): AgentTaskProgress {
    return {
      applied,
      kept: result?.protectedCount ?? 0,
      total,
      failed: result?.failedIds.length ?? 0,
      refused: result?.refusedIds.length ?? 0
    }
  }

  private settleOperation(
    operationId: string,
    result: ChapterTranslationRunResult | null,
    error: unknown,
    calls: number
  ): void {
    const now = this.now()
    if (!result) {
      this.operations.transitionOperation(operationId, 'failed', {
        now,
        error: {
          code: error instanceof StorageError ? error.code : 'provider',
          message: error instanceof Error ? error.message : String(error)
        },
        result: { calls }
      })
      return
    }
    const state = result.state === 'stopped' ? 'interrupted' : result.state
    this.operations.transitionOperation(operationId, state, {
      now,
      hasChanges: result.appliedUnits > 0,
      progress: { completed: result.appliedUnits, total: result.totalUnits, unit: 'segments' },
      usage: result.usage ?? undefined,
      result: { ...result, calls }
    })
  }

  /** Runner outcome → item state (design table), then the task follows. */
  private settleItem(
    taskId: string,
    itemId: string,
    result: ChapterTranslationRunResult | null,
    error: unknown
  ): void {
    if (!result) {
      const reason: AgentTaskReason =
        error instanceof MissingSourceError ? 'missing_raw' : 'provider'
      this.endItem(taskId, itemId, reason === 'missing_raw' ? 'waiting_user' : 'failed', reason)
      return
    }
    const now = this.now()
    const progress = this.progressOf(result.appliedUnits, result.totalUnits, result)
    if (result.state === 'stopped') {
      this.tasks.transitionItem(itemId, 'queued', { now, patch: { progress } })
      const task = this.tasks.getTask(taskId)!
      if (result.stopReason === 'budget' && task.state === 'running') {
        this.notify(this.tasks.transitionTask(taskId, 'paused', { now, reason: 'budget' }))
      } else if (task.state === 'pausing') {
        this.notify(this.tasks.transitionTask(taskId, 'paused', { now, reason: 'user' }))
      } else if (task.state === 'cancelling') {
        this.notify(this.finishCancel(taskId))
      }
      return
    }
    if (result.state === 'cancelled') {
      this.tasks.transitionItem(itemId, 'cancelled', { now, patch: { progress } })
      const task = this.tasks.getTask(taskId)!
      if (task.state === 'cancelling') this.notify(this.finishCancel(taskId))
      return
    }
    if (result.state === 'conflict') {
      this.endItem(taskId, itemId, 'waiting_user', 'conflict', progress)
      return
    }
    if (result.refusedIds.length > 0) {
      this.endItem(taskId, itemId, 'failed', 'refused', progress)
    } else if (result.failedIds.length > 0) {
      const onlyBudget = result.failedIds.every((id) => result.budgetIds.includes(id))
      this.endItem(taskId, itemId, 'failed', onlyBudget ? 'budget' : 'provider', progress)
    } else {
      this.endItem(taskId, itemId, 'completed', null, progress)
    }
  }

  private endItem(
    taskId: string,
    itemId: string,
    state: AgentTaskItemState,
    reason: AgentTaskReason | null,
    progress?: AgentTaskProgress
  ): void {
    const now = this.now()
    this.tasks.transitionItem(itemId, state, { now, reason, patch: progress ? { progress } : {} })
    const task = this.tasks.getTask(taskId)!
    if (task.state === 'cancelling') {
      this.notify(this.finishCancel(taskId))
      return
    }
    if (task.state === 'pausing') {
      this.notify(this.tasks.transitionTask(taskId, 'paused', { now, reason: 'user' }))
      return
    }
    this.settleTask(taskId)
  }

  /** A running task with nothing queued or running ends by how many items completed. */
  private settleTask(taskId: string): void {
    const task = this.tasks.getTask(taskId)!
    if (task.state !== 'running') {
      this.notify(task)
      return
    }
    const items = this.tasks.listItems(taskId)
    if (items.some((item) => item.state === 'queued' || item.state === 'running')) {
      this.notify(task)
      return
    }
    const now = this.now()
    const completed = items.filter((item) => item.state === 'completed').length
    const done = items.every((item) => item.state === 'completed' || item.state === 'skipped')
    if (done && completed > 0) {
      this.notify(this.tasks.transitionTask(taskId, 'completed', { now }))
    } else if (completed > 0) {
      this.notify(this.tasks.transitionTask(taskId, 'partially_completed', { now }))
    } else {
      const reason =
        items.find((item) => item.reason !== null)?.reason ?? ('provider' as AgentTaskReason)
      this.notify(this.tasks.transitionTask(taskId, 'failed', { now, reason }))
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Task caps

  /**
   * The outer gate of every call budget of the task: calls, reported tokens and, when the catalog has a
   * price, cost, summed over the task's earlier runs plus the live one. A token cap that cannot be
   * proven because a call reported no usage stops the task too.
   */
  private gateFor(task: AgentTaskView, operationId: string) {
    const earlier = this.operationsOfTask(task.id).filter(
      (operation) => operation.id !== operationId
    )
    const earlierCalls = earlier.reduce((sum, operation) => sum + this.callsOf(operation.result), 0)
    const earlierUsage = earlier.map((operation) => operation.usage)
    const info = lookupModel(this.modelNameOf(task) ?? '')
    let liveCalls = 0
    let liveUsage: TokenUsage | null = null
    return {
      allow: (): boolean => {
        const calls = earlierCalls + liveCalls
        const { maxCalls, maxTokens, maxCostUsd } = task.budget
        if (maxCalls !== undefined && calls + 1 > maxCalls) return false
        const usage = aggregateTokenUsage([...earlierUsage.filter(Boolean), liveUsage])
        if (maxTokens !== undefined) {
          if (calls > 0 && usage === null) return false
          if (usage && usage.inputTokens + usage.outputTokens >= maxTokens) return false
        }
        if (maxCostUsd !== undefined && usage && info?.cost) {
          const cost = calculateTurnCost(usage, info).costUsd
          if (cost !== null && cost >= maxCostUsd) return false
        }
        liveCalls++
        return true
      },
      live: (usage: TokenUsage | null, calls: number) => {
        liveUsage = usage
        liveCalls = Math.max(liveCalls, calls)
      },
      calls: () => liveCalls
    }
  }

  private operationsOfTask(taskId: string) {
    return this.tasks
      .operationIds(taskId)
      .map((id) => this.operations.getOperation(id))
      .filter((operation) => operation !== null)
  }

  private callsOf(result: unknown): number {
    const calls = (result as { calls?: unknown } | null)?.calls
    return typeof calls === 'number' ? calls : 0
  }

  private modelNameOf(task: AgentTaskView): string | null {
    try {
      return this.connections.translator(task.model.connectionId, task.model.entryId).entry.model
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Lifecycle

  /**
   * App quit, before the library closes: abort the run and write every open task as
   * `paused(app_closed)` synchronously. Nothing runs again until the user presses Continue.
   */
  shutdown(): void {
    if (this.closed) return
    this.closed = true
    const now = this.now()
    const running = this.running
    running?.controller.abort()
    if (running) {
      const operationId = this.tasks.latestOperationId(running.itemId)
      const operation = operationId ? this.operations.getOperation(operationId) : null
      if (operation && (operation.state === 'running' || operation.state === 'queued')) {
        this.operations.transitionOperation(operation.id, 'interrupted', { now })
      }
    }
    for (const task of this.tasks.listTasksIn(['queued', 'running', 'pausing', 'cancelling'])) {
      this.tasks.transaction(() => {
        if (task.state === 'cancelling') {
          this.cancelOpenItems(task.id, now)
          this.tasks.transitionTask(task.id, 'cancelled', { now })
          return
        }
        this.requeue(task.id, ['running'], now)
        this.tasks.transitionTask(task.id, 'paused', { now, reason: 'app_closed' })
      })
    }
  }

  /**
   * After the operation reconciler: what a crash left behind. An item whose operation the journal
   * finished as completed is completed; any other running item goes back to the queue. Calls no provider
   * and starts nothing.
   */
  reconcileOnStartup(): { items: number; tasks: number } {
    const now = this.now()
    let items = 0
    for (const item of this.tasks.runningItems()) {
      const operationId = this.tasks.latestOperationId(item.id)
      const operation = operationId ? this.operations.getOperation(operationId) : null
      const task = this.tasks.getTask(item.taskId)!
      if (task.state === 'cancelling') this.tasks.transitionItem(item.id, 'cancelled', { now })
      else if (operation?.state === 'completed')
        this.tasks.transitionItem(item.id, 'completed', { now })
      else this.tasks.transitionItem(item.id, 'queued', { now })
      items++
    }
    const open = this.tasks.listTasksIn(['queued', 'running', 'pausing', 'cancelling'])
    for (const task of open) {
      if (task.state === 'cancelling') this.finishCancel(task.id)
      else this.tasks.transitionTask(task.id, 'paused', { now, reason: 'recovered_after_restart' })
    }
    return { items, tasks: open.length }
  }

  private notify(task: AgentTaskView): void {
    this.outlets?.changed({
      taskId: task.id,
      workId: task.workId,
      state: task.state,
      stateVersion: task.stateVersion
    })
  }
}
