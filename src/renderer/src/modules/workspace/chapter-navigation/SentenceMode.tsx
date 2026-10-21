import {
  memo,
  useCallback,
  useImperativeHandle,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type Ref
} from 'react'
import type { Row, RowState } from '../../../../../shared/contracts/rows'
import type { TextRecord } from '../../../../../shared/contracts/text'
import { Button } from '../../../components/ui/Button'
import { clampPage, pageOfPosition, pageCount, slicePage } from '../work-detail/chapterList'
import { ChapterPager } from '../work-detail/ChapterPager'
import { SentenceFilterToolbarMock, SentenceSuggestionPanelMock } from './SentenceModeMocks'
import { useSentenceRows, type RowProblem } from './useSentenceRows'

export const ROWS_PER_PAGE = 50

const STATE_LABEL: Record<RowState, string> = {
  untranslated: 'Chưa dịch',
  ai: 'AI đã dịch',
  reviewed: 'Đã soát',
  check: 'Cần kiểm tra'
}

const STATE_DOT: Record<RowState, string> = {
  untranslated: 'bg-neutral',
  ai: 'bg-info',
  reviewed: 'bg-success',
  check: 'bg-warning'
}

export interface SentenceModeHandle {
  /** Ghi tất cả các ô đã chỉnh sửa; trả về true nếu thành công. */
  commitAll(): Promise<boolean>
  hasDrafts(): boolean
  /** Hủy các nội dung đang soạn thảo và đọc lại bản dịch cùng liên kết. */
  discard(): Promise<void>
}

export interface SentenceModeProps {
  workId: string
  chapterId: string
  source: TextRecord
  target: TextRecord
  /** Mã ngôn ngữ BCP 47 của bản gốc để áp dụng font phù hợp. */
  sourceLang: string
  /** Gọi khi bản dịch thay đổi (sau khi ghi một hàng hoặc tải lại). */
  onTargetChanged(target: TextRecord): void
  handleRef?: Ref<SentenceModeHandle>
}

/**
 * Hiển thị chương theo từng hàng câu: mỗi câu bản gốc kèm bản dịch tương ứng bên cạnh,
 * trạng thái xử lý từng câu và điều hướng tới câu cần duyệt tiếp theo.
 */
export function SentenceMode({
  workId,
  chapterId,
  source,
  target,
  sourceLang,
  onTargetChanged,
  handleRef
}: SentenceModeProps): JSX.Element {
  const rows = useSentenceRows(workId, chapterId, source, target, onTargetChanged)
  // Các hàm callback của hàng đọc hook qua ref để tránh vẽ lại các hàng không đổi khi gõ phím
  const latest = useRef(rows)
  useEffect(() => {
    latest.current = rows
  })
  const [page, setPage] = useState(1)
  const [focus, setFocus] = useState<{ index: number; token: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const active = useRef(-1)
  const total = rows.view.rows.length

  useImperativeHandle(
    handleRef,
    () => ({
      commitAll: rows.commitAll,
      hasDrafts: rows.hasDrafts,
      discard: rows.reload
    }),
    [rows.commitAll, rows.hasDrafts, rows.reload]
  )

  const focusRow = useCallback((index: number): void => {
    setPage(pageOfPosition(index + 1, ROWS_PER_PAGE))
    setFocus({ index, token: Date.now() })
  }, [])

  /** Tìm hàng đầu tiên chưa được duyệt sau vị trí `from`, quay vòng về đầu danh sách nếu cần. */
  const jumpFrom = useCallback(
    (from: number): void => {
      const list = latest.current.getView().rows
      for (let step = 1; step <= list.length; step++) {
        const index = (from + step + list.length) % list.length
        if (list[index].state !== 'reviewed') {
          setMessage(null)
          focusRow(index)
          return
        }
      }
      setMessage('Mọi hàng đã soát, không còn hàng nào cần xử lý.')
    },
    [focusRow]
  )

  const onEnter = useCallback(
    async (row: Row): Promise<void> => {
      if (await latest.current.commit(row.sourceId)) {
        if (row.index + 1 < latest.current.getView().rows.length) focusRow(row.index + 1)
      }
    },
    [focusRow]
  )

  const onConfirm = useCallback(
    async (row: Row): Promise<void> => {
      if (!(await latest.current.commit(row.sourceId))) return
      const now = latest.current.getView().rows[row.index]
      if (now.targetIds.length > 0 && now.state !== 'reviewed') {
        if (!(await latest.current.review(row.sourceId))) return
      }
      jumpFrom(row.index)
    },
    [jumpFrom]
  )

  const onActive = useCallback((index: number): void => {
    active.current = index
  }, [])

  const current = clampPage(page, total, ROWS_PER_PAGE)
  const visible = slicePage(rows.view.rows, current, ROWS_PER_PAGE)
  const { counts, unlinkedTargets } = rows.view
  const conflict = [...rows.problems.values()].find((problem) => problem.kind === 'conflict')
  const canPair = unlinkedTargets.length > 0 && counts.untranslated > 0

  if (rows.loading) {
    return (
      <p role="status" className="px-1 pt-2 text-body-sm text-subtle">
        Đang đọc các hàng…
      </p>
    )
  }
  if (rows.loadError) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        <p role="alert" className="text-body-sm text-subtle">
          {rows.loadError}
        </p>
        <div>
          <Button variant="light" onClick={() => void rows.reload()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p
          role="status"
          aria-label="Số hàng theo trạng thái"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-subtle"
        >
          {(['untranslated', 'ai', 'check', 'reviewed'] as RowState[]).map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={'size-1.5 rounded-full ' + STATE_DOT[state]} />
              {STATE_LABEL[state]} {counts[state].toLocaleString('vi')}
            </span>
          ))}
        </p>
        <Button variant="light" onClick={() => jumpFrom(active.current)}>
          Hàng cần xử lý kế tiếp
        </Button>
      </div>

      <SentenceFilterToolbarMock />

      {canPair && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-default bg-muted px-3 py-2 text-body-xs leading-normal">
          <span>
            Có {unlinkedTargets.length.toLocaleString('vi')} câu dịch chưa ghép với hàng nào (viết ở
            mode Toàn văn). Ghép theo thứ tự chỉ là ước đoán, các hàng đó sẽ cần kiểm tra.
          </span>
          <Button onClick={() => void rows.autoPair()}>Ghép theo thứ tự</Button>
        </div>
      )}
      {(message ?? rows.notice) && (
        <p role="status" className="text-body-xs text-subtle">
          {message ?? rows.notice}
        </p>
      )}
      {conflict && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-body-xs leading-normal"
        >
          <strong className="font-semibold">Chưa ghi được hàng này.</strong>
          <span>{conflict.message}</span>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() =>
                void navigator.clipboard.writeText([...rows.drafts.values()].join('\n'))
              }
            >
              Sao chép chữ tôi đang gõ
            </Button>
            <Button onClick={() => void rows.reload()}>Tải lại</Button>
          </div>
        </div>
      )}

      <ol className="min-h-0 flex-1 list-none overflow-y-auto rounded-lg border border-default">
        {visible.map((row) => (
          <SentenceRow
            key={row.sourceId}
            row={row}
            sourceLang={sourceLang}
            draft={rows.drafts.get(row.sourceId)}
            problem={rows.problems.get(row.sourceId)}
            saving={rows.saving.has(row.sourceId)}
            focusToken={focus?.index === row.index ? focus.token : null}
            onDraft={rows.setDraft}
            onCommit={rows.commit}
            onEnter={onEnter}
            onConfirm={onConfirm}
            onActive={onActive}
          />
        ))}
      </ol>

      <SentenceSuggestionPanelMock />

      <ChapterPager
        page={current}
        pageSize={ROWS_PER_PAGE}
        total={total}
        onPage={setPage}
        unit="hàng"
      />
      <span className="sr-only">{pageCount(total, ROWS_PER_PAGE)} trang</span>
    </div>
  )
}

interface SentenceRowProps {
  row: Row
  sourceLang: string
  draft: string | undefined
  problem: RowProblem | undefined
  saving: boolean
  focusToken: number | null
  onDraft(sourceId: string, text: string): void
  onCommit(sourceId: string): Promise<boolean>
  onEnter(row: Row): Promise<void>
  onConfirm(row: Row): Promise<void>
  onActive(index: number): void
}

const SentenceRow = memo(function SentenceRow({
  row,
  sourceLang,
  draft,
  problem,
  saving,
  focusToken,
  onDraft,
  onCommit,
  onEnter,
  onConfirm,
  onActive
}: SentenceRowProps): JSX.Element {
  const field = useRef<HTMLTextAreaElement>(null)
  const value = draft ?? row.targetText
  const number = row.index + 1

  // Chiều cao ô tự co giãn theo nội dung để không bị che khuất bởi thanh cuộn.
  // Chiều cao được tính toán lại khi chiều rộng thay đổi (đổi kích thước cửa sổ, mở sidebar, nạp font).
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = element.scrollHeight + 'px'
  }, [value])

  useEffect(() => {
    const element = field.current
    if (!element) return
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth
      element.style.height = 'auto'
      element.style.height = element.scrollHeight + 'px'
    })
    observer.observe(element)
    // Font có thể nạp sau lần render đầu tiên và làm thay đổi ngắt dòng
    void document.fonts?.ready.then(() => {
      element.style.height = 'auto'
      element.style.height = element.scrollHeight + 'px'
    })
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (focusToken !== null) field.current?.focus()
  }, [focusToken])

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // Phím Enter xác nhận bộ gõ (Telex, Pinyin, v.v.) thuộc về IME, bỏ qua xử lý xuống hàng
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) void onConfirm(row)
    else void onEnter(row)
  }

  const statusId = 'row-state-' + row.sourceId
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 border-b border-default px-3 py-3 last:border-b-0">
      <span className="pt-0.5 text-right text-body-xs text-subtle">{number}</span>
      <p
        lang={sourceLang}
        className="selectable font-editor text-editor break-words whitespace-pre-wrap"
      >
        {row.sourceText}
      </p>
      <div className="flex min-w-0 flex-col gap-1.5">
        <textarea
          ref={field}
          rows={1}
          lang="vi"
          value={value}
          aria-label={'Bản dịch hàng ' + number}
          aria-describedby={statusId}
          spellCheck={false}
          className="w-full resize-none overflow-hidden rounded-xs border border-strong bg-transparent px-2.5 py-1.5 font-editor text-editor outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-focus"
          onFocus={() => onActive(row.index)}
          onChange={(event) => onDraft(row.sourceId, event.target.value)}
          onBlur={() => void onCommit(row.sourceId)}
          onKeyDown={onKeyDown}
        />
        <p
          id={statusId}
          role="status"
          className="flex items-center gap-1.5 text-body-xs text-subtle"
        >
          <span aria-hidden="true" className={'size-1.5 rounded-full ' + STATE_DOT[row.state]} />
          {saving ? 'Đang ghi…' : STATE_LABEL[row.state]}
          {draft !== undefined && !saving && ' · chưa ghi'}
        </p>
        {problem && problem.kind === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-body-xs text-error">
            <span>{problem.message}</span>
            <Button onClick={() => void onCommit(row.sourceId)}>Thử lại</Button>
          </div>
        )}
      </div>
    </li>
  )
})
