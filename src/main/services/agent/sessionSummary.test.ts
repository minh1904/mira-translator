import { describe, expect, it } from 'vitest'
import type { PastTurn } from './sessionHistory'
import { summaryRequest } from './sessionSummary'

const turn = (id: string, answer: string): PastTurn => ({
  turnId: id,
  instruction: 'hỏi ' + id,
  contextLine: 'Ngữ cảnh của lượt cũ: chương 5.',
  rounds: [],
  answer
})

describe('summaryRequest', () => {
  it('merges the previous summary with the new turns under a fixed frame', () => {
    const [system, user] = summaryRequest({
      previous: 'BẢN CŨ',
      turns: [turn('1', 'đáp 1'), turn('2', 'đáp 2')],
      maxChars: 10_000,
      summaryChars: 4_000
    })
    expect(system?.content).toContain('## Mục tiêu của người dùng')
    expect(system?.content).toContain('MỘT bản duy nhất')
    expect(user?.content).toContain('BẢN CŨ')
    expect(user?.content).toContain('Người dùng: hỏi 2')
    expect(user?.content).toContain('Trợ lý: đáp 2')
    expect(user?.content).toContain('dưới 4000 ký tự')
  })

  it('keeps the tool rounds of a turn already resent as text', () => {
    const [, user] = summaryRequest({
      previous: null,
      turns: [
        { ...turn('1', 'đáp 1'), rounds: [{ role: 'assistant', content: 'Đã gọi `read_chapter`' }] }
      ],
      maxChars: 10_000,
      summaryChars: 4_000
    })
    expect(user?.content).toContain('Đã gọi `read_chapter`')
  })

  it('shortens an oversized turn from the middle and keeps its question and answer', () => {
    const [, user] = summaryRequest({
      previous: null,
      turns: [turn('1', 'x'.repeat(5_000) + 'KẾT')],
      maxChars: 1_000,
      summaryChars: 500
    })
    expect(user?.content).toContain('Người dùng: hỏi 1')
    expect(user?.content).toContain('KẾT')
    expect(user?.content).toContain('lược')
    expect(user?.content.length).toBeLessThan(2_000)
  })
})
