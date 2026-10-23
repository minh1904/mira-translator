import type {
  ConnectionTestResult,
  ConnectionView,
  CreateConnectionInput,
  ModelEntryTestResult,
  ModelInfoView,
  UpdateConnectionInput
} from '../../../shared/contracts/aiConnections'
import {
  applySettingsPatch,
  type ModelEntryView,
  type ModelSettingsPatch,
  type ThinkingLevel
} from '../../../shared/contracts/modelSettings'
import {
  addKey,
  addModelEntry,
  deleteConnection,
  deleteModelEntry,
  duplicateModelEntry,
  findModelEntry,
  getConnection,
  getModelEntry,
  insertConnection,
  listConnections,
  patchConnection,
  readKeyCiphers,
  removeKey,
  reorderModelEntries,
  updateModelEntry,
  type ConnectionView as StoredConnection,
  type ModelEntry,
  type ModelEntryInput
} from '../../infra/storage/connections'
import { StorageError } from '../../infra/storage/errors'
import {
  CONNECTION_PRESETS,
  type EndpointProbeResult,
  type EnsureWithKeyInput,
  type ProbeEndpointInput
} from '../../../shared/contracts/aiConnections'
import { probeEndpoint } from './endpointProbe'
import {
  pruneAiPreferences,
  readAiPreferences,
  writeAuxiliaryModel,
  writeFallbacks,
  writeMainModel,
  writeOnboardingSkipped
} from '../../infra/storage/aiPreferences'
import type { AiPreferences, MainModel, ModelRef } from '../../../shared/contracts/aiPreferences'
import type { SecretStore } from '../../infra/storage/secretStore'
import type { Db } from '../../infra/storage/sqlite'
import { resolveCompat } from '../../infra/providers/compat'
import { DEFAULT_CONCURRENCY, GatewayRegistry } from '../../infra/providers/gateway/gateway'
import { createConnectionKeySource } from '../../infra/providers/connectionKeySource'
import { buildGeneration, settingsKey } from '../../infra/providers/generation'
import { CATALOG_READ_AT, lookupModel, type ModelInfo } from '../../infra/providers/modelCatalog'
import {
  checkThinkingLevel,
  describeThinkingCheck,
  modelCapability
} from '../../infra/providers/modelCapability'
import { sentParameters } from '../../infra/providers/transports/openAiChatTransport'
import {
  OpenAiCompatibleProvider,
  type KeySource,
  type OpenAiCompatibleOptions
} from '../../infra/providers/openAiCompatible'
import { ProviderError } from '../../infra/providers/types'
import { describeProviderError, taskErrorPolicy } from './errorPolicy'
import { toWireUsage } from '../../infra/providers/usage'
import { createTransport } from '../../infra/providers/transports/transportFactory'
import { anthropicKeyProblem } from '../../infra/providers/transports/anthropicTransport'
import { CODEX_FALLBACK_MODELS } from '../../infra/providers/accounts/codex'
import {
  codexThinkingLevels,
  thinkingLevelsFromWire
} from '../../infra/providers/accounts/accountReasoning'
import {
  COPILOT,
  COPILOT_FALLBACK_MODELS,
  copilotHeaders,
  parseCopilotModels
} from '../../infra/providers/accounts/copilot'
import type { LoginStart, LoginStatus, UsageWindowView } from '../../../shared/contracts/aiAccounts'
import { AccountCredentials } from './accountCredentials'
import { AccountLogins } from './accountLogins'

/**
 * Mọi thao tác với kết nối AI mà tầng IPC cần, gom một chỗ.
 *
 * Khóa API vào qua `addApiKey` rồi không ra nữa: mọi giá trị trả về là `ConnectionView`, chỉ
 * mang bốn ký tự cuối.
 */
export interface ConnectionServiceOptions {
  db: Db
  secrets: SecretStore
  now: () => number
  newId: () => string
  /** Tiêm vào để test; mặc định là `fetch` của Node. */
  fetchImpl?: typeof fetch
  /** Tiêm vào để test: để một lần thử lại không tốn thời gian thật. Mặc định là chính sách thật. */
  retry?: Pick<OpenAiCompatibleOptions, 'retry' | 'sleep' | 'random'>
  /** `Mira/<phiên bản>`: tên Mira tự xưng ở mọi header không bắt buộc giả danh. */
  userAgent?: string
  /** Mở trang xác minh của một lần đăng nhập; main truyền `shell.openExternal`. */
  openExternal?: (url: string) => Promise<void>
  /** Giấc ngủ giữa hai lần hỏi lại khi đăng nhập; test truyền một giấc ngủ không tốn thời gian. */
  loginSleep?: (ms: number) => Promise<void>
}

/** Lỗi của nhà cung cấp đi qua IPC như dữ liệu, giống mọi lỗi khác. */
function toStorageError(error: unknown): never {
  if (error instanceof ProviderError) {
    // Lỗi cài đặt (`auth`, `invalid_request`, `refused`) là `validation`; phần còn lại là trục trặc đường
    // truyền. Bảng nằm ở `errorPolicy.ts`.
    const code = taskErrorPolicy('probe', error.kind).probeCode ?? 'io'
    throw new StorageError(code, describeProviderError(error), { cause: error })
  }
  throw error
}

function toModelView(id: string, info: ModelInfo | undefined): ModelInfoView {
  const view: ModelInfoView = { id, name: info?.name ?? id }
  if (info?.contextLimit !== undefined) view.contextLimit = info.contextLimit
  if (info?.outputLimit !== undefined) view.outputLimit = info.outputLimit
  if (info?.cost?.input !== undefined) view.inputCost = info.cost.input
  if (info?.cost?.output !== undefined) view.outputCost = info.cost.output
  if (info?.status !== undefined) view.status = info.status
  return view
}

/**
 * Kết nối ở dạng đi qua IPC: mỗi mục model kèm khả năng của model đó (mức suy luận nào được đưa ra, có nhận
 * nhiệt độ không), đọc từ bảng dữ liệu đi kèm bản cài. Kho không biết bảng đó nên việc ghép nằm ở đây.
 */
function toView(connection: StoredConnection): ConnectionView {
  const models: ModelEntryView[] = connection.models.map((entry) => {
    const capability = modelCapability(lookupModel(entry.model, connection.providerId ?? undefined))
    const levels = accountThinkingLevels(connection, entry.model)
    return { ...entry, capability: levels ? { ...capability, thinkingLevels: levels } : capability }
  })
  return { ...connection, models }
}

/**
 * Copilot's `/models` reasoning levels, by model id, from the last listing.
 * shortcut: kept in memory, so after a restart Copilot models fall back to the catalog until the account's
 * models are listed again; persist them with the model entry if that gap shows up in use.
 */
const copilotReasoning = new Map<string, ThinkingLevel[]>()

/** Levels a subscription account declares for a model; `undefined` means "use the catalog". */
function accountThinkingLevels(
  connection: Pick<StoredConnection, 'oauthProvider'>,
  model: string
): ThinkingLevel[] | undefined {
  if (connection.oauthProvider === 'codex') return codexThinkingLevels(model)
  if (connection.oauthProvider === 'copilot') return copilotReasoning.get(model)
  return undefined
}

/** Một kết nối đã sẵn sàng gọi bằng một mục model, cộng cách biết khóa nào vừa được dùng. */
export interface ConnectionTranslator {
  connection: ConnectionView
  /** Mục đã dùng, như lúc dựng provider: cài đặt của nó đã nằm trong `provider`. */
  entry: ModelEntry
  /** Khóa cấu hình của mục lúc này; lô dịch so nó với khóa của kế hoạch. */
  settingsKey: string
  provider: OpenAiCompatibleProvider
  /**
   * Bốn ký tự cuối của khóa dùng ở lần gọi gần nhất, `null` khi kết nối không có khóa. Hộp thoại
   * dịch so số này giữa hai lô để nói "đã chuyển sang khóa …" mà không cần kênh sự kiện.
   */
  lastKeyTail(): string | null
}

export class ConnectionService {
  /**
   * Trạng thái phải sống lâu hơn một lời gọi: những gì mỗi khóa đã trải qua (mỗi **kết nối** một phần, vì
   * hạn mức là của khóa), và hàng chờ đồng thời cùng nhịp RPM (mỗi **mục model** một phần, vì người dùng đặt
   * chúng theo mục). Provider thì dựng mới mỗi lời gọi (địa chỉ, khóa và cài đặt đọc lại từ kho nên sửa có
   * hiệu lực ngay); chỉ phần này được giữ lại.
   */
  private readonly registry: GatewayRegistry

  /** Token xác thực của các kết nối tài khoản. */
  readonly accounts: AccountCredentials
  private readonly logins: AccountLogins

  constructor(private readonly options: ConnectionServiceOptions) {
    this.registry = new GatewayRegistry(options.now, DEFAULT_CONCURRENCY, options.retry?.sleep)
    const fetchImpl = options.fetchImpl ?? fetch
    this.accounts = new AccountCredentials({
      db: options.db,
      secrets: options.secrets,
      fetchImpl,
      now: options.now,
      sleep: options.retry?.sleep
    })
    this.logins = new AccountLogins({
      db: options.db,
      secrets: options.secrets,
      accounts: this.accounts,
      fetchImpl,
      now: options.now,
      newId: options.newId,
      openExternal: options.openExternal,
      sleep: options.loginSleep,
      onConnected: (connectionId) => this.syncAccountModels(connectionId)
    })
  }

  private get userAgent(): string {
    return this.options.userAgent ?? 'Mira'
  }

  /** Bắt đầu đăng nhập một tài khoản bằng mã thiết bị. */
  startLogin(provider: 'codex' | 'copilot'): Promise<LoginStart> {
    return this.logins.start(provider).catch((error: unknown) => toStorageError(error))
  }

  pollLogin(sessionId: string): LoginStatus {
    return this.logins.poll(sessionId)
  }

  cancelLogin(sessionId: string): void {
    this.logins.cancel(sessionId)
  }

  reopenLogin(sessionId: string): Promise<void> {
    return this.logins.reopen(sessionId)
  }

  /** Hạn mức của tài khoản Codex; rỗng cho kết nối khác. */
  async usage(connectionId: string): Promise<UsageWindowView[]> {
    const connection = getConnection(this.options.db, connectionId)
    if (connection.oauthProvider !== 'codex') return []
    try {
      return await this.accounts.codexUsage({ id: connection.id, oauthProvider: 'codex' })
    } catch (error) {
      return toStorageError(error)
    }
  }

  /**
   * Model của một tài khoản vừa đăng nhập, thêm thành mục (mỗi model một mục, bỏ qua model đã có). Không
   * lấy được danh sách thì dùng danh sách dự phòng tĩnh, để kết nối mới không trống trơn.
   */
  async syncAccountModels(connectionId: string): Promise<void> {
    const { db, newId } = this.options
    const connection = getConnection(db, connectionId)
    let ids: string[] = []
    try {
      ids = await this.listAccountModels(connection)
    } catch {
      ids = []
    }
    if (ids.length === 0) {
      ids = connection.oauthProvider === 'codex' ? CODEX_FALLBACK_MODELS : COPILOT_FALLBACK_MODELS
    }
    const have = new Set(connection.models.map((entry) => entry.model))
    db.transaction(() => {
      for (const model of ids)
        if (!have.has(model)) addModelEntry(db, connectionId, newId(), { model })
    })
  }

  /** Danh sách model của một kết nối tài khoản, theo cách riêng của nhà cung cấp. */
  private async listAccountModels(connection: StoredConnection): Promise<string[]> {
    if (connection.oauthProvider === 'codex') {
      const transport = createTransport(connection, '', this.transportDeps(connection.id))
      const credential = await this.accounts.credential({
        id: connection.id,
        oauthProvider: 'codex'
      })
      return transport.listModels({
        apiKey: credential.kind === 'oauth' ? credential.accessToken : null,
        credential
      })
    }
    const credential = await this.accounts.credential({
      id: connection.id,
      oauthProvider: 'copilot'
    })
    if (credential.kind !== 'oauth') return []
    const fetchImpl = this.options.fetchImpl ?? fetch
    const response = await fetchImpl((credential.apiBase ?? COPILOT.defaultApi) + '/models', {
      headers: {
        authorization: 'Bearer ' + credential.accessToken,
        accept: 'application/json',
        ...copilotHeaders({ apiKey: credential.accessToken }, this.userAgent)
      }
    })
    if (!response.ok) return []
    const models = parseCopilotModels(await response.json())
    for (const model of models) {
      if (model.reasoningLevels.length > 0) {
        copilotReasoning.set(model.id, thinkingLevelsFromWire(model.reasoningLevels))
      }
    }
    return models.map((model) => model.id)
  }

  private transportDeps(connectionId: string): Parameters<typeof createTransport>[2] {
    const stored = getConnection(this.options.db, connectionId)
    return {
      fetchImpl: this.options.fetchImpl ?? fetch,
      now: this.options.now,
      compat: resolveCompat(stored.providerId),
      userAgent: this.userAgent,
      cacheScope: connectionId
    }
  }

  /** Nguồn khóa của một kết nối: khóa API từ kho, hoặc credential của tài khoản. */
  private keysFor(
    connection: StoredConnection,
    scheduler?: Parameters<typeof createConnectionKeySource>[0]['scheduler']
  ): KeySource {
    if (connection.authKind === 'oauth' && connection.oauthProvider) {
      return this.accounts.keySource({ id: connection.id, oauthProvider: connection.oauthProvider })
    }
    return createConnectionKeySource({
      db: this.options.db,
      connectionId: connection.id,
      secrets: this.options.secrets,
      now: this.options.now,
      scheduler
    })
  }

  list(): { connections: ConnectionView[] } {
    return { connections: listConnections(this.options.db).map(toView) }
  }

  create(input: CreateConnectionInput): ConnectionView {
    const { db, now, newId } = this.options
    return toView(insertConnection(db, newId(), input, now()))
  }

  update({ id, patch }: UpdateConnectionInput): ConnectionView {
    return toView(patchConnection(this.options.db, id, patch, this.options.now()))
  }

  delete(id: string): { connections: ConnectionView[] } {
    deleteConnection(this.options.db, id)
    pruneAiPreferences(this.options.db)
    this.registry.forget(id)
    this.accounts.forget(id)
    return this.list()
  }

  /** Cài đặt › Model: model chính, danh sách dự phòng, và cờ bỏ qua hướng dẫn ban đầu. */
  preferences(): AiPreferences {
    return readAiPreferences(this.options.db)
  }

  setMainModel(main: MainModel | null): AiPreferences {
    if (main) findModelEntry(this.options.db, main.entryId)
    writeMainModel(this.options.db, main)
    return this.preferences()
  }

  setFallbacks(fallbacks: ModelRef[]): AiPreferences {
    for (const ref of fallbacks) findModelEntry(this.options.db, ref.entryId)
    writeFallbacks(this.options.db, fallbacks)
    return this.preferences()
  }

  setAuxiliaryModel(auxiliary: ModelRef | null): AiPreferences {
    if (auxiliary) findModelEntry(this.options.db, auxiliary.entryId)
    writeAuxiliaryModel(this.options.db, auxiliary)
    return this.preferences()
  }

  setOnboardingSkipped(skipped: boolean): AiPreferences {
    writeOnboardingSkipped(this.options.db, skipped)
    return this.preferences()
  }

  /** Lần duy nhất khóa đi vào; trả về view đã che. */
  async addApiKey(id: string, secret: string): Promise<ConnectionView> {
    const { db, secrets, now, newId } = this.options
    getConnection(db, id)
    const sealed = await secrets.seal(secret)
    return toView(addKey(db, id, newId(), sealed, now()))
  }

  /**
   * Lưu khóa API dán vào thẻ provider: tạo kết nối từ cấu hình sẵn nếu chưa có, sau đó thêm khóa.
   * Đảm bảo tính nguyên tử để không xảy ra trường hợp có kết nối nhưng thiếu khóa.
   */
  async ensureWithKey({ providerId, secret }: EnsureWithKeyInput): Promise<ConnectionView> {
    const { db, now, newId } = this.options
    const preset = CONNECTION_PRESETS.find((item) => item.providerId === providerId)
    if (!preset)
      throw new StorageError('validation', 'Nhà cung cấp chưa được hỗ trợ: ' + providerId)
    // Một token đăng nhập Claude không phải khóa API: không lưu, và nói lấy khóa ở đâu.
    if (providerId === 'anthropic') {
      const problem = anthropicKeyProblem(secret)
      if (problem !== null) throw new StorageError('validation', problem)
    }
    const existing = listConnections(db).find((item) => item.providerId === providerId)
    const connection =
      existing ??
      insertConnection(
        db,
        newId(),
        { name: preset.label, baseUrl: preset.baseUrl, providerId },
        now()
      )
    return this.addApiKey(connection.id, secret)
  }

  /**
   * Kiểm tra địa chỉ endpoint bằng khóa API vừa nhập hoặc khóa dùng được đầu tiên của kết nối.
   * Không tự động lưu; bên gọi quyết định có giữ lại `resolvedBaseUrl` hay không.
   */
  async probe(input: ProbeEndpointInput): Promise<EndpointProbeResult> {
    const { db, secrets, fetchImpl } = this.options
    let apiKey = input.secret || undefined
    if (!apiKey && input.connectionId) {
      const usable = readKeyCiphers(db, input.connectionId).find((key) => key.state === 'ok')
      if (usable) apiKey = (await secrets.open(usable.cipher)).value
    }
    return probeEndpoint({
      baseUrl: input.baseUrl,
      apiKey,
      model: input.model,
      apiMode: input.apiMode,
      fetchImpl: fetchImpl ?? fetch
    })
  }

  removeApiKey(id: string, keyId: string): ConnectionView {
    removeKey(this.options.db, keyId)
    return toView(getConnection(this.options.db, id))
  }

  /**
   * Thêm các mục model vào cuối danh sách của kết nối, một lần trong một transaction: chọn nhiều model từ
   * danh sách lấy về thì được cả hoặc không gì. Mỗi mục mới có cài đặt trống nên gửi y như trước khi có cài đặt.
   */
  addModels(connectionId: string, items: ModelEntryInput[]): ConnectionView {
    const { db, newId } = this.options
    getConnection(db, connectionId)
    db.transaction(() => {
      for (const item of items) addModelEntry(db, connectionId, newId(), item)
    })
    return toView(getConnection(db, connectionId))
  }

  /**
   * Sửa một mục. `patch.settings` là một **bản vá**: chỉ những trường được nêu đổi, `null` là bỏ trường. Mỗi
   * hộp thoại gửi nhóm của nó và menu chọn mức gửi đúng `thinking`, nên không cái nào ghi đè cái khác.
   */
  updateEntry(
    entryId: string,
    patch: { name?: string; model?: string; settings?: ModelSettingsPatch }
  ): ConnectionView {
    const { db } = this.options
    const { connectionId, entry } = findModelEntry(db, entryId)
    const settings =
      patch.settings === undefined ? undefined : applySettingsPatch(entry.settings, patch.settings)
    // Kiểm mức suy luận ở main cho **mọi** đường lưu, không chỉ form, nhưng chỉ khi bản vá đặt mức. Đổi
    // model hay đổi tên không bị chặn vì một mức đã lưu từ trước: mức đó được báo trên form và bị chặn
    // ngay trước lời gọi (`blockedBy` trong `translator`), nên không có request sai nào đi ra.
    if (patch.settings !== undefined && 'thinking' in patch.settings) {
      const model = patch.model ?? entry.model
      const level = (settings ?? entry.settings).thinking
      const connection = getConnection(db, connectionId)
      const check = checkThinkingLevel(
        lookupModel(model, connection.providerId ?? undefined),
        level,
        accountThinkingLevels(connection, model)
      )
      if (!check.ok && level !== undefined) {
        throw new StorageError('validation', describeThinkingCheck(model, level, check))
      }
    }
    updateModelEntry(db, entryId, { name: patch.name, model: patch.model, settings })
    return toView(getConnection(db, connectionId))
  }

  duplicateEntry(entryId: string): ConnectionView {
    const { db, newId } = this.options
    return toView(duplicateModelEntry(db, entryId, newId()))
  }

  deleteEntry(entryId: string): ConnectionView {
    const view = deleteModelEntry(this.options.db, entryId)
    pruneAiPreferences(this.options.db)
    this.registry.forgetEntry(entryId)
    return toView(view)
  }

  reorderEntries(connectionId: string, ids: string[]): ConnectionView {
    return toView(reorderModelEntries(this.options.db, connectionId, ids))
  }

  /**
   * Nút "Kiểm tra" của một mục: gửi một yêu cầu nhỏ bằng **đúng cài đặt đã lưu** của mục và nói
   * kết quả. Nhà cung cấp từ chối thì lỗi mang lời gốc của nó (đã che khóa), không đổi gì đã lưu.
   */
  async testEntry(entryId: string): Promise<ModelEntryTestResult> {
    const { connectionId } = findModelEntry(this.options.db, entryId)
    const { provider } = this.translator(connectionId, entryId)
    try {
      const { ms, usage } = await provider.probe()
      return { ms, usage: usage === null ? null : toWireUsage(usage) }
    } catch (error) {
      return toStorageError(error)
    }
  }

  /**
   * Một kết nối đã dựng xong provider cho **một mục model**, cho tầng dịch và chat dùng. Kết nối đang tắt thì
   * từ chối ngay: người dùng tắt nó là có ý, đừng âm thầm gọi. Một mục không thuộc kết nối là `not_found`.
   *
   * Cài đặt của mục được đọc **ở đây, một lần**, rồi nằm trong provider: một lượt chat gọi công cụ nhiều vòng
   * hay một lô dịch dùng nguyên bộ đó, nên sửa cài đặt giữa chừng không trộn hai cấu hình vào một lượt.
   */
  translator(id: string, entryId: string): ConnectionTranslator {
    const { db, now, fetchImpl } = this.options
    const stored = getConnection(db, id)
    if (!stored.enabled) {
      throw new StorageError('validation', 'Kết nối “' + stored.name + '” đang tắt.')
    }
    const entry = getModelEntry(db, id, entryId)
    const connection = toView(stored)
    const generation = buildGeneration(entry.settings)
    // Mức đã lưu có thể không còn hợp lệ (catalog đổi sau khi lưu, hay Lab ghi thẳng): chặn trước khi gọi.
    const level = entry.settings.thinking
    const check = checkThinkingLevel(
      lookupModel(entry.model, connection.providerId ?? undefined),
      level,
      accountThinkingLevels(connection, entry.model)
    )
    const blockedBy =
      check.ok || level === undefined
        ? undefined
        : new ProviderError('invalid_request', describeThinkingCheck(entry.model, level, check), {
            sent: sentParameters({ model: entry.model, messages: [], ...generation })
          })

    let lastKeyId: string | null = null
    const runtime = this.registry.runtimeFor(id)
    // Đọc lại giới hạn của mục mỗi lần dựng: sửa đồng thời hay RPM có hiệu lực ở lời gọi kế tiếp.
    const entryRuntime = this.registry.entryRuntimeFor(id, entryId, {
      concurrency: entry.settings.concurrencyLimit,
      rpm: entry.settings.rpmLimit
    })
    const source = this.keysFor(stored, runtime.scheduler)
    const keys: KeySource = {
      async acquire() {
        const lease = await source.acquire()
        if (!('exhausted' in lease)) lastKeyId = lease.id
        return lease
      },
      report: (lease, outcome) => source.report(lease, outcome)
    }

    return {
      connection,
      entry,
      settingsKey: settingsKey(entry),
      provider: new OpenAiCompatibleProvider({
        baseUrl: connection.baseUrl,
        model: entry.model,
        keys,
        compat: resolveCompat(connection.providerId),
        transport: createTransport(stored, entry.model, this.transportDeps(id)),
        limiter: entryRuntime.limiter,
        pacer: entryRuntime.pacer,
        generation,
        blockedBy,
        inputTokenLimit: entry.settings.inputTokenLimit,
        ...this.options.retry,
        fetchImpl,
        now
      }),
      lastKeyTail: () => connection.keys.find((key) => key.id === lastKeyId)?.tail ?? null
    }
  }

  /**
   * Kiểm tra kết nối bằng `GET {base}/models` — rẻ và trả luôn danh sách model. Giá và giới hạn
   * lấy từ bản chụp đi kèm; model không có trong bản chụp vẫn liệt kê, chỉ là không có giá.
   */
  async test(id: string): Promise<ConnectionTestResult> {
    const { db, now, fetchImpl } = this.options
    const connection = getConnection(db, id)

    let listed = false
    let ids: string[] = []
    if (connection.authKind === 'oauth') {
      // Một tài khoản liệt kê model theo cách riêng; không lấy được thì danh sách dự phòng.
      try {
        ids = await this.listAccountModels(connection)
        listed = ids.length > 0
      } catch (error) {
        toStorageError(error)
      }
      if (ids.length === 0) {
        ids = connection.oauthProvider === 'codex' ? CODEX_FALLBACK_MODELS : COPILOT_FALLBACK_MODELS
      }
    } else {
      const runtime = this.registry.runtimeFor(id)
      // Liệt kê model không thuộc mục nào nên không có tên model, hàng chờ hay nhịp riêng.
      const provider = new OpenAiCompatibleProvider({
        baseUrl: connection.baseUrl,
        model: '',
        keys: this.keysFor(connection, runtime.scheduler),
        compat: resolveCompat(connection.providerId),
        transport: createTransport(connection, '', this.transportDeps(id)),
        ...this.options.retry,
        fetchImpl,
        now
      })
      try {
        const result = await provider.listModels()
        ids = result.models
        listed = result.listed
      } catch (error) {
        toStorageError(error)
      }
    }

    const updated = toView(patchConnection(db, id, { checkedAt: now() }, now()))
    return {
      connection: updated,
      catalogReadAt: CATALOG_READ_AT,
      models: ids.map((modelId) =>
        toModelView(modelId, lookupModel(modelId, connection.providerId ?? undefined))
      ),
      listed
    }
  }
}
