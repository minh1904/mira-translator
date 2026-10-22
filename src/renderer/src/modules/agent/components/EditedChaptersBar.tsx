import { useState, type JSX } from 'react'
import type { AgentEditedChapter, ResolvedTarget } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { AltArrowDownIcon, AltArrowRightIcon } from '../../../components/ui/reicon'
import { editKey, useAgentStore } from '../store/agentStore'

export const editedLabel = (count: number): string =>
  count === 1 ? 'Đã sửa 1 chương' : `Đã sửa ${count} chương`

/**
 * Thanh "Đã sửa N chương" phía trên ô nhập (C20), như danh sách tệp đã đổi của VS Code: mỗi chương
 * agent đã ghi mà chưa giữ có Xem, Giữ và Hoàn tác; đầu thanh có Giữ tất cả và Hoàn tác tất cả. Ẩn khi
 * không còn chương nào.
 */
export function EditedChaptersBar({
  onOpenTarget
}: {
  onOpenTarget?: (target: ResolvedTarget) => void
}): JSX.Element | null {
  const rows = useAgentStore((s) => s.editedChapters)
  const conflicts = useAgentStore((s) => s.editConflicts)
  const keepEdits = useAgentStore((s) => s.keepEdits)
  const undoEdits = useAgentStore((s) => s.undoEdits)
  const busy = useAgentStore((s) => s.isStreaming)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  if (rows.length === 0) return null

  const act = (run: () => Promise<boolean>): void => {
    setWorking(true)
    void run().finally(() => setWorking(false))
  }
  const openRow = (row: AgentEditedChapter): void =>
    onOpenTarget?.({
      kind: 'chapter',
      workId: row.workId,
      workLabel: row.workLabel,
      chapterId: row.chapterId,
      chapterLabel: row.chapterLabel
    })

  return (
    <section
      aria-label="Chương đã sửa"
      className="flex flex-col rounded-sm border border-default bg-surface text-body-xs shadow-xs"
    >
      <div className="flex items-center gap-1 px-1 py-0.5">
        <Button
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          leftIcon={
            open ? (
              <AltArrowDownIcon size={ICON.xs} aria-hidden="true" />
            ) : (
              <AltArrowRightIcon size={ICON.xs} aria-hidden="true" />
            )
          }
          className="!h-6 !px-1.5 text-label-xs font-medium"
        >
          {editedLabel(rows.length)}
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          disabled={working || busy}
          onClick={() => act(() => keepEdits())}
          className="!h-6 !px-2 text-label-xs"
        >
          Giữ tất cả
        </Button>
        <Button
          variant="ghost"
          disabled={working || busy}
          onClick={() => act(() => undoEdits())}
          className="!h-6 !px-2 text-label-xs"
        >
          Hoàn tác tất cả
        </Button>
      </div>
      {open && (
        <ul className="m-0 flex list-none flex-col border-t border-subtle p-0">
          {rows.map((row) => {
            const conflict = conflicts[editKey(row)]
            return (
              <li key={editKey(row)} className="flex flex-col px-2 py-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-default">
                    {row.chapterLabel || 'Chương không tên'}
                    <span className="text-muted"> · {row.workLabel}</span>
                    {row.units > 0 && <span className="text-muted"> · {row.units} đoạn</span>}
                  </span>
                  {onOpenTarget && (
                    <Button
                      variant="ghost"
                      aria-label={`Xem ${row.chapterLabel}`}
                      onClick={() => openRow(row)}
                      className="!h-6 !px-2 text-label-xs"
                    >
                      Xem
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    aria-label={`Giữ ${row.chapterLabel}`}
                    disabled={working || busy}
                    onClick={() => act(() => keepEdits(row))}
                    className="!h-6 !px-2 text-label-xs"
                  >
                    Giữ
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Hoàn tác ${row.chapterLabel}`}
                    disabled={working || busy}
                    onClick={() => act(() => undoEdits(row))}
                    className="!h-6 !px-2 text-label-xs"
                  >
                    Hoàn tác
                  </Button>
                </div>
                {conflict && (
                  <p role="alert" className="m-0 text-error">
                    {conflict}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
