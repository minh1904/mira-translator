import { CHANNELS, type Channel } from '../../shared/contracts/channels'
import { fail, type Result } from '../../shared/contracts/result'
import type { ChapterTranslator } from '../services/ai/chapterTranslation'
import type { ParagraphTranslator } from '../services/ai/paragraphTranslation'
import type { ChatService } from '../services/ai/chatService'
import type { ConnectionService } from '../services/ai/connectionService'
import type { GlossaryService } from '../services/context/glossaryService'
import type { AddressingService } from '../services/context/addressingService'
import type { LibraryStore } from '../services/library/library'
import { noChunkSink, type ChunkSink, type RawHandler, type WindowBroadcast } from './handler'
import { noFilePicker, type FilePicker } from './filePicker'
import { accountHandlers } from './handlers/accounts'
import { addressingHandlers } from './handlers/addressing'
import { aiHandlers } from './handlers/ai'
import { backupHandlers } from './handlers/backup'
import { chaptersHandlers } from './handlers/chapters'
import { chatHandlers } from './handlers/chat'
import type { HandlerDeps } from './handlers/deps'
import { glossaryHandlers } from './handlers/glossary'
import { imagesHandlers } from './handlers/images'
import { proposalHandlers } from './handlers/proposals'
import { sessionHandlers } from './handlers/sessions'
import { textHandlers } from './handlers/text'
import { worksHandlers } from './handlers/works'
import { exportHandlers } from './handlers/export'
import { workspaceHandlers } from './handlers/workspace'
import { sourcesHandlers } from './handlers/sources'
import { agentHandlers } from './handlers/agent'
import type { ExportService } from '../services/export/exportService'
import type { SourceServices } from '../sources/sourceServices'
import type { AgentService } from '../services/agent/agentService'
import type { AgentTaskService } from '../services/agent/taskService'

/**
 * Channel → handler đã được xác thực dữ liệu. Không import Electron để các bài test có thể gọi trực tiếp.
 *
 * Mỗi nhóm kênh nằm trong tệp riêng dưới thư mục `handlers/`. Kiểu trả về là bản ghi chứa **toàn bộ**
 * các `Channel`, do đó nếu có kênh nào chưa được xử lý sẽ báo lỗi biên dịch ngay tại đây.
 */
export function createLibraryHandlers(
  library: LibraryStore,
  files: FilePicker = noFilePicker,
  connections?: ConnectionService,
  translator?: ChapterTranslator,
  chat?: ChatService,
  glossary?: GlossaryService,
  addressing?: AddressingService,
  paragraphTranslator?: ParagraphTranslator,
  exportService?: ExportService,
  sources?: SourceServices,
  agent?: AgentService,
  windows?: WindowBroadcast,
  tasks?: AgentTaskService
): Record<Channel, RawHandler<unknown>> {
  const deps: HandlerDeps = {
    library,
    files,
    connections,
    translator,
    chat,
    glossary,
    addressing,
    paragraphTranslator,
    exportService,
    sources,
    agent,
    windows,
    tasks
  }
  return {
    ...worksHandlers(deps),
    ...workspaceHandlers(deps),
    ...chaptersHandlers(deps),
    ...textHandlers(deps),
    ...imagesHandlers(deps),
    ...backupHandlers(deps),
    ...aiHandlers(deps),
    ...accountHandlers(deps),
    ...chatHandlers(deps),
    ...proposalHandlers(deps),
    ...sessionHandlers(deps),
    ...glossaryHandlers(deps),
    ...addressingHandlers(deps),
    ...exportHandlers(deps),
    ...sourcesHandlers(deps),
    ...agentHandlers(deps)
  }
}

/**
 * Từ chối mọi yêu cầu có nguồn gửi không đáng tin cậy trước khi tiến hành xác thực hoặc thao tác với bộ lưu trữ.
 * Sử dụng generic cho kiểu sự kiện để quy tắc này có thể kiểm thử độc lập mà không cần Electron.
 */
export function guardHandlers<E>(
  handlers: Record<Channel, RawHandler<unknown>>,
  isTrustedSender: (event: E) => boolean,
  /** Cửa sổ của lời gọi, cho kênh đẩy sự kiện về. Thiếu thì không kênh nào đẩy được gì. */
  sinkOf: (event: E) => ChunkSink = () => noChunkSink
): Record<Channel, (event: E, raw: unknown) => Result<unknown> | Promise<Result<unknown>>> {
  const guarded = {} as Record<
    Channel,
    (event: E, raw: unknown) => Result<unknown> | Promise<Result<unknown>>
  >
  for (const channel of Object.values(CHANNELS)) {
    guarded[channel] = (event, raw) =>
      isTrustedSender(event)
        ? handlers[channel](raw, sinkOf(event))
        : fail('untrusted_sender', 'Nguồn gửi yêu cầu không được tin cậy.')
  }
  return guarded
}
