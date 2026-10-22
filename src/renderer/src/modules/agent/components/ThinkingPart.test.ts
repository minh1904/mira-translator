import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { formatThinkingDuration, ThinkingPart, thinkingTitle } from './ThinkingPart'

const render = (props: Partial<Parameters<typeof ThinkingPart>[0]>) =>
  renderToStaticMarkup(
    createElement(ThinkingPart, {
      text: 'Suy nghĩ.',
      live: false,
      superseded: true,
      durationMs: null,
      ...props
    })
  )

describe('ThinkingPart', () => {
  it('draws nothing when the provider sent no reasoning', () => {
    expect(render({ text: '   ' })).toBe('')
  })

  it('titles a streaming block, using its bold heading when it opens with one', () => {
    expect(thinkingTitle('cân nhắc', true, null)).toBe('Đang suy nghĩ')
    expect(thinkingTitle('**Đối chiếu xưng hô**\nrồi…', true, null)).toBe(
      'Đang suy nghĩ: Đối chiếu xưng hô'
    )
  })

  it('titles a finished block with how long it thought', () => {
    expect(thinkingTitle('x', false, 5000)).toBe('Đã suy nghĩ trong 5 giây')
    expect(thinkingTitle('x', false, 1200)).toBe('Đã suy nghĩ trong 1,2 giây')
    expect(thinkingTitle('x', false, null)).toBe('Đã suy nghĩ')
    expect(formatThinkingDuration(0)).toBeNull()
  })

  it('stays open while it streams and folds once the next part starts', () => {
    const streaming = render({ live: true, superseded: false })
    expect(streaming).toContain('aria-expanded="true"')
    expect(streaming).toContain('max-h-[200px]')
    expect(render({ live: false, superseded: true })).toContain('aria-expanded="false"')
  })
})
