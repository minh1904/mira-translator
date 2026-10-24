import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createContextEntry } from '../../infra/storage/contextEntries'
import { setupAgent } from './agentTestKit'
import { steerTranslationTaskCapability } from './capabilities/taskCapabilities'
import { termSteeringChange } from './steeringTerm'

describe('steering a term from chat', () => {
  it('finds the term that applies at the chapter by its source or an alias', () => {
    const kit = setupAgent()
    const work = kit.library.create({ title: 'Thử', sourceLang: 'ja' })
    const chapters = [1, 2, 3].map((n) => kit.library.createChapter(work.id, `Chương ${n}`).chapter)
    const ids = kit.library.withWork(work.id, (db) => ({
      early: createContextEntry(db, {
        source: '記憶遡行',
        target: 'Hồi tưởng',
        aliases: ['遡行'],
        toChapterId: chapters[1]!.id
      }).id,
      late: createContextEntry(db, {
        source: '記憶遡行',
        target: 'Truy Hồi',
        aliases: ['遡行'],
        fromChapterId: chapters[2]!.id
      }).id
    }))
    expect(
      termSteeringChange(kit.library, work.id, 2, { source: '遡行', target: 'Truy Hồi Ký Ức' })
    ).toEqual({
      kind: 'term',
      entryId: ids.early,
      target: 'Truy Hồi Ký Ức'
    })
    expect(
      termSteeringChange(kit.library, work.id, 3, { source: '記憶遡行', target: 'X' }).entryId
    ).toBe(ids.late)
    expect(() =>
      termSteeringChange(kit.library, work.id, 2, { source: '魔法', target: 'Ma pháp' })
    ).toThrow(/Không có thuật ngữ "魔法"/)
  })

  it('takes exactly one of an instruction and a term', () => {
    const parse = (args: object) =>
      v.safeParse(steerTranslationTaskCapability.schema, { taskId: 't', fromChapter: 8, ...args })
        .success
    expect(parse({ instruction: 'Giữ câu ngắn.' })).toBe(true)
    expect(parse({ term: { source: '記憶遡行', target: 'Truy Hồi Ký Ức' } })).toBe(true)
    expect(parse({})).toBe(false)
    expect(parse({ instruction: 'A', term: { source: 'x', target: 'y' } })).toBe(false)
  })
})
