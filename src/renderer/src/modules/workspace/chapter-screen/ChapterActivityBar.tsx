import type { JSX, ReactNode } from 'react'
import {
  BookBookmarkIcon,
  ChecklistMinimalisticIcon,
  DocumentTextIcon,
  MinimalisticMagnifierIcon,
  ShieldWarningIcon
} from '@renderer/components/ui/reicon'

import { ActivityBarItem } from '../../../components/ui/ActivityBarItem'
import { ICON } from '../../../components/ui/icon'
import { Tip } from '../../../components/ui/Tooltip'
import { SOON_LABEL } from '../../../lib/mockFeatures'
import type { ChapterPanelId } from '../store/workspaceStore'

interface PanelEntry {
  id: ChapterPanelId
  label: string
  icon: ReactNode
  /** Panel còn là màn minh hoạ. */
  soon?: boolean
}

const icon = (Icon: typeof DocumentTextIcon): ReactNode => (
  <Icon size={ICON.md} aria-hidden="true" />
)

/** Các panel của sidebar màn dịch chương, theo thứ tự trên activity bar. */
export const CHAPTER_PANELS: ReadonlyArray<PanelEntry> = [
  { id: 'chapters', label: 'Chương', icon: icon(DocumentTextIcon) },
  { id: 'search', label: 'Tìm và thay', icon: icon(MinimalisticMagnifierIcon), soon: true },
  { id: 'context', label: 'Ngữ cảnh', icon: icon(BookBookmarkIcon), soon: true },
  { id: 'checks', label: 'Kiểm tra', icon: icon(ShieldWarningIcon), soon: true },
  { id: 'jobs', label: 'Tác vụ', icon: icon(ChecklistMinimalisticIcon), soon: true }
]

export interface ChapterActivityBarProps {
  active: ChapterPanelId
  /** Sidebar đang hiện; khi ẩn thì không mục nào sáng. */
  open: boolean
  onSelect(panel: ChapterPanelId): void
  /** Số đếm trên từng mục, ví dụ số lỗi kiểm tra. */
  badges?: Partial<Record<ChapterPanelId, number>>
}

/**
 * Activity bar của màn dịch chương: mỗi nút đổi nội dung sidebar bên cạnh, hai editor giữ nguyên.
 * Bấm lại nút của panel đang mở thì ẩn sidebar (Ctrl+B cũng vậy).
 */
export function ChapterActivityBar({
  active,
  open,
  onSelect,
  badges
}: ChapterActivityBarProps): JSX.Element {
  return (
    <nav aria-label="Panel bên" className="flex w-10 shrink-0 flex-col overflow-y-auto">
      {CHAPTER_PANELS.map((panel) => {
        const count = badges?.[panel.id] ?? 0
        const name = panel.soon ? `${panel.label} · ${SOON_LABEL}` : panel.label
        return (
          <Tip key={panel.id} label={name} side="right">
            <ActivityBarItem
              aria-label={count > 0 ? `${name} (${count})` : name}
              icon={panel.icon}
              active={open && panel.id === active}
              badge={count}
              onClick={() => onSelect(panel.id)}
            />
          </Tip>
        )
      })}
    </nav>
  )
}
