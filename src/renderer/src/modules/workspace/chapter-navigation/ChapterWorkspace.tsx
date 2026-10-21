import { useCallback, useContext, useEffect, useRef, useState, type JSX } from 'react'
import {
  AltArrowLeftIcon,
  DocumentAddIcon,
  MaximizeSquareIcon,
  LockKeyholeMinimalisticIcon,
  LockKeyholeMinimalisticUnlockedIcon,
  MenuDotsIcon,
  PenNewSquareIcon,
  MinimizeSquareIcon,
  LinkMinimalistic2Icon,
  SidebarCloseIcon,
  SidebarOpenIcon,
  StarsIcon,
  UploadMinimalisticIcon
} from '@renderer/components/ui/reicon'

import { splitParagraphs } from '../../../../../shared/text/paragraphSpans'
import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type { SourceCatalogItem } from '../../../../../shared/contracts/sources'
import { extractChapterNumber } from '../../../../../shared/text/chapterNumber'
import type { TextRecord } from '../../../../../shared/contracts/text'
import { TopBarActions, TopBarTitle } from '../../../components/ui/TopBarActions'
import { WorkTabActiveContext } from '../../../components/ui/topBarSlot'
import { cn } from '../../../lib/cn'
import { Breadcrumb } from '../../../components/ui/Breadcrumb'
import { Button, LinkButton } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from '../../../components/ui/DropdownMenu'
import { TabsList, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import type { SessionStatus, TextStore } from '../chapter-editor/editorSession'
import { insertImageEmbed } from '../chapter-editor/imageEmbed'
import type { ImageStore } from '../chapter-editor/imageEmbedDecorations'
import { useConfirmLeave, useRegisterLeaveGuard } from '../chapter-editor/leaveGuard'
import type { TargetRange } from '../chapter-editor/chatRange'
import type { ParagraphAnchor } from '../chapter-editor/paragraphLink'
import { TextEditor, type TextEditorHandle } from '../chapter-editor/TextEditor'
import { ExportDialog } from '../../export/public'
import { languages, useLibraryStore, type Work } from '../../library/public'
import { useChapterStore } from '../store/chapterStore'
import { usePaneLayoutStore } from '../store/paneLayoutStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { headingTitle } from '../work-detail/chapterList'
import { contextArea } from '../work-detail/workAreas'
import { PanelResizeHandle } from './PanelResizeHandle'
import { buildLocation, type PaneCaret } from '../assistant/chatLocation'
import { AssistantSideDrawer, AssistantSidePanel, useNarrowWindow } from './AssistantSidePanel'
import { defaultWorkspaceAgentAdapter } from '@renderer/modules/agent/public'
import { AiTranslateDialog } from '../translation/AiTranslateDialog'
import { ChapterStatusBar } from './ChapterStatusBar'
import { EditorPane } from './EditorPane'
import { PaneDivider } from './PaneDivider'
import { SentenceMode, type SentenceModeHandle } from './SentenceMode'

const IDLE: SessionStatus = { state: 'saved', message: null, dirty: false }

/**
 * Độ rộng tối thiểu cho một khung soạn thảo. Khi mở bảng trợ lý AI, khung bản gốc sẽ tạm thu gọn nếu
 * tổng độ rộng màn hình không đủ cho cả hai khung soạn thảo.
 */
const MIN_EDITOR_WIDTH = 420

type Side = 'source' | 'target'

const SOURCE_SHORTCUT = 'Ctrl+\\'
const TARGET_SHORTCUT = 'Ctrl+Shift+\\'

/**
 * Chế độ "Từng câu" tạm thời vô hiệu hóa trong giao diện.
 */
const SENTENCE_MODE_ENABLED = false

export interface ChapterWorkspaceProps {
  work: Work
  chapter: ChapterItem
  source: TextRecord
  target: TextRecord
  /** Đổi khi bản gốc được thay thế từ bên ngoài, kích hoạt mở lại trình soạn thảo bản gốc. */
  sourceEpoch: number
  /** Đổi khi bản dịch được ghi đè từ bên ngoài (AI dịch chương), kích hoạt mở lại trình soạn thảo bản dịch. */
  targetEpoch: number
  sourceStore: TextStore
  targetStore: TextStore
  onSourceSaved(record: TextRecord): void
  onTargetSaved(record: TextRecord): void
  onBackToWork(): void
  onReplaceSource(): void
  /** Nhận bản dịch AI vừa ghi, để trình soạn mở lại trên bản mới. */
  onTargetReplaced(record: TextRecord): void
  /** Nơi khai kết nối AI, cho hộp thoại dịch khi chưa có kết nối nào. */
  onOpenSettings(): void
  /** Trạng thái ẩn thanh bên để mở rộng không gian cho các khung soạn thảo. */
  focused: boolean
  onToggleFocus(): void
}

const otherSide = (side: Side): Side => (side === 'source' ? 'target' : 'source')

/**
 * Chuỗi thống kê số lượng đoạn văn bản gốc và bản dịch của chương.
 */
const paragraphFigures = (source: TextRecord, target: TextRecord): string => {
  const sourceCount = splitParagraphs(source.content).length.toLocaleString('vi')
  if (target.content.trim() === '') return sourceCount + ' đoạn gốc, chưa dịch'
  const targetCount = splitParagraphs(target.content).length.toLocaleString('vi')
  return sourceCount + ' đoạn gốc · ' + targetCount + ' đoạn dịch'
}

interface GapPromptState {
  nextChapter: ChapterItem
  rawItem: SourceCatalogItem
  targetNumber: number
  loading: boolean
}

/**
 * Chế độ toàn văn của chương: bản gốc bên trái, bản dịch bên phải, mỗi khung cuộn độc lập.
 */
export function ChapterWorkspace({
  work,
  chapter,
  source,
  target,
  sourceEpoch,
  targetEpoch,
  sourceStore,
  targetStore,
  onSourceSaved,
  onTargetSaved,
  onBackToWork,
  onReplaceSource,
  onTargetReplaced,
  onOpenSettings,
  focused,
  onToggleFocus
}: ChapterWorkspaceProps): JSX.Element {
  const tabActive = useContext(WorkTabActiveContext)
  const sourceEditor = useRef<TextEditorHandle>(null)
  const targetEditor = useRef<TextEditorHandle>(null)
  const [sourceStatus, setSourceStatus] = useState<SessionStatus>(IDLE)
  const [targetStatus, setTargetStatus] = useState<SessionStatus>(IDLE)
  const [translation, setTranslation] = useState(target.content)
  const [unlocked, setUnlocked] = useState(false)
  const [agentLocked, setAgentLocked] = useState(false)
  const [mode, setMode] = useState<'full' | 'sentence'>('full')

  // biome-ignore lint/correctness/useExhaustiveDependencies: Đặt lại trạng thái cục bộ mỗi khi chuyển sang chương khác.
  useEffect(() => {
    setTranslation(target.content)
    setUnlocked(false)
    setSourceStatus(IDLE)
    setTargetStatus(IDLE)
    setAiRange(null)
    setAiSourceRange(null)
  }, [chapter.id, target.content])

  useEffect(() => {
    return defaultWorkspaceAgentAdapter.registerEditor(
      { workId: work.id, chapterId: chapter.id, side: 'target' },
      {
        isDirty: () => targetStatus.dirty,
        flush: async () => {
          const res = await targetEditor.current?.save()
          return {
            ok: res?.kind === 'saved' || res?.kind === 'unchanged',
            revision: res?.kind === 'saved' ? res.record.rev : target.rev
          }
        },
        revision: () => target.rev,
        setReadOnly: setAgentLocked,
        reload: async () => {
          const res = await targetStore.get()
          if (res.ok) {
            setTranslation(res.value.content)
            onTargetReplaced(res.value)
          }
        }
      }
    )
  }, [work.id, chapter.id, target.rev, targetStatus.dirty, targetStore, onTargetReplaced])
  const sentence = useRef<SentenceModeHandle>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiWidth, setAiWidth] = useState(420)
  const sourceCollapsed = usePaneLayoutStore((state) => state.sourceCollapsed)
  const sourceRatio = usePaneLayoutStore((state) => state.sourceRatio)
  const syncScroll = usePaneLayoutStore((state) => state.syncScroll)
  // Tạm thời thu gọn cho bảng trợ lý AI, không lưu vào cấu hình bố cục lâu dài.
  const [aiFolded, setAiFolded] = useState(false)
  const sourceHidden = sourceCollapsed || aiFolded
  // Bảng trợ lý AI cần tương tác với bản dịch nên giữ khung bản dịch luôn mở khi bảng trợ lý đang bật.
  const targetHidden = usePaneLayoutStore((state) => state.targetCollapsed) && !aiOpen
  const panes = useRef<HTMLDivElement>(null)
  const editors = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  // Theo dõi vị trí con trỏ và vùng chọn ở từng khung để cung cấp ngữ cảnh vị trí đoạn văn cho trợ lý AI.
  const [aiSourceRange, setAiSourceRange] = useState<TargetRange | null>(null)
  const [aiRange, setAiRange] = useState<TargetRange | null>(null)
  const [aiSide, setAiSide] = useState<'source' | 'target'>('target')
  const narrow = useNarrowWindow()

  // Trợ lý chụp tác phẩm, chương, vùng chọn và con trỏ lúc gửi; ref giữ giá trị mới nhất cho getter.
  const location = useRef({ source: aiSourceRange, target: aiRange, side: aiSide })
  location.current = { source: aiSourceRange, target: aiRange, side: aiSide }
  // biome-ignore lint/correctness/useExhaustiveDependencies: báo cho chip ngữ cảnh mỗi khi vị trí đổi.
  useEffect(() => {
    defaultWorkspaceAgentAdapter.contextChanged()
  }, [aiSourceRange, aiRange, aiSide])
  useEffect(() => {
    if (!tabActive) return
    const pane = (range: TargetRange | null): PaneCaret | null =>
      range && { from: range.from, to: range.to, selected: range.selected === true }
    defaultWorkspaceAgentAdapter.setActiveContextGetter(
      () => {
        const at = buildLocation({
          sourceText: sourceEditor.current?.getText() ?? '',
          targetText: targetEditor.current?.getText() ?? '',
          source: pane(location.current.source),
          target: pane(location.current.target),
          active: location.current.side
        })
        return {
          workId: work.id,
          chapterId: chapter.id,
          caret: at.caret,
          ...(at.selection ? { selection: at.selection } : {})
        }
      },
      () => ({ work: work.title, chapter: headingTitle(chapter) })
    )
    return () => {
      defaultWorkspaceAgentAdapter.setActiveContextGetter(() => null)
    }
  }, [tabActive, work.id, work.title, chapter])
  const onSourceCaret = useCallback((range: TargetRange) => {
    setAiSourceRange(range)
    setAiSide('source')
  }, [])
  const onTargetCaret = useCallback((range: TargetRange) => {
    setAiRange(range)
    setAiSide('target')
  }, [])

  /** Khung soạn thảo được thao tác gần nhất (cuộn, nhấp chuột hoặc gõ), đóng vai trò điều khiển cuộn đồng bộ. */
  const driver = useRef<Side>('target')
  const caretParagraphs = useRef<Record<Side, number | null>>({ source: null, target: null })
  const editorOf = useCallback(
    (side: Side): TextEditorHandle | null =>
      side === 'source' ? sourceEditor.current : targetEditor.current,
    []
  )

  // "Mở đoạn" from a quality warning: scroll the source to the paragraph once the editors are mounted.
  const reveal = useWorkspaceStore((state) => state.reveal)
  useEffect(() => {
    if (!reveal || reveal.chapterId !== chapter.id) return
    const frame = requestAnimationFrame(() => {
      editorOf('source')?.scrollToAnchor({ index: reveal.paragraph, fraction: 0 })
      editorOf('target')?.scrollToAnchor({ index: reveal.paragraph, fraction: 0 })
      useWorkspaceStore.getState().clearReveal()
    })
    return () => cancelAnimationFrame(frame)
  }, [reveal, chapter.id, editorOf])

  /** Đánh dấu liên kết đoạn văn tương ứng ở khung đối diện dựa theo vị trí con trỏ hiện tại. */
  const showLink = useCallback(
    (side: Side): void => {
      editorOf(side)?.linkParagraph(null)
      editorOf(otherSide(side))?.linkParagraph(caretParagraphs.current[side])
    },
    [editorOf]
  )
  const onSourceParagraph = useCallback(
    (index: number | null) => {
      caretParagraphs.current.source = index
      showLink('source')
    },
    [showLink]
  )
  const onTargetParagraph = useCallback(
    (index: number | null) => {
      caretParagraphs.current.target = index
      showLink('target')
    },
    [showLink]
  )

  const syncOn = useRef(false)
  syncOn.current = syncScroll && !sourceHidden && !targetHidden
  const onSourceScroll = useCallback(
    (anchor: ParagraphAnchor) => {
      if (syncOn.current && driver.current === 'source') editorOf('target')?.scrollToAnchor(anchor)
    },
    [editorOf]
  )
  const onTargetScroll = useCallback(
    (anchor: ParagraphAnchor) => {
      if (syncOn.current && driver.current === 'target') editorOf('source')?.scrollToAnchor(anchor)
    },
    [editorOf]
  )
  /** Xử lý sự kiện để gán khung soạn thảo được tương tác thành khung điều khiển cuộn. */
  const driveFrom = (side: Side) => {
    const drive = (): void => {
      driver.current = side
    }
    return {
      onPointerDown: drive,
      onWheel: drive,
      onKeyDown: drive,
      onFocus: () => {
        drive()
        showLink(side)
      }
    }
  }

  const toggleSource = useCallback((): void => {
    foldedByHand = true
    const layout = usePaneLayoutStore.getState()
    if (layout.sourceCollapsed || aiFolded) {
      setAiFolded(false)
      layout.setSourceCollapsed(false)
    } else {
      layout.setSourceCollapsed(true)
    }
  }, [aiFolded])

  const toggleTarget = useCallback((): void => {
    foldedByHand = true
    const layout = usePaneLayoutStore.getState()
    layout.setTargetCollapsed(!layout.targetCollapsed)
  }, [])
  const [translateOpen, setTranslateOpen] = useState(false)
  const translateOpener = useRef<HTMLElement | null>(null)
  const confirmLeave = useConfirmLeave()
  const [imageStore] = useState<ImageStore>(() => ({
    insert: (file) => insertImageEmbed(work.id, file),
    get: (imageId) => window.mira.images.get(work.id, imageId)
  }))

  const handles = (): TextEditorHandle[] =>
    [sourceEditor.current, targetEditor.current].filter(
      (handle): handle is TextEditorHandle => handle !== null
    )

  /** Lưu tất cả các khung đang có thay đổi chưa lưu; trả về true nếu lưu thành công toàn bộ. */
  const saveAll = useCallback(async (): Promise<boolean> => {
    const outcomes = await Promise.all(
      [sourceEditor.current, targetEditor.current].map(async (handle) =>
        handle?.isDirty() ? handle.save() : { kind: 'unchanged' as const }
      )
    )
    return outcomes.every((outcome) => outcome.kind !== 'failed')
  }, [])

  /** Lưu nội dung chưa lưu của chế độ hiện tại (hai văn bản hoặc từng câu). */
  const saveCurrent = useCallback(
    (): Promise<boolean> =>
      mode === 'sentence' ? (sentence.current?.commitAll() ?? Promise.resolve(true)) : saveAll(),
    [mode, saveAll]
  )

  // Phím tắt Ctrl+S (Cmd+S) lưu nội dung từ bất kỳ vị trí nào trên màn hình.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!tabActive) return
      if (event.defaultPrevented) return
      if (event.key.toLowerCase() !== 's' || event.altKey || event.shiftKey) return
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      void saveCurrent()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrent, tabActive])

  /** Bật/tắt bảng trợ lý AI và gán vùng chọn hiện tại của khung bản dịch làm ngữ cảnh ban đầu. */
  const toggleAi = useCallback((): void => {
    setAiOpen((open) => {
      if (!open) setAiRange(targetEditor.current?.targetRange() ?? null)
      return !open
    })
  }, [])

  // Phím tắt Ctrl+K (Cmd+K) mở "Hỏi AI" ở chế độ Toàn văn; phím Esc để đóng.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!tabActive) return
      if (event.defaultPrevented) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && mode === 'full') {
        event.preventDefault()
        toggleAi()
      } else if (event.key === 'Escape' && aiOpen) {
        setAiOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, aiOpen, toggleAi, tabActive])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Chỉ tính toán khi mở hoặc đóng bảng, không tính khi đang kéo đổi kích thước.
  useEffect(() => {
    if (!aiOpen) {
      setAiFolded(false)
      return
    }
    const width = panes.current?.clientWidth ?? 0
    if (width - aiWidth < 2 * MIN_EDITOR_WIDTH) setAiFolded(true)
  }, [aiOpen])

  // Phím tắt Ctrl+\ thu gọn hoặc mở lại khung bản gốc; Ctrl+Shift+\ áp dụng cho khung bản dịch.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!tabActive || event.defaultPrevented || mode !== 'full') return
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (event.code !== 'Backslash') return
      if (event.shiftKey && aiOpen) return
      event.preventDefault()
      if (event.shiftKey) toggleTarget()
      else toggleSource()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, tabActive, aiOpen, toggleSource, toggleTarget])

  const [gapPrompt, setGapPrompt] = useState<GapPromptState | null>(null)
  const navigate = useWorkspaceStore((state) => state.navigate)

  const handleNavigateChapter = useCallback(
    async (direction: 'next' | 'prev'): Promise<void> => {
      const res = await window.mira?.chapters?.list(work.id)
      if (!res?.ok) return
      const chaptersList = res.value.chapters
      const idx = chaptersList.findIndex((c) => c.id === chapter.id)
      if (idx < 0) return

      if (direction === 'prev') {
        if (idx > 0) {
          const prevCh = chaptersList[idx - 1]
          void navigate({ name: 'chapter', workId: work.id, chapterId: prevCh.id })
        }
        return
      }

      // direction === 'next'
      if (idx >= chaptersList.length - 1) return
      const nextCh = chaptersList[idx + 1]

      // Check gap between chapters
      const currNum = extractChapterNumber(chapter.title)
      const nextNum = extractChapterNumber(nextCh.title)

      if (currNum !== null && nextNum !== null && nextNum - currNum > 1) {
        const targetNumber = currNum + 1
        try {
          const bRes = await window.mira?.sources?.bindings?.list({ workId: work.id })
          if (bRes?.ok && bRes.value.length > 0) {
            const primary = bRes.value.find((b) => b.role === 'primary') ?? bRes.value[0]
            const catRes = await window.mira?.sources?.catalog?.list({
              workId: work.id,
              bindingId: primary.id,
              limit: 200
            })
            if (catRes?.ok) {
              const rawItem = catRes.value.items.find(
                (item) =>
                  !item.chapterId &&
                  (extractChapterNumber(item.title) === targetNumber ||
                    item.position === targetNumber)
              )
              if (rawItem) {
                setGapPrompt({
                  nextChapter: nextCh,
                  rawItem,
                  targetNumber,
                  loading: false
                })
                return
              }
            }
          }
        } catch {
          // Fallback to normal navigation
        }
      }

      void navigate({ name: 'chapter', workId: work.id, chapterId: nextCh.id })
    },
    [work.id, chapter.id, chapter.title, navigate]
  )

  const handleDownloadAndOpenAdjacent = async (prompt: GapPromptState): Promise<void> => {
    setGapPrompt((prev) => (prev ? { ...prev, loading: true } : null))
    try {
      const dlRes = await window.mira?.sources?.catalog?.download({
        workId: work.id,
        itemId: prompt.rawItem.id
      })
      if (dlRes?.ok) {
        setGapPrompt(null)
        void useChapterStore.getState().reload()
        void useLibraryStore.getState().reload()
        void navigate({
          name: 'chapter',
          workId: work.id,
          chapterId: dlRes.value.chapterId
        })
        return
      }
    } finally {
      setGapPrompt((prev) => (prev ? { ...prev, loading: false } : null))
    }
  }

  const handleSkipToAvailable = async (prompt: GapPromptState): Promise<void> => {
    setGapPrompt(null)
    void navigate({
      name: 'chapter',
      workId: work.id,
      chapterId: prompt.nextChapter.id
    })
  }

  // Phím tắt Alt+Down (chương kế tiếp) và Alt+Up (chương trước đó)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!tabActive || event.defaultPrevented) return
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          void handleNavigateChapter('next')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          void handleNavigateChapter('prev')
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabActive, handleNavigateChapter])

  useRegisterLeaveGuard({
    isDirty: () =>
      mode === 'sentence'
        ? (sentence.current?.hasDrafts() ?? false)
        : handles().some((handle) => handle.isDirty()),
    save: saveCurrent,
    discard: async () => {
      if (mode === 'sentence') await sentence.current?.discard()
      else await Promise.all(handles().map((handle) => handle.discard()))
    }
  })

  /** Chuyển đổi giữa chế độ toàn văn và từng câu, đảm bảo lưu hoặc xác nhận nội dung chưa lưu trước khi đổi. */
  async function switchMode(next: 'full' | 'sentence'): Promise<void> {
    if (next === mode) return
    if (next === 'sentence') {
      if (!(await confirmLeave({ reloadOnDiscard: true }))) return
    } else if (!(await (sentence.current?.commitAll() ?? Promise.resolve(true)))) {
      return
    }
    setUnlocked(false)
    setAiOpen(false)
    setMode(next)
  }

  const sourceLanguage = languages[work.sourceLanguage]

  const focusLabel = focused ? 'Hiện điều hướng' : 'Tập trung'

  // Cửa sổ rộng: panel dock cạnh bản dịch. Cửa sổ hẹp: cùng panel nằm trong drawer phủ.
  const dockOpen = aiOpen && !narrow
  const sidePanel = <AssistantSidePanel onClose={() => setAiOpen(false)} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBarTitle onBack={onBackToWork} backLabel={`Về tác phẩm: ${work.title}`} size="sm">
        <Breadcrumb
          items={[
            { label: work.title, onClick: onBackToWork, title: `Về tác phẩm: ${work.title}` },
            { label: headingTitle(chapter) }
          ]}
        />
      </TopBarTitle>

      {/* Các nút thao tác Hỏi AI, chế độ tập trung và menu chương hiển thị trên thanh tiêu đề cửa sổ. */}
      <TopBarActions>
        {mode === 'full' && (
          <CompactButton
            aria-pressed={aiOpen}
            aria-label="Hỏi AI (Ctrl+K)"
            title="Hỏi AI (Ctrl+K)"
            onClick={toggleAi}
            icon={<StarsIcon size={16} />}
          />
        )}
        <CompactButton
          aria-pressed={focused}
          aria-label={focusLabel}
          title={focusLabel}
          onClick={onToggleFocus}
          icon={focused ? <MaximizeSquareIcon size={16} /> : <MinimizeSquareIcon size={16} />}
        />
        <MenuRoot>
          <MenuTrigger
            render={
              <CompactButton aria-label="Thêm thao tác chương" icon={<MenuDotsIcon size={16} />} />
            }
          />
          <MenuPopup>
            <MenuItem
              onClick={() => {
                translateOpener.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null
                // Bản dịch đang có chữ chưa lưu thì xử lý trước: AI ghi thẳng vào kho.
                void confirmLeave({ reloadOnDiscard: true }).then((proceed) => {
                  if (proceed) setTranslateOpen(true)
                })
              }}
            >
              <StarsIcon size={14} className="text-subtle" />
              Dịch bằng AI
            </MenuItem>
            <MenuItem
              onClick={() => {
                // Lưu bản dịch mới nhất trước khi mở hộp thoại xuất chương.
                void (targetEditor.current?.save() ?? Promise.resolve()).finally(() =>
                  setExportOpen(true)
                )
              }}
            >
              <UploadMinimalisticIcon size={14} className="text-subtle" />
              Xuất chương…
            </MenuItem>
            <MenuItem onClick={onBackToWork}>
              <AltArrowLeftIcon size={14} className="text-subtle" />
              Về tác phẩm
            </MenuItem>
          </MenuPopup>
        </MenuRoot>
      </TopBarActions>

      {/* Tiêu đề chương kèm thống kê số đoạn và liên kết chuyển đến ngữ cảnh tác phẩm. */}
      <div className="flex h-(--mira-header-height) shrink-0 items-center gap-3 border-b border-default bg-surface px-2.5">
        <h2 className="min-w-0 flex-1 truncate text-body-sm font-semibold">
          {headingTitle(chapter)}{' '}
          <span className="font-normal text-subtle">· {paragraphFigures(source, target)}</span>
        </h2>
        {SENTENCE_MODE_ENABLED && (
          <>
            <TabsRoot
              value={mode}
              aria-label="Chế độ soạn thảo"
              onValueChange={(value) => void switchMode(value as 'full' | 'sentence')}
            >
              <TabsList variant="pill">
                <TabsTab variant="pill" value="full">
                  Toàn văn
                </TabsTab>
                <TabsTab variant="pill" value="sentence">
                  Từng câu
                </TabsTab>
              </TabsList>
            </TabsRoot>
            <span className="h-4 w-px shrink-0 bg-line" aria-hidden="true" />
          </>
        )}
        {/* Mở phân vùng Thuật ngữ và Xưng hô trong chi tiết tác phẩm. */}
        <LinkButton
          color="neutral"
          className="shrink-0"
          onClick={() => {
            useWorkspaceStore.getState().setWorkArea(work.id, contextArea.id)
            onBackToWork()
          }}
        >
          Thuật ngữ · Xưng hô
        </LinkButton>
      </div>

      {gapPrompt && (
        <div
          role="region"
          aria-label="Thông báo khoảng khuyết chương"
          className="flex flex-wrap items-center justify-between gap-sm border-b border-warning/40 bg-warning/10 px-md py-xs text-body-sm text-default"
        >
          <div className="flex items-center gap-xs">
            <span className="font-medium text-warning">Khoảng khuyết:</span>
            <span>Chương liền kề (Chương {gapPrompt.targetNumber}) chưa có trong tác phẩm.</span>
          </div>
          <div className="flex items-center gap-xs">
            <Button
              variant="solid"
              disabled={gapPrompt.loading}
              onClick={() => void handleDownloadAndOpenAdjacent(gapPrompt)}
            >
              {gapPrompt.loading ? 'Đang tải…' : 'Tải & Mở chương kế'}
            </Button>
            <Button
              variant="outline"
              disabled={gapPrompt.loading}
              onClick={() => void handleSkipToAvailable(gapPrompt)}
            >
              Chuyển tới {gapPrompt.nextChapter.title || 'Chương ' + gapPrompt.nextChapter.number}
            </Button>
            <Button variant="ghost" disabled={gapPrompt.loading} onClick={() => setGapPrompt(null)}>
              Đóng
            </Button>
          </div>
        </div>
      )}

      {mode === 'sentence' ? (
        <div className="min-h-0 flex-1 p-3">
          <SentenceMode
            handleRef={sentence}
            workId={work.id}
            chapterId={chapter.id}
            source={source}
            target={target}
            sourceLang={work.sourceLanguage}
            onTargetChanged={onTargetSaved}
          />
        </div>
      ) : (
        <div ref={panes} className="flex min-h-0 flex-1">
          {sourceHidden && (
            <FoldedPane
              label="Bản gốc"
              action={'Hiện bản gốc (' + SOURCE_SHORTCUT + ')'}
              side="left"
              onOpen={toggleSource}
            />
          )}
          <div ref={editors} className="flex min-h-0 min-w-0 flex-1">
            <div
              className={sourceHidden ? 'hidden' : 'flex min-h-0 min-w-0'}
              style={{ flex: `${targetHidden ? 1 : sourceRatio} 1 0` }}
              {...driveFrom('source')}
            >
              <EditorPane
                title="Bản gốc"
                subtitle={sourceLanguage.name}
                status={sourceStatus}
                lockLabel={unlocked ? 'Đang sửa' : 'Đã khóa, chỉ đọc'}
                lockIcon={
                  unlocked ? (
                    <LockKeyholeMinimalisticUnlockedIcon
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-warning"
                    />
                  ) : (
                    <LockKeyholeMinimalisticIcon
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-subtle"
                    />
                  )
                }
                actions={
                  <>
                    <CompactButton
                      aria-pressed={syncScroll}
                      aria-label="Cuộn cùng bản dịch"
                      title={
                        syncScroll
                          ? 'Đang cuộn cùng bản dịch theo số đoạn. Bấm để cuộn riêng'
                          : 'Cuộn cùng bản dịch theo số đoạn'
                      }
                      onClick={() => usePaneLayoutStore.getState().setSyncScroll(!syncScroll)}
                      icon={<LinkMinimalistic2Icon size={16} />}
                    />
                    {/* Menu tùy chọn sửa hoặc thay thế bản gốc của chương. */}
                    <MenuRoot>
                      <MenuTrigger
                        render={
                          <CompactButton
                            aria-label="Thao tác với bản gốc"
                            icon={<MenuDotsIcon size={16} />}
                          />
                        }
                      />
                      <MenuPopup align="end">
                        <MenuItem onClick={() => setUnlocked((value) => !value)}>
                          {unlocked ? (
                            <LockKeyholeMinimalisticIcon size={14} className="text-subtle" />
                          ) : (
                            <PenNewSquareIcon size={14} className="text-subtle" />
                          )}
                          {unlocked ? 'Khóa lại bản gốc' : 'Sửa bản gốc'}
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            void confirmLeave({ reloadOnDiscard: true }).then((proceed) => {
                              if (proceed) onReplaceSource()
                            })
                          }}
                        >
                          <DocumentAddIcon size={14} className="text-subtle" />
                          Thay bản gốc…
                        </MenuItem>
                      </MenuPopup>
                    </MenuRoot>
                    <CompactButton
                      aria-label={'Thu gọn bản gốc (' + SOURCE_SHORTCUT + ')'}
                      title={'Thu gọn bản gốc (' + SOURCE_SHORTCUT + ')'}
                      onClick={toggleSource}
                      icon={<SidebarCloseIcon size={16} />}
                    />
                  </>
                }
                notice={
                  unlocked ? (
                    <div
                      role="note"
                      className="flex items-start gap-3 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-body-xs leading-normal"
                    >
                      <p className="min-w-0 flex-1">
                        Bạn đang sửa bản gốc. Chỉ nên sửa lỗi chính tả hoặc sót chữ; bản dịch đã có
                        không tự đổi theo.
                      </p>
                      <Button className="shrink-0" onClick={() => setUnlocked(false)}>
                        Khóa lại
                      </Button>
                    </div>
                  ) : undefined
                }
              >
                <TextEditor
                  key={`${chapter.id}:${sourceEpoch}`}
                  handleRef={sourceEditor}
                  record={source}
                  lang={work.sourceLanguage}
                  label="Bản gốc của chương"
                  store={sourceStore}
                  readOnly={!unlocked}
                  onSaved={onSourceSaved}
                  onStatusChange={setSourceStatus}
                  onTargetChange={onSourceCaret}
                  onParagraphChange={onSourceParagraph}
                  onScroll={onSourceScroll}
                />
              </EditorPane>
            </div>

            {!sourceHidden && !targetHidden && (
              <PaneDivider
                ratio={sourceRatio}
                container={editors}
                onRatioChange={usePaneLayoutStore.getState().setSourceRatio}
              />
            )}

            <div
              className={targetHidden ? 'hidden' : 'flex min-h-0 min-w-0'}
              style={{ flex: `${sourceHidden ? 1 : 1 - sourceRatio} 1 0` }}
              {...driveFrom('target')}
            >
              <EditorPane
                title="Bản dịch"
                subtitle="Tiếng Việt"
                status={targetStatus}
                actions={
                  <CompactButton
                    aria-label={'Thu gọn bản dịch (' + TARGET_SHORTCUT + ')'}
                    title={
                      aiOpen
                        ? 'Hỏi AI đang dùng bản dịch; đóng Hỏi AI để thu gọn'
                        : 'Thu gọn bản dịch (' + TARGET_SHORTCUT + ')'
                    }
                    disabled={aiOpen}
                    onClick={toggleTarget}
                    icon={<SidebarCloseIcon size={16} className="-scale-x-100" />}
                  />
                }
              >
                <TextEditor
                  key={`${chapter.id}:${targetEpoch}`}
                  handleRef={targetEditor}
                  record={target}
                  lang="vi"
                  label="Bản dịch của chương"
                  store={targetStore}
                  livePreview
                  images={imageStore}
                  emptyHint="Chưa có bản dịch. Gõ bản dịch vào đây, hoặc dán bản dịch có sẵn."
                  readOnly={agentLocked}
                  onSaved={onTargetSaved}
                  onStatusChange={setTargetStatus}
                  onTargetChange={onTargetCaret}
                  onTextChange={setTranslation}
                  onParagraphChange={onTargetParagraph}
                  onScroll={onTargetScroll}
                />
              </EditorPane>
            </div>
            {/* Thông báo khi cả hai khung đều đang thu gọn kèm nút mở lại. */}
            {sourceHidden && targetHidden && (
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-subtle px-6 text-center">
                <p className="text-body-sm text-subtle">Bản gốc và bản dịch đang thu gọn.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={toggleSource}>Hiện bản gốc</Button>
                  <Button onClick={toggleTarget}>Hiện bản dịch</Button>
                </div>
              </div>
            )}
            {targetHidden && (
              <FoldedPane
                label="Bản dịch"
                action={'Hiện bản dịch (' + TARGET_SHORTCUT + ')'}
                side="right"
                onOpen={toggleTarget}
              />
            )}
          </div>

          <div
            inert={!dockOpen || undefined}
            aria-hidden={!dockOpen || undefined}
            className={cn(
              'relative min-h-0 shrink-0 overflow-hidden border-default transition-[width] duration-(--mira-duration-base) ease-standard',
              dockOpen ? 'border-l' : 'w-0 border-l-0'
            )}
            style={{ width: dockOpen ? aiWidth : 0 }}
          >
            {dockOpen && <PanelResizeHandle width={aiWidth} onWidthChange={setAiWidth} />}
            <div className="flex h-full min-h-0 flex-col" style={{ width: aiWidth }}>
              {tabActive && !narrow && sidePanel}
            </div>
          </div>
          {tabActive && narrow && (
            <AssistantSideDrawer open={aiOpen} onOpenChange={setAiOpen}>
              {sidePanel}
            </AssistantSideDrawer>
          )}
        </div>
      )}

      {mode === 'full' && (
        <ChapterStatusBar
          workId={work.id}
          chapterId={chapter.id}
          translation={translation}
          statuses={[sourceStatus, targetStatus]}
          onOpenProposals={() => {
            if (!aiOpen) toggleAi()
          }}
        />
      )}

      <AiTranslateDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        workId={work.id}
        chapterId={chapter.id}
        onOpenSettings={onOpenSettings}
        onWritten={onTargetReplaced}
        finalFocus={translateOpener}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        workId={work.id}
        workTitle={work.title}
        // Cập nhật trạng thái có bản dịch hay không dựa trên nội dung thực tế trong khung soạn thảo.
        chapter={{ ...chapter, hasTarget: translation.trim() !== '' }}
      />
    </div>
  )
}

/**
 * Thanh dải hẹp 32px đại diện cho khung soạn thảo khi bị thu gọn ở mép màn hình.
 */
/** Cờ đánh dấu người dùng chủ động thu gọn khung bằng tay để tự động chuyển focus sang nút mở. */
let foldedByHand = false

function FoldedPane({
  label,
  action,
  side,
  onOpen
}: {
  label: string
  /** Nhãn hành động của nút kèm phím tắt. */
  action: string
  side: 'left' | 'right'
  onOpen(): void
}): JSX.Element {
  // Chuyển focus bàn phím sang nút mở trên thanh dải khi khung soạn thảo bị ẩn.
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!foldedByHand) return
    foldedByHand = false
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      const lost =
        active === null ||
        active === document.body ||
        (active instanceof HTMLElement && !active.checkVisibility())
      if (lost) strip.current?.querySelector<HTMLElement>('button')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div
      ref={strip}
      className={
        'flex w-8 shrink-0 flex-col items-center gap-2 border-default bg-surface py-3 transition-opacity duration-(--mira-duration-fast) ' +
        (side === 'left' ? 'border-r' : 'border-l')
      }
    >
      <CompactButton
        aria-label={action}
        title={action}
        onClick={onOpen}
        icon={
          <SidebarOpenIcon size={16} className={side === 'right' ? '-scale-x-100' : undefined} />
        }
      />
      <span
        aria-hidden="true"
        className="text-body-xs font-semibold text-subtle [writing-mode:vertical-rl]"
      >
        {label}
      </span>
    </div>
  )
}
