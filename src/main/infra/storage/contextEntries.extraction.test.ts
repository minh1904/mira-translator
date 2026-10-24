import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import {
  createContextEntry,
  getContextEntry,
  getEffectiveGlossary,
  listScannedChapterIds,
  readReviewInfo,
  saveExtraction,
  type ExtractedCandidateWrite
} from './contextEntries'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { workSchema } from './workSchema'

const tempDir = createTempDirs()

function createTestDb(): Db {
  const db = openDatabase(join(tempDir(), 'work.mira'))
  migrate(db, workSchema)
  db.exec(`
    INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'Truyện', 'ja', 1, 1);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c1', 0, 'Chương 1', 1, 1);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c2', 1, 'Chương 2', 1, 1);
  `)
  return db
}

const candidate = (patch: Partial<ExtractedCandidateWrite> = {}): ExtractedCandidateWrite => ({
  source: '彰',
  target: 'Akira',
  termType: 'person',
  status: 'approved',
  evidence: [{ chapterId: 'c1', quote: '彰が笑った' }],
  ...patch
})

const save = (db: Db, candidates: ExtractedCandidateWrite[], scanned: string[] = []) =>
  saveExtraction(db, {
    runId: 'run-1',
    model: 'mock-model',
    promptHash: 'sha256:p',
    scannedChapterIds: scanned,
    candidates,
    now: 10
  })

describe('saveExtraction', () => {
  it('stores an applied AI entry with its type, quote, run, model and prompt hash, and the scan', () => {
    const db = createTestDb()
    const { pending } = save(db, [candidate()], ['c1'])
    expect(pending).toHaveLength(1)
    expect(getContextEntry(db, pending[0]!)).toMatchObject({
      source: '彰',
      target: 'Akira',
      status: 'approved',
      origin: 'ai'
    })
    expect(readReviewInfo(db, pending)).toEqual([
      {
        entryId: pending[0],
        termType: 'person',
        flags: [],
        evidence: [
          expect.objectContaining({
            runId: 'run-1',
            chapterId: 'c1',
            quote: '彰が笑った',
            model: 'mock-model',
            promptHash: 'sha256:p'
          })
        ]
      }
    ])
    expect([...listScannedChapterIds(db)]).toEqual(['c1'])
    // Extracted entries apply right away: there is no review step.
    expect(getEffectiveGlossary(db, 'c1').map((entry) => entry.source)).toEqual(['彰'])
    db.close()
  })

  it('stores an alias another entry owns as a flag instead of failing', () => {
    const db = createTestDb()
    createContextEntry(db, { source: 'アキラ', target: 'Akira', aliases: ['アキ'] })
    const { pending } = save(db, [candidate({ aliases: ['アキ', '彰くん'] })])
    expect(getContextEntry(db, pending[0]!)?.aliases).toEqual(['彰くん'])
    expect(readReviewInfo(db, pending)[0]?.flags).toEqual([
      { code: 'alias_conflict', detail: 'アキ' }
    ])
    db.close()
  })

  it('drops candidates that match an approved or pending entry by source or alias', () => {
    const db = createTestDb()
    createContextEntry(db, { source: '彰', target: 'Akira' })
    createContextEntry(db, {
      source: 'ミリィ',
      target: 'Milly',
      status: 'pending',
      aliases: ['ミリ']
    })
    const result = save(db, [candidate(), candidate({ source: 'ミリ', target: 'Mili' })])
    expect(result).toEqual({ pending: [], skipped: 2, aliasesAdded: 0 })
    db.close()
  })

  it('keeps a rejected entry rejected even with a quote from a new chapter', () => {
    const db = createTestDb()
    const first = save(db, [candidate({ source: '先生', target: 'thầy' })])
    const id = first.pending[0]!
    db.prepare("UPDATE context_entry SET status = 'rejected' WHERE id = ?").run(id)

    const again = save(db, [
      candidate({
        source: '先生',
        target: 'thầy',
        evidence: [{ chapterId: 'c2', quote: '先生が' }]
      })
    ])
    expect(again).toEqual({ pending: [], skipped: 1, aliasesAdded: 0 })
    expect(getContextEntry(db, id)?.status).toBe('rejected')
    db.close()
  })

  it('adds the new forms of a candidate that matches a term as aliases of that term', () => {
    const db = createTestDb()
    const noel = createContextEntry(db, { source: 'ノエル・アーデン', target: 'Noel Arden' })
    const result = save(db, [
      candidate({
        source: 'ノエル・アーデン',
        target: 'Noel Arden',
        aliases: ['ノエル様'],
        evidence: [{ chapterId: 'c2', quote: 'ノエル様が来た' }]
      })
    ])
    expect(result).toEqual({ pending: [], skipped: 1, aliasesAdded: 1 })
    expect(getContextEntry(db, noel.id)?.aliases).toEqual(['ノエル様'])
    expect(readReviewInfo(db, [noel.id])[0]?.evidence.map((e) => e.quote)).toEqual([
      'ノエル様が来た'
    ])
    db.close()
  })

  it('gives a rejected entry no aliases', () => {
    const db = createTestDb()
    const id = save(db, [candidate({ source: '先生', target: 'thầy' })]).pending[0]!
    db.prepare("UPDATE context_entry SET status = 'rejected' WHERE id = ?").run(id)
    expect(save(db, [candidate({ source: '先生', aliases: ['先生方'] })]).aliasesAdded).toBe(0)
    expect(getContextEntry(db, id)?.aliases).toEqual([])
    db.close()
  })

  it('stores the reading', () => {
    const db = createTestDb()
    const { pending } = save(db, [candidate({ source: '桐谷彰', reading: 'きりたにあきら' })])
    expect(db.prepare('SELECT reading FROM context_entry WHERE id = ?').get(pending[0])).toEqual({
      reading: 'きりたにあきら'
    })
    db.close()
  })

  it('stores not-a-term as rejected so it is not proposed again, and keeps caller flags', () => {
    const db = createTestDb()
    const result = save(db, [
      candidate({ source: 'ドア', target: '', status: 'rejected', evidence: [] }),
      candidate({ source: '李伟', target: 'Li Wei', flags: [{ code: 'script_mismatch' }] })
    ])
    expect(result.pending).toHaveLength(1)
    expect(db.prepare("SELECT status FROM context_entry WHERE source = 'ドア'").get()).toEqual({
      status: 'rejected'
    })
    expect(readReviewInfo(db, result.pending)[0]?.flags).toEqual([{ code: 'script_mismatch' }])
    expect(save(db, [candidate({ source: 'ドア', target: 'cửa' })]).skipped).toBe(1)
    db.close()
  })

  it('writes nothing when the transaction fails', () => {
    const db = createTestDb()
    expect(() =>
      save(
        db,
        [candidate(), candidate({ source: 'x', evidence: [{ chapterId: 'nope', quote: 'q' }] })],
        ['c1']
      )
    ).toThrow()
    expect(db.prepare('SELECT count(*) AS n FROM context_entry').get()).toEqual({ n: 0 })
    expect(listScannedChapterIds(db).size).toBe(0)
    db.close()
  })
})
