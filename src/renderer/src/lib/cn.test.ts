import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cn } from './cn'

const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8')
const tokens = (namespace: string): string[] =>
  [...theme.matchAll(new RegExp(`--${namespace}-([a-z0-9-]+?):`, 'g'))]
    .map((match) => match[1])
    .filter((name) => !name.includes('--'))

describe('cn với token của theme.css', () => {
  it('mọi cỡ chữ token cùng tồn tại với màu chữ và thay cho nhau', () => {
    const sizes = tokens('text').filter((name) => !name.startsWith('color-'))
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) {
      expect(cn(`text-${size} text-muted`)).toBe(`text-${size} text-muted`)
      expect(cn('text-body-sm', `text-${size}`)).toBe(`text-${size}`)
    }
  })

  it('mọi khoảng cách token thay được thang số', () => {
    for (const space of tokens('spacing')) expect(cn('px-2.5', `px-${space}`)).toBe(`px-${space}`)
  })

  it('mọi leading, tracking và ease token được nhận ra', () => {
    for (const name of tokens('leading'))
      expect(cn('leading-none', `leading-${name}`)).toBe(`leading-${name}`)
    for (const name of tokens('tracking'))
      expect(cn('tracking-wide', `tracking-${name}`)).toBe(`tracking-${name}`)
    for (const name of tokens('ease')) expect(cn('ease-in', `ease-${name}`)).toBe(`ease-${name}`)
  })
})

describe('cn', () => {
  it('bỏ giá trị falsy', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('lớp truyền sau ghi đè lớp gốc cùng thuộc tính', () => {
    expect(cn('w-full px-2.5 resize-y border', 'w-24 px-1.5 resize-none border-0')).toBe(
      'w-24 px-1.5 resize-none border-0'
    )
    expect(cn('inline-flex rounded-xs', 'flex rounded-full')).toBe('flex rounded-full')
  })

  it('giữ cỡ chữ token cạnh màu chữ token', () => {
    expect(cn('text-body-sm text-muted')).toBe('text-body-sm text-muted')
    expect(cn('text-label-xs', 'text-subtle')).toBe('text-label-xs text-subtle')
    expect(cn('text-body-sm text-muted', 'text-label-xs')).toBe('text-muted text-label-xs')
    expect(cn('text-muted', 'text-default')).toBe('text-default')
  })

  it('nhận khoảng cách định danh là cùng nhóm với thang số', () => {
    expect(cn('px-2.5 gap-2xs', 'px-xs gap-1.5')).toBe('px-xs gap-1.5')
    expect(cn('p-md', 'px-sm')).toBe('p-md px-sm')
  })

  it('giữ nền, viền và outline token theo đúng nhóm', () => {
    expect(cn('bg-surface border border-default', 'bg-error/10')).toBe(
      'border border-default bg-error/10'
    )
    expect(cn('border-0 border-default')).toBe('border-0 border-default')
    expect(
      cn(
        'outline-none focus:outline-1 focus:outline-solid focus:outline-focus',
        'focus:outline-none'
      )
    ).toBe('outline-none focus:outline-1 focus:outline-focus focus:outline-none')
  })

  it('nhận leading, tracking và ease của theme', () => {
    expect(cn('leading-normal', 'leading-text')).toBe('leading-text')
    expect(cn('tracking-heading', 'tracking-normal')).toBe('tracking-normal')
    expect(cn('ease-standard', 'ease-enter')).toBe('ease-enter')
  })

  it('giữ lớp không thuộc Tailwind', () => {
    expect(cn('touch-target group/row', 'px-1')).toBe('touch-target group/row px-1')
  })
})
