import { describe, expect, it } from 'vitest'
import { QUESTION_LABELS } from '../../../../shared/contracts/contextQuestions'
import { createCharacter } from '../../../infra/storage/addressingEntries'
import { attachQuestion } from '../../../infra/storage/contextQuestions'
import { contextQuestionNote } from '../../context/contextQuestionService'
import { setupAgent } from '../agentTestKit'
import {
  answerContextQuestionsCapability,
  readContextQuestionsCapability,
  setWorkConventionsCapability
} from './contextQuestionCapabilities'

function setup() {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'Truyện Nhật', sourceLang: 'ja' })
  const target = { kind: 'work' as const, workId: work.id, workLabel: work.title }
  const run = <T>(capability: { handler: (input: never) => Promise<T> }, args: object) =>
    capability.handler({
      turnId: 't',
      commandId: 'c',
      target,
      args,
      library: kit.library,
      now: 0
    } as never)
  const ask = (source: string) =>
    kit.library.withWork(work.id, (db) => {
      const character = createCharacter(db, { source, target: source })
      return attachQuestion(db, character.id, {
        kind: 'gender',
        title: `Giới tính chưa chắc: ${source}`,
        options: [QUESTION_LABELS.male, QUESTION_LABELS.female, QUESTION_LABELS.unknown],
        default: QUESTION_LABELS.unknown,
        fromChapterId: null,
        otherEntryId: null,
        proposal: null,
        evidence: [],
        runId: null
      })!
    })
  return { ...kit, work, run, ask }
}

describe('context questions in chat', () => {
  it('the turn says how many questions are open and which conventions are not settled', () => {
    const kit = setup()
    expect(contextQuestionNote(kit.library, kit.work.id)).toBe(
      'Tác phẩm có quy ước chưa chốt: ja_romanization (Kiểu phiên âm tên Nhật), honorifics (Kính ngữ), ' +
        'correction_retranslate (Khi sửa sai đụng chương đã dịch).'
    )
    kit.ask('モルグ')
    expect(contextQuestionNote(kit.library, kit.work.id)).toMatch(
      /^Tác phẩm có 1 câu hỏi ngữ cảnh đang mở \(read_context_questions\); quy ước chưa chốt/
    )
  })

  it('reads the open questions, then applies each answer on its own: a closed one does not block the rest', async () => {
    const kit = setup()
    const first = kit.ask('モルグ')
    const second = kit.ask('セラ')
    const read = (await kit.run(readContextQuestionsCapability, {})) as {
      value: { total: number; questions: Array<{ id: string; options: string[] }> }
    }
    expect(read.value.total).toBe(2)
    expect(read.value.questions[0]!.options).toEqual(['Nam', 'Nữ', 'Không rõ'])

    await kit.run(answerContextQuestionsCapability, {
      answers: [{ questionId: first, label: 'Nữ' }]
    })
    const result = (await kit.run(answerContextQuestionsCapability, {
      answers: [
        { questionId: first, label: 'Nam' },
        { questionId: second, label: 'Nam' }
      ]
    })) as { value: { results: Array<{ questionId: string; ok: boolean }> } }
    expect(result.value.results.map((each) => each.ok)).toEqual([false, true])
  })

  it('saves the conventions the user chose as settled', async () => {
    const kit = setup()
    const result = (await kit.run(setWorkConventionsCapability, {
      honorifics: 'vietnamize',
      correction_retranslate: 'list'
    })) as { value: { conventions: Record<string, { value: string; settled: boolean }> } }
    expect(result.value.conventions.honorifics).toEqual({ value: 'vietnamize', settled: true })
    expect(result.value.conventions.ja_romanization.settled).toBe(false)
  })
})
