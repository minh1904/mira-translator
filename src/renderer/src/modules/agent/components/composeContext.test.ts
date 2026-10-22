import { describe, expect, it } from 'vitest'
import type { AgentAttachment, AgentContext } from '../../../../../shared/contracts/agent'
import { addAttachment, composeContext, pinnedSelection, type ComposeInput } from './composeContext'

const open: AgentContext = {
  workId: 'w',
  chapterId: 'c12',
  caret: { source: 2, target: null }
}
const labels = { work: 'Đại Đạo', chapter: 'Chương 12' }
const chapter = (id: string, label = id): Extract<AgentAttachment, { kind: 'chapter' }> => ({
  kind: 'chapter',
  workId: 'w',
  chapterId: id,
  label
})
const compose = (patch: Partial<ComposeInput> = {}) =>
  composeContext({
    active: open,
    labels,
    mode: 'agent',
    implicitAdded: null,
    attachments: [],
    ...patch
  })

describe('composeContext', () => {
  it('dims the open chapter in Agent and sends nothing for it', () => {
    const { chips, context } = compose()
    expect(chips).toEqual([
      expect.objectContaining({ type: 'suggested', label: 'Chương 12', added: false })
    ])
    expect(context).toEqual({})
  })

  it('adds the open chapter in Ask, and when the user adds it in Agent', () => {
    for (const patch of [{ mode: 'ask' as const }, { implicitAdded: true }]) {
      const { chips, context } = compose(patch)
      expect(chips[0]).toMatchObject({ type: 'suggested', added: true })
      expect(context).toEqual({ workId: 'w', chapterId: 'c12', caret: open.caret })
    }
    // The user's choice wins over the mode.
    expect(compose({ mode: 'ask', implicitAdded: false }).context).toEqual({})
  })

  it('always sends a selection with its chapter, even while the chapter is dimmed', () => {
    const active = { ...open, selection: { side: 'source' as const, from: 3, to: 5 } }
    const { chips, context } = compose({ active })
    expect(chips.map((chip) => [chip.type, chip.label])).toEqual([
      ['suggested', 'Chương 12'],
      ['selection', 'Đoạn 3–5 bản gốc']
    ])
    expect(context).toMatchObject({ workId: 'w', chapterId: 'c12', selection: active.selection })
  })

  it('keeps a pinned selection after the editor selects another paragraph', () => {
    const first = { ...open, selection: { side: 'source' as const, from: 3, to: 5 } }
    const pinned = pinnedSelection(first, labels)!
    expect(pinned).toMatchObject({ label: 'Chương 12, đoạn 3–5 bản gốc', range: first.selection })

    const active = { ...open, selection: { side: 'source' as const, from: 9, to: 9 } }
    const { context } = compose({ active, attachments: [pinned] })
    expect(context.selection).toEqual(active.selection)
    expect(context.attachments).toEqual([pinned])
  })

  it('moves the suggestion to the new chapter and keeps added chips', () => {
    const attachments = [chapter('c13', 'Chương 13')]
    const { chips, context } = compose({
      active: { workId: 'w', chapterId: 'c14' },
      labels: { chapter: 'Chương 14' },
      attachments
    })
    expect(chips.map((chip) => chip.label)).toEqual(['Chương 14', 'Chương 13'])
    expect(context).toEqual({ attachments })
  })

  it('shows no row and sends an empty context outside a chapter', () => {
    expect(compose({ active: {} })).toEqual({ chips: [], context: {} })
  })

  it('lets an attached open chapter stand for the suggestion', () => {
    const { chips, context } = compose({ implicitAdded: true, attachments: [chapter('c12')] })
    expect(chips.map((chip) => chip.type)).toEqual(['attachment'])
    expect(context).toEqual({ attachments: [chapter('c12')] })
  })

  it('adds a chip once and at most ten', () => {
    const one = addAttachment([], chapter('a'))
    expect(one).toEqual({ ok: true, attachments: [chapter('a')] })
    expect(addAttachment([chapter('a')], chapter('a'))).toEqual({ ok: false, reason: 'duplicate' })
    // A pinned range of a chapter is not the chapter itself.
    expect(
      addAttachment([chapter('a')], { ...chapter('a'), range: { side: 'source', from: 1, to: 1 } })
        .ok
    ).toBe(true)
    const ten = Array.from({ length: 10 }, (_, n) => chapter(`c${n}`))
    expect(addAttachment(ten, chapter('x'))).toEqual({ ok: false, reason: 'full' })
  })
})
