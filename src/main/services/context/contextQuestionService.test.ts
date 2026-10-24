import { describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import { createContextEntry, updateContextEntry } from '../../infra/storage/contextEntries'
import { attachQuestion } from '../../infra/storage/contextQuestions'
import { listEntryChanges } from '../../infra/storage/contextChanges'
import { setupAgent } from '../agent/agentTestKit'
import { ContextQuestionService } from './contextQuestionService'

function setup(texts: Array<{ source: string; target?: string }>) {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'Truyện thử', sourceLang: 'ja' })
  const chapters = texts.map((text, index) => {
    const chapter = kit.library.createChapter(work.id, `Chương ${index + 1}`).chapter
    kit.library.saveText(work.id, chapter.id, 'source', text.source, 0, segment(text.source, 'ja'))
    if (text.target)
      kit.library.saveText(
        work.id,
        chapter.id,
        'target',
        text.target,
        0,
        segment(text.target, 'vi')
      )
    return chapter
  })
  return { ...kit, work, chapters, service: new ContextQuestionService(kit.library, () => 9) }
}

const question = (fromChapterId: string | null) => ({
  kind: 'gender' as const,
  title: 'Giới tính chưa chắc',
  options: ['Nam', 'Nữ', 'Không rõ'],
  default: 'Không rõ',
  fromChapterId,
  otherEntryId: null,
  proposal: null,
  evidence: [],
  runId: null
})

describe('ContextQuestionService', () => {
  it('lists the questions whose entry appears most in untranslated chapters first, ties by chapter', () => {
    const kit = setup([
      { source: 'ミリィとリオン', target: 'Milly và Rion' },
      { source: 'ミリィ。ミリィ。リオン。' },
      { source: 'セラ。' }
    ])
    const ids = kit.library.withWork(kit.work.id, (db) => {
      const milly = createContextEntry(db, { source: 'ミリィ', target: 'Milly' })
      const rion = createContextEntry(db, { source: 'リオン', target: 'Rion' })
      const sera = createContextEntry(db, { source: 'セラ', target: 'Sera' })
      const late = createContextEntry(db, { source: 'セラ様', target: 'Sera-sama' })
      attachQuestion(db, rion.id, question(null))
      attachQuestion(db, milly.id, question(null))
      attachQuestion(db, late.id, question(kit.chapters[2]!.id))
      attachQuestion(db, sera.id, question(kit.chapters[1]!.id))
      return { milly: milly.id, rion: rion.id, sera: sera.id, late: late.id }
    })
    expect(kit.service.list(kit.work.id).map((q) => [q.entryId, q.impact])).toEqual([
      [ids.milly, 2],
      [ids.sera, 1],
      [ids.rion, 1],
      [ids.late, 0]
    ])
  })

  it('a new romanization writes names again, except those a person edited', () => {
    const kit = setup([{ source: '涼太が来た' }])
    const ids = kit.library.withWork(kit.work.id, (db) => {
      const make = (source: string, target: string) => {
        const entry = createContextEntry(db, { source, target, origin: 'ai' })
        db.prepare(
          "UPDATE context_entry SET term_type = 'person', reading = 'りょうた' WHERE id = ?"
        ).run(entry.id)
        return entry.id
      }
      const ryota = make('涼太', 'Ryōta')
      const edited = make('涼太くん', 'Ryōta')
      updateContextEntry(db, edited, { target: 'Ryouta-kun' })
      return { ryota, edited }
    })
    kit.service.setConvention(kit.work.id, 'ja_romanization', 'hepburn_macron')
    const result = kit.service.setConvention(kit.work.id, 'ja_romanization', 'hepburn_plain')
    expect(result).toMatchObject({ renamed: 1, skipped: 1 })
    expect(result.conventions.ja_romanization).toEqual({ value: 'hepburn_plain', settled: true })
    const changes = kit.library.withWork(kit.work.id, (db) => listEntryChanges(db, ids.ryota))
    expect(changes[0]).toMatchObject({ actor: 'code', oldValue: 'Ryōta', newValue: 'Ryota' })
  })
})
