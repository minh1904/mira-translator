import type { JSX } from 'react'
import { AppNav } from './AppNav'
import { AppShell } from './AppShell'
import { CommandPaletteMock } from './CommandPaletteMock'
import { WorkTabActiveContext } from '../components/ui/topBarSlot'
import { Button, LinkButton } from '../components/ui/Button'
import { AssistantScreen } from './screens/assistant/AssistantScreen'
import { HomeScreen } from './screens/home/HomeScreen'
import { JobsScreen } from './screens/jobs/JobsScreen'
import { CreateWorkScreen } from '../modules/library/public'
import { LibraryScreen } from '../modules/library/public'
import type { Work } from '../modules/library/public'
import { SharedGlossaryMock } from '../modules/context/public'
import { SourcesScreen } from '../modules/sources/public'
import { StyleProfilesMock } from '../modules/context/public'
import { UpdatesScreen } from '../modules/sources/public'
import { useLibrary } from '../modules/library/public'
import { ChapterNavSidebar } from '../modules/workspace/public'
import { ChapterScreen } from '../modules/workspace/public'
import { type LeaveGuardRegistry, LeaveGuardScopeContext } from '../modules/workspace/public'
import { SettingsModal } from '../modules/ai-connections/public'
import { SETTINGS_PAGES } from '../modules/ai-connections/public'
import { Toaster } from '../components/ui/Toast'
import { useThemeStore } from '../components/ui/themeStore'
import { Onboarding } from '../modules/ai-connections/public'
import { useAiOverlayStore } from '../modules/ai-connections/public'
import { WorkDetailScreen } from '../modules/workspace/public'
import { useWorkspaceStore, type AppPage, type View } from '../modules/workspace/public'
import { useConnectionStore } from '../modules/ai-connections/public'
import { useAiPreferencesLoad } from '../modules/ai-connections/public'
import { useWorkspaceLifecycle, useWorkspaceRestore } from '../modules/workspace/public'
import { useAgentWriteIntents } from '../modules/agent/public'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useSystemThemeSync } from './hooks/useSystemThemeSync'

export function AppContent({ registry }: { registry: LeaveGuardRegistry }): JSX.Element {
  useWorkspaceLifecycle(registry)
  useAppShortcuts()
  useSystemThemeSync()
  useAiPreferencesLoad()
  useAgentWriteIntents()

  const view = useWorkspaceStore((state) => state.view)
  const tabs = useWorkspaceStore((state) => state.tabs)
  const workspaceReady = useWorkspaceStore((state) => state.workspaceReady)
  const workspaceNotice = useWorkspaceStore((state) => state.workspaceNotice)
  const sidebarOpen = useWorkspaceStore((state) => state.sidebarOpen)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar)
  const settingsOpen = useAiOverlayStore((state) => state.settings !== null)
  const navCollapsed = useWorkspaceStore((state) => state.navCollapsed)
  const paletteOpen = useWorkspaceStore((state) => state.paletteOpen)
  const connectionLoad = useConnectionStore((state) => state.load)
  const connectionCount = useConnectionStore((state) => state.connections.length)
  const hasConnection = connectionLoad === 'ready' && connectionCount > 0
  const connectionNotice =
    connectionLoad === 'failed'
      ? 'Không tải được kết nối AI'
      : connectionLoad === 'ready' && connectionCount === 0
        ? 'Chưa kết nối AI'
        : null

  const go = (next: View): void => {
    void useWorkspaceStore.getState().navigate(next)
  }
  const openSettings = (): void => {
    useAiOverlayStore.getState().openSettings()
  }

  const library = useLibrary()
  const { works } = library
  useWorkspaceRestore(library.load)

  const showLibrary = (): void => {
    go({ name: 'library' })
    // Màn hình chi tiết đã cập nhật thay đổi sang thư viện; thao tác này giúp tải lại dữ liệu mới nhất.
    void library.reload()
  }
  const openChapterView = (workId: string, chapterId: string): void =>
    go({ name: 'chapter', workId, chapterId })
  const openWork = (workId: string): void => go({ name: 'work', workId })
  const continueWork = async (work: Work): Promise<void> => {
    const chapter = work.lastChapter
    if (!chapter) return openWork(work.id)
    const result = await window.mira.chapters.open(work.id, chapter.id)
    if (result.ok) {
      library.applyWork(result.value.work)
      openChapterView(work.id, chapter.id)
    } else {
      openWork(work.id)
    }
  }

  let content: JSX.Element = <div />
  // Chỉ riêng màn hình chương có cột thứ hai (danh sách chương).
  let sidebar: JSX.Element | null = null

  switch (view.name) {
    case 'library':
      if (library.load === 'loading') {
        content = (
          <p role="status" className="px-6 pt-8 text-body-sm text-subtle">
            Đang mở thư viện…
          </p>
        )
      } else if (library.load === 'failed') {
        content = (
          <div className="mx-auto flex max-w-[560px] flex-col gap-3 px-6 pt-12">
            <h2 className="text-body-lg font-semibold tracking-heading">Không mở được thư viện</h2>
            <p role="alert" className="text-body-sm leading-normal text-subtle">
              {library.loadError}
            </p>
            <div>
              <Button variant="light" onClick={() => void library.reload()}>
                Thử lại
              </Button>
            </div>
          </div>
        )
      } else {
        content = (
          <LibraryScreen
            works={works}
            problems={library.problems.length}
            onOpenWork={openWork}
            onCreateWork={() => go({ name: 'create' })}
          />
        )
      }
      break
    case 'home':
      content =
        library.load === 'ready' ? (
          <HomeScreen
            works={works}
            connected={hasConnection}
            onContinue={(work) => void continueWork(work)}
            onOpenWork={openWork}
            onCreateWork={() => go({ name: 'create' })}
            onOpenSettings={openSettings}
            onOpenJobs={() => go({ name: 'jobs' })}
            onOpenUpdates={() => go({ name: 'updates' })}
          />
        ) : (
          <p role="status" className="px-6 pt-8 text-body-sm text-subtle">
            {library.load === 'loading' ? 'Đang mở thư viện…' : library.loadError}
          </p>
        )
      break
    case 'jobs':
      content = <JobsScreen onOpenChapter={openChapterView} />
      break
    case 'updates':
      content = <UpdatesScreen />
      break
    case 'sources':
      content = <SourcesScreen onOpenSettings={openSettings} />
      break
    case 'shared':
      content = <SharedGlossaryMock />
      break
    case 'style':
      content = <StyleProfilesMock />
      break
    case 'assistant':
      content = (
        <AssistantScreen
          onOpenTarget={(target) => {
            if (target.kind === 'chapter') {
              openChapterView(target.workId, target.chapterId)
            } else if (target.kind === 'work') {
              openWork(target.workId)
            }
          }}
        />
      )
      break
    case 'create':
      content = (
        <CreateWorkScreen
          onSubmit={library.create}
          onCreated={showLibrary}
          onCancel={showLibrary}
        />
      )
      break
    case 'work': {
      content = (
        <WorkDetailScreen
          key={view.workId}
          workId={view.workId}
          onBackToLibrary={showLibrary}
          onOpenChapter={openChapterView}
          onWorkChanged={library.applyWork}
        />
      )
      break
    }
    case 'chapter': {
      const work = works.find((item) => item.id === view.workId)
      const backToWork = (): void => go({ name: 'work', workId: view.workId })
      content = (
        <ChapterScreen
          key={view.workId}
          workId={view.workId}
          chapterId={view.chapterId}
          onBackToWork={backToWork}
          onWorkChanged={library.applyWork}
          onOpenSettings={openSettings}
          focused={!sidebarOpen}
          onToggleFocus={toggleSidebar}
        />
      )
      sidebar = (
        <ChapterNavSidebar
          key={view.workId}
          workId={view.workId}
          workTitle={work?.title ?? 'Tác phẩm'}
          activeChapterId={view.chapterId}
          onOpenChapter={(chapterId) => openChapterView(view.workId, chapterId)}
          onBackToWork={backToWork}
          onWorkChanged={library.applyWork}
        />
      )
      break
    }
  }

  const visibleWorkId = view.name === 'work' || view.name === 'chapter' ? view.workId : null
  // Thanh bên đánh dấu trang hiển thị; màn hình tác phẩm và tạo mới thuộc về mục thư viện.
  const navPage: AppPage =
    view.name === 'work' || view.name === 'create' || view.name === 'chapter'
      ? 'library'
      : view.name
  // Màn hình chương giữ toàn bộ chiều rộng cho trình soạn thảo.
  const nav =
    view.name === 'chapter' ? null : (
      <AppNav
        page={navPage}
        collapsed={navCollapsed}
        onNavigate={(page) => go({ name: page })}
        onToggleCollapsed={() => useWorkspaceStore.getState().toggleNav()}
        onOpenPalette={() => useWorkspaceStore.getState().setPaletteOpen(true)}
        libraryCount={
          library.load === 'ready' ? works.filter((work) => !work.archived).length : null
        }
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={openSettings}
        settingsOpen={settingsOpen}
        connectionNotice={connectionNotice}
      />
    )
  const tabPanes = tabs.map((tab) => {
    const active = tab.workId === visibleWorkId
    if (!active && tab.location.name === 'chapter' && !registry.isDirty(tab.workId)) return null
    const backToWork = (): void => go({ name: 'work', workId: tab.workId })
    return (
      <div
        key={tab.workId}
        hidden={!active}
        inert={!active}
        className="h-full min-h-0"
        aria-hidden={!active}
      >
        <WorkTabActiveContext.Provider value={active}>
          <LeaveGuardScopeContext.Provider value={tab.workId}>
            {tab.location.name === 'work' ? (
              <WorkDetailScreen
                workId={tab.workId}
                areaId={tab.areaId}
                onAreaChange={(areaId) =>
                  useWorkspaceStore.getState().setWorkArea(tab.workId, areaId)
                }
                onBackToLibrary={showLibrary}
                onOpenChapter={openChapterView}
                onWorkChanged={library.applyWork}
              />
            ) : (
              <ChapterScreen
                key={tab.workId}
                workId={tab.workId}
                chapterId={tab.location.chapterId}
                onBackToWork={backToWork}
                onWorkChanged={library.applyWork}
                onOpenSettings={openSettings}
                focused={!sidebarOpen}
                onToggleFocus={toggleSidebar}
              />
            )}
          </LeaveGuardScopeContext.Provider>
        </WorkTabActiveContext.Provider>
      </div>
    )
  })

  return (
    <>
      <AppShell
        nav={nav}
        sidebar={sidebar}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={
          view.name === 'chapter' ? toggleSidebar : () => useWorkspaceStore.getState().toggleNav()
        }
        footer={
          view.name !== 'chapter' ? (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 font-medium text-default">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  Mira
                </span>
                {connectionNotice && <span className="text-warning">{connectionNotice}</span>}
              </div>
              <div className="flex items-center gap-3">
                {works && <span>{works.length} tác phẩm</span>}
                <span>UTF-8</span>
              </div>
            </div>
          ) : undefined
        }
      >
        {workspaceNotice && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-default px-4 py-2 text-body-xs text-subtle"
          >
            <span>{workspaceNotice}</span>
            <LinkButton
              color="neutral"
              onClick={() => useWorkspaceStore.getState().setWorkspaceNotice(null)}
            >
              Đóng
            </LinkButton>
          </div>
        )}
        {!workspaceReady && library.load === 'ready' ? (
          <p role="status" className="p-6 text-body-sm text-subtle">
            Đang khôi phục phiên làm việc…
          </p>
        ) : visibleWorkId === null ? (
          content
        ) : null}
        {tabPanes}
      </AppShell>
      <SettingsModal pages={SETTINGS_PAGES} />
      <CommandPaletteMock
        open={paletteOpen}
        onOpenChange={(open) => useWorkspaceStore.getState().setPaletteOpen(open)}
      />
      <Onboarding />
      <Toaster />
    </>
  )
}
