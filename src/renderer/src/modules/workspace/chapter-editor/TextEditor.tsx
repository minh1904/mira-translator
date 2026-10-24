import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type Ref
} from 'react'
import { historyKeymap, insertNewline, standardKeymap } from '@codemirror/commands'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import type { SegmentLanguage } from '../../../../../shared/segmentation/segmenter'
import type { TextRecord } from '../../../../../shared/contracts/text'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { applyProposal, targetRange, type TargetRange, type TargetScope } from './chatRange'
import { ProposalReview } from './proposalReview'
import { createEditorState } from './editorState'
import {
  EditorSession,
  type SaveOutcome,
  type SessionStatus,
  type TextStore
} from './editorSession'
import { toggleBold, toggleItalic } from './formatCommands'
import { imageEmbedDecorations, type ImageStore } from './imageEmbedDecorations'
import { livePreviewDecorations } from './livePreviewDecorations'
import {
  caretParagraph,
  linkParagraph,
  paragraphLink,
  scrollToAnchor,
  topAnchor,
  type ParagraphAnchor
} from './paragraphLink'
import { idleResegment } from './resegmenter'
import { segmentDecorations } from './segmentDecorations'

/**
 * Trình soạn thảo CodeMirror 6 cho một bên chương (bản gốc hoặc bản dịch).
 */
const theme = EditorView.theme({
  // Khung viền và nền trong suốt, hiển thị liền mạch với các khung bên cạnh
  '&': {
    height: '100%',
    fontSize: 'var(--mira-font-text)',
    color: 'var(--mira-text)',
    backgroundColor: 'transparent'
  },
  // Không vẽ viền outline khi focus: con trỏ nhấp nháy là dấu hiệu focus chính
  '&.cm-focused': { outline: 'none' },
  // Giữ tính năng cuộn nhưng ẩn thanh cuộn mặc định để giao diện gọn gàng
  '.cm-scroller': {
    fontFamily: 'var(--mira-font-editor)',
    lineHeight: 'var(--mira-line-height-text)',
    overflow: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none'
  },
  '.cm-scroller::-webkit-scrollbar': { display: 'none' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--mira-text)' },
  // Mỗi dòng là một đoạn: cách đoạn và căn đều như trang đọc truyện; dòng trống không cộng thêm khoảng
  '.cm-line': { padding: '0 8px var(--mira-space-xs)', textAlign: 'justify' },
  '.cm-line:has(> br:only-child)': { paddingBottom: '0' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--mira-text-selection)'
  }
})

// Enter chỉ thêm dòng mới đơn thuần, không tự thụt lề theo dòng trên
const bindings = [
  { key: 'Enter', run: insertNewline },
  ...standardKeymap.filter((binding) => binding.key !== 'Enter'),
  ...historyKeymap
]

/** Chế độ chỉ đọc: giữ con trỏ, vùng chọn, sao chép và cuộn; chặn gõ phím, dán hoặc kéo thả. */
const lockExtension = (readOnly: boolean): Extension => [
  EditorState.readOnly.of(readOnly),
  EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly) })
]

/** Gắn thêm khi có cấu hình `images` (khung bản dịch): dán hoặc thả tệp để chèn ảnh. */
function imagePasteDrop(images: ImageStore, onResult: (message: string | null) => void): Extension {
  function firstImageFile(list: FileList | null | undefined): File | null {
    if (!list) return null
    for (const file of Array.from(list)) {
      if (file.type.startsWith('image/')) return file
    }
    return null
  }

  function insertAt(view: EditorView, pos: number, file: File): void {
    onResult(null)
    void images.insert(file).then((result) => {
      if (!result.ok) {
        onResult(result.error.message)
        return
      }
      view.dispatch({ changes: { from: pos, to: pos, insert: result.value } })
    })
  }

  return EditorView.domEventHandlers({
    paste(event, view) {
      const file = firstImageFile(event.clipboardData?.files)
      if (!file) return false
      event.preventDefault()
      insertAt(view, view.state.selection.main.from, file)
      return true
    },
    drop(event, view) {
      const file = firstImageFile(event.dataTransfer?.files)
      if (!file) return false
      event.preventDefault()
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from
      insertAt(view, pos, file)
      return true
    }
  })
}

export interface TextEditorHandle {
  /** Lưu ngay nội dung hiện tại, chờ bộ gõ IME hoàn tất trước khi lưu. */
  save(): Promise<SaveOutcome>
  isDirty(): boolean
  /** Hủy các chỉnh sửa chưa lưu và nạp lại văn bản đã lưu. */
  discard(): Promise<void>
  /** Trả về văn bản hiện tại trong trình soạn thảo. */
  getText(): string
  /** Phạm vi áp dụng cho lượt trao đổi AI: vùng chọn hoặc đoạn tại con trỏ. */
  targetRange(scope?: TargetScope): TargetRange | null
  /**
   * Hiển thị đề xuất AI vào trình soạn thảo dạng lớp xem trước có thể chấp nhận hoặc từ chối từng phần.
   */
  reviewProposal(
    range: TargetRange,
    replacement: string,
    onAccept: () => void,
    onDeny: () => void,
    label?: string
  ): 'reviewing' | 'stale'
  /** Hủy lớp xem trước đề xuất, giữ nguyên những phần đã được chấp nhận trước đó. */
  endReview(): void
  /** Đánh dấu đoạn tương ứng với con trỏ của khung bên cạnh; null để xóa đánh dấu. */
  linkParagraph(index: number | null): void
  /** Cuộn để mép trên của khung khớp với vị trí của khung bên cạnh. */
  scrollToAnchor(anchor: ParagraphAnchor): void
}

export interface TextEditorProps {
  /** Bản ghi văn bản và segment để mở trong trình soạn thảo. */
  record: TextRecord
  /** Mã ngôn ngữ BCP 47 của văn bản. */
  lang: SegmentLanguage
  /** Tên nhãn hỗ trợ khả năng tiếp cận (ARIA) của ô văn bản. */
  label: string
  store: TextStore
  /** Chế độ chỉ đọc. */
  readOnly?: boolean
  /** Gợi ý hiển thị khi văn bản còn trống. */
  emptyHint?: string
  /** Bật tính năng định dạng tiêu đề và chữ đậm trực tiếp khi soạn thảo. */
  livePreview?: boolean
  /** Cấu hình lưu trữ ảnh để cho phép dán hoặc thả ảnh vào trình soạn thảo. */
  images?: ImageStore
  /** Gọi khi lưu thành công (hoặc khi nạp lại dữ liệu đã lưu). */
  onSaved(record: TextRecord): void
  onStatusChange?(status: SessionStatus): void
  /** Gọi khi con trỏ hoặc vùng chọn thay đổi. */
  onTargetChange?(range: TargetRange): void
  /** Gọi khi nội dung văn bản thay đổi. */
  onTextChange?(text: string): void
  /** Gọi khi con trỏ di chuyển sang đoạn khác, hoặc sang dòng trống (null). */
  onParagraphChange?(index: number | null): void
  /** Gọi khi khung nhìn cuộn; neo là đoạn nằm ở mép trên cùng. */
  onScroll?(anchor: ParagraphAnchor): void
  handleRef?: Ref<TextEditorHandle>
}

const IDLE: SessionStatus = { state: 'saved', message: null, dirty: false }
const noSubscribe = (): (() => void) => () => {}

export function TextEditor({
  record,
  lang,
  label,
  store,
  readOnly = false,
  emptyHint,
  livePreview = false,
  images,
  onSaved,
  onStatusChange,
  onTargetChange,
  onTextChange,
  onParagraphChange,
  onScroll,
  handleRef
}: TextEditorProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const [lock] = useState(() => new Compartment())
  const [session, setSession] = useState<EditorSession | null>(null)
  const sessionRef = useRef<EditorSession | null>(null)
  const [confirmReload, setConfirmReload] = useState(false)
  const [empty, setEmpty] = useState(record.content === '')
  const [imageError, setImageError] = useState<string | null>(null)
  const hintId = useId()
  const [review] = useState(() => new ProposalReview())
  const latest = useRef({
    onSaved,
    onStatusChange,
    onTargetChange,
    onTextChange,
    onParagraphChange,
    onScroll,
    readOnly
  })
  useEffect(() => {
    latest.current = {
      onSaved,
      onStatusChange,
      onTargetChange,
      onTextChange,
      onParagraphChange,
      onScroll,
      readOnly
    }
  })

  const status = useSyncExternalStore(
    session ? session.subscribe : noSubscribe,
    session ? session.getStatus : () => IDLE
  )

  const save = useCallback(async (): Promise<SaveOutcome> => {
    const current = sessionRef.current
    if (!current) return { kind: 'unchanged' }
    const outcome = await current.save()
    if (outcome.kind === 'saved') latest.current.onSaved(outcome.record)
    return outcome
  }, [])

  useImperativeHandle(
    handleRef,
    () => ({
      save,
      isDirty: () => sessionRef.current?.dirty ?? false,
      discard: async () => {
        const loaded = await sessionRef.current?.reload()
        if (loaded) latest.current.onSaved(loaded)
      },
      getText: () => view.current?.state.doc.toString() ?? '',
      targetRange: (scope) => {
        const editor = view.current
        return editor ? targetRange(editor.state, scope) : null
      },
      reviewProposal: (range, replacement, onAccept, onDeny, label = 'Đề xuất AI') => {
        const editor = view.current
        if (!editor) return 'stale'
        const result = applyProposal(editor.state, range, replacement)
        if (result.kind === 'stale') return 'stale'
        const current = editor.state.doc.toString()
        let from = range.from
        let to = range.to
        if (range.text !== '' && current.slice(from, to) !== range.text) {
          from = current.indexOf(range.text)
          to = from + range.text.length
        }
        editor.dispatch(
          review.start({
            from,
            to,
            before: range.text,
            after: replacement,
            label,
            onAccept,
            onDeny
          })
        )
        editor.dispatch({ effects: EditorView.scrollIntoView(to) })
        return 'reviewing'
      },
      endReview: () => {
        const editor = view.current
        if (editor && review.isActive(editor.state)) editor.dispatch(review.stop())
      },
      linkParagraph: (index) => {
        if (view.current) linkParagraph(view.current, index)
      },
      scrollToAnchor: (anchor) => {
        if (view.current) scrollToAnchor(view.current, anchor)
      }
    }),
    [save]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: Văn bản chỉ đọc một lần lúc khởi tạo; màn hình sẽ remount component (key) khi chuyển chương.
  useEffect(() => {
    if (!host.current) return
    const makeState = (opened: TextRecord): EditorState =>
      createEditorState({
        content: opened.content,
        segments: opened.segments,
        extensions: [
          keymap.of(bindings),
          EditorView.lineWrapping,
          // Giao diện chung tắt tính năng bôi đen văn bản; vùng soạn thảo truyện bật lại class này để cho phép bôi đen.
          EditorView.editorAttributes.of({ class: 'selectable' }),
          EditorState.allowMultipleSelections.of(false),
          EditorView.contentAttributes.of({
            lang,
            'aria-label': label,
            'aria-multiline': 'true',
            ...(emptyHint === undefined ? {} : { 'aria-describedby': hintId }),
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off'
          }),
          lock.of(lockExtension(latest.current.readOnly)),
          review.extension(),
          EditorView.updateListener.of((update) => {
            sessionRef.current?.onUpdate(update)
            if (update.docChanged) {
              setEmpty(update.state.doc.length === 0)
              latest.current.onTextChange?.(update.state.doc.toString())
            }
            // Khung trợ lý AI bám theo vị trí con trỏ; kích hoạt khi con trỏ hoặc vùng chọn di chuyển
            if (update.selectionSet || update.docChanged) {
              latest.current.onTargetChange?.(targetRange(update.state))
              const paragraph = caretParagraph(update.state)
              if (paragraph !== caretParagraph(update.startState) || update.docChanged) {
                latest.current.onParagraphChange?.(paragraph)
              }
            }
          }),
          paragraphLink(),
          segmentDecorations(),
          ...(livePreview
            ? [
                livePreviewDecorations(),
                keymap.of([
                  { key: 'Mod-b', run: toggleBold },
                  { key: 'Mod-i', run: toggleItalic }
                ])
              ]
            : []),
          ...(images ? [imageEmbedDecorations(images), imagePasteDrop(images, setImageError)] : []),
          idleResegment(lang, 800, () => sessionRef.current?.saving ?? false),
          theme
        ]
      })

    const editor = new EditorView({ parent: host.current, state: makeState(record) })
    view.current = editor
    latest.current.onTextChange?.(editor.state.doc.toString())
    const onScrolled = (): void => {
      if (!latest.current.onScroll) return
      const anchor = topAnchor(editor)
      if (anchor) latest.current.onScroll(anchor)
    }
    editor.scrollDOM.addEventListener('scroll', onScrolled, { passive: true })
    const created = new EditorSession(editor, store, lang, makeState, record)
    sessionRef.current = created
    setSession(created)
    return () => {
      sessionRef.current = null
      view.current = null
      editor.scrollDOM.removeEventListener('scroll', onScrolled)
      editor.destroy()
    }
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: lock.reconfigure(lockExtension(readOnly)) })
  }, [readOnly, lock])

  useEffect(() => {
    latest.current.onStatusChange?.(status)
  }, [status])

  async function reload(): Promise<void> {
    setConfirmReload(false)
    const loaded = await sessionRef.current?.reload()
    if (loaded) latest.current.onSaved(loaded)
  }

  function copyMine(): void {
    const text = view.current?.state.doc.toString() ?? ''
    void navigator.clipboard.writeText(text)
  }

  const showHint = empty && emptyHint !== undefined

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      {status.state === 'conflict' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-body-xs leading-normal"
        >
          <strong className="font-semibold">Văn bản đã đổi ở nơi khác.</strong>
          <span>{status.message}</span>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={copyMine}>Sao chép văn bản của tôi</Button>
            <Button onClick={() => setConfirmReload(true)}>Tải lại bản đã lưu</Button>
          </div>
        </div>
      )}
      {status.state === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-sm border border-error/40 bg-error/10 px-3 py-2.5 text-body-xs leading-normal"
        >
          <span>{status.message}</span>
          <div>
            <Button onClick={() => void save()}>Thử lại</Button>
          </div>
        </div>
      )}

      {imageError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-sm border border-error/40 bg-error/10 px-3 py-2 text-body-xs leading-normal"
        >
          <span>{imageError}</span>
          <Button onClick={() => setImageError(null)}>Đã hiểu</Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={host} className="h-full min-w-0" />
        {showHint && (
          <p
            id={hintId}
            className="pointer-events-none absolute top-3 right-4 left-2 leading-normal text-subtle"
            style={{ fontFamily: 'var(--mira-font-editor)', fontSize: 'var(--mira-font-text)' }}
          >
            {emptyHint}
          </p>
        )}
      </div>

      <Dialog
        open={confirmReload}
        onOpenChange={setConfirmReload}
        title="Tải lại bản đã lưu?"
        description="Những chỗ bạn đã sửa mà chưa lưu sẽ bị bỏ. Bạn có thể bấm “Sao chép văn bản của tôi” trước để giữ lại."
      >
        <div className="flex justify-end gap-2">
          <Button variant="light" onClick={() => setConfirmReload(false)}>
            Hủy
          </Button>
          <Button variant="solid" onClick={() => void reload()}>
            Tải lại bản đã lưu
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
