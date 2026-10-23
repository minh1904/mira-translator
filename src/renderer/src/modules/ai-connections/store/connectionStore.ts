import { create } from 'zustand'
import type {
  ConnectionTestResult,
  ConnectionView,
  CreateConnectionInput,
  EndpointProbeResult,
  ProbeEndpointInput,
  ModelInfoView,
  UpdateConnectionInput
} from '../../../../../shared/contracts/aiConnections'
import type { IpcError, Result } from '../../../../../shared/contracts/result'
import type {
  AiPreferences,
  MainModel,
  ModelRef
} from '../../../../../shared/contracts/aiPreferences'
import {
  messageOf,
  type EntryOutcome,
  type ModelEntryActions
} from '../model-selection/modelEntryActions'
import { registerStoreReset } from '../../../lib/testing/resetStores'

export type ConnectionsLoad = 'loading' | 'ready' | 'failed'

export interface TestState {
  running: boolean
  models: ModelInfoView[]
  listed: boolean
  catalogReadAt: string | null
  error: { field: 'url' | 'key' | 'form'; message: string } | null
}

function fieldOf(error: IpcError): 'url' | 'key' | 'form' {
  const message = error.message.toLowerCase()
  if (/khóa|api key|unauthor|forbidden|credential/.test(message)) return 'key'
  if (/nối|connect|fetch|địa chỉ|url|econnrefused|timeout/.test(message)) return 'url'
  return 'form'
}

export const emptyTest: TestState = {
  running: false,
  models: [],
  listed: false,
  catalogReadAt: null,
  error: null
}

export type ConnectKeyOutcome =
  | { ok: true; connection: ConnectionView; warning?: string }
  | { ok: false; message: string }

export interface ConnectionState {
  load: ConnectionsLoad
  connections: ConnectionView[]
  loadError: string | null
  notice: string | null
  tests: Record<string, TestState>
  entries: ModelEntryActions
  /** Cài đặt › Model; có giá trị `null` cho đến khi đọc xong. */
  preferences: AiPreferences | null

  // Hành động
  reload(): Promise<void>
  dismissNotice(): void
  /** Kết nối mới được tạo, hoặc `null` nếu xảy ra thông báo lỗi. */
  create(input: CreateConnectionInput): Promise<ConnectionView | null>
  /** Lưu khóa API dán vào thẻ provider; tự động tạo kết nối từ cấu hình sẵn nếu chưa có. */
  ensureWithKey(
    providerId: string,
    secret: string
  ): Promise<{ ok: true; connection: ConnectionView } | { ok: false; message: string }>
  /**
   * Lưu khóa API và kiểm tra tính khả dụng: lưu và kiểm tra khóa, nếu provider từ chối thì gỡ khóa ra,
   * và nếu kết nối chưa có mục model nào thì tự động thêm model đầu tiên trong danh sách.
   * Nếu kiểm tra thất bại vì lý do khác (lỗi mạng, timeout), khóa vẫn được giữ lại và thông báo trong `warning`.
   */
  connectKey(providerId: string, secret: string): Promise<ConnectKeyOutcome>
  probe(
    input: ProbeEndpointInput
  ): Promise<{ ok: true; value: EndpointProbeResult } | { ok: false; message: string }>
  update(id: string, patch: UpdateConnectionInput['patch']): Promise<void>
  remove(id: string): Promise<void>
  addKey(id: string, secret: string): Promise<boolean>
  removeKey(id: string, keyId: string): Promise<void>
  test(id: string): Promise<void>
  loadPreferences(): Promise<void>
  setMainModel(main: MainModel | null): Promise<boolean>
  setFallbacks(fallbacks: ModelRef[]): Promise<boolean>
  setAuxiliaryModel(auxiliary: ModelRef | null): Promise<boolean>
  setOnboardingSkipped(skipped: boolean): Promise<void>
  reset(): void
}

const initialValues = {
  load: 'loading' as ConnectionsLoad,
  connections: [] as ConnectionView[],
  loadError: null as string | null,
  notice: null as string | null,
  tests: {} as Record<string, TestState>,
  preferences: null as AiPreferences | null
}

let latestLoadTicket = 0

export const useConnectionStore = create<ConnectionState>((set, get) => {
  const applyOne = (connection: ConnectionView): void => {
    set((current) => {
      const index = current.connections.findIndex((item) => item.id === connection.id)
      if (index === -1) return { connections: [...current.connections, connection] }
      const next = [...current.connections]
      next[index] = connection
      return { connections: next }
    })
  }

  const run = async (
    action: () => Promise<{ ok: true; value: ConnectionView } | { ok: false; error: IpcError }>
  ): Promise<boolean> => {
    const result = await action()
    if (result.ok) {
      applyOne(result.value)
      return true
    }
    set({ notice: result.error.message })
    return false
  }

  const attempt = async (action: () => Promise<Result<ConnectionView>>): Promise<EntryOutcome> => {
    const result = await action()
    if (result.ok) {
      applyOne(result.value)
      return { ok: true }
    }
    return { ok: false, message: messageOf(result.error) }
  }

  const setTest = (id: string, patch: Partial<TestState>): void => {
    set((current) => ({
      tests: { ...current.tests, [id]: { ...(current.tests[id] ?? emptyTest), ...patch } }
    }))
  }

  const entries: ModelEntryActions = {
    add: (connectionId, items) => attempt(() => window.mira.ai.models.add(connectionId, items)),
    update: (entryId, patch) => attempt(() => window.mira.ai.models.update(entryId, patch)),
    duplicate: (entryId) => attempt(() => window.mira.ai.models.duplicate(entryId)),
    // Khi xóa mục model, main model và fallbacks tương ứng cũng bị loại bỏ; tải lại tùy chọn sau khi xóa.
    remove: async (entryId) => {
      const outcome = await attempt(() => window.mira.ai.models.delete(entryId))
      if (outcome.ok) void get().loadPreferences()
      return outcome
    },
    reorder: (connectionId, ids) => attempt(() => window.mira.ai.models.reorder(connectionId, ids)),
    setDefault: (connectionId, entryId) =>
      attempt(() => window.mira.ai.update(connectionId, { defaultEntryId: entryId })),
    test: (entryId) => window.mira.ai.models.test(entryId)
  }

  return {
    ...initialValues,
    entries,

    loadPreferences: async () => {
      const result = await window.mira.ai.preferences.get()
      if (result.ok) set({ preferences: result.value })
    },

    setMainModel: async (main) => {
      const result = await window.mira.ai.preferences.setMain(main)
      if (!result.ok) {
        set({ notice: result.error.message })
        return false
      }
      set({ preferences: result.value })
      return true
    },

    setFallbacks: async (fallbacks) => {
      const result = await window.mira.ai.preferences.setFallbacks(fallbacks)
      if (!result.ok) {
        set({ notice: result.error.message })
        return false
      }
      set({ preferences: result.value })
      return true
    },

    setAuxiliaryModel: async (auxiliary) => {
      const result = await window.mira.ai.preferences.setAuxiliary(auxiliary)
      if (!result.ok) {
        set({ notice: result.error.message })
        return false
      }
      set({ preferences: result.value })
      return true
    },

    setOnboardingSkipped: async (skipped) => {
      const result = await window.mira.ai.preferences.setOnboardingSkipped(skipped)
      if (result.ok) set({ preferences: result.value })
    },

    reload: async () => {
      const ticket = ++latestLoadTicket
      const result = await window.mira.ai.list()
      if (ticket !== latestLoadTicket) return

      if (result.ok) {
        set({
          connections: result.value.connections,
          load: 'ready',
          loadError: null
        })
      } else {
        set({
          load: 'failed',
          loadError: result.error.message
        })
      }
    },

    dismissNotice: () => {
      set({ notice: null })
    },

    create: async (input: CreateConnectionInput) => {
      const result = await window.mira.ai.create(input)
      if (result.ok) {
        applyOne(result.value)
        return result.value
      }
      set({ notice: result.error.message })
      return null
    },

    ensureWithKey: async (providerId, secret) => {
      const result = await window.mira.ai.ensureWithKey({ providerId, secret })
      if (!result.ok) return { ok: false, message: result.error.message }
      applyOne(result.value)
      return { ok: true, connection: result.value }
    },

    connectKey: async (providerId, secret) => {
      const made = await get().ensureWithKey(providerId, secret)
      if (!made.ok) return made
      const id = made.connection.id
      await get().test(id)
      const test = get().tests[id] ?? emptyTest
      const current = (): ConnectionView =>
        get().connections.find((item) => item.id === id) ?? made.connection
      if (test.error?.field === 'key') {
        const added = current().keys.findLast((key) => key.tail === secret.trim().slice(-4))
        if (added) await get().removeKey(id, added.id)
        return { ok: false, message: test.error.message }
      }
      const first = test.models[0]?.id
      if (current().models.length === 0 && first) await get().entries.add(id, [{ model: first }])
      return test.error
        ? { ok: true, connection: current(), warning: test.error.message }
        : { ok: true, connection: current() }
    },

    probe: async (input) => {
      const result = await window.mira.ai.probe(input)
      return result.ok
        ? { ok: true, value: result.value }
        : { ok: false, message: result.error.message }
    },

    update: async (id: string, patch: UpdateConnectionInput['patch']) => {
      await run(() => window.mira.ai.update(id, patch))
    },

    remove: async (id: string) => {
      const result = await window.mira.ai.delete(id)
      if (result.ok) {
        set({ connections: result.value.connections })
        void get().loadPreferences()
      } else {
        set({ notice: result.error.message })
      }
    },

    addKey: async (id: string, secret: string) => {
      const result = await window.mira.ai.addKey(id, secret)
      if (result.ok) {
        applyOne(result.value)
        setTest(id, { error: null })
        return true
      }
      setTest(id, { error: { field: fieldOf(result.error), message: result.error.message } })
      return false
    },

    removeKey: async (id: string, keyId: string) => {
      await run(() => window.mira.ai.removeKey(id, keyId))
    },

    test: async (id: string) => {
      setTest(id, { running: true, error: null })
      const result = await window.mira.ai.test(id)
      if (result.ok) {
        const value: ConnectionTestResult = result.value
        applyOne(value.connection)
        setTest(id, {
          running: false,
          models: value.models,
          listed: value.listed,
          catalogReadAt: value.catalogReadAt,
          error: null
        })
      } else {
        setTest(id, {
          running: false,
          error: { field: fieldOf(result.error), message: result.error.message }
        })
      }
    },

    reset: () => {
      latestLoadTicket = 0
      set({ ...initialValues })
    }
  }
})

registerStoreReset(() => {
  useConnectionStore.getState().reset()
})
