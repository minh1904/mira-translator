import type { AccountProvider, LoginStart, LoginStatus, UsageWindowView } from './aiAccounts'
import type {
  AddModelEntriesInput,
  ConnectionTestResult,
  EndpointProbeResult,
  EnsureWithKeyInput,
  ProbeEndpointInput,
  ConnectionView,
  CreateConnectionInput,
  ModelEntryTestResult,
  UpdateConnectionInput,
  UpdateModelEntryInput
} from './aiConnections'
import type {
  AgentCancelInput,
  AgentCancelResult,
  AgentOperation,
  AgentOperationDetailView,
  AgentSendInput,
  AgentSendResult,
  AgentSessionDetailView,
  AgentSessionView,
  AgentToolCallDetailView,
  AgentContextSearchGroup,
  AgentEditsInput,
  AgentEditsResult,
  AgentRevertAndResendInput,
  AgentRevertResult,
  AgentContextSearchInput,
  AgentSetPermissionLevelInput,
  AgentStreamEvent,
  AgentTargetChanged,
  AgentUndoInput,
  AgentUndoResult,
  AgentWriteIntent,
  AgentWriteIntentAck
} from './agent'
import type {
  AgentTaskChanged,
  AgentTaskControlInput,
  AgentTaskCreateInput,
  AgentTaskDetailView,
  AgentTaskSummary,
  AgentTaskView,
  AgentTaskSteerInput,
  AgentTaskSteerResult
} from './agentTask'
import type { ChatChunk, ChatSendInput, ChatStartResult } from './aiChat'
import type { AcceptProposalInput, AcceptProposalResult, ProposalQueueItem } from './aiProposals'
import type { AiSessionView, AiTurnView } from './aiHistory'
import type {
  ParagraphBatchInput,
  ParagraphBatchResult,
  ParagraphFinalizeInput,
  ParagraphFinalizeResult,
  ParagraphPlanInput,
  ParagraphTranslationPlan
} from './aiTranslateProposals'
import type { AiPreferences, MainModel, ModelRef } from './aiPreferences'
import type { BackupExported } from './backup'
import type { ChapterChange, ChapterItem, ChaptersChange } from './chapters'
import type { ExportChapterInput, ExportProgress, ExportResult, ExportWorkInput } from './export'
import type { LinkRecord } from './links'
import type { RowSaved } from './rows'
import type { CreateWorkInput, WorkList, WorkPatch, WorkSummary } from './library'
import type { Result } from './result'
import type { QaDismissInput, TaskQualityView } from './taskQuality'
import type { WorkspaceLoad, WorkspaceState } from './workspace'
import type { SegmentInput, TextRecord, TextSide } from './text'
import type {
  AppliedContext,
  ContextEntryItem,
  ContextKind,
  ContextOrigin,
  ContextStatus,
  ContextReviewCommand,
  ContextReviewInfo,
  ContextReviewOutcome,
  GlossaryComplianceReport,
  ImportNamesResult
} from './glossary'
import type {
  AddressingComplianceReport,
  AddressingDyadItem,
  AddressingDyadResolved,
  CharacterGender,
  CharacterItem,
  ParagraphAddressingCheckItem
} from './addressing'
import type {
  SourceBinding,
  SourceBindingCreateInput,
  SourceBindingDeleteInput,
  SourceBindingIdentifyInput,
  SourceBindingIdentifyResult,
  SourceBindingPreview,
  SourceBindingPreviewCreateInput,
  SourceBindingsListInput,
  SourceBindingUpdateInput,
  SourceCatalogGetInput,
  SourceCatalogDownloadInput,
  SourceCatalogDownloadRangeInput,
  SourceCatalogDownloadResult,
  SourceCatalogItem,
  SourceCatalogListInput,
  SourceCatalogPage,
  SourceCatalogReorderInput,
  SourceDownloadProgress,
  SourceDescriptor,
  SourceRegistryListInput,
  SourceSyncCancelInput,
  SourceSyncProgress,
  SourceSyncRun,
  SourceSyncStartInput,
  SourceSyncStatusInput,
  SourceUpdateApplyInput,
  SourceUpdateMarkSeenInput,
  SourceUpdatePreviewApplyInput,
  SourceUpdatesListInput,
  SourceUpdatesPage
} from './sources'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

/** Hai chế độ giao diện khung cửa sổ ứng dụng: sáng và tối. */
export type ChromeTheme = 'light' | 'dark'

export interface WorksApi {
  list(): Promise<Result<WorkList>>
  get(id: string): Promise<Result<WorkSummary>>
  create(input: CreateWorkInput): Promise<Result<WorkSummary>>
  update(id: string, patch: WorkPatch): Promise<Result<WorkSummary>>
  /** Ảnh bìa dưới dạng JPEG data URL, hoặc null khi tác phẩm chưa có ảnh bìa. */
  getCover(id: string): Promise<Result<string | null>>
  /** Truyền null để xóa ảnh bìa. */
  setCover(id: string, cover: string | null): Promise<Result<WorkSummary>>
}

export interface ChaptersApi {
  list(workId: string): Promise<Result<{ chapters: ChapterItem[] }>>
  /** Thêm một chương mới; nếu tên rỗng hoặc thiếu sẽ hiển thị mặc định "Chương N". */
  create(workId: string, title?: string): Promise<Result<ChapterChange>>
  rename(workId: string, chapterId: string, title: string): Promise<Result<ChapterChange>>
  /** `to` là vị trí kết quả 1-indexed của chương sau khi di chuyển. */
  move(workId: string, chapterId: string, to: number): Promise<Result<ChaptersChange>>
  delete(workId: string, chapterId: string): Promise<Result<ChaptersChange>>
  /** Đánh dấu chương đang được làm việc để nút "Tiếp tục" mở lại. */
  open(workId: string, chapterId: string): Promise<Result<{ work: WorkSummary }>>
}

export interface TextApi {
  /** Phía văn bản chưa từng lưu sẽ trả về rỗng ở revision 0. */
  get(workId: string, chapterId: string, side: TextSide): Promise<Result<TextRecord>>
  /** Thay thế toàn bộ văn bản và danh sách đoạn văn; `expectedRev` là revision đã đọc trước đó. */
  save(
    workId: string,
    chapterId: string,
    side: TextSide,
    content: string,
    expectedRev: number,
    segments: SegmentInput[]
  ): Promise<Result<TextRecord>>
}

export interface RowsApi {
  /** Danh sách liên kết của chương, chỉ định đoạn văn bản dịch tương ứng với đoạn nguồn nào. */
  links(workId: string, chapterId: string): Promise<Result<{ links: LinkRecord[] }>>
  /**
   * Lưu bản dịch của một hàng vào chương cùng với các segment và liên kết tương ứng.
   * `expectedRev` là revision của bản dịch đã đọc trước đó. Văn bản rỗng sẽ xóa hàng.
   */
  save(
    workId: string,
    chapterId: string,
    sourceId: string,
    text: string,
    expectedRev: number
  ): Promise<Result<RowSaved>>
  /** Xác nhận một hàng: liên kết đã được xem xét và chấp thuận. */
  review(
    workId: string,
    chapterId: string,
    sourceId: string
  ): Promise<Result<{ links: LinkRecord[] }>>
  /** Tự động ghép nối các đoạn văn bản dịch chưa liên kết với các hàng chưa có bản dịch theo thứ tự. */
  autoPair(
    workId: string,
    chapterId: string
  ): Promise<Result<{ links: LinkRecord[]; paired: number }>>
}

export interface ImagesApi {
  /** Lưu trữ ảnh (dạng data URL) dán hoặc kéo thả vào bản dịch chương; trả về ID của ảnh. */
  put(workId: string, data: string): Promise<Result<{ id: string }>>
  /** Lấy nội dung ảnh dưới dạng data URL, hoặc null nếu không tồn tại. */
  get(workId: string, imageId: string): Promise<Result<string | null>>
  delete(workId: string, imageId: string): Promise<Result<void>>
}

export interface BackupApi {
  /**
   * Mở hộp thoại "Lưu bản sao" và ghi bản sao lưu tác phẩm ra tệp.
   * Trả về mã lỗi `cancelled` nếu người dùng hủy hộp thoại.
   */
  export(workId: string): Promise<Result<BackupExported>>
  /** Mở hộp thoại chọn tệp và khôi phục bản sao lưu vào thư viện thành tác phẩm mới. */
  restore(): Promise<Result<WorkSummary>>
}

/** Dịch một chương theo đoạn; mỗi lô lưu đề xuất, finalize có thể tự Accept phần an toàn. */
export interface AiTranslateApi {
  paragraphPlan(input: ParagraphPlanInput): Promise<Result<ParagraphTranslationPlan>>
  paragraphBatch(input: ParagraphBatchInput): Promise<Result<ParagraphBatchResult>>
  paragraphFinalize(input: ParagraphFinalizeInput): Promise<Result<ParagraphFinalizeResult>>
}

/**
 * Hỏi AI về chỗ đang sửa. Khác `AiTranslateApi` ở chỗ một lượt **không** là một lời gọi trả kết
 * quả: `send` trả ngay một `requestId` rồi chữ về dần qua `onChunk`, và `cancel` dừng theo id đó.
 */
export interface AiChatApi {
  /** Bắt đầu một lượt. Trả `requestId` **ngay**; nội dung không bao giờ đi qua đường trả về này. */
  send(input: ChatSendInput): Promise<Result<ChatStartResult>>
  cancel(requestId: string): Promise<Result<void>>
  /**
   * Nghe từng phần của mọi lượt đang chạy. Trả về hàm bỏ đăng ký, nên chỗ gọi dọn được mà không
   * cần biết tên kênh — và `useEffect` dọn được bằng chính giá trị trả về.
   */
  onChunk(listener: (chunk: ChatChunk) => void): () => void
}

export interface AiProposalsApi {
  accept(input: AcceptProposalInput): Promise<Result<AcceptProposalResult>>
  deny(workId: string, chapterId: string, partId: string): Promise<Result<void>>
  acceptAll(
    workId: string,
    chapterId: string,
    commandId: string
  ): Promise<Result<AcceptProposalResult>>
  undo(
    workId: string,
    chapterId: string
  ): Promise<Result<{ content: string; rev: number; commandId: string }>>
  listChapter(
    workId: string,
    chapterId: string
  ): Promise<Result<{ proposals: ProposalQueueItem[]; undoAvailable: boolean }>>
  pendingCounts(
    workId: string
  ): Promise<Result<{ counts: Array<{ chapterId: string; count: number }> }>>
}

export interface AiSessionsApi {
  list(workId: string): Promise<Result<{ sessions: AiSessionView[] }>>
  turns(workId: string, sessionId: string): Promise<Result<{ turns: AiTurnView[] }>>
}

/**
 * Mục model của một kết nối: thêm, sửa, nhân bản, xóa, xếp thứ tự, và kiểm tra. Mọi lời gọi trả về kết nối đã
 * cập nhật (trừ `test`), nên giao diện thay đúng kết nối đó mà không phải tải lại cả danh sách.
 */
export interface AiModelsApi {
  /** Thêm mục vào cuối danh sách, mỗi mục một model (gõ tay được, kể cả khi endpoint không liệt kê). */
  add(connectionId: string, items: AddModelEntriesInput['items']): Promise<Result<ConnectionView>>
  /**
   * Sửa tên, tên model thật hay cài đặt. `patch.settings` là một bản vá: chỉ trường nêu thì đổi, `null` là bỏ
   * trường (về mặc định).
   */
  update(entryId: string, patch: UpdateModelEntryInput['patch']): Promise<Result<ConnectionView>>
  duplicate(entryId: string): Promise<Result<ConnectionView>>
  delete(entryId: string): Promise<Result<ConnectionView>>
  reorder(connectionId: string, ids: string[]): Promise<Result<ConnectionView>>
  /**
   * Gửi một yêu cầu nhỏ bằng đúng cài đặt **đã lưu** của mục. Thành công trả thời gian và token; thất bại là
   * một lỗi mang lời gốc của nhà cung cấp. Không đổi gì đã lưu, và có tốn một ít token.
   */
  test(entryId: string): Promise<Result<ModelEntryTestResult>>
}

export interface AiApi {
  list(): Promise<Result<{ connections: ConnectionView[] }>>
  create(input: CreateConnectionInput): Promise<Result<ConnectionView>>
  update(id: string, patch: UpdateConnectionInput['patch']): Promise<Result<ConnectionView>>
  delete(id: string): Promise<Result<{ connections: ConnectionView[] }>>
  /** Gọi `GET {base}/models`: xác nhận kết nối và lấy luôn danh sách model. */
  test(id: string): Promise<Result<ConnectionTestResult>>
  /** Kiểm hai bước: `/models` (có hoặc không `/v1`) rồi một request chat 1 token. Không lưu gì. */
  probe(input: ProbeEndpointInput): Promise<Result<EndpointProbeResult>>
  /** Cài đặt › Model: model chính, dự phòng, và việc onboarding đã được để sau. */
  preferences: {
    get(): Promise<Result<AiPreferences>>
    setMain(main: MainModel | null): Promise<Result<AiPreferences>>
    setFallbacks(fallbacks: ModelRef[]): Promise<Result<AiPreferences>>
    setOnboardingSkipped(skipped: boolean): Promise<Result<AiPreferences>>
  }
  /** Dán khóa vào thẻ provider: tạo kết nối từ preset nếu chưa có, rồi thêm khóa. */
  ensureWithKey(input: EnsureWithKeyInput): Promise<Result<ConnectionView>>
  /** Lần duy nhất khóa đi từ giao diện vào; về sau chỉ nhận lại bốn ký tự cuối. */
  addKey(id: string, secret: string): Promise<Result<ConnectionView>>
  removeKey(id: string, keyId: string): Promise<Result<ConnectionView>>
  models: AiModelsApi
  accounts: AiAccountsApi
  translate: AiTranslateApi
  chat: AiChatApi
  proposals: AiProposalsApi
  sessions: AiSessionsApi
}

/** Quản lý đăng nhập tài khoản qua IPC. Không bao giờ truyền token về renderer. */
export interface AiAccountsApi {
  start(provider: AccountProvider): Promise<Result<LoginStart>>
  poll(sessionId: string): Promise<Result<LoginStatus>>
  cancel(sessionId: string): Promise<Result<void>>
  reopen(sessionId: string): Promise<Result<void>>
  disconnect(connectionId: string): Promise<Result<{ connections: ConnectionView[] }>>
  usage(connectionId: string): Promise<Result<UsageWindowView[]>>
}

export interface GlossaryApi {
  list(options: {
    workId: string
    kind?: ContextKind
    status?: ContextStatus
    query?: string
    chapterId?: string
  }): Promise<Result<{ entries: ContextEntryItem[] }>>
  get(options: { workId: string; entryId: string }): Promise<Result<ContextEntryItem>>
  create(input: {
    workId: string
    kind?: ContextKind
    source: string
    target: string
    status?: ContextStatus
    origin?: ContextOrigin
    forbidden?: boolean
    fromChapterId?: string | null
    toChapterId?: string | null
    notes?: string | null
    aliases?: string[]
  }): Promise<Result<ContextEntryItem>>
  update(input: {
    workId: string
    entryId: string
    source?: string
    target?: string
    status?: ContextStatus
    origin?: ContextOrigin
    forbidden?: boolean
    fromChapterId?: string | null
    toChapterId?: string | null
    notes?: string | null
    aliases?: string[]
  }): Promise<Result<ContextEntryItem>>
  delete(options: { workId: string; entryId: string }): Promise<Result<void>>
  importNames(input: { workId: string; content: string }): Promise<Result<ImportNamesResult>>
  /** Approve, edit then approve, or reject a pending entry, guarded by `expectedUpdatedAt`. */
  review(input: {
    workId: string
    command: ContextReviewCommand
  }): Promise<Result<ContextEntryItem>>
  bulkApprove(input: {
    workId: string
    items: Array<{ entryId: string; expectedUpdatedAt: number }>
  }): Promise<Result<{ results: ContextReviewOutcome[] }>>
  reviewInfo(input: {
    workId: string
    entryIds?: string[]
  }): Promise<Result<{ entries: ContextReviewInfo[] }>>
  checkCompliance(input: {
    workId: string
    chapterId: string
    sourceText: string
    targetText: string
  }): Promise<Result<GlossaryComplianceReport>>
  applied(input: { workId: string; chapterId: string }): Promise<Result<AppliedContext>>
}

export interface AddressingApi {
  characters: {
    list(options: {
      workId: string
      status?: ContextStatus
      query?: string
    }): Promise<Result<{ characters: CharacterItem[] }>>
    get(options: { workId: string; characterId: string }): Promise<Result<CharacterItem>>
    create(input: {
      workId: string
      source: string
      target: string
      gender?: CharacterGender
      role?: string | null
      status?: ContextStatus
      notes?: string | null
      aliases?: string[]
    }): Promise<Result<CharacterItem>>
    update(input: {
      workId: string
      characterId: string
      source?: string
      target?: string
      gender?: CharacterGender
      role?: string | null
      status?: ContextStatus
      notes?: string | null
      aliases?: string[]
    }): Promise<Result<CharacterItem>>
    delete(options: { workId: string; characterId: string }): Promise<Result<void>>
  }
  dyads: {
    list(options: {
      workId: string
      chapterId?: string
      status?: ContextStatus
    }): Promise<Result<{ dyads: AddressingDyadItem[] }>>
    get(options: { workId: string; dyadId: string }): Promise<Result<AddressingDyadItem>>
    set(input: {
      workId: string
      dyadId?: string
      sourceCharacterId: string
      targetCharacterId: string
      speakerPronoun: string
      recipientPronoun: string
      formality?: string | null
      fromChapterId?: string | null
      toChapterId?: string | null
      status?: ContextStatus
      notes?: string | null
    }): Promise<Result<AddressingDyadItem>>
    delete(options: { workId: string; dyadId: string }): Promise<Result<void>>
    effective(options: {
      workId: string
      chapterId: string
    }): Promise<Result<{ dyads: AddressingDyadResolved[] }>>
  }
  checkCompliance(input: {
    workId: string
    chapterId: string
    paragraphs: (string | ParagraphAddressingCheckItem)[]
  }): Promise<Result<AddressingComplianceReport>>
}

export interface ExportApi {
  exportChapter(input: ExportChapterInput): Promise<Result<ExportResult>>
  exportWork(input: ExportWorkInput): Promise<Result<ExportResult>>
  /** Hủy lượt xuất bản tác phẩm đang chạy sau khi chương hiện tại hoàn tất. */
  cancel(workId: string): Promise<Result<void>>
  /** Mở tệp hoặc thư mục mà phiên này vừa xuất ra trên trình quản lý tệp. */
  reveal(path: string): Promise<Result<void>>
  /** Đăng ký lắng nghe tiến trình xuất nhiều chương; trả về hàm hủy đăng ký. */
  onProgress(listener: (progress: ExportProgress) => void): () => void
}

export interface SourcesApi {
  catalog: {
    list(input: SourceCatalogListInput): Promise<Result<SourceCatalogPage>>
    get(input: SourceCatalogGetInput): Promise<Result<SourceCatalogItem>>
    download(input: SourceCatalogDownloadInput): Promise<Result<SourceCatalogDownloadResult>>
    downloadRange(input: SourceCatalogDownloadRangeInput): Promise<Result<void>>
    reorderBySource(input: SourceCatalogReorderInput): Promise<Result<{ reorderedCount: number }>>
    onDownloadProgress(listener: (progress: SourceDownloadProgress) => void): () => void
  }
  bindings: {
    list(input: SourceBindingsListInput): Promise<Result<SourceBinding[]>>
    identify(input: SourceBindingIdentifyInput): Promise<Result<SourceBindingIdentifyResult | null>>
    previewCreate(input: SourceBindingPreviewCreateInput): Promise<Result<SourceBindingPreview>>
    create(input: SourceBindingCreateInput): Promise<Result<SourceBinding>>
    update(input: SourceBindingUpdateInput): Promise<Result<SourceBinding>>
    delete(input: SourceBindingDeleteInput): Promise<Result<void>>
  }
  sync: {
    start(input: SourceSyncStartInput): Promise<Result<SourceSyncRun>>
    cancel(input: SourceSyncCancelInput): Promise<Result<SourceSyncRun>>
    status(input: SourceSyncStatusInput): Promise<Result<SourceSyncRun>>
    onProgress(listener: (progress: SourceSyncProgress) => void): () => void
  }
  updates: {
    list(input: SourceUpdatesListInput): Promise<Result<SourceUpdatesPage>>
    markSeen(input: SourceUpdateMarkSeenInput): Promise<Result<{ updatedCount: number }>>
    previewApply(input: SourceUpdatePreviewApplyInput): Promise<Result<unknown>>
    apply(input: SourceUpdateApplyInput): Promise<Result<unknown>>
  }
  registry: {
    list(input?: SourceRegistryListInput): Promise<Result<{ sources: SourceDescriptor[] }>>
  }
}

export interface AgentApi {
  sessions: {
    list(options?: { limit?: number }): Promise<Result<{ sessions: AgentSessionView[] }>>
    get(sessionId: string): Promise<Result<AgentSessionDetailView>>
    create(title?: string): Promise<Result<AgentSessionView>>
    setPermissionLevel(input: AgentSetPermissionLevelInput): Promise<Result<AgentSessionView>>
  }
  turn: {
    send(input: AgentSendInput): Promise<Result<AgentSendResult>>
    cancel(input: AgentCancelInput): Promise<Result<AgentCancelResult>>
    /** Restores the checkpoint before a turn: undoes its writes and the later turns', hides them. */
    revert(turnId: string): Promise<Result<AgentRevertResult>>
    /** Restores the checkpoint before a turn, then sends the edited command as a new turn. */
    revertAndResend(input: AgentRevertAndResendInput): Promise<Result<AgentSendResult>>
  }
  edits: {
    /** Keeps one chapter of the edited bar, or every row without `chapter`. */
    keep(input: AgentEditsInput): Promise<Result<AgentEditsResult>>
    /** Undoes one chapter of the edited bar, or every row without `chapter`. */
    undo(input: AgentEditsInput): Promise<Result<AgentEditsResult>>
  }
  toolCalls: {
    /** One stored call with its full result, read when the transcript opens it. */
    get(toolCallId: string): Promise<Result<AgentToolCallDetailView>>
  }
  context: {
    /** Rows of the + picker; entries waiting for review never appear. */
    search(input: AgentContextSearchInput): Promise<Result<AgentContextSearchGroup[]>>
  }
  operations: {
    /** The latest operations of every chat and task, newest change first. */
    list(limit: number): Promise<Result<AgentOperation[]>>
    get(operationId: string): Promise<Result<AgentOperationDetailView>>
    undo(input: AgentUndoInput): Promise<Result<AgentUndoResult>>
  }
  coordinator: {
    ackWriteIntent(input: AgentWriteIntentAck): Promise<Result<void>>
    onWriteIntent(listener: (intent: AgentWriteIntent) => void): () => void
    onTargetChanged(listener: (event: AgentTargetChanged) => void): () => void
  }
  onStreamEvent(listener: (event: AgentStreamEvent) => void): () => void
  tasks: {
    list(filter?: { workId?: string }): Promise<Result<{ tasks: AgentTaskSummary[] }>>
    get(taskId: string): Promise<Result<AgentTaskDetailView>>
    create(input: AgentTaskCreateInput): Promise<Result<AgentTaskView>>
    control(input: AgentTaskControlInput): Promise<Result<AgentTaskView>>
    steer(input: AgentTaskSteerInput): Promise<Result<AgentTaskSteerResult>>
    /** Open quality warnings of every item, computed now from each item's pinned snapshot. */
    quality(taskId: string): Promise<Result<TaskQualityView>>
    dismiss(input: QaDismissInput): Promise<Result<void>>
    onChanged(listener: (event: AgentTaskChanged) => void): () => void
  }
}

export interface DesktopApi {
  getAppInfo(): Promise<AppInfo>
  /** Mở liên kết https trên trình duyệt; chỉ cho phép các host an toàn. */
  openExternal(url: string): Promise<void>
  /**
   * Thiết lập giao diện màu sắc cho các nút thu nhỏ/phóng to/đóng cửa sổ theo giao diện trang.
   */
  setChromeTheme(theme: ChromeTheme): Promise<void>
  works: WorksApi
  workspace: {
    load(): Promise<Result<WorkspaceLoad>>
    save(state: WorkspaceState): Promise<Result<void>>
  }
  chapters: ChaptersApi
  text: TextApi
  rows: RowsApi
  images: ImagesApi
  backup: BackupApi
  ai: AiApi
  agent: AgentApi
  glossary: GlossaryApi
  addressing: AddressingApi
  export: ExportApi
  sources: SourcesApi
}
