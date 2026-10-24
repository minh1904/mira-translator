import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { createCharacter, changeDyadFrom, setDyad } from './addressingEntries'
import { listEntryChanges } from './contextChanges'
import {
  createContextEntry,
  deleteContextEntry,
  getContextEntry,
  getEffectiveGlossary,
  readReviewInfo,
  saveExtraction,
  updateContextEntry
} from './contextEntries'
import { affectedChapters, changeTermFrom, reviseEntry } from './contextRevisions'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { workSchema } from './workSchema'

const tempDir = createTempDirs()

/** A work with chapters c1…c20 at positions 0…19. */
function createTestDb(): Db {
  const db = openDatabase(join(tempDir(), 'work.mira'))
  migrate(db, workSchema)
  db.exec(
    "INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'Truyện', 'ja', 1, 1)"
  )
  const insert = db.prepare(
    'INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES (?, ?, ?, 1, 1)'
  )
  for (let n = 1; n <= 20; n++) insert.run(`c${n}`, n - 1, `Chương ${n}`)
  return db
}

const targets = (db: Db, chapterId: string) =>
  getEffectiveGlossary(db, chapterId).map((entry) => `${entry.source}=${entry.target}`)

describe('forms are unique per stretch of chapters', () => {
  it('lets an entry and the one that replaces it share an alias, and refuses overlapping ranges', () => {
    const db = createTestDb()
    createContextEntry(db, {
      source: '蒼穹の剣',
      target: 'Kiếm Thương Khung',
      aliases: ['蒼穹'],
      toChapterId: 'c11'
    })
    const later = createContextEntry(db, {
      source: '蒼穹の剣',
      target: 'Thương Khung Kiếm',
      aliases: ['蒼穹'],
      fromChapterId: 'c12'
    })
    expect(targets(db, 'c12')).toEqual(['蒼穹の剣=Thương Khung Kiếm'])
    expect(() =>
      createContextEntry(db, {
        source: 'アキ',
        target: 'Aki',
        aliases: ['蒼穹'],
        fromChapterId: 'c15'
      })
    ).toThrow(/đã được sử dụng/)
    // Moving the later entry over the earlier one is refused by the same check.
    expect(() => updateContextEntry(db, later.id, { fromChapterId: 'c10' })).toThrow()
    db.close()
  })

  it('extraction keeps flagging an alias another entry owns', () => {
    const db = createTestDb()
    createContextEntry(db, { source: 'アキラ', target: 'Akira', aliases: ['アキ'] })
    const { pending } = saveExtraction(db, {
      runId: 'r',
      model: 'm',
      promptHash: 'h',
      scannedChapterIds: [],
      candidates: [
        {
          source: '彰',
          target: 'Akira',
          termType: 'person',
          status: 'approved',
          aliases: ['アキ'],
          evidence: []
        }
      ]
    })
    expect(readReviewInfo(db, pending)[0]?.flags).toEqual([
      { code: 'alias_conflict', detail: 'アキ' }
    ])
    db.close()
  })
})

describe('changeTermFrom', () => {
  it('closes the term at chapter 11 and starts the new one at 12; a retry makes no second entry', () => {
    const db = createTestDb()
    const old = createContextEntry(db, {
      source: '蒼穹の剣',
      target: 'Kiếm Thương Khung',
      aliases: ['蒼穹']
    })
    const params = {
      newEntryId: 'n1',
      entryId: old.id,
      fromChapterId: 'c12',
      fields: { target: 'Thương Khung Kiếm' },
      actor: 'user' as const
    }
    expect(changeTermFrom(db, params, 5)).toEqual({ newEntryId: 'n1', closedEntryId: old.id })
    expect(changeTermFrom(db, params, 6).newEntryId).toBe('n1')
    expect(targets(db, 'c11')).toEqual(['蒼穹の剣=Kiếm Thương Khung'])
    expect(targets(db, 'c12')).toEqual(['蒼穹の剣=Thương Khung Kiếm'])
    expect(getContextEntry(db, 'n1')).toMatchObject({
      aliases: ['蒼穹'],
      fromChapterId: 'c12',
      toChapterId: null
    })
    expect(db.prepare('SELECT count(*) AS n FROM context_entry').get()).toEqual({ n: 2 })
    expect(db.prepare("SELECT supersedes_id FROM context_entry WHERE id = 'n1'").get()).toEqual({
      supersedes_id: old.id
    })
    db.close()
  })

  it('refuses when the term starts at chapter N or later', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, {
      source: '記憶遡行',
      target: 'Hồi tưởng',
      fromChapterId: 'c15'
    })
    expect(() =>
      changeTermFrom(db, {
        newEntryId: 'n',
        entryId: entry.id,
        fromChapterId: 'c12',
        fields: { target: 'Truy Hồi Ký Ức' },
        actor: 'user'
      })
    ).toThrow(/bắt đầu từ chương này/)
    expect(getContextEntry(db, entry.id)?.toChapterId).toBeNull()
    db.close()
  })
})

describe('reviseEntry', () => {
  const quote = (chapterId: string, text = 'ミリィ（Milly）が笑った') => ({
    chapterId,
    quote: text
  })

  it('applies a correction for the whole story and records the old value with its quote', () => {
    const db = createTestDb()
    const { pending } = saveExtraction(db, {
      runId: 'r1',
      model: 'm',
      promptHash: 'h',
      scannedChapterIds: [],
      candidates: [
        {
          source: 'ミリィ',
          target: 'Mili',
          termType: 'person',
          status: 'approved',
          evidence: [quote('c2', 'ミリィが来た')]
        }
      ],
      now: 1
    })
    const id = pending[0]!
    const result = reviseEntry(
      db,
      {
        entryId: id,
        actor: 'ai',
        kind: 'correction',
        fields: { target: 'Milly' },
        evidence: [quote('c20')],
        runId: 'r2'
      },
      2
    )
    expect(result).toEqual({ applied: true, entryId: id, blocked: null })
    expect(getContextEntry(db, id)?.target).toBe('Milly')
    expect(
      listEntryChanges(db, id).map((c) => [c.kind, c.oldValue, c.newValue, c.quoteChapterId])
    ).toEqual([
      ['correction', 'Mili', 'Milly', 'c20'],
      ['create', null, 'Mili', 'c2']
    ])
    db.close()
  })

  it('only flags what a person edited, a progression seen in one chapter, and a flip back', () => {
    const db = createTestDb()
    const edited = createContextEntry(db, { source: 'ガイゼル', target: 'Geizel', origin: 'ai' })
    updateContextEntry(db, edited.id, { target: 'Gaizel' })
    const blocked = (entryId: string) =>
      readReviewInfo(db, [entryId])[0]?.flags.filter((flag) => flag.code === 'revision_suggested')

    expect(
      reviseEntry(db, {
        entryId: edited.id,
        actor: 'ai',
        kind: 'correction',
        fields: { target: 'Geizel' },
        evidence: [quote('c3')]
      }).blocked
    ).toBe('user_edited')
    expect(getContextEntry(db, edited.id)?.target).toBe('Gaizel')
    expect(JSON.parse(blocked(edited.id)![0]!.detail!)).toMatchObject({
      fields: { target: 'Geizel' },
      reason: 'user_edited'
    })

    const team = createContextEntry(db, {
      source: '蒼穹の剣',
      target: 'Kiếm Thương Khung',
      origin: 'ai'
    })
    expect(
      reviseEntry(db, {
        entryId: team.id,
        actor: 'ai',
        kind: 'progression',
        fromChapterId: 'c15',
        fields: { target: 'Thương Khung Kiếm' },
        evidence: [quote('c15'), quote('c14')]
      }).blocked
    ).toBe('one_chapter')
    expect(getContextEntry(db, team.id)?.toChapterId).toBeNull()

    const lily = createContextEntry(db, { source: 'リリ', target: 'Lili', origin: 'ai' })
    reviseEntry(db, {
      entryId: lily.id,
      actor: 'ai',
      kind: 'correction',
      fields: { target: 'Lily' },
      evidence: [quote('c4')]
    })
    expect(
      reviseEntry(db, {
        entryId: lily.id,
        actor: 'ai',
        kind: 'correction',
        fields: { target: 'Lili' },
        evidence: [quote('c9')]
      }).blocked
    ).toBe('flip_back')
    expect(getContextEntry(db, lily.id)?.target).toBe('Lily')
    // Asking twice keeps one flag.
    reviseEntry(db, {
      entryId: lily.id,
      actor: 'ai',
      kind: 'correction',
      fields: { target: 'Lili' },
      evidence: [quote('c9')]
    })
    expect(blocked(lily.id)).toHaveLength(1)
    db.close()
  })

  it('applies a progression with quotes from two chapters as a new entry from that chapter', () => {
    const db = createTestDb()
    const team = createContextEntry(db, {
      source: '蒼穹の剣',
      target: 'Kiếm Thương Khung',
      origin: 'ai'
    })
    const result = reviseEntry(db, {
      entryId: team.id,
      actor: 'ai',
      kind: 'progression',
      fromChapterId: 'c12',
      fields: { target: 'Thương Khung Kiếm' },
      evidence: [quote('c12'), quote('c13')],
      newEntryId: 'p1'
    })
    expect(result).toEqual({ applied: true, entryId: 'p1', blocked: null })
    expect(targets(db, 'c13')).toEqual(['蒼穹の剣=Thương Khung Kiếm'])
    expect(listEntryChanges(db, 'p1')[0]).toMatchObject({
      kind: 'progression',
      fromChapterId: 'c12'
    })
    db.close()
  })
})

describe('history of hand edits', () => {
  it('records a person editing an entry, marks it edited, and goes with the entry', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, { source: 'ミリィ', target: 'Mili' })
    updateContextEntry(db, entry.id, { target: 'Milly', aliases: ['ミリィ姉さん'] })
    expect(listEntryChanges(db, entry.id).map((c) => [c.actor, c.field, c.newValue])).toEqual([
      ['user', 'aliases', 'ミリィ姉さん'],
      ['user', 'target', 'Milly'],
      ['user', 'target', 'Mili']
    ])
    expect(
      db.prepare('SELECT user_edited_at FROM context_entry WHERE id = ?').get(entry.id)
    ).not.toEqual({
      user_edited_at: null
    })
    deleteContextEntry(db, entry.id)
    expect(db.prepare('SELECT count(*) AS n FROM context_entry_change').get()).toEqual({ n: 0 })
    db.close()
  })

  it('records an addressing change from a chapter', () => {
    const db = createTestDb()
    const a = createCharacter(db, { source: '桐谷', target: 'Kiritani' })
    const b = createCharacter(db, { source: '彰', target: 'Akira' })
    setDyad(db, {
      sourceCharacterId: a.id,
      targetCharacterId: b.id,
      speakerPronoun: 'tôi',
      recipientPronoun: 'cậu'
    })
    changeDyadFrom(db, {
      newDyadId: 'd2',
      sourceCharacterId: a.id,
      targetCharacterId: b.id,
      fromChapterId: 'c10',
      speakerPronoun: 'tớ',
      recipientPronoun: 'Akira'
    })
    expect(listEntryChanges(db, 'd2')).toEqual([
      expect.objectContaining({
        actor: 'user',
        kind: 'progression',
        oldValue: 'tôi / cậu',
        newValue: 'tớ / Akira'
      })
    ])
    db.close()
  })
})

describe('affectedChapters', () => {
  it('lists the translated chapters with the term that predate its correction, in order', () => {
    const db = createTestDb()
    const save = (chapterId: string, side: 'source' | 'target', content: string, at: number) =>
      db
        .prepare(
          'INSERT INTO chapter_text (chapter_id, side, content, rev, updated_at) VALUES (?, ?, ?, 1, ?)'
        )
        .run(chapterId, side, content, at)
    for (const id of ['c3', 'c8', 'c15']) {
      save(id, 'source', 'ミリィが笑った。', 1)
      save(id, 'target', 'Mili cười.', 1)
    }
    save('c9', 'source', 'ミリィが笑った。', 1)
    save('c10', 'source', '別の話。', 1)
    save('c10', 'target', 'Chuyện khác.', 1)
    const entry = createContextEntry(db, { source: 'ミリィ', target: 'Mili', now: 1 })
    expect(affectedChapters(db, entry.id)).toEqual([])
    updateContextEntry(db, entry.id, { target: 'Milly', now: 5 })
    expect(affectedChapters(db, entry.id)).toEqual(['c3', 'c8', 'c15'])
    db.close()
  })
})
