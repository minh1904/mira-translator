import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell, type AppShellProps } from './AppShell'

function renderShell(
  nav: ReactNode | null = createElement('aside', { 'data-testid': 'nav' }, 'Navigation')
): string {
  const props: AppShellProps = {
    nav,
    sidebar: null,
    sidebarOpen: false,
    onToggleSidebar: () => undefined,
    theme: 'light',
    onToggleTheme: () => undefined,
    onOpenSettings: () => undefined,
    children: createElement('p', null, 'Content')
  }
  return renderToStaticMarkup(createElement(AppShell, props))
}

describe('AppShell', () => {
  it('keeps the unified title bar above the workspace and navigation', () => {
    const html = renderShell()
    const titleBar = html.indexOf('data-slot="app-titlebar"')
    const workspace = html.indexOf('data-slot="app-workspace"')
    const nav = html.indexOf('data-testid="nav"')

    expect(titleBar).toBeGreaterThanOrEqual(0)
    expect(workspace).toBeGreaterThan(titleBar)
    expect(nav).toBeGreaterThan(workspace)
  })

  it.each([
    ['app navigation', renderShell()],
    ['chapter controls', renderShell(null)]
  ])('keeps one unified header and right-edge spacing with %s', (_name, html) => {
    const titleBar = /<header[^>]*data-slot="app-titlebar"[^>]*>/.exec(html)?.[0]

    expect(html.match(/<header\b/g)).toHaveLength(1)
    expect(titleBar).toContain('pr-sm')
  })
})
