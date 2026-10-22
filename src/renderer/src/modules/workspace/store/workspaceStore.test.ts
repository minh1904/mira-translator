import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useAiChatStore } from '../public'
import { useWorkspaceStore, type View } from './workspaceStore'
import type { LeaveGuardRegistry } from '../public'
import { useAiOverlayStore } from '../../ai-connections/public'
import { useThemeStore } from '../../../components/ui/themeStore'

describe('uiStore', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('initializes with default values', () => {
    const state = useWorkspaceStore.getState()
    expect(state.view).toEqual({ name: 'home' })
    expect(state.sidebarOpen).toBe(true)
    expect(state.navCollapsed).toBe(false)
    expect(useAiOverlayStore.getState().settings).toBeNull()
  })

  it('folds the app sidebar to its rail and back', () => {
    useWorkspaceStore.getState().toggleNav()
    expect(useWorkspaceStore.getState().navCollapsed).toBe(true)
    useWorkspaceStore.getState().toggleNav()
    expect(useWorkspaceStore.getState().navCollapsed).toBe(false)
  })

  it('goes to an app page without opening a work tab', async () => {
    await useWorkspaceStore.getState().navigate({ name: 'jobs' })
    expect(useWorkspaceStore.getState().view).toEqual({ name: 'jobs' })
    expect(useWorkspaceStore.getState().tabs).toEqual([])
  })

  it('opens a chapter and asks it to scroll to a paragraph, once', async () => {
    expect(await useWorkspaceStore.getState().openParagraph('work-1', 'ch-3', 7)).toBe(true)
    expect(useWorkspaceStore.getState().view).toEqual({
      name: 'chapter',
      workId: 'work-1',
      chapterId: 'ch-3'
    })
    expect(useWorkspaceStore.getState().reveal).toEqual({ chapterId: 'ch-3', paragraph: 7 })
    useWorkspaceStore.getState().clearReveal()
    expect(useWorkspaceStore.getState().reveal).toBeNull()
  })

  it('navigates to next view directly when no leaveGuard is registered', async () => {
    const next: View = { name: 'work', workId: 'work-1' }
    const ok = await useWorkspaceStore.getState().navigate(next)

    expect(ok).toBe(true)
    expect(useWorkspaceStore.getState().view).toEqual(next)
  })

  it('blocks navigation when leaveGuard denies leaving', async () => {
    const mockRegistry: LeaveGuardRegistry = {
      register: vi.fn(),
      isDirty: vi.fn().mockReturnValue(true),
      confirmLeave: vi.fn().mockResolvedValue(false)
    }

    useWorkspaceStore.getState().setLeaveGuardRegistry(mockRegistry)
    await useWorkspaceStore
      .getState()
      .navigate({ name: 'chapter', workId: 'work-1', chapterId: 'one' })
    const next: View = { name: 'chapter', workId: 'work-1', chapterId: 'two' }
    const ok = await useWorkspaceStore.getState().navigate(next)

    expect(ok).toBe(false)
    expect(useWorkspaceStore.getState().view).toEqual({
      name: 'chapter',
      workId: 'work-1',
      chapterId: 'one'
    })
    expect(mockRegistry.confirmLeave).toHaveBeenCalledWith({ workId: 'work-1' })
  })

  it('allows navigation when leaveGuard confirms leaving', async () => {
    const mockRegistry: LeaveGuardRegistry = {
      register: vi.fn(),
      isDirty: vi.fn().mockReturnValue(true),
      confirmLeave: vi.fn().mockResolvedValue(true)
    }

    useWorkspaceStore.getState().setLeaveGuardRegistry(mockRegistry)
    await useWorkspaceStore
      .getState()
      .navigate({ name: 'chapter', workId: 'work-1', chapterId: 'one' })
    const next: View = { name: 'work', workId: 'work-1' }
    const ok = await useWorkspaceStore.getState().navigate(next)

    expect(ok).toBe(true)
    expect(useWorkspaceStore.getState().view).toEqual(next)
    expect(mockRegistry.confirmLeave).toHaveBeenCalledTimes(1)
  })

  it('keeps one tab per work and restores its chapter on activation', async () => {
    const store = useWorkspaceStore.getState()
    await store.navigate({ name: 'chapter', workId: 'one', chapterId: 'c1' })
    await store.navigate({ name: 'work', workId: 'two' })
    store.activateTab('one')
    expect(useWorkspaceStore.getState().view).toEqual({
      name: 'chapter',
      workId: 'one',
      chapterId: 'c1'
    })
    expect(useWorkspaceStore.getState().tabs.map((tab) => tab.workId)).toEqual(['one', 'two'])
  })

  it('restores the selected work, chapter and area from a saved workspace', () => {
    useWorkspaceStore.getState().restoreWorkspace(
      {
        version: 1,
        tabs: [
          { workId: 'one', areaId: 'context', location: { name: 'work' } },
          { workId: 'two', areaId: 'chapters', location: { name: 'chapter', chapterId: 'c2' } }
        ],
        activeWorkId: 'two'
      },
      []
    )
    expect(useWorkspaceStore.getState().view).toEqual({
      name: 'chapter',
      workId: 'two',
      chapterId: 'c2'
    })
    useWorkspaceStore.getState().activateTab('one')
    expect(useWorkspaceStore.getState().tabs[0].areaId).toBe('context')
    expect(useWorkspaceStore.getState().view).toEqual({ name: 'work', workId: 'one' })
  })

  it('returns to another open tab when closing the tab behind settings', async () => {
    await useWorkspaceStore.getState().navigate({ name: 'work', workId: 'one' })
    await useWorkspaceStore.getState().navigate({ name: 'work', workId: 'two' })
    useAiOverlayStore.getState().openSettings()
    expect(await useWorkspaceStore.getState().closeTab('two')).toBe(true)
    useAiOverlayStore.getState().closeSettings()
    expect(useWorkspaceStore.getState().view).toEqual({ name: 'work', workId: 'one' })
  })

  it('does not cancel a Main AI request when its work tab closes', async () => {
    const chat = useAiChatStore.getState()
    chat.selectWork('one')
    const turn = chat.beginTurn({ question: 'Dịch' })
    chat.attachRequestIdForWork('one', turn.localId, 'request-one')
    await useWorkspaceStore.getState().navigate({ name: 'work', workId: 'one' })
    await useWorkspaceStore.getState().navigate({ name: 'work', workId: 'two' })
    chat.selectWork('two')
    expect(await useWorkspaceStore.getState().closeTab('one')).toBe(true)
    chat.receiveChunk({ requestId: 'request-one', kind: 'delta', text: 'Kết quả A' })
    expect(useAiChatStore.getState().session.turns).toEqual([])
    chat.selectWork('one')
    expect(useAiChatStore.getState().session.turns[0].answer).toBe('Kết quả A')
  })

  it('switches tabs without a leave prompt and rejects closing a dirty tab when cancelled', async () => {
    const mockRegistry: LeaveGuardRegistry = {
      register: vi.fn(),
      isDirty: vi.fn().mockReturnValue(true),
      confirmLeave: vi.fn().mockResolvedValue(false)
    }
    useWorkspaceStore.getState().setLeaveGuardRegistry(mockRegistry)
    await useWorkspaceStore.getState().navigate({ name: 'chapter', workId: 'one', chapterId: 'c1' })
    await useWorkspaceStore.getState().navigate({ name: 'work', workId: 'two' })
    useWorkspaceStore.getState().activateTab('one')
    expect(mockRegistry.confirmLeave).not.toHaveBeenCalled()
    expect(await useWorkspaceStore.getState().closeTab('one')).toBe(false)
    expect(mockRegistry.confirmLeave).toHaveBeenCalledWith({ workId: 'one' })
    expect(useWorkspaceStore.getState().tabs).toHaveLength(2)
  })

  it('opens settings over the current view and leaves the view alone', async () => {
    const workView: View = { name: 'work', workId: 'w-123' }
    await useWorkspaceStore.getState().navigate(workView)

    useAiOverlayStore.getState().openSettings()
    expect(useAiOverlayStore.getState().settings).toEqual({ group: 'model', page: 'main' })
    expect(useWorkspaceStore.getState().view).toEqual(workView)

    useAiOverlayStore.getState().closeSettings()
    expect(useAiOverlayStore.getState().settings).toBeNull()
    expect(useWorkspaceStore.getState().view).toEqual(workView)
  })

  it('opens settings at a deep link and falls back to the first page of an unknown one', () => {
    useAiOverlayStore
      .getState()
      .openSettings({ group: 'connections', page: 'keys', key: 'provider:google' })
    expect(useAiOverlayStore.getState().settings).toEqual({
      group: 'connections',
      page: 'keys',
      key: 'provider:google'
    })
    useAiOverlayStore.getState().openSettings({ group: 'model', page: 'nope' })
    expect(useAiOverlayStore.getState().settings).toEqual({ group: 'model', page: 'main' })
  })

  it('remembers an explicit theme and follows the system only when asked', () => {
    useThemeStore.getState().setThemePreference('dark')
    expect(useThemeStore.getState()).toMatchObject({ themePreference: 'dark', theme: 'dark' })
    useThemeStore.getState().syncSystemTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
    useThemeStore.getState().setThemePreference('system')
    expect(useThemeStore.getState().themePreference).toBe('system')
  })

  it('toggles sidebar and theme', () => {
    expect(useWorkspaceStore.getState().sidebarOpen).toBe(true)
    useWorkspaceStore.getState().toggleSidebar()
    expect(useWorkspaceStore.getState().sidebarOpen).toBe(false)
    useWorkspaceStore.getState().toggleSidebar()
    expect(useWorkspaceStore.getState().sidebarOpen).toBe(true)

    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('switches the chapter side panel and hides it when its own icon is pressed again', () => {
    const store = useWorkspaceStore.getState
    expect(store()).toMatchObject({ sidebarOpen: true, chapterPanel: 'chapters' })
    store().showChapterPanel('search')
    expect(store()).toMatchObject({ sidebarOpen: true, chapterPanel: 'search' })
    store().showChapterPanel('search')
    expect(store()).toMatchObject({ sidebarOpen: false, chapterPanel: 'search' })
    store().showChapterPanel('context')
    expect(store()).toMatchObject({ sidebarOpen: true, chapterPanel: 'context' })
  })
})
