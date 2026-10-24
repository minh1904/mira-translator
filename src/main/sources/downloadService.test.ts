import { describe, expect, it } from 'vitest'
import { NetworkBrokerError } from './broker'
import { SourceDownloadService, type DownloadSteps } from './downloadService'
import { SourceAccessError } from './http'

interface Item {
  id: string
  title: string
}

const items = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, title: `Chương ${i + 1}` }))

function steps(
  fetch: (item: Item, signal: AbortSignal) => Promise<string> = async (item) => `text ${item.id}`
): DownloadSteps<Item> & { saved: string[] } {
  const saved: string[] = []
  return {
    saved,
    isDone: (item) => saved.includes(item.id),
    fetchText: fetch,
    save: (item) => saved.push(item.id)
  }
}

const noWait = async (): Promise<void> => {}

describe('SourceDownloadService', () => {
  it('downloads every item and reports a completed summary', async () => {
    const s = steps()
    const summary = await new SourceDownloadService(noWait).runTask('w:b', 'w:', items(3), s)
    expect(s.saved).toEqual(['i1', 'i2', 'i3'])
    expect(summary).toEqual({
      state: 'completed',
      downloaded: 3,
      skipped: 0,
      empty: [],
      failed: [],
      stopReason: null
    })
  })

  it('rejects a single download of an item a range task is fetching', async () => {
    const service = new SourceDownloadService(noWait)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const task = service.runTask(
      'w:b',
      'w:',
      items(1),
      steps(async () => {
        await gate
        return 'x'
      })
    )
    await Promise.resolve()
    await expect(service.runSingle('w:i1', async () => 'dup')).rejects.toMatchObject({
      code: 'conflict'
    })
    release()
    expect((await task).downloaded).toBe(1)
  })

  it('skips an item a single download holds', async () => {
    const service = new SourceDownloadService(noWait)
    let release!: () => void
    const single = service.runSingle(
      'w:i2',
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const summary = await service.runTask('w:b', 'w:', items(3), steps())
    release()
    await single
    expect(summary.downloaded).toBe(2)
    expect(summary.skipped).toBe(1)
  })

  it('rejects a second task on the same binding', async () => {
    const service = new SourceDownloadService(noWait)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = service.runTask(
      'w:b',
      'w:',
      items(1),
      steps(async () => {
        await gate
        return 'x'
      })
    )
    await expect(service.runTask('w:b', 'w:', items(2), steps())).rejects.toMatchObject({
      code: 'conflict'
    })
    release()
    await first
  })

  it('keeps finished chapters when cancelled mid-task', async () => {
    const service = new SourceDownloadService(noWait)
    const s = steps(async (item, signal) => {
      if (item.id === 'i4') {
        service.cancel('w:b')
        if (signal.aborted) throw new Error('aborted')
      }
      return 'x'
    })
    const summary = await service.runTask('w:b', 'w:', items(6), s)
    expect(s.saved).toEqual(['i1', 'i2', 'i3'])
    expect(summary.state).toBe('cancelled')
    expect(service.cancel('w:b')).toBe(false)
  })

  it('records parser errors and empty chapters, then continues', async () => {
    const s = steps(async (item) => {
      if (item.id === 'i2') throw new Error('parser_broken')
      return item.id === 'i3' ? '  ' : 'x'
    })
    const summary = await new SourceDownloadService(noWait).runTask('w:b', 'w:', items(4), s)
    expect(s.saved).toEqual(['i1', 'i4'])
    expect(summary.failed).toEqual([{ title: 'Chương 2', message: 'parser_broken' }])
    expect(summary.empty).toEqual(['Chương 3'])
  })

  it('stops the task when the source stays unavailable or needs age confirmation', async () => {
    for (const error of [
      new SourceAccessError('temporarily_unavailable', 'HTTP 503'),
      new NetworkBrokerError('age_verification_required', 'age')
    ]) {
      let calls = 0
      const summary = await new SourceDownloadService(noWait).runTask(
        'w:b',
        'w:',
        items(5),
        steps(async (item) => {
          calls++
          if (item.id === 'i2') throw error
          return 'x'
        })
      )
      expect(summary.state).toBe('stopped')
      expect(summary.stopReason).toBe(error.message)
      expect(calls).toBe(2)
    }
  })

  it('pauses after every burst of fetched chapters', async () => {
    const waits: number[] = []
    const service = new SourceDownloadService(async (ms) => {
      waits.push(ms)
    })
    await service.runTask('w:b', 'w:', items(25), steps(), { every: 10, ms: 5000 })
    expect(waits).toEqual([5000, 5000])
  })
})
