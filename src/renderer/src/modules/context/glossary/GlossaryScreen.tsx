import { useEffect, useState, type JSX } from 'react'
import {
  AddIcon,
  BookBookmarkIcon,
  HistoryIcon,
  ImportIcon,
  PenNewSquareIcon,
  TrashBinMinimalisticIcon
} from '@renderer/components/ui/reicon'

import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type {
  ContextEntryItem,
  ContextReviewInfo,
  ReviewFlag
} from '../../../../../shared/contracts/glossary'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SearchInput } from '../../../components/ui/Input'
import { EntryHistoryDialog } from './EntryHistoryDialog'
import { DeleteGlossaryDialog, EditGlossaryDialog, ImportNamesDialog } from './GlossaryDialogs'
import { useGlossary } from './useGlossary'

/** Term types an extraction run writes (`TERM_TYPES` of glossaryExtraction). */
export const TERM_TYPE_LABELS: Record<string, string> = {
  person: 'Người',
  place: 'Địa danh',
  organization: 'Tổ chức',
  skill: 'Kỹ năng',
  item: 'Vật phẩm',
  title: 'Danh hiệu',
  term: 'Thuật ngữ'
}

export function reviewFlagLabel(flag: ReviewFlag): string {
  if (flag.code === 'alias_conflict') return `Dạng viết "${flag.detail ?? ''}" thuộc mục khác`
  if (flag.code === 'script_mismatch') return 'Bản dịch sai hệ chữ'
  if (flag.code === 'family_mismatch') return 'Lệch khuôn với thuật ngữ cùng họ'
  if (flag.code === 'short_alias') return `Dạng ngắn "${flag.detail ?? ''}" dễ khớp nhầm`
  if (flag.code === 'revision_suggested') return 'AI đề xuất sửa, chưa áp'
  return 'Mở lại vì có bằng chứng mới'
}

function ReviewDetails({
  info,
  chapterNumber
}: {
  info: ContextReviewInfo | undefined
  chapterNumber: (chapterId: string | null) => number | undefined
}): JSX.Element | null {
  if (!info) return null
  const quote = info.evidence[0]
  return (
    <div className="flex flex-col items-start gap-1">
      {info.termType && (
        <span className="text-body-xs text-subtle">
          {TERM_TYPE_LABELS[info.termType] ?? info.termType}
        </span>
      )}
      {info.flags.map((flag) => (
        <Badge key={flag.code + (flag.detail ?? '')} variant="outline" color="warning">
          {reviewFlagLabel(flag)}
        </Badge>
      ))}
      {quote && (
        <span className="line-clamp-2 text-body-xs text-subtle" title={quote.quote}>
          {chapterNumber(quote.chapterId) !== undefined
            ? `C.${chapterNumber(quote.chapterId)}: `
            : ''}
          “{quote.quote}”
        </span>
      )}
    </div>
  )
}

export interface GlossaryScreenProps {
  workId: string
}

export function GlossaryScreen({ workId }: GlossaryScreenProps): JSX.Element {
  const {
    entries,
    loading,
    error,
    query,
    setQuery,
    createEntry,
    updateEntry,
    deleteEntry,
    importNames,
    reviewInfo
  } = useGlossary({ workId })

  const [chapters, setChapters] = useState<ChapterItem[]>([])
  const [editingEntry, setEditingEntry] = useState<ContextEntryItem | null | 'new'>(null)
  const [deletingEntry, setDeletingEntry] = useState<ContextEntryItem | null>(null)
  const [historyEntry, setHistoryEntry] = useState<ContextEntryItem | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    let active = true
    window.mira.chapters.list(workId).then((res) => {
      if (active && res.ok) {
        setChapters(res.value.chapters)
      }
    })
    return () => {
      active = false
    }
  }, [workId])

  const chapterMap = new Map<string, ChapterItem>(chapters.map((c) => [c.id, c]))

  const formatChapterScope = (entry: ContextEntryItem): string => {
    if (!entry.fromChapterId && !entry.toChapterId) return 'Toàn bộ truyện'
    const from = entry.fromChapterId
      ? `C.${chapterMap.get(entry.fromChapterId)?.number ?? '?'}`
      : 'Đầu'
    const to = entry.toChapterId ? `C.${chapterMap.get(entry.toChapterId)?.number ?? '?'}` : 'Cuối'
    return `${from} → ${to}`
  }

  const chapterNumber = (chapterId: string | null): number | undefined =>
    chapterId ? chapterMap.get(chapterId)?.number : undefined

  return (
    <div className="flex flex-col gap-4">
      {/* Thanh công cụ trên cùng */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            label="Tìm kiếm thuật ngữ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo từ gốc, bản dịch, alias..."
            className="w-64"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button leftIcon={<ImportIcon size={ICON.sm} />} onClick={() => setImportOpen(true)}>
            Nhập Names.txt
          </Button>
          <Button
            leftIcon={<AddIcon size={ICON.sm} />}
            variant="solid"
            onClick={() => setEditingEntry('new')}
          >
            Thêm thuật ngữ
          </Button>
        </div>
      </div>

      {error && <div className="rounded-sm bg-error/10 p-3 text-body-xs text-error">{error}</div>}

      {/* Danh sách thuật ngữ chính */}
      <div className="overflow-hidden rounded-sm border border-default bg-surface">
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_110px_minmax(0,1.2fr)_104px] items-center border-b border-default bg-subtle px-3 py-2 text-body-xs font-medium text-subtle">
          <span>Từ gốc / Biến thể</span>
          <span>Bản dịch đích</span>
          <span>Hiệu lực</span>
          <span>Ghi chú</span>
          <span className="text-right">Thao tác</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-body-xs text-subtle">
            Đang tải danh sách thuật ngữ...
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<BookBookmarkIcon size={24} />}
            title={query ? 'Không tìm thấy thuật ngữ nào' : 'Chưa có thuật ngữ nào'}
            actions={
              !query ? (
                <Button variant="light" onClick={() => setEditingEntry('new')}>
                  Thêm thuật ngữ đầu tiên
                </Button>
              ) : undefined
            }
          >
            {query
              ? 'Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc.'
              : 'Thêm thuật ngữ hoặc nhập từ tệp Names.txt để AI tự động áp dụng khi dịch.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-default">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_110px_minmax(0,1.2fr)_104px] items-center px-3 py-2.5 text-body-xs transition-colors hover:bg-hover',
                  entry.status === 'pending' && 'bg-warning/5',
                  entry.status === 'rejected' && 'opacity-60'
                )}
              >
                {/* Thuật ngữ gốc và biến thể */}
                <div className="flex flex-col items-start gap-1 pr-2">
                  <span className="font-semibold text-default">{entry.source}</span>
                  {entry.aliases.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entry.aliases.map((alias) => (
                        <span
                          key={alias}
                          className="rounded-sm bg-subtle px-1 py-px text-body-xs text-subtle border border-default"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                  <ReviewDetails info={reviewInfo.get(entry.id)} chapterNumber={chapterNumber} />
                </div>

                {/* Bản dịch đích và cảnh báo cấm dùng */}
                <div className="flex flex-col items-start gap-1 pr-2">
                  <span
                    className={cn(
                      'font-medium',
                      entry.forbidden ? 'text-error line-through' : 'text-default'
                    )}
                  >
                    {entry.target}
                  </span>
                  {entry.forbidden && (
                    <span className="rounded-sm bg-error/10 px-1 py-px text-body-xs font-semibold text-error">
                      Cấm dùng
                    </span>
                  )}
                </div>

                {/* Phạm vi hiệu lực */}
                <span className="text-body-xs text-subtle">{formatChapterScope(entry)}</span>

                {/* Ghi chú */}
                <span className="truncate pr-2 text-body-xs text-subtle" title={entry.notes ?? ''}>
                  {entry.notes || '—'}
                </span>

                {/* Các thao tác */}
                <div className="flex items-center justify-end gap-1">
                  <CompactButton
                    icon={<HistoryIcon size={ICON.sm} />}
                    aria-label="Lịch sử"
                    title="Lịch sử"
                    onClick={() => setHistoryEntry(entry)}
                  />
                  <CompactButton
                    icon={<PenNewSquareIcon size={ICON.sm} />}
                    aria-label="Chỉnh sửa"
                    title="Chỉnh sửa"
                    onClick={() => setEditingEntry(entry)}
                  />
                  <CompactButton
                    tone="danger"
                    icon={<TrashBinMinimalisticIcon size={ICON.sm} />}
                    aria-label="Xóa thuật ngữ"
                    title="Xóa thuật ngữ"
                    onClick={() => setDeletingEntry(entry)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Các hộp thoại chức năng */}
      <EditGlossaryDialog
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null)
        }}
        entry={editingEntry === 'new' ? null : editingEntry}
        chapters={chapters}
        onSave={async (data) => {
          if (editingEntry === 'new') {
            await createEntry(data)
          } else if (editingEntry) {
            await updateEntry(editingEntry.id, data)
          }
        }}
      />

      <ImportNamesDialog open={importOpen} onOpenChange={setImportOpen} onImport={importNames} />

      <EntryHistoryDialog
        workId={workId}
        entry={historyEntry}
        onOpenChange={(open) => {
          if (!open) setHistoryEntry(null)
        }}
        chapterNumber={chapterNumber}
      />

      <DeleteGlossaryDialog
        open={deletingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingEntry(null)
        }}
        entry={deletingEntry}
        onConfirm={async () => {
          if (deletingEntry) {
            await deleteEntry(deletingEntry.id)
          }
        }}
      />
    </div>
  )
}
