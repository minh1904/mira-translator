import { describe, expect, it } from 'vitest'
import type { ContextStrategy } from '../../../shared/contracts/agentTask'
import { segment } from '../../../shared/segmentation/segmenter'
import { listDyads } from '../../infra/storage/addressingEntries'
import { AgentRepository } from '../../infra/storage/agentRepository'
import { AgentTaskRepository } from '../../infra/storage/agentTaskRepository'
import type { ExtractionMessage } from '../ai/glossaryExtraction'
import { ContextExtractionService } from '../context/contextExtractionService'
import { setupAgent } from './agentTestKit'
import { AgentTaskService } from './taskService'
import { AgentWriteCoordinator } from './writeCoordinator'

let commands = 0
const command = () => `00000000-0000-4000-8000-${(++commands).toString().padStart(12, '0')}`

interface Term {
  source: string
  type: string
  target: string
}

const TEXTS = ['韩立来了。\n\n韩立走了。', '南宫婉来了。\n\n南宫婉走了。']

/**
 * Tasks over chapters that mention 韩立, with a scripted extraction model and the real runner. The
 * addressing analysis answers `analysis` (no pairs by default).
 */
function contextKit(
  terms: Term[],
  onCall?: () => void,
  texts = TEXTS,
  analysis: object = { characters: [], dyads: [] }
) {
  const kit = setupAgent()
  const chapters = texts.map((text, index) => {
    const chapter = kit.library.createChapter(kit.work1.id, `Thử ${index + 1}`).chapter
    kit.library.saveText(kit.work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
    return chapter
  })
  let extractionCalls = 0
  const extraction = new ContextExtractionService(kit.library, kit.services.connections, {
    caller: () => async (messages: ExtractionMessage[]) => {
      extractionCalls++
      onCall?.()
      const user = messages[1]!.content
      if (messages[0]!.content.includes('lập bảng xưng hô'))
        return { text: JSON.stringify(analysis), usage: null }
      const sweep = messages[0]!.content.startsWith('Bạn đọc truyện')
      const found = terms.filter((term) =>
        sweep ? user.includes(term.source) : user.includes(`source="${term.source}"`)
      )
      return {
        text: JSON.stringify({ terms: sweep ? found.map((term) => term.source) : found }),
        usage: null
      }
    }
  })
  let changes = 0
  const coordinator = new AgentWriteCoordinator(1_000)
  const operations = new AgentRepository(kit.library.appDb)
  const make = () => {
    const service = new AgentTaskService({
      library: kit.library,
      connections: kit.services.connections,
      tasks: new AgentTaskRepository(kit.library.appDb),
      operations,
      writeCoordinator: coordinator,
      extraction
    })
    service.connect({ publishIntent: () => [], changed: () => changes++ })
    return service
  }
  const tasks = make()
  const create = (contextStrategy: ContextStrategy | undefined, budget = {}) =>
    tasks.create({
      clientCommandId: command(),
      contextStrategy,
      workId: kit.work1.id,
      chapterIds: chapters.map((chapter) => chapter.id),
      modelSelection: kit.modelSelection,
      budget
    }).task
  const entries = () =>
    kit.library.withWork(kit.work1.id, (db) =>
      db.prepare('SELECT source, status FROM context_entry ORDER BY source').all()
    )
  const control = (service: AgentTaskService, taskId: string, verb: 'continue' | 'cancel') =>
    service.control({
      taskId,
      command: verb,
      stateVersion: service.get(taskId).task.stateVersion,
      clientCommandId: command()
    })
  return {
    ...kit,
    chapters,
    tasks,
    make,
    create,
    entries,
    control,
    extractionCalls: () => extractionCalls,
    changes: () => changes
  }
}

const HAN_LAP = { source: '韩立', type: 'person', target: 'Hàn Lập' }

describe('AgentTaskService: context before translating', () => {
  it('shows the extraction and tells the window while it runs, before any item starts', async () => {
    const seen: Array<{ calls: number; changes: number }> = []
    let probe = (): void => {}
    const kit = contextKit([HAN_LAP], () => probe())
    const task = kit.create('extract_then_review')
    probe = () =>
      seen.push({
        calls: kit.tasks.get(task.id).task.extracting?.calls ?? 0,
        changes: kit.changes()
      })
    await kit.tasks.idle()

    expect(seen.length).toBeGreaterThan(1)
    seen.forEach((each, index) => expect(each.calls).toBe(index + 1))
    // Every started call reached the window before the model answered.
    seen.forEach(
      (each, index) => index > 0 && expect(each.changes).toBeGreaterThan(seen[index - 1]!.changes)
    )
    expect(kit.tasks.get(task.id).task.extracting).toBeUndefined()
  })

  it('starts no item of the task while it extracts terms, even with free places', async () => {
    const seen: Array<{ running: number; requests: number }> = []
    let probe = (): void => {}
    const kit = contextKit([HAN_LAP], () => probe())
    const task = kit.create('extract_then_review')
    probe = () =>
      seen.push({
        running: kit.tasks.get(task.id).items.filter((item) => item.state === 'running').length,
        requests: kit.translations.requests.length
      })
    await kit.tasks.idle()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((each) => each.running === 0 && each.requests === 0)).toBe(true)
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
  })

  it('extracts terms and translates without stopping for review', async () => {
    const kit = contextKit([HAN_LAP])
    const task = kit.create('extract_then_review')
    await kit.tasks.idle()

    expect(kit.tasks.get(task.id).task.state).toBe('completed')
    expect(kit.entries()).toEqual([{ source: '韩立', status: 'approved' }])
    expect(kit.translations.requests.length).toBeGreaterThan(0)
    expect(kit.translations.prompts.some((prompt) => prompt.includes('Hàn Lập'))).toBe(true)
  })

  it('translates the first item without stopping when the scan finds nothing new', async () => {
    const kit = contextKit([])
    const task = kit.create('extract_then_review')
    await kit.tasks.idle()
    expect(kit.extractionCalls()).toBe(1) // both short chapters share one sweep chunk
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
  })

  // Default since 2026-10-14: no choice in the command means "extract first" for a work with no glossary.
  it('extracts first by default when the work has no glossary, and not once it has one', async () => {
    const kit = contextKit([HAN_LAP])
    const first = kit.create(undefined)
    expect(first.options.contextStrategy).toBe('extract_then_review')
    await kit.tasks.idle()
    expect(kit.tasks.get(first.id).task.state).toBe('completed')

    // The extracted candidate counts as a glossary: the next default task translates right away.
    const second = kit.create(undefined)
    expect(second.options.contextStrategy).toBe('approved_only')
    await kit.tasks.idle()
    expect(kit.tasks.get(second.id).task.state).toBe('completed')
  })

  it('never extracts for a task that translates with the approved context only', async () => {
    const kit = contextKit([HAN_LAP])
    const task = kit.create('approved_only')
    await kit.tasks.idle()
    expect(kit.extractionCalls()).toBe(0)
    expect(kit.entries()).toEqual([])
    expect(kit.tasks.get(task.id).task.state).toBe('completed')
  })

  it('keeps the candidates when a paused task is cancelled', async () => {
    const kit = contextKit([HAN_LAP])
    const task = kit.create('extract_then_review', { maxCalls: 2 })
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'budget' })
    kit.control(kit.tasks, task.id, 'cancel')
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task.state).toBe('cancelled')
    expect(kit.entries()).toEqual([{ source: '韩立', status: 'approved' }])
  })

  it('pauses for the call cap before the next extraction request, writing nothing', async () => {
    const kit = contextKit([HAN_LAP])
    const task = kit.create('extract_then_review', { maxCalls: 1 })
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task).toMatchObject({ state: 'paused', reason: 'budget' })
    expect(kit.extractionCalls()).toBe(1)
    expect(kit.translations.requests).toEqual([])
    expect(kit.entries()).toEqual([])
  })

  it('analyzes addressing after the terms, waits for both, and translates with the approved pair', async () => {
    const namCung = { source: '南宫婉', type: 'person', target: 'Nam Cung Uyển' }
    const texts = [
      '韩立来了。\n\n「南宫婉，我们走吧。」\n\n南宫婉笑了。\n\n「韩立师兄，等等我。」',
      '南宫婉来了。\n\n南宫婉走了。'
    ]
    const kit = contextKit([HAN_LAP, namCung], undefined, texts, {
      characters: [{ source: '南宫婉', gender: 'female', thirdPerson: 'nàng' }],
      dyads: [
        {
          from: '韩立',
          to: '南宫婉',
          self: 'ta',
          address: 'Nam Cung sư muội',
          secondPerson: 'muội',
          evidence: ['ch1: 「南宫婉，我们走吧。」']
        },
        // No verbatim quote: dropped.
        {
          from: '南宫婉',
          to: '韩立',
          self: 'muội',
          address: 'sư huynh',
          evidence: ['ch1: 「师兄」']
        }
      ]
    })
    const task = kit.create('extract_then_review')
    await kit.tasks.idle()

    expect(kit.tasks.get(task.id).task.state).toBe('completed')
    const dyads = () => kit.library.withWork(kit.work1.id, (db) => listDyads(db))
    expect(dyads()).toEqual([
      expect.objectContaining({
        speakerPronoun: 'ta',
        recipientPronoun: 'Nam Cung sư muội',
        secondPerson: 'muội',
        status: 'approved'
      })
    ])
    expect(kit.translations.requests.length).toBeGreaterThan(0)
    expect(
      kit.translations.prompts.some((prompt) =>
        prompt.includes('Hàn Lập → Nam Cung Uyển: Hàn Lập tự xưng')
      )
    ).toBe(true)
  })

  it('makes no analysis call with fewer than two people who speak or are spoken to', async () => {
    const kit = contextKit([HAN_LAP], undefined, ['「韩立，走吧。」\n\n韩立走了。'])
    kit.create('extract_then_review')
    await kit.tasks.idle()
    expect(kit.extractionCalls()).toBe(2) // sweep and classify only
    expect(kit.library.withWork(kit.work1.id, (db) => listDyads(db))).toEqual([])
  })
})
