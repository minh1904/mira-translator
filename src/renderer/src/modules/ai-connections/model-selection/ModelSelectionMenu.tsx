import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { AccountUsageChip } from '../settings/AccountsPage'
import { Popover } from '@base-ui/react/popover'
import {
  AddCircleIcon,
  AltArrowRightIcon,
  CheckIcon,
  MinimalisticMagnifierIcon,
  RefreshIcon,
  RestartIcon,
  SettingsIcon,
  StarIcon,
  StarFilledIcon
} from '@renderer/components/ui/reicon'

import type { ConnectionView } from '../../../../../shared/contracts/aiConnections'
import { THINKING_LEVELS, type ModelEntryView } from '../../../../../shared/contracts/modelSettings'
import { cn } from '../../../lib/cn'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { Disclosure } from '../../../components/ui/Disclosure'
import { menuItemClass, menuSurfaceClass } from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { Input } from '../../../components/ui/Input'
import { ListOption } from '../../../components/ui/ListOption'
import { PickerTrigger } from '../../../components/ui/PickerTrigger'
import { Switch } from '../../../components/ui/Switch'
import {
  buildMenuRows,
  favoriteKey,
  stepModelRow,
  THINKING_TAGS,
  type MenuRow
} from './modelMenuModel'
import {
  DEFAULT_THINKING_LABEL,
  THINKING_LABELS,
  thinkingChoiceOf,
  type ThinkingChoice
} from './modelSettingsForm'

/**
 * Menu để chọn **mục model và mức suy luận**: bao gồm ô tìm kiếm, nhóm Yêu thích,
 * nhóm theo kết nối, nhãn mức suy luận đang đặt, menu con cấu hình mức suy luận, và các lối tắt cài đặt ở cuối.
 * Dùng chung ở ô soạn chat và hộp thoại dịch để đảm bảo tính nhất quán.
 *
 * Ô tìm kiếm giữ focus khi menu mở và điều khiển dòng đang chọn (kiểu combobox).
 */

export interface ModelSelection {
  connectionId: string
  entryId: string
}

export interface ModelSelectionMenuProps {
  /** Các kết nối dùng được (đang bật). Kết nối chưa có mục nào không hiện. */
  connections: readonly ConnectionView[]
  selected: ModelSelection | null
  /** Chọn một mục, giữ nguyên mức suy luận của nó. */
  onSelect(selection: ModelSelection): void
  /** Chọn một mức: chọn mục đó và ghi mức vào cài đặt của mục. */
  onSelectThinking(selection: ModelSelection, choice: ThinkingChoice): void
  /** Gọi mỗi khi menu mở, để nơi dùng nạp lại danh sách nếu nó sống lâu. */
  onOpen?(): void
  disabled?: boolean
  /** `compact` là pill trên ô soạn chat; `field` là một ô đủ rộng trong hộp thoại. */
  variant?: 'compact' | 'field'
  /** Nhãn đọc được cho trình đọc màn hình, ví dụ "Model để dịch". */
  label: string
  /** Model chọn riêng khác với model chính trong Cài đặt: hiển thị dấu chấm nổi bật trên pill. */
  overridesMain?: boolean
  /** "Dùng mặc định trong Cài đặt": bỏ model chọn riêng của phiên chat. Chỉ hiển thị khi `overridesMain` là true. */
  onUseDefault?(): void
  /** "Tải lại model": hỏi lại nhà cung cấp. */
  onRefresh?(): void
  /** Đang hỏi nhà cung cấp: nút "Tải lại model" quay và tạm khóa. */
  refreshing?: boolean
  /** Id kết nối → model nhà cung cấp liệt kê mà chưa có mục; hiện ở cuối nhóm, bấm để thêm. Cần `onAddCustom`. */
  suggestions?: ReadonlyMap<string, readonly string[]>
  /** "Thêm model tùy chỉnh…" và các model gợi ý: thêm mục với model id này vào kết nối. */
  onAddCustom?(connectionId: string, modelId: string): Promise<ModelSelection | null>
  /** "Sửa danh sách model…" / "Thêm nhà cung cấp": mở Cài đặt tại kết nối đó hoặc trang ban đầu. */
  onOpenSettings?(connectionId: string | null): void
  /** Trạng thái mở menu điều khiển từ bên ngoài (dành cho phím tắt Ctrl+Shift+M). */
  open?: boolean
  onOpenChange?(open: boolean): void
  className?: string
}

const FAVORITES_KEY = 'mira.model-favorites'
const COLLAPSED_KEY = 'mira.model-groups-collapsed'

/** Tập hợp model yêu thích lưu theo thiết bị; trả về tập rỗng nếu bộ nhớ chưa sẵn sàng. */
function usePersistentSet(key: string): [Set<string>, (item: string) => void] {
  const [items, setItems] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
    } catch {
      return new Set()
    }
  })
  const toggle = (item: string): void =>
    setItems((current) => {
      const next = new Set(current)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      try {
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch {
        // Trạng thái thu gọn nhóm chỉ lưu tạm trong phiên làm việc, không lưu cố định xuống đĩa.
      }
      return next
    })
  return [items, toggle]
}

/** Nút hành động ở chân menu: nút dạng phẳng trải dài toàn bộ chiều rộng hàng. */
const FOOTER_ACTION = 'w-full justify-start'

/** Cấu hình suy luận cho một mục model: bật/tắt và chọn mức độ suy luận. */
export function ThinkingPanel({
  entry,
  onChoose
}: {
  entry: ModelEntryView
  onChoose(choice: ThinkingChoice): void
}): JSX.Element {
  const levels = THINKING_LEVELS.filter(
    (level) => level !== 'off' && entry.capability.thinkingLevels.includes(level)
  )
  const canTurnOff = entry.capability.thinkingLevels.includes('off')
  const current = thinkingChoiceOf(entry.settings)
  return (
    <div className="flex w-48 flex-col">
      {canTurnOff && (
        <>
          <span className="px-2 pt-1 pb-0.5 text-body-xs font-medium text-muted uppercase">
            Tùy chọn
          </span>
          <label className={cn(menuItemClass, 'justify-between')}>
            Suy luận
            <Switch
              aria-label="Suy luận"
              checked={current !== 'off'}
              onCheckedChange={(checked) => onChoose(checked ? 'default' : 'off')}
            />
          </label>
          <div className="-mx-1 my-1 h-px bg-line" />
        </>
      )}
      <span className="px-2 pt-1 pb-0.5 text-body-xs font-medium text-muted uppercase">Mức</span>
      <div role="listbox" aria-label="Mức suy luận" className="flex flex-col">
        {levels.map((level) => (
          <ListOption
            key={level}
            selected={current === level}
            className="justify-between"
            onClick={() => onChoose(level)}
          >
            {THINKING_LABELS[level]}
            {current === level && <CheckIcon size={ICON.xs} />}
          </ListOption>
        ))}
        <ListOption
          selected={current === 'default'}
          className="justify-between"
          onClick={() => onChoose('default')}
        >
          {DEFAULT_THINKING_LABEL}
          {current === 'default' && <CheckIcon size={ICON.xs} />}
        </ListOption>
      </div>
    </div>
  )
}

export function ModelSelectionMenu({
  connections,
  selected,
  onSelect,
  onSelectThinking,
  onOpen,
  disabled = false,
  variant = 'compact',
  label,
  overridesMain = false,
  onUseDefault,
  onRefresh,
  refreshing = false,
  suggestions,
  onAddCustom,
  onOpenSettings,
  open: openProp,
  onOpenChange,
  className
}: ModelSelectionMenuProps): JSX.Element {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean): void => {
    setOpenState(next)
    onOpenChange?.(next)
    if (next) onOpen?.()
  }
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [favorites, toggleFavorite] = usePersistentSet(FAVORITES_KEY)
  const [collapsed, toggleCollapsed] = usePersistentSet(COLLAPSED_KEY)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [flyout, setFlyout] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const input = useRef<HTMLInputElement | null>(null)

  const canAdd = onAddCustom !== undefined
  const rows = useMemo(
    () =>
      adding
        ? []
        : buildMenuRows(connections, query, favorites, collapsed, canAdd ? suggestions : undefined),
    [adding, connections, query, favorites, collapsed, canAdd, suggestions]
  )

  const chosenConnection = connections.find(
    (connection) => connection.id === selected?.connectionId
  )
  const chosen = chosenConnection?.models.find((entry) => entry.id === selected?.entryId)
  const withEntries = connections.filter(
    (connection) => connection.enabled && connection.models.length > 0
  )

  // Khi đóng menu, xóa trắng nội dung tìm kiếm để lần mở tiếp theo hiển thị trạng thái ban đầu.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery('')
      setAdding(false)
      setFlyout(null)
      setActiveId(null)
    }
  }

  // Hàng được chọn qua bàn phím: hàng vừa di chuyển tới, hoặc mục đang chọn, hoặc mục đầu tiên.
  const chosenIndex = rows.findIndex(
    (row) =>
      row.type === 'model' &&
      row.connection.id === selected?.connectionId &&
      row.entry.id === selected?.entryId
  )
  const movedIndex = activeId === null ? -1 : rows.findIndex((row) => row.id === activeId)
  const active =
    movedIndex >= 0 ? movedIndex : chosenIndex >= 0 ? chosenIndex : stepModelRow(rows, -1, 1)
  const activeRow = rows[active]
  useEffect(() => {
    if (activeRow) rowRefs.current.get(activeRow.id)?.scrollIntoView({ block: 'nearest' })
  }, [activeRow])

  function choose(row: Extract<MenuRow, { type: 'model' }>, choice?: ThinkingChoice): void {
    const here = { connectionId: row.connection.id, entryId: row.entry.id }
    if (choice === undefined) onSelect(here)
    else onSelectThinking(here, choice)
    setOpen(false)
  }

  async function addModel(connectionId: string, modelId: string): Promise<void> {
    const added = await onAddCustom?.(connectionId, modelId)
    if (added) {
      onSelect(added)
      setOpen(false)
    }
  }

  function addCustom(): Promise<void> {
    const modelId = query.trim()
    const connectionId = selected?.connectionId ?? withEntries[0]?.id
    return modelId && connectionId ? addModel(connectionId, modelId) : Promise.resolve()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (adding) {
      if (event.key === 'Enter') {
        event.preventDefault()
        void addCustom()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setFlyout(null)
      const next = stepModelRow(rows, active, event.key === 'ArrowDown' ? 1 : -1)
      setActiveId(rows[next]?.id ?? null)
    } else if (event.key === 'Enter' && activeRow?.type === 'suggest') {
      event.preventDefault()
      void addModel(activeRow.connection.id, activeRow.model)
    } else if (event.key === 'Enter' && activeRow?.type === 'model') {
      event.preventDefault()
      if (event.shiftKey) toggleFavorite(favoriteKey(activeRow.connection.id, activeRow.entry.id))
      else choose(activeRow)
    } else if (event.key === 'ArrowRight' && activeRow?.type === 'model' && query === '') {
      event.preventDefault()
      setFlyout(activeRow.id)
    } else if (event.key === 'ArrowLeft' && flyout) {
      event.preventDefault()
      setFlyout(null)
    }
  }

  const text = chosen ? chosen.name : 'chưa có model'
  const tag = chosen?.settings.thinking ? THINKING_TAGS[chosen.settings.thinking] : null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        aria-label={label + ': ' + text}
        title={chosenConnection ? chosenConnection.name + ' · ' + text : label}
        render={
          <PickerTrigger
            variant={variant === 'field' ? 'field' : 'ghost'}
            value={text}
            tag={tag}
            className={className}
            mark={
              overridesMain && (
                <span
                  role="img"
                  aria-label="Khác model chính"
                  className="size-1.5 shrink-0 rounded-full bg-inverted"
                />
              )
            }
          />
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="z-(--mira-z-dropdown)"
          side={variant === 'compact' ? 'top' : 'bottom'}
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            initialFocus={input}
            className={cn(menuSurfaceClass, 'flex w-80 flex-col')}
          >
            <Input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls="model-menu-list"
              aria-activedescendant={activeRow ? 'model-row-' + activeRow.id : undefined}
              aria-label={adding ? 'Id model mới' : 'Tìm model'}
              placeholder={adding ? 'Gõ id model, ví dụ openai/gpt-5.5' : 'Tìm model'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              leftIcon={<MinimalisticMagnifierIcon size={ICON.sm} aria-hidden="true" />}
              className="mb-1"
            />

            {!adding && (
              <div
                id="model-menu-list"
                role="listbox"
                aria-label={label}
                className="max-h-80 overflow-y-auto py-1"
              >
                {rows.length === 0 && (
                  <span className="block px-2 py-1.5 text-body-xs text-muted">
                    {withEntries.length === 0 ? 'Chưa có model nào.' : 'Không có model nào khớp.'}
                  </span>
                )}
                {rows.map((row, index) => {
                  if (row.type === 'header') {
                    const connectionId = row.connectionId
                    return (
                      // Nhấn vào tiêu đề nhóm không làm mất focus của ô tìm kiếm.
                      // biome-ignore lint/a11y/noStaticElementInteractions: chỉ giữ focus tại ô tìm kiếm.
                      <div
                        key={row.id}
                        className="px-2 pt-1.5 pb-0.5"
                        onMouseDown={(event) => event.preventDefault()}
                      >
                        {connectionId ? (
                          <Disclosure
                            open={!row.collapsed}
                            onOpenChange={() => toggleCollapsed(connectionId)}
                            tabIndex={-1}
                            className="font-medium"
                            label={
                              <span className="flex items-center gap-1">
                                {row.label}
                                <AccountUsageChip
                                  connection={connections.find((item) => item.id === connectionId)}
                                />
                              </span>
                            }
                          />
                        ) : (
                          <span className="block text-body-xs font-medium text-muted">
                            {row.label}
                          </span>
                        )}
                      </div>
                    )
                  }
                  if (row.type === 'suggest') {
                    return (
                      // Cùng cách hoạt động như hàng model: di chuột chỉ cập nhật con trỏ hàng, nhấn không làm mất focus ô tìm kiếm.
                      // biome-ignore lint/a11y/noStaticElementInteractions: di chuột chỉ cập nhật con trỏ hàng.
                      <div
                        key={row.id}
                        ref={(element) => {
                          if (element) rowRefs.current.set(row.id, element)
                          else rowRefs.current.delete(row.id)
                        }}
                        onMouseEnter={() => setActiveId(row.id)}
                        onMouseDown={(event) => event.preventDefault()}
                      >
                        <ListOption
                          id={'model-row-' + row.id}
                          tabIndex={-1}
                          selected={index === active}
                          onClick={() => void addModel(row.connection.id, row.model)}
                          className="pl-8"
                        >
                          <span className="min-w-0 flex-1 truncate text-subtle">{row.model}</span>
                          <AddCircleIcon size={ICON.xs} className="shrink-0 text-subtle" />
                        </ListOption>
                      </div>
                    )
                  }
                  const isSelected =
                    selected?.connectionId === row.connection.id &&
                    selected.entryId === row.entry.id
                  const level = row.entry.settings.thinking
                  const hasLevels = row.entry.capability.thinkingLevels.length > 0
                  return (
                    <Popover.Root
                      key={row.id}
                      open={flyout === row.id}
                      onOpenChange={(next) => setFlyout(next ? row.id : null)}
                    >
                      {/* Tùy chọn trải dài toàn bộ hàng; ngôi sao yêu thích và nút chọn mức suy luận nằm đè lên hai đầu.
                          Nhấn vào các phần tử này vẫn giữ nguyên focus tại ô tìm kiếm. */}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: di chuột chỉ cập nhật con trỏ hàng. */}
                      <div
                        className="relative"
                        ref={(element) => {
                          if (element) rowRefs.current.set(row.id, element)
                          else rowRefs.current.delete(row.id)
                        }}
                        onMouseEnter={() => setActiveId(row.id)}
                        onMouseDown={(event) => event.preventDefault()}
                      >
                        <ListOption
                          id={'model-row-' + row.id}
                          tabIndex={-1}
                          selected={index === active}
                          onClick={() => choose(row)}
                          className="pr-8 pl-8"
                        >
                          <span className="min-w-0 flex-1 truncate text-default">
                            {row.entry.name}
                          </span>
                          {level && (
                            <span className="shrink-0 rounded-xs border border-default px-1 text-body-xs leading-tight text-subtle">
                              {THINKING_TAGS[level]}
                            </span>
                          )}
                          {isSelected && (
                            <CheckIcon size={ICON.xs} className="shrink-0 text-default" />
                          )}
                        </ListOption>
                        <CompactButton
                          tabIndex={-1}
                          aria-label={row.favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                          onClick={() =>
                            toggleFavorite(favoriteKey(row.connection.id, row.entry.id))
                          }
                          className="absolute top-1 left-1"
                          icon={
                            row.favorite ? (
                              <StarFilledIcon
                                size={ICON.sm}
                                weight="Filled"
                                className="text-warning"
                              />
                            ) : (
                              <StarIcon size={ICON.sm} />
                            )
                          }
                        />
                        <Popover.Trigger
                          openOnHover
                          delay={120}
                          disabled={
                            !hasLevels && !row.entry.capability.thinkingLevels.includes('off')
                          }
                          render={
                            <CompactButton
                              tabIndex={-1}
                              aria-label={'Suy luận của ' + row.entry.name}
                              className="absolute top-1 right-1"
                              icon={<AltArrowRightIcon size={ICON.sm} />}
                            />
                          }
                        />
                      </div>
                      <Popover.Portal>
                        <Popover.Positioner
                          className="z-(--mira-z-dropdown)"
                          // Nút pill trên khung chat nằm sát mép phải cửa sổ: mở menu mức suy luận sang bên trái.
                          side={variant === 'compact' ? 'left' : 'right'}
                          align="start"
                          sideOffset={8}
                        >
                          <Popover.Popup className={menuSurfaceClass}>
                            <ThinkingPanel
                              entry={row.entry}
                              onChoose={(choice) => choose(row, choice)}
                            />
                          </Popover.Popup>
                        </Popover.Positioner>
                      </Popover.Portal>
                    </Popover.Root>
                  )
                })}
              </div>
            )}

            <div className="-mx-1 my-1 h-px bg-line" />
            <div className="flex flex-col">
              {adding ? (
                <Button
                  variant="ghost"
                  className={FOOTER_ACTION}
                  leftIcon={<AddCircleIcon size={ICON.sm} />}
                  onClick={() => void addCustom()}
                >
                  Thêm {query.trim() ? '“' + query.trim() + '”' : 'model'}
                </Button>
              ) : (
                <>
                  {overridesMain && onUseDefault && (
                    <Button
                      variant="ghost"
                      className={FOOTER_ACTION}
                      leftIcon={<RestartIcon size={ICON.sm} />}
                      onClick={() => {
                        onUseDefault()
                        setOpen(false)
                      }}
                    >
                      Dùng mặc định trong Cài đặt
                    </Button>
                  )}
                  {onRefresh && (
                    <Button
                      variant="ghost"
                      className={FOOTER_ACTION}
                      disabled={refreshing}
                      leftIcon={
                        <RefreshIcon
                          size={ICON.sm}
                          className={refreshing ? 'motion-safe:animate-spin' : undefined}
                        />
                      }
                      onClick={onRefresh}
                    >
                      Tải lại model
                    </Button>
                  )}
                  {onAddCustom && withEntries.length > 0 && (
                    <Button
                      variant="ghost"
                      className={FOOTER_ACTION}
                      leftIcon={<AddCircleIcon size={ICON.sm} />}
                      onClick={() => {
                        setAdding(true)
                        setQuery('')
                        input.current?.focus()
                      }}
                    >
                      Thêm model tùy chỉnh…
                    </Button>
                  )}
                  {onOpenSettings && (
                    <Button
                      variant="ghost"
                      className={FOOTER_ACTION}
                      leftIcon={<SettingsIcon size={ICON.sm} />}
                      onClick={() => {
                        setOpen(false)
                        onOpenSettings(
                          withEntries.length > 0 ? (selected?.connectionId ?? null) : null
                        )
                      }}
                    >
                      {withEntries.length > 0 ? 'Sửa danh sách model…' : 'Thêm nhà cung cấp'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
