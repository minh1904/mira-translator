import { createHash, randomUUID } from 'node:crypto'
import type { ReviewFlag } from '../../../shared/contracts/glossary'
import type { TokenUsage } from '../../../shared/contracts/usage'
import { addUsage, toWireUsage, type Usage } from '../../infra/providers/usage'
import { appendAiCall } from '../../infra/storage/aiCallLog'
import {
  listCharacters,
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
  familyBatches,
  familyMismatches,
  japaneseCandidates,
  knownForBatch,
  mergeCandidates,
  parseClassification,
  parseSweep,
  shortAliasClash,
  stripAuthorNote,
  sweepChunks,
  verifyTerms,
  type ExtractedTerm,
  type ExtractionChapter,
  type ExtractionMessage,
  type KnownTerm
} from '../ai/glossaryExtraction'
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
        const known: KnownTerm[] = entries.filter((entry) => entry.status !== 'rejected')
        const terms: ExtractedTerm[] = []
        for (const batch of familyBatches(
          candidates,
          CLASSIFY_BATCH,
          known.map((term) => term.source)
        )) {
          const messages = buildClassifyMessages(sourceLang, batch, knownForBatch(batch, known))
          terms.push(...parseClassification(await ask(messages)))
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
          saveExtraction(db, {
            runId,
            model,
            promptHash,
            scannedChapterIds: chunk.map((chapter) => chapter.id),
            candidates: writes,
            now: now()
          })
        )
        pending.push(...saved.pending)
        scannedChapterIds.push(...chunk.map((chapter) => chapter.id))
      }
      if (chapters.length > 0) {
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
  private knownTerms(workId: string): Array<KnownTerm & { aliases: string[]; status: string }> {
    return this.library.withWork(workId, (db) => {
      const types = new Map(readReviewInfo(db).map((info) => [info.entryId, info.termType]))
      return listContextEntries(db, { kind: 'term' }).map((entry) => ({
        source: entry.source,
        target: entry.target,
        aliases: entry.aliases,
        status: entry.status,
        type: types.get(entry.id) ?? null
      }))
    })
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
      evidence: evidence.filter((each) => each.lines.length > 0)
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
    for (const dyad of result.dyads) {
      const from = person(String(dyad.from))
      const to = person(String(dyad.to))
      const self = typeof dyad.self === 'string' ? dyad.self.trim() : ''
      const address = typeof dyad.address === 'string' ? dyad.address.trim() : ''
      const quotes = verifiedQuotes(dyad.evidence, chapters)
      if (!from || !to || !self || !address || quotes.length === 0) continue
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
    if (proposals.length === 0) return []
    const promptHash = 'sha256:' + createHash('sha256').update(messages[0]!.content).digest('hex')
    return this.library.withWork(workId, (db) =>
      saveAddressingProposals(db, { runId, model, promptHash, proposals, now })
    )
  }
}
