import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AgentTodoItem } from '../../../../../shared/contracts/agentTodo'
import { TodoCard } from './TodoCard'

const render = (items: AgentTodoItem[]) => renderToStaticMarkup(createElement(TodoCard, { items }))

describe('TodoCard', () => {
  const items: AgentTodoItem[] = [
    { content: 'Đọc glossary', status: 'completed' },
    { content: 'Dịch chương 2', status: 'in_progress' },
    { content: 'Rà xưng hô', status: 'pending' },
    { content: 'Sửa tên', status: 'cancelled' }
  ]

  it('names every status in words and counts finished steps', () => {
    const html = render(items)
    for (const label of ['Đã xong: ', 'Đang làm: ', 'Chưa làm: ', 'Đã bỏ: ']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('1/4')
    expect(html).toContain('aria-label="Danh sách bước"')
  })

  it('tells finished and dropped steps apart by more than colour', () => {
    const html = render(items)
    expect(html).toMatch(/line-through[^>]*>Sửa tên/)
    expect(html).toMatch(/font-medium[^>]*>Dịch chương 2/)
  })

  it('has no control and uses only theme tokens, so both themes follow', () => {
    const html = render(items)
    expect(html).not.toMatch(/<button|<input|tabindex/)
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|\[(?:#|rgb)/i)
  })

  it('says the list was cleared when it is empty', () => {
    expect(render([])).toContain('Danh sách đã được xóa.')
  })
})
