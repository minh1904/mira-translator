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

import { CompactButton } from '../components/ui/CompactButton'
import { ICON } from '../components/ui/icon'
import { Kbd } from '../components/ui/Input'
import { NavItem } from '../components/ui/NavItem'
import { Tip } from '../components/ui/Tooltip'
import { cn } from '../lib/cn'
import type { Theme } from '../components/ui/themeStore'
import type { AppPage } from '../modules/workspace/public'

interface NavEntry {
  page: AppPage
  label: string
  icon: ReactNode
}

const icon = (Icon: typeof Home2Icon): ReactNode => <Icon size={ICON.sm} aria-hidden="true" />

/** Danh mục điều hướng cho công việc hàng ngày, tiếp theo là tài nguyên dùng chung. */
const MAIN: NavEntry[] = [
  { page: 'home', label: 'Trang chủ', icon: icon(Home2Icon) },
  { page: 'library', label: 'Thư viện', icon: icon(LibraryIcon) },
  { page: 'jobs', label: 'Tác vụ', icon: icon(ChecklistMinimalisticIcon) },
  { page: 'updates', label: 'Cập nhật', icon: icon(FeedIcon) },
  { page: 'sources', label: 'Nguồn', icon: icon(CompassIcon) }
]
const RESOURCES: NavEntry[] = [
  { page: 'shared', label: 'Kho dùng chung', icon: icon(Book2Icon) },
  { page: 'style', label: 'Prompt & văn phong', icon: icon(Pen2Icon) },
  { page: 'assistant', label: 'Trợ lý AI', icon: icon(ChatRoundLineIcon) }
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
 * Thanh điều hướng ứng dụng phía dưới tiêu đề cửa sổ: chiều rộng 224px có nhãn hoặc thu gọn còn 48px chỉ hiển thị biểu tượng.
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
        leading={entry.icon}
        trailing={trailing}
      />
    )
  }

  return (
    <aside
      aria-label="Điều hướng"
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xs border border-default bg-surface shadow-xs transition-[width] duration-(--mira-duration-base) ease-standard',
        collapsed ? 'w-12' : 'w-[224px]'
      )}
    >
      <div
        className={cn(
          'flex h-7 shrink-0 items-center border-b border-default bg-subtle/30',
          collapsed ? 'justify-center' : 'justify-end pr-xs'
        )}
      >
        <Tip label={toggleLabel} side={collapsed ? 'right' : 'bottom'}>
          <CompactButton
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
            icon={<SidebarMinimalisticIcon size={ICON.sm} />}
          />
        </Tip>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-2xs overflow-y-auto p-xs">
        <Item
          collapsed={collapsed}
          label="Tìm"
          onClick={onOpenPalette}
          leading={<MinimalisticMagnifierIcon size={ICON.sm} aria-hidden="true" />}
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
          'flex shrink-0 border-t border-default p-xs',
          collapsed ? 'flex-col items-stretch gap-2xs' : 'items-center gap-2xs'
        )}
      >
        <Item
          collapsed={collapsed}
          label="Cài đặt"
          ariaLabel={connectionNotice ? `Cài đặt — ${connectionNotice}` : undefined}
          active={settingsOpen}
          onClick={onOpenSettings}
          leading={<SettingsIcon size={ICON.sm} aria-hidden="true" />}
          trailing={
            connectionNotice ? (
              <span
                title={connectionNotice}
                className={cn(
                  'size-2 shrink-0 rounded-full bg-warning',
                  collapsed && 'absolute top-1 right-1'
                )}
                aria-hidden="true"
              />
            ) : null
          }
          className={collapsed ? 'relative' : 'flex-1'}
        />
        <Tip label={themeLabel} side={collapsed ? 'right' : 'top'}>
          <CompactButton
            aria-label={themeLabel}
            onClick={onToggleTheme}
            className={collapsed ? 'mx-auto' : undefined}
            icon={theme === 'dark' ? <SunIcon size={ICON.sm} /> : <MoonIcon size={ICON.sm} />}
          />
        </Tip>
      </div>
    </aside>
  )
}

/** Một mục điều hướng: hiển thị biểu tượng cùng nhãn chữ, hoặc chỉ biểu tượng kèm tooltip khi thanh bên thu gọn. */
function Item({
  collapsed,
  label,
  ariaLabel,
  active = false,
  onClick,
  leading,
  trailing,
  className,
  children
}: {
  collapsed: boolean
  label: string
  ariaLabel?: string
  active?: boolean
  onClick(): void
  leading: ReactNode
  trailing?: ReactNode
  className?: string
  children?: ReactNode
}): JSX.Element {
  const item = (
    <NavItem
      active={active}
      onClick={onClick}
      aria-label={ariaLabel ?? (collapsed ? label : undefined)}
      leading={leading}
      trailing={trailing}
      className={className}
    >
      {collapsed ? null : (children ?? label)}
    </NavItem>
  )
  return collapsed ? (
    <Tip label={label} side="right">
      {item}
    </Tip>
  ) : (
    item
  )
}
