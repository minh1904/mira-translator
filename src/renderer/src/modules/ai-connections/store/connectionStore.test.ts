import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useConnectionStore } from './connectionStore'
import type { ConnectionView } from '../../../../../shared/contracts/aiConnections'

const mockConnection: ConnectionView = {
  id: 'conn-1',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  authKind: 'api_key',
  oauthProvider: null,
  apiMode: 'auto',
  account: null,
  providerId: null,
  defaultEntryId: null,
  checkedAt: null,
  keys: [{ id: 'k-1', tail: '1234', state: 'ok', frozenUntil: null, frozenScope: null }],
  models: []
}

describe('connectionStore', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: {
        ai: {
          list: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          addKey: vi.fn(),
          removeKey: vi.fn(),
          test: vi.fn(),
          preferences: {
            get: vi.fn().mockResolvedValue({
              ok: true,
              value: { main: null, fallbacks: [], auxiliary: null, onboardingSkipped: false }
            })
          },
          models: {
            add: vi.fn(),
            update: vi.fn(),
            duplicate: vi.fn(),
            delete: vi.fn(),
            reorder: vi.fn(),
            test: vi.fn()
          }
        }
      }
    }
  })

  it('initializes with default values', () => {
    const state = useConnectionStore.getState()
    expect(state.load).toBe('loading')
    expect(state.connections).toEqual([])
    expect(state.notice).toBeNull()
  })

  it('reloads connections successfully', async () => {
    window.mira.ai.list = vi.fn().mockResolvedValue({
      ok: true,
      value: { connections: [mockConnection] }
    })

    await useConnectionStore.getState().reload()

    const state = useConnectionStore.getState()
    expect(state.load).toBe('ready')
    expect(state.connections).toEqual([mockConnection])
  })

  it('creates connection and appends to store', async () => {
    window.mira.ai.create = vi.fn().mockResolvedValue({
      ok: true,
      value: mockConnection
    })

    await useConnectionStore.getState().create({
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      providerId: null
    })

    expect(useConnectionStore.getState().connections).toEqual([mockConnection])
  })

  it('removes connection and updates list', async () => {
    useConnectionStore.setState({ connections: [mockConnection] })

    window.mira.ai.delete = vi.fn().mockResolvedValue({
      ok: true,
      value: { connections: [] }
    })

    await useConnectionStore.getState().remove('conn-1')

    expect(useConnectionStore.getState().connections).toEqual([])
  })

  it('connects a pasted key and adds the first listed model when the connection has none', async () => {
    const google = { ...mockConnection, providerId: 'google', name: 'Google Gemini' }
    const withModel = { ...google, models: [{ id: 'e-1', name: 'gemini-2.5-flash' }] }
    window.mira.ai.ensureWithKey = vi.fn().mockResolvedValue({ ok: true, value: google })
    window.mira.ai.test = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        connection: google,
        catalogReadAt: '2026-10-01',
        models: [{ id: 'gemini-2.5-flash' }],
        listed: true
      }
    })
    window.mira.ai.models.add = vi.fn().mockResolvedValue({ ok: true, value: withModel })

    const outcome = await useConnectionStore.getState().connectKey('google', 'AIza-key-1234')

    expect(window.mira.ai.models.add).toHaveBeenCalledWith('conn-1', [
      { model: 'gemini-2.5-flash' }
    ])
    expect(outcome).toEqual({ ok: true, connection: withModel })
  })

  it('takes a key the provider rejects back out', async () => {
    window.mira.ai.ensureWithKey = vi.fn().mockResolvedValue({ ok: true, value: mockConnection })
    window.mira.ai.test = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'provider', message: 'Khóa API bị từ chối.' }
    })
    window.mira.ai.removeKey = vi.fn().mockResolvedValue({
      ok: true,
      value: { ...mockConnection, keys: [] }
    })

    const outcome = await useConnectionStore.getState().connectKey('openai', 'sk-1234')

    expect(window.mira.ai.removeKey).toHaveBeenCalledWith('conn-1', 'k-1')
    expect(outcome).toEqual({ ok: false, message: 'Khóa API bị từ chối.' })
  })

  it('keeps a key whose check failed for another reason, with a warning', async () => {
    window.mira.ai.ensureWithKey = vi.fn().mockResolvedValue({ ok: true, value: mockConnection })
    window.mira.ai.test = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'provider', message: 'Không nối được: timeout' }
    })
    window.mira.ai.removeKey = vi.fn()

    const outcome = await useConnectionStore.getState().connectKey('openai', 'sk-1234')

    expect(window.mira.ai.removeKey).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: true, warning: 'Không nối được: timeout' })
  })
})
