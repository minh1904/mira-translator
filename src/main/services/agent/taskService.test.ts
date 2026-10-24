import { describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import type { AgentTargetChanged } from '../../../shared/contracts/agent'
import type { AgentTaskChanged } from '../../../shared/contracts/agentTask'
import { ProviderError } from '../../infra/providers/types'
import { AgentRepository } from '../../infra/storage/agentRepository'
import { AgentTaskRepository } from '../../infra/storage/agentTaskRepository'
import { getRunContext } from '../../infra/storage/translateRunContext'
import { AgentService } from './agentService'
import { callTools, say, setupAgent } from './agentTestKit'
import {
  runChapterTranslation,
  type ChapterTranslationRunInput,
  type ChapterTranslationRunResult
} from './chapterTranslationRunner'
import { AgentTaskService } from './taskService'
import { AgentWriteCoordinator } from './writeCoordinator'

let commands = 0
const command = () => `00000000-0000-4000-8000-${(++commands).toString().padStart(12, '0')}`

/** A task service over the kit's library; `run` defaults to the real runner. */
function taskKit(
  run?: typeof runChapterTranslation,
  options: { omitTranslationUsage?: boolean } = {}
) {
  const kit = setupAgent(options)
  const coordinator = new AgentWriteCoordinator(1_000)
  const operations = new AgentRepository(kit.library.appDb)
  const make = (runner = run) =>
    new AgentTaskService({
      library: kit.library,
      connections: kit.services.connections,
      tasks: new AgentTaskRepository(kit.library.appDb),
      operations,
      writeCoordinator: coordinator,
      run: runner
    })
  const tasks = make()
  const changes: AgentTaskChanged[] = []
  const targets: AgentTargetChanged[] = []
  tasks.connect({
    publishIntent: () => [],
    changed: (event) => changes.push(event),
    targetChanged: (event) => targets.push(event)
  })
  const create = (chapterIds: string[], extra: Record<string, unknown> = {}) =>
    tasks.create({
      clientCommandId: command(),
      contextStrategy: 'approved_only',
      workId: kit.work1.id,
      chapterIds,
      modelSelection: kit.modelSelection,
      ...extra
    }).task
  const control = (
    taskId: string,
    verb: Parameters<AgentTaskService['control']>[0]['command'],
    itemId?: string
  ) =>
    tasks.control({
      taskId,
      command: verb,
      stateVersion: tasks.get(taskId).task.stateVersion,
      clientCommandId: command(),
      ...(itemId ? { itemId } : {})
    })
  const states = (taskId: string) => tasks.get(taskId).items.map((item) => item.state)
  return { ...kit, tasks, make, coordinator, operations, changes, targets, create, control, states }
}

/** A scripted runner: each run waits on `gate` and returns what `outcome` says. */
function scriptedRunner() {
  const calls: ChapterTranslationRunInput[] = []
  let concurrent = 0
  let maxConcurrent = 0
  const outcomes = new Map<
    string,
    (input: ChapterTranslationRunInput) => Promise<ChapterTranslationRunResult>
  >()
  const done = (
    state: ChapterTranslationRunResult['state'],
    extra: Partial<ChapterTranslationRunResult> = {}
  ) =>
    ({
      state,
      appliedUnits: 1,
      totalUnits: 1,
      protectedCount: 0,
      failedIds: [],
      refusedIds: [],
      budgetIds: [],
      failures: [],
      lastAppliedRev: 1,
      summary: state,
      usage: null,
      ...extra
    }) as ChapterTranslationRunResult
  const run = (async (input: ChapterTranslationRunInput) => {
    calls.push(input)
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    try {
      await new Promise((resolve) => setImmediate(resolve))
      const outcome = outcomes.get(input.chapterId)
      return outcome ? await outcome(input) : done('completed')
    } finally {
      concurrent--
    }
  }) as typeof runChapterTranslation
  return { run, calls, outcomes, done, max: () => maxConcurrent }
}

describe('AgentTaskService: creating', () => {
  it('fixes 30 ordered items, returns the same task on resend and ignores chapters added later', async () => {
    const { tasks, library, work1, modelSelection } = taskKit(scriptedRunner().run)
    for (let i = 0; i < 26; i++) library.createChapter(work1.id, `Thêm ${i + 1}`)
    const chapters = library.listChapters(work1.id)
    expect(chapters).toHaveLength(30)
    const input = {
      clientCommandId: command(),
      contextStrategy: 'approved_only' as const,
      workId: work1.id,
      range: { from: 1, to: 30 },
      modelSelection
    }
    const first = tasks.create(input)
    expect(tasks.get(first.task.id).items.map((item) => item.chapterId)).toEqual(
      chapters.map((c) => c.id)
    )
    library.createChapter(work1.id, 'Chương 31')
    expect(tasks.create(input)).toMatchObject({ created: false, task: { id: first.task.id } })
    expect(tasks.get(first.task.id).items).toHaveLength(30)
    await tasks.idle()
  })

  it('runs again as a new task that points at the old one', async () => {
    const { create, control, tasks, ch1_1 } = taskKit(scriptedRunner().run)
    const task = create([ch1_1.id])
    await tasks.idle()
    const again = control(task.id, 'run_again')
    expect(again.id).not.toBe(task.id)
    expect(again.sourceTaskId).toBe(task.id)
    expect(tasks.get(task.id).task.state).toBe('completed')
    await tasks.idle()
  })
})

describe('AgentTaskService: scheduler', () => {
  it('takes turns between tasks, older first, each run its own operation and attempt', async () => {
    const runner = scriptedRunner()
    const { create, tasks, operations, ch1_1, ch1_2, ch1_amb1 } = taskKit(runner.run)
    const older = create([ch1_1.id, ch1_2.id])
    const newer = create([ch1_amb1.id])
    await tasks.idle()
    expect(runner.calls.map((call) => call.chapterId)).toEqual([ch1_1.id, ch1_amb1.id, ch1_2.id])
    expect(runner.max()).toBe(3)
    expect(tasks.get(older.id).task.state).toBe('completed')
    expect(tasks.get(newer.id).task.state).toBe('completed')
    const [first] = tasks.get(older.id).items
    const operation = operations.getOperation(runner.calls[0].operationId)
    expect(operation).toMatchObject({ taskItemId: first.id, turnId: null, state: 'completed' })
    expect(runner.calls[0]).toMatchObject({
      runKey: `task:${first.id}`,
      policy: 'fill_untranslated'
    })
  })

  it('opens the model as a background caller, so chat goes first in the entry queue', async () => {
    const { create, tasks, services, ch1_1 } = taskKit()
    const called: unknown[] = []
    const translator = services.connections.translator.bind(services.connections)
    // Only a provider that is actually called counts; reading the entry's settings sends nothing.
    services.connections.translator = (id, entryId, priority) => {
      const opened = translator(id, entryId, priority)
      const provider = new Proxy(opened.provider, {
        get(target, key, receiver) {
          const value = Reflect.get(target, key, receiver)
          if (typeof value !== 'function') return value
          return (...args: unknown[]) => {
            called.push(priority)
            return value.apply(target, args)
          }
        }
      })
      return { ...opened, provider }
    }
    create([ch1_1.id])
    await tasks.idle()
    expect(called).not.toHaveLength(0)
    expect(called.every((priority) => priority === 'background')).toBe(true)
  })

  it('tells every window each chapter run ended, so editors unlock and lists refetch', async () => {
    const runner = scriptedRunner()
    const { create, tasks, targets, ch1_1, ch1_2 } = taskKit(runner.run)
    create([ch1_1.id, ch1_2.id])
    await tasks.idle()
    expect(targets.map((event) => [event.target.chapterId, event.target.side])).toEqual([
      [ch1_1.id, 'target'],
      [ch1_2.id, 'target']
    ])
    expect(targets.map((event) => event.operationId)).toEqual(
      runner.calls.map((call) => call.operationId)
    )
  })

  it('does not let a chapter without raw block the next one and ends partially_completed', async () => {
    const { create, tasks, library, work1, ch1_1, states } = taskKit()
    const empty = library.createChapter(work1.id, 'Chưa có raw').chapter
    const task = create([empty.id, ch1_1.id])
    await tasks.idle()
    // Items follow the work's chapter order; the empty chapter was added last.
    expect(states(task.id)).toEqual(['completed', 'waiting_user'])
    expect(tasks.get(task.id).items[1].reason).toBe('missing_raw')
    expect(tasks.get(task.id).task.state).toBe('partially_completed')
  })

  it('pauses at a safe point, then continues with a new operation', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    let paused = false
    runner.outcomes.set(kit.ch1_1.id, async (input) => {
      if (!paused) {
        paused = true
        kit.control(kit.tasks.get(task.id).task.id, 'pause')
        return runner.done(input.shouldStop?.() === 'pause' ? 'stopped' : 'completed', {
          stopReason: 'pause'
        })
      }
      return runner.done('completed')
    })
    const task = kit.create([kit.ch1_1.id])
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'user' })
    expect(kit.states(task.id)).toEqual(['queued'])
    expect(kit.operations.getOperation(runner.calls[0].operationId)?.state).toBe('interrupted')

    kit.control(task.id, 'continue')
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
    expect(runner.calls[1].operationId).not.toBe(runner.calls[0].operationId)
  })

  it('cancels a running item: the run is aborted and the rest of the task is cancelled', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    const aborted: boolean[] = []
    runner.outcomes.set(kit.ch1_1.id, async (input) => {
      kit.control(task.id, 'cancel')
      aborted.push(input.signal?.aborted === true)
      return runner.done('cancelled')
    })
    for (const chapter of [kit.ch1_2, kit.ch1_amb1]) {
      runner.outcomes.set(chapter.id, async (input) => {
        aborted.push(input.signal?.aborted === true)
        return runner.done('cancelled')
      })
    }
    const task = kit.create([kit.ch1_1.id, kit.ch1_2.id, kit.ch1_amb1.id])
    await kit.tasks.idle()
    // Every running request is aborted; the task is cancelled once the last run ended.
    expect(aborted).toEqual([true, true, true])
    expect(kit.tasks.get(task.id).task.state).toBe('cancelled')
    expect(kit.states(task.id)).toEqual(['cancelled', 'cancelled', 'cancelled'])
    expect(runner.calls).toHaveLength(3)
  })

  it('applies the first of two Pause commands with one version and rejects the second', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    const task = kit.create([kit.ch1_1.id])
    const version = kit.tasks.get(task.id).task.stateVersion
    const pause = () =>
      kit.tasks.control({
        taskId: task.id,
        command: 'pause',
        stateVersion: version,
        clientCommandId: command()
      })
    expect(pause().state).toBe('paused')
    expect(pause).toThrow(/đã đổi trạng thái/)
    await kit.tasks.idle()
  })

  it('retries only the failed items of a partially completed task', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    let failing = true
    for (const chapter of [kit.ch1_2, kit.ch1_amb1]) {
      runner.outcomes.set(chapter.id, async () =>
        failing
          ? runner.done('partially_completed', { failedIds: ['x'] })
          : runner.done('completed')
      )
    }
    const task = kit.create([kit.ch1_1.id, kit.ch1_2.id, kit.ch1_amb1.id])
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task.state).toBe('partially_completed')
    expect(kit.states(task.id)).toEqual(['completed', 'failed', 'failed'])
    failing = false
    kit.control(task.id, 'retry')
    await kit.tasks.idle()
    expect(kit.states(task.id)).toEqual(['completed', 'completed', 'completed'])
    expect(
      runner.calls.map((call) => call.chapterId).filter((id) => id === kit.ch1_1.id)
    ).toHaveLength(1)
  })

  it('maps refused rows to failed(refused) and completes when the user skips them', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    runner.outcomes.set(kit.ch1_1.id, async (input) => {
      const result = runner.done('partially_completed', {
        refusedIds: ['s1', 's2'],
        failedIds: ['s1', 's2']
      })
      kit.operations.transitionOperation(input.operationId, 'running', { now: 1, result })
      return result
    })
    const task = kit.create([kit.ch1_1.id])
    await kit.tasks.idle()
    const [item] = kit.tasks.get(task.id).items
    expect(item).toMatchObject({ state: 'failed', reason: 'refused' })
    kit.control(task.id, 'skip_refused', item.id)
    expect(kit.tasks.get(task.id).items[0]).toMatchObject({
      state: 'completed',
      skippedSegments: ['s1', 's2']
    })
  })
})

describe('AgentTaskService: writes', () => {
  it('flushes every open window before a batch, and a failed flush leaves the item waiting', async () => {
    const kit = taskKit()
    const intents: string[] = []
    kit.tasks.connect({
      publishIntent: (intent) => {
        intents.push(intent.intentId)
        setImmediate(() =>
          kit.coordinator.acknowledge({ intentId: intent.intentId, status: 'flush-failed' }, 1)
        )
        return [1]
      },
      changed: () => {}
    })
    const task = kit.create([kit.ch1_1.id])
    await kit.tasks.idle()
    expect(intents.length).toBeGreaterThan(0)
    expect(kit.tasks.get(task.id).items[0]).toMatchObject({
      state: 'waiting_user',
      reason: 'conflict'
    })
    expect(kit.library.readText(kit.work1.id, kit.ch1_1.id, 'target').content).toBe('')
  })

  it('refuses a chat write into the chapter a task item is translating, before any model call', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    const chat = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: new AgentRepository(kit.library.appDb),
      registry: kit.registry,
      tasks: kit.tasks,
      openChatModel: (selection) => kit.model.open(selection)
    })
    let chatResult: unknown = null
    runner.outcomes.set(kit.ch1_1.id, async () => {
      kit.model.script(
        callTools({ name: 'translate_chapter', args: { target: 'ctx' } }),
        say('Bận.')
      )
      const res = await chat.send({
        instruction: 'dịch chương này',
        context: { workId: kit.work1.id, chapterId: kit.ch1_1.id },
        modelSelection: kit.modelSelection
      })
      chatResult = chat.listToolCalls(res.turnId)[0].result
      return runner.done('completed')
    })
    kit.create([kit.ch1_1.id])
    await kit.tasks.idle()
    expect(chatResult).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(kit.translations.requests).toHaveLength(0)
  })
})

describe('AgentTaskService: created from chat', () => {
  it('creates the task without asking at allow_all and skips it in Autopilot', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    const chat = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: new AgentRepository(kit.library.appDb),
      registry: kit.registry,
      tasks: kit.tasks,
      openChatModel: (selection) => kit.model.open(selection)
    })
    const createTask = () =>
      callTools({
        name: 'create_translation_task',
        args: { target: 'ctx', fromChapter: 1, toChapter: 2, contextStrategy: 'approved_only' }
      })
    const sendAt = async (level: 'allow_all' | 'autopilot') => {
      const session = chat.createSession('Tác vụ')
      chat.setPermissionLevel(session.id, level)
      return chat.send({
        sessionId: session.id,
        instruction: 'dịch chương 1 đến 2',
        context: { workId: kit.work1.id },
        modelSelection: kit.modelSelection
      })
    }
    runner.outcomes.set(kit.ch1_1.id, async () => runner.done('completed'))
    runner.outcomes.set(kit.ch1_2.id, async () => runner.done('completed'))

    kit.model.script(createTask(), say('Không tạo.'))
    const skipped = await sendAt('autopilot')
    expect(skipped.status).toBe('completed')
    expect(kit.tasks.list()).toEqual([])
    expect(chat.listToolCalls(skipped.turnId)[0]).toMatchObject({ approval: 'autopilot_skip' })

    kit.model.script(createTask(), say('Đã tạo.'))
    const created = await sendAt('allow_all')
    expect(created.status).toBe('completed')
    expect(kit.tasks.list()).toHaveLength(1)
    expect(chat.listToolCalls(created.turnId)[0]).toMatchObject({
      decision: 'needs_user',
      approval: 'level_allow_all',
      state: 'completed'
    })
    await kit.tasks.idle()
  })

  it('waits for approval, then creates a task that keeps running after the turn ends and its Stop', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    const chat = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: new AgentRepository(kit.library.appDb),
      registry: kit.registry,
      tasks: kit.tasks,
      openChatModel: (selection) => kit.model.open(selection)
    })
    kit.model.script(
      callTools({
        name: 'create_translation_task',
        args: { target: 'ctx', fromChapter: 1, toChapter: 2, contextStrategy: 'approved_only' }
      })
    )
    const res = await chat.send({
      instruction: 'dịch chương 1 đến 2',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })
    expect(res.status).toBe('waiting_user')
    expect(kit.tasks.list()).toEqual([])

    const [pending] = chat.getSessionDetail(res.sessionId).pending
    let release: () => void = () => {}
    const released = new Promise<void>((resolve) => (release = resolve))
    runner.outcomes.set(kit.ch1_1.id, async () => {
      await released
      return runner.done('completed')
    })
    kit.model.script((request) => {
      const created = JSON.parse(request.messages.at(-1)!.content).value
      return say(`Đã tạo tác vụ ${created.taskId} với ${created.chapters} chương.`)
    })
    const resumed = await chat.send({
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending.toolCallId,
        argsDigest: pending.argsDigest,
        choice: 'approve'
      },
      instruction: 'Duyệt',
      modelSelection: kit.modelSelection,
      commandId: 'approve-task'
    })
    expect(resumed.status).toBe('completed')
    const [task] = kit.tasks.list()
    expect(task).toMatchObject({ originTurnId: res.turnId, state: 'running' })

    chat.cancelTurn(res.turnId)
    release()
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
    expect(kit.tasks.get(task.id).items).toHaveLength(2)
  })
})

describe('AgentTaskService: lifecycle and caps', () => {
  it('writes paused(app_closed) on quit and does not run again on the next start', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    let release: () => void = () => {}
    runner.outcomes.set(
      kit.ch1_1.id,
      (input) =>
        new Promise((resolve) => {
          release = () => resolve(runner.done('cancelled'))
          input.signal?.addEventListener('abort', () => release())
        })
    )
    const task = kit.create([kit.ch1_1.id, kit.ch1_2.id])
    await new Promise((resolve) => setTimeout(resolve, 20))
    kit.tasks.shutdown()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'app_closed' })
    expect(kit.states(task.id)).toEqual(['queued', 'queued'])

    const next = kit.make(scriptedRunner().run)
    expect(next.reconcileOnStartup()).toEqual({ items: 0, tasks: 0 })
    await next.idle()
    expect(next.get(task.id).task.state).toBe('paused')
  })

  /**
   * Leaves what a crash leaves: the item and its operation still `running` in library.db, whatever the
   * runner got into the work DB before the process died (all of it, or two batches when `failOn` hits).
   */
  async function crashDuringItem(
    kit: ReturnType<typeof taskKit>,
    chapterId: string,
    failOn?: number,
    beforeCommit?: () => Promise<void>
  ) {
    const task = kit.create([chapterId])
    kit.tasks.shutdown() // the scheduler of the "old process" stops; its library rows are rewritten below
    const repo = new AgentTaskRepository(kit.library.appDb)
    const [item] = repo.listItems(task.id)
    repo.transitionTask(task.id, 'queued', { now: 2 })
    repo.transitionTask(task.id, 'running', { now: 2 })
    repo.transitionItem(item.id, 'running', { now: 2, patch: { runKey: `task:${item.id}` } })
    const operationId = 'crash-op'
    kit.operations.createOperation({
      id: operationId,
      taskItemId: item.id,
      commandId: operationId,
      capability: 'translate_chapter',
      target: {
        kind: 'chapter',
        workId: kit.work1.id,
        workLabel: 'W',
        chapterId,
        chapterLabel: 'C'
      },
      now: 2
    })
    kit.operations.transitionOperation(operationId, 'running', { now: 2 })
    repo.addAttempt(item.id, operationId, 2)
    kit.translations.failOn = failOn
    await runChapterTranslation({
      library: kit.library,
      connections: kit.services.connections,
      workId: kit.work1.id,
      chapterId,
      operationId,
      modelSelection: kit.modelSelection,
      runKey: `task:${item.id}`,
      policy: 'fill_untranslated',
      beforeCommit
    }).catch(() => {})
    kit.translations.failOn = undefined
    // Restart: operations first, then tasks; neither may call the provider.
    const sent = kit.translations.requests.length
    kit.services.agent.reconcileOnStartup()
    const restarted = kit.make()
    restarted.reconcileOnStartup()
    expect(kit.translations.requests).toHaveLength(sent)
    expect(restarted.get(task.id).task).toMatchObject({
      state: 'paused',
      reason: 'recovered_after_restart'
    })
    return { task, restarted, sent }
  }

  it('recovers from a crash between the two DBs: the completed journal wins', async () => {
    const kit = taskKit()
    const { task, restarted } = await crashDuringItem(kit, kit.ch1_1.id)
    expect(restarted.get(task.id).items[0].state).toBe('completed')
  })

  it('recovers from a crash mid-item: the item is queued and Continue translates only the rest', async () => {
    const kit = taskKit()
    kit.services.connections.updateEntry(kit.modelSelection.entryId, {
      settings: { inputTokenLimit: 1 }
    })
    const chapter = kit.library.createChapter(kit.work1.id, 'Ba đoạn').chapter
    const text = 'Một.\n\nHai.\n\nBa.'
    kit.library.saveText(kit.work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
    const { task, restarted, sent } = await crashDuringItem(kit, chapter.id, 3)
    expect(restarted.get(task.id).items[0].state).toBe('queued')
    restarted.control({
      taskId: task.id,
      command: 'continue',
      stateVersion: restarted.get(task.id).task.stateVersion,
      clientCommandId: command()
    })
    await restarted.idle()
    expect(kit.translations.requests.slice(sent)).toEqual([['Ba.']])
    expect(restarted.get(task.id).task.state).toBe('completed')
  })

  it('recovers from a crash after a response but before its commit: that batch is sent again, written once', async () => {
    const kit = taskKit()
    kit.services.connections.updateEntry(kit.modelSelection.entryId, {
      settings: { inputTokenLimit: 1 }
    })
    const chapter = kit.library.createChapter(kit.work1.id, 'Ba đoạn').chapter
    const text = 'Một.\n\nHai.\n\nBa.'
    kit.library.saveText(kit.work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
    let commits = 0
    const { task, restarted, sent } = await crashDuringItem(
      kit,
      chapter.id,
      undefined,
      async () => {
        if (++commits === 2) throw new Error('process died')
      }
    )
    expect(restarted.get(task.id).items[0].state).toBe('queued')
    restarted.control({
      taskId: task.id,
      command: 'continue',
      stateVersion: restarted.get(task.id).task.stateVersion,
      clientCommandId: command()
    })
    await restarted.idle()
    expect(kit.translations.requests.slice(sent)).toEqual([['Hai.'], ['Ba.']])
    const target = kit.library.readText(kit.work1.id, chapter.id, 'target').content
    expect(target.match(/Dịch: Hai\./g)).toHaveLength(1)
  })

  it('pauses on the task call cap before the request and keeps what was committed', async () => {
    const kit = taskKit()
    kit.services.connections.updateEntry(kit.modelSelection.entryId, {
      settings: { inputTokenLimit: 1 }
    })
    const chapter = kit.library.createChapter(kit.work1.id, 'Ba đoạn').chapter
    const text = 'Một.\n\nHai.\n\nBa.'
    kit.library.saveText(kit.work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
    const task = kit.create([chapter.id], { budget: { maxCalls: 2 } })
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'budget' })
    expect(kit.states(task.id)).toEqual(['queued'])
    expect(kit.translations.requests).toHaveLength(2)
    expect(kit.library.readText(kit.work1.id, chapter.id, 'target').content).toContain('Dịch: Hai.')
  })

  it('shows unknown usage, not zero, when the provider reports none', async () => {
    const kit = taskKit(undefined, { omitTranslationUsage: true })
    const task = kit.create([kit.ch1_1.id])
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'completed', usage: null })
  })

  it('a token cap that cannot be proven without usage pauses the task', async () => {
    const kit = taskKit(undefined, { omitTranslationUsage: true })
    kit.services.connections.updateEntry(kit.modelSelection.entryId, {
      settings: { inputTokenLimit: 1 }
    })
    const task = kit.create([kit.ch1_1.id], { budget: { maxTokens: 1000 } })
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'budget' })
    expect(kit.translations.requests).toHaveLength(1)
  })
})

describe('AgentTaskService: context choice from chat', () => {
  it('lets the model leave the context choice out: approval first, then the work default', async () => {
    const kit = taskKit(scriptedRunner().run)
    const chat = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: new AgentRepository(kit.library.appDb),
      registry: kit.registry,
      tasks: kit.tasks,
      openChatModel: (selection) => kit.model.open(selection)
    })
    kit.model.script(
      callTools({
        name: 'create_translation_task',
        args: { target: 'ctx', fromChapter: 1, toChapter: 2 }
      }),
      say('Đã tạo tác vụ.')
    )
    const res = await chat.send({
      instruction: 'dịch chương 1 đến 2',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })
    expect(res.status).toBe('waiting_user')
    expect(kit.tasks.list()).toEqual([])
    const [pending] = chat.getSessionDetail(res.sessionId).pending
    await chat.send({
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending!.toolCallId,
        argsDigest: pending!.argsDigest,
        choice: 'approve'
      },
      instruction: 'Duyệt',
      modelSelection: kit.modelSelection,
      commandId: 'approve-default'
    })
    // The work has no glossary yet, so the task extracts first.
    expect(kit.tasks.list()[0]?.options.contextStrategy).toBe('extract_then_review')
    const tool = kit.registry.get('create_translation_task')
    expect(tool?.parameters?.required).not.toContain('contextStrategy')
    expect(tool?.description).toContain('"approved_only" khi người dùng nói rõ dịch luôn')
    await kit.tasks.idle()
  })
})

describe('AgentTaskService: task errors', () => {
  const failing = (runner: ReturnType<typeof scriptedRunner>, chapterId: string, error: Error) =>
    runner.outcomes.set(chapterId, async () => {
      throw error
    })

  it('records the provider kind, not "provider", and shows it as the last run of the item', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    failing(
      runner,
      kit.ch1_2.id,
      new ProviderError('rate_limited', 'Chờ hạn mức', { retryAfterMs: 30_000 })
    )
    const task = kit.create([kit.ch1_1.id, kit.ch1_2.id])
    await kit.tasks.idle()
    const detail = kit.tasks.get(task.id)
    expect(detail.items[0]?.lastRun?.error).toBeNull()
    const error = detail.items[1]?.lastRun?.error
    expect(error).toMatchObject({
      code: 'rate_limited',
      scope: 'chapter',
      retryable: true,
      retryAfterMs: 30_000
    })
    expect(error).not.toHaveProperty('detail')
    const runs = kit.tasks.runs(task.id, detail.items[1]!.id)
    expect(runs.runs).toHaveLength(1)
    expect(runs.runs[0]?.error).toHaveProperty('detail')
  })

  it('stops the whole task on a bad key instead of failing every chapter after it', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    kit.services.connections.updateEntry(kit.modelSelection.entryId, {
      settings: { concurrencyLimit: 2 }
    })
    failing(runner, kit.ch1_1.id, new ProviderError('auth', 'Khóa sai'))
    const task = kit.create([kit.ch1_1.id, kit.ch1_2.id, kit.ch1_amb1.id])
    await kit.tasks.idle()
    // The chapter running beside the bad one ends by its own result; no new chapter starts.
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'waiting_user', reason: 'provider' })
    expect(kit.states(task.id)).toEqual(['failed', 'completed', 'queued'])
    expect(runner.calls).toHaveLength(2)
    expect(kit.tasks.get(task.id).items[0]?.lastRun?.error).toMatchObject({
      code: 'auth',
      scope: 'task'
    })
  })

  it('reads a partial failure from the run result and keeps the old shape readable', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    runner.outcomes.set(kit.ch1_1.id, async (input) => {
      const result = runner.done('partially_completed', {
        failedIds: ['a', 'b'],
        failures: [
          { code: 'network', message: 'Mất mạng', segmentIds: ['a', 'b'], segmentCount: 2 }
        ]
      })
      kit.operations.transitionOperation(input.operationId, 'running', { now: 1, result })
      return result
    })
    const task = kit.create([kit.ch1_1.id])
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).items[0]?.lastRun?.error).toMatchObject({
      code: 'network',
      scope: 'chapter'
    })
  })
})

describe('AgentTaskService: chapters in parallel', () => {
  /** A runner whose every run waits until `release()`, then ends as `end` says (completed by default). */
  function heldRunner() {
    const runner = scriptedRunner()
    const waiting: Array<() => void> = []
    let end = (_input: ChapterTranslationRunInput): ChapterTranslationRunResult =>
      runner.done('completed')
    const hold = (chapterId: string) =>
      runner.outcomes.set(
        chapterId,
        (input) =>
          new Promise((resolve) => {
            waiting.push(() => resolve(end(input)))
          })
      )
    const release = () => {
      for (const go of waiting.splice(0)) go()
    }
    return {
      ...runner,
      hold,
      release,
      waiting: () => waiting.length,
      endWith: (next: typeof end) => {
        end = next
      }
    }
  }

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
  }

  /** `count` new chapters of work 1, each with one line of raw text. */
  function chapters(kit: ReturnType<typeof taskKit>, count: number, prefix: string) {
    return Array.from({ length: count }, (_, i) => {
      const chapter = kit.library.createChapter(kit.work1.id, `${prefix} ${i + 1}`).chapter
      const text = `第${i + 1}章。`
      kit.library.saveText(kit.work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
      return chapter
    })
  }

  const runningOf = (kit: ReturnType<typeof taskKit>, taskId: string) =>
    kit.states(taskId).filter((state) => state === 'running').length

  it('runs two items of each of two tasks at once on an entry of ceiling 4', async () => {
    const runner = heldRunner()
    const kit = taskKit(runner.run)
    const a = chapters(kit, 10, 'A')
    const b = chapters(kit, 10, 'B')
    for (const chapter of [...a, ...b]) runner.hold(chapter.id)
    const older = kit.create(a.map((chapter) => chapter.id))
    const newer = kit.create(b.map((chapter) => chapter.id))
    await settle()
    expect(runningOf(kit, older.id)).toBe(2)
    expect(runningOf(kit, newer.id)).toBe(2)
    expect(runner.calls[0]?.chapterId).toBe(a[0]!.id)
    for (let i = 0; i < 20 && runner.waiting() > 0; i++) {
      runner.release()
      await settle()
    }
    await kit.tasks.idle()
    expect(runner.max()).toBe(4)
  })

  it('runs exactly as many items as the entry ceiling, and the next when one ends', async () => {
    const runner = heldRunner()
    const kit = taskKit(runner.run)
    kit.services.connections.updateEntry(kit.modelSelection.entryId, {
      settings: { concurrencyLimit: 2 }
    })
    const list = chapters(kit, 5, 'C')
    for (const chapter of list) runner.hold(chapter.id)
    const task = kit.create(list.map((chapter) => chapter.id))
    await settle()
    expect(runningOf(kit, task.id)).toBe(2)
    runner.release()
    await settle()
    expect(kit.states(task.id).filter((state) => state === 'completed')).toHaveLength(2)
    expect(runningOf(kit, task.id)).toBe(2)
    for (let i = 0; i < 5; i++) {
      runner.release()
      await settle()
    }
    await kit.tasks.idle()
    expect(runner.max()).toBe(2)
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
  })

  it('pauses every running item at its safe point and is paused once the last one stopped', async () => {
    const runner = heldRunner()
    const kit = taskKit(runner.run)
    const list = chapters(kit, 3, 'P')
    for (const chapter of list) runner.hold(chapter.id)
    runner.endWith((input) =>
      input.shouldStop?.() === 'pause'
        ? runner.done('stopped', { stopReason: 'pause' })
        : runner.done('completed')
    )
    const task = kit.create(list.map((chapter) => chapter.id))
    await settle()
    expect(runningOf(kit, task.id)).toBe(3)
    kit.control(task.id, 'pause')
    expect(kit.tasks.get(task.id).task.state).toBe('pausing')
    runner.release()
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'user' })
    expect(kit.states(task.id)).toEqual(['queued', 'queued', 'queued'])
    expect(runner.calls).toHaveLength(3)
  })

  it('writes every running item back to the queue when the app closes', async () => {
    const runner = heldRunner()
    const kit = taskKit(runner.run)
    const list = chapters(kit, 3, 'Q')
    for (const chapter of list) runner.hold(chapter.id)
    const task = kit.create(list.map((chapter) => chapter.id))
    await settle()
    expect(runningOf(kit, task.id)).toBe(3)
    kit.tasks.shutdown()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'app_closed' })
    expect(kit.states(task.id)).toEqual(['queued', 'queued', 'queued'])
  })

  it('lets only one of two items take the last call of the task cap', async () => {
    const runner = scriptedRunner()
    const kit = taskKit(runner.run)
    const allowed: boolean[] = []
    const list = chapters(kit, 2, 'G')
    for (const chapter of list) {
      runner.outcomes.set(chapter.id, async (input) => {
        const ok = input.gate?.('main') ?? true
        allowed.push(ok)
        return ok ? runner.done('completed') : runner.done('stopped', { stopReason: 'budget' })
      })
    }
    const task = kit.create(
      list.map((chapter) => chapter.id),
      { budget: { maxCalls: 1 } }
    )
    await kit.tasks.idle()
    expect(runner.max()).toBe(2)
    expect(allowed.sort()).toEqual([false, true])
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'budget' })
  })

  it('pins the same snapshot for an item whether or not the one before it has finished', async () => {
    const hashes = async (ceiling: number) => {
      const kit = taskKit(scriptedRunner().run)
      kit.services.connections.updateEntry(kit.modelSelection.entryId, {
        settings: { concurrencyLimit: ceiling }
      })
      const list = chapters(kit, 3, 'S')
      const task = kit.create(list.map((chapter) => chapter.id))
      await kit.tasks.idle()
      return kit.tasks
        .get(task.id)
        .items.map((item) =>
          kit.library.withWork(kit.work1.id, (db) => getRunContext(db, item.runKey!)?.snapshotHash)
        )
    }
    const sequential = await hashes(1)
    expect(sequential.every((hash) => typeof hash === 'string')).toBe(true)
    expect(await hashes(4)).toEqual(sequential)
  })
})
