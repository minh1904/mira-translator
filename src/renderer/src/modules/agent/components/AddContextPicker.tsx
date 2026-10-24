import { Popover } from '@base-ui/react/popover'
import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import {
  AGENT_ATTACHMENT_LIMIT,
  type AgentAttachment,
  type AgentContextSearchGroup
} from '../../../../../shared/contracts/agent'
import { CompactButton } from '../../../components/ui/CompactButton'
import { menuSurfaceClass } from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { Input } from '../../../components/ui/Input'
import { ListOption } from '../../../components/ui/ListOption'
import { AddIcon, MinimalisticMagnifierIcon } from '../../../components/ui/reicon'
import { attachmentKey } from './composeContext'

export const GROUP_LABELS: Record<AgentContextSearchGroup['kind'], string> = {
  work: 'Tác phẩm',
  chapter: 'Chương',
  glossary: 'Glossary đã duyệt',
  addressing: 'Xưng hô đã duyệt'
}

/** Rows of the picker in order, without what the row already holds. */
export function pickerRows(
  groups: AgentContextSearchGroup[],
  taken: ReadonlySet<string>
): Array<{
  group: AgentContextSearchGroup['kind']
  attachment: AgentAttachment
  detail: string | null
}> {
  return groups.flatMap((group) =>
    group.items
      .filter((item) => !taken.has(attachmentKey(item.attachment)))
      .map((item) => ({ group: group.kind, ...item }))
  )
}

export interface AddContextPickerProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** The open work, whose chapters and entries the picker offers. */
  workId?: string
  /** Keys of the chips already in the row. */
  taken: ReadonlySet<string>
  /** How many chips the user added; at the limit the picker says so and adds nothing. */
  count: number
  onPick(attachment: AgentAttachment): void
  /** Off while a turn runs: a message typed then carries no context of its own. */
  disabled?: boolean
}

/**
 * Nút + "Thêm ngữ cảnh" đứng đầu thanh dưới ô nhập (C4): mở picker phía trên nó, có ô tìm, nhóm
 * tác phẩm, chương, glossary và xưng hô đã duyệt; Lên/Xuống chọn hàng, Enter thêm, Esc đóng.
 */
export function AddContextPicker({
  open,
  onOpenChange,
  workId,
  taken,
  count,
  onPick,
  disabled = false
}: AddContextPickerProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<AgentContextSearchGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const full = count >= AGENT_ATTACHMENT_LIMIT

  useEffect(() => {
    if (!open) return
    const search = window.mira?.agent?.context?.search
    if (!search) return
    let current = true
    void search({ query, ...(workId ? { workId } : {}) }).then((res) => {
      if (!current) return
      if (res.ok) {
        setGroups(res.value)
        setError(null)
      } else {
        setError(res.error.message)
      }
      setActive(0)
    })
    return () => {
      current = false
    }
  }, [open, query, workId])

  const rows = pickerRows(groups, taken)
  const pick = (index: number): void => {
    const row = rows[index]
    if (!row || full) return
    onPick(row.attachment)
    setQuery('')
    onOpenChange(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (rows.length === 0 ? 0 : (index + step + rows.length) % rows.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(active)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        disabled={disabled}
        title="Thêm ngữ cảnh (Ctrl+/)"
        render={
          <CompactButton
            aria-label="Thêm ngữ cảnh"
            variant="ghost"
            icon={<AddIcon size={ICON.xs} />}
            className="size-[20px] !min-h-[20px] !min-w-[20px] shrink-0 p-0"
          />
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="z-(--mira-z-dropdown)"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup initialFocus={input} className={`${menuSurfaceClass} flex w-80 flex-col`}>
            <Input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls="agent-context-list"
              aria-activedescendant={rows[active] ? `agent-context-${active}` : undefined}
              aria-label="Tìm ngữ cảnh"
              placeholder="Tìm tác phẩm, chương, glossary, xưng hô"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              leftIcon={<MinimalisticMagnifierIcon size={ICON.sm} aria-hidden="true" />}
              className="mb-1"
            />
            {full && (
              <p role="status" className="m-0 px-2 py-1 text-body-xs text-muted">
                Đã đủ {AGENT_ATTACHMENT_LIMIT} ngữ cảnh. Bỏ bớt chip để thêm mục khác.
              </p>
            )}
            {error && (
              <p role="alert" className="m-0 px-2 py-1 text-body-xs text-error">
                {error}
              </p>
            )}
            <div
              id="agent-context-list"
              role="listbox"
              aria-label="Ngữ cảnh có thể thêm"
              className="max-h-80 overflow-y-auto py-1"
            >
              {rows.length === 0 && !error && (
                <span className="block px-2 py-1.5 text-body-xs text-muted">
                  Không có mục nào khớp.
                </span>
              )}
              {rows.map((row, index) => (
                <div key={attachmentKey(row.attachment)}>
                  {(index === 0 || rows[index - 1]!.group !== row.group) && (
                    <span className="block px-2 pt-1.5 pb-0.5 text-body-xs font-medium text-muted">
                      {GROUP_LABELS[row.group]}
                    </span>
                  )}
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: di chuột chỉ cập nhật hàng đang chọn. */}
                  <div
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <ListOption
                      id={`agent-context-${index}`}
                      tabIndex={-1}
                      selected={index === active}
                      disabled={full}
                      multiline={row.detail !== null}
                      onClick={() => pick(index)}
                    >
                      <span className="w-full truncate">{row.attachment.label}</span>
                      {row.detail && (
                        <span className="w-full truncate text-body-xs text-muted">
                          {row.detail}
                        </span>
                      )}
                    </ListOption>
                  </div>
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
