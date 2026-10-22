import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetAllStores } from '../../../lib/testing/resetStores'
import { useAgentStore } from '../store/agentStore'
import { PERMISSION_LEVELS, PermissionLevelMenu, readSkipConfirm } from './PermissionLevelMenu'

describe('PermissionLevelMenu', () => {
  beforeEach(() => resetAllStores())
  afterEach(() => {
    ;(globalThis as unknown as { localStorage?: unknown }).localStorage = undefined
  })

  it('names the current level for screen readers', () => {
    useAgentStore.setState({ permissionLevel: 'autopilot' })
    // Server rendering reads zustand's initial state, so copy the live state into it first.
    Object.assign(useAgentStore.getInitialState(), useAgentStore.getState())
    const html = renderToStaticMarkup(createElement(PermissionLevelMenu))
    expect(html).toContain('aria-label="Mức quyền: Autopilot"')
    expect(html).toContain(PERMISSION_LEVELS.autopilot.description)
  })

  it('warns about cost and scope before the two raised levels only', () => {
    expect(PERMISSION_LEVELS.default.warning).toBeUndefined()
    for (const level of ['allow_all', 'autopilot'] as const) {
      expect(PERMISSION_LEVELS[level].warning).toContain('Chỉ áp dụng cho phiên này')
    }
    expect(PERMISSION_LEVELS.autopilot.warning).toContain('chi phí')
  })

  it('asks again when the "do not ask again" choice cannot be read', () => {
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked')
      }
    }
    expect(readSkipConfirm()).toBe(false)
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (key: string) => (key === 'mira.agent.skipPermissionConfirm' ? '1' : null)
    }
    expect(readSkipConfirm()).toBe(true)
  })
})
