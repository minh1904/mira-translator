import * as v from 'valibot'
import { describe, expect, it, vi } from 'vitest'
import {
  agentTaskSteerInputSchema,
  type AgentTaskSteerInput
} from '../../../shared/contracts/agentTask'
import { segment } from '../../../shared/segmentation/segmenter'
import {
  createCharacter,
  getCharacter,
  listDyads,
  setDyad
} from '../../infra/storage/addressingEntries'
import { AgentRepository } from '../../infra/storage/agentRepository'
import {
  createContextEntry,
  getEffectiveGlossary,
  listContextEntries
} from '../../infra/storage/contextEntries'
import { AgentTaskRepository } from '../../infra/storage/agentTaskRepository'
import { getRunContext } from '../../infra/storage/translateRunContext'
import { parseSnapshot } from '../ai/translate/contextSnapshot'
import { AgentService } from './agentService'
import { callTools, say, setupAgent } from './agentTestKit'
import { runChapterTranslation } from './chapterTranslationRunner'
import { AgentTaskService } from './taskService'
import { AgentWriteCoordinator } from './writeCoordinator'

let commands = 0
const command = () => `00000000-0000-4000-8000-${(++commands).toString().padStart(12, '0')}`

/** A work of `count` one-paragraph chapters; `hold(n)` stops chapter n's run until released. */
function steeringKit(count = 4) {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'Điều chỉnh', sourceLang: 'zh-Hans' })
  const chapters = Array.from({ length: count }, (_, index) => {
    const chapter = kit.library.createChapter(work.id, `Chương ${index + 1}`).chapter
    const text = `第${index + 1}章。`
    kit.library.saveText(work.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
    return chapter
  })
  /** `started` resolves when the run of the held chapter begins; it waits for `release()`. */
  const hold = () => {
    let signalStart: () => void = () => {}
    let release: () => void = () => {}
    const started = new Promise<void>((resolve) => (signalStart = resolve))
    const gate = new Promise<void>((resolve) => (release = resolve))
    return { started, gate, signalStart, release }
  }
  const gates = new Map<string, ReturnType<typeof hold>>()
  const run: typeof runChapterTranslation = async (input) => {
    const gate = gates.get(input.chapterId)
    if (gate) {
      gate.signalStart()
      await gate.gate
    }
    return runChapterTranslation(input)
  }
  const repository = new AgentTaskRepository(kit.library.appDb)
  const make = () => {
    const service = new AgentTaskService({
      library: kit.library,
      connections: kit.services.connections,
      tasks: repository,
      operations: new AgentRepository(kit.library.appDb),
      writeCoordinator: new AgentWriteCoordinator(1_000),
      run
    })
    service.connect({ publishIntent: () => [], changed: () => {} })
    return service
  }
  const tasks = make()
  const create = (n = count) =>
    tasks.create({
      clientCommandId: command(),
      contextStrategy: 'approved_only',
      workId: work.id,
      chapterIds: chapters.slice(0, n).map((chapter) => chapter.id),
      modelSelection: kit.modelSelection
    }).task
  const control = (taskId: string, verb: 'pause' | 'continue' | 'cancel' | 'retry') =>
    tasks.control({
      taskId,
      command: verb,
      stateVersion: tasks.get(taskId).task.stateVersion,
      clientCommandId: command()
    })
  const steer = (
    taskId: string,
    chapterNumber: number,
    change: AgentTaskSteerInput['change'],
    clientCommandId = command()
  ) => tasks.steer({ taskId, clientCommandId, chapterNumber, change })
  const instruction = (text: string) => ({ kind: 'instruction' as const, text })
  /** The instruction chapter n pinned, from its stored snapshot. */
  const pinned = (taskId: string, n: number) => {
    const item = tasks.get(taskId).items[n - 1]!
    const stored = item.runKey
      ? kit.library.withWork(work.id, (db) => getRunContext(db, item.runKey!))
      : null
    return stored ? (parseSnapshot(stored.snapshotJson).instruction ?? null) : undefined
  }
  /** Prompts sent for chapter n's source text. */
  const promptsOf = (n: number) =>
    kit.translations.prompts.filter((prompt) => prompt.includes(`第${n}章。`))
  /** A paused task: created and paused before its first item starts. */
  const paused = (n = count) => {
    const task = create(n)
    control(task.id, 'pause')
    return task
  }
  return {
    ...kit,
    work,
    chapters,
    repository,
    tasks,
    make,
    create,
    control,
    steer,
    instruction,
    pinned,
    promptsOf,
    paused,
    hold: (n: number) => {
      const gate = hold()
      gates.set(chapters[n - 1]!.id, gate)
      return gate
    }
  }
}

describe('steering: validation', () => {
  it('refuses a chapter outside the task, a cancelled task and a third-person change, writing nothing', async () => {
    const kit = steeringKit()
    const task = kit.paused(3)
    expect(() => kit.steer(task.id, 4, kit.instruction('Giữ câu ngắn.'))).toThrow(
      /không thuộc tác vụ/
    )
    const character = kit.library.withWork(kit.work.id, (db) =>
      createCharacter(db, { source: '韩立', target: 'Hàn Lập', gender: 'male', thirdPerson: 'hắn' })
    )
    expect(() =>
      kit.steer(task.id, 2, { kind: 'third_person', characterId: character.id, thirdPerson: 'y' })
    ).toThrow(/Đại từ ngôi ba chưa có phạm vi chương/)
    expect(
      kit.library.withWork(kit.work.id, (db) => getCharacter(db, character.id))?.thirdPerson
    ).toBe('hắn')

    kit.control(task.id, 'cancel')
    expect(() => kit.steer(task.id, 2, kit.instruction('Giữ câu ngắn.'))).toThrow(/đã kết thúc/)
    expect(kit.tasks.listSteerings(task.id)).toEqual([])
    expect(kit.tasks.get(task.id).task.state).toBe('cancelled')
    await kit.tasks.idle()
  })

  it('refuses when no chapter from the asked one on is left to run', async () => {
    const kit = steeringKit(2)
    const second = kit.hold(2)
    const task = kit.create()
    await second.started
    expect(() => kit.steer(task.id, 2, kit.instruction('Giữ câu ngắn.'))).toThrow(
      /Không còn chương chưa chạy/
    )
    expect(kit.tasks.listSteerings(task.id)).toEqual([])
    second.release()
    await kit.tasks.idle()
  })

  it('needs exactly one chapter, a number or an id', () => {
    const base = {
      taskId: command(),
      clientCommandId: command(),
      change: { kind: 'instruction', text: 'x' }
    }
    expect(v.safeParse(agentTaskSteerInputSchema, base).success).toBe(false)
    expect(
      v.safeParse(agentTaskSteerInputSchema, { ...base, chapterNumber: 2, chapterId: command() })
        .success
    ).toBe(false)
    expect(v.safeParse(agentTaskSteerInputSchema, { ...base, chapterNumber: 2 }).success).toBe(true)
  })

  it('returns the same record for a resend and refuses the same id with other content', async () => {
    const kit = steeringKit()
    const task = kit.paused()
    const id = command()
    const first = kit.steer(task.id, 2, kit.instruction('Giữ câu ngắn.'), id)
    expect(kit.steer(task.id, 2, kit.instruction('Giữ câu ngắn.'), id)).toEqual(first)
    expect(() => kit.steer(task.id, 2, kit.instruction('Câu dài.'), id)).toThrow(/Mã lệnh/)
    expect(kit.tasks.listSteerings(task.id)).toHaveLength(1)
    await kit.tasks.idle()
  })
})

describe('steering: where it takes effect', () => {
  it('starts after the running chapter, which keeps its snapshot; the next pins the instruction', async () => {
    const kit = steeringKit(3)
    const first = kit.hold(1)
    const task = kit.create()
    await first.started
    const result = kit.steer(task.id, 1, kit.instruction('Giữ câu ngắn.'))
    expect(result.effectiveFrom.chapterId).toBe(kit.chapters[1]!.id)
    expect(result.effectiveFrom.chapterLabel).toBe('Chương 2')
    first.release()
    await kit.tasks.idle()

    expect(kit.tasks.get(task.id).task.state).toBe('completed')
    expect([1, 2, 3].map((n) => kit.pinned(task.id, n))).toEqual([
      null,
      'Giữ câu ngắn.',
      'Giữ câu ngắn.'
    ])
    expect(kit.promptsOf(1).some((prompt) => prompt.includes('Giữ câu ngắn.'))).toBe(false)
    expect(kit.promptsOf(2).every((prompt) => prompt.includes('Giữ câu ngắn.'))).toBe(true)
    expect(kit.tasks.listSteerings(task.id).map((steering) => steering.state)).toEqual(['applied'])
  })

  it('supersedes an unused instruction, keeps a used one, and Continue pins the newest', async () => {
    const kit = steeringKit(4)
    const task = kit.paused()
    const a = kit.steer(task.id, 2, kit.instruction('A')).steering
    const b = kit.steer(task.id, 2, kit.instruction('B')).steering
    expect(kit.tasks.listSteerings(task.id).map((steering) => steering.state)).toEqual([
      'superseded',
      'accepted'
    ])

    const third = kit.hold(3)
    kit.control(task.id, 'continue')
    await third.started
    const c = kit.steer(task.id, 4, kit.instruction('C')).steering
    third.release()
    await kit.tasks.idle()

    expect([1, 2, 3, 4].map((n) => kit.pinned(task.id, n))).toEqual([null, 'B', 'B', 'C'])
    const states = new Map(kit.tasks.listSteerings(task.id).map((s) => [s.id, s.state]))
    expect([states.get(a.id), states.get(b.id), states.get(c.id)]).toEqual([
      'superseded',
      'applied',
      'applied'
    ])
  })

  it('a retried chapter keeps the snapshot it pinned before the steering', async () => {
    const kit = steeringKit(2)
    kit.translations.failOn = 1
    const task = kit.create()
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).items.map((item) => item.state)).toEqual(['failed', 'completed'])
    expect(kit.tasks.get(task.id).task.state).toBe('partially_completed')

    // Chapter 1 already pinned and chapter 2 is done: nothing left that has not run.
    kit.control(task.id, 'retry')
    expect(() => kit.steer(task.id, 1, kit.instruction('Giữ câu ngắn.'))).toThrow(
      /Không còn chương chưa chạy/
    )
    await kit.tasks.idle()
    expect(kit.pinned(task.id, 1)).toBeNull()
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
  })
})

describe('steering: addressing from chapter E', () => {
  function withPair(kit: ReturnType<typeof steeringKit>, fromChapter?: number) {
    return kit.library.withWork(kit.work.id, (db) => {
      const a = createCharacter(db, { source: '韩立', target: 'Hàn Lập', gender: 'male' })
      const b = createCharacter(db, { source: '南宫婉', target: 'Nam Cung Uyển', gender: 'female' })
      setDyad(db, {
        sourceCharacterId: a.id,
        targetCharacterId: b.id,
        speakerPronoun: 'ta',
        recipientPronoun: 'ngươi',
        fromChapterId: fromChapter ? kit.chapters[fromChapter - 1]!.id : null
      })
      return { a, b }
    })
  }
  const pairsAt = (kit: ReturnType<typeof steeringKit>, n: number) =>
    kit.library.withWork(kit.work.id, (db) =>
      listDyads(db, { chapterId: kit.chapters[n - 1]!.id, status: 'approved' }).map(
        (dyad) => dyad.recipientPronoun
      )
    )
  const change = (a: { id: string }, b: { id: string }) => ({
    kind: 'addressing' as const,
    speakerCharacterId: a.id,
    listenerCharacterId: b.id,
    speakerPronoun: 'anh',
    recipientPronoun: 'em'
  })

  it('closes the old pair before E and starts the new one at E, and a cancel keeps both', async () => {
    const kit = steeringKit(4)
    const { a, b } = withPair(kit)
    const task = kit.paused()
    const result = kit.steer(task.id, 3, change(a, b))
    expect(result.steering).toMatchObject({ kind: 'context_ref', state: 'accepted' })
    expect([1, 2, 3, 4].map((n) => pairsAt(kit, n))).toEqual([['ngươi'], ['ngươi'], ['em'], ['em']])

    kit.control(task.id, 'cancel')
    await kit.tasks.idle()
    expect([1, 2, 3, 4].map((n) => pairsAt(kit, n))).toEqual([['ngươi'], ['ngươi'], ['em'], ['em']])
  })

  it('refuses when the old pair starts at E', async () => {
    const kit = steeringKit(4)
    const { a, b } = withPair(kit, 3)
    const task = kit.paused()
    expect(() => kit.steer(task.id, 3, change(a, b))).toThrow(/bắt đầu từ chương này/)
    expect(kit.tasks.listSteerings(task.id)).toEqual([])
    expect(pairsAt(kit, 3)).toEqual(['ngươi'])
    await kit.tasks.idle()
  })

  it('a resend after the library write failed finds the pair and writes the record once', async () => {
    const kit = steeringKit(4)
    const { a, b } = withPair(kit)
    const task = kit.paused()
    const id = command()
    const spy = vi.spyOn(kit.repository, 'createSteering').mockImplementationOnce(() => {
      throw new Error('library down')
    })
    expect(() => kit.steer(task.id, 3, change(a, b), id)).toThrow('library down')
    spy.mockRestore()
    expect(pairsAt(kit, 3)).toEqual(['em'])

    const resent = kit.steer(task.id, 3, change(a, b), id)
    expect(resent.steering.contextRef).toMatchObject({ closedDyadId: expect.any(String) })
    const all = kit.library.withWork(kit.work.id, (db) => listDyads(db))
    expect(all).toHaveLength(2)
    expect(kit.tasks.listSteerings(task.id)).toHaveLength(1)
    await kit.tasks.idle()
  })
})

describe('steering: a term from chapter E', () => {
  const targetsAt = (kit: ReturnType<typeof steeringKit>, n: number) =>
    kit.library.withWork(kit.work.id, (db) =>
      getEffectiveGlossary(db, kit.chapters[n - 1]!.id).map((entry) => entry.target)
    )

  it('closes the term before E and starts the new one at E; a resend after a failure makes one', async () => {
    const kit = steeringKit()
    const task = kit.paused()
    const entry = kit.library.withWork(kit.work.id, (db) =>
      createContextEntry(db, { source: '記憶遡行', target: 'Hồi tưởng' })
    )
    const change = { kind: 'term' as const, entryId: entry.id, target: 'Truy Hồi Ký Ức' }
    const id = command()
    const spy = vi.spyOn(kit.repository, 'createSteering').mockImplementationOnce(() => {
      throw new Error('library down')
    })
    expect(() => kit.steer(task.id, 3, change, id)).toThrow('library down')
    spy.mockRestore()

    const resent = kit.steer(task.id, 3, change, id)
    expect(resent.steering.contextRef).toMatchObject({ closedEntryId: entry.id })
    expect(targetsAt(kit, 2)).toEqual(['Hồi tưởng'])
    expect(targetsAt(kit, 3)).toEqual(['Truy Hồi Ký Ức'])
    expect(
      kit.library.withWork(kit.work.id, (db) => listContextEntries(db, { kind: 'term' }))
    ).toHaveLength(2)
    expect(kit.tasks.listSteerings(task.id)).toHaveLength(1)
    await kit.tasks.idle()
  })

  it('refuses when the term starts at E', async () => {
    const kit = steeringKit()
    const task = kit.paused()
    const entry = kit.library.withWork(kit.work.id, (db) =>
      createContextEntry(db, {
        source: '記憶遡行',
        target: 'Hồi tưởng',
        fromChapterId: kit.chapters[2]!.id
      })
    )
    expect(() =>
      kit.steer(task.id, 3, { kind: 'term', entryId: entry.id, target: 'Truy Hồi Ký Ức' })
    ).toThrow(/bắt đầu từ chương này/)
    expect(kit.tasks.listSteerings(task.id)).toHaveLength(0)
    await kit.tasks.idle()
  })
})

describe('steering from chat', () => {
  it('reads the current instruction, waits for approval, then reports the chapter it applies from', async () => {
    const kit = steeringKit(3)
    const first = kit.hold(1)
    const task = kit.create()
    await first.started
    kit.steer(task.id, 3, kit.instruction('Giữ câu ngắn.'))
    const chat = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: new AgentRepository(kit.library.appDb),
      registry: kit.registry,
      tasks: kit.tasks,
      openChatModel: (selection) => kit.model.open(selection)
    })
    kit.model.script(
      callTools({ name: 'read_translation_tasks', args: { target: 'ctx' } }),
      (request) => {
        const [read] = JSON.parse(request.messages.at(-1)!.content).value
        expect(read.currentInstruction).toBe('Giữ câu ngắn.')
        return callTools({
          name: 'steer_translation_task',
          args: {
            taskId: task.id,
            fromChapter: 1,
            instruction: 'Giữ câu ngắn. Lời thoại suồng sã.'
          }
        })
      }
    )
    const res = await chat.send({
      instruction: 'từ chương 1 cho lời thoại suồng sã hơn',
      context: { workId: kit.work.id },
      modelSelection: kit.modelSelection
    })
    expect(res.status).toBe('waiting_user')
    expect(kit.tasks.listSteerings(task.id)).toHaveLength(1)

    const [pending] = chat.getSessionDetail(res.sessionId).pending
    kit.model.script((request) => {
      const result = JSON.parse(request.messages.at(-1)!.content).value
      return say(`Áp dụng từ ${result.appliesFrom}.`)
    })
    const resumed = await chat.send({
      continuesTurnId: res.turnId,
      pendingReply: {
        toolCallId: pending!.toolCallId,
        argsDigest: pending!.argsDigest,
        choice: 'approve'
      },
      instruction: 'Duyệt',
      modelSelection: kit.modelSelection,
      commandId: 'approve-steer'
    })
    expect(resumed.status).toBe('completed')
    expect(resumed.answer).toBe('Áp dụng từ Chương 2.')
    expect(kit.tasks.get(task.id).currentInstruction).toBe('Giữ câu ngắn. Lời thoại suồng sã.')
    first.release()
    await kit.tasks.idle()
  })
})

describe('steering: a 10-chapter task end to end', () => {
  it('pins each chapter with the instruction in effect when it started, across a restart', async () => {
    const kit = steeringKit(10)
    const task = kit.paused()
    // Before any chapter started.
    expect(kit.steer(task.id, 3, kit.instruction('A')).effectiveFrom.chapterLabel).toBe('Chương 3')

    // Exactly while chapter 5 starts: it keeps A, the steering lands on chapter 6.
    const fifth = kit.hold(5)
    kit.control(task.id, 'continue')
    await fifth.started
    expect(kit.steer(task.id, 5, kit.instruction('B')).effectiveFrom.chapterLabel).toBe('Chương 6')

    // After chapter 7 ran and while 8 runs: asked from 7, applies from 9.
    const eighth = kit.hold(8)
    fifth.release()
    await eighth.started
    expect(kit.steer(task.id, 7, kit.instruction('C')).effectiveFrom.chapterLabel).toBe('Chương 9')

    // Quit while chapter 8 runs, reopen, Continue.
    kit.tasks.shutdown()
    eighth.release()
    const restarted = kit.make()
    kit.services.agent.reconcileOnStartup()
    restarted.reconcileOnStartup()
    expect(restarted.get(task.id).task).toMatchObject({ state: 'paused', reason: 'app_closed' })
    restarted.control({
      taskId: task.id,
      command: 'continue',
      stateVersion: restarted.get(task.id).task.stateVersion,
      clientCommandId: command()
    })
    await restarted.idle()

    const detail = restarted.get(task.id)
    expect(detail.task.state).toBe('completed')
    expect(detail.items.map((item) => item.instruction)).toEqual([
      null,
      null,
      'A',
      'A',
      'A',
      'B',
      'B',
      'B',
      'C',
      'C'
    ])
    expect(detail.steerings.map((s) => [s.effectiveLabel, s.state])).toEqual([
      ['Chương 3', 'applied'],
      ['Chương 6', 'applied'],
      ['Chương 9', 'applied']
    ])
    expect(kit.promptsOf(9).every((prompt) => prompt.includes('task_instruction'))).toBe(true)
    expect(kit.promptsOf(1).some((prompt) => prompt.includes('task_instruction'))).toBe(false)
  })
})
