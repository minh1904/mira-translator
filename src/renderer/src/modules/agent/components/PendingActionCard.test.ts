import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentPendingAction } from '../../../../../shared/contracts/agent'
import { approvalShortcut, PendingActionCard } from './PendingActionCard'

describe('PendingActionCard', () => {
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
