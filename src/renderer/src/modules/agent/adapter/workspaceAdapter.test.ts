import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAgentAdapter, type TargetEditorHandler } from './workspaceAdapter'

describe('WorkspaceAgentAdapter (Task 6.1 & 6.2)', () => {
  it('captures context from active context getter, or returns {} when outside workspace', () => {
    const adapter = new WorkspaceAgentAdapter()

    // 1. Outside workspace (e.g. HomeScreen)
    expect(adapter.captureContext()).toEqual({})

    // 2. Active in Work 1, Chapter 1
    adapter.setActiveContextGetter(() => ({
      workId: 'work-1',
      chapterId: 'ch-1',
      side: 'target',
      range: { from: 10, to: 50 }
    }))
    expect(adapter.captureContext()).toEqual({
      workId: 'work-1',
      chapterId: 'ch-1',
      side: 'target',
      range: { from: 10, to: 50 }
    })

    // 3. User leaves workspace
    adapter.setActiveContextGetter(() => null)
    expect(adapter.captureContext()).toEqual({})
  })

  it('flushes dirty target before ack; reports failure if flush fails', async () => {
    const adapter = new WorkspaceAgentAdapter()

    let dirty = true
    const flushMock = vi.fn(async () => {
      if (dirty) {
        dirty = false
        return { ok: true }
      }
      return { ok: true }
    })

    const handler: TargetEditorHandler = {
      isDirty: () => dirty,
      flush: flushMock,
      setReadOnly: vi.fn(),
      reload: vi.fn(async () => {})
    }

    adapter.registerEditor({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, handler)

    // Flush succeeds
    const res1 = await adapter.flushDirty({
      workId: 'work-1',
      chapterId: 'ch-1',
      side: 'target'
    })
    expect(res1).toEqual({ ok: true })
    expect(flushMock).toHaveBeenCalledTimes(1)

    // Simulate failure
    dirty = true
    flushMock.mockImplementationOnce(async () => ({
      ok: false,
      error: 'Revision conflict during autosave'
    }))

    const res2 = await adapter.flushDirty({
      workId: 'work-1',
      chapterId: 'ch-1',
      side: 'target'
    })
    expect(res2).toEqual({ ok: false, error: 'Revision conflict during autosave' })
  })

  it('locks only the target editor during operation; other editors are unaffected', () => {
    const adapter = new WorkspaceAgentAdapter()

    const targetSetReadOnly = vi.fn()
    const otherSetReadOnly = vi.fn()

    const targetHandler: TargetEditorHandler = {
      isDirty: () => false,
      flush: async () => ({ ok: true }),
      setReadOnly: targetSetReadOnly,
      reload: async () => {}
    }
    const otherHandler: TargetEditorHandler = {
      isDirty: () => false,
      flush: async () => ({ ok: true }),
      setReadOnly: otherSetReadOnly,
      reload: async () => {}
    }

    // Target editor: work-1, ch-1, target
    adapter.registerEditor({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, targetHandler)
    // Other editor: work-1, ch-1, source
    adapter.registerEditor({ workId: 'work-1', chapterId: 'ch-1', side: 'source' }, otherHandler)

    // Lock target side
    adapter.setLocked({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, true)
    expect(adapter.isLocked({ workId: 'work-1', chapterId: 'ch-1', side: 'target' })).toBe(true)
    expect(adapter.isLocked({ workId: 'work-1', chapterId: 'ch-1', side: 'source' })).toBe(false)

    expect(targetSetReadOnly).toHaveBeenCalledWith(true)
    expect(otherSetReadOnly).not.toHaveBeenCalled()

    // Unlock target side
    adapter.setLocked({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, false)
    expect(adapter.isLocked({ workId: 'work-1', chapterId: 'ch-1', side: 'target' })).toBe(false)
    expect(targetSetReadOnly).toHaveBeenCalledWith(false)
  })

  it('reloads target once at terminal revision', async () => {
    const adapter = new WorkspaceAgentAdapter()

    const reloadMock = vi.fn(async (_rev?: number) => {})
    adapter.registerEditor(
      { workId: 'work-1', chapterId: 'ch-1', side: 'target' },
      {
        isDirty: () => false,
        flush: async () => ({ ok: true }),
        setReadOnly: vi.fn(),
        reload: reloadMock
      }
    )

    await adapter.reloadTarget({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, 5)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(reloadMock).toHaveBeenCalledWith(5)
  })

  it('reloads once even when the reload makes the editor register itself again', async () => {
    const adapter = new WorkspaceAgentAdapter()
    const target = { workId: 'work-1', chapterId: 'ch-1', side: 'target' as const }
    let calls = 0
    const register = (): (() => void) =>
      adapter.registerEditor(target, {
        isDirty: () => false,
        flush: async () => ({ ok: true }),
        setReadOnly: vi.fn(),
        // Like ChapterWorkspace: the new revision re-runs the effect that registers the editor.
        reload: async () => {
          calls++
          if (calls > 5) throw new Error('reload loop')
          unregister()
          unregister = register()
        }
      })
    let unregister = register()

    await adapter.reloadTarget(target, 5)
    expect(calls).toBe(1)
  })

  it('tolerates leaving workspace during run without throwing', async () => {
    const adapter = new WorkspaceAgentAdapter()

    const unregister = adapter.registerEditor(
      { workId: 'work-1', chapterId: 'ch-1', side: 'target' },
      {
        isDirty: () => false,
        flush: async () => ({ ok: true }),
        setReadOnly: vi.fn(),
        reload: vi.fn(async () => {})
      }
    )

    // User navigates away from chapter
    unregister()

    // Operation finishes and attempts flush / lock / reload
    await expect(
      adapter.flushDirty({ workId: 'work-1', chapterId: 'ch-1', side: 'target' })
    ).resolves.toEqual({ ok: true })

    adapter.setLocked({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, true)
    await expect(
      adapter.reloadTarget({ workId: 'work-1', chapterId: 'ch-1', side: 'target' }, 6)
    ).resolves.toBeUndefined()
  })
})
