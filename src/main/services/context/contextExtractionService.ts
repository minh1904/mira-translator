import { createHash, randomUUID } from 'node:crypto'
import type { ReviewFlag } from '../../../shared/contracts/glossary'
import type { TokenUsage } from '../../../shared/contracts/usage'
import { addUsage, toWireUsage, type Usage } from '../../infra/providers/usage'
import { appendAiCall } from '../../infra/storage/aiCallLog'
import {
  changeDyadFrom,
  listCharacters,
  listDyads,
  saveAddressingProposals,
  type AddressingProposal
} from '../../infra/storage/addressingEntries'
import {
  listContextEntries,
  listScannedChapterIds,
  readReviewInfo,
  saveExtraction,
  type ExtractedCandidateWrite
} from '../../infra/storage/contextEntries'
import {
  addressChanges,
  buildAnalysisMessages,
  collectAddressingEvidence,
  parseAnalysis,
  provenGender,
  verifiedQuotes,
  type AnalysisCharacter
} from '../ai/addressingAnalysis'
import type { ConnectionService } from '../ai/connectionService'
import { suggestRegister } from '../ai/translate/languageProfiles'
import {
  buildClassifyMessages,
  buildSweepMessages,
  countForms,
  familyBatches,
  familyMismatches,
  japaneseCandidates,
  knownForBatch,
  mergeCandidates,
  nameParts,
  parseClassification,
  parseRevisions,
  parseSweep,
  shortAliasClash,
  stripAuthorNote,
  sweepChunks,
  verifiedRevisionQuotes,
  verifyTerms,
  type ExtractedRevision,
  type ExtractedTerm,
  type ExtractionChapter,
  type ExtractionMessage,
  type KnownInChunk,
  type KnownTerm
} from '../ai/glossaryExtraction'
import {
  flagRevision,
  reviseEntry,
  revisionBlock,
  type RevisionQuote
} from '../../infra/storage/contextRevisions'
import type { Db } from '../../infra/storage/sqlite'
import type { LibraryStore } from '../library/library'

/** One model call: the messages in, the text and reported usage out. */
export type ExtractionCaller = (
  messages: ExtractionMessage[],
  signal?: AbortSignal
) => Promise<{ text: string; usage: Usage | null }>

export type ExtractionStopReason = 'pause' | 'budget' | 'app_closed'

export interface ExtractContextInput {
  workId: string
  /** The task's chapters; only those without a scan row are sent. */
  chapterIds: string[]
  modelSelection: { connectionId: string; entryId: string }
  runId?: string
  /** Asked before every model call; `false` stops the run before the request (task caps). */
  gate?: () => boolean
  /** Checked before every model call. */
  shouldStop?: () => ExtractionStopReason | null
  signal?: AbortSignal
  /** Usage so far after every call, also when a call fails. */
  onUsage?: (usage: TokenUsage | null, calls: number) => void
}

export interface ExtractContextResult {
  state: 'completed' | 'stopped'
  stopReason: ExtractionStopReason | null
  /** Entries this run added (they apply at once), then the new addressing pairs. Named before review went. */
  pending: string[]
  scannedChapterIds: string[]
  calls: number
  usage: TokenUsage | null
}

const CLASSIFY_BATCH = 60
const CANDIDATE_LIMIT = 400
const KNOWN_IN_CHUNK = 20
const QUOTES_PER_TERM = 3
const NAME_TYPES = new Set(['person', 'place', 'organization'])

class Stopped extends Error {
  constructor(readonly reason: ExtractionStopReason) {
    super(reason)
  }
}

/**
 * A suggested name in a script the naming policy does not expect: Japanese names in Latin letters,
 * Chinese names in Vietnamese (Hán Việt). Flagged for the reviewer, never fixed.
 * shortcut: Vietnamese is told from pinyin only by letters Vietnamese lacks (f, j, w, z) and the finals
 * `ei`/`ou`; a syllable-level check would catch more if reviewers report misses.
 */
export function scriptMismatch(sourceLang: string, type: string, target: string): boolean {
  if (sourceLang === 'ja') return type === 'person' && !/^[\p{Script=Latin}\s.'-]+$/u.test(target)
  if (sourceLang === 'zh-Hans' || sourceLang === 'zh-Hant') {
    if (!NAME_TYPES.has(type)) return false
    if (!/^[\p{Script=Latin}\s.'-]+$/u.test(target)) return true
    return /[fjwz]/i.test(target) || /(ei|ou)\b/i.test(target)
  }
  return false
}

interface KnownEntry extends KnownTerm {
  id: string
  notes: string | null
  aliases: string[]
  status: string
  toChapterId: string | null
}

/**
 * Entries whose forms appear in the chunk, most frequent first, with a fresh line from the latest
 * chapter that has one: what the model may propose to fix.
 */
function knownInChunk(
  entries: KnownEntry[],
  chunk: ExtractionChapter[]
): Array<KnownInChunk & { id: string }> {
  const counts = countForms(
    entries.flatMap((entry) => [entry.source, ...entry.aliases]),
    chunk,
    chunk.length
  )
  return entries
    .map((entry) => {
      const seen = [entry.source, ...entry.aliases].map((form) => counts.get(form))
      const count = seen.reduce((sum, each) => sum + (each?.count ?? 0), 0)
      const context = seen
        .flatMap((each) => each?.contexts ?? [])
        .sort((a, b) => b.chapter - a.chapter)[0]
      return { entry, count, context }
    })
    .filter((each) => each.count > 0 && each.context)
    .sort((a, b) => b.count - a.count)
    .slice(0, KNOWN_IN_CHUNK)
    .map(({ entry, context }) => ({
      id: entry.id,
      source: entry.source,
      target: entry.target,
      notes: entry.notes,
      context: context!
    }))
}

/**
 * A pair the analysis says changes from a chapter, when the pair already applies there: through the
 * guards of `revisionBlock`, then `changeDyadFrom`, else a `revision_suggested` flag. Returns the new
 * pair's id, 'kept' when nothing applies, or `null` when there is no such pair (a normal proposal).
 */
function progressDyad(
  db: Db,
  input: {
    from: string
    to: string
    fromChapterId: string
    self: string
    address: string
    secondPerson: string | null
    evidence: RevisionQuote[]
    runId: string
    now: number
  }
): string | 'kept' | null {
  return db.transaction(() => {
    const idOf = (source: string): string | undefined =>
      listCharacters(db).find((each) => each.source.toLowerCase() === source.toLowerCase())?.id
    const sourceCharacterId = idOf(input.from)
    const targetCharacterId = idOf(input.to)
    if (!sourceCharacterId || !targetCharacterId) return null
    const active = listDyads(db, { chapterId: input.fromChapterId, status: 'approved' }).find(
      (dyad) =>
        dyad.sourceCharacterId === sourceCharacterId && dyad.targetCharacterId === targetCharacterId
    )
    if (!active) return null
    if (active.speakerPronoun === input.self && active.recipientPronoun === input.address)
      return 'kept'
    const blocked = revisionBlock(db, {
      entryId: active.id,
      actor: 'ai',
      kind: 'progression',
      fromChapterId: input.fromChapterId,
      evidence: input.evidence,
      values: {}
    })
    if (blocked) {
      flagRevision(db, active.id, {
        kind: 'progression',
        fields: { target: `${input.self} / ${input.address}` },
        fromChapterId: input.fromChapterId,
        evidence: input.evidence,
        reason: blocked
      })
      return 'kept'
    }
    try {
      return changeDyadFrom(
        db,
        {
          newDyadId: randomUUID(),
          sourceCharacterId,
          targetCharacterId,
          fromChapterId: input.fromChapterId,
          speakerPronoun: input.self,
          recipientPronoun: input.address,
          secondPerson: input.secondPerson,
          actor: 'ai',
          quote: input.evidence[0],
          runId: input.runId
        },
        input.now
      ).newDyadId
    } catch {
      // The pair starts at that chapter or later: an edit for a person, not for the model.
      return 'kept'
    }
  })
}

/** Verbatim lines of `chapters` that contain `form`, one per chapter. */
function quotesOf(
  form: string,
  chapters: Array<ExtractionChapter & { id: string }>
): ExtractedCandidateWrite['evidence'] {
  const quotes: ExtractedCandidateWrite['evidence'] = []
  for (const chapter of chapters) {
    const line = chapter.text.split(/\r?\n/).find((text) => text.includes(form))
    if (line) quotes.push({ chapterId: chapter.id, quote: line.trim().slice(0, 200) })
    if (quotes.length >= QUOTES_PER_TERM) break
  }
  return quotes
}

/** Identifies the prompt version of a source language: both system prompts, hashed. */
export function extractionPromptHash(sourceLang: string): string {
  const text =
    buildSweepMessages(sourceLang, [])[0]!.content +
    '\n' +
    buildClassifyMessages(sourceLang, [])[0]!.content
  return 'sha256:' + createHash('sha256').update(text).digest('hex')
}

/**
 * Term extraction in the product (change `add-agent-context-workflow`): the Lab's steps 1–4 (code
 * candidates, sweep, classify, `verifyTerms`) over the chapters no run has scanned yet, one sweep chunk at
 * a time. A chunk's candidates, quotes and scan rows are written in one work DB transaction after its
 * last call; a failed call writes nothing for its chunk. Nothing is ever approved here.
 */
export class ContextExtractionService {
  constructor(
    private readonly library: LibraryStore,
    private readonly connections: ConnectionService,
    private readonly options: {
      /** Replaces the provider call; tests script it. */
      caller?: (selection: { connectionId: string; entryId: string }) => ExtractionCaller
      now?: () => number
    } = {}
  ) {}

  /** The task's chapters that still need a scan, in work order. */
  unscanned(workId: string, chapterIds: string[]): string[] {
    const scanned = this.library.withWork(workId, (db) => listScannedChapterIds(db))
    return chapterIds.filter((id) => !scanned.has(id))
  }

  async extract(input: ExtractContextInput): Promise<ExtractContextResult> {
    const now = this.options.now ?? Date.now
    const runId = input.runId ?? randomUUID()
    const sourceLang = this.library.get(input.workId).sourceLang
    const translator = this.connections.translator(
      input.modelSelection.connectionId,
      input.modelSelection.entryId
    )
    const call: ExtractionCaller =
      this.options.caller?.(input.modelSelection) ??
      (async (messages, signal) => {
        const result = await translator.provider.complete(messages, { signal })
        return { text: result.text, usage: result.usage }
      })
    const model = translator.entry.model
    const promptHash = extractionPromptHash(sourceLang)

    const numbers = new Map(
      this.library.listChapters(input.workId).map((chapter) => [chapter.id, chapter.number])
    )
    const unscanned = new Set(this.unscanned(input.workId, input.chapterIds))
    // Frequencies count over every chapter up to the task's last one, never past it (no spoilers), read
    // once per run without the author's end notes.
    const last = Math.max(-Infinity, ...input.chapterIds.flatMap((id) => numbers.get(id) ?? []))
    const corpus: Array<ExtractionChapter & { id: string }> = []
    for (const [id, number] of [...numbers].sort((a, b) => a[1] - b[1])) {
      if (number > last) break
      let text = ''
      try {
        text = stripAuthorNote(this.library.readText(input.workId, id, 'source').content)
      } catch {
        // A chapter without a readable source is not scanned; a later run tries again.
      }
      if (text.trim() !== '') corpus.push({ id, number, text })
    }
    const inTask = new Set(input.chapterIds)
    // Every chapter of the task is addressing evidence; only the unscanned ones are swept.
    const taskChapters = corpus.filter((chapter) => inTask.has(chapter.id))
    const chapters = taskChapters.filter((chapter) => unscanned.has(chapter.id))

    let calls = 0
    let usage: Usage | null = null
    let calledWithoutUsage = false
    const wire = (complete: boolean): TokenUsage | null =>
      usage ? toWireUsage(usage, complete && !calledWithoutUsage) : null
    const ask = async (messages: ExtractionMessage[]): Promise<string> => {
      const stop = input.shouldStop?.() ?? null
      if (stop) throw new Stopped(stop)
      if (input.gate && !input.gate()) throw new Stopped('budget')
      calls++
      // Report the call as it starts: one call can take minutes and the task should show it.
      input.onUsage?.(wire(false), calls)
      const log = { kind: 'extract', runId, model, promptHash, messages }
      try {
        const result = await call(messages, input.signal)
        if (result.usage) usage = addUsage(usage, result.usage)
        else calledWithoutUsage = true
        appendAiCall(input.workId, { ...log, raw: result.text, usage: result.usage })
        return result.text
      } catch (error) {
        appendAiCall(input.workId, {
          ...log,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      } finally {
        input.onUsage?.(wire(false), calls)
      }
    }

    const pending: string[] = []
    const scannedChapterIds: string[] = []
    try {
      for (const chunk of sweepChunks(chapters)) {
        input.signal?.throwIfAborted()
        const swept = parseSweep(await ask(buildSweepMessages(sourceLang, chunk)))
        const entries = this.knownTerms(input.workId)
        // Existing terms are never classified again, rejected ones included.
        const owned = new Set(
          entries.flatMap((entry) => [entry.source, ...entry.aliases]).map((f) => f.toLowerCase())
        )
        const fromCode = sourceLang === 'ja' ? japaneseCandidates(chunk, { corpus }) : []
        const candidates = mergeCandidates(fromCode, swept, chunk, { corpus, limit: Infinity })
          .filter((candidate) => !owned.has(candidate.source.toLowerCase()))
          .slice(0, CANDIDATE_LIMIT)
        const known = entries.filter((entry) => entry.status !== 'rejected')
        // Entries seen in this chunk ride along with the first batch, so the model can propose fixes.
        const inChunk = knownInChunk(
          known.filter((entry) => entry.toChapterId === null),
          chunk
        )
        const terms: ExtractedTerm[] = []
        const revisions: ExtractedRevision[] = []
        let first = true
        for (const batch of familyBatches(
          candidates,
          CLASSIFY_BATCH,
          known.map((term) => term.source)
        )) {
          const messages = buildClassifyMessages(
            sourceLang,
            batch,
            knownForBatch(batch, known),
            first ? inChunk : []
          )
          first = false
          const text = await ask(messages)
          terms.push(...parseClassification(text))
          revisions.push(...parseRevisions(text))
        }
        input.signal?.throwIfAborted()
        const verified = verifyTerms(terms, corpus, sourceLang)
        const readings = new Map(candidates.map((c) => [c.source, c.reading]))
        // `alias_of` turns a form into an alias of the entry it names; one that names nothing is a new term.
        const fresh: ExtractedTerm[] = []
        const variants: ExtractedCandidateWrite[] = []
        for (const term of verified.accepted) {
          const of = term.alias_of?.toLowerCase()
          const entry = of
            ? known.find((e) =>
                [e.source, ...(e.aliases ?? [])].some((f) => f.toLowerCase() === of)
              )
            : undefined
          if (entry) {
            variants.push({
              source: entry.source,
              target: entry.target,
              termType: term.type,
              status: 'approved',
              aliases: [term.source, ...(term.aliases ?? [])],
              evidence: quotesOf(term.source, chunk)
            })
          } else if (term.target?.trim()) fresh.push(term)
        }
        const mismatched = familyMismatches(
          fresh.map((term) => ({ source: term.source, target: term.target!, type: term.type })),
          known
        )
        const forms = new Set([
          ...owned,
          ...fresh.flatMap((term) =>
            [term.source, ...(term.aliases ?? [])].map((f) => f.toLowerCase())
          )
        ])
        const writes: ExtractedCandidateWrite[] = [
          ...variants,
          ...fresh.map((term) => {
            const target = term.target!.trim()
            const flags: ReviewFlag[] = scriptMismatch(sourceLang, term.type, target)
              ? [{ code: 'script_mismatch' }]
              : []
            if (mismatched.has(term.source)) flags.push({ code: 'family_mismatch' })
            const aliases = (term.aliases ?? []).filter((alias) => {
              if (!shortAliasClash(alias, corpus, forms)) return true
              flags.push({ code: 'short_alias', detail: alias })
              return false
            })
            return {
              source: term.source,
              target,
              termType: term.type,
              status: 'approved' as const,
              aliases,
              notes: term.note ?? null,
              reading: term.reading ?? readings.get(term.source) ?? null,
              flags,
              evidence: quotesOf(term.source, chunk)
            }
          }),
          ...verified.rejected.map((term) => ({
            source: term.source,
            target: '',
            termType: term.type,
            status: 'rejected' as const,
            notes: term.reason ?? null,
            evidence: []
          }))
        ]
        const saved = this.library.withWork(input.workId, (db) =>
          db.transaction(() => {
            const result = saveExtraction(db, {
              runId,
              model,
              promptHash,
              scannedChapterIds: chunk.map((chapter) => chapter.id),
              candidates: writes,
              now: now()
            })
            this.applyRevisions(db, revisions, inChunk, chunk, corpus, runId, now())
            return result
          })
        )
        pending.push(...saved.pending)
        scannedChapterIds.push(...chunk.map((chapter) => chapter.id))
      }
      if (chapters.length > 0) {
        this.splitFullNames(input.workId, corpus, runId, now())
        pending.push(
          ...(await this.analyzeAddressing(
            input.workId,
            sourceLang,
            taskChapters,
            ask,
            model,
            runId,
            now()
          ))
        )
      }
    } catch (error) {
      if (!(error instanceof Stopped)) throw error
      return {
        state: 'stopped',
        stopReason: error.reason,
        pending,
        scannedChapterIds,
        calls,
        usage: wire(false)
      }
    }
    return {
      state: 'completed',
      stopReason: null,
      pending,
      scannedChapterIds,
      calls,
      usage: wire(true)
    }
  }
  /** The work's glossary terms, rejected ones included, with the type extraction gave them. */
  private knownTerms(workId: string): KnownEntry[] {
    return this.library.withWork(workId, (db) => {
      const types = new Map(readReviewInfo(db).map((info) => [info.entryId, info.termType]))
      return listContextEntries(db, { kind: 'term' }).map((entry) => ({
        id: entry.id,
        source: entry.source,
        target: entry.target,
        notes: entry.notes,
        aliases: entry.aliases,
        status: entry.status,
        toChapterId: entry.toChapterId,
        type: types.get(entry.id) ?? null
      }))
    })
  }

  /** Parts of people's full names that the text uses on their own become aliases, by code. */
  private splitFullNames(
    workId: string,
    corpus: ExtractionChapter[],
    runId: string,
    now: number
  ): void {
    const people = this.knownTerms(workId).filter(
      (entry) =>
        entry.type === 'person' && entry.status !== 'rejected' && /[・＝]/u.test(entry.source)
    )
    for (const entry of people) {
      const added = nameParts(entry.source, corpus).filter((form) => !entry.aliases.includes(form))
      if (added.length === 0) continue
      this.library.withWork(workId, (db) =>
        reviseEntry(
          db,
          {
            entryId: entry.id,
            actor: 'code',
            kind: 'correction',
            fields: { aliases: added },
            evidence: [],
            runId
          },
          now
        )
      )
    }
  }

  /**
   * The model's fixes of entries it was shown: each needs a real quote from the chunk, then goes through
   * `reviseEntry`, whose guards keep it to a flag when it must not apply. Others are dropped.
   */
  private applyRevisions(
    db: Db,
    revisions: ExtractedRevision[],
    shown: Array<KnownInChunk & { id: string }>,
    chunk: Array<ExtractionChapter & { id: string }>,
    corpus: Array<ExtractionChapter & { id: string }>,
    runId: string,
    now: number
  ): void {
    const idOf = (number: number): string | null =>
      corpus.find((chapter) => chapter.number === number)?.id ?? null
    for (const revision of revisions) {
      const entry = shown.find((each) => each.source === revision.source)
      if (!entry) continue
      const quotes = verifiedRevisionQuotes(revision.evidence, chunk)
      if (quotes.length === 0) continue
      const fromChapterId =
        revision.kind === 'progression' && revision.fromChapter !== undefined
          ? idOf(revision.fromChapter)
          : null
      if (revision.kind === 'progression' && !fromChapterId) continue
      const text = chunk.map((chapter) => chapter.text).join('\n')
      reviseEntry(
        db,
        {
          entryId: entry.id,
          actor: 'ai',
          kind: revision.kind,
          fromChapterId,
          fields: {
            ...(revision.target ? { target: revision.target } : {}),
            ...(revision.notes ? { notes: revision.notes } : {}),
            ...(revision.aliases
              ? { aliases: revision.aliases.filter((alias) => text.includes(alias)) }
              : {})
          },
          evidence: quotes.map((quote) => ({ chapterId: idOf(quote.chapter), quote: quote.quote })),
          runId
        },
        now
      )
    }
  }

  /**
   * Addressing analysis after the sweep (decision 2026-10-14): the work's people — characters and
   * glossary persons that are not rejected — with dialogue lines in the task's chapters, one model call,
   * and every proposed pair with a verbatim quote saved `approved` next to the terms. Fewer than two
   * people with lines means no call; an answer that is not JSON proposes nothing.
   */
  private async analyzeAddressing(
    workId: string,
    sourceLang: string,
    chapters: Array<ExtractionChapter & { id: string }>,
    ask: (messages: ExtractionMessage[]) => Promise<string>,
    model: string,
    runId: string,
    now: number
  ): Promise<string[]> {
    const people = new Map<string, AnalysisCharacter>()
    this.library.withWork(workId, (db) => {
      for (const character of listCharacters(db)) {
        if (character.status === 'rejected') continue
        people.set(character.source, {
          source: character.source,
          target: character.target,
          aliases: character.aliases,
          ...(character.gender !== 'unknown' ? { gender: character.gender } : {}),
          ...(character.role ? { role: character.role } : {})
        })
      }
      const types = new Map(readReviewInfo(db).map((info) => [info.entryId, info.termType]))
      for (const entry of listContextEntries(db, { kind: 'term' })) {
        if (
          types.get(entry.id) !== 'person' ||
          entry.status === 'rejected' ||
          people.has(entry.source)
        )
          continue
        people.set(entry.source, {
          source: entry.source,
          target: entry.target,
          aliases: entry.aliases,
          ...(entry.notes ? { notes: entry.notes } : {})
        })
      }
    })
    const all = [...people.values()]
    const evidence = collectAddressingEvidence(chapters, all, sourceLang)
    const speaking = all.filter((_, index) => evidence[index]!.lines.length > 0)
    if (speaking.length < 2) return []

    const genre = this.library.get(workId).genre ?? null
    const messages = buildAnalysisMessages({
      sourceLang,
      register: suggestRegister(sourceLang, genre) ?? null,
      characters: speaking,
      evidence: evidence.filter((each) => each.lines.length > 0),
      possibleChanges: addressChanges(chapters, speaking)
    })
    const text = await ask(messages)
    let result: ReturnType<typeof parseAnalysis>
    try {
      result = parseAnalysis(text)
    } catch {
      return []
    }
    const facts = new Map(result.characters.map((each) => [each.source, each]))
    const person = (source: string): AddressingProposal['from'] | null => {
      const known = people.get(source)
      if (!known) return null
      const fact = facts.get(source)
      const gender = provenGender(fact, [known.source, ...(known.aliases ?? [])], chapters)
      return {
        source: known.source,
        target: known.target,
        gender,
        thirdPerson: typeof fact?.thirdPerson === 'string' ? fact.thirdPerson : null
      }
    }
    const proposals: AddressingProposal[] = []
    const changed: string[] = []
    for (const dyad of result.dyads) {
      const from = person(String(dyad.from))
      const to = person(String(dyad.to))
      const self = typeof dyad.self === 'string' ? dyad.self.trim() : ''
      const address = typeof dyad.address === 'string' ? dyad.address.trim() : ''
      const quotes = verifiedQuotes(dyad.evidence, chapters)
      if (!from || !to || !self || !address || quotes.length === 0) continue
      const fromChapterId = chapters.find((chapter) => chapter.number === dyad.fromChapter)?.id
      if (fromChapterId) {
        const outcome = this.library.withWork(workId, (db) =>
          progressDyad(db, {
            from: from.source,
            to: to.source,
            fromChapterId,
            self,
            address,
            secondPerson: typeof dyad.secondPerson === 'string' ? dyad.secondPerson : null,
            evidence: quotes.map((quote) => ({
              chapterId: chapters.find((chapter) => chapter.number === quote.chapter)?.id ?? null,
              quote: quote.quote
            })),
            runId,
            now
          })
        )
        if (outcome !== null) {
          if (outcome !== 'kept') changed.push(outcome)
          continue
        }
      }
      proposals.push({
        from,
        to,
        self,
        address,
        secondPerson: typeof dyad.secondPerson === 'string' ? dyad.secondPerson : null,
        notes: typeof dyad.notes === 'string' ? dyad.notes : null,
        evidence: quotes.map((quote) => ({
          chapterId: chapters.find((chapter) => chapter.number === quote.chapter)?.id ?? null,
          quote: quote.quote
        }))
      })
    }
    if (proposals.length === 0) return changed
    const promptHash = 'sha256:' + createHash('sha256').update(messages[0]!.content).digest('hex')
    return [
      ...changed,
      ...this.library.withWork(workId, (db) =>
        saveAddressingProposals(db, { runId, model, promptHash, proposals, now })
      )
    ]
  }
}
