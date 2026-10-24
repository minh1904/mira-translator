import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AgentResponsePart,
  AgentToolCallView,
  AgentTurnView
} from '../../../../../shared/contracts/agent'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useAgentStore, type AgentState } from '../store/agentStore'
import { AgentTranscript } from './AgentTranscript'

const turn = (patch: Partial<AgentTurnView> = {}): AgentTurnView => ({
  id: 't1',
  sessionId: 's1',
  instruction: 'thư viện có gì?',
  answer: 'Để tôi xem.\n\nCó 2 tác phẩm.',
  reasoning: '',
  context: {},
  mode: 'agent',
  permissionLevel: 'default',
  modelLabel: null,
  status: 'completed',
  usage: null,
  costUsd: null,
  legacyRef: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch
})
const part = (seq: number, patch: Partial<AgentResponsePart>): AgentResponsePart => ({
  id: 'p' + seq,
  turnId: 't1',
  seq,
  round: 1,
  kind: 'text',
  text: '',
  toolCallId: null,
  durationMs: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch
})
const call = (patch: Partial<AgentToolCallView> = {}): AgentToolCallView => ({
  id: 'c1',
  turnId: 't1',
  round: 1,
  parentToolCallId: null,
  name: 'list_works',
  args: {},
  state: 'completed',
  invocationMessage: 'Đang đọc danh sách tác phẩm',
  pastTenseMessage: 'Đã đọc danh sách tác phẩm',
  summary: null,
  reason: null,
  durationMs: null,
  createdAt: 1,
  ...patch
})

/** Server rendering reads zustand's initial state, so copy the state into it first. */
function render(state: Partial<AgentState>): string {
  useAgentStore.setState(state)
  Object.assign(useAgentStore.getInitialState(), useAgentStore.getState())
  return renderToStaticMarkup(createElement(AgentTranscript))
}

describe('AgentTranscript', () => {
  beforeEach(() => resetAllStores())

  it('draws text, the tool row and text in the order they happened', () => {
    const html = render({
      turns: [turn()],
      parts: [
        part(1, { text: 'Để tôi xem.' }),
        part(2, { kind: 'tool_call', toolCallId: 'c1' }),
        part(3, { round: 2, text: 'Có 2 tác phẩm.' })
      ],
      toolCalls: { c1: call() }
    })
    const first = html.indexOf('Để tôi xem.')
    const tool = html.indexOf('Đã đọc danh sách tác phẩm')
    const last = html.indexOf('Có 2 tác phẩm.')
    expect(first).toBeGreaterThan(-1)
    expect(tool).toBeGreaterThan(first)
    expect(last).toBeGreaterThan(tool)
    // The request is a right-aligned bubble.
    expect(html).toContain('max-w-[90%] rounded-md')
    // The tool row opens with Enter/Space and says its state in words.
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('(xong)')
  })

  it('puts the approval card right after the row of the call it approves', () => {
    const html = render({
      turns: [turn({ status: 'waiting_user', answer: '' })],
      parts: [part(1, { kind: 'tool_call', toolCallId: 'c1' })],
      toolCalls: {
        c1: call({
          name: 'translate_chapter',
          state: 'waiting_user',
          invocationMessage: 'Đang dịch chương "B"'
        })
      },
      pending: [
        {
          turnId: 't1',
          toolCallId: 'c1',
          argsDigest: 'd',
          name: 'translate_chapter',
          kind: 'approve',
          label: 'Dịch chương "B"',
          candidates: [],
          createdAt: 1
        }
      ]
    })
    const row = html.indexOf('data-tool-call="c1"')
    const card = html.indexOf('data-pending-call="c1"')
    expect(row).toBeGreaterThan(-1)
    expect(card).toBeGreaterThan(row)
    expect(html).toContain('1 thao tác cần duyệt')
  })

  it('shows the working row while nothing else draws, and the footer once the turn ends', () => {
    const working = render({
      turns: [turn({ status: 'running', answer: '' })],
      parts: [],
      toolCalls: {},
      isStreaming: true,
      streamingTurnId: 't1',
      live: {}
    })
    expect(working).toMatch(/Đang (suy nghĩ|phân tích|cân nhắc|làm)…/)
    expect(working).not.toContain('Thử lại')

    const ended = render({
      turns: [turn({ id: 't0', status: 'cancelled' }), turn({ id: 't1', modelLabel: 'Kimi K2' })],
      parts: [],
      toolCalls: {},
      isStreaming: false,
      streamingTurnId: null
    })
    expect(ended).toContain('Đã dừng')
    // Only the last turn can be sent again.
    expect(ended.match(/aria-label="Thử lại"/g)).toHaveLength(1)
    expect(ended).toContain('aria-label="Sao chép câu trả lời"')
    expect(ended).toContain('Kimi K2')
  })

  it('shows a failed turn as an error block', () => {
    const html = render({
      turns: [turn({ status: 'failed', answer: 'Provider từ chối yêu cầu.' })],
      parts: [],
      toolCalls: {}
    })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Provider từ chối yêu cầu.')
  })

  it('offers Tiếp tục under the newest turn that gave nothing, with the notice in place', () => {
    const html = render({
      turns: [turn({ id: 't0', answer: '' }), turn({ answer: '' })],
      parts: [
        part(1, { turnId: 't0', kind: 'progress', text: 'Lượt kết thúc mà không có phản hồi' }),
        part(1, { id: 'p9', kind: 'tool_call', toolCallId: 'c1' }),
        part(2, {
          id: 'p10',
          round: 0,
          kind: 'progress',
          text: 'Lượt kết thúc mà không có phản hồi'
        })
      ],
      toolCalls: { c1: call() }
    })
    expect(html).toContain('Lượt kết thúc mà không có phản hồi')
    // Only the newest turn can be carried on.
    expect(html.match(/>Tiếp tục</g)).toHaveLength(1)
  })

  it('hides Tiếp tục when the turn answered or wrote', () => {
    const answered = render({
      turns: [turn()],
      parts: [part(1, { text: 'Có 2 tác phẩm.' })],
      toolCalls: {}
    })
    expect(answered).not.toContain('>Tiếp tục<')

    const wrote = render({
      turns: [turn({ answer: '' })],
      parts: [part(1, { kind: 'tool_call', toolCallId: 'c1' })],
      toolCalls: { c1: call({ name: 'translate_chapter' }) }
    })
    expect(wrote).not.toContain('>Tiếp tục<')
  })

  it('offers Tiếp tục under a turn that answered and wrote but stopped on a limit', () => {
    const notice = 'Lượt dừng vì chạm giới hạn: Đã dùng hết 15 vòng của lượt.'
    const html = render({
      turns: [turn()],
      parts: [
        part(1, { kind: 'tool_call', toolCallId: 'c1' }),
        part(2, { id: 'p2', text: 'Đã dịch chương 1, còn chương 2.' }),
        part(3, { id: 'p3', round: 0, kind: 'progress', text: notice })
      ],
      toolCalls: { c1: call({ name: 'translate_chapter' }) }
    })
    expect(html).toContain(notice)
    expect(html.match(/>Tiếp tục</g)).toHaveLength(1)
  })

  it('draws the stored step list as a checklist card in place of its tool rows', () => {
    const todos = (status: string) => ({ todos: [{ content: 'Dịch chương 2', status }] })
    const html = render({
      turns: [turn()],
      parts: [
        part(1, { kind: 'tool_call', toolCallId: 'w1' }),
        part(2, { id: 'p2', round: 2, kind: 'tool_call', toolCallId: 'w2' }),
        part(3, { id: 'p3', round: 3, text: 'Xong.' })
      ],
      toolCalls: {
        w1: call({ id: 'w1', name: 'todo_list', args: todos('in_progress') }),
        w2: call({ id: 'w2', round: 2, name: 'todo_list', args: todos('completed') })
      }
    })
    expect(html.match(/aria-label="Danh sách bước"/g)).toHaveLength(1)
    expect(html).toContain('Đã xong: ')
    expect(html).not.toContain('Đang đọc danh sách tác phẩm')
  })

  it('draws a steer message after the calls of its round and before the next round', () => {
    const html = render({
      turns: [turn()],
      parts: [
        part(1, { kind: 'tool_call', toolCallId: 'c1' }),
        part(2, { id: 'p2', kind: 'steer', text: 'bỏ qua chương 4' }),
        part(3, { id: 'p3', round: 2, text: 'Đã bỏ chương 4.' })
      ],
      toolCalls: { c1: call() }
    })
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Gửi thêm khi đang chạy')).toBeGreaterThan(at('Đã đọc danh sách tác phẩm'))
    expect(at('bỏ qua chương 4')).toBeGreaterThan(at('Gửi thêm khi đang chạy'))
    expect(at('Đã bỏ chương 4.')).toBeGreaterThan(at('bỏ qua chương 4'))
  })

  it('hides Tiếp tục while the turn is still running', () => {
    const html = render({
      turns: [turn({ status: 'running', answer: '' })],
      parts: [],
      toolCalls: {},
      isStreaming: true,
      streamingTurnId: 't1',
      live: {}
    })
    expect(html).not.toContain('>Tiếp tục<')
  })
})
