import { describe, expect, it } from 'vitest'
import type { AgentOperation } from '../../../../../shared/contracts/agent'
import { operationMessage } from './OperationLog'

const operation = (patch: Partial<AgentOperation>): AgentOperation => ({
  id: 'op',
  turnId: null,
  taskItemId: 'item',
  commandId: 'cmd',
  capability: 'translate_chapter',
  target: { kind: 'work', workId: 'w', workLabel: 'Hehe' },
  state: 'completed',
  progress: null,
  model: null,
  usage: null,
  result: null,
  error: null,
  createdAt: 1,
  updatedAt: 2,
  ...patch
})

describe('operationMessage', () => {
  it('prefers the error, then the runner summary, and ignores anything else', () => {
    expect(
      operationMessage(
        operation({ error: { code: 'io', message: 'Hết giờ' }, result: { summary: 'Xong' } })
      )
    ).toBe('Hết giờ')
    expect(
      operationMessage(operation({ state: 'conflict', result: { summary: 'Xung đột' } }))
    ).toBe('Xung đột')
    expect(operationMessage(operation({ result: { calls: 3 } }))).toBeNull()
    expect(operationMessage(operation({ result: { summary: '  ' }, error: 'lạ' }))).toBeNull()
  })
})
