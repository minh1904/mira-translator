import { readConventions } from '../../../infra/storage/workConventions'
import { createHash } from 'node:crypto'
import type { AddressingDyadResolved, CharacterItem } from '../../../../shared/contracts/addressing'
import { LEGACY_PRESET_ALIASES } from '../../../../shared/contracts/addressing/compose'
import { resolveRegister } from '../../../../shared/contracts/addressing/resolve'
import type { RegisterSelection } from '../../../../shared/contracts/addressing/types'
import type { ContextEntryItem } from '../../../../shared/contracts/glossary'
import { listCharacters } from '../../../infra/storage/addressingEntries'
import type { LibraryStore } from '../../library/library'
import { matchContextEntries } from '../../../../shared/context/contextMatching'
import {
  buildTranslateRequest,
  charactersMentionedIn,
  dyadsMentionedIn,
  type TranslatePromptContext,
  type TranslateRequest
} from './translatePrompt'

/**
 * The approved work context one chapter translation run is planned with (change
 * `translation-context-snapshot`).
 *
 * The glossary is **all** of the chapter's effective approved glossary, not yet matched against any batch:
 * each batch still matches its own text, but against this list. Pairs and characters are already narrowed
 * to the chapter's text, the same narrowing the prompt has always used, so an edit to a character who is
 * not in the chapter does not count as a change.
 */
export interface ContextSnapshot {
  /** 1: `register` là mã bảng phẳng cũ (hoặc null); 2: `register` là bối cảnh và văn hóa. Bản 1 chỉ còn được đọc. */
  version: 1 | 2
  sourceLang: string
  genre: string | null
  register: RegisterSelection
  glossary: ContextEntryItem[]
  dyads: AddressingDyadResolved[]
  characters: CharacterItem[]
  /**
   * The task's steering instruction for this item, in full (change `add-agent-steering`). Absent
   * outside tasks, so the canonical JSON and hash of a plain run stay as they were.
   */
  instruction?: string
  /**
   * The work's honorifics convention when it is not the default (change `add-context-questions`), so a
   * pinned item keeps the one it started with and older snapshots keep their hash.
   */
  honorifics?: 'vietnamize'
}

export interface SnapshotRecord {
  snapshot: ContextSnapshot
  /** Canonical JSON: the same context always gives the same text, and so the same hash. */
  json: string
  hash: string
}

/** JSON with object keys sorted at every level; arrays keep their order (the queries order them). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.fromEntries(
      Object.keys(item as Record<string, unknown>)
        .sort()
        .map((key) => [key, (item as Record<string, unknown>)[key]])
    )
  })
}

export function recordOf(snapshot: ContextSnapshot): SnapshotRecord {
  const json = canonicalJson(snapshot)
  return { snapshot, json, hash: createHash('sha256').update(json).digest('hex') }
}

/**
 * Reads a stored snapshot back. Its hash is the stored one: the JSON is never rewritten. A version 1
 * snapshot kept a flat register id; it reads as the setting and culture that id stands for, so its request
 * can still be rebuilt (the table text may differ from the one it was sent with, which `matches` reports).
 */
export function parseSnapshot(json: string): ContextSnapshot {
  const raw = JSON.parse(json) as Omit<ContextSnapshot, 'register'> & {
    register: string | RegisterSelection | null
  }
  if (typeof raw.register === 'object' && raw.register !== null) return raw as ContextSnapshot
  const legacy = raw.register === null ? undefined : LEGACY_PRESET_ALIASES[raw.register]
  return {
    ...raw,
    register: { setting: legacy?.setting ?? null, extra: [], culture: legacy?.culture ?? null }
  }
}

/**
 * The prompt context of one batch, built from the run's snapshot and never from the live store. The
 * glossary is still matched against the batch's own text, but only among the snapshot's entries.
 */
export function promptFromSnapshot(
  snapshot: ContextSnapshot,
  batchText: string,
  previous: string[]
): TranslatePromptContext {
  return {
    sourceLang: snapshot.sourceLang,
    genre: snapshot.genre,
    glossary: matchContextEntries(batchText, snapshot.glossary, snapshot.sourceLang),
    dyads: snapshot.dyads,
    register: snapshot.register,
    characters: snapshot.characters,
    previous,
    ...(snapshot.instruction ? { instruction: snapshot.instruction } : {}),
    ...(snapshot.honorifics === 'vietnamize' ? { honorifics: { mode: 'localize' as const } } : {})
  }
}

/** What a batch trace must carry, besides the snapshot, to rebuild its main request. */
export interface RebuildableTrace {
  previous: string[]
  contextHash: string
  /**
   * The output mode the batch's answer came from; absent on traces from before the mode existed. Only
   * `object` changes the request: a batch that fell back was sent again as `array`.
   */
  outputMode?: string
}

/**
 * Rebuilds the main request of a batch from its trace and the snapshot it points to, with today's prompt
 * builder. The result's `requestHash` equals the trace's `contextHash` as long as the builder has not
 * changed since; `matches` says whether it does.
 */
export function rebuildTranslateRequest(
  trace: RebuildableTrace,
  snapshot: ContextSnapshot,
  units: Array<{ id: string; text: string }>
): TranslateRequest & { matches: boolean } {
  const prompt = promptFromSnapshot(
    snapshot,
    units.map((unit) => unit.text).join('\n'),
    trace.previous
  )
  const request = buildTranslateRequest(
    trace.outputMode === 'object' ? { ...prompt, outputMode: 'object' } : prompt,
    units.map((unit, index) => ({ tempId: `[${index + 1}]`, originalId: unit.id, text: unit.text }))
  )
  return { ...request, matches: request.requestHash === trace.contextHash }
}

/**
 * Takes the snapshot from the live store. The same function serves `plan()` (what the run will use) and
 * every batch (what the store says now), so comparing the two hashes tells a real change from none.
 */
export function takeContextSnapshot(
  library: LibraryStore,
  workId: string,
  chapterId: string,
  chapterSource: string,
  instruction?: string
): SnapshotRecord {
  const work = library.get(workId)
  const glossary = library.getEffectiveGlossary(workId, chapterId, { approvedOnly: true })
  const dyads = dyadsMentionedIn(library.getEffectiveAddressing(workId, chapterId), chapterSource)
  const characters = charactersMentionedIn(
    library.withWork(workId, (db) => listCharacters(db, { status: 'approved' })),
    chapterSource
  )
  return recordOf({
    version: 2,
    sourceLang: work.sourceLang,
    genre: work.genre ?? null,
    register: resolveRegister(work),
    glossary,
    dyads,
    characters,
    ...(instruction ? { instruction } : {}),
    ...(library.withWork(workId, (db) => readConventions(db)).honorifics.value === 'vietnamize'
      ? { honorifics: 'vietnamize' as const }
      : {})
  })
}
