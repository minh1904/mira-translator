import { describe, expect, it } from 'vitest'
import { AGENT_TODO_LIMIT } from '../../../../shared/contracts/agentTodo'
import type { LibraryStore } from '../../library/library'
import { CapabilityRegistry } from '../registry'
import { todoListCapability } from './readCapabilities'

const registry = new CapabilityRegistry()
registry.register(todoListCapability)
const run = (args: unknown) =>
  registry.execute('todo_list', args, {
    turnId: 't',
    commandId: 'c',
    library: {} as LibraryStore,
    now: 0
  })
const step = (content: string, status = 'pending') => ({ content, status })

describe('todo_list capability', () => {
  it('returns the list it writes, in order', async () => {
    const todos = [step('Đọc glossary', 'in_progress'), step('Dịch chương 1'), step('Rà xưng hô')]
    expect(await run({ todos })).toEqual({ ok: true, value: { todos } })
  })

  it('leaves a read for the runtime to fill in, and accepts an empty list', async () => {
    expect(await run({})).toEqual({ ok: true, value: { todos: null } })
    expect(await run({ todos: [] })).toEqual({ ok: true, value: { todos: [] } })
  })

  it('refuses too many steps, an empty or long step and an unknown status', async () => {
    const tooMany = Array.from({ length: AGENT_TODO_LIMIT + 1 }, (_, i) => step('Bước ' + i))
    for (const todos of [tooMany, [step('   ')], [step('x'.repeat(201))], [step('Dịch', 'done')]]) {
      expect(await run({ todos })).toMatchObject({ ok: false, error: { code: 'validation' } })
    }
  })

  it('runs without a target and is a read, so policy lets it run and Ask mode has it', () => {
    expect(todoListCapability.kind).toBe('read')
    expect(todoListCapability.targetPolicy).toBe('no_target')
  })
})
