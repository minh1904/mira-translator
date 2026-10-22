import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentOperation,
  AgentPendingAction,
  AgentQuestion,
  AgentToolCallView,
  AgentTurnView
} from '../../../../../shared/contracts/agent'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useAgentStore } from '../store/agentStore'
import { AgentComposer, editDraftKey } from './AgentComposer'
import { QuestionSummary } from './AgentTranscript'
import { revertImpact, revertMessage } from './checkpoints'
import { EditedChaptersBar, editedLabel } from './EditedChaptersBar'
import { QuestionCard } from './QuestionCard'
import {
  compileAnswers,
  initialDraft,
  isComplete,
  needsAnswer,
  optionForKey,
  pickOption,
  typeAnswer
} from './questionState'
import { TurnRequest } from './TurnRequest'

/** Server rendering reads zustand's initial state, so copy the live state into it first. */
function render(element: ReactElement): string {
  Object.assign(useAgentStore.getInitialState(), useAgentStore.getState())
  return renderToStaticMarkup(element)
}

const style: AgentQuestion = {
  id: 'style',
  title: 'Phong cách dịch?',
  type: 'single',
  options: ['Thuần Việt', 'Hán Việt'],
  default: 'Thuần Việt',
  allowFreeText: true
}
const names: AgentQuestion = {
  id: 'names',
  title: 'Giữ tên Hán Việt cho ai?',
  type: 'multi',
  options: ['Lâm Động', 'Tiểu Điêu']
}
const question = (questions: AgentQuestion[], allowSkip = true): AgentPendingAction => ({
  turnId: 't1',
  toolCallId: 'c1',
  argsDigest: 'd',
  name: 'ask_questions',
  kind: 'question',
  label: questions[0]!.title,
  candidates: [],
  questions,
  allowSkip,
  createdAt: 1
})
const turn = (
  id: string,
  createdAt: number,
  patch: Partial<AgentTurnView> = {}
): AgentTurnView => ({
  id,
  sessionId: 's1',
  instruction: 'dịch chương ' + id,
  answer: '',
  reasoning: '',
  context: {},
  mode: 'agent',
  permissionLevel: 'default',
  modelLabel: null,
  status: 'completed',
  usage: null,
  costUsd: null,
  legacyRef: null,
  createdAt,
  updatedAt: createdAt,
  ...patch
})
const operation = (id: string, turnId: string, chapterId: string): AgentOperation => ({
  id,
  turnId,
  taskItemId: null,
  commandId: 'tool-' + id,
  capability: 'translate_chapter',
  target: {
    kind: 'chapter',
    workId: 'w',
    workLabel: 'Đại Đạo',
    chapterId,
    chapterLabel: chapterId
  },
  state: 'completed',
  progress: null,
  model: null,
  usage: null,
  result: null,
  error: null,
  createdAt: 1,
  updatedAt: 1
})

describe('question card', () => {
  it('starts on the defaults and answers with digits, picks and typed text', () => {
    let draft = initialDraft([style, names])
    expect(compileAnswers([style, names], draft)).toEqual({ style: 'Thuần Việt' })
    // The multi-choice question still needs an answer, so Next and Send stay locked.
    expect(needsAnswer(names, draft)).toBe(true)
    expect(isComplete([style, names], draft)).toBe(false)

    expect(optionForKey(style, '2')).toBe('Hán Việt')
    expect(optionForKey(style, '9')).toBeUndefined()
    draft = pickOption(draft, style, optionForKey(style, '2')!)
    draft = pickOption(draft, names, 'Lâm Động')
    draft = pickOption(draft, names, 'Tiểu Điêu')
    draft = pickOption(draft, names, 'Lâm Động')
    expect(compileAnswers([style, names], draft)).toEqual({
      style: 'Hán Việt',
      names: ['Tiểu Điêu']
    })

    // Typing an answer of one's own replaces the picked option of a single-choice question.
    draft = typeAnswer(draft, style, 'Thuần Việt nhưng giữ tên riêng')
    expect(draft.picks.style).toEqual([])
    expect(compileAnswers([style], draft)).toEqual({ style: 'Thuần Việt nhưng giữ tên riêng' })
    expect(isComplete([style, names], draft)).toBe(true)
  })

  it('shows one question at a time with its step, numbered options, the default and skip', () => {
    const html = render(
      createElement(QuestionCard, {
        action: question([style, names]),
        onAnswer: vi.fn(),
        onSkip: vi.fn()
      })
    )
    expect(html).toContain('Câu hỏi 1/2')
    expect(html).toContain('Phong cách dịch?')
    expect(html).not.toContain('Giữ tên Hán Việt cho ai?')
    // The default is chosen before the user does anything.
    expect(html).toMatch(/aria-selected="true"[^>]*>.*?Thuần Việt/)
    expect(html).toContain('placeholder="Nhập câu trả lời khác"')
    expect(html).toContain('Bỏ qua tất cả')
    expect(html).toContain('>Tiếp<')
    expect(html).toContain('aria-keyshortcuts="Control+Enter"')
  })

  it('locks a required question without an answer and hides skip when the model turned it off', () => {
    const html = render(
      createElement(QuestionCard, {
        action: question([names], false),
        onAnswer: vi.fn(),
        onSkip: vi.fn()
      })
    )
    expect(html).toContain('Câu này cần trả lời')
    const send = html.match(/<button[^>]*title="Gửi \(Ctrl\+Enter\)"[^>]*>/)?.[0] ?? ''
    expect(send).toMatch(/disabled/)
    expect(html).not.toContain('Bỏ qua tất cả')
  })

  it('leaves a summary line where the question was asked', () => {
    const answered = render(
      createElement(QuestionSummary, {
        answers: [{ id: 'style', title: 'Phong cách dịch?', answer: 'Thuần Việt' }]
      })
    )
    expect(answered).toContain('H: Phong cách dịch?')
    expect(answered).toContain('Đ: Thuần Việt')
    expect(render(createElement(QuestionSummary, { answers: 'skipped' }))).toContain(
      'Đã bỏ qua câu hỏi'
    )
  })
})

describe('composer surroundings', () => {
  beforeEach(() => resetAllStores())

  it('puts the question card, then the edited bar, above the input', () => {
    useAgentStore.setState({
      pending: [question([style])],
      editedChapters: [
        {
          workId: 'w',
          chapterId: 'c3',
          workLabel: 'Đại Đạo',
          chapterLabel: 'Chương 3',
          operationIds: ['o1'],
          units: 4
        }
      ]
    })
    const html = render(createElement(AgentComposer))
    const card = html.indexOf('aria-label="Câu hỏi của Trợ lý"')
    const bar = html.indexOf('aria-label="Chương đã sửa"')
    const input = html.indexOf('<textarea')
    expect(card).toBeGreaterThan(-1)
    expect(bar).toBeGreaterThan(card)
    expect(input).toBeGreaterThan(bar)
    expect(html).toContain('Đã sửa 1 chương')
    expect(html).toContain('Giữ tất cả')
    expect(html).toContain('Hoàn tác tất cả')
  })

  it('hides the edited bar when nothing is left', () => {
    expect(render(createElement(EditedChaptersBar))).toBe('')
    expect(editedLabel(3)).toBe('Đã sửa 3 chương')
  })

  it('edits a command in place with its own draft, Cancel and no question card', () => {
    useAgentStore.setState({ pending: [question([style])] })
    useAgentStore.getState().setDraft('dịch chương 5', editDraftKey('t2'))
    const html = render(
      createElement(AgentComposer, {
        edit: { turnId: 't2', context: {}, onDone: vi.fn() }
      })
    )
    expect(html).toContain('aria-label="Sửa lệnh"')
    expect(html).toContain('dịch chương 5')
    expect(html).toContain('Hủy sửa (Esc)')
    expect(html).not.toContain('Câu hỏi của Trợ lý')
    expect(html).not.toContain('Mức quyền')
    // The session's own draft is untouched.
    expect(useAgentStore.getState().drafts.new).toBeUndefined()
  })
})

describe('checkpoints', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
  })

  it('offers Start over on the first command and Restore checkpoint on the others', () => {
    const first = render(createElement(TurnRequest, { turn: turn('t1', 1), first: true }))
    expect(first).toContain('Bắt đầu lại')
    expect(first).toContain('aria-label="Sửa lệnh: dịch chương t1"')
    expect(first).toContain('tabindex="0"')
    const later = render(createElement(TurnRequest, { turn: turn('t2', 2), first: false }))
    expect(later).toContain('Khôi phục checkpoint')

    useAgentStore.setState({ isStreaming: true })
    const locked = render(createElement(TurnRequest, { turn: turn('t2', 2), first: false }))
    expect(locked).toContain('tabindex="-1"')
    expect(locked).toContain('aria-disabled="true"')
  })

  it('counts the chapters a restore undoes and the tasks that keep running', () => {
    const turns = [turn('t1', 1), turn('t2', 2), turn('t3', 3)]
    const operations = {
      o1: operation('o1', 't1', 'c1'),
      o2: operation('o2', 't2', 'c2'),
      o3: operation('o3', 't3', 'c2'),
      o4: { ...operation('o4', 't3', 'c3'), state: 'undone' as const }
    }
    const toolCalls = {
      k: { id: 'k', turnId: 't3', name: 'create_translation_task', state: 'completed' }
    } as unknown as Record<string, AgentToolCallView>
    const impact = revertImpact('t2', turns, operations, toolCalls)
    expect(impact).toEqual({ turnIds: ['t2', 't3'], chapters: 1, tasks: 1 })
    const message = revertMessage(impact)
    expect(message).toContain('1 chương')
    expect(message).toContain('1 tác vụ dịch')
    expect(message).toContain('Không làm lại được')
  })

  it('restores through Main, drops the hidden turns and gives the command back', async () => {
    const revert = vi.fn(async () => ({
      ok: true,
      value: {
        revertedTurnIds: ['t2', 't3'],
        instruction: 'dịch chương t2',
        context: {
          attachments: [{ kind: 'chapter', workId: 'w', chapterId: 'c2', label: 'Chương 2' }]
        }
      }
    }))
    const get = vi.fn(async () => ({
      ok: true,
      value: {
        session: { id: 's1', title: '', permissionLevel: 'default', createdAt: 1, updatedAt: 1 },
        turns: [turn('t1', 1)],
        activities: [],
        operations: [],
        pending: [],
        sessionApprovals: [],
        parts: [],
        toolCalls: [],
        editedChapters: []
      }
    }))
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: { agent: { turn: { revert }, sessions: { get } } }
    }
    useAgentStore.setState({
      activeSessionId: 's1',
      turns: [turn('t1', 1), turn('t2', 2), turn('t3', 3)]
    })
    expect(await useAgentStore.getState().revertToTurn('t2')).toBe(true)
    expect(revert).toHaveBeenCalledWith('t2')
    const state = useAgentStore.getState()
    expect(state.turns.map((item) => item.id)).toEqual(['t1'])
    expect(state.drafts.s1).toBe('dịch chương t2')
    expect(state.composer.s1?.attachments).toHaveLength(1)
  })

  it('keeps the transcript and shows why when Main refuses the restore', async () => {
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: {
        agent: {
          turn: {
            revert: vi.fn(async () => ({
              ok: false,
              error: { code: 'conflict', message: 'Không khôi phục được: "Chương 2" đã được sửa.' }
            }))
          }
        }
      }
    }
    useAgentStore.setState({ activeSessionId: 's1', turns: [turn('t1', 1), turn('t2', 2)] })
    expect(await useAgentStore.getState().revertToTurn('t2')).toBe(false)
    expect(useAgentStore.getState().turns).toHaveLength(2)
    expect(useAgentStore.getState().lastError).toContain('"Chương 2"')
  })
})
