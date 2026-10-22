import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentTurnView } from '../../../../../shared/contracts/agent'
import { AgentFollowups, getSuggestedFollowups } from './AgentFollowups'

const makeTurn = (instruction: string): AgentTurnView => ({
  id: 't1',
  sessionId: 's1',
  instruction,
  answer: 'Done.',
  reasoning: '',
  context: {},
  mode: 'agent',
  permissionLevel: 'default',
  status: 'completed',
  usage: null,
  costUsd: null,
  legacyRef: null,
  createdAt: 1000,
  updatedAt: 1200
})

describe('AgentFollowups', () => {
  it('generates contextual followups for translation turns', () => {
    const followups = getSuggestedFollowups(makeTurn('Dịch chương 1'))
    expect(followups).toContain('Dịch chương tiếp theo')
    expect(followups).toContain('Rà soát xưng hô chương vừa dịch')
  })

  it('generates contextual followups for glossary turns', () => {
    const followups = getSuggestedFollowups(makeTurn('Trích xuất thuật ngữ'))
    expect(followups).toContain('Thêm các thuật ngữ này vào bảng')
  })

  it('renders suggestion buttons in static markup', () => {
    const html = renderToStaticMarkup(
      createElement(AgentFollowups, {
        lastTurn: makeTurn('Dịch chương 1'),
        onSelectPrompt: vi.fn()
      })
    )
    expect(html).toContain('Gợi ý:')
    expect(html).toContain('Dịch chương tiếp theo')
  })
})
