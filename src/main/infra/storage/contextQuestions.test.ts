import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUESTION_LABELS } from '../../../shared/contracts/contextQuestions'
import { createTempDirs } from '../../testing/testing'
import { createCharacter, getCharacter } from './addressingEntries'
import { listEntryChanges } from './contextChanges'
import { createContextEntry, getContextEntry, updateContextEntry } from './contextEntries'
import { answerContextQuestion, attachQuestion, listQuestions } from './contextQuestions'
import { reviseEntry } from './contextRevisions'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { readConventions, writeConvention } from './workConventions'
import { workSchema } from './workSchema'

const tempDir = createTempDirs()

function createTestDb(): Db {
  const db = openDatabase(join(tempDir(), 'work.mira'))
  migrate(db, workSchema)
  db.exec(
    "INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'Truyện', 'ja', 1, 1)"
  )
  const insert = db.prepare(
    'INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES (?, ?, ?, 1, 1)'
  )
  for (let n = 1; n <= 12; n++) insert.run(`c${n}`, n - 1, `Chương ${n}`)
  return db
}

const mergeQuestion = (otherEntryId: string) => ({
  kind: 'merge' as const,
  title: 'Có thể là một: 翠風 và シルフィア',
  options: [QUESTION_LABELS.merge, QUESTION_LABELS.distinct],
  default: QUESTION_LABELS.distinct,
  fromChapterId: null,
  otherEntryId,
  proposal: null,
  evidence: [{ chapterId: 'c3', quote: '翠風のシルフィアが現れた' }],
  runId: 'r1'
})

describe('context questions', () => {
  it('a held-back change becomes a question; answering it applies it as a person and closes it', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, { source: 'ガイゼル', target: 'Geizel', origin: 'ai' })
    updateContextEntry(db, entry.id, { target: 'Gaizel' })
    const proposal = {
      entryId: entry.id,
      actor: 'ai' as const,
      kind: 'progression' as const,
      fromChapterId: 'c12',
      fields: { target: 'Geizel' },
      evidence: [{ chapterId: 'c12', quote: 'ガイゼルが来た' }]
    }
    reviseEntry(db, proposal)
    const [question] = listQuestions(db)
    expect(question).toMatchObject({
      kind: 'revision',
      entryId: entry.id,
      options: ['Áp cho cả truyện', 'Áp từ chương 12', 'Giữ nguyên'],
      default: 'Giữ nguyên'
    })

    expect(() => answerContextQuestion(db, question!.id, 'Có lẽ', 5)).toThrow(
      /không phải một lựa chọn/
    )
    expect(listQuestions(db)).toHaveLength(1)
    answerContextQuestion(db, question!.id, 'Áp cho cả truyện', 5)
    expect(getContextEntry(db, entry.id)?.target).toBe('Geizel')
    expect(listQuestions(db)).toEqual([])
    expect(() => answerContextQuestion(db, question!.id, 'Giữ nguyên', 6)).toThrow(
      /đã được trả lời/
    )
    // The same proposal again is not asked again.
    reviseEntry(db, { ...proposal, fields: { target: 'Gaizel' } })
    reviseEntry(db, proposal)
    expect(
      listQuestions(db).filter((q) => q.proposal && JSON.stringify(q.proposal).includes('Geizel'))
    ).toEqual([])
    db.close()
  })

  it('merges a nickname into the entry it names: aliases, quotes and history move, the entry goes', () => {
    const db = createTestDb()
    const sylphia = createContextEntry(db, { source: 'シルフィア', target: 'Sylphia' })
    const nickname = createContextEntry(db, {
      source: '翠風',
      target: 'Thúy Phong',
      aliases: ['翠風さん']
    })
    db.prepare(
      "INSERT INTO context_entry_evidence (id, entry_id, run_id, chapter_id, quote, model, prompt_hash, created_at) VALUES ('ev', ?, 'r1', 'c3', '翠風のシルフィア', 'm', 'h', 1)"
    ).run(nickname.id)
    const id = attachQuestion(db, nickname.id, mergeQuestion(sylphia.id))!
    answerContextQuestion(db, id, QUESTION_LABELS.merge, 7)
    expect(getContextEntry(db, nickname.id)).toBeNull()
    expect(getContextEntry(db, sylphia.id)?.aliases).toEqual(['翠風', '翠風さん'])
    expect(db.prepare('SELECT entry_id FROM context_entry_evidence').get()).toEqual({
      entry_id: sylphia.id
    })
    expect(listEntryChanges(db, sylphia.id)[0]).toMatchObject({
      actor: 'user',
      field: 'question',
      newValue: 'Gộp vào mục kia'
    })
    db.close()
  })

  it('"two different entries" keeps both and the pair is not asked again', () => {
    const db = createTestDb()
    const sylphia = createContextEntry(db, { source: 'シルフィア', target: 'Sylphia' })
    const nickname = createContextEntry(db, { source: '翠風', target: 'Thúy Phong' })
    const id = attachQuestion(db, nickname.id, mergeQuestion(sylphia.id))!
    expect(attachQuestion(db, nickname.id, mergeQuestion(sylphia.id))).toBeNull()
    answerContextQuestion(db, id, QUESTION_LABELS.distinct, 7)
    expect(getContextEntry(db, nickname.id)).not.toBeNull()
    expect(attachQuestion(db, nickname.id, mergeQuestion(sylphia.id))).toBeNull()
    expect(listQuestions(db)).toEqual([])
    db.close()
  })

  it('sets the gender a person picks', () => {
    const db = createTestDb()
    const morgreid = createCharacter(db, { source: 'モルグレイド', target: 'Morgreid' })
    const id = attachQuestion(db, morgreid.id, {
      kind: 'gender',
      title: 'Giới tính chưa chắc: Morgreid',
      options: [QUESTION_LABELS.male, QUESTION_LABELS.female, QUESTION_LABELS.unknown],
      default: QUESTION_LABELS.unknown,
      fromChapterId: null,
      otherEntryId: null,
      proposal: null,
      evidence: [],
      runId: null
    })!
    answerContextQuestion(db, id, QUESTION_LABELS.female, 3)
    expect(getCharacter(db, morgreid.id)?.gender).toBe('female')
    db.close()
  })

  it('asks to translate again after a correction only when the work wants to be asked', () => {
    const db = createTestDb()
    db.prepare(
      "INSERT INTO chapter_text (chapter_id, side, content, rev, updated_at) VALUES ('c3', 'source', 'ミリィが笑った', 1, 1), ('c3', 'target', 'Mili cười', 1, 1)"
    ).run()
    const entry = createContextEntry(db, { source: 'ミリィ', target: 'Mili', origin: 'ai', now: 1 })
    reviseEntry(
      db,
      {
        entryId: entry.id,
        actor: 'ai',
        kind: 'correction',
        fields: { target: 'Milli' },
        evidence: []
      },
      5
    )
    expect(listQuestions(db)).toEqual([])
    writeConvention(db, 'correction_retranslate', 'ask', true, 6)
    reviseEntry(
      db,
      {
        entryId: entry.id,
        actor: 'ai',
        kind: 'correction',
        fields: { target: 'Milly' },
        evidence: []
      },
      7
    )
    const [question] = listQuestions(db)
    expect(question).toMatchObject({ kind: 'retranslate', default: 'Chỉ liệt kê' })
    expect(answerContextQuestion(db, question!.id, QUESTION_LABELS.listOnly, 8)).toEqual({})
    db.close()
  })
})

describe('work conventions', () => {
  it('a file without conventions reads the defaults, not settled; a choice settles it', () => {
    const db = createTestDb()
    expect(readConventions(db)).toEqual({
      ja_romanization: { value: 'hepburn_plain', settled: false },
      honorifics: { value: 'keep', settled: false },
      correction_retranslate: { value: 'list', settled: false }
    })
    writeConvention(db, 'honorifics', 'vietnamize', true, 2)
    expect(readConventions(db).honorifics).toEqual({ value: 'vietnamize', settled: true })
    expect(() => writeConvention(db, 'honorifics', 'drop', true, 3)).toThrow(/không hợp lệ/)
    db.close()
  })
})
