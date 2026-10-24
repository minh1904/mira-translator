import { afterEach, describe, expect, it } from 'vitest'
import { segment } from '../../../../shared/segmentation/segmenter'
import { createCharacter, setDyad } from '../../../infra/storage/addressingEntries'
import { createTempDirs } from '../../../testing/testing'
import { GlossaryService } from '../../context/glossaryService'
import { LibraryStore } from '../../library/library'
import {
  canonicalJson,
  parseSnapshot,
  promptFromSnapshot,
  rebuildTranslateRequest,
  takeContextSnapshot
} from './contextSnapshot'
import { buildTranslateRequest } from './translatePrompt'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

const SOURCE = '韩立は南宫婉に言った。\n\n霊剣を抜いた。'

function setup(): { library: LibraryStore; workId: string; chapterId: string } {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  const work = library.create({ title: 'A', sourceLang: 'ja', genre: 'Tiên hiệp' })
  const chapter = library.createChapter(work.id, 'Một').chapter
  library.saveText(work.id, chapter.id, 'source', SOURCE, 0, segment(SOURCE, 'ja'))
  return { library, workId: work.id, chapterId: chapter.id }
}

function populate(library: LibraryStore, workId: string): void {
  const glossary = new GlossaryService(library, () => 1000)
  glossary.create(workId, { source: '霊剣', target: 'linh kiếm', status: 'approved' })
  glossary.create(workId, { source: '刀', target: 'đao', status: 'pending' })
  library.withWork(workId, (db) => {
    const a = createCharacter(db, { source: '韩立', target: 'Hàn Lập', gender: 'male' }, 1000)
    const b = createCharacter(
      db,
      { source: '南宫婉', target: 'Nam Cung Uyển', gender: 'female' },
      1000
    )
    createCharacter(db, { source: '厉飞雨', target: 'Lệ Phi Vũ', gender: 'male' }, 1000)
    setDyad(
      db,
      {
        sourceCharacterId: a.id,
        targetCharacterId: b.id,
        speakerPronoun: 'ta',
        recipientPronoun: 'nàng'
      },
      1000
    )
  })
}

describe('takeContextSnapshot', () => {
  it('gives the same hash for the same context', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const first = takeContextSnapshot(library, workId, chapterId, SOURCE)
    const again = takeContextSnapshot(library, workId, chapterId, SOURCE)
    expect(again.hash).toBe(first.hash)
    expect(again.json).toBe(first.json)
  })

  it('takes approved glossary only, and pairs and characters that are in the chapter', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const { snapshot } = takeContextSnapshot(library, workId, chapterId, SOURCE)
    expect(snapshot.glossary.map((entry) => entry.target)).toEqual(['linh kiếm'])
    expect(snapshot.characters.map((character) => character.target).sort()).toEqual([
      'Hàn Lập',
      'Nam Cung Uyển'
    ])
    expect(snapshot.dyads).toHaveLength(1)
    expect(snapshot.sourceLang).toBe('ja')
  })

  it('does not change for an edit to a character who is not in the chapter', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const before = takeContextSnapshot(library, workId, chapterId, SOURCE).hash
    library.withWork(workId, (db) =>
      createCharacter(db, { source: '墨大夫', target: 'Mặc đại phu' }, 2000)
    )
    expect(takeContextSnapshot(library, workId, chapterId, SOURCE).hash).toBe(before)
  })

  it('changes when an approved glossary entry is added', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const before = takeContextSnapshot(library, workId, chapterId, SOURCE).hash
    new GlossaryService(library, () => 2000).create(workId, {
      source: '言',
      target: 'nói',
      status: 'approved'
    })
    expect(takeContextSnapshot(library, workId, chapterId, SOURCE).hash).not.toBe(before)
  })
})

describe('canonicalJson', () => {
  it('sorts keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: 2 } })).toBe('{"a":{"c":2,"d":[3,1]},"b":1}')
  })
})

describe('rebuildTranslateRequest', () => {
  it('rebuilds the request of a batch with glossary, pairs, characters and previous paragraphs', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const record = takeContextSnapshot(library, workId, chapterId, SOURCE)
    const units = [{ id: 'u2', text: '霊剣を抜いた。' }]
    const previous = ['韩立は南宫婉に言った。']
    // What runBatch sent.
    const sent = buildTranslateRequest(
      promptFromSnapshot(record.snapshot, units[0].text, previous),
      [{ tempId: '[1]', originalId: 'u2', text: units[0].text }]
    )
    expect(sent.messages[1].content).toContain('linh kiếm')
    expect(sent.messages[1].content).toContain('Hàn Lập')
    expect(sent.messages[1].content).toContain('韩立は南宫婉に言った。')

    // Read back from what is stored: the snapshot JSON and the trace.
    const rebuilt = rebuildTranslateRequest(
      { previous, contextHash: sent.requestHash },
      parseSnapshot(record.json),
      units
    )
    expect(rebuilt.matches).toBe(true)
    expect(rebuilt.requestHash).toBe(sent.requestHash)
  })
})

describe('steering instruction in the snapshot', () => {
  it('leaves the snapshot and its hash as they were when there is no instruction', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const plain = takeContextSnapshot(library, workId, chapterId, SOURCE)
    expect(takeContextSnapshot(library, workId, chapterId, SOURCE, undefined).hash).toBe(plain.hash)
    expect(takeContextSnapshot(library, workId, chapterId, SOURCE, '').hash).toBe(plain.hash)
    expect(plain.json).not.toContain('instruction')
  })

  it('carries the pinned instruction into the prompt, and the comparison snapshot with it matches', () => {
    const { library, workId, chapterId } = setup()
    const pinned = takeContextSnapshot(library, workId, chapterId, SOURCE, 'Giữ câu ngắn.')
    expect(pinned.hash).not.toBe(takeContextSnapshot(library, workId, chapterId, SOURCE).hash)
    const snapshot = parseSnapshot(pinned.json)
    expect(promptFromSnapshot(snapshot, SOURCE, []).instruction).toBe('Giữ câu ngắn.')
    // What a batch compares with: the store now plus the pinned instruction, not a newer steering.
    expect(takeContextSnapshot(library, workId, chapterId, SOURCE, snapshot.instruction).hash).toBe(
      pinned.hash
    )

    const units = [{ id: 'u1', text: '霊剣を抜いた。' }]
    const sent = buildTranslateRequest(promptFromSnapshot(snapshot, units[0].text, []), [
      { tempId: '[1]', originalId: 'u1', text: units[0].text }
    ])
    const rebuilt = rebuildTranslateRequest(
      { previous: [], contextHash: sent.requestHash },
      parseSnapshot(pinned.json),
      units
    )
    expect(rebuilt.matches).toBe(true)
  })
})

describe('bối cảnh và văn hóa trong bản chụp', () => {
  it('bản chụp mới ghi bối cảnh chính, bối cảnh phụ và văn hóa đã quyết cho tác phẩm', () => {
    const { library, workId, chapterId } = setup()
    library.update(workId, { setting: 'court', settingsExtra: ['cultivation'], culture: 'zh' })
    const record = takeContextSnapshot(library, workId, chapterId, SOURCE)
    expect(record.snapshot.version).toBe(2)
    expect(record.snapshot.register).toEqual({
      setting: 'court',
      extra: ['cultivation'],
      culture: 'zh'
    })
    expect(promptFromSnapshot(record.snapshot, SOURCE, []).register).toEqual(
      record.snapshot.register
    )
  })

  it('đổi bối cảnh, bối cảnh phụ hoặc văn hóa đổi hash; cùng giá trị thì cùng hash', () => {
    const { library, workId, chapterId } = setup()
    const hashOf = (): string => takeContextSnapshot(library, workId, chapterId, SOURCE).hash
    const base = hashOf()
    library.update(workId, { setting: 'court' })
    const court = hashOf()
    expect(court).not.toBe(base)
    library.update(workId, { settingsExtra: ['cultivation'] })
    const extra = hashOf()
    expect(extra).not.toBe(court)
    library.update(workId, { culture: 'ja' })
    expect(hashOf()).not.toBe(extra)
    library.update(workId, { culture: null, settingsExtra: [], setting: null })
    expect(hashOf()).toBe(base)
  })

  it('thể loại của tác phẩm cho một bối cảnh thì bản chụp lấy bối cảnh đó và văn hóa theo ngôn ngữ nguồn', () => {
    const { library, workId, chapterId } = setup()
    // setup() tạo tác phẩm tiếng Nhật với thể loại "Tiên hiệp".
    expect(takeContextSnapshot(library, workId, chapterId, SOURCE).snapshot.register).toEqual({
      setting: 'cultivation',
      extra: [],
      culture: 'zh'
    })
  })

  it('bản chụp cũ có mã bảng phẳng đọc ra đúng bối cảnh và văn hóa, hash đã lưu không bị ghi lại', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const record = takeContextSnapshot(library, workId, chapterId, SOURCE)
    const legacy = { ...record.snapshot, version: 1, register: 'ja-fantasy' }
    const json = canonicalJson(legacy)
    const parsed = parseSnapshot(json)
    expect(parsed.register).toEqual({ setting: 'fantasy', extra: [], culture: 'ja' })
    // Đọc lại không đụng tới chuỗi đã lưu: hash của nó vẫn là hash của chính chuỗi đó.
    expect(json).toContain('"register":"ja-fantasy"')
    expect(parseSnapshot(canonicalJson({ ...legacy, register: null })).register).toEqual({
      setting: null,
      extra: [],
      culture: null
    })
    expect(parseSnapshot(canonicalJson({ ...legacy, register: 'ja-không-có' })).register).toEqual({
      setting: null,
      extra: [],
      culture: null
    })
  })

  it('dựng lại được request từ bản chụp cũ có mã bảng phẳng', () => {
    const { library, workId, chapterId } = setup()
    populate(library, workId)
    const record = takeContextSnapshot(library, workId, chapterId, SOURCE)
    const legacy = canonicalJson({ ...record.snapshot, version: 1, register: 'ja-modern' })
    const units = [{ id: 'u2', text: '霊剣を抜いた。' }]
    const rebuilt = rebuildTranslateRequest(
      { previous: [], contextHash: 'đã lưu' },
      parseSnapshot(legacy),
      units
    )
    expect(rebuilt.messages[0].content).toContain('<addressing_defaults>')
    expect(rebuilt.matches).toBe(false)
  })
})
