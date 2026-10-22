import { describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import { createContextEntry, readReviewInfo } from '../../infra/storage/contextEntries'
import { setupAgent } from '../agent/agentTestKit'
import type { ExtractionMessage } from '../ai/glossaryExtraction'
import {
  ContextExtractionService,
  extractionPromptHash,
  scriptMismatch
} from './contextExtractionService'

/** Each chapter is longer than half a sweep chunk, so every chapter is a chunk of its own. */
const FILLER = '风'.repeat(25_000)

interface Term {
  source: string
  type: string
  target?: string
  reason?: string
}

/** A fake model: the sweep returns `forms`, the classification returns `terms` for the forms asked. */
function scriptedCaller(terms: Term[]) {
  const sweeps: string[] = []
  let calls = 0
  let failOn: number | undefined
  const caller = () => async (messages: ExtractionMessage[]) => {
    calls++
    if (calls === failOn) throw new Error('provider down')
    const user = messages[1]!.content
    if (messages[0]!.content.startsWith('Bạn đọc truyện')) {
      sweeps.push(user)
      const forms = terms.map((term) => term.source).filter((form) => user.includes(form))
      return { text: JSON.stringify({ terms: forms }), usage: { input: 10, output: 5 } as never }
    }
    const asked = terms.filter((term) => user.includes(`source="${term.source}"`))
    return { text: JSON.stringify({ terms: asked }), usage: { input: 10, output: 5 } as never }
  }
  return {
    caller,
    sweeps,
    calls: () => calls,
    failOn: (n: number) => {
      failOn = n
    }
  }
}

function setup(terms: Term[], texts: string[]) {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'Truyện thử', sourceLang: 'zh-Hans' })
  const chapters = texts.map((text, index) => {
    const chapter = kit.library.createChapter(work.id, `Chương ${index + 1}`).chapter
    const full = text + '\n' + FILLER
    kit.library.saveText(work.id, chapter.id, 'source', full, 0, segment(full, 'zh-Hans'))
    return chapter
  })
  const model = scriptedCaller(terms)
  const service = new ContextExtractionService(kit.library, kit.services.connections, {
    caller: model.caller,
    now: () => 50
  })
  const extract = (ids: string[], extra = {}) =>
    service.extract({
      workId: work.id,
      chapterIds: ids,
      modelSelection: kit.modelSelection,
      ...extra
    })
  return { ...kit, work, chapters, model, service, extract }
}

describe('ContextExtractionService', () => {
  it('stores a new name from chapter 3 as pending with its quote, run, model and prompt hash', async () => {
    const { extract, chapters, library, work } = setup(
      [{ source: '韩立', type: 'person', target: 'Hàn Lập' }],
      ['平静的一天。', '无事。', '韩立走进山门。韩立笑了。']
    )
    const result = await extract(
      chapters.map((chapter) => chapter.id),
      { runId: 'run-a' }
    )
    expect(result).toMatchObject({ state: 'completed', calls: 4 })
    expect(result.pending).toHaveLength(1)
    const [info] = library.withWork(work.id, (db) => readReviewInfo(db, result.pending))
    expect(info).toMatchObject({ termType: 'person', flags: [] })
    expect(info!.evidence).toEqual([
      expect.objectContaining({
        runId: 'run-a',
        chapterId: chapters[2]!.id,
        quote: '韩立走进山门。韩立笑了。',
        model: 'mock-model',
        promptHash: extractionPromptHash('zh-Hans')
      })
    ])
    expect(
      library.withWork(work.id, (db) =>
        db.prepare('SELECT status, origin FROM context_entry').all()
      )
    ).toEqual([{ status: 'approved', origin: 'ai' }])
  })

  it('sends only chapters no run scanned yet', async () => {
    const { extract, chapters, model } = setup([], ['第一章。', '第二章。', '第三章。', '第四章。'])
    await extract([chapters[0]!.id, chapters[1]!.id])
    expect(model.sweeps).toHaveLength(2)
    await extract(chapters.map((chapter) => chapter.id))
    expect(model.sweeps).toHaveLength(4)
    expect(model.sweeps[2]).toContain('第三章')
    expect(model.sweeps[3]).toContain('第四章')
  })

  it('a failed call leaves existing entries alone and does not mark its chapter scanned', async () => {
    const { extract, chapters, model, service, library, work } = setup(
      [
        { source: '韩立', type: 'person', target: 'Hàn Lập' },
        { source: '南宫婉', type: 'person', target: 'Nam Cung Uyển' }
      ],
      ['韩立来了。韩立走了。', '南宫婉来了。南宫婉走了。']
    )
    library.withWork(work.id, (db) =>
      createContextEntry(db, { source: '墨大夫', target: 'Mặc đại phu' })
    )
    model.failOn(3) // chapter 1: sweep + classify; chapter 2: the sweep fails
    await expect(extract(chapters.map((chapter) => chapter.id))).rejects.toThrow('provider down')
    expect(
      service.unscanned(
        work.id,
        chapters.map((chapter) => chapter.id)
      )
    ).toEqual([chapters[1]!.id])
    const rows = library.withWork(work.id, (db) =>
      db.prepare('SELECT source, status FROM context_entry ORDER BY source').all()
    )
    expect(rows).toEqual([
      { source: '墨大夫', status: 'approved' },
      { source: '韩立', status: 'approved' }
    ])
  })

  it('stops for the task cap before the request and scans the rest on the next run', async () => {
    const { extract, chapters, model, service, work } = setup([], ['第一章。', '第二章。'])
    let allowed = 1
    const usages: Array<number> = []
    const result = await extract(
      chapters.map((chapter) => chapter.id),
      { gate: () => allowed-- > 0, onUsage: (_usage: unknown, calls: number) => usages.push(calls) }
    )
    expect(result).toMatchObject({ state: 'stopped', stopReason: 'budget', calls: 1 })
    expect(model.calls()).toBe(1)
    // Once when the call starts, once when it ends.
    expect(usages).toEqual([1, 1])
    expect(
      service.unscanned(
        work.id,
        chapters.map((chapter) => chapter.id)
      )
    ).toEqual([chapters[1]!.id])
    expect((await extract(chapters.map((chapter) => chapter.id))).state).toBe('completed')
    expect(model.sweeps.at(-1)).toContain('第二章')
  })

  it('flags a Chinese name in pinyin, keeps its target and stores not-a-term as rejected', async () => {
    const { extract, chapters, library, work } = setup(
      [
        { source: '李伟', type: 'person', target: 'Li Wei' },
        { source: '东西', type: 'not-a-term', reason: 'từ thông dụng' }
      ],
      ['李伟拿着东西。李伟放下东西。']
    )
    const result = await extract([chapters[0]!.id])
    const rows = library.withWork(work.id, (db) =>
      db.prepare('SELECT source, target, status FROM context_entry ORDER BY source').all()
    )
    expect(rows).toEqual([
      { source: '东西', target: '', status: 'rejected' },
      { source: '李伟', target: 'Li Wei', status: 'approved' }
    ])
    expect(library.withWork(work.id, (db) => readReviewInfo(db, result.pending))[0]?.flags).toEqual(
      [{ code: 'script_mismatch' }]
    )
  })
})

describe('scriptMismatch', () => {
  it('expects Latin for Japanese person names and Hán Việt for Chinese names', () => {
    expect(scriptMismatch('ja', 'person', 'Milly')).toBe(false)
    expect(scriptMismatch('ja', 'person', 'ミリィ')).toBe(true)
    expect(scriptMismatch('ja', 'skill', 'Hỏa cầu')).toBe(false)
    expect(scriptMismatch('zh-Hans', 'person', 'Hàn Lập')).toBe(false)
    expect(scriptMismatch('zh-Hans', 'place', 'Thiên Nam')).toBe(false)
    expect(scriptMismatch('zh-Hans', 'person', 'Li Wei')).toBe(true)
    expect(scriptMismatch('zh-Hans', 'person', 'Zhang San')).toBe(true)
    expect(scriptMismatch('zh-Hans', 'person', '韩立')).toBe(true)
    expect(scriptMismatch('zh-Hans', 'skill', 'Li Wei')).toBe(false)
  })
})
