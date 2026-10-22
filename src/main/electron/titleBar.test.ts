import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BOOT_BACKGROUND,
  CHROME_COLORS,
  HEADER_HEIGHT,
  TOP_BAR_HEIGHT,
  TRANSPARENT_OVERLAY
} from './titleBar'
import { isZoomShortcut, ZOOM_FACTOR } from './zoom'

const TOKENS = resolve(__dirname, '../../renderer/src/styles/tokens')
const FOUNDATION = readFileSync(resolve(TOKENS, 'foundation.css'), 'utf8')
const SEMANTIC = readFileSync(resolve(TOKENS, 'semantic.css'), 'utf8')

/** Giá trị của một foundation token (mã màu hex hoặc độ dài px). */
function foundation(property: string): string {
  const match = new RegExp(property + ': *(#[0-9a-fA-F]{3,8}|[0-9.]+px) *;').exec(FOUNDATION)
  expect(match, property + ' in foundation.css').not.toBeNull()
  return (match as RegExpExecArray)[1].toLowerCase()
}

/** Một semantic token của theme, được giải quyết thông qua foundation token mà nó trỏ tới. */
function semantic(theme: 'light' | 'dark', property: string): string {
  const selector = theme === 'dark' ? "html[data-theme='dark']" : "html[data-theme='light']"
  const start = SEMANTIC.indexOf(selector)
  expect(start, selector + ' is in semantic.css').toBeGreaterThanOrEqual(0)
  const block = SEMANTIC.slice(start, SEMANTIC.indexOf('\n}', start))
  const match = new RegExp(property + ': *var\\((--mira-[\\w-]+)\\) *;').exec(block)
  expect(match, property + ' in ' + selector).not.toBeNull()
  return foundation((match as RegExpExecArray)[1])
}

describe('window button colours', () => {
  // Hệ điều hành vẽ các biểu tượng này nên không thể đọc biến CSS; nếu token thay đổi mà bản sao này
  // không đổi, các nút sẽ lệch màu so với các icon xung quanh.
  it('dark glyphs match the dark subtle text', () => {
    expect(CHROME_COLORS.dark.symbolColor).toBe(semantic('dark', '--mira-text-subtle'))
  })

  it('light glyphs match the light subtle text', () => {
    expect(CHROME_COLORS.light.symbolColor).toBe(semantic('light', '--mira-text-subtle'))
  })

  it('lets the bar and any backdrop show through behind the buttons', () => {
    expect(CHROME_COLORS.dark.color).toBe(TRANSPARENT_OVERLAY)
    expect(CHROME_COLORS.light.color).toBe(TRANSPARENT_OVERLAY)
  })

  it('starts the window in the colour of its surface', () => {
    expect(BOOT_BACKGROUND.dark).toBe(semantic('dark', '--mira-bg-surface'))
    expect(BOOT_BACKGROUND.light).toBe(semantic('light', '--mira-bg-surface'))
  })
})

describe('title bar height', () => {
  it('matches --mira-header-height in foundation.css', () => {
    expect(foundation('--mira-header-height')).toBe(HEADER_HEIGHT + 'px')
  })

  it('is the bar at the page zoom less its bottom border row', () => {
    expect(ZOOM_FACTOR).toBe(1)
    expect(TOP_BAR_HEIGHT).toBe(34)
  })
})

describe('zoom keys', () => {
  type Key = Parameters<typeof isZoomShortcut>[0]
  const key = (
    k: string,
    mods: { control?: boolean; meta?: boolean } = { control: true }
  ): Key => ({
    type: 'keyDown',
    key: k,
    control: mods.control ?? false,
    meta: mods.meta ?? false
  })

  it('blocks the browser zoom shortcuts', () => {
    for (const k of ['=', '+', '-', '0']) expect(isZoomShortcut(key(k))).toBe(true)
    expect(isZoomShortcut(key('=', { meta: true }))).toBe(true)
  })

  it('lets other keys and plain digits through', () => {
    expect(isZoomShortcut(key('s'))).toBe(false)
    expect(isZoomShortcut(key('0', {}))).toBe(false)
    expect(isZoomShortcut({ ...key('-'), type: 'keyUp' })).toBe(false)
  })
})
