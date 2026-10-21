import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentPendingAction } from '../../../../../shared/contracts/agent'
import { PendingActionCard } from './PendingActionCard'

describe('PendingActionCard', () => {
  it('renders interactive question with candidate buttons', () => {
    const action: AgentPendingAction = {
      turnId: 't1',
      toolCallId: 'call-1',
      argsDigest: 'd1',
      name: 'ask_questions',
      kind: 'question',
      label: 'Bạn muốn dịch theo phong cách nào?',
      candidates: [
        { handle: 'opt-1', label: 'Thuần Việt' },
        { handle: 'opt-2', label: 'Convert' }
      ],
      createdAt: 1000
    }

    const html = renderToStaticMarkup(
      createElement(PendingActionCard, {
        action,
        onReply: vi.fn()
      })
    )

    expect(html).toContain('Bạn muốn dịch theo phong cách nào?')
    expect(html).toContain('Thuần Việt')
    expect(html).toContain('Convert')
    expect(html).toContain('aria-label="Câu hỏi của Trợ lý"')
  })

  it('renders approval dialog for write action', () => {
    const action: AgentPendingAction = {
      turnId: 't1',
      toolCallId: 'call-2',
      argsDigest: 'd2',
      name: 'translate_chapter',
      kind: 'approve',
      label: 'Dịch chương 1',
      candidates: [],
      createdAt: 1000
    }

    const html = renderToStaticMarkup(
      createElement(PendingActionCard, {
        action,
        onReply: vi.fn()
      })
    )

    expect(html).toContain('Dịch chương 1')
    expect(html).toContain('Duyệt')
    expect(html).toContain('Không duyệt')
    expect(html).toContain('aria-label="Cần duyệt"')
  })
})
