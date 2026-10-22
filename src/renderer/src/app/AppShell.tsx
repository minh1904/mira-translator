import { useEffect, useState, type JSX, type ReactNode } from 'react'
import {
  MinimalisticMagnifierIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon
} from '@renderer/components/ui/reicon'

import { Button } from '../components/ui/Button'
import { CompactButton } from '../components/ui/CompactButton'
import { cn } from '../lib/cn'
import { ICON } from '../components/ui/icon'
import { Kbd } from '../components/ui/Input'
import { Tip } from '../components/ui/Tooltip'
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
  theme: Theme
  onToggleTheme(): void
  /** Mở màn cài đặt. Nút ở mọi màn, nên đường vào không phụ thuộc đang đứng ở đâu. */
  onOpenSettings(): void
  /** Mở bảng lệnh tìm kiếm trung tâm (như Command Center của VS Code). */
  onOpenPalette?(): void
  /** Đang ở màn cài đặt: nút sáng lên và không mở lại chính nó. */
  settingsOpen?: boolean
  /**
   * Trạng thái mặc định trên thanh đáy cửa sổ (22px như VS Code). Màn hình có trạng thái riêng
   * (màn chương) bỏ trống prop này và gắn nội dung qua `StatusBarItems`.
   */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Phần mép phải của thanh tiêu đề dành cho các nút điều khiển cửa sổ của hệ điều hành.
 * Biến `titlebar-area-*` xác định phần không gian còn lại cho ứng dụng, với khoảng đệm tối thiểu 10px.
 */
const BAR_END_PADDING =
  'max(10px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))'

const BAR_ICON = ICON.sm

/**
 * Khung cửa sổ ứng dụng: thanh tiêu đề chung ở trên cùng, phía dưới gồm thanh điều hướng ứng dụng và cột nội dung trang.
 * Cột trang gồm thanh công cụ trên cùng, cột danh sách tùy chọn và vùng làm việc chính.
 * Cài đặt và đổi theme đặt ở chân thanh bên hoặc cuối thanh công cụ trang. Ctrl+B dùng để đóng/mở thanh bên.
 */
export function AppShell({
  nav,
  sidebar,
  sidebarOpen,
  onToggleSidebar,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenPalette,
  settingsOpen = false,
  footer,
  children
}: AppShellProps): JSX.Element {
  // Phần tử để gắn các nút điều khiển của màn hình hiện tại (xem `TopBarActions`). Sử dụng state để cập nhật lại khi phần tử tồn tại.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null)

  // Trình xử lý phím tắt toàn cục; nếu các phần tử bên trong (như ô soạn thảo) đã xử lý và gọi preventDefault(), sự kiện sẽ được bỏ qua.
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

  const themeLabel = theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-default">
      {/* 1. Thanh tiêu đề duy nhất chuẩn VS Code: cao 35px, logo + breadcrumb + command center + actions */}
      <header
        data-slot="app-titlebar"
        className="window-drag flex h-(--mira-header-height) shrink-0 min-w-0 items-center justify-between border-b border-default bg-subtle px-2 pr-sm text-body-sm"
        style={{ paddingRight: BAR_END_PADDING }}
      >
        {/* Mép trái: Logo Mira + Breadcrumb / Tiêu đề màn hình */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-label-sm font-semibold tracking-heading select-none text-emphasis">
            Mira
          </span>
          <span className="h-3.5 w-px bg-line" aria-hidden="true" />
          <div ref={setTitleSlot} className="flex min-w-0 items-center gap-xs" />
        </div>

        {/* Chính giữa: Command Center tìm kiếm nhanh theo phong cách VS Code.
            max-w-sm là token spacing 12px, không phải 24rem; chiều rộng dùng --container-sm. */}
        {onOpenPalette && (
          <div className="mx-2 flex min-w-0 max-w-(--container-sm) flex-1 justify-center">
            <Button
              variant="outline"
              onClick={onOpenPalette}
              title="Tìm kiếm tác phẩm, chương… (Ctrl+K / Ctrl+P)"
              className="window-no-drag h-6 w-full min-w-0 justify-between pr-1 pl-2 text-muted hover:border-strong hover:bg-surface hover:text-default shadow-2xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <MinimalisticMagnifierIcon size={12} className="shrink-0 text-muted" />
                <span className="truncate">Tìm kiếm tác phẩm, chương…</span>
              </span>
              <Kbd size="sm">Ctrl K</Kbd>
            </Button>
          </div>
        )}

        {/* Mép phải: Các nút hành động gắn theo màn hình + Đổi theme + Cài đặt */}
        <div className="window-no-drag flex shrink-0 items-center gap-1">
          <div ref={setSlot} className="flex shrink-0 items-center gap-1 empty:hidden" />
          <span className="h-3.5 w-px bg-line [:not(:empty)+&]:block" aria-hidden="true" />
          <div className="flex shrink-0 items-center gap-0.5">
            <Tip label={themeLabel}>
              <CompactButton
                aria-label={themeLabel}
                onClick={onToggleTheme}
                icon={theme === 'dark' ? <SunIcon size={BAR_ICON} /> : <MoonIcon size={BAR_ICON} />}
              />
            </Tip>
            <Tip label="Cài đặt">
              <CompactButton
                aria-label="Cài đặt"
                aria-pressed={settingsOpen}
                onClick={onOpenSettings}
                icon={<SettingsIcon size={BAR_ICON} />}
              />
            </Tip>
          </div>
        </div>
      </header>

      {/* 2. Thân chính ứng dụng: Activity Bar + Primary Sidebar + Vùng làm việc */}
      <div
        data-slot="app-workspace"
        className="flex min-h-0 min-w-0 flex-1 gap-1.5 bg-default p-1.5"
      >
        {nav}
        {sidebar !== null && (
          <aside
            id="app-sidebar"
            inert={!sidebarOpen || undefined}
            aria-hidden={!sidebarOpen || undefined}
            className={cn(
              'flex min-h-0 shrink-0 flex-col overflow-hidden transition-[width] duration-(--mira-duration-base) ease-standard',
              sidebarOpen ? 'w-(--mira-sidebar-width)' : 'w-0'
            )}
            aria-label="Danh sách"
          >
            <div className="flex min-h-0 w-(--mira-sidebar-width) min-w-(--mira-sidebar-width) flex-1 flex-col overflow-hidden rounded-sm border border-default bg-surface shadow-xs">
              {sidebar}
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopBarTitleSlotContext.Provider value={titleSlot}>
            <TopBarSlotContext.Provider value={slot}>
              <StatusBarSlotContext.Provider value={statusSlot}>
                <main
                  className={cn(
                    'min-h-0 flex-1 overflow-y-auto',
                    nav !== null &&
                      'overflow-hidden rounded-sm border border-default bg-surface shadow-xs'
                  )}
                >
                  {children}
                </main>
              </StatusBarSlotContext.Provider>
            </TopBarSlotContext.Provider>
          </TopBarTitleSlotContext.Provider>
        </div>
      </div>

      {/* 3. Thanh trạng thái đáy (Status Bar) 22px, trải hết chiều ngang cửa sổ */}
      <footer
        aria-label="Thanh trạng thái"
        className="flex h-[22px] shrink-0 items-center gap-3 border-t border-default bg-subtle px-2.5 text-body-xs text-subtle tabular-nums select-none"
      >
        {footer}
        <div
          ref={setStatusSlot}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 empty:hidden"
        />
      </footer>
    </div>
  )
}
