import { describe, expect, it } from 'vitest'
import { pickNextItem, type RunningSlot } from './taskScheduling'

interface QueuedCandidate extends RunningSlot {
  itemId: string
}

/** `count` queued items of one task, ordinals from 1. */
const items = (taskId: string, count: number, entryId = 'm'): QueuedCandidate[] =>
  Array.from({ length: count }, (_, i) => ({ itemId: `${taskId}${i + 1}`, taskId, entryId }))

/** Starts items one by one the way the scheduler does, until nothing fits. */
function fill(
  queued: QueuedCandidate[],
  ceiling: number,
  blocked: ReadonlySet<string> = new Set()
): string[] {
  const left = [...queued]
  const running: RunningSlot[] = []
  const started: string[] = []
  for (;;) {
    const next = pickNextItem(left, running, () => ceiling, blocked)
    if (!next) return started
    left.splice(left.indexOf(next), 1)
    running.push(next)
    started.push(next.itemId)
  }
}

describe('pickNextItem', () => {
  it('takes turns between two tasks on one entry, the older task first', () => {
    expect(fill([...items('a', 10), ...items('b', 10)], 4)).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('never starts more items of an entry than its ceiling', () => {
    expect(fill(items('a', 5), 2)).toEqual(['a1', 'a2'])
  })

  it('keeps chapter order inside a task', () => {
    const queued = items('a', 3)
    expect(pickNextItem(queued, [{ taskId: 'a', entryId: 'm' }], () => 4)?.itemId).toBe('a1')
  })

  it('counts each entry on its own', () => {
    const queued = [...items('a', 3, 'x'), ...items('b', 3, 'y')]
    expect(fill(queued, 1)).toEqual(['a1', 'b1'])
  })

  it('skips a task that is extracting terms', () => {
    expect(fill([...items('a', 2), ...items('b', 2)], 4, new Set(['a']))).toEqual(['b1', 'b2'])
  })

  it('gives a newer task its first item before the older task gets a third', () => {
    const running: RunningSlot[] = [
      { taskId: 'a', entryId: 'm' },
      { taskId: 'a', entryId: 'm' }
    ]
    const next = pickNextItem([...items('a', 3).slice(2), ...items('b', 1)], running, () => 4)
    expect(next?.itemId).toBe('b1')
  })
})
