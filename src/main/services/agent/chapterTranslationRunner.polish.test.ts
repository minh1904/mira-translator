import { describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import { setupAgent } from './agentTestKit'
import { runChapterTranslation, type ChapterTranslationRunInput } from './chapterTranslationRunner'

/** A chapter of three one-sentence paragraphs, translated one batch per paragraph. */
function threeBatches() {
  const kit = setupAgent()
  kit.services.connections.updateEntry(kit.modelSelection.entryId, {
    settings: { inputTokenLimit: 1 }
  })
  const chapter = kit.library.createChapter(kit.work1.id, 'Ba đoạn').chapter
  const text = 'Một.\n\nHai.\n\nBa.'
  kit.library.saveText(kit.work1.id, chapter.id, 'source', text, 0, segment(text, 'zh-Hans'))
  const run = (extra: Partial<ChapterTranslationRunInput> = {}) =>
    runChapterTranslation({
      library: kit.library,
      connections: kit.services.connections,
      workId: kit.work1.id,
      chapterId: chapter.id,
      operationId: 'op-1',
      modelSelection: kit.modelSelection,
      policy: 'fill_untranslated',
      ...extra
    })
  const target = () => kit.library.readText(kit.work1.id, chapter.id, 'target').content
  return { ...kit, chapter, run, target }
}

const edit = (id: string, dst: string, over: Record<string, unknown> = {}) => ({
  id,
  issue: 'literal',
  gain: 'cao',
  note: 'x',
  dst,
  ...over
})

describe('runChapterTranslation polish step', () => {
  it('rewrites the rows it just translated, inside the same operation, and counts the call', async () => {
    const { run, translations, library, work1, target } = threeBatches()
    translations.polish = (items) =>
      items.filter((item) => item.src === 'Hai.').map((item) => edit(item.id, 'Hai, đã chỉnh.'))
    let calls = 0
    const result = await run({
      polish: true,
      onUsage: (_usage, used) => {
        calls = used
      }
    })
    expect(result).toMatchObject({ state: 'completed', appliedUnits: 3, polishedUnits: 1 })
    expect(result.summary).toContain('Trau chuốt sửa 1 câu')
    expect(target()).toContain('Hai, đã chỉnh.')
    expect(target()).not.toContain('Dịch: Hai.')
    expect(target()).toContain('Dịch: Một.')
    expect(calls).toBe(4)
    expect(translations.polishPrompts).toHaveLength(1)
    expect(library.readAgentOperationEvidence(work1.id, 'op-1')?.batches).toHaveLength(4)
  })

  it('does nothing unless asked', async () => {
    const { run, translations } = threeBatches()
    translations.polish = (items) => items.map((item) => edit(item.id, 'Khác.'))
    const result = await run()
    expect(result.polishedUnits).toBeUndefined()
    expect(translations.polishPrompts).toEqual([])
  })

  it('keeps edits that are low gain or that add a pronoun for another person out', async () => {
    const { run, translations, target } = threeBatches()
    translations.polish = (items) => [
      edit(items[0]!.id, 'Một, nhưng khác.', { gain: 'thấp' }),
      edit(items[1]!.id, 'Hai, thưa ngài.')
    ]
    const result = await run({ polish: true })
    expect(result).toMatchObject({ state: 'completed', polishedUnits: 0 })
    expect(target()).toContain('Dịch: Một.')
    expect(target()).toContain('Dịch: Hai.')
  })

  it('leaves the translation as written when the polish call fails', async () => {
    const { run, translations, target } = threeBatches()
    translations.polishFails = true
    const result = await run({ polish: true })
    expect(result).toMatchObject({ state: 'completed', appliedUnits: 3, polishedUnits: 0 })
    expect(target()).toContain('Dịch: Ba.')
    expect(translations.polishPrompts).toHaveLength(1)
  })

  it('polishes on the auxiliary model when one is set', async () => {
    const { run, translations, services, modelSelection, auxEntryId } = threeBatches()
    services.connections.setAuxiliaryModel({
      connectionId: modelSelection.connectionId,
      entryId: auxEntryId
    })
    await run({ polish: true })
    expect(translations.polishModels).toEqual(['aux-model'])
  })

  it('does not call the model once the task gate has used up its calls', async () => {
    const { run, translations } = threeBatches()
    let allowed = 3
    const result = await run({ polish: true, gate: () => allowed-- > 0 })
    expect(result).toMatchObject({ state: 'completed', appliedUnits: 3, polishedUnits: 0 })
    expect(translations.polishPrompts).toEqual([])
  })
})
