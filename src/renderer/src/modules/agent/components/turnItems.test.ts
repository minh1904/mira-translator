import { describe, expect, it } from 'vitest'
import type {
  AgentResponsePart,
  AgentToolCallView,
  AgentTurnView
} from '../../../../../shared/contracts/agent'
import { childCalls, turnItems } from './turnItems'

const turn = { id: 't1' } as AgentTurnView
const part = (patch: Partial<AgentResponsePart>): AgentResponsePart => ({
  id: 'p' + patch.seq,
  turnId: 't1',
  seq: 1,
  round: 1,
  kind: 'text',
  text: '',
  toolCallId: null,
  durationMs: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch
})
const call = (id: string, patch: Partial<AgentToolCallView> = {}): AgentToolCallView => ({
  id,
  turnId: 't1',
  round: 1,
  parentToolCallId: null,
  name: 'list_works',
  args: {},
  state: 'completed',
  invocationMessage: 'Đang đọc',
  pastTenseMessage: 'Đã đọc',
  summary: null,
  reason: null,
  durationMs: null,
  createdAt: 1,
  ...patch
})

describe('turnItems', () => {
  it('keeps stored parts in their order: text, tool, text', () => {
    const items = turnItems({
      turn,
      parts: [
        part({ seq: 1, kind: 'text', text: 'Để tôi xem.' }),
        part({ seq: 2, kind: 'tool_call', toolCallId: 'c1' }),
        part({ seq: 3, round: 2, kind: 'text', text: 'Xong.' })
      ],
      toolCalls: { c1: call('c1') }
    })
    expect(items.map((item) => item.kind)).toEqual(['text', 'tool', 'text'])
  })

  it('adds streamed rounds and their calls after the stored parts', () => {
    const items = turnItems({
      turn,
      parts: [part({ seq: 1, kind: 'text', text: 'Vòng 1.' })],
      toolCalls: { c2: call('c2', { round: 2, state: 'running' }) },
      live: {
        2: {
          text: 'Đang đọc tiếp.',
          reasoning: 'Nghĩ',
          reasoningStartedAt: 10,
          reasoningEndedAt: 30
        },
        3: { text: '', reasoning: 'Còn nghĩ', reasoningStartedAt: 40, reasoningEndedAt: null }
      }
    })
    expect(items.map((item) => [item.kind, 'live' in item ? item.live : null])).toEqual([
      ['text', false],
      ['reasoning', false],
      ['text', true],
      ['tool', null],
      ['reasoning', true]
    ])
    expect(items[1]).toMatchObject({ durationMs: 20 })
  })

  it('keeps the same key when a streamed round is read back as parts', () => {
    const streamed = turnItems({
      turn,
      parts: [],
      toolCalls: {},
      live: { 1: { text: 'Chữ', reasoning: '', reasoningStartedAt: null, reasoningEndedAt: null } }
    })
    const stored = turnItems({ turn, parts: [part({ seq: 1, text: 'Chữ' })], toolCalls: {} })
    expect(stored[0].key).toBe(streamed[0].key)
  })

  it('lists the calls of a subagent apart from the turn', () => {
    const calls = { p: call('p'), a: call('a', { parentToolCallId: 'p', createdAt: 2 }) }
    expect(turnItems({ turn, parts: [], toolCalls: calls }).map((item) => item.key)).toEqual([
      'tool:p'
    ])
    expect(childCalls(calls, 'p').map((item) => item.id)).toEqual(['a'])
  })

  describe('todo_list', () => {
    const write = (id: string, todos: unknown, patch: Partial<AgentToolCallView> = {}) =>
      call(id, { name: 'todo_list', args: { todos }, ...patch })
    const first = [{ content: 'Đọc', status: 'in_progress' }]
    const later = [{ content: 'Đọc', status: 'completed' }]

    it('draws one card at the first write, with what the latest write holds', () => {
      const items = turnItems({
        turn,
        parts: [
          part({ seq: 1, kind: 'tool_call', toolCallId: 'w1' }),
          part({ seq: 2, round: 2, kind: 'tool_call', toolCallId: 'r1' }),
          part({ seq: 3, round: 3, kind: 'tool_call', toolCallId: 'read' }),
          part({ seq: 4, round: 4, kind: 'tool_call', toolCallId: 'w2' })
        ],
        toolCalls: {
          w1: write('w1', first),
          r1: call('r1', { round: 2 }),
          read: call('read', { round: 3, name: 'todo_list', args: {} }),
          w2: write('w2', later, { round: 4 })
        }
      })
      expect(items.map((item) => item.kind)).toEqual(['todo', 'tool'])
      expect(items[0]).toMatchObject({ kind: 'todo', items: later })
    })

    it('keeps a failed write as a tool row and leaves turns without a list alone', () => {
      const items = turnItems({
        turn,
        parts: [part({ seq: 1, kind: 'tool_call', toolCallId: 'bad' })],
        toolCalls: { bad: write('bad', 'x', { state: 'failed' }) }
      })
      expect(items.map((item) => item.kind)).toEqual(['tool'])
    })
  })
})
