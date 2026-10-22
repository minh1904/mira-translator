import type {
  AccountProvider,
  LoginStart,
  LoginStatus,
  UsageWindowView
} from '../shared/contracts/aiAccounts'
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChatChunk, ChatSendInput, ChatStartResult } from '../shared/contracts/aiChat'
import type {
  AcceptProposalInput,
  AcceptProposalResult,
  ProposalQueueItem
} from '../shared/contracts/aiProposals'
import type {
  AgentOperation,
  AgentOperationDetailView,
  AgentSendResult,
  AgentSessionDetailView,
  AgentSessionView,
  AgentToolCallDetailView,
  AgentContextSearchGroup,
  AgentEditsResult,
  AgentRevertResult,
  AgentStreamEvent,
  AgentTargetChanged,
  AgentUndoResult,
  AgentWriteIntent
} from '../shared/contracts/agent'
import type {
  AgentTaskChanged,
  AgentTaskDetailView,
  AgentTaskSummary,
  AgentTaskView,
  AgentTaskSteerResult
} from '../shared/contracts/agentTask'
import type { AiSessionView, AiTurnView } from '../shared/contracts/aiHistory'
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
} from '../shared/contracts/aiConnections'
import type {
  ParagraphBatchInput,
  ParagraphBatchResult,
  ParagraphFinalizeInput,
  ParagraphFinalizeResult,
  ParagraphPlanInput,
  ParagraphTranslationPlan
} from '../shared/contracts/aiTranslateProposals'
import type { AiPreferences, MainModel, ModelRef } from '../shared/contracts/aiPreferences'
import type { BackupExported } from '../shared/contracts/backup'
import type { ExportProgress, ExportResult } from '../shared/contracts/export'
import { CHANNELS, EVENT_CHANNELS } from '../shared/contracts/channels'
import type { ChapterChange, ChapterItem, ChaptersChange } from '../shared/contracts/chapters'
import type { AppInfo, ChromeTheme, DesktopApi } from '../shared/contracts/desktopApi'
import type { CreateWorkInput, WorkList, WorkPatch, WorkSummary } from '../shared/contracts/library'
import type { Result } from '../shared/contracts/result'
import type { WorkspaceLoad, WorkspaceState } from '../shared/contracts/workspace'
import type { SegmentInput, TextRecord, TextSide } from '../shared/contracts/text'
import type { TaskQualityView } from '../shared/contracts/taskQuality'
import type {
  AppliedContext,
  ContextEntryItem,
  ContextReviewInfo,
  ContextReviewOutcome,
  ImportNamesResult
} from '../shared/contracts/glossary'
import type { GlossaryComplianceReport } from '../shared/context/glossaryCompliance'
import type {
  AddressingDyadItem,
  AddressingDyadResolved,
  CharacterItem
} from '../shared/contracts/addressing'
import type { AddressingComplianceReport } from '../shared/context/addressingCompliance'
import type {
  SourceBinding,
  SourceBindingIdentifyResult,
  SourceBindingPreview,
  SourceCatalogItem,
  SourceCatalogPage,
  SourceCatalogDownloadResult,
  SourceDescriptor,
  SourceDownloadProgress,
  SourceSyncProgress,
  SourceSyncRun,
  SourceUpdatesPage
} from '../shared/contracts/sources'

const desktopApi: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url) as Promise<void>,
  setChromeTheme: (theme: ChromeTheme) =>
    ipcRenderer.invoke('app:chrome-theme', theme) as Promise<void>,
  workspace: {
    load: () => ipcRenderer.invoke(CHANNELS.workspaceLoad) as Promise<Result<WorkspaceLoad>>,
    save: (state: WorkspaceState) =>
      ipcRenderer.invoke(CHANNELS.workspaceSave, state) as Promise<Result<void>>
  },
  works: {
    list: () => ipcRenderer.invoke(CHANNELS.worksList) as Promise<Result<WorkList>>,
    get: (id: string) =>
      ipcRenderer.invoke(CHANNELS.worksGet, { id }) as Promise<Result<WorkSummary>>,
    create: (input: CreateWorkInput) =>
      ipcRenderer.invoke(CHANNELS.worksCreate, input) as Promise<Result<WorkSummary>>,
    update: (id: string, patch: WorkPatch) =>
      ipcRenderer.invoke(CHANNELS.worksUpdate, { id, patch }) as Promise<Result<WorkSummary>>,
    getCover: (id: string) =>
      ipcRenderer.invoke(CHANNELS.worksCoverGet, { id }) as Promise<Result<string | null>>,
    setCover: (id: string, cover: string | null) =>
      ipcRenderer.invoke(CHANNELS.worksCoverSet, { id, cover }) as Promise<Result<WorkSummary>>
  },
  chapters: {
    list: (workId: string) =>
      ipcRenderer.invoke(CHANNELS.chaptersList, { workId }) as Promise<
        Result<{ chapters: ChapterItem[] }>
      >,
    create: (workId: string, title?: string) =>
      ipcRenderer.invoke(CHANNELS.chaptersCreate, { workId, title }) as Promise<
        Result<ChapterChange>
      >,
    rename: (workId: string, chapterId: string, title: string) =>
      ipcRenderer.invoke(CHANNELS.chaptersRename, { workId, chapterId, title }) as Promise<
        Result<ChapterChange>
      >,
    move: (workId: string, chapterId: string, to: number) =>
      ipcRenderer.invoke(CHANNELS.chaptersMove, { workId, chapterId, to }) as Promise<
        Result<ChaptersChange>
      >,
    delete: (workId: string, chapterId: string) =>
      ipcRenderer.invoke(CHANNELS.chaptersDelete, { workId, chapterId }) as Promise<
        Result<ChaptersChange>
      >,
    open: (workId: string, chapterId: string) =>
      ipcRenderer.invoke(CHANNELS.chaptersOpen, { workId, chapterId }) as Promise<
        Result<{ work: WorkSummary }>
      >
  },
  text: {
    get: (workId: string, chapterId: string, side: TextSide) =>
      ipcRenderer.invoke(CHANNELS.textGet, { workId, chapterId, side }) as Promise<
        Result<TextRecord>
      >,
    save: (
      workId: string,
      chapterId: string,
      side: TextSide,
      content: string,
      expectedRev: number,
      segments: SegmentInput[]
    ) =>
      ipcRenderer.invoke(CHANNELS.textSave, {
        workId,
        chapterId,
        side,
        content,
        expectedRev,
        segments
      }) as Promise<Result<TextRecord>>
  },
  images: {
    put: (workId: string, data: string) =>
      ipcRenderer.invoke(CHANNELS.imagesPut, { workId, data }) as Promise<Result<{ id: string }>>,
    get: (workId: string, imageId: string) =>
      ipcRenderer.invoke(CHANNELS.imagesGet, { workId, imageId }) as Promise<Result<string | null>>,
    delete: (workId: string, imageId: string) =>
      ipcRenderer.invoke(CHANNELS.imagesDelete, { workId, imageId }) as Promise<Result<void>>
  },
  backup: {
    export: (workId: string) =>
      ipcRenderer.invoke(CHANNELS.backupExport, { workId }) as Promise<Result<BackupExported>>,
    restore: () => ipcRenderer.invoke(CHANNELS.backupRestore) as Promise<Result<WorkSummary>>
  },
  ai: {
    list: () =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsList) as Promise<
        Result<{ connections: ConnectionView[] }>
      >,
    create: (input: CreateConnectionInput) =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsCreate, input) as Promise<Result<ConnectionView>>,
    update: (id: string, patch: UpdateConnectionInput['patch']) =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsUpdate, { id, patch }) as Promise<
        Result<ConnectionView>
      >,
    delete: (id: string) =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsDelete, { id }) as Promise<
        Result<{ connections: ConnectionView[] }>
      >,
    test: (id: string) =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsTest, { id }) as Promise<
        Result<ConnectionTestResult>
      >,
    preferences: {
      get: () => ipcRenderer.invoke(CHANNELS.aiPreferencesGet) as Promise<Result<AiPreferences>>,
      setMain: (main: MainModel | null) =>
        ipcRenderer.invoke(CHANNELS.aiPreferencesSetMain, { main }) as Promise<
          Result<AiPreferences>
        >,
      setFallbacks: (fallbacks: ModelRef[]) =>
        ipcRenderer.invoke(CHANNELS.aiPreferencesSetFallbacks, { fallbacks }) as Promise<
          Result<AiPreferences>
        >,
      setOnboardingSkipped: (skipped: boolean) =>
        ipcRenderer.invoke(CHANNELS.aiPreferencesSetOnboardingSkipped, { skipped }) as Promise<
          Result<AiPreferences>
        >
    },
    probe: (input: ProbeEndpointInput) =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsProbe, input) as Promise<
        Result<EndpointProbeResult>
      >,
    ensureWithKey: (input: EnsureWithKeyInput) =>
      ipcRenderer.invoke(CHANNELS.aiConnectionsEnsureWithKey, input) as Promise<
        Result<ConnectionView>
      >,
    addKey: (id: string, secret: string) =>
      ipcRenderer.invoke(CHANNELS.aiKeysAdd, { id, secret }) as Promise<Result<ConnectionView>>,
    removeKey: (id: string, keyId: string) =>
      ipcRenderer.invoke(CHANNELS.aiKeysRemove, { id, keyId }) as Promise<Result<ConnectionView>>,
    accounts: {
      start: (provider: AccountProvider) =>
        ipcRenderer.invoke(CHANNELS.aiAccountsLoginStart, { provider }) as Promise<
          Result<LoginStart>
        >,
      poll: (sessionId: string) =>
        ipcRenderer.invoke(CHANNELS.aiAccountsLoginPoll, { sessionId }) as Promise<
          Result<LoginStatus>
        >,
      cancel: (sessionId: string) =>
        ipcRenderer.invoke(CHANNELS.aiAccountsLoginCancel, { sessionId }) as Promise<Result<void>>,
      reopen: (sessionId: string) =>
        ipcRenderer.invoke(CHANNELS.aiAccountsLoginReopen, { sessionId }) as Promise<Result<void>>,
      disconnect: (connectionId: string) =>
        ipcRenderer.invoke(CHANNELS.aiAccountsDisconnect, { connectionId }) as Promise<
          Result<{ connections: ConnectionView[] }>
        >,
      usage: (connectionId: string) =>
        ipcRenderer.invoke(CHANNELS.aiAccountsUsage, { connectionId }) as Promise<
          Result<UsageWindowView[]>
        >
    },
    models: {
      add: (connectionId: string, items: AddModelEntriesInput['items']) =>
        ipcRenderer.invoke(CHANNELS.aiModelsAdd, { connectionId, items }) as Promise<
          Result<ConnectionView>
        >,
      update: (entryId: string, patch: UpdateModelEntryInput['patch']) =>
        ipcRenderer.invoke(CHANNELS.aiModelsUpdate, { entryId, patch }) as Promise<
          Result<ConnectionView>
        >,
      duplicate: (entryId: string) =>
        ipcRenderer.invoke(CHANNELS.aiModelsDuplicate, { entryId }) as Promise<
          Result<ConnectionView>
        >,
      delete: (entryId: string) =>
        ipcRenderer.invoke(CHANNELS.aiModelsDelete, { entryId }) as Promise<Result<ConnectionView>>,
      reorder: (connectionId: string, ids: string[]) =>
        ipcRenderer.invoke(CHANNELS.aiModelsReorder, { connectionId, ids }) as Promise<
          Result<ConnectionView>
        >,
      test: (entryId: string) =>
        ipcRenderer.invoke(CHANNELS.aiModelsTest, { entryId }) as Promise<
          Result<ModelEntryTestResult>
        >
    },
    translate: {
      paragraphPlan: (input: ParagraphPlanInput) =>
        ipcRenderer.invoke(CHANNELS.aiTranslateParagraphPlan, input) as Promise<
          Result<ParagraphTranslationPlan>
        >,
      paragraphBatch: (input: ParagraphBatchInput) =>
        ipcRenderer.invoke(CHANNELS.aiTranslateParagraphBatch, input) as Promise<
          Result<ParagraphBatchResult>
        >,
      paragraphFinalize: (input: ParagraphFinalizeInput) =>
        ipcRenderer.invoke(CHANNELS.aiTranslateParagraphFinalize, input) as Promise<
          Result<ParagraphFinalizeResult>
        >
    },
    proposals: {
      accept: (input: AcceptProposalInput) =>
        ipcRenderer.invoke(CHANNELS.aiProposalAccept, input) as Promise<
          Result<AcceptProposalResult>
        >,
      deny: (workId: string, chapterId: string, partId: string) =>
        ipcRenderer.invoke(CHANNELS.aiProposalDeny, { workId, chapterId, partId }) as Promise<
          Result<void>
        >,
      acceptAll: (workId: string, chapterId: string, commandId: string) =>
        ipcRenderer.invoke(CHANNELS.aiProposalAcceptAll, {
          workId,
          chapterId,
          commandId
        }) as Promise<Result<AcceptProposalResult>>,
      undo: (workId: string, chapterId: string) =>
        ipcRenderer.invoke(CHANNELS.aiProposalUndo, { workId, chapterId }) as Promise<
          Result<{ content: string; rev: number; commandId: string }>
        >,
      listChapter: (workId: string, chapterId: string) =>
        ipcRenderer.invoke(CHANNELS.aiProposalListChapter, { workId, chapterId }) as Promise<
          Result<{ proposals: ProposalQueueItem[]; undoAvailable: boolean }>
        >,
      pendingCounts: (workId: string) =>
        ipcRenderer.invoke(CHANNELS.aiProposalPendingCounts, { workId }) as Promise<
          Result<{ counts: Array<{ chapterId: string; count: number }> }>
        >
    },
    sessions: {
      list: (workId: string) =>
        ipcRenderer.invoke(CHANNELS.aiSessionsList, { workId }) as Promise<
          Result<{ sessions: AiSessionView[] }>
        >,
      turns: (workId: string, sessionId: string) =>
        ipcRenderer.invoke(CHANNELS.aiTurnsList, { workId, sessionId }) as Promise<
          Result<{ turns: AiTurnView[] }>
        >
    },
    chat: {
      send: (input: ChatSendInput) =>
        ipcRenderer.invoke(CHANNELS.aiChatSend, input) as Promise<Result<ChatStartResult>>,
      cancel: (requestId: string) =>
        ipcRenderer.invoke(CHANNELS.aiChatCancel, { requestId }) as Promise<Result<void>>,
      /**
       * Tên kênh **đóng cứng ở đây**, không nhận từ renderer: phơi một `on(channel, cb)` tổng quát
       * là mở cho renderer nghe mọi thứ main gửi, đúng thứ `contextIsolation` tồn tại để chặn.
       */
      onChunk: (listener: (chunk: ChatChunk) => void) => {
        const handler = (_event: IpcRendererEvent, chunk: ChatChunk): void => listener(chunk)
        ipcRenderer.on(EVENT_CHANNELS.aiChatChunk, handler)
        return () => ipcRenderer.off(EVENT_CHANNELS.aiChatChunk, handler)
      }
    }
  },
  glossary: {
    list: (options) =>
      ipcRenderer.invoke(CHANNELS.glossaryList, options) as Promise<
        Result<{ entries: ContextEntryItem[] }>
      >,
    get: (options) =>
      ipcRenderer.invoke(CHANNELS.glossaryGet, options) as Promise<Result<ContextEntryItem>>,
    create: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryCreate, input) as Promise<Result<ContextEntryItem>>,
    update: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryUpdate, input) as Promise<Result<ContextEntryItem>>,
    delete: (options) =>
      ipcRenderer.invoke(CHANNELS.glossaryDelete, options) as Promise<Result<void>>,
    importNames: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryImportNames, input) as Promise<Result<ImportNamesResult>>,
    applied: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryApplied, input) as Promise<Result<AppliedContext>>,
    review: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryReview, input) as Promise<Result<ContextEntryItem>>,
    bulkApprove: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryBulkApprove, input) as Promise<
        Result<{ results: ContextReviewOutcome[] }>
      >,
    reviewInfo: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryReviewInfo, input) as Promise<
        Result<{ entries: ContextReviewInfo[] }>
      >,
    checkCompliance: (input) =>
      ipcRenderer.invoke(CHANNELS.glossaryCheckCompliance, input) as Promise<
        Result<GlossaryComplianceReport>
      >
  },
  addressing: {
    characters: {
      list: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingCharactersList, options) as Promise<
          Result<{ characters: CharacterItem[] }>
        >,
      get: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingCharactersGet, options) as Promise<
          Result<CharacterItem>
        >,
      create: (input) =>
        ipcRenderer.invoke(CHANNELS.addressingCharactersCreate, input) as Promise<
          Result<CharacterItem>
        >,
      update: (input) =>
        ipcRenderer.invoke(CHANNELS.addressingCharactersUpdate, input) as Promise<
          Result<CharacterItem>
        >,
      delete: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingCharactersDelete, options) as Promise<Result<void>>
    },
    dyads: {
      list: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingDyadsList, options) as Promise<
          Result<{ dyads: AddressingDyadItem[] }>
        >,
      get: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingDyadsGet, options) as Promise<
          Result<AddressingDyadItem>
        >,
      set: (input) =>
        ipcRenderer.invoke(CHANNELS.addressingDyadsSet, input) as Promise<
          Result<AddressingDyadItem>
        >,
      delete: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingDyadsDelete, options) as Promise<Result<void>>,
      effective: (options) =>
        ipcRenderer.invoke(CHANNELS.addressingDyadsEffective, options) as Promise<
          Result<{ dyads: AddressingDyadResolved[] }>
        >
    },
    checkCompliance: (input) =>
      ipcRenderer.invoke(CHANNELS.addressingCheckCompliance, input) as Promise<
        Result<AddressingComplianceReport>
      >
  },
  export: {
    exportChapter: (input) =>
      ipcRenderer.invoke(CHANNELS.exportChapter, input) as Promise<Result<ExportResult>>,
    exportWork: (input) =>
      ipcRenderer.invoke(CHANNELS.exportWork, input) as Promise<Result<ExportResult>>,
    cancel: (workId) =>
      ipcRenderer.invoke(CHANNELS.exportCancel, { workId }) as Promise<Result<void>>,
    reveal: (path) => ipcRenderer.invoke(CHANNELS.exportReveal, { path }) as Promise<Result<void>>,
    // Quy tắc tương tự như `onChunk`: tên kênh được cố định tại đây, không bao giờ nhận từ renderer.
    onProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, progress: ExportProgress): void =>
        listener(progress)
      ipcRenderer.on(EVENT_CHANNELS.exportProgress, handler)
      return () => ipcRenderer.off(EVENT_CHANNELS.exportProgress, handler)
    }
  },
  sources: {
    catalog: {
      list: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesCatalogList, input) as Promise<
          Result<SourceCatalogPage>
        >,
      get: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesCatalogGet, input) as Promise<Result<SourceCatalogItem>>,
      download: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesCatalogDownload, input) as Promise<
          Result<SourceCatalogDownloadResult>
        >,
      downloadRange: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesCatalogDownloadRange, input) as Promise<Result<void>>,
      reorderBySource: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesCatalogReorderBySource, input) as Promise<
          Result<{ reorderedCount: number }>
        >,
      onDownloadProgress: (listener) => {
        const handler = (_event: IpcRendererEvent, progress: SourceDownloadProgress): void =>
          listener(progress)
        ipcRenderer.on(EVENT_CHANNELS.sourcesDownloadProgress, handler)
        return () => ipcRenderer.off(EVENT_CHANNELS.sourcesDownloadProgress, handler)
      }
    },
    bindings: {
      list: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesBindingsList, input) as Promise<Result<SourceBinding[]>>,
      identify: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesBindingsIdentify, input) as Promise<
          Result<SourceBindingIdentifyResult | null>
        >,
      previewCreate: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesBindingsPreviewCreate, input) as Promise<
          Result<SourceBindingPreview>
        >,
      create: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesBindingsCreate, input) as Promise<Result<SourceBinding>>,
      update: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesBindingsUpdate, input) as Promise<Result<SourceBinding>>,
      delete: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesBindingsDelete, input) as Promise<Result<void>>
    },
    sync: {
      start: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesSyncStart, input) as Promise<Result<SourceSyncRun>>,
      cancel: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesSyncCancel, input) as Promise<Result<SourceSyncRun>>,
      status: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesSyncStatus, input) as Promise<Result<SourceSyncRun>>,
      onProgress: (listener) => {
        const handler = (_event: IpcRendererEvent, progress: SourceSyncProgress): void =>
          listener(progress)
        ipcRenderer.on(EVENT_CHANNELS.sourceSyncProgress, handler)
        return () => ipcRenderer.off(EVENT_CHANNELS.sourceSyncProgress, handler)
      }
    },
    updates: {
      list: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesUpdatesList, input) as Promise<
          Result<SourceUpdatesPage>
        >,
      markSeen: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesUpdatesMarkSeen, input) as Promise<
          Result<{ updatedCount: number }>
        >,
      previewApply: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesUpdatesPreviewApply, input) as Promise<Result<unknown>>,
      apply: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesUpdatesApply, input) as Promise<Result<unknown>>
    },
    registry: {
      list: (input) =>
        ipcRenderer.invoke(CHANNELS.sourcesRegistryList, input) as Promise<
          Result<{ sources: SourceDescriptor[] }>
        >
    }
  },
  agent: {
    sessions: {
      list: (options) =>
        ipcRenderer.invoke(CHANNELS.agentSessionsList, options) as Promise<
          Result<{ sessions: AgentSessionView[] }>
        >,
      get: (sessionId) =>
        ipcRenderer.invoke(CHANNELS.agentSessionsGet, { sessionId }) as Promise<
          Result<AgentSessionDetailView>
        >,
      create: (title) =>
        ipcRenderer.invoke(CHANNELS.agentSessionsCreate, { title }) as Promise<
          Result<AgentSessionView>
        >,
      setPermissionLevel: (input) =>
        ipcRenderer.invoke(CHANNELS.agentSessionsSetPermissionLevel, input) as Promise<
          Result<AgentSessionView>
        >
    },
    turn: {
      send: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTurnSend, input) as Promise<Result<AgentSendResult>>,
      cancel: (input) => ipcRenderer.invoke(CHANNELS.agentTurnCancel, input),
      revert: (turnId) =>
        ipcRenderer.invoke(CHANNELS.agentTurnRevert, { turnId }) as Promise<
          Result<AgentRevertResult>
        >,
      revertAndResend: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTurnRevertAndResend, input) as Promise<
          Result<AgentSendResult>
        >
    },
    edits: {
      keep: (input) =>
        ipcRenderer.invoke(CHANNELS.agentEditsKeep, input) as Promise<Result<AgentEditsResult>>,
      undo: (input) =>
        ipcRenderer.invoke(CHANNELS.agentEditsUndo, input) as Promise<Result<AgentEditsResult>>
    },
    toolCalls: {
      get: (toolCallId) =>
        ipcRenderer.invoke(CHANNELS.agentToolCallGet, { toolCallId }) as Promise<
          Result<AgentToolCallDetailView>
        >
    },
    context: {
      search: (input) =>
        ipcRenderer.invoke(CHANNELS.agentContextSearch, input) as Promise<
          Result<AgentContextSearchGroup[]>
        >
    },
    operations: {
      list: (limit) =>
        ipcRenderer.invoke(CHANNELS.agentOperationList, { limit }) as Promise<
          Result<AgentOperation[]>
        >,
      get: (operationId) =>
        ipcRenderer.invoke(CHANNELS.agentOperationGet, { operationId }) as Promise<
          Result<AgentOperationDetailView>
        >,
      undo: (input) =>
        ipcRenderer.invoke(CHANNELS.agentOperationUndo, input) as Promise<Result<AgentUndoResult>>
    },
    coordinator: {
      ackWriteIntent: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTargetWriteAck, input) as Promise<Result<void>>,
      onWriteIntent: (listener) => {
        const handler = (_event: IpcRendererEvent, intent: AgentWriteIntent): void =>
          listener(intent)
        ipcRenderer.on(EVENT_CHANNELS.agentTargetWriteIntent, handler)
        return () => ipcRenderer.off(EVENT_CHANNELS.agentTargetWriteIntent, handler)
      },
      onTargetChanged: (listener) => {
        const handler = (_event: IpcRendererEvent, event: AgentTargetChanged): void =>
          listener(event)
        ipcRenderer.on(EVENT_CHANNELS.agentTargetChanged, handler)
        return () => ipcRenderer.off(EVENT_CHANNELS.agentTargetChanged, handler)
      }
    },
    onStreamEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, event: AgentStreamEvent): void => listener(event)
      ipcRenderer.on(EVENT_CHANNELS.agentStreamEvent, handler)
      return () => ipcRenderer.off(EVENT_CHANNELS.agentStreamEvent, handler)
    },
    tasks: {
      list: (filter) =>
        ipcRenderer.invoke(CHANNELS.agentTaskList, filter ?? null) as Promise<
          Result<{ tasks: AgentTaskSummary[] }>
        >,
      get: (taskId) =>
        ipcRenderer.invoke(CHANNELS.agentTaskGet, { taskId }) as Promise<
          Result<AgentTaskDetailView>
        >,
      create: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTaskCreate, input) as Promise<Result<AgentTaskView>>,
      control: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTaskControl, input) as Promise<Result<AgentTaskView>>,
      steer: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTaskSteer, input) as Promise<Result<AgentTaskSteerResult>>,
      quality: (taskId) =>
        ipcRenderer.invoke(CHANNELS.agentTaskQuality, { taskId }) as Promise<
          Result<TaskQualityView>
        >,
      dismiss: (input) =>
        ipcRenderer.invoke(CHANNELS.agentTaskDismiss, input) as Promise<Result<void>>,
      onChanged: (listener) => {
        const handler = (_event: IpcRendererEvent, event: AgentTaskChanged): void => listener(event)
        ipcRenderer.on(EVENT_CHANNELS.agentTaskChanged, handler)
        return () => ipcRenderer.off(EVENT_CHANNELS.agentTaskChanged, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('mira', desktopApi)
