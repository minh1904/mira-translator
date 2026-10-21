import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import {
  StatusBarSlotContext,
  TopBarSlotContext,
  TopBarTitleSlotContext
} from '../components/ui/topBarSlot'
import type { Theme } from './useTheme'

export interface AppShellProps {
  /** Thanh bên ứng dụng (AppNav) nằm dưới tiêu đề cửa sổ; null ở màn hình chương. */
  nav: ReactNode | null
  /** Cột danh sách cạnh vùng làm việc (như danh sách chương); null nếu màn hình không có. */
  sidebar: ReactNode | null
  sidebarOpen: boolean
  onToggleSidebar(): void
  theme?: Theme
  onToggleTheme?: () => void
  onOpenSettings?: () => void
  onOpenPalette?(): void
  settingsOpen?: boolean
  /** Thanh trạng thái toàn cục ở đáy cửa sổ (chiều cao 22px chuẩn VS Code). */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Phần mép phải của thanh tiêu đề dành cho các nút điều khiển cửa sổ của hệ điều hành.
 * Biến `titlebar-area-*` xác định phần không gian còn lại cho ứng dụng, với khoảng đệm tối thiểu 10px.
 */
const BAR_END_PADDING =
  'max(10px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))'

/**
 * Khung cửa sổ ứng dụng theo phong cách VS Code:
 * 1. Thanh tiêu đề duy nhất chuẩn desktop (35px): Chỉ hiển thị logo và tiêu đề trang, kéo cửa sổ tự nhiên, không chứa nút bấm.
 * 2. Vùng làm việc chính: Activity Bar cố định bên trái, Sidebar (danh sách chương), và vùng nội dung chính.
 * 3. Thanh trạng thái (Status Bar) 22px cố định ở đáy cửa sổ.
 */
export function AppShell({
  nav,
  sidebar,
  sidebarOpen,
  onToggleSidebar,
  footer,
  children
}: AppShellProps): JSX.Element {
  const [slot] = useState<HTMLElement | null>(null)
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const [bottomSlot, setBottomSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        if (event.key.toLowerCase() === 'b') {
          event.preventDefault()
          onToggleSidebar()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onToggleSidebar])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-default">
      {/* 1. Thanh tiêu đề duy nhất chuẩn VS Code: chỉ hiển thị tiêu đề và là vùng kéo cửa sổ, không chứa các nút bấm */}
      <header
        data-slot="app-titlebar"
        className="window-drag flex h-(--mira-header-height) shrink-0 min-w-0 select-none items-center justify-between border-b border-default bg-subtle px-3 pr-sm text-body-xs text-subtle"
        style={{ paddingRight: BAR_END_PADDING }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-semibold tracking-heading text-emphasis">Mira</span>
          <span className="h-3 w-px bg-line" aria-hidden="true" />
          <div
            ref={setTitleSlot}
            className="flex min-w-0 items-center gap-xs truncate text-muted"
          />
        </div>
      </header>

      {/* 2. Thân chính ứng dụng: Activity Bar + Primary Sidebar + Vùng làm việc */}
      <div data-slot="app-workspace" className="flex min-h-0 min-w-0 flex-1">
        {nav}
        {sidebar !== null && (
          <aside
            id="app-sidebar"
            inert={!sidebarOpen || undefined}
            aria-hidden={!sidebarOpen || undefined}
            className={cn(
              'flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-default bg-subtle transition-[width] duration-(--mira-duration-base) ease-standard',
              sidebarOpen ? 'w-(--mira-sidebar-width)' : 'w-0 border-r-0'
            )}
            aria-label="Danh sách"
          >
            <div className="flex min-h-0 w-(--mira-sidebar-width) min-w-(--mira-sidebar-width) flex-1 flex-col">
              {sidebar}
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <StatusBarSlotContext.Provider value={bottomSlot}>
            <TopBarTitleSlotContext.Provider value={titleSlot}>
              <TopBarSlotContext.Provider value={slot}>
                <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
              </TopBarSlotContext.Provider>
            </TopBarTitleSlotContext.Provider>
          </StatusBarSlotContext.Provider>
        </div>
      </div>

      {/* 3. Thanh trạng thái đáy (Status Bar) 22px chuẩn VS Code */}
      <footer
        data-slot="app-statusbar"
        className="flex h-[22px] shrink-0 items-center justify-between border-t border-default bg-subtle px-2 text-body-xs text-subtle select-none tabular-nums"
      >
        <div
          ref={setBottomSlot}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 empty:hidden"
        />
        {footer}
      </footer>
    </div>
  )
}
