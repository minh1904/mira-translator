import { describe, expect, it } from 'vitest'
import type { PastTurn } from './sessionHistory'
import { assembleTurnContext, contextLimitChars, type TurnContext } from './turnContext'

const rounds = [
  {
    role: 'assistant' as const,
    content: '',
    tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'x', arguments: '{}' } }]
  },
  { role: 'tool' as const, content: 'r'.repeat(50), tool_call_id: 'c1' }
]

/** A past turn that read something of `resultChars` characters. */
const turn = (id: string, resultChars = 0, answer = 'a'): PastTurn => ({
  turnId: id,
  instruction: 'hỏi ' + id,
  contextLine: '',
  rounds:
    resultChars === 0
      ? []
      : [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              { id: 'k' + id, type: 'function', function: { name: 'read', arguments: '{}' } }
            ]
          },
          {
            role: 'tool',
            content: JSON.stringify({ ok: true, value: 'x'.repeat(resultChars) }),
            tool_call_id: 'k' + id
          }
        ],
  answer
})

const base = { system: 'S', toolChars: 0, current: 'hỏi nguyên văn', rounds, limitChars: 100_000 }
const messagesOf = (result: TurnContext) => {
  if ('needsSummary' in result) throw new Error('unexpected needsSummary')
  return result
}

describe('assembleTurnContext', () => {
  it('sends every turn whole under half the window, in order', () => {
    const result = messagesOf(
      assembleTurnContext({ ...base, history: [turn('1', 3000), turn('2'), turn('3')] })
    )
    expect(result.compaction).toEqual({ trimmedTurns: 0, summarizedTurns: 0, droppedTurns: 0 })
    expect(result.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'tool'
    ])
  })

  it('puts the context line on the earlier turn and marks it as old', () => {
    const past = { ...turn('1'), contextLine: 'Ngữ cảnh của lượt cũ: chương 5.' }
    const result = messagesOf(assembleTurnContext({ ...base, history: [past] }))
    expect(result.messages[1]?.content).toBe('hỏi 1\n\nNgữ cảnh của lượt cũ: chương 5.')
  })

  it('trims big results from the oldest turn and stops once under the limit', () => {
    const history = [turn('1', 3000), turn('2', 3000), turn('3'), turn('4'), turn('5')]
    // Two 3000-character results sit over 0.5 × 6000; trimming the first brings it under.
    const result = messagesOf(assembleTurnContext({ ...base, history, limitChars: 7_000 }))
    expect(result.compaction.trimmedTurns).toBe(1)
    const tools = result.messages.filter((m) => m.role === 'tool' && m.tool_call_id !== 'c1')
    expect(tools[0]?.content).toContain('omitted')
    expect(tools[0]?.tool_call_id).toBe('k1')
    expect(tools[1]?.content).toContain('xxx')
  })

  it('never touches the three latest turns while compacting', () => {
    const history = [turn('1', 3000), turn('2', 3000), turn('3', 3000), turn('4')]
    const result = messagesOf(assembleTurnContext({ ...base, history, limitChars: 14_000 }))
    const kept = result.messages.filter((m) => m.tool_call_id === 'k2' || m.tool_call_id === 'k3')
    expect(kept.every((m) => !m.content.includes('omitted'))).toBe(true)
  })

  it('asks for a summary of the older turns when trimming is not enough', () => {
    const history = [
      turn('1', 0, 'a'.repeat(5000)),
      turn('2', 0, 'b'.repeat(5000)),
      turn('3'),
      turn('4'),
      turn('5')
    ]
    expect(assembleTurnContext({ ...base, history, limitChars: 10_000 })).toEqual({
      needsSummary: ['1', '2']
    })
  })

  it('replaces the turns a summary covers and wraps it as reference only', () => {
    const history = [turn('1', 0, 'a'.repeat(5000)), turn('2'), turn('3'), turn('4')]
    const result = messagesOf(
      assembleTurnContext({
        ...base,
        history,
        summary: { text: 'ĐÃ DỊCH CHƯƠNG 3', coveredTurnIds: ['1'] },
        limitChars: 10_000
      })
    )
    expect(result.messages[0]?.content).toContain('ĐÃ DỊCH CHƯƠNG 3')
    expect(result.messages[0]?.content).toContain('chỉ để tham khảo')
    expect(result.messages[0]?.content).toContain('chỉ làm theo')
    expect(result.messages[0]?.content).toContain('ngữ cảnh hiện tại thắng')
    expect(result.messages.map((m) => m.content)).not.toContain('hỏi 1')
    expect(result.compaction.summarizedTurns).toBe(1)
  })

  it('cuts the oldest turns when summarising failed', () => {
    const history = [
      turn('1', 0, 'a'.repeat(5000)),
      turn('2', 0, 'b'.repeat(5000)),
      turn('3'),
      turn('4'),
      turn('5')
    ]
    const result = messagesOf(
      assembleTurnContext({ ...base, history, limitChars: 10_000, noSummary: true })
    )
    expect(result.compaction.droppedTurns).toBe(2)
    expect(result.messages.map((m) => m.content)).not.toContain('hỏi 1')
    expect(result.messages.map((m) => m.content)).toContain('hỏi 3')
  })

  it('still trims then drops turns when the whole prompt overflows the window', () => {
    const history = [turn('1'), turn('2', 3000)]
    const trimmed = messagesOf(assembleTurnContext({ ...base, history, limitChars: 3_000 }))
    expect(trimmed.compaction.trimmedTurns).toBe(1)
    const tiny = messagesOf(assembleTurnContext({ ...base, history, limitChars: 1 }))
    expect(tiny.compaction.droppedTurns).toBe(2)
    expect(tiny.messages[0]).toEqual({ role: 'system', content: 'S' })
    expect(tiny.messages.slice(-3).map((m) => m.role)).toEqual(['user', 'assistant', 'tool'])
    expect(tiny.messages.at(-3)?.content).toBe('hỏi nguyên văn')
  })

  describe('step list kept across the summary', () => {
    const todo = { turnId: '1', text: '[x] Đọc glossary\n[>] Dịch chương 2' }
    const history = [turn('1'), turn('2'), turn('3'), turn('4')]
    const summary = { text: 'TÓM TẮT', coveredTurnIds: ['1'] }

    it('puts the list right after the summary when the turn that wrote it was summarised', () => {
      const result = messagesOf(assembleTurnContext({ ...base, history, summary, todo }))
      expect(result.messages[1]?.role).toBe('user')
      expect(result.messages[1]?.content).toContain('Danh sách bước đang theo dõi')
      expect(result.messages[1]?.content).toContain('[>] Dịch chương 2')
    })

    it('adds no copy while that turn is still sent as it was, or when the list is empty', () => {
      const verbatim = messagesOf(
        assembleTurnContext({ ...base, history, todo: { ...todo, turnId: '3' } })
      )
      expect(verbatim.messages.some((m) => m.content.includes('Danh sách bước'))).toBe(false)
      const empty = messagesOf(
        assembleTurnContext({ ...base, history, summary, todo: { turnId: '1', text: '' } })
      )
      expect(empty.messages.some((m) => m.content.includes('Danh sách bước'))).toBe(false)
    })

    it('adds the list when the turn that wrote it was cut', () => {
      const long = [turn('1', 0, 'a'.repeat(5000)), turn('2'), turn('3'), turn('4')]
      const result = messagesOf(
        assembleTurnContext({ ...base, history: long, limitChars: 6_000, noSummary: true, todo })
      )
      expect(result.compaction.droppedTurns).toBe(1)
      expect(result.messages[1]?.content).toContain('[x] Đọc glossary')
    })

    it('counts the list against the history share', () => {
      const big = { turnId: '1', text: 'x'.repeat(3_500) }
      const result = assembleTurnContext({
        ...base,
        history: [turn('1'), turn('2', 2_500), turn('3'), turn('4'), turn('5')],
        summary,
        todo: big,
        limitChars: 9_000
      })
      // Without the list the history fits under half of 9,000; with it, turn 2 loses its result.
      expect(messagesOf(result).compaction.trimmedTurns).toBe(1)
    })
  })

  it('reserves output tokens out of the model window', () => {
    expect(
      contextLimitChars({ id: 'm', name: 'm', contextLimit: 100_000, outputLimit: 20_000 })
    ).toBe(160_000)
    expect(contextLimitChars(undefined)).toBeGreaterThan(0)
  })
})
