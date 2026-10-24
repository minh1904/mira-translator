import { useState, type JSX } from 'react'
import type {
  AgentTaskDetailView,
  AgentTaskSummary
} from '../../../../../shared/contracts/agentTask'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ButtonGroup } from '../../../components/ui/ButtonGroup'
import { CompactButton } from '../../../components/ui/CompactButton'
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { MenuDotsIcon } from '../../../components/ui/reicon'
import {
  CHAPTER_FILTERS,
  type ChapterFilter,
  type ChapterItem,
  collapseCompleted,
  defaultChapterFilter,
  filterChapters
} from '../model/chapters'
import { useTaskStore } from '../store/taskStore'
import { durationLabel, ITEM_LABELS, REASON_LABELS, type TaskActions, usageBrief } from './taskView'

function ChapterRow({
  task,
  item,
  onOpenChapter,
  onShowRuns
}: {
  task: AgentTaskSummary
  item: ChapterItem
  onOpenChapter: TaskActions['onOpenChapter']
  onShowRuns: (itemId: string) => void
}): JSX.Element {
  const control = useTaskStore((s) => s.control)
  const [showInstruction, setShowInstruction] = useState(false)
  const look = ITEM_LABELS[item.state]
  // An empty instruction is "none": the row stays quiet instead of saying so twelve times.
  const instruction = item.instruction || null
  const canSkip =
    item.state === 'queued' || item.state === 'waiting_user' || item.state === 'failed'
  // A recorded error carries its own "skip refused" in the error block; only an unexplained one needs it here.
  const skipRefused = item.state === 'failed' && item.reason === 'refused' && !item.lastRun?.error
  return (
    <li className="flex flex-wrap items-center gap-x-xs gap-y-2xs py-2xs text-body-sm">
      <span className="min-w-0 flex-1 basis-40 truncate" title={item.chapterLabel}>
        {item.chapterLabel}
      </span>
      {instruction && (
        <Button
          variant="ghost"
          aria-expanded={showInstruction}
          onClick={() => setShowInstruction((open) => !open)}
        >
          Chỉ dẫn
        </Button>
      )}
      {item.lastRun && (
        <span className="font-mono text-body-xs whitespace-nowrap text-muted tabular-nums">
          {item.lastRun.endedAt === null
            ? 'đang chạy'
            : durationLabel(item.lastRun.endedAt - item.lastRun.startedAt)}{' '}
          · {usageBrief(item.lastRun.usage)}
        </span>
      )}
      {item.progress && (
        <span className="text-body-xs whitespace-nowrap text-muted tabular-nums">
          {item.progress.applied}/{item.progress.total} câu
          {item.skippedSegments.length > 0 ? ` · bỏ qua ${item.skippedSegments.length} đoạn` : ''}
        </span>
      )}
      <Badge color={look.color} variant="plain" dot>
        {look.label}
        {item.reason ? ` · ${REASON_LABELS[item.reason]}` : ''}
      </Badge>
      <MenuRoot>
        <MenuTrigger
          render={
            <CompactButton
              aria-label={`Thao tác với ${item.chapterLabel}`}
              icon={<MenuDotsIcon size={ICON.sm} />}
            />
          }
        />
        <MenuPopup>
          <MenuItem onClick={() => onOpenChapter(task.workId, item.chapterId)}>Mở chương</MenuItem>
          {item.lastRun && (
            <MenuItem onClick={() => onShowRuns(item.id)}>Xem các lần chạy</MenuItem>
          )}
          {skipRefused && (
            <MenuItem onClick={() => void control(task.id, 'skip_refused', item.id)}>
              Bỏ qua đoạn bị từ chối
            </MenuItem>
          )}
          {canSkip && (
            <MenuItem onClick={() => void control(task.id, 'skip_item', item.id)}>
              Bỏ qua chương
            </MenuItem>
          )}
        </MenuPopup>
      </MenuRoot>
      {instruction && showInstruction && (
        <span className="basis-full max-w-[68ch] wrap-anywhere text-body-xs text-muted">
          Chỉ dẫn: {instruction}
        </span>
      )}
    </li>
  )
}

/** Finished chapters in a row, folded into one line that opens on request. */
function DoneGroup({
  task,
  items,
  onOpenChapter,
  onShowRuns
}: {
  task: AgentTaskSummary
  items: ChapterItem[]
  onOpenChapter: TaskActions['onOpenChapter']
  onShowRuns: (itemId: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const first = items[0]?.chapterLabel ?? ''
  const last = items.at(-1)?.chapterLabel ?? ''
  return (
    <li className="flex flex-col py-2xs">
      <Button
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={`${first} → ${last}`}
        className="self-start font-normal"
      >
        <span className="tabular-nums">{items.length} chương xong</span>
      </Button>
      {open && (
        <ol className="m-0 flex list-none flex-col divide-y divide-subtle p-0 pl-md">
          {items.map((item) => (
            <ChapterRow
              key={item.id}
              task={task}
              item={item}
              onOpenChapter={onOpenChapter}
              onShowRuns={onShowRuns}
            />
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * The chapters of a task, one row each. A task with failures opens on "Lỗi"; finished chapters in a row
 * are one line; what a chapter can do sits in its menu, so twelve done chapters are not twenty-four buttons.
 */
export function ChaptersPanel({
  task,
  detail,
  onOpenChapter,
  onShowRuns
}: {
  task: AgentTaskSummary
  detail: AgentTaskDetailView
  onOpenChapter: TaskActions['onOpenChapter']
  onShowRuns: (itemId: string) => void
}): JSX.Element {
  const [filter, setFilter] = useState<ChapterFilter>(() => defaultChapterFilter(detail.items))
  const shown = filterChapters(detail.items, filter)
  const rows =
    filter === 'all'
      ? collapseCompleted(shown)
      : shown.map((item) => ({ kind: 'item' as const, item }))
  return (
    <div className="flex flex-col gap-xs">
      <ButtonGroup
        label="Lọc chương theo trạng thái"
        value={filter}
        options={CHAPTER_FILTERS}
        onChange={(next) => setFilter(next as ChapterFilter)}
        className="self-start"
      />
      {shown.length === 0 ? (
        <p className="m-0 text-body-sm text-muted">Không có chương nào ở bộ lọc này.</p>
      ) : (
        <ol
          aria-label="Các chương của tác vụ"
          className="m-0 flex list-none flex-col divide-y divide-subtle p-0"
        >
          {rows.map((row) =>
            row.kind === 'done' ? (
              <DoneGroup
                key={row.key}
                task={task}
                items={row.items}
                onOpenChapter={onOpenChapter}
                onShowRuns={onShowRuns}
              />
            ) : (
              <ChapterRow
                key={row.item.id}
                task={task}
                item={row.item}
                onOpenChapter={onOpenChapter}
                onShowRuns={onShowRuns}
              />
            )
          )}
        </ol>
      )}
    </div>
  )
}
