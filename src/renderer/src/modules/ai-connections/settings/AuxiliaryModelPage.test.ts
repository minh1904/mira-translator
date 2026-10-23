import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionView } from '../../../../../shared/contracts/aiConnections'
import type { AiPreferences } from '../../../../../shared/contracts/aiPreferences'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useConnectionStore } from '../store/connectionStore'
import { AuxiliaryModelPage } from './modelPages'

/** Kiểm thử Cài đặt › Model › Model phụ. */

const connection = {
  id: 'c1',
  name: 'OpenRouter',
  baseUrl: 'https://x',
  enabled: true,
  authKind: 'api_key',
  oauthProvider: null,
  apiMode: 'auto',
  account: null,
  providerId: null,
  defaultEntryId: 'e1',
  checkedAt: null,
  keys: [],
  models: [
    { id: 'e1', name: 'Gemini Flash' },
    { id: 'e2', name: 'DeepSeek Flash' }
  ]
} as unknown as ConnectionView

const prefs = (auxiliary: AiPreferences['auxiliary']): AiPreferences => ({
  main: null,
  fallbacks: [],
  auxiliary,
  onboardingSkipped: false
})

const render = (): string => renderToStaticMarkup(createElement(AuxiliaryModelPage))

describe('AuxiliaryModelPage', () => {
  beforeEach(() => {
    resetAllStores()
    useConnectionStore.setState({ load: 'ready', connections: [connection] })
  })

  // Render tĩnh đọc trạng thái ban đầu của store, nên chỉ kiểm được trạng thái chưa chọn.
  it("shows the turn's model when no auxiliary model is chosen", () => {
    const html = render()
    expect(html).toContain('Dùng model của lượt')
    expect(html).not.toContain('Mục model')
  })

  it('saves the choice through the preferences API and keeps what the main process returns', async () => {
    const saved = prefs({ connectionId: 'c1', entryId: 'e2' })
    const setAuxiliary = vi.fn().mockResolvedValue({ ok: true, value: saved })
    ;(globalThis as unknown as { window: unknown }).window = {
      mira: { ai: { preferences: { setAuxiliary } } }
    }
    await useConnectionStore.getState().setAuxiliaryModel({ connectionId: 'c1', entryId: 'e2' })
    expect(setAuxiliary).toHaveBeenCalledWith({ connectionId: 'c1', entryId: 'e2' })
    expect(useConnectionStore.getState().preferences).toEqual(saved)
  })
})
