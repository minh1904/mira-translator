import { useEffect, useState, type JSX } from 'react'
import { LinkButton } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import type { SessionStatus } from '../chapter-editor/editorSession'
import { combinedSaveLabel, textStats } from './chapterStats'

/** Hook đếm số lượng đề xuất AI đang chờ duyệt của chương, tự động cập nhật khi có thay đổi. */
function usePendingCount(workId: string, chapterId: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      if (!window.mira?.ai?.proposals?.pendingCounts) return
      const result = await window.mira.ai.proposals.pendingCounts(workId)
      if (active && result.ok) {
        setCount(result.value.counts.find((item) => item.chapterId === chapterId)?.count ?? 0)
      }
    }
    void load()
    const refresh = (): void => void load()
    window.addEventListener('mira:proposals-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('mira:proposals-changed', refresh)
    }
  }, [workId, chapterId])
  return count
}

/**
 * Thanh trạng thái ở cạnh dưới khung soạn thảo: hiển thị thống kê từ/ký tự của bản dịch,
 * trạng thái lưu và số đề xuất AI đang chờ duyệt.
 */
export function ChapterStatusBar({
  workId,
  chapterId,
  translation,
  statuses,
  onOpenProposals
}: {
  workId: string
  chapterId: string
  translation: string
  statuses: SessionStatus[]
  onOpenProposals(): void
}): JSX.Element {
  const { words, characters } = textStats(translation)
  const save = combinedSaveLabel(statuses)
  const pending = usePendingCount(workId, chapterId)

  return (
    <footer
      aria-label="Trạng thái chương"
      className="flex h-[22px] shrink-0 items-center justify-between border-t border-default bg-subtle px-2.5 text-body-xs text-subtle tabular-nums select-none"
    >
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 font-medium text-default">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Soạn thảo
        </span>
        {pending > 0 && (
          <LinkButton
            color="warning"
            onClick={onOpenProposals}
            leftIcon={<span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />}
          >
            {pending.toLocaleString('vi')} đề xuất chờ duyệt
          </LinkButton>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span>
          Bản dịch: {words.toLocaleString('vi')} chữ · {characters.toLocaleString('vi')} ký tự
        </span>
        <span role="status" className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('size-1.5 rounded-full', save.safe ? 'bg-success' : 'bg-warning')}
          />
          {save.label}
        </span>
        <span className="text-muted">UTF-8</span>
      </div>
    </footer>
  )
}
