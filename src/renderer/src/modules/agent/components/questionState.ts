import {
  checkQuestionAnswers,
  type AgentQuestion,
  type AgentQuestionAnswers
} from '../../../../../shared/contracts/agent'

/** What the user picked and typed on the question card, by question id. */
export interface QuestionDraft {
  picks: Record<string, string[]>
  free: Record<string, string>
}

/** The card opens with each question's default already chosen. */
export function initialDraft(questions: AgentQuestion[]): QuestionDraft {
  const draft: QuestionDraft = { picks: {}, free: {} }
  for (const q of questions) {
    const defaults =
      q.default === undefined ? [] : Array.isArray(q.default) ? q.default : [q.default]
    if (q.type === 'text') {
      draft.free[q.id] = defaults[0] ?? ''
      continue
    }
    draft.picks[q.id] = defaults.filter((value) => q.options?.includes(value))
    // A default outside the options is the user's own answer, typed in the free-text box.
    const own = defaults.find((value) => !q.options?.includes(value))
    if (own !== undefined) draft.free[q.id] = own
  }
  return draft
}

/** Picking an option: single replaces the pick and clears typed text; multi toggles it. */
export function pickOption(draft: QuestionDraft, q: AgentQuestion, option: string): QuestionDraft {
  const current = draft.picks[q.id] ?? []
  if (q.type === 'multi') {
    const picks = current.includes(option)
      ? current.filter((value) => value !== option)
      : [...current, option]
    return { ...draft, picks: { ...draft.picks, [q.id]: picks } }
  }
  return {
    picks: { ...draft.picks, [q.id]: [option] },
    free: { ...draft.free, [q.id]: '' }
  }
}

/** Typing an answer of one's own: for a single-choice question it replaces the picked option. */
export function typeAnswer(draft: QuestionDraft, q: AgentQuestion, text: string): QuestionDraft {
  return {
    picks: q.type === 'single' && text.trim() !== '' ? { ...draft.picks, [q.id]: [] } : draft.picks,
    free: { ...draft.free, [q.id]: text }
  }
}

/** The answers the card sends: typed text wins for single, joins the picks for multi. */
export function compileAnswers(
  questions: AgentQuestion[],
  draft: QuestionDraft
): AgentQuestionAnswers {
  const answers: AgentQuestionAnswers = {}
  for (const q of questions) {
    const free = (draft.free[q.id] ?? '').trim()
    const picks = draft.picks[q.id] ?? []
    if (q.type === 'text') {
      if (free) answers[q.id] = free
    } else if (q.type === 'single') {
      const answer = free || picks[0]
      if (answer) answers[q.id] = answer
    } else {
      const all = free ? [...picks, free] : picks
      if (all.length > 0) answers[q.id] = all
    }
  }
  return answers
}

/** Whether one question still needs an answer before Next or Send. */
export function needsAnswer(q: AgentQuestion, draft: QuestionDraft): boolean {
  return q.required !== false && compileAnswers([q], draft)[q.id] === undefined
}

/** Whether every answer fits its question, so the card can send them. */
export function isComplete(questions: AgentQuestion[], draft: QuestionDraft): boolean {
  return checkQuestionAnswers(questions, compileAnswers(questions, draft)) === null
}

/** The option a digit key 1–9 picks on the shown question, if any. */
export function optionForKey(q: AgentQuestion, key: string): string | undefined {
  if (!/^[1-9]$/.test(key)) return undefined
  return q.options?.[Number(key) - 1]
}
