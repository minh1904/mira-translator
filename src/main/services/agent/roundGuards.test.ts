import { describe, expect, it } from 'vitest'
import { detectRepetition, isEmptyRound, shouldRetryEmpty, zeroOutput } from './roundGuards'

describe('isEmptyRound', () => {
  it('is empty with no text and no call, even when it only reasoned', () => {
    expect(isEmptyRound({ text: ' \n', calls: 0, finishReason: 'stop' })).toBe(true)
    expect(isEmptyRound({ text: '', calls: 0, finishReason: undefined })).toBe(true)
  })

  it('is not empty with text, with a call, or when a filter stopped it', () => {
    expect(isEmptyRound({ text: 'Xong.', calls: 0, finishReason: 'stop' })).toBe(false)
    expect(isEmptyRound({ text: '', calls: 1, finishReason: 'tool_calls' })).toBe(false)
    expect(isEmptyRound({ text: '', calls: 0, finishReason: 'filter' })).toBe(false)
  })
})

describe('shouldRetryEmpty', () => {
  it('retries twice per round and three times per turn', () => {
    expect(shouldRetryEmpty({ roundRetries: 0, turnRetries: 0, zeroOutputStreak: 0 })).toBe(true)
    expect(shouldRetryEmpty({ roundRetries: 1, turnRetries: 1, zeroOutputStreak: 0 })).toBe(true)
    expect(shouldRetryEmpty({ roundRetries: 2, turnRetries: 2, zeroOutputStreak: 0 })).toBe(false)
    expect(shouldRetryEmpty({ roundRetries: 0, turnRetries: 3, zeroOutputStreak: 0 })).toBe(false)
  })

  it('stops after two empties in a row that both reported zero output', () => {
    expect(shouldRetryEmpty({ roundRetries: 1, turnRetries: 1, zeroOutputStreak: 2 })).toBe(false)
    expect(shouldRetryEmpty({ roundRetries: 0, turnRetries: 0, zeroOutputStreak: 1 })).toBe(true)
  })

  it('counts zero output only when usage was reported', () => {
    expect(zeroOutput({ outputTokens: 0 })).toBe(true)
    expect(zeroOutput({ outputTokens: 3 })).toBe(false)
    expect(zeroOutput(undefined)).toBe(false)
  })
})

describe('detectRepetition', () => {
  const sentence = 'Lâm Phong nhìn lên bầu trời và thấy một vệt sáng xanh vụt qua. '
  const prose = (length: number) =>
    Array.from({ length }, (_, index) => `Câu số ${index} kể một chuyện khác hẳn. `).join('')

  it('finds a long sentence repeated back to back over most of the text', () => {
    expect(sentence.length).toBeGreaterThanOrEqual(60)
    const intro = prose(20)
    const text = intro + sentence.repeat(40)
    expect(text.length).toBeGreaterThan(2_000)
    const found = detectRepetition(text)
    expect(found).not.toBeNull()
    // The kept text ends after the first copy; the cut may slide by the characters the intro shares
    // with the end of the sentence (here ". ").
    expect(Math.abs(found!.keep - (intro + sentence).length)).toBeLessThanOrEqual(2)
    expect(text.slice(0, found!.keep).split('Lâm Phong')).toHaveLength(2)
  })

  it('ignores short text, short refrains, varied rows and a minority of repeats', () => {
    expect(detectRepetition(sentence.repeat(20))).toBeNull() // under 2,000 characters
    expect(detectRepetition('Đi! '.repeat(1_000))).toBeNull() // period under 60 characters
    const table = Array.from(
      { length: 80 },
      (_, row) => `| Chương ${row + 1} | Đã dịch | ${row * 37} đoạn | Không lỗi |\n`
    ).join('')
    expect(detectRepetition(table)).toBeNull()
    expect(detectRepetition(prose(150) + sentence.repeat(5))).toBeNull()
  })
})
