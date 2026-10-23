import { describe, expect, it } from 'vitest'
import { createCharacter, setDyad } from '../../../infra/storage/addressingEntries'
import { createContextEntry, saveExtraction } from '../../../infra/storage/contextEntries'
import { createRunContext, getRunContext } from '../../../infra/storage/translateRunContext'
import { setupAgent } from '../../agent/agentTestKit'
import { promptFromSnapshot, takeContextSnapshot } from './contextSnapshot'
import { buildTranslateRequest } from './translatePrompt'

/**
 * Characterization for changes `add-agent-context-workflow` and `unblock-auto-translate-context`: every
 * entry that is not rejected and whose scope holds the chapter reaches a snapshot, with no review step.
 */
function work(chapterCount: number) {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'Ngữ cảnh', sourceLang: 'zh-Hans' })
  const chapters = Array.from(
    { length: chapterCount },
    (_, index) => kit.library.createChapter(work.id, `Chương ${index + 1}`).chapter
  )
  const snapshotTerms = (chapterId: string) =>
    takeContextSnapshot(kit.library, work.id, chapterId, '')
      .snapshot.glossary.map((entry) => entry.source)
      .sort()
  return { ...kit, workId: work.id, chapters, snapshotTerms }
}

describe('context snapshot after extraction', () => {
  it('holds the 10 extracted terms plus earlier entries, not the two the model called not-a-term', () => {
    const { library, workId, chapters, snapshotTerms } = work(1)
    const sources = Array.from({ length: 12 }, (_, index) => `术语${index + 1}`)
    library.withWork(workId, (db) => {
      createContextEntry(db, { source: '旧词', target: 'từ cũ' })
      saveExtraction(db, {
        runId: 'run',
        model: 'm',
        promptHash: 'h',
        scannedChapterIds: [],
        candidates: sources.map((source, index) => ({
          source,
          target: index < 10 ? source + ' vi' : '',
          termType: 'term',
          status: index < 10 ? ('approved' as const) : ('rejected' as const),
          evidence: [{ chapterId: chapters[0]!.id, quote: source }]
        })),
        now: 5
      })
    })
    const terms = snapshotTerms(chapters[0]!.id)
    expect(terms).toHaveLength(11)
    expect(terms).toContain('旧词')
    for (const source of sources.slice(10)) expect(terms).not.toContain(source)
  })

  it('leaves an entry scoped to chapters 1–10 out of chapter 11', () => {
    const { library, workId, chapters, snapshotTerms } = work(11)
    library.withWork(workId, (db) =>
      createContextEntry(db, {
        source: '前期',
        target: 'tiền kỳ',
        fromChapterId: chapters[0]!.id,
        toChapterId: chapters[9]!.id
      })
    )
    expect(snapshotTerms(chapters[9]!.id)).toEqual(['前期'])
    expect(snapshotTerms(chapters[10]!.id)).toEqual([])
  })

  it('opens the scope when its end chapter is deleted; a pinned snapshot keeps what it had', () => {
    const { library, workId, chapters, snapshotTerms } = work(12)
    library.withWork(workId, (db) =>
      createContextEntry(db, { source: '前期', target: 'tiền kỳ', toChapterId: chapters[9]!.id })
    )
    const pinned = takeContextSnapshot(library, workId, chapters[10]!.id, '')
    library.withWork(workId, (db) =>
      createRunContext(db, {
        runKey: 'task:item-11',
        chapterId: chapters[10]!.id,
        snapshotJson: pinned.json,
        snapshotHash: pinned.hash,
        createdAt: 1
      })
    )

    library.deleteChapter(workId, chapters[9]!.id)

    expect(snapshotTerms(chapters[11]!.id)).toEqual(['前期'])
    const stored = library.withWork(workId, (db) => getRunContext(db, 'task:item-11'))
    expect(stored?.snapshotHash).toBe(pinned.hash)
    expect(JSON.parse(stored!.snapshotJson).glossary).toEqual([])
  })

  it('sends dialogue and narration pronouns as two labelled lines and replaces nothing', () => {
    const { library, workId, chapters } = work(1)
    const source = '韩父看着韩立。韩立说：“爹。”'
    library.withWork(workId, (db) => {
      const son = createCharacter(db, { source: '韩立', target: 'Hàn Lập', gender: 'male' })
      const father = createCharacter(db, {
        source: '韩父',
        target: 'Hàn phụ',
        gender: 'male',
        thirdPerson: 'ông'
      })
      setDyad(db, {
        sourceCharacterId: son.id,
        targetCharacterId: father.id,
        speakerPronoun: 'con',
        recipientPronoun: 'bố'
      })
    })
    const { snapshot } = takeContextSnapshot(library, workId, chapters[0]!.id, source)
    const request = buildTranslateRequest(promptFromSnapshot(snapshot, source, []), [
      { tempId: '[1]', originalId: 's1', text: source }
    ])
    const text = request.messages.map((message) => message.content).join('\n')
    // Dialogue: the pair line in <addressing>; narration: the character line in <characters>.
    expect(text).toMatch(/<addressing>[\s\S]*gọi Hàn phụ là "bố"[\s\S]*<\/addressing>/)
    expect(text).toMatch(/<characters>[\s\S]*narrator calls them "ông"[\s\S]*<\/characters>/)
    // The source text goes out untouched: no pronoun was substituted into it.
    expect(text).toContain(source)
  })
})
