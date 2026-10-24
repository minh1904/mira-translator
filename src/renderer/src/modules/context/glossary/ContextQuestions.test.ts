import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextQuestionView } from '../../../../../shared/contracts/contextQuestions'
import { asAgentQuestion, ContextQuestionsView } from './ContextQuestions'

const question: ContextQuestionView = {
  id: 'q1',
  kind: 'merge',
  title: 'Có thể là một: 翠風 và シルフィア',
  options: ['Gộp vào mục kia', 'Hai mục khác nhau'],
  default: 'Hai mục khác nhau',
  fromChapterId: null,
  otherEntryId: 'e2',
  proposal: null,
  evidence: [{ chapterId: 'c3', quote: '翠風のシルフィアが現れた' }],
  runId: 'r1',
  fingerprint: 'f',
  entryId: 'e1',
  entrySource: '翠風',
  impact: 4
}
const chapterNumber = (id: string | null) => (id === 'c3' ? 3 : undefined)

describe('context questions in the Glossary screen', () => {
  it('shows each open question as the shared card with its quote and the default picked', () => {
    expect(asAgentQuestion(question, chapterNumber)).toEqual({
      id: 'q1',
      title: '翠風 — Có thể là một: 翠風 và シルフィア',
      description: 'C.3: “翠風のシルフィアが現れた”',
      type: 'single',
      options: ['Gộp vào mục kia', 'Hai mục khác nhau'],
      default: 'Hai mục khác nhau'
    })
    const html = renderToStaticMarkup(
      createElement(ContextQuestionsView, {
        questions: [question],
        chapterNumber,
        onAnswer: vi.fn()
      })
    )
    expect(html).toContain('aria-label="Câu hỏi về 翠風"')
    expect(html).toContain('C.3: “翠風のシルフィアが現れた”')
    expect(html).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/).)*<span[^>]*>2<\/span>/u)
    // One question per card: no "skip all".
    expect(html).not.toContain('Bỏ qua tất cả')
  })

  it('says there is nothing to look at when no question is open', () => {
    const html = renderToStaticMarkup(
      createElement(ContextQuestionsView, { questions: [], chapterNumber, onAnswer: vi.fn() })
    )
    expect(html).toContain('Không có gì cần xem')
  })
})
