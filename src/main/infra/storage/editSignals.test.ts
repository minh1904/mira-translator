import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { listEntryChanges } from './contextChanges'
import {
  createContextEntry,
  getContextEntry,
  listScannedChapterIds,
  saveExtraction
} from './contextEntries'
import { recordEditSignals, replacementOf } from './editSignals'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { saveText } from './textFile'
import { workSchema } from './workSchema'

const tempDir = createTempDirs()

function createTestDb(): Db {
  const db = openDatabase(join(tempDir(), 'work.mira'))
  migrate(db, workSchema)
  db.exec(`
    INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'Truyện', 'ja', 1, 1);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES
      ('c4', 0, 'Chương 4', 1, 1), ('c6', 1, 'Chương 6', 1, 1);
  `)
  let n = 0
  for (const id of ['c4', 'c6'])
    saveText(
      db,
      {
        chapterId: id,
        side: 'source',
        content: 'シルフィアが笑った。',
        expectedRev: 0,
        segments: []
      },
      1,
      () => `s${n++}`
    )
  return db
}

describe('replacementOf', () => {
  it('finds the whole new word even when it shares letters with the old one', () => {
    expect(replacementOf('Sylphia cười.', 'Sylphie cười.', 'Sylphia')).toBe('Sylphie')
    expect(replacementOf('Rồi Sylphia cười.', 'Rồi Sylphie bật cười.', 'Sylphia')).toBe(
      'Sylphie bật'
    )
  })

  it('ignores a removed name, a rewritten sentence and a line that still has the name', () => {
    expect(replacementOf('Sylphia cười.', ' cười.', 'Sylphia')).toBeNull()
    expect(
      replacementOf('Sylphia cười.', 'Cô ấy đứng dậy rồi bỏ đi. Không ai nói gì.', 'Sylphia')
    ).toBeNull()
    expect(replacementOf('Sylphia cười.', 'Sylphia bật cười.', 'Sylphia')).toBeNull()
  })
})

describe('recordEditSignals', () => {
  it('changes the entry once the same edit is made in two chapters', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, { source: 'シルフィア', target: 'Sylphia', origin: 'ai' })
    recordEditSignals(db, 'c4', 'Sylphia cười.', 'Sylphie cười.', 2)
    expect(getContextEntry(db, entry.id)?.target).toBe('Sylphia')
    recordEditSignals(db, 'c6', 'Sylphia cười.', 'Sylphie cười.', 3)
    expect(getContextEntry(db, entry.id)?.target).toBe('Sylphie')
    expect(listEntryChanges(db, entry.id)[0]).toMatchObject({
      actor: 'user_edit_signal',
      kind: 'correction',
      oldValue: 'Sylphia',
      newValue: 'Sylphie'
    })
    db.close()
  })

  it('does not count deleting the name', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, { source: 'シルフィア', target: 'Sylphia' })
    recordEditSignals(db, 'c4', 'Sylphia cười.', 'cười.', 2)
    recordEditSignals(db, 'c6', 'Sylphia cười.', 'cười.', 3)
    expect(getContextEntry(db, entry.id)?.target).toBe('Sylphia')
    expect(db.prepare('SELECT count(*) AS n FROM context_edit_signal').get()).toEqual({ n: 0 })
    db.close()
  })
})

describe('scan marks', () => {
  it('a source saved with new content loses its scan mark; the same content keeps it', () => {
    const db = createTestDb()
    saveExtraction(db, {
      runId: 'r',
      model: 'm',
      promptHash: 'h',
      scannedChapterIds: ['c4', 'c6'],
      candidates: []
    })
    saveText(
      db,
      {
        chapterId: 'c4',
        side: 'source',
        content: 'シルフィアが笑った。',
        expectedRev: 1,
        segments: []
      },
      2,
      () => 'x1'
    )
    saveText(
      db,
      {
        chapterId: 'c6',
        side: 'source',
        content: 'シルフィアが泣いた。',
        expectedRev: 1,
        segments: []
      },
      2,
      () => 'x2'
    )
    expect([...listScannedChapterIds(db)]).toEqual(['c4'])
    db.close()
  })
})
