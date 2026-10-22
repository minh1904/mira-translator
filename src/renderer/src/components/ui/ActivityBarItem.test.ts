import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActivityBarItem } from './ActivityBarItem'

const render = (props: { active?: boolean; badge?: number }): string =>
  renderToStaticMarkup(
    createElement(ActivityBarItem, { 'aria-label': 'Tìm', icon: createElement('svg'), ...props })
  )

describe('ActivityBarItem', () => {
  it('is a named 40px button that reports whether its panel is open', () => {
    const idle = render({})
    expect(idle).toContain('aria-label="Tìm"')
    expect(idle).toContain('aria-pressed="false"')
    expect(idle).toContain('size-10')
    expect(render({ active: true })).toContain('aria-pressed="true"')
  })

  it('shows a count only when there is one, capped at 99+', () => {
    expect(render({ badge: 0 })).not.toContain('tabular-nums')
    expect(render({ badge: 7 })).toContain('>7</span>')
    expect(render({ badge: 140 })).toContain('>99+</span>')
  })
})
