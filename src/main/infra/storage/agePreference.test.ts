import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { LibraryStore } from '../../services/library/library'
import { readAgeConfirmed, writeAgeConfirmed } from './agePreference'

const tempDir = createTempDirs()

describe('age confirmation preference', () => {
  it('defaults to unconfirmed, persists in the library and can be revoked', () => {
    const dataDir = tempDir()
    let library = LibraryStore.open({ dataDir })
    expect(readAgeConfirmed(library.appDb)).toBe(false)
    writeAgeConfirmed(library.appDb, true)
    library.close()

    library = LibraryStore.open({ dataDir })
    expect(readAgeConfirmed(library.appDb)).toBe(true)
    writeAgeConfirmed(library.appDb, false)
    expect(readAgeConfirmed(library.appDb)).toBe(false)
    library.close()
  })
})
