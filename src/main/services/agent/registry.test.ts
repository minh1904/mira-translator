import { afterEach, describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { LibraryStore } from '../library/library'
import { defaultReadCapabilities, readChapterCapability } from './capabilities/readCapabilities'
import { CapabilityRegistry, TurnBudgetTracker } from './registry'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []

afterEach(() => {
  for (const s of stores.splice(0)) {
    try {
      s.close()
    } catch {
      // ignore
    }
  }
})

describe('CapabilityRegistry & Read Capabilities', () => {
  function setup() {
    const dir = tempDir()
    const library = LibraryStore.open({ dataDir: dir, now: () => 1000 })
    stores.push(library)

    const work1 = library.create({ title: 'Tác phẩm 1', sourceLang: 'ja' })
    const ch1_1 = library.createChapter(work1.id, 'Chương 1')
    library.saveText(work1.id, ch1_1.chapter.id, 'source', 'Nguyên văn chương 1', 0, [
      { start: 0, end: 18 }
    ])

    const work2 = library.create({ title: 'Tác phẩm 2', sourceLang: 'en' })
    const ch2_1 = library.createChapter(work2.id, 'Chapter 1')
    library.saveText(work2.id, ch2_1.chapter.id, 'source', 'Original chapter 1', 0, [
      { start: 0, end: 18 }
    ])

    const registry = new CapabilityRegistry()
    for (const cap of defaultReadCapabilities) {
      registry.register(cap)
    }

    return {
      library,
      registry,
      work1,
      work2,
      ch1_1: ch1_1.chapter,
      ch2_1: ch2_1.chapter
    }
  }

  it('rejects unregistered capabilities with not_found', async () => {
    const { library, registry } = setup()

    const res = await registry.execute(
      'sql_query',
      { query: 'SELECT * FROM work' },
      {
        turnId: 't1',
        commandId: 'c1',
        library,
        now: 1000
      }
    )

    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('not_found')
    expect(res.error?.message).toContain('không tồn tại hoặc chưa được đăng ký')
  })

  it('verifies primitive shell, file, and raw SQL tools are nowhere registered', () => {
    const { registry } = setup()
    const registeredNames = registry.list().map((c) => c.name)

    expect(registeredNames).not.toContain('sql')
    expect(registeredNames).not.toContain('query')
    expect(registeredNames).not.toContain('shell')
    expect(registeredNames).not.toContain('exec')
    expect(registeredNames).not.toContain('run_command')
    expect(registeredNames).not.toContain('writeFile')
    expect(registeredNames).not.toContain('readFile')
  })

  it('rejects malformed arguments with validation error', async () => {
    const { library, registry } = setup()

    // search_work requires query to be non-empty string
    const res = await registry.execute(
      'search_work',
      { query: '' },
      {
        turnId: 't1',
        commandId: 'c1',
        library,
        now: 1000,
        target: { kind: 'work', workId: 'w1', workLabel: 'W1' }
      }
    )

    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('validation')
  })

  it('enforces targetPolicy requires_target when target is missing', async () => {
    const { library, registry } = setup()

    const res = await registry.execute(
      'read_chapter',
      { side: 'source' },
      {
        turnId: 't1',
        commandId: 'c1',
        library,
        now: 1000
      }
    )

    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('target_required')
  })

  it('executes cross-work reads without altering revisions', async () => {
    const { library, registry, work2, ch2_1 } = setup()

    // Read chapter in work 2
    const target2 = {
      kind: 'chapter' as const,
      workId: work2.id,
      workLabel: work2.title,
      chapterId: ch2_1.id,
      chapterLabel: ch2_1.title
    }

    const res = await registry.execute(
      'read_chapter',
      { side: 'source' },
      {
        turnId: 't1',
        commandId: 'c1',
        library,
        now: 1000,
        target: target2
      }
    )

    expect(res.ok).toBe(true)
    const val = res.value as { source: { content: string; rev: number } }
    expect(val.source.content).toBe('Original chapter 1')
    expect(val.source.rev).toBe(1)

    // Verify work 2 revision did NOT increase
    const ch2Text = library.withWork(work2.id, (db) => {
      const row = db
        .prepare('SELECT rev FROM chapter_text WHERE chapter_id = ? AND side = ?')
        .get<{ rev: number }>(ch2_1.id, 'source')
      return row?.rev
    })
    expect(ch2Text).toBe(1)

    // The description names the target the call reads.
    const described = readChapterCapability.describe!({ target: target2, args: { side: 'source' } })
    expect(described).toContain('Chapter 1')
  })

  it('enforces budget limits on rounds, reads, writes and capability calls', () => {
    const tracker = new TurnBudgetTracker({
      maxModelRounds: 3,
      maxReadChars: 50,
      maxWriteOperations: 1,
      maxCapabilityCalls: 2
    })

    // Model rounds
    expect(tracker.recordModelRound()).toEqual({ allowed: true, isFinalRound: false })
    expect(tracker.recordModelRound()).toEqual({ allowed: true, isFinalRound: false })
    const r3 = tracker.recordModelRound()
    expect(r3.allowed).toBe(true)
    expect(r3.isFinalRound).toBe(true) // Round 3 is the final round!
    expect(tracker.recordModelRound().allowed).toBe(false)

    // Capability calls
    expect(tracker.recordCapabilityCall('c1').allowed).toBe(true)
    expect(tracker.recordCapabilityCall('c2').allowed).toBe(true)
    expect(tracker.recordCapabilityCall('c3').allowed).toBe(false)

    // Read chars
    expect(tracker.recordRead(30).allowed).toBe(true)
    expect(tracker.recordRead(25).allowed).toBe(false) // 30 + 25 > 50

    // Write operations
    expect(tracker.recordWriteOperation().allowed).toBe(true)
    expect(tracker.recordWriteOperation().allowed).toBe(false)
  })
})
