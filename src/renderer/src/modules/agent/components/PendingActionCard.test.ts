import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentPendingAction } from '../../../../../shared/contracts/agent'
import { approvalShortcut, PendingActionCard } from './PendingActionCard'

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
    expect(html).toContain('Cho phép trong phiên này')
    expect(html).toContain('aria-label="Lựa chọn cho phép khác"')
    expect(html).toContain('Bỏ qua')
    expect(html).toContain('aria-label="Cần duyệt"')
    expect(html).toContain('aria-keyshortcuts="Control+Enter Control+Alt+Enter"')
  })

  it('maps Ctrl+Enter to allowing for the session and Ctrl+Alt+Enter to skipping', () => {
    expect(approvalShortcut({ key: 'Enter', ctrlKey: true, altKey: false })).toBe('approve_session')
    expect(approvalShortcut({ key: 'Enter', ctrlKey: true, altKey: true })).toBe('reject')
    expect(approvalShortcut({ key: 'Enter', ctrlKey: false, altKey: false })).toBeNull()
    expect(approvalShortcut({ key: 'a', ctrlKey: true, altKey: false })).toBeNull()
  })
})
