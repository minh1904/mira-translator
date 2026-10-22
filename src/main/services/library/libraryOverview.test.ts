import { afterEach, describe, expect, it } from 'vitest'
import { createCharacter, setDyad } from '../../infra/storage/addressingEntries'
import { createContextEntry } from '../../infra/storage/contextEntries'
import { createTempDirs } from '../../testing/testing'
import { LibraryStore } from './library'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function setup() {
  let clock = 1_000
  const store = LibraryStore.open({ dataDir: tempDir(), now: () => clock++ })
  stores.push(store)
  const work = store.create({ title: 'New', sourceLang: 'zh-Hans' })
  const chapters = [1, 2, 3].map((n) => store.createChapter(work.id, `Chương ${n}`).chapter)
  return { store, workId: work.id, chapters }
}

describe('translation progress', () => {
  it('counts a work without translation as untranslated from chapter 1', () => {
    const { store, workId } = setup()
    expect(store.translationProgress(workId)).toEqual({
      chapterCount: 3,
      translatedChapters: 0,
      firstUntranslatedNumber: 1
    })
  })

  it('counts chapters with a translated segment and finds the first one without', () => {
    const { store, workId, chapters } = setup()
    store.saveText(workId, chapters[0]!.id, 'source', 'Một.', 0, [{ start: 0, end: 4 }])
    store.saveText(workId, chapters[0]!.id, 'target', 'Một.', 0, [{ start: 0, end: 4 }])
    store.saveText(workId, chapters[2]!.id, 'target', 'Ba.', 0, [{ start: 0, end: 3 }])

    expect(store.translationProgress(workId)).toEqual({
      chapterCount: 3,
      translatedChapters: 2,
      firstUntranslatedNumber: 2
    })
  })

  it('reports no untranslated chapter once every chapter has a translated segment', () => {
    const { store, workId, chapters } = setup()
    for (const chapter of chapters) {
      store.saveText(workId, chapter.id, 'target', 'Dịch.', 0, [{ start: 0, end: 5 }])
    }
    expect(store.translationProgress(workId)).toMatchObject({
      translatedChapters: 3,
      firstUntranslatedNumber: null
    })
  })

  it('handles a work without chapters', () => {
    const store = LibraryStore.open({ dataDir: tempDir(), now: () => 1 })
    stores.push(store)
    const work = store.create({ title: 'Trống', sourceLang: 'ja' })
    expect(store.translationProgress(work.id)).toEqual({
      chapterCount: 0,
      translatedChapters: 0,
      firstUntranslatedNumber: null
    })
  })
})

describe('context counts', () => {
  it('counts glossary entries by status and only approved addressing pairs', () => {
    const { store, workId } = setup()
    expect(store.contextCounts(workId)).toEqual({
      glossary: { approved: 0, pending: 0, rejected: 0 },
      addressingPairs: 0
    })

    store.withWork(workId, (db) => {
      createContextEntry(db, { kind: 'term', source: '林动', target: 'Lâm Động' })
      createContextEntry(db, {
        kind: 'term',
        source: '岩城',
        target: 'Nham Thành',
        status: 'pending'
      })
      createContextEntry(db, {
        kind: 'term',
        source: '青阳',
        target: 'Thanh Dương',
        status: 'pending'
      })
      const a = createCharacter(db, { source: '林动', target: 'Lâm Động' })
      const b = createCharacter(db, { source: '林琅天', target: 'Lâm Lang Thiên' })
      setDyad(db, {
        sourceCharacterId: a.id,
        targetCharacterId: b.id,
        speakerPronoun: 'ta',
        recipientPronoun: 'ngươi'
      })
    })

    expect(store.contextCounts(workId)).toEqual({
      glossary: { approved: 1, pending: 2, rejected: 0 },
      addressingPairs: 1
    })
  })

  it('lists approved terms and pairs of the whole work with their chapter range', () => {
    const { store, workId, chapters } = setup()
    store.withWork(workId, (db) => {
      createContextEntry(db, { kind: 'term', source: '林动', target: 'Lâm Động' })
      createContextEntry(db, {
        kind: 'term',
        source: '青阳',
        target: 'Thanh Dương',
        fromChapterId: chapters[1]!.id
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
        toChapterId: chapters[0]!.id
      })
    })

    const terms = store.listApprovedGlossary(workId)
    expect(terms.map((t) => t.source).sort()).toEqual(['林动', '青阳'])
    expect(terms.find((t) => t.source === '青阳')?.fromChapterId).toBe(chapters[1]!.id)

    const pairs = store.listApprovedAddressing(workId)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({
      speakerPronoun: 'ta',
      toChapterId: chapters[0]!.id,
      sourceCharacter: { target: 'Lâm Động' }
    })
  })
})
