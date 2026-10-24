import { describe, expect, it } from 'vitest'
import { callTools, say, setupAgent } from './agentTestKit'

type Kit = ReturnType<typeof setupAgent>
const step = (content: string, status = 'pending') => ({ content, status })
const write = (...todos: Array<ReturnType<typeof step>>) =>
  callTools({ name: 'todo_list', args: { todos } })
const read = () => callTools({ name: 'todo_list', args: {} })

const send = (kit: Kit, instruction: string, sessionId?: string) =>
  kit.agent.send({ instruction, sessionId, modelSelection: kit.modelSelection })
/** What the last `todo_list` call of a turn returned. */
const lastList = (kit: Kit, turnId: string) =>
  (
    kit.agent
      .listToolCalls(turnId)
      .filter((call) => call.name === 'todo_list')
      .at(-1)?.result as { value?: { todos: unknown } }
  )?.value?.todos

describe('AgentService todo list', () => {
  it('lets a later turn read the list an earlier turn wrote', async () => {
    const kit = setupAgent()
    const list = [step('Đọc glossary', 'completed'), step('Dịch chương 2', 'in_progress')]
    kit.model.script(write(...list), say('Đã lập kế hoạch.'))
    const first = await send(kit, 'dịch chương 1 và 2')
    kit.model.script(read(), say('Làm tiếp bước 2.'))
    const second = await send(kit, 'làm tiếp', first.sessionId)
    expect(lastList(kit, second.turnId)).toEqual(list)
  })

  it('goes back to the previous write when the turn that last wrote is reverted', async () => {
    const kit = setupAgent()
    kit.model.script(write(step('A')), say('1'))
    const first = await send(kit, 'một')
    kit.model.script(write(step('B')), say('2'))
    await send(kit, 'hai', first.sessionId)
    kit.model.script(write(step('C')), say('3'))
    const third = await send(kit, 'ba', first.sessionId)
    kit.agent.revertToTurn(third.turnId)
    kit.model.script(read(), say('4'))
    const fourth = await send(kit, 'bốn', first.sessionId)
    expect(lastList(kit, fourth.turnId)).toEqual([step('B')])
  })

  it('keeps the list when a write fails validation', async () => {
    const kit = setupAgent()
    const tooMany = Array.from({ length: 21 }, (_, i) => step('Bước ' + i))
    kit.model.script(write(step('Giữ nguyên')), write(...tooMany), read(), say('Xong.'))
    const res = await send(kit, 'lập kế hoạch')
    const calls = kit.agent.listToolCalls(res.turnId)
    expect(calls.map((call) => call.state)).toEqual(['completed', 'failed', 'completed'])
    expect(lastList(kit, res.turnId)).toEqual([step('Giữ nguyên')])
  })

  it('is offered in Ask mode and runs without asking', async () => {
    const kit = setupAgent()
    kit.model.script(write(step('Đọc')), say('Đã ghi.'))
    const res = await kit.agent.send({
      instruction: 'hỏi',
      mode: 'ask',
      modelSelection: kit.modelSelection
    })
    const names = (kit.model.requests[0].tools ?? []).map(
      (tool) => (tool as { function: { name: string } }).function.name
    )
    expect(names).toContain('todo_list')
    expect(kit.agent.listToolCalls(res.turnId)[0]).toMatchObject({ state: 'completed' })
  })

  it('is not offered to a subagent, and a subagent call to it changes nothing', async () => {
    const kit = setupAgent()
    kit.model.script(
      write(step('Của phiên')),
      callTools({ name: 'run_subagent', args: { task: 'Tra cứu', description: 'Tra cứu' } }),
      write(step('Của subagent')),
      say('Subagent xong.'),
      read(),
      say('Xong.')
    )
    const res = await send(kit, 'tra cứu')
    const subagentRequest = kit.model.requests[2]
    const names = (subagentRequest.tools ?? []).map(
      (tool) => (tool as { function: { name: string } }).function.name
    )
    expect(names).not.toContain('todo_list')
    const child = kit.agent
      .getSessionDetail(res.sessionId)
      .toolCalls.find((call) => call.parentToolCallId !== null)
    expect(child).toMatchObject({ name: 'todo_list', state: 'failed' })
    expect(lastList(kit, res.turnId)).toEqual([step('Của phiên')])
  })
})
