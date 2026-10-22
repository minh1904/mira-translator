import { describe, expect, it } from 'vitest'
import type { AgentTaskDetailView, AgentTaskSummary } from '../../../../shared/contracts/agentTask'
import { createContextEntry } from '../../../infra/storage/contextEntries'
import { callTools, say, setupAgent } from '../agentTestKit'
import { getWorkOverviewCapability } from './readCapabilities'

describe('get_work_overview', () => {
  it('describes a freshly imported work in one call', async () => {
    const { agent, model, modelSelection, work1 } = setupAgent()
    model.script(callTools({ name: 'get_work_overview', args: { target: 'ctx' } }), say('Đã xem.'))
    const res = await agent.send({
      instruction: 'dịch toàn bộ truyện',
      context: { workId: work1.id },
      modelSelection
    })

    expect(res.status).toBe('completed')
    const result = model.lastToolResult()
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({
      title: 'Đại Đạo Triều Thiên',
      sourceLang: 'zh-Hans',
      chapterCount: 4,
      translatedChapters: 0,
      untranslatedChapters: 4,
      firstUntranslatedChapter: 1,
      glossary: { approved: 0, pending: 0, rejected: 0 },
      addressingPairs: 0,
      tasks: []
    })
    // Counts and labels only: no ID and no chapter text.
    expect(JSON.stringify(result.value)).not.toContain(work1.id)
    expect(JSON.stringify(result.value)).not.toContain('Đoạn một')
    expect(agent.listOperations(res.turnId)).toEqual([])
  })

  it('answers for the work of a chapter handle', async () => {
    const { agent, model, modelSelection, library, work1, ch1_1, ch1_2 } = setupAgent()
    library.saveText(work1.id, ch1_1.id, 'target', 'Dịch.', 0, [{ start: 0, end: 5 }])
    library.withWork(work1.id, (db) => {
      createContextEntry(db, { kind: 'term', source: '林动', target: 'Lâm Động' })
      createContextEntry(db, {
        kind: 'term',
        source: '岩城',
        target: 'Nham Thành',
        status: 'pending'
      })
    })
    model.script(callTools({ name: 'get_work_overview', args: { target: 'ctx' } }), say('Xong.'))
    await agent.send({
      instruction: 'tiến độ?',
      context: { workId: work1.id, chapterId: ch1_2.id },
      modelSelection
    })

    expect(model.lastToolResult().value).toMatchObject({
      title: 'Đại Đạo Triều Thiên',
      chapterCount: 4,
      translatedChapters: 1,
      firstUntranslatedChapter: 2,
      glossary: { approved: 1, pending: 1, rejected: 0 }
    })
  })

  it('is offered and runs in Ask mode without creating an operation', async () => {
    const { agent, model, modelSelection, work1 } = setupAgent()
    model.script(
      callTools({ name: 'get_work_overview', args: { target: 'ctx' } }),
      say('Có 4 chương.')
    )
    const res = await agent.send({
      instruction: 'truyện này có mấy chương?',
      context: { workId: work1.id },
      modelSelection,
      mode: 'ask'
    })

    const names = (model.requests[0]!.tools as Array<{ function: { name: string } }>).map(
      (tool) => tool.function.name
    )
    expect(names).toContain('get_work_overview')
    expect(res.status).toBe('completed')
    expect(agent.listToolCalls(res.turnId)).toEqual([
      expect.objectContaining({ name: 'get_work_overview', decision: 'allow', state: 'completed' })
    ])
    expect(agent.listOperations(res.turnId)).toEqual([])
  })

  it('lists the translation tasks of the work with state and chapter range', async () => {
    const { library, work1, ch1_1, ch1_2 } = setupAgent()
    const summary = {
      id: 'task-1',
      state: 'running',
      reason: null,
      counts: { pending: 1, running: 1, applied: 0, failed: 0 }
    } as unknown as AgentTaskSummary
    const detail = {
      items: [{ chapterId: ch1_2.id }, { chapterId: ch1_1.id }]
    } as unknown as AgentTaskDetailView
    const capability = getWorkOverviewCapability({ list: () => [summary], get: () => detail })
    const result = await capability.handler({
      turnId: 't',
      commandId: 'c',
      target: { kind: 'work', workId: work1.id, workLabel: 'Đại Đạo Triều Thiên' },
      args: {},
      library,
      now: 1
    })

    expect(result.value.tasks).toEqual([
      {
        state: 'running',
        reason: null,
        fromChapter: 1,
        toChapter: 2,
        chapters: summary.counts
      }
    ])
  })

  it('tells the model how to get a target when the handle is missing', async () => {
    const { library } = setupAgent()
    const result = await getWorkOverviewCapability().handler({
      turnId: 't',
      commandId: 'c',
      args: {},
      library,
      now: 1
    })
    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain('resolve_target')
  })
})
