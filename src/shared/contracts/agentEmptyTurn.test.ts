import { describe, expect, it } from 'vitest'
import { BUDGET_STOP_NOTICE, isEmptyTurn, offersContinue } from './agentEmptyTurn'

const text = (value: string) => ({ kind: 'text', text: value })
const call = (name: string, state = 'completed') => ({ name, state })

describe('isEmptyTurn', () => {
  it('is empty when the turn only read', () => {
    expect(isEmptyTurn({ parts: [], toolCalls: [call('list_works'), call('read_chapter')] })).toBe(
      true
    )
  })

  it('is not empty once the turn said something', () => {
    expect(isEmptyTurn({ parts: [text('Xong.')], toolCalls: [call('list_works')] })).toBe(false)
  })

  it('treats text of only whitespace as nothing', () => {
    expect(isEmptyTurn({ parts: [text(' \n\t')], toolCalls: [] })).toBe(true)
  })

  it('does not count reasoning or progress as an answer', () => {
    const parts = [
      { kind: 'reasoning', text: 'Nghĩ…' },
      { kind: 'progress', text: 'Bỏ 2 lượt cũ khỏi ngữ cảnh model' }
    ]
    expect(isEmptyTurn({ parts, toolCalls: [] })).toBe(true)
  })

  it('is not empty when a write completed, even without text', () => {
    expect(isEmptyTurn({ parts: [], toolCalls: [call('translate_chapter')] })).toBe(false)
    expect(isEmptyTurn({ parts: [], toolCalls: [call('create_translation_task')] })).toBe(false)
  })

  it('is still empty when the writes failed or were skipped', () => {
    expect(
      isEmptyTurn({
        parts: [],
        toolCalls: [call('translate_chapter', 'failed'), call('edit_translation', 'skipped')]
      })
    ).toBe(true)
  })
})

describe('offersContinue', () => {
  it('offers Tiếp tục after a turn stopped by a limit, even with an answer and a write', () => {
    const parts = [
      text('Đã dịch chương 1.'),
      { kind: 'progress', text: `${BUDGET_STOP_NOTICE}: Đã dùng hết 15 vòng của lượt.` }
    ]
    expect(offersContinue({ parts, toolCalls: [call('translate_chapter')] })).toBe(true)
  })

  it('offers Tiếp tục after an empty turn and not after a normal one', () => {
    expect(offersContinue({ parts: [], toolCalls: [call('list_works')] })).toBe(true)
    expect(offersContinue({ parts: [text('Xong.')], toolCalls: [] })).toBe(false)
  })
})
