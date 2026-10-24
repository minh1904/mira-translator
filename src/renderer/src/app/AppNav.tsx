import type { JSX, ReactNode } from 'react'
import {
  Book2Icon,
  ChatRoundLineIcon,
  ChecklistMinimalisticIcon,
  CompassIcon,
  FeedIcon,
  Home2Icon,
  LibraryIcon,
  MinimalisticMagnifierIcon,
  MoonIcon,
  Pen2Icon,
  SettingsIcon,
  SidebarMinimalisticIcon,
  SunIcon
} from '@renderer/components/ui/reicon'

import { ActivityBarItem } from '../components/ui/ActivityBarItem'
import { CompactButton } from '../components/ui/CompactButton'
import { ICON } from '../components/ui/icon'
import { Kbd } from '../components/ui/Input'
import { NavItem } from '../components/ui/NavItem'
import { Tip } from '../components/ui/Tooltip'
import { cn } from '../lib/cn'
import type { Theme } from '../components/ui/themeStore'
import type { AppPage } from '../modules/workspace/public'

type IconComponent = typeof Home2Icon

interface NavEntry {
  page: AppPage
  label: string
  icon: IconComponent
}

/** Danh mục điều hướng cho công việc hàng ngày, tiếp theo là tài nguyên dùng chung. */
const MAIN: NavEntry[] = [
  { page: 'home', label: 'Trang chủ', icon: Home2Icon },
  { page: 'library', label: 'Thư viện', icon: LibraryIcon },
  { page: 'jobs', label: 'Hoạt động', icon: ChecklistMinimalisticIcon },
  { page: 'updates', label: 'Cập nhật', icon: FeedIcon },
  { page: 'sources', label: 'Nguồn', icon: CompassIcon }
]
const RESOURCES: NavEntry[] = [
  { page: 'shared', label: 'Kho dùng chung', icon: Book2Icon },
  { page: 'style', label: 'Prompt & văn phong', icon: Pen2Icon },
  { page: 'assistant', label: 'Trợ lý AI', icon: ChatRoundLineIcon }
]

export interface AppNavProps {
  /** Trang hiện tại trên màn hình; khi mở tác phẩm thì thuộc về mục thư viện. */
  page: AppPage | null
  collapsed: boolean
  onNavigate(page: AppPage): void
  onToggleCollapsed(): void
  onOpenPalette(): void
  /** Số tác phẩm trong thư viện, hiển thị cạnh mục tương ứng; null khi đang tải. */
  libraryCount: number | null
  theme: Theme
  onToggleTheme(): void
  onOpenSettings(): void
  settingsOpen: boolean
  /** Cảnh báo lỗi kết nối hiển thị tại nút Cài đặt; null khi kết nối ổn định hoặc đang tải. */
  connectionNotice: string | null
}

/**
 * Thanh điều hướng ứng dụng phía dưới tiêu đề cửa sổ: chiều rộng 224px có nhãn hoặc thu gọn
 * thành activity bar 40px như màn chương (`ActivityBarItem`, icon 18px) để hai màn cân nhau.
 * Nút Cài đặt và chuyển đổi giao diện nằm ở dưới cùng.
 */
export function AppNav({
  page,
  collapsed,
  onNavigate,
  onToggleCollapsed,
  onOpenPalette,
  libraryCount,
  theme,
  onToggleTheme,
  onOpenSettings,
  settingsOpen,
  connectionNotice
}: AppNavProps): JSX.Element {
  const themeLabel = theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'
  const toggleLabel = collapsed ? 'Mở rộng thanh bên (Ctrl+B)' : 'Thu thanh bên (Ctrl+B)'

  function row(entry: NavEntry): JSX.Element {
    const trailing =
      entry.page === 'library' && libraryCount !== null && !collapsed ? (
        <span className="text-label-xs text-muted tabular-nums">{libraryCount}</span>
      ) : null
    return (
      <Item
        key={entry.page}
        collapsed={collapsed}
        label={entry.label}
        active={page === entry.page}
        onClick={() => onNavigate(entry.page)}
        icon={entry.icon}
        trailing={trailing}
      />
    )
  }

  return (
    <aside
      aria-label="Điều hướng"
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden rounded-md border border-default bg-surface shadow-xs transition-[width] duration-(--mira-duration-base) ease-standard',
        // 40px của ActivityBarItem cộng 2px viền, bằng khung activity bar của màn chương.
        collapsed ? 'w-[42px]' : 'w-[224px]'
      )}
    >
      {collapsed ? (
        <div className="flex shrink-0 border-b border-default bg-subtle/30">
          <Tip label={toggleLabel} side="right">
            <ActivityBarItem
              aria-label={toggleLabel}
              aria-expanded={false}
              onClick={onToggleCollapsed}
              icon={<SidebarMinimalisticIcon size={ICON.md} />}
            />
          </Tip>
        </div>
      ) : (
        <div className="flex h-7 shrink-0 items-center justify-end border-b border-default bg-subtle/30 pr-xs">
          <Tip label={toggleLabel} side="bottom">
            <CompactButton
              aria-label={toggleLabel}
              aria-expanded
              onClick={onToggleCollapsed}
              icon={<SidebarMinimalisticIcon size={ICON.md} />}
            />
          </Tip>
        </div>
      )}

      <nav
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          collapsed ? undefined : 'gap-2xs p-xs'
        )}
      >
        <Item
          collapsed={collapsed}
          label="Tìm"
          onClick={onOpenPalette}
          icon={MinimalisticMagnifierIcon}
          trailing={collapsed ? null : <Kbd>Ctrl K</Kbd>}
          className={collapsed ? undefined : 'mb-xs border border-input bg-surface'}
        >
          {collapsed ? undefined : 'Tìm…'}
        </Item>
        {MAIN.map(row)}
        {collapsed ? (
          <span aria-hidden="true" className="mx-auto my-xs h-px w-6 shrink-0 bg-line" />
        ) : (
          <p className="m-0 px-xs pt-md pb-2xs text-label-xs text-muted">Tài nguyên</p>
        )}
        {RESOURCES.map(row)}
      </nav>

      <div
        className={cn(
          'flex shrink-0 border-t border-default',
          // Mở rộng: cao 28px như hàng đầu thanh bên.
          collapsed ? 'flex-col' : 'h-7 items-center gap-2xs px-xs'
        )}
      >
        <Item
          collapsed={collapsed}
          label="Cài đặt"
          ariaLabel={connectionNotice ? `Cài đặt — ${connectionNotice}` : undefined}
          active={settingsOpen}
          onClick={onOpenSettings}
          icon={SettingsIcon}
          trailing={
            connectionNotice ? (
              <span
                title={connectionNotice}
                className={cn(
                  'size-2 shrink-0 rounded-full bg-warning',
                  collapsed && 'absolute top-2 right-2'
                )}
                aria-hidden="true"
              />
            ) : null
          }
          className={collapsed ? undefined : 'h-6 flex-1'}
        />
        {collapsed ? (
          <Tip label={themeLabel} side="right">
            <ActivityBarItem
              aria-label={themeLabel}
              onClick={onToggleTheme}
              icon={theme === 'dark' ? <SunIcon size={ICON.md} /> : <MoonIcon size={ICON.md} />}
            />
          </Tip>
        ) : (
          <Tip label={themeLabel} side="top">
            <CompactButton
              aria-label={themeLabel}
              onClick={onToggleTheme}
              icon={theme === 'dark' ? <SunIcon size={ICON.sm} /> : <MoonIcon size={ICON.sm} />}
            />
          </Tip>
        )}
      </div>
    </aside>
  )
}

/**
 * Một mục điều hướng: biểu tượng cùng nhãn chữ, hoặc khi thu gọn là ô activity bar 40px (icon 18px, vạch
 * trái cho mục đang mở) kèm tooltip.
 */
function Item({
  collapsed,
  label,
  ariaLabel,
  active = false,
  onClick,
  icon: Icon,
  trailing,
  className,
  children
}: {
  collapsed: boolean
  label: string
  ariaLabel?: string
  active?: boolean
  onClick(): void
  icon: IconComponent
  trailing?: ReactNode
  className?: string
  children?: ReactNode
}): JSX.Element {
  if (collapsed) {
    return (
      <Tip label={label} side="right">
        <ActivityBarItem
          aria-label={ariaLabel ?? label}
          active={active}
          onClick={onClick}
          className={className}
          icon={
            <>
              <Icon size={ICON.md} aria-hidden="true" />
              {trailing}
            </>
          }
        />
      </Tip>
    )
  }
  return (
    <NavItem
      active={active}
      onClick={onClick}
      aria-label={ariaLabel}
      leading={<Icon size={ICON.sm} aria-hidden="true" />}
      trailing={trailing}
      className={className}
    >
      {children ?? label}
    </NavItem>
  )
}
