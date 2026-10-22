import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent
} from 'react'
import {
  AddIcon,
  CloseIcon,
  FolderOpenIcon,
  HashtagIcon,
  MenuDotsIcon,
  PenNewSquareIcon,
  TrashBinMinimalisticIcon,
  UploadMinimalisticIcon
} from '@renderer/components/ui/reicon'

import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type { WorkSummary } from '../../../../../shared/contracts/library'
import { Badge } from '../../../components/ui/Badge'
import { LinkButton } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import {
  ContextMenuPopup,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '../../../components/ui/ContextMenu'
import {
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger
} from '../../../components/ui/DropdownMenu'
import { ICON } from '../../../components/ui/icon'
import { Input, SearchInput } from '../../../components/ui/Input'
import { NavItem } from '../../../components/ui/NavItem'
import { Tip } from '../../../components/ui/Tooltip'
import { cn } from '../../../lib/cn'
import { ExportDialog } from '../../export/public'
import { backupWork, savedMessage } from '../../library/public'
import { DeleteChapterDialog, MoveChapterDialog } from '../work-detail/ChapterDialogs'
import { ChapterGapItem } from '../work-detail/ChapterGapItem'
import {
  chapterState,
  chapterStateLabels,
  displayTitle,
  findJumpTarget,
  fold,
  formatChapterLabel,
  parseQuery,
  type ChapterState
} from '../work-detail/chapterList'
import { extractChapterNumber } from '../../../../../shared/text/chapterNumber'
import { useChapters } from '../work-detail/useChapters'

/** Màu sắc tương ứng với các trạng thái của chương (đã dịch, chưa dịch, trống). */
const STATE_DOTS: Record<ChapterState, string> = {
  translated: 'bg-success',
  untranslated: 'bg-warning',
  empty: 'bg-neutral/40'
}

/**
 * Thanh điều hướng danh sách chương bên trái khi đang mở một chương:
 * hỗ trợ tìm kiếm nhanh, nhảy số chương, menu chuột phải và menu thao tác để đổi tên,
 * chèn, di chuyển vị trí, xuất và xóa chương.
 */
export function ChapterNavSidebar({
  workId,
  workTitle,
  activeChapterId,
  onOpenChapter,
  onBackToWork,
  onWorkChanged
}: {
  workId: string
  workTitle?: string
  activeChapterId: string
  onOpenChapter(chapterId: string): void
  onBackToWork?: () => void
  onWorkChanged(summary: WorkSummary): void
}): JSX.Element {
  const { load, chapters, create, rename, move, remove } = useChapters(workId, onWorkChanged)
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navRef = useRef<HTMLElement>(null)

  // Trạng thái các hộp thoại và chỉnh sửa tên trực tiếp
  const [editingId, setEditingId] = useState<string | null>(null)
  const [movingChapter, setMovingChapter] = useState<ChapterItem | null>(null)
  const [deletingChapter, setDeletingChapter] = useState<ChapterItem | null>(null)
  const [exportingChapter, setExportingChapter] = useState<ChapterItem | null>(null)

  useEffect(() => {
    let active = true
    const loadCounts = async (): Promise<void> => {
      if (!window.mira?.ai?.proposals?.pendingCounts) return
      const result = await window.mira.ai.proposals.pendingCounts(workId)
      if (active && result.ok) {
        const counts: Record<string, number> = {}
        for (const item of result.value.counts) counts[item.chapterId] = item.count
        setPendingCounts(counts)
      }
    }
    void loadCounts()
    const refresh = (): void => {
      void loadCounts()
    }
    window.addEventListener('mira:proposals-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('mira:proposals-changed', refresh)
    }
  }, [workId])

  const parsed = parseQuery(query)

  const filteredChapters = useMemo(() => {
    if (parsed.kind === 'empty') return chapters
    if (parsed.kind === 'jump') {
      const numStr = String(parsed.number)
      return chapters.filter(
        (chapter) =>
          extractChapterNumber(chapter.title) === parsed.number ||
          chapter.number === parsed.number ||
          String(chapter.number).startsWith(numStr) ||
          fold(displayTitle(chapter)).includes(fold(numStr))
      )
    }
    const needle = fold(parsed.text)
    return chapters.filter(
      (chapter) =>
        fold(displayTitle(chapter)).includes(needle) ||
        fold(`Chương ${chapter.number}`).includes(needle) ||
        String(chapter.number).includes(needle)
    )
  }, [chapters, parsed])

  // Tự động cuộn đến chương đang chọn khi mở hoặc khi bộ lọc thay đổi
  useEffect(() => {
    if (!activeChapterId) return
    const activeEl = navRef.current?.querySelector<HTMLElement>(
      `[data-chapter-id="${activeChapterId}"]`
    )
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeChapterId])

  const handleAddChapter = useCallback(async (): Promise<void> => {
    const result = await create()
    if (result.ok) {
      onOpenChapter(result.value.id)
    }
  }, [create, onOpenChapter])

  // Phím tắt toàn cục: '/' để tìm kiếm, Alt+N để thêm chương, F2 để đổi tên chương đang chọn
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      const isInput =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        Boolean(document.activeElement?.getAttribute('contenteditable'))

      if (event.key === '/' && !isInput) {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        return
      }

      if (event.altKey && event.key.toLowerCase() === 'n' && !isInput) {
        event.preventDefault()
        void handleAddChapter()
        return
      }

      if (event.key === 'F2' && !isInput && activeChapterId) {
        event.preventDefault()
        setEditingId(activeChapterId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeChapterId, handleAddChapter])

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault()
      setQuery('')
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (parsed.kind === 'jump') {
        const exact =
          parsed.targetChapter ??
          findJumpTarget(chapters, parsed.number)?.chapter ??
          chapters.find((chapter) => chapter.number === parsed.number)
        if (exact) {
          onOpenChapter(exact.id)
          return
        }
      }
      if (filteredChapters.length > 0) {
        onOpenChapter(filteredChapters[0].id)
      }
    }
  }

  async function handleInsertAfter(chapter: ChapterItem): Promise<void> {
    const result = await create()
    if (!result.ok) return
    const created = result.value
    const targetNumber = chapter.number + 1
    if (created.number !== targetNumber && chapters.length >= targetNumber) {
      await move(created.id, targetNumber)
    }
    onOpenChapter(created.id)
  }

  async function handleCommitRename(chapterId: string, nextTitle: string): Promise<void> {
    setEditingId(null)
    const target = chapters.find((c) => c.id === chapterId)
    if (!target) return
    const trimmed = nextTitle.trim()
    if (trimmed !== target.title) {
      await rename(chapterId, trimmed)
    }
  }

  return (
    <>
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-default bg-subtle/30 px-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            ref={inputRef}
            label="Tìm kiếm chương"
            placeholder="Tìm hoặc nhảy số… (/)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            rightSlot={
              query ? (
                <CompactButton
                  aria-label="Xóa tìm kiếm"
                  title="Xóa tìm kiếm (Esc)"
                  onClick={() => {
                    setQuery('')
                    inputRef.current?.focus()
                  }}
                  icon={<CloseIcon size={ICON.xs} />}
                />
              ) : undefined
            }
          />
        </div>
        <Tip label="Thêm chương (Alt+N)">
          <CompactButton
            aria-label="Thêm chương"
            onClick={() => void handleAddChapter()}
            icon={<AddIcon size={14} />}
          />
        </Tip>
      </div>

      <nav
        ref={navRef}
        aria-label="Danh sách chương"
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {load === 'loading' ? (
          <p role="status" className="px-2 py-1.5 text-body-xs text-subtle">
            Đang tải…
          </p>
        ) : filteredChapters.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <p className="text-body-xs text-subtle">Không tìm thấy chương nào</p>
            {query && (
              <LinkButton color="link" onClick={() => setQuery('')} className="mt-1 text-body-xs">
                Xóa bộ lọc
              </LinkButton>
            )}
          </div>
        ) : (
          filteredChapters.map((chapter, index) => {
            const active = chapter.id === activeChapterId
            const isEditing = editingId === chapter.id
            const label = displayTitle(chapter)
            const state = chapterState(chapter)
            const dotClass = STATE_DOTS[state]
            const dotLabel = chapterStateLabels[state]
            const pending = pendingCounts[chapter.id] ?? 0

            const prev = index > 0 ? filteredChapters[index - 1] : undefined
            const prevNum = prev ? extractChapterNumber(prev.title) : null
            const currNum = extractChapterNumber(chapter.title)
            const gap =
              prevNum !== null && currNum !== null && currNum - prevNum > 1
                ? currNum - prevNum - 1
                : 0

            if (isEditing) {
              return (
                <div key={chapter.id} className="contents">
                  {gap > 0 && (
                    <ChapterGapItem
                      missingCount={gap}
                      startNumber={prevNum! + 1}
                      endNumber={currNum! - 1}
                    />
                  )}
                  <RenameInlineInput
                    chapter={chapter}
                    onCommit={(title) => void handleCommitRename(chapter.id, title)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )
            }

            return (
              <div key={chapter.id} className="contents">
                {gap > 0 && (
                  <ChapterGapItem
                    missingCount={gap}
                    startNumber={prevNum! + 1}
                    endNumber={currNum! - 1}
                  />
                )}
                <ContextMenuRoot>
                  <div className="group relative flex items-center">
                    <ContextMenuTrigger className="min-w-0 flex-1">
                      <NavItem
                        data-chapter-id={chapter.id}
                        active={active}
                        onClick={() => onOpenChapter(chapter.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'F2') {
                            event.preventDefault()
                            setEditingId(chapter.id)
                          }
                        }}
                        className="pr-7"
                        leading={
                          <span
                            aria-hidden="true"
                            title={dotLabel}
                            className={cn('size-1.5 shrink-0 rounded-full', dotClass)}
                          />
                        }
                        trailing={
                          pending > 0 ? (
                            <Badge
                              color="warning"
                              className="tabular-nums transition-opacity group-hover:opacity-0"
                              title={`${pending} đề xuất chờ duyệt`}
                            >
                              {pending}
                            </Badge>
                          ) : undefined
                        }
                      >
                        {formatChapterLabel(chapter)}
                      </NavItem>
                    </ContextMenuTrigger>

                    <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <MenuRoot>
                        <MenuTrigger
                          render={
                            <CompactButton
                              aria-label={'Thao tác với ' + label}
                              icon={<MenuDotsIcon size={ICON.xs} />}
                            />
                          }
                        />
                        <MenuPopup align="end">
                          <MenuItem disabled={active} onClick={() => onOpenChapter(chapter.id)}>
                            <FolderOpenIcon size={14} />
                            Mở chương
                          </MenuItem>
                          <MenuItem onClick={() => setEditingId(chapter.id)}>
                            <PenNewSquareIcon size={14} />
                            <span className="flex-1">Đổi tên</span>
                            <kbd className="text-body-2xs text-muted">F2</kbd>
                          </MenuItem>
                          <MenuItem onClick={() => void handleInsertAfter(chapter)}>
                            <AddIcon size={14} />
                            Chèn chương mới phía sau
                          </MenuItem>
                          <MenuItem
                            disabled={chapters.length < 2}
                            onClick={() => setMovingChapter(chapter)}
                          >
                            <HashtagIcon size={14} />
                            Chuyển vị trí…
                          </MenuItem>
                          <MenuItem onClick={() => setExportingChapter(chapter)}>
                            <UploadMinimalisticIcon size={14} />
                            Xuất chương này…
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem tone="danger" onClick={() => setDeletingChapter(chapter)}>
                            <TrashBinMinimalisticIcon size={14} />
                            Xóa chương…
                          </MenuItem>
                        </MenuPopup>
                      </MenuRoot>
                    </div>
                  </div>

                  <ContextMenuPopup>
                    <ContextMenuItem disabled={active} onClick={() => onOpenChapter(chapter.id)}>
                      <FolderOpenIcon size={14} />
                      Mở chương
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => setEditingId(chapter.id)}>
                      <PenNewSquareIcon size={14} />
                      <span className="flex-1">Đổi tên</span>
                      <kbd className="text-body-2xs text-muted">F2</kbd>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => void handleInsertAfter(chapter)}>
                      <AddIcon size={14} />
                      Chèn chương mới phía sau
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={chapters.length < 2}
                      onClick={() => setMovingChapter(chapter)}
                    >
                      <HashtagIcon size={14} />
                      Chuyển vị trí…
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => setExportingChapter(chapter)}>
                      <UploadMinimalisticIcon size={14} />
                      Xuất chương này…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem tone="danger" onClick={() => setDeletingChapter(chapter)}>
                      <TrashBinMinimalisticIcon size={14} />
                      Xóa chương…
                    </ContextMenuItem>
                  </ContextMenuPopup>
                </ContextMenuRoot>
              </div>
            )
          })
        )}
      </nav>

      {/* Tiến độ dịch nằm trên thanh trạng thái đáy cửa sổ; ở đây chỉ còn số kết quả khi đang lọc. */}
      {chapters.length > 0 && query && (
        <div className="flex h-[22px] shrink-0 items-center border-t border-default px-2.5 text-body-xs text-muted tabular-nums">
          {`${filteredChapters.length}/${chapters.length} chương`}
        </div>
      )}

      <MoveChapterDialog
        chapter={movingChapter}
        total={chapters.length}
        onClose={() => setMovingChapter(null)}
        onMove={(chapter, to) => {
          void move(chapter.id, to)
        }}
      />

      <DeleteChapterDialog
        chapter={deletingChapter}
        onClose={() => setDeletingChapter(null)}
        onDelete={(chapter) => {
          const isCurrent = chapter.id === activeChapterId
          const remaining = chapters.filter((c) => c.id !== chapter.id)
          void remove(chapter.id).then((result) => {
            if (result.ok && isCurrent) {
              if (remaining.length > 0) {
                onOpenChapter(remaining[0].id)
              } else if (onBackToWork) {
                onBackToWork()
              }
            }
          })
        }}
        onBackup={async () => {
          const outcome = await backupWork(workId)
          if (outcome.kind === 'saved') return savedMessage(outcome.path)
          if (outcome.kind === 'failed') return 'Không sao lưu được: ' + outcome.message
          return null
        }}
      />

      <ExportDialog
        open={exportingChapter !== null}
        onOpenChange={(open) => {
          if (!open) setExportingChapter(null)
        }}
        workId={workId}
        workTitle={workTitle ?? 'Tác phẩm'}
        chapter={exportingChapter ?? undefined}
      />
    </>
  )
}

/** Ô nhập liệu đổi tên chương trực tiếp trên thanh điều hướng. */
function RenameInlineInput({
  chapter,
  onCommit,
  onCancel
}: {
  chapter: ChapterItem
  onCommit(title: string): void
  onCancel(): void
}): JSX.Element {
  const cancelledRef = useRef(false)
  return (
    <div className="flex h-8 items-center px-1">
      <Input
        autoFocus
        aria-label={'Tên chương ' + chapter.number}
        defaultValue={chapter.title}
        placeholder={'Chương ' + chapter.number}
        maxLength={200}
        className="h-7 w-full text-body-xs"
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelledRef.current = true
            onCancel()
          }
        }}
        onBlur={(event) => {
          if (cancelledRef.current) return
          onCommit(event.target.value)
        }}
      />
    </div>
  )
}
