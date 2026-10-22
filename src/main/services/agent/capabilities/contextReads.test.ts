import { describe, expect, it } from 'vitest'
import { createCharacter, setDyad } from '../../../infra/storage/addressingEntries'
import { createContextEntry } from '../../../infra/storage/contextEntries'
import { callTools, say, setupAgent } from '../agentTestKit'

type Kit = ReturnType<typeof setupAgent>

function seed({ library, work1, ch1_2, ch1_amb1 }: Kit) {
  library.withWork(work1.id, (db) => {
    createContextEntry(db, { kind: 'term', source: '林动', target: 'Lâm Động' })
    createContextEntry(db, {
      kind: 'term',
      source: '青阳',
      target: 'Thanh Dương',
      fromChapterId: ch1_2.id,
      toChapterId: ch1_amb1.id
    })
    createContextEntry(db, {
      kind: 'term',
      source: '岩城',
      target: 'Nham Thành',
      status: 'pending'
    })
    const a = createCharacter(db, { source: '林动', target: 'Lâm Động' })
    const b = createCharacter(db, { source: '林琅天', target: 'Lâm Lang Thiên' })
    setDyad(db, {
      sourceCharacterId: a.id,
      targetCharacterId: b.id,
      speakerPronoun: 'ta',
      recipientPronoun: 'ngươi',
      fromChapterId: ch1_2.id
    })
  })
}

describe('glossary and addressing reads', () => {
  it('reads the approved glossary of a work with the chapter range of each entry', async () => {
    const kit = setupAgent()
    seed(kit)
    kit.model.script(callTools({ name: 'list_glossary', args: { target: 'ctx' } }), say('Xong.'))
    await kit.agent.send({
      instruction: 'glossary có gì?',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })

    const result = kit.model.lastToolResult()
    expect(result.ok).toBe(true)
    const entries = result.value as Array<Record<string, unknown>>
    expect(entries.map((e) => e.source).sort()).toEqual(['林动', '青阳'])
    expect(entries.find((e) => e.source === '青阳')).toMatchObject({
      target: 'Thanh Dương',
      fromChapter: 2,
      toChapter: 3
    })
    expect(entries.find((e) => e.source === '林动')).toMatchObject({
      fromChapter: null,
      toChapter: null
    })
    expect(JSON.stringify(result.value)).not.toContain(kit.ch1_2.id)
  })

  it('still reads the entries in effect for a chapter handle', async () => {
    const kit = setupAgent()
    seed(kit)
    kit.model.script(callTools({ name: 'list_glossary', args: { target: 'ctx' } }), say('Xong.'))
    await kit.agent.send({
      instruction: 'glossary chương này?',
      context: { workId: kit.work1.id, chapterId: kit.ch1_1.id },
      modelSelection: kit.modelSelection
    })

    // Chapter 1 sits before the range of 青阳, so only the open-ended entry applies.
    const entries = kit.model.lastToolResult().value as Array<{ source: string }>
    expect(entries.map((e) => e.source)).toEqual(['林动'])
  })

  it('reads the approved addressing pairs of a work with the chapters they apply from', async () => {
    const kit = setupAgent()
    seed(kit)
    kit.model.script(callTools({ name: 'list_addressing', args: { target: 'ctx' } }), say('Xong.'))
    await kit.agent.send({
      instruction: 'xưng hô thế nào?',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })

    const result = kit.model.lastToolResult()
    expect(result.ok).toBe(true)
    expect(result.value).toEqual([
      expect.objectContaining({
        speaker: 'Lâm Động',
        recipient: 'Lâm Lang Thiên',
        speakerPronoun: 'ta',
        recipientPronoun: 'ngươi',
        fromChapter: 2,
        toChapter: null
      })
    ])
  })
})

describe('read errors', () => {
  it('names the chapter handle read_chapter needs when it gets a work', async () => {
    const kit = setupAgent()
    kit.model.script(
      callTools({ name: 'read_chapter', args: { target: 'ctx', side: 'source' } }),
      say('Cần chương.')
    )
    await kit.agent.send({
      instruction: 'đọc chương',
      context: { workId: kit.work1.id },
      modelSelection: kit.modelSelection
    })

    const result = kit.model.lastToolResult()
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('validation')
    expect(result.error?.message).toContain('handle chương')
    expect(result.error?.message).toContain('resolve_target')
    expect(result.error?.message).toContain('Đại Đạo Triều Thiên')
  })
})
