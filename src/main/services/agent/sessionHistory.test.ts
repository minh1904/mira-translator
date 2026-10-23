import { describe, expect, it } from 'vitest'
import type { AgentToolCall } from '../../infra/storage/agentRepository'
import { pastTurnOf, roundMessages } from './sessionHistory'

const call = (over: Partial<AgentToolCall>): AgentToolCall => ({
  id: 'row',
  turnId: 'turn',
  round: 1,
  callId: 'c1',
  name: 'read_chapter',
  args: { target: 't1' },
  extra: { thought_signature: 'sig' },
  argsDigest: 'd',
  decision: 'allow',
  approval: null,
  state: 'completed',
  result: { ok: true, value: { text: 'nội dung' } },
  parentCallId: null,
  messages: null,
  createdAt: 1,
  ...over
})

const labels = new Map([
  ['t1', 'Kiếm Đạo – chương 5'],
  ['ctx', 'Kiếm Đạo – chương 5']
])
const turn = { id: 'turn', instruction: 'đọc chương 5', answer: 'xong' }

describe('past turn history', () => {
  it('keeps the rounds, swaps handles for labels and drops provider call data', () => {
    const past = pastTurnOf(
      turn,
      [
        call({
          callId: 'r1',
          name: 'resolve_target',
          args: { description: 'chương 5' },
          result: { ok: true, value: { status: 'resolved', handle: 't1', label: 'x' } }
        }),
        call({ round: 2, callId: 'c1', args: { target: 't1' } }),
        call({ round: 3, callId: 'c2', args: { target: 't9' } })
      ],
      'Ngữ cảnh của lượt cũ: Kiếm Đạo.',
      labels,
      true
    )
    expect(past.contextLine).toBe('Ngữ cảnh của lượt cũ: Kiếm Đạo.')
    expect(past.rounds.map((m) => m.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool'
    ])
    expect(JSON.stringify(past.rounds)).not.toContain('thought_signature')
    expect(past.rounds[1]?.content).toContain('Kiếm Đạo – chương 5')
    expect(past.rounds[2]?.tool_calls?.[0]?.function.arguments).toBe(
      JSON.stringify({ target: 'Kiếm Đạo – chương 5' })
    )
    // A handle nobody can look up says so rather than staying a dead id.
    expect(past.rounds[4]?.tool_calls?.[0]?.function.arguments).toContain('đích của lượt cũ')
  })

  it('keeps provider call data for the turn that is running', () => {
    const [assistant] = roundMessages([call({})])
    expect(assistant?.tool_calls?.[0]?.extra_content).toEqual({ thought_signature: 'sig' })
  })

  it('writes the rounds as text for a model without tools', () => {
    const past = pastTurnOf(turn, [call({})], '', labels, false)
    expect(past.rounds.map((m) => m.role)).toEqual(['assistant'])
    expect(past.rounds[0]?.tool_calls).toBeUndefined()
    expect(past.rounds[0]?.content).toContain('Đã gọi `read_chapter` (Kiếm Đạo – chương 5) →')
    expect(past.rounds[0]?.content).toContain('nội dung')
  })
})
