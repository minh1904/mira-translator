import { afterEach, describe, expect, it } from 'vitest'
import { buildRows, type RowsView } from '../../../shared/contracts/rows'
import { segment } from '../../../shared/segmentation/segmenter'
import { StorageError } from './errors'
import { LibraryStore } from '../../services/library/library'
import { createTempDirs } from '../../testing/testing'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

// Rows 0-2 share the first line; rows 3-4 are on the last line, after a blank one.
const SOURCE = 'One. Two. Three.\n\nFour. Five.'

interface Rig {
  library: LibraryStore
  dataDir: string
  workId: string
  chapterId: string
  rows(): RowsView
  rev(): number
  write(index: number, text: string): ReturnType<LibraryStore['saveRow']>
  text(): string
}

function setup(): Rig {
  const dataDir = tempDir()
  const library = LibraryStore.open({ dataDir })
  stores.push(library)
  const work = library.create({ title: 'Thử', sourceLang: 'en' })
  const chapter = library.createChapter(work.id, 'Một').chapter
  library.saveText(work.id, chapter.id, 'source', SOURCE, 0, segment(SOURCE, 'en'))
  const rig: Rig = {
    library,
    dataDir,
    workId: work.id,
    chapterId: chapter.id,
    rows: () =>
      buildRows(
        library.readText(work.id, chapter.id, 'source'),
        library.readText(work.id, chapter.id, 'target'),
        library.listLinks(work.id, chapter.id)
      ),
    rev: () => library.readText(work.id, chapter.id, 'target').rev,
    write: (index, text) =>
      library.saveRow(work.id, {
        chapterId: chapter.id,
        sourceId: rig.rows().rows[index].sourceId,
        text,
        expectedRev: rig.rev()
      }),
    text: () => library.readText(work.id, chapter.id, 'target').content
  }
  return rig
}

function errorOf(fn: () => unknown): StorageError {
  try {
    fn()
  } catch (error) {
    if (error instanceof StorageError) return error
    throw error
  }
  throw new Error('expected a StorageError')
}

describe('writing a row', () => {
  it('starts the translation with the first row, which is then reviewed', () => {
    const rig = setup()
    const saved = rig.write(0, 'Một.')
    expect(saved.target.content).toBe('Một.')
    expect(saved.target.rev).toBe(1)
    expect(rig.rows().rows[0]).toMatchObject({ targetText: 'Một.', state: 'reviewed' })
    expect(rig.rows().counts).toMatchObject({ reviewed: 1, untranslated: 4 })
  })

  it('puts a next row on the same line after the one before it', () => {
    const rig = setup()
    rig.write(0, 'Một.')
    rig.write(1, 'Hai.')
    expect(rig.text()).toBe('Một. Hai.')
  })

  it('starts a new line where the source starts a new line', () => {
    const rig = setup()
    rig.write(0, 'Một.')
    rig.write(1, 'Hai.')
    rig.write(2, 'Ba.')
    rig.write(3, 'Bốn.')
    rig.write(4, 'Năm.')
    expect(rig.text()).toBe('Một. Hai. Ba.\n\nBốn. Năm.')
    expect(rig.rows().rows.map((row) => row.targetText)).toEqual([
      'Một.',
      'Hai.',
      'Ba.',
      'Bốn.',
      'Năm.'
    ])
  })

  it('writes a row in front of rows that are already translated without disturbing them', () => {
    const rig = setup()
    rig.write(1, 'Hai.')
    rig.write(2, 'Ba.')
    const before = rig.rows().rows.map((row) => row.targetIds)
    // Longer than either neighbour, so a careless split could hand its ID to the wrong sentence.
    rig.write(0, 'Một câu dịch dài hơn hẳn các câu bên cạnh nó.')
    expect(rig.text()).toBe('Một câu dịch dài hơn hẳn các câu bên cạnh nó. Hai. Ba.')
    const after = rig.rows().rows
    expect(after[1].targetIds).toEqual(before[1])
    expect(after[2].targetIds).toEqual(before[2])
    expect(after.slice(0, 3).map((row) => row.targetText)).toEqual([
      'Một câu dịch dài hơn hẳn các câu bên cạnh nó.',
      'Hai.',
      'Ba.'
    ])
  })

  it('writes a row between two translated rows', () => {
    const rig = setup()
    rig.write(0, 'Một.')
    rig.write(2, 'Ba.')
    rig.write(1, 'Hai.')
    expect(rig.text()).toBe('Một. Hai. Ba.')
  })

  it('writes a row between rows on different lines with the separators of its own source', () => {
    const rig = setup()
    rig.write(2, 'Ba.')
    rig.write(4, 'Năm.')
    expect(rig.text()).toBe('Ba.\n\nNăm.')
    rig.write(3, 'Bốn.')
    expect(rig.text()).toBe('Ba.\n\nBốn. Năm.')
    expect(
      rig
        .rows()
        .rows.slice(2)
        .map((row) => row.targetText)
    ).toEqual(['Ba.', 'Bốn.', 'Năm.'])
  })

  it('keeps the blank line when the row next to it is removed', () => {
    const rig = setup()
    for (const [i, text] of ['Một.', 'Hai.', 'Ba.', 'Bốn.'].entries()) rig.write(i, text)
    rig.write(3, '')
    rig.write(4, 'Năm.')
    expect(rig.text()).toBe('Một. Hai. Ba.\n\nNăm.')
  })

  it('replaces the text of a row that has one and keeps the others as they were', () => {
    const rig = setup()
    for (const [i, text] of ['Một.', 'Hai.', 'Ba.'].entries()) rig.write(i, text)
    const before = rig.rows().rows.map((row) => ({ ids: row.targetIds, links: row.linkIds }))
    rig.write(1, 'Hai nhé!')
    expect(rig.text()).toBe('Một. Hai nhé! Ba.')
    const after = rig.rows().rows
    expect(after[0]).toMatchObject({ targetIds: before[0].ids, linkIds: before[0].links })
    expect(after[2]).toMatchObject({ targetIds: before[2].ids, linkIds: before[2].links })
    expect(after[1].targetText).toBe('Hai nhé!')
    expect(after[1].state).toBe('reviewed')
  })

  it('turns a row of two sentences into two segments with one link', () => {
    const rig = setup()
    rig.write(0, 'Một. Hai.')
    const row = rig.rows().rows[0]
    expect(row.targetIds).toHaveLength(2)
    expect(row.linkIds).toHaveLength(1)
    expect(row.targetText).toBe('Một. Hai.')
  })

  it('makes one paragraph of a text with line breaks', () => {
    const rig = setup()
    rig.write(0, '  Một.\n  Hai.  ')
    expect(rig.text()).toBe('Một. Hai.')
  })

  it('removes the translation of a row on an empty text, leaving no stray space', () => {
    const rig = setup()
    for (const [i, text] of ['Một.', 'Hai.', 'Ba.'].entries()) rig.write(i, text)
    rig.write(1, '')
    expect(rig.text()).toBe('Một. Ba.')
    expect(rig.rows().rows[1]).toMatchObject({ state: 'untranslated', targetText: '' })
    expect(rig.rows().rows[0].state).toBe('reviewed')
    expect(rig.rows().rows[2].state).toBe('reviewed')
  })

  it('removes a row that has a line of its own without leaving an empty line', () => {
    const rig = setup()
    rig.write(2, 'Ba.')
    rig.write(3, 'Bốn.')
    rig.write(4, 'Năm.')
    expect(rig.text()).toBe('Ba.\n\nBốn. Năm.')
    rig.write(2, '')
    expect(rig.text()).toBe('Bốn. Năm.')
  })

  it('does nothing for an empty text on a row with no translation', () => {
    const rig = setup()
    const saved = rig.write(0, '   ')
    expect(saved.target.rev).toBe(0)
    expect(rig.rev()).toBe(0)
  })

  it('leaves the other rows of the same line as they were when one is edited', () => {
    const rig = setup()
    for (const [i, text] of ['Một.', 'Hai.', 'Ba.'].entries()) rig.write(i, text)
    const before = rig.rows().rows
    rig.write(1, 'Hai hai hai.')
    const after = rig.rows().rows
    for (const i of [0, 2]) {
      expect(after[i].targetIds).toEqual(before[i].targetIds)
      expect(after[i].targetText).toBe(before[i].targetText)
      expect(after[i].linkIds).toEqual(before[i].linkIds)
    }
  })

  it('records who wrote the segments', () => {
    const rig = setup()
    rig.write(0, 'Một.')
    const id = rig.rows().rows[0].targetIds[0]
    expect(rig.library.getProvenance(rig.workId, id)).toMatchObject({ origin: 'human' })
  })

  it('refuses a stale revision and changes nothing', () => {
    const rig = setup()
    rig.write(0, 'Một.')
    const error = errorOf(() =>
      rig.library.saveRow(rig.workId, {
        chapterId: rig.chapterId,
        sourceId: rig.rows().rows[1].sourceId,
        text: 'Hai.',
        expectedRev: 0
      })
    )
    expect(error.code).toBe('conflict')
    expect(rig.text()).toBe('Một.')
    expect(rig.rev()).toBe(1)
  })

  it('refuses a row that belongs to a link joining several source sentences', () => {
    const rig = setup()
    rig.write(0, 'Một.')
    const rows = rig.rows().rows
    rig.library.createLink(rig.workId, rig.chapterId, {
      kind: 'user',
      members: [rows[0].sourceId, rows[1].sourceId, rows[0].targetIds[0]]
    })
    const error = errorOf(() => rig.write(0, 'Khác.'))
    expect(error.code).toBe('validation')
    expect(rig.text()).toBe('Một.')
  })

  it('refuses a row that is not in the source', () => {
    const rig = setup()
    const error = errorOf(() =>
      rig.library.saveRow(rig.workId, {
        chapterId: rig.chapterId,
        sourceId: '00000000-0000-4000-8000-000000000000',
        text: 'x',
        expectedRev: 0
      })
    )
    expect(error.code).toBe('not_found')
  })

  it('gives the same rows after the library is closed and opened again', () => {
    const rig = setup()
    for (const [i, text] of ['Một.', 'Hai.', 'Ba.', 'Bốn.'].entries()) rig.write(i, text)
    const before = rig.rows()
    rig.library.close()
    stores.splice(stores.indexOf(rig.library), 1)
    const reopened = LibraryStore.open({ dataDir: rig.dataDir })
    stores.push(reopened)
    const after = buildRows(
      reopened.readText(rig.workId, rig.chapterId, 'source'),
      reopened.readText(rig.workId, rig.chapterId, 'target'),
      reopened.listLinks(rig.workId, rig.chapterId)
    )
    expect(after.rows.map((r) => [r.targetText, r.state])).toEqual(
      before.rows.map((r) => [r.targetText, r.state])
    )
  })
})
