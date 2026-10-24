import { describe, expect, it } from 'vitest'
import type { AgentTaskRunView } from '../../../../../shared/contracts/agentTask'
import { newRuns, runLevel, runsOfLevel } from './RunLog'

const run = (patch: Partial<AgentTaskRunView>): AgentTaskRunView => ({
  operationId: 'o',
  startedAt: 1,
  endedAt: 2,
  state: 'completed',
  usage: null,
  error: null,
  summary: null,
  batchesDone: 1,
  ...patch
})

const limited = run({
  operationId: 'limited',
  state: 'failed',
  error: {
    code: 'rate_limited',
    scope: 'chapter',
    what: 'x',
    retryable: true,
    options: ['retry_now']
  }
})
const blocked = run({
  operationId: 'blocked',
  state: 'failed',
  error: { code: 'auth', scope: 'task', what: 'x', retryable: false, options: [] }
})
const old = run({ operationId: 'old', state: 'failed', error: { code: 'provider', message: 'm' } })

describe('runLevel', () => {
  it('warns for what the app can wait out and errors for what needs the person', () => {
    expect(runLevel(limited)).toBe('warning')
    expect(runLevel(blocked)).toBe('error')
    expect(runLevel(old)).toBe('error')
    expect(runLevel(run({ state: 'partially_completed' }))).toBe('warning')
    expect(runLevel(run({}))).toBe('ok')
  })

  it('filters by level without touching the successes it does not ask for', () => {
    const runs = [run({ operationId: 'fine' }), limited, blocked]
    expect(runsOfLevel(runs, 'all')).toHaveLength(3)
    expect(runsOfLevel(runs, 'warning').map((each) => each.operationId)).toEqual(['limited'])
    expect(runsOfLevel(runs, 'error').map((each) => each.operationId)).toEqual(['blocked'])
  })
})

describe('newRuns', () => {
  it('counts runs that arrived, never the reshuffle of a changed filter', () => {
    expect(newRuns(3, 5, false)).toBe(2)
    expect(newRuns(5, 5, false)).toBe(0)
    expect(newRuns(1, 9, true)).toBe(0)
    expect(newRuns(9, 1, false)).toBe(0)
  })
})
