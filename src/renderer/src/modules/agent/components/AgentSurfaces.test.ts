import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionDetailView, AgentTurnView } from '../../../../../shared/contracts/agent'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useAgentStore } from '../store/agentStore'
import { AgentComposer } from './AgentComposer'
import { AgentTranscript } from './AgentTranscript'

/** Server rendering reads zustand's initial state, so copy the live state into it first. */
function render(element: ReactElement): string {
  Object.assign(useAgentStore.getInitialState(), useAgentStore.getState())
  return renderToStaticMarkup(element)
}

const session = {
  id: 's1',
  title: 'Phiên chung',
  permissionLevel: 'default' as const,
  createdAt: 1,
  updatedAt: 1
}
const turn = (id: string, patch: Partial<AgentTurnView>): AgentTurnView => ({
  id,
  sessionId: 's1',
  instruction: '',
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
  createdAt: 1,
  updatedAt: 1,
  ...patch
})

function bridge(detail: AgentSessionDetailView) {
  const send = vi.fn(async (input: { context?: unknown }) => {
    void input
    return { ok: true, value: { requestId: 'r', turnId: 'tx', sessionId: 's1' } }
  })
  ;(globalThis as unknown as { window: unknown }).window = {
    mira: {
      agent: {
        sessions: { get: vi.fn(async () => ({ ok: true, value: detail })), list: vi.fn() },
        turn: { send, cancel: vi.fn() }
      }
    }
  }
  return send
}

describe('assistant surfaces', () => {
  beforeEach(() => {
    resetAllStores()
  })
  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = undefined
    useAgentStore.getState().adapter.setActiveContextGetter(() => null)
  })

  it('keeps the draft and transcript when the user moves from the chapter panel to the screen', async () => {
    const send = bridge({
      session,
      turns: [turn('t1', { instruction: 'chào', answer: 'Chào bạn.' })],
      activities: [],
      operations: [],
      pending: [],
      sessionApprovals: [],
      editedChapters: [],
      // Main always sends the answer as a part, rebuilt for turns stored before parts existed.
      parts: [
        {
          id: 'p1',
          turnId: 't1',
          seq: 1,
          round: 1,
          kind: 'text',
          text: 'Chào bạn.',
          toolCallId: null,
          durationMs: null,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      toolCalls: []
    })
    await useAgentStore.getState().selectSession('s1')
    useAgentStore.getState().setDraft('dịch giúp chương này')

    // Both surfaces render the same composer and transcript from one store.
    for (let surface = 0; surface < 2; surface++) {
      expect(render(createElement(AgentComposer))).toContain('dịch giúp chương này')
      expect(render(createElement(AgentTranscript))).toContain('Chào bạn.')
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('sends each turn of one session with the context of where it was sent from', async () => {
    // Ask adds the open chapter by itself; Agent leaves it dimmed until the user adds it.
    useAgentStore.getState().setMode('ask')
    const send = bridge({
      session,
      turns: [],
      activities: [],
      operations: [],
      pending: [],
      sessionApprovals: [],
      editedChapters: [],
      parts: [],
      toolCalls: []
    })
    await useAgentStore.getState().selectSession('s1')
    const { adapter } = useAgentStore.getState()

    adapter.setActiveContextGetter(() => ({ workId: 'work-a', chapterId: 'ch-1' }))
    await useAgentStore.getState().send('dịch chương này')
    useAgentStore.setState({ isStreaming: false, streamingTurnId: null })
    adapter.setActiveContextGetter(() => ({ workId: 'work-b' }))
    await useAgentStore.getState().send('còn truyện này?')

    expect(send.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({
        sessionId: 's1',
        context: { workId: 'work-a', chapterId: 'ch-1' }
      }),
      expect.objectContaining({ sessionId: 's1', context: { workId: 'work-b' } })
    ])
  })

  it('dims the open chapter in Agent, shows what is sent and a status for screen readers', async () => {
    bridge({
      session,
      turns: [turn('t1', { instruction: 'dịch', status: 'waiting_user' })],
      activities: [],
      operations: [],
      sessionApprovals: [],
      editedChapters: [],
      parts: [],
      toolCalls: [],
      pending: [
        {
          turnId: 't1',
          toolCallId: 'c',
          argsDigest: 'd',
          name: 'resolve_target',
          kind: 'choose',
          label: 'Chọn đích',
          candidates: [
            { handle: 't1', label: 'Đại Đạo – Tiết tử Thượng' },
            { handle: 't2', label: 'Đại Đạo – Tiết tử Hạ' }
          ],
          createdAt: 1
        }
      ]
    })
    await useAgentStore.getState().selectSession('s1')
    useAgentStore.getState().adapter.setActiveContextGetter(
      () => ({ workId: 'w', chapterId: 'c' }),
      () => ({ work: 'Đại Đạo', chapter: 'Chương 1' })
    )
    let composer = render(createElement(AgentComposer))
    expect(composer).toContain('aria-label="Thêm Chương 1 vào ngữ cảnh"')
    expect(composer).toContain('data-suggested="true"')
    expect(composer).toContain('placeholder="Mô tả việc cần làm"')

    useAgentStore.getState().setImplicitAdded(true)
    composer = render(createElement(AgentComposer))
    expect(composer).toContain('aria-label="Bỏ Chương 1 khỏi ngữ cảnh"')
    expect(composer).not.toContain('data-suggested')

    const transcript = render(createElement(AgentTranscript))
    expect(transcript).toContain('role="status"')
    expect(transcript).toContain('Trợ lý đang chờ bạn chọn hoặc duyệt.')
    expect(transcript).toContain('Đại Đạo – Tiết tử Hạ')
    expect(transcript).toContain('role="group"')
  })
})
