import { useCallback, useEffect, useState } from 'react'
import type {
  AddressingDyadItem,
  CharacterGender,
  CharacterItem
} from '../../../../../shared/contracts/addressing'
import type { ContextStatus } from '../../../../../shared/contracts/glossary'

export interface UseAddressingOptions {
  workId: string
}

export interface UseAddressingReturn {
  characters: CharacterItem[]
  dyads: AddressingDyadItem[]
  loading: boolean
  error: string | null
  query: string
  setQuery: (q: string) => void
  chapterFilter: string | 'all'
  setChapterFilter: (c: string | 'all') => void
  reload: () => Promise<void>
  createCharacter: (input: {
    source: string
    target: string
    gender?: CharacterGender
    role?: string | null
    status?: ContextStatus
    notes?: string | null
    aliases?: string[]
  }) => Promise<CharacterItem>
  updateCharacter: (
    characterId: string,
    input: {
      source?: string
      target?: string
      gender?: CharacterGender
      role?: string | null
      status?: ContextStatus
      notes?: string | null
      aliases?: string[]
    }
  ) => Promise<CharacterItem>
  deleteCharacter: (characterId: string) => Promise<void>
  setDyad: (input: {
    dyadId?: string
    sourceCharacterId: string
    targetCharacterId: string
    speakerPronoun: string
    recipientPronoun: string
    secondPerson?: string | null
    formality?: string | null
    fromChapterId?: string | null
    toChapterId?: string | null
    status?: ContextStatus
    notes?: string | null
  }) => Promise<AddressingDyadItem>
  deleteDyad: (dyadId: string) => Promise<void>
}

export function useAddressing({ workId }: UseAddressingOptions): UseAddressingReturn {
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [dyads, setDyads] = useState<AddressingDyadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [chapterFilter, setChapterFilter] = useState<string | 'all'>('all')

  // `quiet` refetches without the loading state: a task wrote pairs while the list is open.
  const reload = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      setError(null)
      try {
        const [charsRes, dyadsRes] = await Promise.all([
          window.mira.addressing.characters.list({
            workId,
            // Rejected rows only keep the model from proposing them again; the flat list hides them.
            status: 'approved',
            query: query.trim() || undefined
          }),
          window.mira.addressing.dyads.list({
            workId,
            chapterId: chapterFilter === 'all' ? undefined : chapterFilter,
            status: 'approved'
          })
        ])

        if (charsRes.ok && dyadsRes.ok) {
          setCharacters(charsRes.value.characters)
          setDyads(dyadsRes.value.dyads)
        } else {
          const errMsg = !charsRes.ok
            ? charsRes.error.message
            : !dyadsRes.ok
              ? dyadsRes.error.message
              : 'Lỗi tải dữ liệu'
          setError(errMsg)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi khi tải dữ liệu xưng hô')
      } finally {
        setLoading(false)
      }
    },
    [workId, query, chapterFilter]
  )

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(
    () =>
      window.mira.agent?.tasks.onChanged((event) => {
        if (event.workId === workId) void reload(true)
      }),
    [workId, reload]
  )

  const createCharacter = useCallback(
    async (input: {
      source: string
      target: string
      gender?: CharacterGender
      role?: string | null
      status?: ContextStatus
      notes?: string | null
      aliases?: string[]
    }) => {
      const res = await window.mira.addressing.characters.create({
        workId,
        ...input
      })
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      await reload()
      return res.value
    },
    [workId, reload]
  )

  const updateCharacter = useCallback(
    async (
      characterId: string,
      input: {
        source?: string
        target?: string
        gender?: CharacterGender
        role?: string | null
        status?: ContextStatus
        notes?: string | null
        aliases?: string[]
      }
    ) => {
      const res = await window.mira.addressing.characters.update({
        workId,
        characterId,
        ...input
      })
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      await reload()
      return res.value
    },
    [workId, reload]
  )

  const deleteCharacter = useCallback(
    async (characterId: string) => {
      const res = await window.mira.addressing.characters.delete({
        workId,
        characterId
      })
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      await reload()
    },
    [workId, reload]
  )

  const setDyad = useCallback(
    async (input: {
      dyadId?: string
      sourceCharacterId: string
      targetCharacterId: string
      speakerPronoun: string
      recipientPronoun: string
      secondPerson?: string | null
      formality?: string | null
      fromChapterId?: string | null
      toChapterId?: string | null
      status?: ContextStatus
      notes?: string | null
    }) => {
      const res = await window.mira.addressing.dyads.set({
        workId,
        ...input
      })
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      await reload()
      return res.value
    },
    [workId, reload]
  )

  const deleteDyad = useCallback(
    async (dyadId: string) => {
      const res = await window.mira.addressing.dyads.delete({
        workId,
        dyadId
      })
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      await reload()
    },
    [workId, reload]
  )

  return {
    characters,
    dyads,
    loading,
    error,
    query,
    setQuery,
    chapterFilter,
    setChapterFilter,
    reload,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    setDyad,
    deleteDyad
  }
}
