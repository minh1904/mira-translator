import { describe, expect, it, vi } from 'vitest'

let exposedApi: Record<string, unknown> | null = null

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: Record<string, unknown>) => {
      exposedApi = api
    }
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

describe('preload contract & surface safety', () => {
  it('exposes only typed domain APIs and refuses SQL, filesystem, shell, or generic IPC', async () => {
    await import('./index')
    expect(exposedApi).not.toBeNull()
    const api = exposedApi!

    // Check domain areas exist
    expect(api).toHaveProperty('works')
    expect(api).toHaveProperty('workspace')
    expect(api).toHaveProperty('chapters')
    expect(api).toHaveProperty('text')
    // Sentence mode was removed with its row API.
    expect(api).not.toHaveProperty('rows')
    expect(api).toHaveProperty('images')
    expect(api).toHaveProperty('backup')
    expect(api).toHaveProperty('ai')
    expect(api).toHaveProperty('agent')
    expect(api).toHaveProperty('glossary')
    expect(api).toHaveProperty('addressing')
    expect(api).toHaveProperty('export')
    expect(api).toHaveProperty('sources')

    // Check agent namespace
    const agent = api.agent as Record<string, unknown>
    expect(agent).toHaveProperty('sessions')
    expect(agent).toHaveProperty('turn')
    expect(agent).toHaveProperty('operations')
    expect(agent).toHaveProperty('coordinator')
    expect(typeof agent.onStreamEvent).toBe('function')

    // Top-level must never expose generic IPC or system objects
    const topLevelForbidden = [
      'send',
      'invoke',
      'on',
      'emit',
      'ipcrenderer',
      'ipc',
      'electron',
      'fs',
      'sql',
      'sqlite',
      'db',
      'shell',
      'child_process'
    ]
    for (const name of topLevelForbidden) {
      expect(api).not.toHaveProperty(name)
    }

    // Generic primitives must not exist anywhere in the object tree
    const genericForbidden = [
      'sqlite',
      'rawsql',
      'readfile',
      'writefile',
      'unlink',
      'rmsync',
      'mkdir',
      'child_process',
      'spawn',
      'execsync',
      'ipcrenderer',
      'sendsync',
      'postmessage',
      'removealllisteners'
    ]

    const allKeys: string[] = []
    function collect(obj: unknown, prefix = ''): void {
      if (!obj || typeof obj !== 'object') return
      for (const [key, val] of Object.entries(obj)) {
        allKeys.push(key)
        for (const forbidden of genericForbidden) {
          expect(key.toLowerCase()).not.toBe(forbidden)
        }
        if (typeof val === 'object' && val !== null) {
          collect(val, `${prefix}${key}.`)
        }
      }
    }
    collect(api)

    expect(allKeys.length).toBeGreaterThan(40)
  })
})
