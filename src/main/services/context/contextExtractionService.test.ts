import { describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import {
  createContextEntry,
  getContextEntry,
  readReviewInfo
} from '../../infra/storage/contextEntries'
import { listEntryChanges } from '../../infra/storage/contextChanges'
import { listQuestions } from '../../infra/storage/contextQuestions'
import { createCharacter, listDyads, setDyad } from '../../infra/storage/addressingEntries'
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
  aliases?: string[]
  alias_of?: string
  /** `false`: the sweep does not return this form, so only the code candidates can find it. */
  swept?: boolean
}

/** A fake model: the sweep returns `forms`, the classification returns `terms` for the forms asked. */
function scriptedCaller(terms: Term[], revisions: unknown[] = [], analysis: unknown = null) {
  const sweeps: string[] = []
  const classifies: string[] = []
  let calls = 0
  let failOn: number | undefined
  const caller = () => async (messages: ExtractionMessage[]) => {
    calls++
    if (calls === failOn) throw new Error('provider down')
    const user = messages[1]!.content
    if (messages[0]!.content.startsWith('Bạn đọc truyện')) {
      sweeps.push(user)
      const forms = terms
        .filter((term) => term.swept !== false)
        .map((term) => term.source)
        .filter((form) => user.includes(form))
      return { text: JSON.stringify({ terms: forms }), usage: { input: 10, output: 5 } as never }
    }
    if (analysis && messages[0]!.content.includes('bảng xưng hô'))
      return { text: JSON.stringify(analysis), usage: { input: 10, output: 5 } as never }
    classifies.push(user)
    const asked = terms
      .filter((term) => user.includes(`source="${term.source}"`))
      .map(({ swept: _, ...term }) => term)
    const fixes = revisions.filter((fix) =>
      user.includes(`<entry source="${(fix as { source: string }).source}"`)
    )
    return {
      text: JSON.stringify({ terms: asked, revisions: fixes }),
      usage: { input: 10, output: 5 } as never
    }
  }
  return {
    caller,
    sweeps,
    classifies,
    calls: () => calls,
    failOn: (n: number) => {
      failOn = n
    }
  }
}

function setup(
  terms: Term[],
  texts: string[],
  sourceLang: 'zh-Hans' | 'ja' = 'zh-Hans',
  revisions: unknown[] = [],
  analysis: unknown = null
) {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'Truyện thử', sourceLang })
  const chapters = texts.map((text, index) => {
    const chapter = kit.library.createChapter(work.id, `Chương ${index + 1}`).chapter
    const full = text + '\n' + FILLER
    kit.library.saveText(work.id, chapter.id, 'source', full, 0, segment(full, sourceLang))
    return chapter
  })
  const model = scriptedCaller(terms, revisions, analysis)
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

describe('ContextExtractionService: counting, known entries and flags', () => {
  const rows = (kit: ReturnType<typeof setup>) =>
    kit.library.withWork(kit.work.id, (db) =>
      db.prepare('SELECT id, source, target FROM context_entry ORDER BY source').all<{
        id: string
        source: string
        target: string
      }>()
    )

  it('counts code candidates over every chapter up to the task, so a name once per chunk is classified', async () => {
    const kit = setup(
      [{ source: 'ミリィ', type: 'person', target: 'Milly', swept: false }],
      ['ミリィが来た。', 'ミリィが笑った。'],
      'ja'
    )
    const result = await kit.extract(kit.chapters.map((chapter) => chapter.id))
    // Chunk 1 has the name once: no classify call. Chunk 2 counts it twice.
    expect(kit.model.classifies).toHaveLength(1)
    expect(kit.model.classifies[0]).toContain('<candidate source="ミリィ" count="2">')
    expect(result.pending).toHaveLength(1)
  })

  it('never classifies a form an entry already has, and a sweep chunk skips the author note', async () => {
    const kit = setup(
      [{ source: '韩立', type: 'person', target: 'Hàn Lập' }],
      ['韩立来了。韩立走了。', '韩立又来了。', '第三章。\n――――――――\n请给个好评レビューお願い']
    )
    await kit.extract(kit.chapters.map((chapter) => chapter.id))
    expect(kit.model.classifies).toHaveLength(1)
    expect(kit.model.sweeps[1]).toContain('第三章')
    expect(kit.model.sweeps[1]).not.toContain('レビュー')
    expect(rows(kit).map((row) => row.source)).toEqual(['韩立'])
  })

  it('turns alias_of into an alias of the entry it names and sends the entry as known', async () => {
    const kit = setup(
      [{ source: 'ハルネ村', type: 'place', alias_of: 'ハルネ' }],
      ['ハルネ村に着いた。'],
      'ja'
    )
    const harune = kit.library.withWork(kit.work.id, (db) =>
      createContextEntry(db, { source: 'ハルネ', target: 'Harune' })
    )
    await kit.extract([kit.chapters[0]!.id])
    expect(kit.model.classifies[0]).toContain('<entry source="ハルネ" target="Harune">')
    expect(rows(kit).map((row) => row.source)).toEqual(['ハルネ'])
    expect(
      kit.library.withWork(kit.work.id, (db) => getContextEntry(db, harune.id))?.aliases
    ).toEqual(['ハルネ村'])
  })

  it('flags a new term off its family pattern and a short alias that hits a common word', async () => {
    const kit = setup(
      [
        { source: '銀級', type: 'title', target: 'Hạng Bạc' },
        { source: 'セラフィナ', type: 'person', target: 'Serafina', aliases: ['セラ'] }
      ],
      ['銀級の冒険者セラフィナ。セラが笑う。セラミックの皿。'],
      'ja'
    )
    const iron = kit.library.withWork(kit.work.id, (db) =>
      createContextEntry(db, { source: '鉄級', target: 'Cấp Sắt' })
    )
    const result = await kit.extract([kit.chapters[0]!.id])
    const info = kit.library.withWork(kit.work.id, (db) => readReviewInfo(db))
    const flags = (source: string) =>
      info.find((each) => each.entryId === rows(kit).find((row) => row.source === source)?.id)
        ?.flags ?? []
    expect(flags('銀級')).toEqual([{ code: 'family_mismatch' }])
    expect(flags('鉄級')).toEqual([])
    expect(flags('セラフィナ')).toEqual([{ code: 'short_alias', detail: 'セラ' }])
    expect(result.pending).toHaveLength(2)
    expect(
      kit.library.withWork(kit.work.id, (db) => getContextEntry(db, iron.id))?.aliases
    ).toEqual([])
  })
})

describe('ContextExtractionService: revisions of known entries', () => {
  const run = async (evidence: string) => {
    const kit = setup(
      [{ source: 'リオン', type: 'person', target: 'Rion' }],
      ['リオンが来た。ミリィ（Milly）が笑った。リオンが走る。'],
      'ja',
      [{ source: 'ミリィ', kind: 'correction', target: 'Milly', evidence: [evidence] }]
    )
    const milly = kit.library.withWork(kit.work.id, (db) =>
      createContextEntry(db, { source: 'ミリィ', target: 'Mili', origin: 'ai' })
    )
    await kit.extract([kit.chapters[0]!.id])
    return {
      kit,
      entry: kit.library.withWork(kit.work.id, (db) => getContextEntry(db, milly.id)),
      history: kit.library.withWork(kit.work.id, (db) => listEntryChanges(db, milly.id))
    }
  }

  it('applies a correction with a real quote and records the old value', async () => {
    const { kit, entry, history } = await run('ch1: ミリィ（Milly）が笑った。')
    expect(kit.model.classifies[0]).toContain('<entry source="ミリィ" target="Mili">')
    expect(entry?.target).toBe('Milly')
    expect(history[0]).toMatchObject({
      actor: 'ai',
      kind: 'correction',
      oldValue: 'Mili',
      newValue: 'Milly'
    })
  })

  it('drops a correction whose quote is not in the chunk', async () => {
    const { entry, history } = await run('ch1: ミリィはMillyと名乗った。')
    expect(entry?.target).toBe('Mili')
    expect(history.map((change) => change.kind)).toEqual(['create'])
  })
})

describe('ContextExtractionService: addressing that changes from a chapter', () => {
  it('closes the pair before the chapter and starts the new one there, with quotes from two chapters', async () => {
    const lines = [
      '「桐谷さん、おはよう」と美咲が言った。',
      '「彰、行こう」と美咲が言った。',
      '「彰、待って」と美咲が言った。'
    ]
    const kit = setup([], lines, 'ja', [], {
      characters: [],
      dyads: [
        {
          from: '美咲',
          to: '桐谷彰',
          self: 'tớ',
          address: 'Akira',
          fromChapter: 2,
          evidence: ['ch2: 「彰、行こう」と美咲が言った。', 'ch3: 「彰、待って」と美咲が言った。']
        }
      ]
    })
    const ids = kit.library.withWork(kit.work.id, (db) => {
      const misaki = createCharacter(db, { source: '美咲', target: 'Misaki' })
      const akira = createCharacter(db, {
        source: '桐谷彰',
        target: 'Kiritani Akira',
        aliases: ['桐谷', '彰']
      })
      const old = setDyad(db, {
        sourceCharacterId: misaki.id,
        targetCharacterId: akira.id,
        speakerPronoun: 'tôi',
        recipientPronoun: 'Kiritani-san'
      })
      return { old: old.id }
    })
    await kit.extract(kit.chapters.map((chapter) => chapter.id))
    const dyads = kit.library.withWork(kit.work.id, (db) => listDyads(db))
    expect(dyads.find((dyad) => dyad.id === ids.old)?.toChapterId).toBe(kit.chapters[0]!.id)
    expect(dyads.find((dyad) => dyad.id !== ids.old)).toMatchObject({
      speakerPronoun: 'tớ',
      recipientPronoun: 'Akira',
      fromChapterId: kit.chapters[1]!.id
    })
  })
})

describe('ContextExtractionService: questions it leaves', () => {
  it('a nickname next to a known name is a separate entry with a "may be one" question, and the run goes on', async () => {
    const kit = setup(
      [{ source: '翠風', type: 'person', target: 'Thúy Phong' }],
      ['翠風のシルフィアが現れた。翠風は笑った。'],
      'ja'
    )
    const sylphia = kit.library.withWork(kit.work.id, (db) =>
      createContextEntry(db, { source: 'シルフィア', target: 'Sylphia' })
    )
    const result = await kit.extract([kit.chapters[0]!.id])
    expect(result.state).toBe('completed')
    const questions = kit.library.withWork(kit.work.id, (db) => listQuestions(db))
    expect(questions).toEqual([
      expect.objectContaining({
        kind: 'merge',
        entrySource: '翠風',
        otherEntryId: sylphia.id,
        default: 'Hai mục khác nhau',
        evidence: [expect.objectContaining({ quote: '翠風のシルフィアが現れた。翠風は笑った。' })]
      })
    ])
  })

  it('contradicting gender quotes leave the character unknown with a question holding both', async () => {
    const lines = [
      '「少年モルグ、行くぞ」とセラが言った。「モルグ、待って」とセラが言った。',
      '「彼女、モルグは強い」とセラが言った。'
    ]
    const kit = setup([], lines, 'ja', [], {
      characters: [
        {
          source: 'モルグ',
          gender: 'female',
          genderEvidence: [
            'ch1: 「少年モルグ、行くぞ」とセラが言った。',
            'ch2: 「彼女、モルグは強い」とセラが言った。'
          ]
        }
      ],
      dyads: [
        {
          from: 'セラ',
          to: 'モルグ',
          self: 'tôi',
          address: 'Morg',
          evidence: ['ch1: 「モルグ、待って」とセラが言った。']
        }
      ]
    })
    kit.library.withWork(kit.work.id, (db) => {
      createCharacter(db, { source: 'モルグ', target: 'Morg' })
      createCharacter(db, { source: 'セラ', target: 'Sera' })
    })
    await kit.extract(kit.chapters.map((chapter) => chapter.id))
    const [question] = kit.library.withWork(kit.work.id, (db) => listQuestions(db))
    expect(question).toMatchObject({ kind: 'gender', entrySource: 'モルグ', default: 'Không rõ' })
    expect(question!.evidence.map((quote) => quote.quote)).toEqual([
      '「少年モルグ、行くぞ」とセラが言った。',
      '「彼女、モルグは強い」とセラが言った。'
    ])
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
