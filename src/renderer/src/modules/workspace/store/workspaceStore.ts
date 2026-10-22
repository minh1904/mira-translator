import { create } from 'zustand'
import type { WorkspaceState, WorkspaceTab } from '../../../../../shared/contracts/workspace'
import type { LeaveGuardRegistry } from '../chapter-editor/leaveGuard'
import { registerStoreReset } from '../../../lib/testing/resetStores'

const NAV_KEY = 'mira.navCollapsed'

/** Trạng thái thu gọn thanh điều hướng thành thanh biểu tượng; lưu theo từng thiết bị. */
function readNavCollapsed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
}

function writeNavCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(NAV_KEY, collapsed ? '1' : '0')
  } catch {
    // Bỏ qua lỗi ghi localStorage; thanh điều hướng vẫn duy trì trạng thái trong phiên hiện tại.
  }
}

/** Các màn hình cấp ứng dụng trên thanh điều hướng chính. */
export type AppPage =
  | 'home'
  | 'library'
  | 'jobs'
  | 'updates'
  | 'sources'
  | 'shared'
  | 'style'
  | 'assistant'

/** Các panel của sidebar màn dịch chương, theo thứ tự trên activity bar. */
export type ChapterPanelId = 'chapters' | 'search' | 'context' | 'checks' | 'jobs'

export type View =
  | { name: AppPage }
  | { name: 'create' }
  | { name: 'work'; workId: string }
  | { name: 'chapter'; workId: string; chapterId: string }

function viewOf(tab: WorkspaceTab): View {
  return tab.location.name === 'chapter'
    ? { name: 'chapter', workId: tab.workId, chapterId: tab.location.chapterId }
    : { name: 'work', workId: tab.workId }
}

export interface WorkspaceStateStore {
  view: View
  tabs: WorkspaceTab[]
  activeWorkId: string | null
  workspaceReady: boolean
  workspaceNotice: string | null

  sidebarOpen: boolean
  /** Nội dung sidebar màn dịch chương, do activity bar chọn. */
  chapterPanel: ChapterPanelId
  /** Thanh điều hướng chính thu gọn thành thanh biểu tượng hẹp. */
  navCollapsed: boolean
  /** Hộp thoại tìm kiếm và bảng lệnh nhanh (Ctrl+K). */
  paletteOpen: boolean

  leaveGuardRegistry: LeaveGuardRegistry | null
  /** A paragraph the chapter screen should scroll to once its editors are up ("Mở đoạn"). */
  reveal: { chapterId: string; paragraph: number } | null

  /** Opens a chapter and asks its screen to scroll to the paragraph. */
  openParagraph(workId: string, chapterId: string, paragraph: number): Promise<boolean>
  clearReveal(): void
  setLeaveGuardRegistry(registry: LeaveGuardRegistry | null): void
  navigate(next: View): Promise<boolean>
  activateTab(workId: string): void
  closeTab(workId: string): Promise<boolean>
  setWorkArea(workId: string, areaId: string): void
  restoreWorkspace(state: WorkspaceState, notices: string[]): void
  setWorkspaceNotice(notice: string | null): void

  toggleSidebar(): void
  setSidebarOpen(open: boolean): void
  /**
   * Bấm một mục trên activity bar: mở panel đó; bấm lại panel đang mở thì ẩn sidebar, như VS Code.
   */
  showChapterPanel(panel: ChapterPanelId): void
  toggleNav(): void
  setPaletteOpen(open: boolean): void

  reset(): void
}

const initialValues = {
  view: { name: 'home' } as View,
  tabs: [] as WorkspaceTab[],
  activeWorkId: null as string | null,
  workspaceReady: false,
  workspaceNotice: null as string | null,

  sidebarOpen: true,
  chapterPanel: 'chapters' as ChapterPanelId,
  navCollapsed: false,
  paletteOpen: false,

  leaveGuardRegistry: null as LeaveGuardRegistry | null,
  reveal: null as { chapterId: string; paragraph: number } | null
}

let pendingSave = Promise.resolve()

function saveWorkspace(state: WorkspaceStateStore): Promise<void> {
  if (!state.workspaceReady || typeof window === 'undefined' || !window.mira?.workspace)
    return Promise.resolve()
  const snapshot: WorkspaceState = {
    version: 1,
    tabs: state.tabs,
    activeWorkId: state.activeWorkId
  }
  pendingSave = pendingSave
    .then(async () => {
      const result = await window.mira.workspace.save(snapshot)
      if (!result.ok)
        useWorkspaceStore
          .getState()
          .setWorkspaceNotice('Không lưu được phiên tab: ' + result.error.message)
    })
    .catch(() => {
      useWorkspaceStore
        .getState()
        .setWorkspaceNotice('Không lưu được phiên tab. Dữ liệu truyện vẫn an toàn.')
    })
  return pendingSave
}

export const useWorkspaceStore = create<WorkspaceStateStore>((set, get) => ({
  ...initialValues,
  navCollapsed: readNavCollapsed(),

  setLeaveGuardRegistry: (registry) => set({ leaveGuardRegistry: registry }),

  openParagraph: async (workId, chapterId, paragraph) => {
    const opened = await get().navigate({ name: 'chapter', workId, chapterId })
    if (opened) set({ reveal: { chapterId, paragraph } })
    return opened
  },

  clearReveal: () => set({ reveal: null }),

  navigate: async (next) => {
    const { view, leaveGuardRegistry } = get()
    const leavingChapter =
      view.name === 'chapter' &&
      ((next.name === 'work' && next.workId === view.workId) ||
        (next.name === 'chapter' &&
          next.workId === view.workId &&
          next.chapterId !== view.chapterId))
    if (
      leavingChapter &&
      leaveGuardRegistry &&
      !(await leaveGuardRegistry.confirmLeave({ workId: view.workId }))
    )
      return false

    if (next.name === 'work' || next.name === 'chapter') {
      const current = get()
      const existing = current.tabs.find((tab) => tab.workId === next.workId)
      const tab: WorkspaceTab = {
        workId: next.workId,
        areaId: existing?.areaId ?? 'chapters',
        location:
          next.name === 'work' ? { name: 'work' } : { name: 'chapter', chapterId: next.chapterId }
      }
      set({
        view: next,
        activeWorkId: next.workId,
        tabs: existing
          ? current.tabs.map((item) => (item.workId === next.workId ? tab : item))
          : [...current.tabs, tab]
      })
      await saveWorkspace(get())
    } else {
      set({ view: next })
    }
    return true
  },

  activateTab: (workId) => {
    const tab = get().tabs.find((item) => item.workId === workId)
    if (!tab) return
    set({ view: viewOf(tab), activeWorkId: workId })
    void saveWorkspace(get())
  },

  closeTab: async (workId) => {
    const current = get()
    if (current.leaveGuardRegistry && !(await current.leaveGuardRegistry.confirmLeave({ workId })))
      return false
    const index = current.tabs.findIndex((tab) => tab.workId === workId)
    if (index < 0) return false
    const tabs = current.tabs.filter((tab) => tab.workId !== workId)
    const wasVisible =
      (current.view.name === 'work' || current.view.name === 'chapter') &&
      current.view.workId === workId
    const fallback = wasVisible ? tabs[Math.min(index, tabs.length - 1)] : undefined
    set({
      tabs,
      activeWorkId:
        current.activeWorkId === workId
          ? (fallback?.workId ?? tabs[0]?.workId ?? null)
          : current.activeWorkId,
      view: wasVisible ? (fallback ? viewOf(fallback) : { name: 'home' }) : current.view
    })
    await saveWorkspace(get())
    return true
  },

  setWorkArea: (workId, areaId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.workId === workId ? { ...tab, areaId } : tab))
    }))
    void saveWorkspace(get())
  },

  restoreWorkspace: (state, notices) => {
    const selected = state.tabs.find((tab) => tab.workId === state.activeWorkId) ?? state.tabs[0]
    set({
      tabs: state.tabs,
      activeWorkId: selected?.workId ?? null,
      view: selected ? viewOf(selected) : { name: 'home' },
      workspaceReady: true,
      workspaceNotice: notices.join(' ') || null
    })
  },
  setWorkspaceNotice: (workspaceNotice) => set({ workspaceNotice }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  showChapterPanel: (panel) =>
    set((state) =>
      state.sidebarOpen && state.chapterPanel === panel
        ? { sidebarOpen: false }
        : { sidebarOpen: true, chapterPanel: panel }
    ),
  toggleNav: () => {
    const navCollapsed = !get().navCollapsed
    writeNavCollapsed(navCollapsed)
    set({ navCollapsed })
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  reset: () => {
    pendingSave = Promise.resolve()
    set({ ...initialValues })
  }
}))

registerStoreReset(() => useWorkspaceStore.getState().reset())
