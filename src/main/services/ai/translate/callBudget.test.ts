import { describe, expect, it } from 'vitest'
import { CallBudget, defaultExtra } from './callBudget'

describe('CallBudget', () => {
  it('keeps a main call for every planned batch even after the extra fund is gone', () => {
    const budget = new CallBudget(3, 2)
    expect(budget.take('split')).toBe(true)
    expect(budget.take('split')).toBe(true)
    expect(budget.take('repair')).toBe(false)
    expect([budget.take('main'), budget.take('main'), budget.take('main')]).toEqual([
      true,
      true,
      true
    ])
    // A fourth batch has no reserved call and the fund is empty.
    expect(budget.take('main')).toBe(false)
    expect(budget.snapshot()).toMatchObject({
      used: 5,
      limit: 5,
      byRound: { main: 3, split: 2, bare: 0, repair: 0, fallback: 0, polish: 0 }
    })
  })

  it('never goes past the limit when batches take in turn', async () => {
    const budget = new CallBudget(2, 3)
    const taken: boolean[] = []
    // Two batches that interleave across awaits, each asking for many extra calls.
    await Promise.all(
      [0, 1].map(async () => {
        for (let i = 0; i < 5; i++) {
          taken.push(budget.take('split'))
          await Promise.resolve()
        }
      })
    )
    expect(taken.filter(Boolean)).toHaveLength(3)
    expect(budget.snapshot().used).toBe(3)
  })

  it('warns from 80% of the limit', () => {
    const budget = new CallBudget(1, 4)
    for (let i = 0; i < 3; i++) budget.take('split')
    expect(budget.snapshot().warn).toBe(false)
    budget.take('split')
    expect(budget.snapshot().warn).toBe(true)
  })

  it('counts HTTP attempts apart from calls, and grants more for a retry', () => {
    const budget = new CallBudget(1, 0)
    budget.take('main')
    budget.addAttempts(3)
    budget.grant(1, 2)
    expect(budget.snapshot()).toMatchObject({ used: 1, limit: 4, httpAttempts: 3 })
    expect(budget.take('repair')).toBe(true)
  })

  it('sizes the default extra fund by batch count, at least 8', () => {
    expect(defaultExtra(1)).toBe(8)
    expect(defaultExtra(3)).toBe(8)
    expect(defaultExtra(10)).toBe(20)
  })
})
