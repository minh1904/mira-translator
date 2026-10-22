import {
  createElement,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentAttachment,
  AgentContextSearchGroup
} from '../../../../../shared/contracts/agent'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useAgentStore } from '../store/agentStore'
import { pickerRows } from './AddContextPicker'
import { AgentComposer } from './AgentComposer'
import { commandHistory, historyStep } from './commandHistory'
import { attachmentKey, type ComposerChip } from './composeContext'
import { ContextChipRow, type ContextChipRowProps } from './ContextChipRow'

const chapter13: AgentAttachment = {
  kind: 'chapter',
  workId: 'w',
  chapterId: 'c13',
  label: 'Chương 13'
}

/** Server rendering reads zustand's initial state, so copy the live state into it first. */
function render(element: ReactElement): string {
  Object.assign(useAgentStore.getInitialState(), useAgentStore.getState())
  return renderToStaticMarkup(element)
}

/** Expands function components so tests can reach the handlers of the elements they draw. */
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand)
  if (!isValidElement(node)) return node
  const { type, props } = node as ReactElement<{ children?: ReactNode }>
  if (typeof type === 'function') return expand((type as (p: unknown) => ReactNode)(props))
  return { ...node, props: { ...props, children: expand(props.children) } }
}

function findAll(node: ReactNode, match: (props: Record<string, unknown>) => boolean) {
  const found: Array<Record<string, unknown>> = []
  const walk = (current: ReactNode): void => {
    if (Array.isArray(current)) {
      current.forEach(walk)
      return
    }
    if (!isValidElement(current)) return
    const props = current.props as Record<string, unknown> & { children?: ReactNode }
    if (match(props)) found.push(props)
    walk(props.children)
  }
  walk(node)
  return found
}

const rowProps = (chips: ComposerChip[]): ContextChipRowProps => ({
  chips,
  onAddSuggested: vi.fn(),
  onRemoveSuggested: vi.fn(),
  onPinSelection: vi.fn(),
  onRemove: vi.fn(),
  onOpenTarget: vi.fn()
})

describe('AgentComposer', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => useAgentStore.getState().adapter.setActiveContextGetter(() => null))

  it('draws no context row without chips, and the toolbar in VS Code order', () => {
    const html = render(createElement(AgentComposer))
    expect(html).not.toContain('Ngữ cảnh gửi kèm')
    const order = ['aria-label="Thêm ngữ cảnh"', '>Agent<', 'Model của Trợ lý', 'aria-label="Gửi"']
    const positions = order.map((needle) => html.indexOf(needle))
    expect(positions.every((at) => at > -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    // The permission level sits under the frame, after the send button.
    expect(html.indexOf('Mức quyền')).toBeGreaterThan(positions[3]!)
    expect(html).toContain('Thêm ngữ cảnh (Ctrl+/)')
  })

  it('puts the row above the input and changes the placeholder with the mode', () => {
    const store = useAgentStore.getState()
    store.adapter.setActiveContextGetter(
      () => ({ workId: 'w', chapterId: 'c12', selection: { side: 'source', from: 3, to: 5 } }),
      () => ({ chapter: 'Chương 12' })
    )
    store.addAttachment(chapter13)
    store.setMode('ask')
    const html = render(createElement(AgentComposer))
    const row = html.indexOf('aria-label="Ngữ cảnh gửi kèm"')
    expect(row).toBeGreaterThan(-1)
    expect(row).toBeLessThan(html.indexOf('<textarea'))
    expect(html).toContain('placeholder="Hỏi về truyện, chương hoặc bản dịch"')
    // Ask adds the open chapter; the selection can be pinned; the added chip can be removed.
    expect(html).toContain('aria-label="Bỏ Chương 12 khỏi ngữ cảnh"')
    expect(html).toContain('aria-label="Ghim Đoạn 3–5 bản gốc vào ngữ cảnh"')
    expect(html).toContain('aria-label="Bỏ Chương 13 khỏi ngữ cảnh"')
  })

  it('adds the dimmed chip from anywhere on it and removes a chip with Backspace or Delete', () => {
    const props = rowProps([
      { type: 'suggested', key: 's', kind: 'chapter', label: 'Chương 12', added: false },
      {
        type: 'attachment',
        key: attachmentKey(chapter13),
        label: 'Chương 13',
        attachment: chapter13
      }
    ])
    const tree = expand(ContextChipRow(props))
    const [suggested] = findAll(tree, (p) => p['data-suggested'] === 'true')
    expect(suggested!['aria-label']).toBe('Thêm Chương 12 vào ngữ cảnh')
    expect(String(suggested!.className)).toContain('border-dashed')
    expect(String(suggested!.className)).toContain('italic')
    ;(suggested!.onClick as () => void)()
    expect(props.onAddSuggested).toHaveBeenCalledOnce()

    const [remove, open] = findAll(tree, (p) => typeof p.onKeyDown === 'function')
    for (const key of ['Backspace', 'Delete']) {
      ;(remove!.onKeyDown as (e: Partial<KeyboardEvent>) => void)({
        key,
        preventDefault: () => {}
      })
    }
    expect(props.onRemove).toHaveBeenNthCalledWith(2, attachmentKey(chapter13))
    ;(open!.onClick as () => void)()
    expect(props.onOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chapter', chapterId: 'c13' })
    )
  })

  it('offers only what the row does not hold yet, in group order', () => {
    const groups: AgentContextSearchGroup[] = [
      {
        kind: 'work',
        items: [{ attachment: { kind: 'work', workId: 'w', label: 'A' }, detail: null }]
      },
      {
        kind: 'chapter',
        items: [
          { attachment: chapter13, detail: 'Tiết tử' },
          {
            attachment: { kind: 'chapter', workId: 'w', chapterId: 'c14', label: 'Chương 14' },
            detail: null
          }
        ]
      }
    ]
    const rows = pickerRows(groups, new Set([attachmentKey(chapter13)]))
    expect(rows.map((row) => [row.group, row.attachment.label])).toEqual([
      ['work', 'A'],
      ['chapter', 'Chương 14']
    ])
  })

  it('browses earlier instructions with their chips and gives the draft back', () => {
    const turns = [
      { instruction: 'dịch chương 13', context: { attachments: [chapter13] } },
      { instruction: '', context: {} },
      { instruction: 'tóm tắt', context: {} }
    ] as unknown as Parameters<typeof commandHistory>[0]
    const history = commandHistory(turns)
    expect(history).toEqual([
      { text: 'dịch chương 13', attachments: [chapter13] },
      { text: 'tóm tắt', attachments: [] }
    ])
    // Up from the draft: newest, then older, and it stops at the oldest.
    expect(historyStep(2, null, 'up')).toBe(1)
    expect(historyStep(2, 1, 'up')).toBe(0)
    expect(historyStep(2, 0, 'up')).toBe(0)
    // Down past the newest returns to the draft; Down on the draft does nothing.
    expect(historyStep(2, 0, 'down')).toBe(1)
    expect(historyStep(2, 1, 'down')).toBeNull()
    expect(historyStep(2, null, 'down')).toBeNull()
    expect(historyStep(0, null, 'up')).toBeNull()
  })
})
