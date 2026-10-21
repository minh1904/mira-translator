import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ThinkingPreview, formatThinkingDuration } from './ThinkingPreview'

describe('ThinkingPreview (Task 6.4)', () => {
  it('returns null and does not render fake thinking when reasoning is empty or whitespace', () => {
    expect(renderToStaticMarkup(createElement(ThinkingPreview, { reasoning: '' }))).toBe('')
    expect(renderToStaticMarkup(createElement(ThinkingPreview, { reasoning: '   ' }))).toBe('')
    expect(renderToStaticMarkup(createElement(ThinkingPreview, { reasoning: null }))).toBe('')
    expect(renderToStaticMarkup(createElement(ThinkingPreview, { reasoning: undefined }))).toBe('')
  })

  it('renders collapsed thinking header when answer started and user has not expanded', () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingPreview, {
        reasoning:
          'Bước 1: Phân tích ngữ cảnh.\nBước 2: Tìm đối chiếu xưng hô.\nBước 3: Dịch câu đầu.',
        isThinking: false,
        isAnswerStarted: true
      })
    )

    expect(html).toContain('Thinking')
    expect(html).toContain('aria-expanded="false"')
  })

  it('formats duration correctly and hides duration label when durationMs is missing or <= 0', () => {
    expect(formatThinkingDuration(2400)).toBe('2.4s')
    expect(formatThinkingDuration(undefined)).toBeNull()
    expect(formatThinkingDuration(0)).toBeNull()

    const withDuration = renderToStaticMarkup(
      createElement(ThinkingPreview, {
        reasoning: 'Analyzing context...',
        durationMs: 3500
      })
    )
    expect(withDuration).toContain('Thinking - 3.5s')

    const withoutDuration = renderToStaticMarkup(
      createElement(ThinkingPreview, {
        reasoning: 'Analyzing context...'
      })
    )
    expect(withoutDuration).toContain('Thinking')
    expect(withoutDuration).not.toContain('Thinking -')
  })
})
