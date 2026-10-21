import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'
import { Button } from './Button'
import { CompactButton } from './CompactButton'
import { TextField } from './Field'
import { Tip, type TipProps } from './Tooltip'
import { buttonVariants } from './variants'

describe('Button', () => {
  it('sizes on the control scale: lg 32 · md 28 · sm 24', () => {
    expect(buttonVariants({ size: 'lg' })).toContain('h-8')
    expect(buttonVariants({ size: 'md' })).toContain('h-7')
    expect(buttonVariants({ size: 'sm' })).toContain('h-6')
  })

  it('keeps its size while loading and shows a spinner in place of the left icon', () => {
    const busy = renderToStaticMarkup(createElement(Button, { loading: true }, 'Kết nối'))
    expect(busy).toContain('h-7')
    expect(busy).toContain('aria-busy="true"')
    expect(busy).toContain('animate-spin')
    expect(busy).toContain('Kết nối')
  })

  it('reads its colours from the component tier', () => {
    expect(buttonVariants({ variant: 'solid' })).toContain('bg-(--mira-button-neutral-solid-bg)')
    expect(buttonVariants({ color: 'danger', variant: 'solid' })).toContain(
      'bg-(--mira-button-danger-solid-bg)'
    )
  })

  it('is square when it only has an icon', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { icon: createElement('svg'), 'aria-label': 'Thêm' })
    )
    expect(html).toContain('w-7')
  })
})

describe('CompactButton', () => {
  it('renders its icon and its label for assistive technology', () => {
    const html = renderToStaticMarkup(
      createElement(CompactButton, { 'aria-label': 'Đóng', icon: createElement('svg') })
    )
    expect(html).toContain('aria-label="Đóng"')
    expect(html).toContain('size-6')
  })
})

describe('TextField', () => {
  it('ties the label, marks an error invalid and announces it', () => {
    const html = renderToStaticMarkup(
      createElement(TextField, { label: 'Khóa API', error: 'Thiếu khóa', id: 'key' })
    )
    expect(html).toContain('for="key"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
  })
})

describe('Badge', () => {
  it('says its state in text and colour, with a dot when asked', () => {
    const html = renderToStaticMarkup(
      createElement(
        Badge,
        { color: 'success', dot: true } as Parameters<typeof Badge>[0],
        'Đã dịch'
      )
    )
    expect(html).toContain('bg-success-subtle')
    expect(html).toContain('Đã dịch')
    expect(html).toContain('rounded-full')
  })
})

describe('Tip', () => {
  it('renders the control it describes, unchanged', () => {
    const html = renderToStaticMarkup(
      createElement(
        Tip,
        { label: 'Đổi giao diện' } as TipProps,
        createElement('button', { type: 'button' }, 'A')
      )
    )
    expect(html).toMatch(/^<button[^>]*>A<\/button>$/)
  })
})

// Mọi thành phần tương tác đều phải có viền focus khi điều hướng bằng bàn phím.
describe('focus', () => {
  const dir = __dirname
  const interactive = readdirSync(dir).filter(
    (name) =>
      name.endsWith('.tsx') &&
      // Tooltip chỉ mô tả trigger của nó, vốn đã có viền focus riêng.
      name !== 'Tooltip.tsx' &&
      /<(Base[A-Z]\w*|Toggle|BaseSelect\.Trigger|textarea|button)\b/.test(
        readFileSync(resolve(dir, name), 'utf8')
      )
  )

  it.each(interactive)('%s has a visible focus mark', (name) => {
    const text = readFileSync(resolve(dir, name), 'utf8')
    // Thành phần được định kiểu qua bảng biến thể nhận viền focus từ bảng đó; thành phần bọc
    // component khác trong thư mục sẽ kế thừa viền focus.
    const tables = readFileSync(resolve(dir, 'variants.ts'), 'utf8')
      .split(/\nexport const /)
      .filter((block) => /focus(Within)?Ring/.test(block))
      .map((block) => block.split(' ')[0])
    const styledByTable = tables.some((table) => text.includes(table + '('))
    const wrapsOthers = /from '\.\/(Button|CompactButton)'/.test(text)
    expect(
      styledByTable ||
        wrapsOthers ||
        /focus(Within|Input)?Ring|inputFocusRing|data-highlighted/.test(text)
    ).toBe(true)
  })
})

describe('Drawer', () => {
  it('renders nothing while closed, so a closed drawer holds no focusable content', async () => {
    const { Drawer } = await import('./Drawer')
    const props = { open: false, onOpenChange: () => {}, label: 'Trợ lý' }
    const html = renderToStaticMarkup(
      createElement(Drawer, props as unknown as Parameters<typeof Drawer>[0], 'nội dung')
    )
    expect(html).not.toContain('nội dung')
  })
})
