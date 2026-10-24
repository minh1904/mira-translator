/**
 * Mira Lab — CLI thử hệ thống prompt trên truyện thật, ngoài giao diện.
 *
 * Mỗi truyện nạp thành nhiều **bản** (biến thể) trong một thư viện Mira riêng
 * (`fixtures/private/lab/data`), cùng bản gốc và cùng glossary. Một biến thể là phiên bản prompt
 * cộng mức thinking: `a`, `a-nothink`, `a-think`… Dịch đi qua đúng đường của UI
 * (`ParagraphTranslator`, chính sách tự áp dụng), nên mở thư viện này bằng app (`MIRA_DATA_DIR`) là
 * đọc được kết quả ngay trong editor.
 *
 * Chạy: `node scripts/lab/mira-lab.mjs <lệnh>`; `help` liệt kê lệnh.
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { LibraryStore } from '../../src/main/services/library/library'
import { createServices, type Services } from '../../src/main/services/createServices'
import { GlossaryService } from '../../src/main/services/context/glossaryService'
import { AddressingService } from '../../src/main/services/context/addressingService'
import type { CharacterGender } from '../../src/shared/contracts/addressing'
import { addressingGaps, isPronounLike } from '../../src/measurement/addressingGaps'
import {
  buildAnalysisMessages,
  collectAddressingEvidence,
  parseAnalysis
} from '../../src/main/services/ai/addressingAnalysis'
import { resolveRegister } from '../../src/shared/contracts/addressing/resolve'
import type { TranslationModelCaller } from '../../src/shared/contracts/translateCore'
import type { SecretCrypto } from '../../src/main/infra/storage/secretStore'
import { ParagraphTranslator, paragraphUnits } from '../../src/main/services/ai/paragraphTranslation'
import { sanitizeJsonString } from '../../src/shared/translation/lenientParser'
import { costOfUsage } from '../../src/main/services/ai/costEstimate'
import { lookupModel } from '../../src/main/infra/providers/modelCatalog'
import { getRunContext } from '../../src/main/infra/storage/translateRunContext'
import {
  OUTCOMES,
  batchOutcomes,
  comparableKeys,
  countOutcomes,
  exclusionLine,
  estimateRepeatCost,
  groupRepeats,
  notRunChapter,
  paragraphKey,
  parseOutcomeLines,
  refusalReasons,
  repeatBase,
  repeatLabels,
  type ChapterOutcomes,
  type ParagraphOutcome
} from '../../src/measurement/labOutcomes'
import {
  checkThinkingLevel,
  describeThinkingCheck
} from '../../src/main/infra/providers/modelCapability'
import { formatAsNovelHtml } from '../../src/main/services/export/formatters/pdfFormatter'
import { segment } from '../../src/shared/segmentation/segmenter'
import { DESCRIPTION_MAX } from '../../src/shared/contracts/library'
import { THINKING_LEVELS, type ThinkingLevel } from '../../src/shared/contracts/modelSettings'
import type { ContextEntryItem } from '../../src/shared/contracts/glossary'
import { TRANSLATE_PROMPT_VERSION } from '../../src/main/services/ai/translate/translatePrompt'
import { nameConsistency, overallConsistency } from '../../src/measurement/nameConsistency'
import {
  buildClassifyMessages,
  buildSweepMessages,
  japaneseCandidates,
  mergeCandidates,
  parseClassification,
  parseSweep,
  sweepChunks,
  verifyTerms,
  type ExtractedTerm
} from '../../src/main/services/ai/glossaryExtraction'
import {
  REGISTRY_SCHEMA,
  compareGroups,
  completionCells,
  glossaryOriginOf,
  historyMarkdown,
  contextDifferences,
  parseRegistry,
  runIdToIso,
  snapshotOf,
  summarizeRun,
  type GlossaryOrigin,
  type GlossaryProvenance,
  type MeasurementRecord,
  type RunOutput,
  type RunRecord
} from '../../src/measurement/runRegistry'
import {
  POLISH_PROMPT_VERSION,
  buildPolishMessages,
  parsePolish,
  polishBatches,
  verifyEdits,
  type PolishItem,
  type PolishName,
  type PolishTerm,
  type RejectedEdit
} from '../../src/main/services/ai/polish'

const ROOT = process.cwd()
const LAB = join(ROOT, 'fixtures', 'private', 'lab')
const MANIFEST = join(LAB, 'lab.json')
/** Sổ đăng ký: mỗi lần chạy và mỗi lần đo một dòng, chỉ thêm. */
const REGISTRY = join(LAB, 'registry')
const RUNS_LOG = join(REGISTRY, 'runs.jsonl')
const MEASUREMENTS_LOG = join(REGISTRY, 'measurements.jsonl')
const HISTORY = join(ROOT, 'docs', 'modules', 'measurement', 'history.md')
const DEFAULT_VARIANTS = ['base']
/** Mức thinking mà hậu tố `-think` chọn. */
const THINK_LEVEL: ThinkingLevel = 'medium'

// ---------------------------------------------------------------- tham số và cấu hình

interface Args {
  command: string
  positional: string[]
  flags: Map<string, string>
}

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv
  const positional: string[] = []
  const flags = new Map<string, string>()
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const [name, inline] = arg.slice(2).split('=', 2)
    const next = rest[i + 1]
    if (inline !== undefined) flags.set(name, inline)
    else if (next !== undefined && !next.startsWith('--')) flags.set(name, rest[++i])
    else flags.set(name, 'true')
  }
  return { command, positional, flags }
}

function loadEnvFile(): Record<string, string> {
  const path = join(ROOT, '.env')
  const out: Record<string, string> = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const fileEnv = loadEnvFile()
const env = (name: string, fallback = ''): string => process.env[name] || fileEnv[name] || fallback

/** `1-3,5` → [1, 2, 3, 5]. Bỏ trống là mọi chương. */
function parseRange(spec: string | undefined, max: number): number[] {
  if (!spec || spec === 'true' || spec === 'all')
    return Array.from({ length: max }, (_, i) => i + 1)
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((value) => Number(value.trim()))
    if (!Number.isInteger(a)) throw new Error('Phạm vi chương không hợp lệ: ' + spec)
    for (let n = a; n <= (Number.isInteger(b) ? b : a); n++) if (n >= 1 && n <= max) out.add(n)
  }
  return [...out].sort((x, y) => x - y)
}

// ---------------------------------------------------------------- biến thể

interface Variant {
  label: string
  /** Vắng là để mặc định của model. */
  thinking?: ThinkingLevel
}

/**
 * Nhãn là tên tự đặt (prompt chỉ còn một thế hệ): `a` → thinking mặc định. `a-nothink` → thinking
 * `off`. `a-think` → `medium`. Có thể ghi thẳng mức: `a-low`, `b-high`.
 */
function parseVariant(label: string): Variant {
  // Phần sau "+" chỉ là nhãn để giữ nhiều lần thử cạnh nhau (ví dụ "a-nothink+ctx"), không đổi cấu hình.
  // `a-nothink#2` là lần lặp thứ hai của `a-nothink`: cùng cấu hình.
  const suffix = repeatBase(label).split('+')[0].split('-', 2)[1]
  if (suffix === undefined) return { label }
  if (suffix === 'nothink') return { label, thinking: 'off' }
  if (suffix === 'think') return { label, thinking: THINK_LEVEL }
  if ((THINKING_LEVELS as readonly string[]).includes(suffix)) {
    return { label, thinking: suffix as ThinkingLevel }
  }
  throw new Error('Mức thinking không hợp lệ trong ' + label)
}

function describeVariant(variant: Variant): string {
  const thinking =
    variant.thinking === undefined
      ? 'thinking mặc định'
      : variant.thinking === 'off'
        ? 'không thinking'
        : `thinking ${variant.thinking}`
  return thinking
}

/** Biến thể của truyện mà lệnh nhắm tới: `--variants` lọc, không có thì mọi bản đã nạp. */
function variantsOf(novel: NovelEntry, flags: Map<string, string>): Variant[] {
  const raw = flags.get('variants') ?? flags.get('versions') ?? flags.get('version')
  const labels = raw ? raw.split(',').map((value) => value.trim()) : Object.keys(novel.copies)
  return labels.filter((label) => novel.copies[label] !== undefined).map(parseVariant)
}

// ---------------------------------------------------------------- manifest

interface ChapterStats {
  at: string
  model: string
  calls: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  /** Token thinking; Gemini để ngoài `completion_tokens`, tính bằng `total − prompt − completion`. */
  reasoningTokens?: number
  usd?: number
  failed: number
  seconds: number
  /** Hash bản chụp ngữ cảnh lượt dịch chương này đã dùng. */
  contextHash?: string
  /** Lời gọi model đã trừ vào ngân sách của lượt; `calls` là request HTTP thật, gồm cả retry. */
  modelCalls?: number
  /** Đoạn không được gửi vì hết ngân sách lời gọi. */
  budgetExhausted?: number
}

interface NovelEntry {
  ncode: string
  title: string
  dir: string
  chapterCount: number
  /** Nhãn biến thể → id tác phẩm. */
  copies: Record<string, string>
  /** Tên tiếng Việt người dùng đặt cho từng bản, dùng làm tên tác phẩm và tên tệp xuất. */
  names?: Record<string, string>
  /**
   * Tệp glossary của từng bản (tên tệp trong `glossary/`, không đuôi); `null` là bản không có glossary.
   * Vắng thì dùng tệp chung `<ncode>.json`. Cho mỗi thí nghiệm glossary riêng.
   */
  glossaries?: Record<string, string | null>
  /** Bản lặp → biến thể gốc (`a#2` → `a`), do `--repeat` tạo. */
  repeatOf?: Record<string, string>
  stats: Record<string, Record<string, ChapterStats>>
}

interface Manifest {
  dataDir: string
  novels: Record<string, NovelEntry>
}

function readManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { dataDir: join(LAB, 'data'), novels: {} }
  return JSON.parse(withFileRetry(() => readFileSync(MANIFEST, 'utf8'))) as Manifest
}

/**
 * `writeFileSync` có thử lại. Trên Windows một tiến trình khác (quét virus, chỉ mục, phiên khác) có thể
 * giữ tệp thoáng qua và open trả UNKNOWN/EBUSY/EPERM; thử lại vài lần thay vì bỏ dở cả lượt đang chạy.
 */
function writeFileRetry(path: string, data: string, encoding: BufferEncoding): void {
  withFileRetry(() => writeFileSync(path, data, encoding))
}

/** Khóa có thể kéo dài vài giây khi một phiên khác chạy kiểm tra; chờ tổng cộng khoảng 25 giây. */
function withFileRetry<T>(action: () => T): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return action()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= 10 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(code ?? ''))
        throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * attempt)
    }
  }
}

function writeManifest(manifest: Manifest): void {
  mkdirSync(LAB, { recursive: true })
  writeFileRetry(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

function pickNovels(manifest: Manifest, codes: string[]): NovelEntry[] {
  const all = Object.values(manifest.novels)
  if (codes.length === 0 || codes.includes('all')) return all
  return codes.map((code) => {
    const novel = manifest.novels[code]
    if (!novel) throw new Error(`Chưa nạp truyện ${code}. Chạy "import" trước.`)
    return novel
  })
}

// ---------------------------------------------------------------- thư viện

/**
 * Khóa API chỉ nằm trong DB của lab dưới dạng đã XOR với một khóa ngẫu nhiên **của tiến trình này**:
 * tiến trình kết thúc là bản ghi không giải được nữa, kể cả khi lần chạy bị ngắt trước bước xóa kết nối.
 */
// ---------------------------------------------------------------- sổ đăng ký lần chạy

/**
 * Commit đang đứng và có thay đổi chưa commit không; ngoài repo git thì để trống. Chỉ xét `src/`, nơi
 * có prompt và đường dịch: dữ liệu Lab trong `fixtures/` đổi sau mỗi lần chạy nên không phải tín hiệu.
 */
function gitState(): { commit: string | null; dirty: boolean | null } {
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  if (head.status !== 0) return { commit: null, dirty: null }
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  return { commit: head.stdout.trim(), dirty: status.stdout.trim() !== '' }
}

/** Commit gần nhất trước một thời điểm, cho lần chạy cũ không ghi commit. */
function commitBefore(iso: string): string | null {
  const log = spawnSync('git', ['log', '-1', `--before=${iso}`, '--format=%h'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  return log.status === 0 && log.stdout.trim() !== '' ? log.stdout.trim() : null
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

function appendRegistry(file: string, record: RunRecord | MeasurementRecord): void {
  mkdirSync(REGISTRY, { recursive: true })
  appendFileSync(file, JSON.stringify(record) + '\n', 'utf8')
}

function readRegistry(): { runs: RunRecord[]; measurements: MeasurementRecord[] } {
  const read = <T>(file: string): T[] =>
    existsSync(file) ? parseRegistry<T>(readFileSync(file, 'utf8')) : []
  return {
    runs: read<RunRecord>(RUNS_LOG),
    measurements: read<MeasurementRecord>(MEASUREMENTS_LOG)
  }
}

/** Các lần chạy đã dịch những chương này của biến thể, theo `lab.json` lúc đo. */
function runIdsOf(novel: NovelEntry, label: string, chapters: number[]): string[] {
  const stats = novel.stats[label] ?? {}
  return [...new Set(chapters.map((n) => stats[String(n)]?.at).filter(Boolean) as string[])].sort()
}

function recordMeasurement(
  novel: NovelEntry,
  label: string,
  chapters: number[],
  metrics: Pick<MeasurementRecord, 'structure' | 'glossary' | 'names' | 'addressing' | 'basis'>
): void {
  if (chapters.length === 0) return
  const measuredAt = new Date().toISOString()
  const kind = Object.keys(metrics)
    .filter((key) => key !== 'basis')
    .join('+')
  appendRegistry(MEASUREMENTS_LOG, {
    kind: 'measurement',
    schema: REGISTRY_SCHEMA,
    id: `${measuredAt}/${novel.ncode}/${label}/${kind}`,
    measuredAt,
    ...gitState(),
    ncode: novel.ncode,
    variant: label,
    chapters,
    runIds: runIdsOf(novel, label, chapters),
    ...metrics
  })
}

/** Sinh lại trang lịch sử trong docs từ sổ. */
function writeHistory(manifest: Manifest): void {
  const { runs, measurements } = readRegistry()
  const titles = Object.fromEntries(
    Object.values(manifest.novels).map((novel) => [novel.ncode, novel.title])
  )
  writeFileRetry(
    HISTORY,
    historyMarkdown(runs, measurements, titles, new Date().toISOString()),
    'utf8'
  )
  console.log(`Lịch sử: ${runs.length} lần chạy, ${measurements.length} lần đo → ${HISTORY}`)
}

const processKey = randomBytes(64)
const volatileCrypto: SecretCrypto = {
  isEncryptionAvailable: () => true,
  async encrypt(value) {
    const bytes = Buffer.from(value, 'utf8')
    return Buffer.from(bytes.map((byte, i) => byte ^ processKey[i % processKey.length]))
  },
  async decrypt(value) {
    const bytes = Buffer.from(value)
    const plain = Buffer.from(bytes.map((byte, i) => byte ^ processKey[i % processKey.length]))
    return { value: plain.toString('utf8'), shouldReEncrypt: false }
  }
}

function openLibrary(manifest: Manifest): LibraryStore {
  mkdirSync(manifest.dataDir, { recursive: true })
  return LibraryStore.open({ dataDir: manifest.dataDir })
}

function chapterIds(library: LibraryStore, workId: string): string[] {
  return library.listChapters(workId).map((chapter) => chapter.id)
}

// ---------------------------------------------------------------- import và glossary

interface SyosetsuMeta {
  ncode: string
  title: string
  author?: string
  genre?: number
  story?: string
  chapters: Array<{ n: number; title: string }>
}

const SYOSETSU_GENRES: Record<number, string> = {
  101: 'Dị giới · Tình cảm (異世界〔恋愛〕)',
  102: 'Hiện đại · Tình cảm (現実世界〔恋愛〕)',
  201: 'High fantasy (ハイファンタジー)',
  202: 'Low fantasy (ローファンタジー)'
}

interface GlossaryFile {
  /** Ai tạo dữ liệu: `ai` (lệnh trích xuất của Lab), `human` (người dịch), `claude-draft` (soạn tay). */
  origin?: GlossaryOrigin
  note?: string
  /** Thông tin lần trích xuất của lệnh `extract`: model, chương, số ứng viên, mục bị bỏ khi kiểm. */
  extraction?: Record<string, unknown>
  /** Dạng AI xếp là không phải thuật ngữ; giữ để không đề xuất lại. */
  rejected?: Array<{ source: string; reason?: string }>
  entries: Array<{
    source: string
    target: string
    aliases?: string[]
    notes?: string
    forbidden?: boolean
  }>
  /** Nhân vật: `source` là tên gốc, dùng làm khóa cho `dyads`. */
  characters?: Array<{
    source: string
    target: string
    aliases?: string[]
    gender?: CharacterGender
    role?: string
    thirdPerson?: string
    notes?: string
  }>
  /** Cặp xưng hô có chiều; `chapters` dạng "1-20" giới hạn phạm vi áp dụng. */
  dyads?: Array<{
    from: string
    to: string
    self: string
    address: string
    /** Đại từ ngôi hai khi `address` là tên hoặc danh xưng. */
    secondPerson?: string
    formality?: string
    notes?: string
    chapters?: string
  }>
}

/** Tệp glossary theo tên (không đuôi) trong `glossary/`; `null` hoặc không có tệp là không có glossary. */
function glossaryFileOf(name: string | null): GlossaryFile | null {
  if (name === null) return null
  const path = join(LAB, 'glossary', name + '.json')
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as GlossaryFile) : null
}

/** Tên tệp glossary của một bản; mặc định là tệp chung của truyện. */
function glossaryNameOf(novel: NovelEntry, label: string): string | null {
  const name = novel.glossaries?.[label]
  return name === undefined ? novel.ncode : name
}

function writeGlossaryFile(name: string, file: GlossaryFile): string {
  mkdirSync(join(LAB, 'glossary'), { recursive: true })
  const path = join(LAB, 'glossary', name + '.json')
  writeFileRetry(path, JSON.stringify(file, null, 2) + '\n', 'utf8')
  return path
}

/** Băm và nguồn gốc của tệp glossary đang nạp, ghi kèm mỗi lần chạy. */
function glossaryProvenance(name: string | null): GlossaryProvenance {
  const path = name === null ? null : join(LAB, 'glossary', name + '.json')
  if (path === null || !existsSync(path)) return { hash: '-', origin: 'none' }
  const text = readFileSync(path, 'utf8')
  return { hash: sha(text), origin: glossaryOriginOf(JSON.parse(text) as GlossaryFile) }
}

/** Thay toàn bộ thuật ngữ của một bản bằng tệp glossary. Mục đánh dấu `ai` + đã duyệt để đi vào prompt. */
function syncGlossary(library: LibraryStore, workId: string, name: string | null): number {
  const file = glossaryFileOf(name)
  const service = new GlossaryService(library, () => Date.now())
  for (const entry of service.list(workId)) {
    if ((entry as ContextEntryItem).kind === 'term') service.delete(workId, entry.id)
  }
  syncAddressing(library, workId, file)
  if (!file) return 0
  // Mira không cho một tên vừa là thuật ngữ vừa là nhân vật; nhân vật thắng vì mang cả giới tính và vai.
  const taken = new Set(
    (file.characters ?? [])
      .flatMap((c) => [c.source, ...(c.aliases ?? [])])
      .map((f) => f.toLowerCase())
  )
  const entries = file.entries.filter(
    (entry) => ![entry.source, ...(entry.aliases ?? [])].some((f) => taken.has(f.toLowerCase()))
  )
  for (const entry of entries) {
    service.create(workId, {
      kind: 'term',
      source: entry.source,
      target: entry.target,
      aliases: entry.aliases ?? [],
      notes: entry.notes ?? null,
      forbidden: entry.forbidden ?? false,
      status: 'approved',
      origin: 'ai'
    })
  }
  return entries.length
}

/** Thay toàn bộ nhân vật và cặp xưng hô của một bản bằng tệp; mọi mục đánh dấu đã duyệt. */
function syncAddressing(library: LibraryStore, workId: string, file: GlossaryFile | null): void {
  const service = new AddressingService(library, () => Date.now())
  for (const dyad of service.listDyads(workId)) service.deleteDyad(workId, dyad.id)
  for (const character of service.listCharacters(workId))
    service.deleteCharacter(workId, character.id)
  if (!file) return
  const ids = new Map<string, string>()
  for (const character of file.characters ?? []) {
    const created = service.createCharacter(workId, {
      source: character.source,
      target: character.target,
      aliases: character.aliases ?? [],
      gender: character.gender ?? 'unknown',
      role: character.role ?? null,
      thirdPerson: character.thirdPerson ?? null,
      notes: character.notes ?? null,
      status: 'approved'
    })
    ids.set(character.source, created.id)
  }
  const chapters = chapterIds(library, workId)
  for (const dyad of file.dyads ?? []) {
    const from = ids.get(dyad.from)
    const to = ids.get(dyad.to)
    if (!from || !to)
      throw new Error(`Cặp xưng hô ${dyad.from} → ${dyad.to}: thiếu nhân vật trong tệp.`)
    const [first, last] = (dyad.chapters ?? '').split('-').map((value) => Number(value))
    service.setDyad(workId, {
      sourceCharacterId: from,
      targetCharacterId: to,
      speakerPronoun: dyad.self,
      recipientPronoun: dyad.address,
      secondPerson: dyad.secondPerson ?? null,
      formality: dyad.formality ?? null,
      notes: dyad.notes ?? null,
      fromChapterId: Number.isInteger(first) ? (chapters[first - 1] ?? null) : null,
      toChapterId: Number.isInteger(last) ? (chapters[last - 1] ?? null) : null,
      status: 'approved'
    })
  }
}

function chapterText(dir: string, n: number, title: string): string {
  const path = join(dir, 'plain', String(n).padStart(4, '0') + '.txt')
  const lines = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n').split('\n')
  // Tệp mở đầu bằng tên chương; tên đã nằm ở chương nên bỏ khỏi bản gốc.
  const first = lines.findIndex((line) => line.trim() !== '')
  if (first !== -1 && lines[first].trim() === title.trim()) lines.splice(0, first + 1)
  return lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '') + '\n'
}

/**
 * Nạp truyện thành các biến thể còn thiếu. Truyện đã nạp chỉ được thêm biến thể mới; `--replace`
 * lưu trữ mọi bản cũ rồi nạp lại từ đầu.
 */
function importNovel(
  manifest: Manifest,
  library: LibraryStore,
  dir: string,
  labels: string[],
  replace: boolean,
  name?: string
): void {
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) throw new Error('Không thấy meta.json trong ' + dir)
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as SyosetsuMeta
  let novel: NovelEntry | undefined = manifest.novels[meta.ncode]
  if (novel && replace) {
    for (const workId of Object.values(novel.copies)) {
      try {
        library.update(workId, { archived: true })
      } catch {
        // bản cũ đã bị xóa trong app: bỏ qua
      }
    }
    novel = undefined
  }
  novel ??= {
    ncode: meta.ncode,
    title: meta.title,
    dir: resolve(dir),
    chapterCount: meta.chapters.length,
    copies: {},
    stats: {}
  }
  for (const label of labels) {
    const variant = parseVariant(label)
    if (novel.copies[label]) {
      console.log(`${meta.ncode} [${label}]: đã có.`)
      continue
    }
    const work = library.create({
      title: (name ?? `${meta.title} [${label}]`).slice(0, 200),
      originalTitle: meta.title.slice(0, 200),
      sourceLang: 'ja',
      author: meta.author?.slice(0, 200),
      genre: meta.genre ? (SYOSETSU_GENRES[meta.genre] ?? `syosetu ${meta.genre}`) : undefined,
      description: meta.story?.trim().slice(0, DESCRIPTION_MAX)
    })
    for (const chapter of meta.chapters) {
      const created = library.createChapter(work.id, chapter.title).chapter
      const text = chapterText(dir, chapter.n, chapter.title)
      library.saveText(work.id, created.id, 'source', text, 0, segment(text, 'ja'))
    }
    const terms = syncGlossary(library, work.id, meta.ncode)
    novel.copies[label] = work.id
    if (name) novel.names = { ...novel.names, [label]: name }
    console.log(
      `${meta.ncode} [${label}] (${describeVariant(variant)}): ${meta.chapters.length} chương, ${terms} thuật ngữ.`
    )
  }
  manifest.novels[meta.ncode] = novel
}

// ---------------------------------------------------------------- ghi request và chi phí

interface CallRecord {
  ncode: string
  variant: string
  chapter: number
  messages: Array<{ role: string; content: string }>
  status: number
  finish: string | null
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
  /** Chữ model trả về, để đọc lại nhãn người nói. */
  response?: string
  ms: number
}

/** `fetch` ghi lại mọi lời gọi `/chat/completions` cùng usage, không ghi header nên không lộ khóa. */
function recordingFetch(
  base: typeof fetch,
  context: { ncode: string; variant: string; chapter: number },
  sink: (record: CallRecord) => void
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = Date.now()
    const response = await base(input, init)
    if (typeof init?.body === 'string' && String(input).includes('chat/completions')) {
      const body = JSON.parse(init.body) as { messages?: CallRecord['messages'] }
      let usage: Record<string, unknown> = {}
      let finish: string | null = null
      let content: string | undefined
      try {
        const payload = (await response.clone().json()) as {
          usage?: Record<string, unknown>
          choices?: Array<{ finish_reason?: string; message?: { content?: string } }>
        }
        usage = payload.usage ?? {}
        finish = payload.choices?.[0]?.finish_reason ?? null
        content = payload.choices?.[0]?.message?.content
      } catch {
        // phản hồi không phải JSON (lỗi mạng, stream): vẫn ghi request
      }
      const details = usage['prompt_tokens_details'] as { cached_tokens?: number } | undefined
      const prompt = Number(usage['prompt_tokens'] ?? 0)
      const completion = Number(usage['completion_tokens'] ?? 0)
      const total = Number(usage['total_tokens'] ?? prompt + completion)
      sink({
        ...context,
        messages: body.messages ?? [],
        status: response.status,
        finish,
        inputTokens: prompt,
        cachedTokens: Number(details?.cached_tokens ?? 0),
        outputTokens: completion,
        reasoningTokens: Math.max(0, total - prompt - completion),
        response: content,
        ms: Date.now() - started
      })
    }
    return response
  }) as typeof fetch
}

function usdOf(model: string, calls: CallRecord[]): number {
  let input = 0
  let cached = 0
  let output = 0
  for (const call of calls) {
    cached += call.cachedTokens
    input += call.inputTokens - call.cachedTokens
    output += call.outputTokens + call.reasoningTokens
  }
  return (
    costOfUsage(
      { inputTokens: input, cacheReadTokens: cached, outputTokens: output },
      lookupModel(model, 'google')
    ) ?? 0
  )
}

// ---------------------------------------------------------------- dịch

/**
 * Mức thinking của biến thể có được model nhận không, kiểm **trước** lời gọi đầu tiên bằng cùng phép kiểm
 * main dùng (`checkThinkingLevel`). Không hợp lệ thì trả câu báo: biến thể đó không chạy, và sổ đăng ký
 * không có một lần chạy toàn lỗi 400 với giá $0.
 */
function thinkingProblem(model: string, thinking: ThinkingLevel | undefined): string | null {
  if (thinking === undefined) return null
  const check = checkThinkingLevel(lookupModel(model, 'google'), thinking)
  return check.ok ? null : describeThinkingCheck(model, thinking, check)
}

function setupConnection(
  services: Services,
  key: string,
  model: string,
  baseUrl: string,
  rpm: number,
  thinking: ThinkingLevel | undefined,
  batchTokens = 0
): Promise<{ connectionId: string; entryId: string }> {
  const connection = services.connections.create({
    name: 'Mira Lab',
    baseUrl,
    providerId: 'google'
  })
  return services.connections.addApiKey(connection.id, key).then(() => {
    const view = services.connections.addModels(connection.id, [{ model }])
    const entryId = view.models[view.models.length - 1].id
    services.connections.updateEntry(entryId, {
      settings: {
        rpmLimit: rpm,
        ...(thinking === undefined ? {} : { thinking }),
        ...(batchTokens > 0 ? { inputTokenLimit: batchTokens } : {})
      }
    })
    return { connectionId: connection.id, entryId }
  })
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function translateChapter(
  services: Services,
  library: LibraryStore,
  ids: { connectionId: string; entryId: string },
  workId: string,
  chapterId: string,
  force: boolean,
  tag: string,
  maxCalls?: number,
  outputSchema = false
): Promise<{
  failed: number
  skipped: boolean
  /** Chế độ đầu ra và lỗi cấu trúc của các lô chương này. */
  output?: RunOutput
  /** Lời gọi model lượt dịch chương đã trừ vào ngân sách (`budget.used` sau lô cuối). */
  modelCalls?: number
  /** Bản chụp ngữ cảnh của lượt: hash và JSON đúng như đã lưu trong tệp tác phẩm. */
  context?: { hash: string; json: string }
  /** Kết cục từng đoạn định dịch của chương (chưa có số chương). */
  outcomes?: Omit<ChapterOutcomes, 'chapter'>
}> {
  const target = library.readText(workId, chapterId, 'target')
  if (target.content.trim() !== '') {
    if (!force) return { failed: 0, skipped: true }
    library.saveText(workId, chapterId, 'target', '', target.rev, [])
  }
  // `--schema`: một bộ dịch riêng bật chế độ có JSON schema; sản phẩm mặc định không bật.
  const translator = outputSchema
    ? new ParagraphTranslator({
        library,
        connections: services.connections,
        now: Date.now,
        outputSchema: true
      })
    : services.paragraphTranslator
  const output: RunOutput = {
    requested: outputSchema ? 'object' : 'array',
    batches: 0,
    fallbacks: 0,
    extraneous: 0,
    duplicate: 0,
    repaired: 0
  }
  const plan = translator.plan(
    { workId, chapterId, ...ids },
    maxCalls === undefined ? {} : { extraCalls: maxCalls }
  )
  let failed = 0
  let modelCalls = 0
  const outcomeIds: Record<string, ParagraphOutcome> = {}
  const reasons: Record<string, string> = {}
  let halted = false
  for (const batch of plan.batches) {
    // Lô sau một lỗi dừng lượt (cấu hình, xác thực…) không được gửi, như trong sản phẩm.
    if (halted) {
      for (const id of batch.sourceIds) outcomeIds[id] = 'not_run'
      continue
    }
    for (let attempt = 1; ; attempt++) {
      const result = await translator.runBatch({
        workId,
        chapterId,
        runId: plan.runId,
        ...ids,
        settingsKey: plan.settingsKey,
        sourceRev: plan.sourceRev,
        targetRev: plan.targetRev,
        targetBaseContent: plan.targetBaseContent,
        policy: 'auto',
        sourceIds: batch.sourceIds
      })
      const limited = result.error?.kind === 'rate_limited' || result.error?.kind === 'quota'
      if (limited && attempt < 8) {
        const wait = Math.max(5_000, (result.error?.recoverAt ?? 0) - Date.now())
        console.log(`${tag}: hạn mức, chờ ${Math.ceil(wait / 1000)} giây rồi thử lại lô`)
        await sleep(Math.min(wait, 120_000))
        continue
      }
      failed += result.failed.length
      modelCalls = result.budget.used
      output.batches++
      if (result.output.mode === 'object→fallback') output.fallbacks++
      output.extraneous += result.output.structure.extraneous
      output.duplicate += result.output.structure.duplicate
      output.repaired += result.output.structure.repaired
      const batchResult = batchOutcomes(batch.sourceIds, result)
      Object.assign(outcomeIds, batchResult.ids)
      Object.assign(reasons, batchResult.reasons)
      if (result.error) console.log(`${tag}: lỗi lô ${result.error.kind} — ${result.error.message}`)
      if (result.error?.haltsRun) halted = true
      break
    }
  }
  translator.finalize({ workId, chapterId, runId: plan.runId, policy: 'auto' })
  const stored = library.withWork(workId, (db) => getRunContext(db, `translate:${plan.runId}`))
  return {
    failed,
    skipped: false,
    modelCalls,
    output,
    ...(stored ? { context: { hash: stored.snapshotHash, json: stored.snapshotJson } } : {}),
    outcomes: { ids: outcomeIds, ...(Object.keys(reasons).length > 0 ? { reasons } : {}) }
  }
}

/**
 * `--repeat N`: mỗi biến thể được chọn có N bản lặp `label#1…#N`, chép từ bản gốc với cùng glossary, rồi
 * dịch như mọi biến thể. Ước tính chi phí N lần trước lời gọi đầu tiên; chưa có cơ sở ước tính thì bắt
 * buộc `--max-usd`.
 */
function prepareRepeats(
  manifest: Manifest,
  novels: NovelEntry[],
  args: Args,
  n: number,
  maxUsd: number
): void {
  const labels: string[] = []
  const library = openLibrary(manifest)
  try {
    for (const novel of novels) {
      const chapters = parseRange(args.flags.get('chapters'), novel.chapterCount).length
      for (const variant of variantsOf(novel, args.flags)) {
        if (variant.label.includes('#')) continue
        const estimate = estimateRepeatCost(
          Object.values(novel.stats[variant.label] ?? {}),
          chapters,
          n
        )
        if (estimate === null) {
          if (!Number.isFinite(maxUsd)) {
            throw new Error(
              `${novel.ncode} [${variant.label}]: chưa có cơ sở ước tính chi phí ${n} lần lặp; cần --max-usd.`
            )
          }
          console.log(
            `${novel.ncode} [${variant.label}] ×${n}: chưa có cơ sở ước tính; trần $${maxUsd}.`
          )
        } else {
          console.log(
            `${novel.ncode} [${variant.label}] ×${n}, ${chapters} chương: ước tính ≈ $${estimate.toFixed(3)}.`
          )
        }
        for (const label of repeatLabels(variant.label, n)) {
          if (!novel.copies[label]) {
            createCopy(
              manifest,
              library,
              novel,
              variant.label,
              label,
              glossaryNameOf(novel, variant.label)
            )
          }
          novel.repeatOf = { ...novel.repeatOf, [label]: variant.label }
          labels.push(label)
        }
      }
    }
  } finally {
    library.close()
  }
  writeManifest(manifest)
  if (labels.length === 0) throw new Error('Không có biến thể nào để lặp (xem --variants).')
  args.flags.set('variants', [...new Set(labels)].join(','))
}

/** Kết cục từng đoạn của các chương, đọc từ tệp của lần chạy đã dịch từng chương (theo `lab.json`). */
function outcomesOf(
  novel: NovelEntry,
  label: string,
  chapters: number[]
): Map<number, ChapterOutcomes> {
  const files = new Map<string, Map<number, ChapterOutcomes>>()
  const out = new Map<number, ChapterOutcomes>()
  for (const n of chapters) {
    const at = novel.stats[label]?.[String(n)]?.at
    if (!at) continue
    const path = join(LAB, 'runs', at, `${novel.ncode}-${label}.outcomes.jsonl`)
    if (!files.has(path)) {
      files.set(path, existsSync(path) ? parseOutcomeLines(readFileSync(path, 'utf8')) : new Map())
    }
    const line = files.get(path)!.get(n)
    if (line) out.set(n, line)
  }
  return out
}

async function translate(manifest: Manifest, args: Args): Promise<void> {
  const key = env('GEMINI_API_KEY')
  if (!key) throw new Error('Thiếu GEMINI_API_KEY (biến môi trường hoặc .env).')
  const model = args.flags.get('model') ?? env('MIRA_LAB_MODEL', 'gemini-2.5-flash')
  const baseUrl =
    args.flags.get('base-url') ??
    env('MIRA_LAB_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai')
  const rpm = Number(args.flags.get('rpm') ?? env('MIRA_LAB_RPM', '8'))
  const concurrency = Math.max(1, Number(args.flags.get('concurrency') ?? '1'))
  // Token đầu vào mỗi lô; đủ lớn thì cả chương đi trong một lô, không có chỗ đứt giữa các lô.
  const batchTokens = Number(args.flags.get('batch-tokens') ?? '0')
  const maxUsd = Number(args.flags.get('max-usd') ?? 'Infinity')
  // Quỹ phụ lời gọi mỗi chương (chia lô, gửi lại không ngữ cảnh, hỏi lại); thiếu là mặc định của sản phẩm.
  const maxCallsFlag = args.flags.get('max-calls')
  const maxCalls = maxCallsFlag === undefined ? undefined : Number(maxCallsFlag)
  if (maxCalls !== undefined && (!Number.isInteger(maxCalls) || maxCalls < 0)) {
    throw new Error('--max-calls phải là số nguyên không âm.')
  }
  const force = args.flags.has('force')
  const redoFailed = args.flags.has('redo-failed')
  const parallel = args.flags.has('parallel')
  // Chế độ đầu ra có JSON schema cho mọi biến thể của lần chạy; model không hỗ trợ thì tự về `text`.
  const outputSchema = args.flags.has('schema')
  const note = args.flags.get('note')
  const novels = pickNovels(manifest, args.positional)
  if (!lookupModel(model, 'google')) {
    console.log(
      `Cảnh báo: không có giá của ${model} trong bảng; giới hạn --max-usd không có tác dụng.`
    )
  }
  const repeat = args.flags.get('repeat')
  if (repeat !== undefined) prepareRepeats(manifest, novels, args, Number(repeat), maxUsd)
  // Kiểm trước khi tạo thư mục lần chạy hay mở kho: biến thể có mức thinking model không nhận thì không chạy.
  const lanes = novels
    .flatMap((novel) => variantsOf(novel, args.flags).map((variant) => ({ novel, variant })))
    .filter(({ novel, variant }) => {
      const problem = thinkingProblem(model, variant.thinking)
      if (problem !== null)
        console.error(`${novel.ncode} [${variant.label}] không chạy: ${problem}`)
      return problem === null
    })
  if (lanes.length === 0) throw new Error('Không có biến thể nào để dịch (xem --variants).')

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const git = gitState()
  if (git.dirty) console.log('Cảnh báo: src/ còn thay đổi chưa commit; sổ ghi commit kèm dấu +.')
  const runDir = join(LAB, 'runs', runId)
  mkdirSync(runDir, { recursive: true })
  const library = openLibrary(manifest)
  const startedAll = Date.now()
  const spend = { usd: 0, stopped: false }

  /**
   * Một worker = một kết nối và mục model riêng, dịch tuần tự từng chương nó nhận: fetch ghi request
   * biết chắc lời gọi thuộc chương nào, và RPM tính theo worker.
   */
  async function worker(
    novel: NovelEntry,
    variant: Variant,
    queue: number[],
    laneCalls: CallRecord[],
    laneContexts: Record<string, string>,
    laneOutcomes: ChapterOutcomes[],
    laneBudget: { modelCalls: number; output: RunOutput }
  ): Promise<void> {
    const context = { ncode: novel.ncode, variant: variant.label, chapter: 0 }
    const calls: CallRecord[] = []
    const sink = (record: CallRecord): void => {
      calls.push(record)
      laneCalls.push(record)
      spend.usd += usdOf(model, [record])
      appendFileSync(
        join(runDir, `${record.ncode}-${record.variant}.jsonl`),
        JSON.stringify(record) + '\n',
        'utf8'
      )
    }
    const services = createServices({
      library,
      crypto: volatileCrypto,
      fetch: recordingFetch(fetch, context, sink)
    })
    const ids = await setupConnection(
      services,
      key,
      model,
      baseUrl,
      rpm,
      variant.thinking,
      batchTokens
    )
    const tag = `${novel.ncode} [${variant.label}]`
    const workId = novel.copies[variant.label]
    const chapters = chapterIds(library, workId)
    const outcomesFile = join(runDir, `${novel.ncode}-${variant.label}.outcomes.jsonl`)
    const recordOutcomes = (line: ChapterOutcomes): void => {
      laneOutcomes.push(line)
      appendFileSync(outcomesFile, JSON.stringify(line) + '\n', 'utf8')
    }
    try {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
        if (spend.usd >= maxUsd) {
          if (!spend.stopped) console.log(`\nĐã chạm ngân sách $${maxUsd}; dừng nhận chương mới.`)
          spend.stopped = true
          // Chương không tới được vẫn có trong tập định dịch: ghi `not_run` để phần Hoàn thành thấy.
          for (let rest: number | undefined = n; rest !== undefined; rest = queue.shift()) {
            const source = library.readText(workId, chapters[rest - 1], 'source').content
            recordOutcomes(
              notRunChapter(
                rest,
                paragraphUnits(source).map((unit) => unit.id)
              )
            )
          }
          return
        }
        const last = novel.stats[variant.label]?.[String(n)]
        const redo = force || (redoFailed && last !== undefined && last.failed > 0)
        context.chapter = n
        const before = calls.length
        const started = Date.now()
        const outcome = await translateChapter(
          services,
          library,
          ids,
          workId,
          chapters[n - 1],
          redo,
          tag,
          maxCalls,
          outputSchema
        )
        if (outcome.skipped) continue
        const mine = calls.slice(before)
        const stats: ChapterStats = {
          at: runId,
          model,
          calls: mine.length,
          inputTokens: mine.reduce((sum, call) => sum + call.inputTokens, 0),
          cachedTokens: mine.reduce((sum, call) => sum + call.cachedTokens, 0),
          outputTokens: mine.reduce((sum, call) => sum + call.outputTokens, 0),
          reasoningTokens: mine.reduce((sum, call) => sum + call.reasoningTokens, 0),
          usd: usdOf(model, mine),
          failed: outcome.failed,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          ...(outcome.context ? { contextHash: outcome.context.hash } : {}),
          ...(outcome.modelCalls !== undefined ? { modelCalls: outcome.modelCalls } : {}),
          ...(outcome.outcomes
            ? {
                budgetExhausted: Object.values(outcome.outcomes.ids).filter(
                  (value) => value === 'budget_exhausted'
                ).length
              }
            : {})
        }
        laneBudget.modelCalls += outcome.modelCalls ?? 0
        if (outcome.output) {
          for (const key of ['batches', 'fallbacks', 'extraneous', 'duplicate', 'repaired'] as const) {
            laneBudget.output[key] += outcome.output[key]
          }
        }
        if (outcome.outcomes) recordOutcomes({ chapter: n, ...outcome.outcomes })
        if (outcome.context) {
          laneContexts[String(n)] = outcome.context.hash
          writeFileRetry(
            join(runDir, `context-${novel.ncode}-${variant.label}-${n}.json`),
            outcome.context.json,
            'utf8'
          )
        }
        novel.stats[variant.label] = { ...novel.stats[variant.label], [String(n)]: stats }
        writeManifest(manifest)
        console.log(
          `${tag} chương ${n}/${chapters.length}: ${stats.calls} lời gọi, vào ${stats.inputTokens}, ` +
            `ra ${stats.outputTokens} + thinking ${stats.reasoningTokens}, thiếu ${stats.failed} đoạn, ` +
            `${stats.seconds}s · tổng đã tiêu $${spend.usd.toFixed(3)}`
        )
      }
    } finally {
      services.connections.delete(ids.connectionId)
    }
  }

  /**
   * Một luồng = một truyện × một biến thể, chia chương cho `concurrency` worker. Xong luồng (kể cả khi
   * lỗi giữa chừng) thì ghi một bản ghi vào sổ cho những lời gọi đã gửi.
   */
  async function lane(novel: NovelEntry, variant: Variant): Promise<void> {
    const total = novel.chapterCount
    const queue = parseRange(args.flags.get('chapters'), total)
    const laneCalls: CallRecord[] = []
    const laneContexts: Record<string, string> = {}
    const laneOutcomes: ChapterOutcomes[] = []
    const laneBudget = {
      modelCalls: 0,
      output: {
        requested: outputSchema ? ('object' as const) : ('array' as const),
        batches: 0,
        fallbacks: 0,
        extraneous: 0,
        duplicate: 0,
        repaired: 0
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, () =>
          worker(novel, variant, queue, laneCalls, laneContexts, laneOutcomes, laneBudget)
        )
      )
    } finally {
      if (laneCalls.length > 0) {
        appendRegistry(
          RUNS_LOG,
          summarizeRun(
            laneCalls,
            {
              runId,
              ncode: novel.ncode,
              variant: variant.label,
              thinking: variant.thinking ?? null,
              model,
              ...git,
              glossary: glossaryProvenance(glossaryNameOf(novel, variant.label)),
              contexts: laneContexts,
              ...(laneOutcomes.length > 0
                ? {
                    outcomes: {
                      file: `${novel.ncode}-${variant.label}.outcomes.jsonl`,
                      counts: countOutcomes(laneOutcomes)
                    }
                  }
                : {}),
              budget: {
                modelCalls: laneBudget.modelCalls,
                budgetExhausted: countOutcomes(laneOutcomes).budget_exhausted,
                maxCalls: maxCalls ?? null
              },
              output: laneBudget.output,
              usd: usdOf(model, laneCalls),
              ...(note ? { note } : {})
            },
            sha,
            TRANSLATE_PROMPT_VERSION
          )
        )
      }
    }
  }

  console.log(
    `Model ${model}; ${lanes.length} luồng × ${concurrency} worker; RPM mỗi worker ${rpm}` +
      (Number.isFinite(maxUsd) ? `; ngân sách $${maxUsd}` : '')
  )
  try {
    if (parallel) {
      const results = await Promise.allSettled(lanes.map((item) => lane(item.novel, item.variant)))
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const { novel, variant } = lanes[i]
          console.error(`${novel.ncode} [${variant.label}] dừng: ${String(result.reason)}`)
        }
      })
    } else {
      for (const item of lanes) await lane(item.novel, item.variant)
    }
  } finally {
    library.close()
    writeHistory(manifest)
  }
  const minutes = Math.round((Date.now() - startedAll) / 6000) / 10
  console.log(
    `\nXong sau ${minutes} phút, tiêu ≈ $${spend.usd.toFixed(3)}. Request đã gửi: ${runDir}`
  )
}

// ---------------------------------------------------------------- xem prompt không gọi mạng

async function showPrompt(manifest: Manifest, args: Args): Promise<void> {
  const [ncode] = args.positional
  const novel = pickNovels(manifest, [ncode ?? ''])[0]
  const chapter = Number(args.flags.get('chapter') ?? '1')
  const batchIndex = Number(args.flags.get('batch') ?? '1') - 1
  const library = openLibrary(manifest)
  try {
    for (const variant of variantsOf(novel, args.flags)) {
      const seen: Array<Array<{ role: string; content: string }>> = []
      // Endpoint giả trả mảng rỗng: lõi dịch hỏi lại rồi bỏ cuộc, không đề xuất nào được ghi.
      const fake = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: (typeof seen)[number] }
        if (body.messages) seen.push(body.messages)
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '[]' }, finish_reason: 'stop' }] }),
          { status: 200 }
        )
      }) as typeof fetch
      const services = createServices({
        library,
        crypto: volatileCrypto,
        fetch: fake
      })
      const ids = await setupConnection(
        services,
        'dry-run',
        'gemini-2.5-flash',
        'http://127.0.0.1:9/v1',
        0,
        undefined
      )
      try {
        const workId = novel.copies[variant.label]
        const chapterId = chapterIds(library, workId)[chapter - 1]
        const translator = services.paragraphTranslator
        const plan = translator.plan({ workId, chapterId, ...ids })
        const batch = plan.batches[batchIndex]
        if (!batch) throw new Error(`Chương ${chapter} chỉ có ${plan.batches.length} lô.`)
        await translator.runBatch({
          workId,
          chapterId,
          runId: plan.runId,
          ...ids,
          settingsKey: plan.settingsKey,
          sourceRev: plan.sourceRev,
          targetRev: plan.targetRev,
          targetBaseContent: plan.targetBaseContent,
          policy: 'review',
          sourceIds: batch.sourceIds
        })
      } finally {
        services.connections.delete(ids.connectionId)
      }
      const [main, repair] = seen
      console.log(
        `\n==================== ${variant.label} · chương ${chapter} · lô ${batchIndex + 1}`
      )
      for (const message of main ?? []) {
        console.log(`\n----- ${message.role} (${message.content.length} ký tự)\n${message.content}`)
      }
      if (repair && args.flags.has('repair')) {
        console.log('\n----- lượt hỏi lại')
        for (const message of repair) console.log(`\n[${message.role}]\n${message.content}`)
      }
    }
  } finally {
    library.close()
  }
}

// ---------------------------------------------------------------- báo cáo

function paragraphs(text: string): string[] {
  return paragraphUnits(text).map((unit) => unit.text)
}

function glossaryScore(
  source: string[],
  target: string[],
  entries: GlossaryFile['entries']
): { hits: number; checks: number; misses: Map<string, number> } {
  let hits = 0
  let checks = 0
  const misses = new Map<string, number>()
  if (source.length !== target.length) return { hits, checks, misses }
  source.forEach((src, i) => {
    for (const entry of entries) {
      if (entry.forbidden) continue
      const forms = [entry.source, ...(entry.aliases ?? [])]
      if (!forms.some((form) => src.includes(form))) continue
      checks++
      if (target[i].toLowerCase().includes(entry.target.toLowerCase())) hits++
      else misses.set(entry.target, (misses.get(entry.target) ?? 0) + 1)
    }
  })
  return { hits, checks, misses }
}

const pct = (a: number, b: number): string => (b === 0 ? '–' : `${Math.round((a / b) * 100)}%`)

function report(manifest: Manifest, args: Args): void {
  const library = openLibrary(manifest)
  mkdirSync(join(LAB, 'reports'), { recursive: true })
  try {
    for (const novel of pickNovels(manifest, args.positional)) {
      // Mọi biến thể đo trên cùng một glossary tham chiếu, kể cả bản chạy không glossary.
      const reference = args.flags.get('glossary-file') ?? novel.ncode
      const referenceFile = glossaryFileOf(reference)
      const glossary = referenceFile?.entries ?? []
      const characterForms = (referenceFile?.characters ?? []).map((c) => ({
        name: `${c.source} (${c.target})`,
        forms: [c.source, ...(c.aliases ?? [])]
      }))
      const variants = variantsOf(novel, args.flags)
      const ids = Object.fromEntries(
        variants.map((v) => [v.label, chapterIds(library, novel.copies[v.label])])
      )
      const textOf = (v: Variant, n: number, side: 'source' | 'target'): string =>
        library.readText(novel.copies[v.label], ids[v.label][n - 1], side).content
      const wanted = parseRange(args.flags.get('chapters'), novel.chapterCount).filter((n) =>
        variants.some((v) => textOf(v, n, 'target').trim() !== '')
      )

      // Kết cục từng đoạn: phần Hoàn thành tính trên toàn tập; phần Chất lượng chỉ trên các đoạn
      // `translated` ở mọi biến thể. Thiếu kết cục ở bất kỳ biến thể nào thì đo theo chương như trước.
      const outcomes = Object.fromEntries(
        variants.map((v) => [v.label, outcomesOf(novel, v.label, wanted)])
      )
      const complete = variants.every((v) =>
        wanted.every((n) => outcomes[v.label].has(n) || textOf(v, n, 'target').trim() === '')
      )
      const comparable = complete
        ? comparableKeys(
            Object.fromEntries(variants.map((v) => [v.label, [...outcomes[v.label].values()]]))
          )
        : null
      const noCommon = comparable !== null && comparable.total > 0 && comparable.keys.size === 0
      const keep = (n: number, source: string): boolean[] => {
        const ids = paragraphUnits(source).map((unit) => unit.id)
        return ids.map((id) => comparable === null || comparable.keys.has(paragraphKey(n, id)))
      }

      // Tổng hợp theo biến thể
      const summary = variants.map((v) => {
        const stats = Object.values(novel.stats[v.label] ?? {})
        let hits = 0
        let checks = 0
        let mismatched = 0
        let missingParas = 0
        const misses = new Map<string, number>()
        const measured: number[] = []
        const alignedSource: string[] = []
        const alignedTarget: string[] = []
        for (const n of wanted) {
          const source = paragraphs(textOf(v, n, 'source'))
          const target = paragraphs(textOf(v, n, 'target'))
          if (target.length === 0) continue
          measured.push(n)
          const kept = keep(n, textOf(v, n, 'source'))
          const inSet = <T>(list: T[]): T[] => list.filter((_, i) => kept[i])
          if (target.length === source.length && !noCommon) {
            alignedSource.push(...inSet(source))
            alignedTarget.push(...inSet(target))
          }
          if (target.length !== source.length) mismatched++
          missingParas += Math.max(0, source.length - target.length)
          const score =
            target.length === source.length && !noCommon
              ? glossaryScore(inSet(source), inSet(target), glossary)
              : { hits: 0, checks: 0, misses: new Map<string, number>() }
          hits += score.hits
          checks += score.checks
          for (const [term, count] of score.misses)
            misses.set(term, (misses.get(term) ?? 0) + count)
        }
        return {
          v,
          chapters: stats.length,
          hits,
          checks,
          mismatched,
          missingParas,
          failed: stats.reduce((sum, s) => sum + s.failed, 0),
          input: stats.reduce((sum, s) => sum + s.inputTokens, 0),
          output: stats.reduce((sum, s) => sum + s.outputTokens, 0),
          reasoning: stats.reduce((sum, s) => sum + (s.reasoningTokens ?? 0), 0),
          usd: stats.reduce((sum, s) => sum + (s.usd ?? 0), 0),
          seconds: stats.reduce((sum, s) => sum + s.seconds, 0),
          misses,
          measured,
          names: nameConsistency(alignedSource, alignedTarget, characterForms)
        }
      })
      for (const s of summary) {
        recordMeasurement(novel, s.v.label, s.measured, {
          structure: {
            chapters: s.measured.length,
            mismatched: s.mismatched,
            missingParagraphs: s.missingParas
          },
          glossary: { hits: s.hits, checks: s.checks, reference },
          ...(s.names.length > 0 ? { names: { ...overallConsistency(s.names), reference } } : {}),
          ...(comparable
            ? {
                basis: {
                  variants: variants.map((x) => x.label),
                  paragraphs: comparable.keys.size,
                  total: comparable.total,
                  excluded: comparable.excluded
                }
              }
            : {})
        })
      }

      const lines: string[] = [
        `# ${novel.title} — so sánh biến thể`,
        '',
        `Tạo lúc ${new Date().toISOString()}. Glossary tham chiếu \`${reference}\`: ${glossary.length} mục (${glossaryProvenance(reference).origin}, chưa người dịch duyệt).`,
        'Tuân thủ glossary: đoạn gốc có thuật ngữ thì bản dịch cùng vị trí có đúng chữ dịch không; chỉ tính chương có số đoạn khớp.',
        '',
        'Tên nhất quán: đoạn có tên nhân vật (theo danh sách nhân vật của glossary tham chiếu) dùng đúng cách viết chính; không cần đáp án, đo được cả bản không glossary.',
        '',
        '## Hoàn thành (toàn tập định dịch, không loại đoạn nào)',
        '',
        `| Biến thể | Cấu hình | ${OUTCOMES.join(' | ')} | Lý do bị chặn | Token vào | Ra | Thinking | USD | Giây |`,
        `| --- | --- | ${OUTCOMES.map(() => '---').join(' | ')} | --- | --- | --- | --- | --- | --- |`
      ]
      for (const s of summary) {
        const lineOutcomes = [...outcomes[s.v.label].values()]
        const has = wanted.every((n) => outcomes[s.v.label].has(n))
        const reasons = Object.entries(refusalReasons(lineOutcomes))
          .map(([reason, count]) => `${reason} ${count}`)
          .join(', ')
        lines.push(
          `| ${s.v.label} | ${describeVariant(s.v)} | ` +
            `${completionCells(has ? countOutcomes(lineOutcomes) : null).join(' | ')} | ${reasons || '–'} | ` +
            `${s.input} | ${s.output} | ${s.reasoning} | $${s.usd.toFixed(3)} | ${Math.round(s.seconds)} |`
        )
      }
      lines.push(
        '',
        '## Chất lượng',
        '',
        comparable
          ? exclusionLine(comparable)
          : 'Chưa đủ kết cục từng đoạn cho mọi biến thể (lần chạy cũ): đo theo chương như trước, chưa loại đoạn bị từ chối.',
        'Lớp: `gate` chứng minh được bằng code; `cờ` là heuristic có thể báo nhầm, là số cần xem chứ không phải số lỗi.',
        '',
        '| Biến thể | Chương | Chương lệch số đoạn [gate] | Đoạn thiếu [gate] | Cờ glossary (khớp) [cờ] | Cờ tên (nhất quán) [cờ] |',
        '| --- | --- | --- | --- | --- | --- |'
      )
      for (const s of summary) {
        const names = overallConsistency(s.names)
        lines.push(
          `| ${s.v.label} | ${s.chapters} | ${s.mismatched} | ${s.missingParas} | ` +
            (noCommon
              ? '– | – |'
              : `${pct(s.hits, s.checks)} (${s.hits}/${s.checks}) | ` +
                `${pct(names.consistent, names.paragraphs)} (${names.names} tên) |`)
        )
      }
      for (const s of summary) {
        const shaky = s.names.filter((r) => r.paragraphs > 0 && r.consistent / r.paragraphs < 0.9)
        if (shaky.length === 0) continue
        lines.push('', `Tên ${s.v.label} lệch (dưới 90% đoạn dùng cách viết chính):`)
        for (const r of shaky.slice(0, 8)) {
          const others = r.others.map((o) => `${o.rendering} ×${o.count}`).join(', ')
          lines.push(
            `- ${r.name}: "${r.dominant ?? '?'}" ${r.consistent}/${r.paragraphs}` +
              (others ? `; khác: ${others}` : '')
          )
        }
      }
      for (const s of summary) {
        const top = [...s.misses].sort((a, b) => b[1] - a[1]).slice(0, 10)
        if (top.length > 0) {
          lines.push(
            '',
            `Thuật ngữ ${s.v.label} hay trượt: ` + top.map(([t, c]) => `${t} (${c})`).join(', ')
          )
        }
      }

      const bodies: string[] = []
      const sideBySide = parseRange(
        args.flags.get('side-by-side') ?? wanted.slice(0, 3).join(','),
        novel.chapterCount
      ).filter((n) => wanted.includes(n))
      for (const n of sideBySide) {
        bodies.push(`\n## Chương ${n}\n`)
        const source = paragraphs(textOf(variants[0], n, 'source'))
        const targets = variants.map((v) => paragraphs(textOf(v, n, 'target')))
        const count = Math.max(source.length, ...targets.map((t) => t.length))
        for (let i = 0; i < count; i++) {
          bodies.push(
            `**${i + 1}.** ${source[i] ?? '∅'}  \n` +
              variants.map((v, j) => `${v.label}: ${targets[j][i] ?? '∅'}`).join('  \n') +
              '\n'
          )
        }
      }
      if (sideBySide.length > 0) {
        lines.push(
          '',
          `Đặt cạnh nhau: chương ${sideBySide.join(', ')} (đổi bằng --side-by-side). Đọc đủ trong tệp txt/PDF.`
        )
      }
      const out = join(LAB, 'reports', `${novel.ncode}.md`)
      writeFileRetry(out, [...lines, ...bodies].join('\n') + '\n', 'utf8')
      console.log(`${novel.ncode}: ${wanted.length} chương → ${out}`)
    }
  } finally {
    library.close()
  }
  writeHistory(manifest)
}

// ---------------------------------------------------------------- xuất txt và pdf

/** Tên tệp an toàn trên Windows: bỏ ký tự cấm và cắt ngắn tên truyện dài. */
function fileTitle(title: string): string {
  const clean = title
    .replace(/【[^】]*】/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
  return clean.length > 40 ? clean.slice(0, 40).trim() + '…' : clean
}

interface CopyForExport {
  novel: NovelEntry
  variant: Variant
  author: string | null
  heading: string
  chapters: Array<{ id: string; number: number; title: string; content: string }>
  translated: number
  base: string
}

function copiesForExport(library: LibraryStore, manifest: Manifest, args: Args): CopyForExport[] {
  const out: CopyForExport[] = []
  for (const novel of pickNovels(manifest, args.positional)) {
    for (const variant of variantsOf(novel, args.flags)) {
      const workId = novel.copies[variant.label]
      const stats = novel.stats[variant.label] ?? {}
      const models = [...new Set(Object.values(stats).map((item) => item.model))].join(', ')
      const all = library.listChapters(workId)
      // `--chapters` chỉ xuất dải đã dịch, để tệp đọc không kèm hàng trăm chương "(chưa dịch)".
      const keep = new Set(parseRange(args.flags.get('chapters'), all.length))
      const chapters = all
        .map((chapter, index) => ({
          id: chapter.id,
          number: index + 1,
          title: chapter.title,
          content: library.readText(workId, chapter.id, 'target').content.trim()
        }))
        .filter((chapter) => keep.has(chapter.number))
      const glossaryName = glossaryNameOf(novel, variant.label)
      const glossary =
        glossaryName === null
          ? 'không glossary'
          : `glossary ${glossaryName} (${glossaryProvenance(glossaryName).origin})`
      out.push({
        novel,
        variant,
        author: library.get(workId).author,
        heading: `Bản dịch Mira [${variant.label}]: ${describeVariant(variant)}, ${glossary}, model ${models || '—'}`,
        chapters,
        translated: chapters.filter((chapter) => chapter.content !== '').length,
        base: novel.names?.[variant.label]
          ? `${novel.ncode} ${fileTitle(novel.names[variant.label])}`
          : `${novel.ncode} ${fileTitle(novel.title)} [${variant.label}]`
      })
    }
  }
  return out
}

function exportTexts(manifest: Manifest, args: Args): void {
  const library = openLibrary(manifest)
  const outDir = join(LAB, 'export')
  mkdirSync(outDir, { recursive: true })
  try {
    for (const copy of copiesForExport(library, manifest, args)) {
      const header = [
        copy.novel.title,
        `Tác giả: ${copy.author ?? '—'}`,
        copy.heading,
        `Đã dịch: ${copy.translated}/${copy.chapters.length} chương · xuất lúc ${new Date().toLocaleString('vi-VN')}`,
        '',
        ''
      ]
      const body = copy.chapters.flatMap((chapter) => [
        `=== Chương ${chapter.number}: ${chapter.title} ===`,
        '',
        chapter.content || '(chưa dịch)',
        '',
        ''
      ])
      const out = join(outDir, copy.base + '.txt')
      writeFileRetry(out, '﻿' + [...header, ...body].join('\r\n'), 'utf8')
      console.log(`${copy.base}: ${copy.translated}/${copy.chapters.length} chương → ${out}`)
    }
  } finally {
    library.close()
  }
}

async function exportPdfs(manifest: Manifest, args: Args): Promise<void> {
  const library = openLibrary(manifest)
  const outDir = join(LAB, 'export')
  mkdirSync(outDir, { recursive: true })
  const jobs: string[] = []
  try {
    for (const copy of copiesForExport(library, manifest, args)) {
      const html = formatAsNovelHtml(
        {
          title: `${copy.novel.title} [${copy.variant.label}]`,
          author: copy.author,
          description:
            `${copy.heading}.\n` +
            `Đã dịch ${copy.translated}/${copy.chapters.length} chương. Xuất lúc ${new Date().toLocaleString('vi-VN')}.`
        },
        copy.chapters.map((chapter) => ({
          ...chapter,
          content: chapter.content || '(chưa dịch)'
        })),
        { includeTitle: true, includeAuthor: true, includeDescription: true, pageSize: 'A5' }
      )
      // HTML tạm đặt tên ASCII: Chromium từng lỗi ERR_FAILED với đường dẫn có dấu ngoặc và chữ Nhật.
      const page = join(outDir, `.${copy.novel.ncode}-${copy.variant.label}.html`)
      writeFileRetry(page, html, 'utf8')
      jobs.push(page, join(outDir, copy.base + '.pdf'))
    }
  } finally {
    library.close()
  }
  // Electron chỉ chạy được như một tiến trình riêng; `electron` trong Node trả đường dẫn tới binary.
  const require = createRequire(import.meta.url)
  const electron = require('electron') as unknown as string
  const result = spawnSync(electron, [join(ROOT, 'scripts', 'lab', 'print-pdf.cjs'), ...jobs], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
  })
  for (let i = 0; i < jobs.length; i += 2) rmSync(jobs[i], { force: true })
  if (result.status !== 0) throw new Error('Electron in PDF lỗi (mã ' + result.status + ').')
}

// ---------------------------------------------------------------- chi phí và tần suất

/**
 * Chi phí lấy từ usage của đề xuất trong kho, không từ log request: Gemini để token thinking ngoài
 * `completion_tokens`, và Mira đã cộng phần đó vào token ra khi lưu đề xuất. Log request chỉ dùng để
 * đếm lời gọi và đo tần suất.
 */
function costReport(manifest: Manifest, args: Args): void {
  const library = openLibrary(manifest)
  const rows: string[][] = []
  let totalUsd = 0
  let totalIn = 0
  let totalOut = 0
  try {
    for (const novel of pickNovels(manifest, args.positional)) {
      for (const variant of variantsOf(novel, args.flags)) {
        const workId = novel.copies[variant.label]
        const usages = library.withWork(workId, (db) =>
          db
            .prepare("SELECT usage_json FROM proposal WHERE origin = 'translate'")
            .all<{ usage_json: string | null }>()
        )
        let input = 0
        let output = 0
        for (const row of usages) {
          if (!row.usage_json) continue
          const usage = JSON.parse(row.usage_json) as {
            inputTokens?: number
            outputTokens?: number
          }
          input += usage.inputTokens ?? 0
          output += usage.outputTokens ?? 0
        }
        const stats = Object.values(novel.stats[variant.label] ?? {})
        const model = stats[0]?.model ?? 'gemini-2.5-flash'
        const usd =
          costOfUsage({ inputTokens: input, outputTokens: output }, lookupModel(model, 'google')) ??
          0
        const visibleOut = stats.reduce((sum, item) => sum + item.outputTokens, 0)
        totalUsd += usd
        totalIn += input
        totalOut += output
        rows.push([
          `${novel.ncode} [${variant.label}]`,
          model,
          `${stats.length}/${novel.chapterCount}`,
          String(input),
          String(output),
          `${Math.max(0, output - visibleOut)}`,
          `$${usd.toFixed(4)}`
        ])
      }
    }
  } finally {
    library.close()
  }
  console.log(
    'Bản | model | chương xong | token vào | token ra (gồm thinking) | trong đó thinking | USD'
  )
  for (const row of rows) console.log(row.join(' | '))
  console.log(
    `Tổng: vào ${totalIn}, ra ${totalOut}, ≈ $${totalUsd.toFixed(4)} (giá theo bảng models.dev trong repo)`
  )

  // Tần suất: mỗi tệp jsonl là một luồng; thời lượng = từ lúc bắt đầu lần chạy tới lời gọi cuối.
  const runsDir = join(LAB, 'runs')
  if (!existsSync(runsDir)) return
  for (const run of readdirSync(runsDir).sort()) {
    const started = Date.parse(run.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'))
    let calls = 0
    let busyMs = 0
    let last = started
    const lanes: string[] = []
    for (const file of readdirSync(join(runsDir, run))) {
      const path = join(runsDir, run, file)
      const records = readFileSync(path, 'utf8').split('\n').filter(Boolean)
      calls += records.length
      for (const line of records) busyMs += (JSON.parse(line) as CallRecord).ms
      last = Math.max(last, statSync(path).mtimeMs)
      lanes.push(`${file.replace('.jsonl', '')} ${records.length}`)
    }
    const minutes = (last - started) / 60_000
    if (calls === 0 || minutes <= 0) continue
    console.log(
      `\nLần chạy ${run}: ${calls} lời gọi trong ${minutes.toFixed(1)} phút ≈ ${(calls / minutes).toFixed(1)} lời gọi/phút ` +
        `(${lanes.length} luồng), mỗi lời gọi trung bình ${(busyMs / calls / 1000).toFixed(1)} giây`
    )
    console.log('  ' + lanes.join(', '))
  }
}

// ---------------------------------------------------------------- phân tích xưng hô

/**
 * Đề xuất nhân vật và cặp xưng hô đủ ô kèm bằng chứng. Ghi ra tệp để duyệt; \`--apply\` chỉ điền
 * những ô còn trống trong tệp glossary và thêm cặp mới, không ghi đè lựa chọn đã có.
 */
async function analyze(manifest: Manifest, args: Args): Promise<void> {
  const key = env('GEMINI_API_KEY')
  if (!key) throw new Error('Thiếu GEMINI_API_KEY (biến môi trường hoặc .env).')
  const model = args.flags.get('model') ?? env('MIRA_LAB_ANALYSIS_MODEL', 'gemini-3.1-flash-lite')
  const baseUrl =
    args.flags.get('base-url') ??
    env('MIRA_LAB_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai')
  const library = openLibrary(manifest)
  mkdirSync(join(LAB, 'analysis'), { recursive: true })
  try {
    for (const novel of pickNovels(manifest, args.positional)) {
      const fileName = args.flags.get('glossary-file') ?? novel.ncode
      const file = glossaryFileOf(fileName)
      const characters = file?.characters ?? []
      if (characters.length === 0) {
        console.log(`${novel.ncode}: tệp glossary chưa có nhân vật nào, bỏ qua.`)
        continue
      }
      const workId = Object.values(novel.copies)[0]
      const work = library.get(workId)
      const ids = chapterIds(library, workId)
      const wanted = parseRange(args.flags.get('chapters') ?? '1-30', ids.length)
      const chapters = wanted.map((n) => ({
        number: n,
        text: library.readText(workId, ids[n - 1], 'source').content
      }))
      const register = resolveRegister(work)
      const evidence = collectAddressingEvidence(chapters, characters, work.sourceLang)
      const messages = buildAnalysisMessages({
        sourceLang: work.sourceLang,
        register,
        characters,
        evidence
      })

      const services = createServices({ library, crypto: volatileCrypto, fetch })
      const connection = await setupConnection(services, key, model, baseUrl, 30, undefined)
      let text = ''
      let usd = 0
      try {
        const provider = services.connections.translator(
          connection.connectionId,
          connection.entryId
        ).provider as unknown as TranslationModelCaller
        const result = await provider.complete(messages)
        text = result.text
        const usage = result.usage as { inputTokens?: number; outputTokens?: number } | null
        usd =
          costOfUsage(
            { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
            lookupModel(model, 'google')
          ) ?? 0
      } finally {
        services.connections.delete(connection.connectionId)
      }
      const result = parseAnalysis(text)
      const out = join(LAB, 'analysis', `${novel.ncode}.json`)
      writeFileRetry(
        out,
        JSON.stringify(
          {
            ncode: novel.ncode,
            model,
            register,
            chapters: wanted,
            at: new Date().toISOString(),
            ...result
          },
          null,
          2
        ) + '\n',
        'utf8'
      )
      console.log(
        `\n${novel.ncode}: ${result.characters.length} nhân vật, ${result.dyads.length} cặp, ≈ $${usd.toFixed(4)} → ${out}`
      )
      for (const dyad of result.dyads) {
        const second = dyad.secondPerson ? `, ngôi hai "${dyad.secondPerson}"` : ''
        console.log(
          `  ${dyad.from} → ${dyad.to}: "${dyad.self}" – "${dyad.address}"${second} [${dyad.confidence ?? '?'}]`
        )
      }

      if (args.flags.has('apply') && file) {
        let filled = 0
        let added = 0
        for (const proposed of result.characters) {
          const current = characters.find((c) => c.source === proposed.source)
          if (!current) continue
          if (!current.thirdPerson && proposed.thirdPerson) {
            current.thirdPerson = proposed.thirdPerson
            filled++
          }
          if ((!current.gender || current.gender === 'unknown') && proposed.gender) {
            current.gender = proposed.gender as CharacterGender
            filled++
          }
        }
        file.dyads ??= []
        for (const proposed of result.dyads) {
          if (
            !characters.some((c) => c.source === proposed.from) ||
            !characters.some((c) => c.source === proposed.to)
          )
            continue
          const current = file.dyads.find((d) => d.from === proposed.from && d.to === proposed.to)
          if (current) {
            if (!current.secondPerson && proposed.secondPerson && !isPronounLike(current.address)) {
              current.secondPerson = proposed.secondPerson
              filled++
            }
          } else {
            file.dyads.push({
              from: proposed.from,
              to: proposed.to,
              self: proposed.self,
              address: proposed.address,
              ...(proposed.secondPerson ? { secondPerson: proposed.secondPerson } : {}),
              notes: ['AI đề xuất, chờ duyệt', proposed.notes].filter(Boolean).join('. ')
            })
            added++
          }
        }
        const path = writeGlossaryFile(fileName, file)
        console.log(
          `  Đã điền ${filled} ô trống và thêm ${added} cặp vào ${path}. Chạy "glossary ${novel.ncode}" để nạp.`
        )
      }
    }
  } finally {
    library.close()
  }
}

// ---------------------------------------------------------------- chấm cặp xưng hô

const PRONOUN_CANDIDATES = [
  'tôi',
  'tao',
  'tớ',
  'mình',
  'ta',
  'anh',
  'em',
  'chị',
  'cậu',
  'mày',
  'ngài',
  'cô',
  'ông',
  'bà',
  'ngươi',
  'con'
]

/** Đại từ đứng riêng trong câu; bỏ dạng nhắc tên hay ngôi ba ("chị Claire", "anh ấy", "em gái"). */
function pronounsIn(text: string): string[] {
  const found: string[] = []
  const lower = text.toLowerCase()
  for (const word of PRONOUN_CANDIDATES) {
    const pattern = new RegExp(`(^|[^\\p{L}])${word}(?=[^\\p{L}]|$)`, 'gu')
    for (const match of lower.matchAll(pattern)) {
      const after = text.slice(
        (match.index ?? 0) + match[0].length,
        (match.index ?? 0) + match[0].length + 12
      )
      if (/^ (ấy|ta|trai|gái|họ|nhà)\b/.test(after) || /^ \p{Lu}/u.test(after)) continue
      found.push(word)
    }
  }
  return found
}

function allowedWords(dyad: { self: string; address: string; secondPerson?: string }): Set<string> {
  return new Set(
    [dyad.self, dyad.address, dyad.secondPerson ?? '']
      .join(' ')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(Boolean)
  )
}

/**
 * Chấm độ khớp cặp xưng hô: nhãn "người nói→người nghe" lấy từ phản hồi của một bản \`v3\`
 * (\`--labels\`), áp lên bản dịch của mọi biến thể cùng truyện theo chữ của đoạn gốc.
 */
function pairs(manifest: Manifest, args: Args): void {
  const [ncode] = args.positional
  const novel = pickNovels(manifest, [ncode ?? ''])[0]
  const labelVariant = args.flags.get('labels')
  if (!labelVariant) throw new Error('Cần --labels <biến thể có nhãn người nói>.')
  const file = glossaryFileOf(args.flags.get('glossary-file') ?? novel.ncode)
  const nameOf = new Map((file?.characters ?? []).map((c) => [c.source, c.target]))
  const dyads = new Map(
    (file?.dyads ?? []).map((d) => [
      `${nameOf.get(d.from) ?? d.from}→${nameOf.get(d.to) ?? d.to}`,
      d
    ])
  )
  // Nhãn: chữ gốc → "A→B", lấy từ mọi lần chạy, lần sau đè lần trước.
  const labels = new Map<string, string>()
  const runsDir = join(LAB, 'runs')
  for (const run of existsSync(runsDir) ? readdirSync(runsDir).sort() : []) {
    const path = join(runsDir, run, `${novel.ncode}-${labelVariant}.jsonl`)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
      const record = JSON.parse(line) as CallRecord
      const user = record.messages.find((m) => m.role === 'user')?.content ?? ''
      // Bản chạy cũ gói nguồn trong thẻ `<nguon>`; vẫn đọc được các lần chạy đã lưu.
      const source = /<(?:source|nguon)>\n([\s\S]*?)\n<\/(?:source|nguon)>/.exec(user)?.[1]
      if (!source || !record.response) continue
      try {
        const sent = JSON.parse(source) as Array<{ id: string; src: string }>
        const got = JSON.parse(
          sanitizeJsonString(record.response.replace(/```(?:json)?/g, '').trim())
        ) as Array<{
          id: string
          speaker_to_listener?: string
          noi?: string
        }>
        const srcById = new Map(sent.map((item) => [item.id, item.src]))
        for (const item of got) {
          const src = srcById.get(item.id)
          // Bản chạy cũ ghi nhãn ở khóa `noi`; vẫn đọc được để dùng lại các lần chạy đã lưu.
          const label = item.speaker_to_listener ?? item.noi
          if (src && label && !label.includes('?')) labels.set(src.trim(), label.replace(/\s/g, ''))
        }
      } catch {
        // phản hồi hỏng: bỏ qua lần gọi này
      }
    }
  }
  console.log(`${novel.ncode}: ${labels.size} câu thoại có nhãn từ ${labelVariant}.`)

  const library = openLibrary(manifest)
  try {
    for (const variant of variantsOf(novel, args.flags)) {
      const workId = novel.copies[variant.label]
      const ids = chapterIds(library, workId)
      let checked = 0
      let off = 0
      const byPair = new Map<string, { checked: number; off: number; example?: string }>()
      const measured: number[] = []
      for (const n of parseRange(args.flags.get('chapters'), ids.length)) {
        const source = paragraphs(library.readText(workId, ids[n - 1], 'source').content)
        const target = paragraphs(library.readText(workId, ids[n - 1], 'target').content)
        if (target.length === 0 || target.length !== source.length) continue
        measured.push(n)
        source.forEach((src, i) => {
          const label = labels.get(src.trim())
          const dyad = label ? dyads.get(label) : undefined
          if (!label || !dyad) return
          const allowed = allowedWords(dyad)
          const bad = pronounsIn(target[i]).filter((word) => !allowed.has(word))
          const stat = byPair.get(label) ?? { checked: 0, off: 0 }
          stat.checked++
          checked++
          if (bad.length > 0) {
            stat.off++
            off++
            stat.example ??= `ch${n}: ${target[i].slice(0, 90)} [${bad.join(', ')}]`
          }
          byPair.set(label, stat)
        })
      }
      if (checked > 0) {
        recordMeasurement(novel, variant.label, measured, {
          addressing: { labels: labelVariant, checked, off }
        })
      }
      console.log(`\n[${variant.label}] lệch cặp: ${off}/${checked} câu (${pct(off, checked)})`)
      for (const [label, stat] of [...byPair].sort((a, b) => b[1].off - a[1].off)) {
        console.log(
          `  ${label}: ${stat.off}/${stat.checked}${stat.example ? '  vd: ' + stat.example : ''}`
        )
      }
    }
  } finally {
    library.close()
  }
  writeHistory(manifest)
}

// ---------------------------------------------------------------- lệnh

// ---------------------------------------------------------------- bản mới và glossary AI

/**
 * Tạo bản mới của một truyện bằng cách chép bản gốc từ một bản có sẵn, kèm glossary riêng
 * (`--glossary <tên tệp>` hoặc `none`). Dùng khi thư mục truyện gốc không còn để `import`.
 */
function fork(manifest: Manifest, args: Args): void {
  const [ncode] = args.positional
  const novel = pickNovels(manifest, [ncode ?? ''])[0]
  const from = args.flags.get('from') ?? Object.keys(novel.copies)[0]
  const fromId = novel.copies[from]
  if (!fromId) throw new Error(`Không có bản ${from} của ${novel.ncode}.`)
  const labels = (args.flags.get('variants') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (labels.length === 0) throw new Error('Cần --variants <nhãn,…>.')
  const repeat = args.flags.get('repeat')
  if (repeat !== undefined) {
    const expanded = labels.flatMap((label) => repeatLabels(label, Number(repeat)))
    novel.repeatOf = {
      ...novel.repeatOf,
      ...Object.fromEntries(expanded.map((label) => [label, repeatBase(label)]))
    }
    labels.splice(0, labels.length, ...expanded)
  }
  labels.forEach(parseVariant)
  const flag = args.flags.get('glossary')
  const glossaryName = flag === undefined ? novel.ncode : flag === 'none' ? null : flag
  if (glossaryName !== null && !glossaryFileOf(glossaryName)) {
    throw new Error(`Không thấy tệp glossary/${glossaryName}.json.`)
  }
  const library = openLibrary(manifest)
  try {
    for (const label of labels) {
      if (novel.copies[label]) {
        console.log(`${novel.ncode} [${label}]: đã có.`)
        continue
      }
      createCopy(manifest, library, novel, from, label, glossaryName)
    }
  } finally {
    library.close()
  }
}

/** Bản mới `label` chép bản gốc từ bản `from`, nạp glossary `glossaryName`; chưa có bản dịch. */
function createCopy(
  manifest: Manifest,
  library: LibraryStore,
  novel: NovelEntry,
  from: string,
  label: string,
  glossaryName: string | null
): string {
  const fromId = novel.copies[from]
  const base = library.get(fromId)
  const chapters = library.listChapters(fromId)
  const work = library.create({
    title: `${base.originalTitle ?? base.title} [${label}]`.slice(0, 200),
    ...(base.originalTitle ? { originalTitle: base.originalTitle } : {}),
    sourceLang: base.sourceLang,
    ...(base.author ? { author: base.author } : {}),
    ...(base.genre ? { genre: base.genre } : {}),
    ...(base.description ? { description: base.description } : {})
  })
  for (const chapter of chapters) {
    const created = library.createChapter(work.id, chapter.title).chapter
    const text = library.readText(fromId, chapter.id, 'source').content
    library.saveText(work.id, created.id, 'source', text, 0, segment(text, 'ja'))
  }
  novel.copies[label] = work.id
  novel.glossaries = { ...novel.glossaries, [label]: glossaryName }
  const terms = syncGlossary(library, work.id, glossaryName)
  writeManifest(manifest)
  console.log(
    `${novel.ncode} [${label}]: ${chapters.length} chương chép từ ${from}, ` +
      `glossary ${glossaryName ?? 'không có'} (${terms} thuật ngữ).`
  )
  return work.id
}

/**
 * AI trích xuất glossary và nhân vật từ bản gốc, ghi vào một tệp riêng (`--out`, mặc định
 * `<ncode>.ai`) với `origin: ai`. Không bao giờ ghi đè tệp chung của truyện. Mục được ghi để đi thẳng
 * vào prompt khi đo (tự duyệt), và tệp ghi rõ là chưa người dịch duyệt.
 */
async function extract(manifest: Manifest, args: Args): Promise<void> {
  const key = env('GEMINI_API_KEY')
  if (!key) throw new Error('Thiếu GEMINI_API_KEY (biến môi trường hoặc .env).')
  const model = args.flags.get('model') ?? env('MIRA_LAB_EXTRACT_MODEL', 'gemini-2.5-flash')
  const baseUrl =
    args.flags.get('base-url') ??
    env('MIRA_LAB_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai')
  const [ncode] = args.positional
  const novel = pickNovels(manifest, [ncode ?? ''])[0]
  const out = args.flags.get('out') ?? `${novel.ncode}.ai`
  if (out === novel.ncode) throw new Error('Không ghi đè tệp glossary chung; chọn --out khác.')
  // Mặc định tắt thinking; model không tắt được (gemini-3.5-flash-lite trả 400) thì dùng --thinking minimal.
  const thinking = (args.flags.get('thinking') ?? 'off') as ThinkingLevel
  if (!THINKING_LEVELS.includes(thinking)) throw new Error('Mức thinking không hợp lệ: ' + thinking)
  const thinkingIssue = thinkingProblem(model, thinking)
  if (thinkingIssue !== null) throw new Error(thinkingIssue)
  const from = args.flags.get('from') ?? Object.keys(novel.copies)[0]
  const library = openLibrary(manifest)
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(LAB, 'runs', runId)
  mkdirSync(runDir, { recursive: true })
  const calls: CallRecord[] = []
  const context = { ncode: novel.ncode, variant: `extract→${out}`, chapter: 0 }
  const sink = (record: CallRecord): void => {
    calls.push(record)
    appendFileSync(
      join(runDir, `${novel.ncode}-extract.jsonl`),
      JSON.stringify(record) + '\n',
      'utf8'
    )
  }
  try {
    const workId = novel.copies[from]
    const work = library.get(workId)
    const ids = chapterIds(library, workId)
    const wanted = parseRange(args.flags.get('chapters') ?? '1-30', ids.length)
    const chapters = wanted.map((n) => ({
      number: n,
      text: library.readText(workId, ids[n - 1], 'source').content
    }))
    const lang = work.sourceLang
    const services = createServices({
      library,
      crypto: volatileCrypto,
      fetch: recordingFetch(fetch, context, sink)
    })
    const connection = await setupConnection(services, key, model, baseUrl, 30, thinking)
    const provider = services.connections.translator(connection.connectionId, connection.entryId)
      .provider as unknown as TranslationModelCaller
    const ask = async (
      messages: Array<{ role: 'system' | 'user'; content: string }>
    ): Promise<string> => (await provider.complete(messages)).text

    let file: GlossaryFile
    try {
      const fromCode = lang === 'ja' ? japaneseCandidates(chapters) : []
      console.log(
        `${novel.ncode}: code tìm ${fromCode.length} ứng viên trong ${chapters.length} chương.`
      )
      const swept: string[] = []
      for (const chunk of sweepChunks(chapters)) {
        context.chapter = chunk[0].number
        try {
          swept.push(...parseSweep(await ask(buildSweepMessages(lang, chunk))))
        } catch (error) {
          console.log(
            `  Quét chương ${chunk[0].number}–${chunk.at(-1)?.number} lỗi: ${String(error)}`
          )
        }
      }
      const limit = Number(args.flags.get('max-candidates') ?? '300')
      const candidates = mergeCandidates(fromCode, swept, chapters, { limit })
      console.log(`  AI quét thêm ${swept.length} dạng; hợp lại còn ${candidates.length} ứng viên.`)
      const terms: ExtractedTerm[] = []
      const batchSize = Number(args.flags.get('batch') ?? '60')
      for (let i = 0; i < candidates.length; i += batchSize) {
        context.chapter = 0
        try {
          terms.push(
            ...parseClassification(
              await ask(buildClassifyMessages(lang, candidates.slice(i, i + batchSize)))
            )
          )
        } catch (error) {
          console.log(`  Phân loại lô ${i / batchSize + 1} lỗi: ${String(error)}`)
        }
      }
      const verified = verifyTerms(terms, chapters, lang)
      const persons = verified.accepted.filter((term) => term.type === 'person')
      const others = verified.accepted.filter((term) => term.type !== 'person')
      const at = new Date().toISOString()
      file = {
        origin: 'ai',
        note:
          `AI trích xuất ${at.slice(0, 10)} bằng ${model} (không thinking) từ chương ` +
          `${wanted[0]}–${wanted.at(-1)}, lệnh "extract". Tự duyệt để đo; chưa người dịch duyệt.`,
        extraction: {
          model,
          chapters: wanted,
          at,
          runId,
          codeCandidates: fromCode.length,
          sweptForms: swept.length,
          candidates: candidates.length,
          accepted: verified.accepted.length,
          rejected: verified.rejected.length,
          dropped: verified.dropped
        },
        entries: others.map((term) => ({
          source: term.source,
          target: term.target ?? '',
          ...(term.aliases?.length ? { aliases: term.aliases } : {}),
          notes: [term.type, term.note].filter(Boolean).join(': ')
        })),
        characters: persons.map((term) => ({
          source: term.source,
          target: term.target ?? '',
          ...(term.aliases?.length ? { aliases: term.aliases } : {}),
          gender: (term.gender ?? 'unknown') as CharacterGender,
          ...(term.note ? { role: term.note } : {})
        })),
        dyads: [],
        rejected: verified.rejected.map((term) => ({
          source: term.source,
          ...(term.reason ? { reason: term.reason } : {})
        }))
      }
    } finally {
      services.connections.delete(connection.connectionId)
    }
    const path = writeGlossaryFile(out, file)
    const usd = usdOf(model, calls)
    appendRegistry(
      RUNS_LOG,
      summarizeRun(
        calls,
        {
          runId,
          ncode: novel.ncode,
          variant: `extract→${out}`,
          thinking,
          model,
          ...gitState(),
          promptVersion: 'glossary-extract-v1',
          usd,
          note: 'AI trích xuất glossary'
        },
        sha,
        TRANSLATE_PROMPT_VERSION
      )
    )
    console.log(
      `  ${file.characters?.length ?? 0} nhân vật, ${file.entries.length} thuật ngữ, ` +
        `${file.rejected?.length ?? 0} loại, ${(file.extraction as { dropped: unknown[] }).dropped.length} bỏ khi kiểm; ` +
        `${calls.length} lời gọi ≈ $${usd.toFixed(4)} → ${path}`
    )
    for (const character of file.characters ?? []) {
      console.log(`    ${character.source} → ${character.target} (${character.gender})`)
    }
  } finally {
    library.close()
    writeHistory(manifest)
  }
}

/** Đặt tên tiếng Việt cho một bản: dùng làm tên tác phẩm khi mở bằng app và tên tệp xuất. */
// ---------------------------------------------------------------- trau chuốt

/** Một đoạn sửa ghi vào nhật ký trau chuốt, đã nhận hoặc bị code loại. */
interface PolishLogEntry {
  chapter: number
  paragraph: number
  issue: string
  note: string
  before: string
  after: string
  /** Vắng là đã nhận; có là lý do code loại. */
  rejected?: string
}

/** Số lời gọi tối đa để khoanh đoạn bị bộ lọc chặn trong một lô trau chuốt. */
const POLISH_FILTER_CALLS = 8

/**
 * Trau chuốt bản dịch của bản `--from` thành bản mới `--to` (biến thể "soát rồi sửa"): model gắn nhãn
 * lỗi rồi sửa, code kiểm từng đoạn sửa, đoạn không sửa giữ nguyên bản nháp. Mỗi đoạn sửa, nhận hay bị
 * loại, ghi vào tệp nhật ký `polish` và tệp đọc thay đổi trong `export`.
 */
async function polish(manifest: Manifest, args: Args): Promise<void> {
  const key = env('GEMINI_API_KEY')
  if (!key) throw new Error('Thiếu GEMINI_API_KEY (biến môi trường hoặc .env).')
  const [ncode] = args.positional
  const novel = pickNovels(manifest, [ncode ?? ''])[0]
  const from = args.flags.get('from')
  if (!from || !novel.copies[from]) throw new Error('Cần --from <bản đã dịch>.')
  const to = args.flags.get('to') ?? `${from}+polish`
  const variant = parseVariant(to)
  const model = args.flags.get('model') ?? env('MIRA_LAB_MODEL', 'gemini-2.5-flash')
  const problem = thinkingProblem(model, variant.thinking)
  if (problem !== null) throw new Error(`[${to}] không chạy: ${problem}`)
  const baseUrl =
    args.flags.get('base-url') ??
    env('MIRA_LAB_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai')
  const rpm = Number(args.flags.get('rpm') ?? env('MIRA_LAB_RPM', '8'))
  const maxUsd = Number(args.flags.get('max-usd') ?? 'Infinity')
  const note = args.flags.get('note')
  const glossaryName = glossaryNameOf(novel, from)
  const file = glossaryFileOf(glossaryName)

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const git = gitState()
  const runDir = join(LAB, 'runs', runId)
  mkdirSync(runDir, { recursive: true })
  mkdirSync(join(LAB, 'polish'), { recursive: true })
  const logPath = join(LAB, 'polish', `${novel.ncode}-${to}.jsonl`)
  const library = openLibrary(manifest)
  const calls: CallRecord[] = []
  const context = { ncode: novel.ncode, variant: to, chapter: 0 }
  const services = createServices({
    library,
    crypto: volatileCrypto,
    fetch: recordingFetch(fetch, context, (record) => {
      calls.push(record)
      appendFileSync(join(runDir, `${novel.ncode}-${to}.jsonl`), JSON.stringify(record) + '\n')
    })
  })
  const ids = await setupConnection(services, key, model, baseUrl, rpm, variant.thinking)
  const caller = services.connections.translator(ids.connectionId, ids.entryId)
    .provider as unknown as TranslationModelCaller

  const nameOf = new Map<string, string>()
  for (const character of file?.characters ?? []) {
    for (const form of [character.source, ...(character.aliases ?? [])]) {
      nameOf.set(form, character.target)
    }
  }
  const glossary: PolishTerm[] = (file?.entries ?? [])
    .filter((entry) => !entry.forbidden)
    .map((entry) => ({ source: entry.source, aliases: entry.aliases, target: entry.target }))
  const names: PolishName[] = (file?.characters ?? []).map((character) => ({
    target: character.target,
    forms: [character.source, ...(character.aliases ?? [])]
  }))

  try {
    const toId = novel.copies[to] ?? createCopy(manifest, library, novel, from, to, glossaryName)
    const fromId = novel.copies[from]
    const work = library.get(fromId)
    const fromChapters = chapterIds(library, fromId)
    const toChapters = chapterIds(library, toId)
    const totals = { accepted: 0, rejected: 0, filtered: 0, paragraphs: 0 }
    const log: PolishLogEntry[] = []

    for (const n of parseRange(args.flags.get('chapters'), novel.chapterCount)) {
      if (usdOf(model, calls) >= maxUsd) {
        console.log(`Đã chạm ngân sách $${maxUsd}; dừng.`)
        break
      }
      context.chapter = n
      const source = library.readText(fromId, fromChapters[n - 1], 'source').content
      const draft = library.readText(fromId, fromChapters[n - 1], 'target').content
      const srcParas = paragraphs(source)
      const draftParas = paragraphs(draft)
      if (draft.trim() === '') continue
      if (srcParas.length !== draftParas.length) {
        console.log(`chương ${n}: lệch số đoạn (${srcParas.length}/${draftParas.length}), bỏ qua.`)
        continue
      }

      const mentioned = (file?.characters ?? []).filter((character) =>
        [character.source, ...(character.aliases ?? [])].some((form) => source.includes(form))
      )
      const characters = mentioned.map((character) => {
        const forms = [character.source, ...(character.aliases ?? [])].join(', ')
        const facts = [
          character.gender,
          character.role,
          character.thirdPerson ? `người kể gọi "${character.thirdPerson}"` : ''
        ]
          .filter(Boolean)
          .join(', ')
        return `- ${forms} → ${character.target}${facts ? ': ' + facts : ''}`
      })
      const present = new Set(mentioned.map((character) => character.source))
      const addressing = (file?.dyads ?? [])
        .filter((dyad) => present.has(dyad.from) && present.has(dyad.to))
        .filter((dyad) => !dyad.chapters || parseRange(dyad.chapters, n).includes(n))
        .map(
          (dyad) =>
            `- ${nameOf.get(dyad.from) ?? dyad.from} → ${nameOf.get(dyad.to) ?? dyad.to}: tự xưng "${dyad.self}", gọi "${dyad.address}"` +
            (dyad.secondPerson ? `, ngôi hai "${dyad.secondPerson}"` : '')
        )
      const polishContext = { sourceLang: work.sourceLang, characters, addressing, glossary }

      // Id tạm theo thứ tự đoạn trong chương; đoạn nháp trống (bị từ chối, thiếu) không gửi.
      const items: PolishItem[] = srcParas
        .map((src, i) => ({ id: `[${i + 1}]`, src, dst: draftParas[i] }))
        .filter((item) => item.dst.trim() !== '')
      const result = new Map<number, string>()
      let filteredHere = 0

      const send = async (part: PolishItem[], budget: { calls: number }): Promise<void> => {
        if (budget.calls >= POLISH_FILTER_CALLS) {
          filteredHere += part.length
          return
        }
        budget.calls++
        let reply
        try {
          reply = await caller.complete(buildPolishMessages(polishContext, part))
        } catch (error) {
          console.log(`chương ${n}: lỗi lô — ${String(error)}`)
          return
        }
        if (reply.finishReason === 'filter') {
          if (part.length === 1) {
            filteredHere++
            return
          }
          const middle = Math.ceil(part.length / 2)
          await send(part.slice(0, middle), budget)
          await send(part.slice(middle), budget)
          return
        }
        const verdict = verifyEdits(part, parsePolish(reply.text), { glossary, names })
        const indexOf = (id: string): number => Number(id.slice(1, -1)) - 1
        for (const edit of verdict.accepted) {
          result.set(indexOf(edit.id), edit.dst)
        }
        for (const edit of [...verdict.accepted, ...verdict.rejected]) {
          const i = indexOf(edit.id)
          log.push({
            chapter: n,
            paragraph: i + 1,
            issue: edit.issue,
            note: edit.note,
            before: draftParas[i] ?? '',
            after: edit.dst,
            ...('reason' in edit ? { rejected: (edit as RejectedEdit).reason } : {})
          })
        }
        totals.rejected += verdict.rejected.length
      }

      const before = calls.length
      for (const batch of polishBatches(items)) await send(batch, { calls: 0 })
      totals.accepted += result.size
      totals.filtered += filteredHere
      totals.paragraphs += items.length

      // Thay từng dòng có chữ theo thứ tự, giữ nguyên dòng trống và bố cục của bản nháp.
      let index = 0
      const content = draft
        .split(/\r?\n/)
        .map((line) => (line.trim() === '' ? line : (result.get(index++) ?? line.trim())))
        .join('\n')
      const target = library.readText(toId, toChapters[n - 1], 'target')
      library.saveText(
        toId,
        toChapters[n - 1],
        'target',
        content,
        target.rev,
        segment(content, 'vi')
      )

      const mine = calls.slice(before)
      novel.stats[to] = {
        ...novel.stats[to],
        [String(n)]: {
          at: runId,
          model,
          calls: mine.length,
          inputTokens: mine.reduce((sum, call) => sum + call.inputTokens, 0),
          cachedTokens: mine.reduce((sum, call) => sum + call.cachedTokens, 0),
          outputTokens: mine.reduce((sum, call) => sum + call.outputTokens, 0),
          reasoningTokens: mine.reduce((sum, call) => sum + call.reasoningTokens, 0),
          usd: usdOf(model, mine),
          failed: 0,
          seconds: Math.round(mine.reduce((sum, call) => sum + call.ms, 0) / 100) / 10
        }
      }
      writeManifest(manifest)
      console.log(
        `chương ${n}: sửa ${result.size}/${items.length} đoạn` +
          (filteredHere ? `, ${filteredHere} đoạn bị lọc giữ bản nháp` : '') +
          ` · tổng $${usdOf(model, calls).toFixed(3)}`
      )
    }

    writeFileRetry(logPath, log.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8')
    const changes = join(LAB, 'export', `${novel.ncode} ${novel.names?.[to] ?? to} — thay đổi.md`)
    mkdirSync(join(LAB, 'export'), { recursive: true })
    writeFileRetry(changes, polishChangesMarkdown(novel, from, to, log), 'utf8')
    console.log(
      `\nSửa ${totals.accepted}/${totals.paragraphs} đoạn, code loại ${totals.rejected} bản sửa, ` +
        `${totals.filtered} đoạn bị lọc · ≈ $${usdOf(model, calls).toFixed(3)}\nNhật ký: ${logPath}\nĐọc thay đổi: ${changes}`
    )
  } finally {
    services.connections.delete(ids.connectionId)
    if (calls.length > 0) {
      appendRegistry(RUNS_LOG, {
        ...summarizeRun(
          calls,
          {
            runId,
            ncode: novel.ncode,
            variant: to,
            thinking: variant.thinking ?? null,
            model,
            ...git,
            glossary: glossaryProvenance(glossaryName),
            usd: usdOf(model, calls),
            note: [`trau chuốt từ ${from}`, note].filter(Boolean).join('; ')
          },
          sha,
          POLISH_PROMPT_VERSION
        ),
        promptVersion: POLISH_PROMPT_VERSION
      })
    }
    library.close()
    writeHistory(manifest)
  }
}

/** Tệp đọc các đoạn đã sửa: trước, sau, nhãn và lý do; bản sửa bị code loại để riêng cuối tệp. */
function polishChangesMarkdown(
  novel: NovelEntry,
  from: string,
  to: string,
  log: PolishLogEntry[]
): string {
  const byPlace = (a: PolishLogEntry, b: PolishLogEntry): number =>
    a.chapter - b.chapter || a.paragraph - b.paragraph
  const accepted = log.filter((entry) => !entry.rejected).sort(byPlace)
  const rejected = log.filter((entry) => entry.rejected).sort(byPlace)
  const counts = new Map<string, number>()
  for (const entry of accepted) counts.set(entry.issue, (counts.get(entry.issue) ?? 0) + 1)
  const lines = [
    `# ${novel.title} — trau chuốt ${from} → ${to}`,
    '',
    `Đã sửa ${accepted.length} đoạn (${[...counts].map(([issue, n]) => `${issue} ${n}`).join(', ')}); ` +
      `code loại ${rejected.length} bản sửa.`,
    ''
  ]
  let chapter = 0
  for (const entry of accepted) {
    if (entry.chapter !== chapter) {
      chapter = entry.chapter
      lines.push(`## Chương ${chapter}`, '')
    }
    lines.push(
      `**${entry.paragraph}.** \`${entry.issue}\` ${entry.note}  `,
      `− ${entry.before}  `,
      `+ ${entry.after}`,
      ''
    )
  }
  if (rejected.length > 0) {
    lines.push('## Bản sửa bị code loại', '')
    for (const entry of rejected) {
      lines.push(
        `**${entry.chapter}.${entry.paragraph}** \`${entry.issue}\` — ${entry.rejected}: ${entry.note}  `,
        `− ${entry.before}  `,
        `+ ${entry.after}`,
        ''
      )
    }
  }
  return lines.join('\n')
}

function nameCopy(manifest: Manifest, args: Args): void {
  const [ncode, label, ...words] = args.positional
  const novel = pickNovels(manifest, [ncode ?? ''])[0]
  const name = words.join(' ').trim()
  if (!label || !novel.copies[label] || name === '') {
    throw new Error('Cần: name <ncode> <nhãn bản> <tên tiếng Việt>.')
  }
  const library = openLibrary(manifest)
  try {
    library.update(novel.copies[label], { title: name.slice(0, 200) })
  } finally {
    library.close()
  }
  novel.names = { ...novel.names, [label]: name }
  writeManifest(manifest)
  console.log(`${novel.ncode} [${label}] → ${name}`)
}

/** Các lần chạy trong sổ, mới nhất trước. */
function listRuns(manifest: Manifest, args: Args): void {
  const { runs } = readRegistry()
  const codes = args.positional
  const variants = args.flags
    .get('variants')
    ?.split(',')
    .map((value) => value.trim())
  const limit = Number(args.flags.get('limit') ?? '30')
  const picked = runs
    .filter((run) => codes.length === 0 || codes.includes(run.ncode))
    .filter((run) => !variants || variants.includes(run.variant))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
  if (picked.length === 0) {
    console.log('Sổ chưa có lần chạy nào khớp; lần chạy cũ nhập bằng `backfill`.')
    return
  }
  for (const run of picked) {
    const commit = run.commit
      ? `${run.commit}${run.dirty ? '+' : ''}${run.commitApprox ? '~' : ''}`
      : '–'
    console.log(
      `${run.at.slice(0, 16).replace('T', ' ')}  ${run.ncode} [${run.variant}]  ` +
        `${run.model ?? '?'} · thinking ${run.thinking ?? 'mặc định'} · ${run.promptVersion ?? '?'} ` +
        `#${run.systemHashes.map((h) => h.slice(0, 8)).join(',') || '?'} · ${commit} · ` +
        `ch ${run.chapters.join(',')} · ${run.calls} lời gọi` +
        (run.httpErrors ? `, ${run.httpErrors} lỗi HTTP` : '') +
        (run.usd === null ? '' : ` · $${run.usd.toFixed(3)}`) +
        (run.note ? `\n    ${run.note}` : '')
    )
  }
  const total = Object.keys(manifest.novels).length
  console.log(`\n${picked.length}/${runs.length} lần chạy; ${total} truyện trong lab.`)
}

/** So hai biến thể của một truyện theo lần đo gần nhất của từng chỉ số. */
function compareVariants(args: Args): void {
  const [ncode, a, b] = args.positional
  if (!ncode || !a || !b) throw new Error('Cần: compare <ncode> <biến thể A> <biến thể B>.')
  const { runs, measurements } = readRegistry()
  // Một biến thể có bản lặp (`a#1…`) được so bằng cả nhóm; lần lặp lệch cấu hình bị loại khỏi nhóm.
  const groupOf = (label: string): ReturnType<typeof snapshotOf>[] => {
    const repeats = [
      ...new Set(
        [...runs, ...measurements]
          .filter(
            (r) => r.ncode === ncode && r.variant !== label && repeatBase(r.variant) === label
          )
          .map((r) => r.variant)
      )
    ].sort()
    if (repeats.length === 0) return [snapshotOf(ncode, label, runs, measurements)]
    const latest = repeats
      .map((variant) => runs.filter((r) => r.ncode === ncode && r.variant === variant).at(-1))
      .filter((r): r is RunRecord => r !== undefined)
    const { groups, rejected } = groupRepeats(
      latest.map((r) => ({
        variant: r.variant,
        runId: r.runId,
        model: r.model,
        thinking: r.thinking,
        promptVersion: r.promptVersion,
        contextHash: r.contextHash,
        chapters: r.chapters
      }))
    )
    for (const { run, reason } of rejected) {
      console.log(`Không gộp ${run.variant} vào nhóm ${label}: ${reason}.`)
    }
    return (groups[label] ?? []).map((r) => snapshotOf(ncode, r.variant, runs, measurements))
  }
  const result = compareGroups(groupOf(a), groupOf(b))
  const width = Math.max(...result.rows.map((row) => row.metric.length))
  console.log(`${ncode}: ${a} ↔ ${b}\n`)
  for (const row of result.rows) {
    const mark = row.better === 'a' ? '  ← A tốt hơn' : row.better === 'b' ? '  ← B tốt hơn' : ''
    console.log(`${row.metric.padEnd(width)}  A ${row.a}  ·  B ${row.b}${mark}`)
  }
  for (const warning of result.warnings) console.log('\nCảnh báo: ' + warning)
  // Ngữ cảnh của lần chạy mới nhất mỗi bên: chương khác hash thì so sánh lẫn cả thay đổi ngữ cảnh.
  const latest = (variant: string): RunRecord | undefined =>
    runs.filter((run) => run.ncode === ncode && run.variant === variant && run.contexts).at(-1)
  const contexts = contextDifferences(latest(a)?.contexts, latest(b)?.contexts)
  if (contexts.differ.length > 0) {
    console.log(
      '\nCảnh báo: ngữ cảnh khác nhau ở chương ' +
        contexts.differ.join(', ') +
        ' (hash bản chụp khác); chênh lệch ở đó lẫn cả thay đổi glossary, nhân vật hay xưng hô.'
    )
  }
  if (!measurements.some((m) => m.ncode === ncode)) {
    console.log('\nChưa có lần đo nào: chạy `report` và `pairs` cho truyện này trước.')
  }
}

/**
 * Nhập các lần chạy cũ từ `runs/<runId>/*.jsonl` vào sổ. Model lấy từ `lab.json` nếu chương còn trỏ
 * về lần chạy đó; commit đoán theo thời điểm và đánh dấu. Bản dịch cũ đã bị ghi đè nên không nhập
 * được lần đo: chạy lại `report`/`pairs` để chụp trạng thái hiện tại.
 */
function backfill(manifest: Manifest): void {
  const runsDir = join(LAB, 'runs')
  const known = new Set(readRegistry().runs.map((run) => run.id))
  let added = 0
  for (const runId of existsSync(runsDir) ? readdirSync(runsDir).sort() : []) {
    const dir = join(runsDir, runId)
    if (!statSync(dir).isDirectory()) continue
    const byLane = new Map<string, CallRecord[]>()
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.jsonl'))) {
      for (const record of parseRegistry<CallRecord & { version?: string }>(
        readFileSync(join(dir, file), 'utf8')
      )) {
        const variant = record.variant ?? record.version ?? '?'
        const key = `${record.ncode}\u0000${variant}`
        // Bản ghi cũ chưa có `reasoningTokens`; thiếu nó thì chi phí thành NaN.
        const call = { ...record, variant, reasoningTokens: record.reasoningTokens ?? 0 }
        byLane.set(key, [...(byLane.get(key) ?? []), call])
      }
    }
    for (const [key, calls] of byLane) {
      const [ncode, variant] = key.split('\u0000')
      if (known.has(`${runId}/${ncode}/${variant}`)) continue
      const stats = Object.values(manifest.novels[ncode]?.stats[variant] ?? {})
      const model = stats.find((s) => s.at === runId)?.model ?? null
      let thinking: string | null = null
      try {
        thinking = parseVariant(variant).thinking ?? null
      } catch {
        // nhãn cũ không theo quy ước hậu tố
      }
      const iso = Number.isNaN(Date.parse(runIdToIso(runId))) ? '' : runIdToIso(runId)
      appendRegistry(
        RUNS_LOG,
        summarizeRun(
          calls,
          {
            runId,
            ncode,
            variant,
            thinking,
            model,
            commit: iso ? commitBefore(iso) : null,
            dirty: null,
            commitApprox: true,
            // Mọi glossary của Lab trước sổ này đều do Claude soạn tay; nội dung lúc chạy không còn để băm.
            glossary: { hash: '?', origin: 'claude-draft' },
            usd: model ? usdOf(model, calls) : null,
            backfilled: true
          },
          sha,
          TRANSLATE_PROMPT_VERSION
        )
      )
      added++
    }
  }
  console.log(`Đã nhập ${added} lần chạy; sổ đã có sẵn ${known.size} lần chạy.`)
  writeHistory(manifest)
}

/** Ô còn trống trong dữ liệu xưng hô của mỗi truyện — chỗ model sẽ phải tự đoán. */
function gaps(manifest: Manifest, args: Args): void {
  const library = openLibrary(manifest)
  try {
    for (const novel of pickNovels(manifest, args.positional)) {
      const workId = Object.values(novel.copies)[0]
      const service = new AddressingService(library, () => Date.now())
      const found = addressingGaps(service.listCharacters(workId), service.listDyads(workId))
      console.log(`
${novel.ncode}: ${found.length} ô trống`)
      for (const gap of found) console.log('  - ' + gap.message)
    }
  } finally {
    library.close()
  }
}

function list(manifest: Manifest): void {
  const library = openLibrary(manifest)
  try {
    console.log('Thư viện lab: ' + manifest.dataDir)
    for (const novel of Object.values(manifest.novels)) {
      const done = Object.entries(novel.copies).map(([label, workId]) => {
        const ids = chapterIds(library, workId)
        const translated = ids.filter(
          (id) => library.readText(workId, id, 'target').content.trim() !== ''
        ).length
        return `${label} ${translated}/${ids.length}`
      })
      console.log(`${novel.ncode}  ${novel.title}  ·  đã dịch: ${done.join(', ')}`)
    }
  } finally {
    library.close()
  }
}

const HELP = `Mira Lab — thử prompt và cấu hình model trên truyện thật

Biến thể: nhãn tự đặt, thêm mức thinking sau dấu "-": a (thinking mặc định), a-nothink, a-think (= ${THINK_LEVEL}), a-low…
Thêm "+nhãn" để giữ nhiều lần thử cạnh nhau: a-nothink+ctx.

  import <thư mục truyện…> [--variants base] [--replace] [--name "Tên tiếng Việt"]
      Nạp truyện syosetsu-downloader (meta.json + plain/*.txt) thành các biến thể còn thiếu,
      kèm glossary ở fixtures/private/lab/glossary/<ncode>.json.
  glossary [ncode…|all]
      Nạp lại glossary, nhân vật và cặp xưng hô từ tệp cho mọi bản (thay toàn bộ); mỗi bản dùng tệp riêng
      đã gán khi fork, không thì tệp chung <ncode>.json.
  fork <ncode> --variants a,b [--from <bản>] [--glossary <tên tệp>|none] [--repeat N]
      Tạo bản mới bằng cách chép bản gốc từ một bản có sẵn, gán glossary riêng (hoặc không glossary).
      --repeat N: tạo N bản lặp a#1…a#N cho mỗi nhãn.
  extract <ncode> [--chapters 1-30] [--out <ncode>.ai] [--model gemini-2.5-flash] [--from <bản>]
          [--thinking off]
      AI trích xuất thuật ngữ và nhân vật: code sinh ứng viên, AI quét bổ sung, AI phân loại và đề xuất
      dịch, code kiểm lại. Ghi tệp riêng origin: ai, không đè tệp chung; ghi lần chạy vào sổ.
  prompt <ncode> [--chapter 1] [--batch 1] [--variants base] [--repair]
      In đúng prompt sẽ gửi, không gọi mạng, không tốn token.
  translate [ncode…|all] [--variants …] [--chapters 1-3] [--model gemini-2.5-flash]
            [--parallel] [--concurrency 1] [--rpm 8] [--max-usd 5] [--batch-tokens 16000]
            [--force] [--redo-failed] [--note "giả thuyết"] [--repeat N] [--max-calls 8]
            [--schema]
      Dịch thật qua đường của UI; cần GEMINI_API_KEY. Mỗi request ghi vào fixtures/private/lab/runs/,
      mỗi truyện × biến thể thêm một dòng vào sổ đăng ký (model, prompt, hash, commit, glossary, chi phí).
      --parallel: mỗi truyện × biến thể một luồng; --concurrency: số chương dịch cùng lúc mỗi luồng;
      --max-usd: dừng nhận chương mới khi chi phí (gồm thinking) chạm mức này.
      --max-calls: quỹ lời gọi phụ mỗi chương (chia lô, gửi lại không ngữ cảnh, hỏi lại); thiếu là
      mặc định của sản phẩm max(8, 2 × số lô). Đoạn không được gửi vì hết quỹ là budget_exhausted.
      --schema: hỏi câu trả lời dạng {"items":[…]} kèm JSON schema (response_format) khi model hỗ trợ;
      schema bị từ chối thì lô gửi lại không schema và các lô sau của chương không gửi schema nữa.
      Sổ đăng ký ghi chế độ đầu ra, số lô rơi về và lỗi cấu trúc (mục lạ/lặp/đoạn phải hỏi lại).
      --repeat N: dịch N bản lặp label#1…#N của mỗi biến thể (cùng bản gốc, cùng glossary) để đo độ
      dao động; in ước tính chi phí trước, chưa có cơ sở ước tính thì bắt buộc --max-usd.
      Mỗi lần chạy ghi kết cục từng đoạn vào runs/<runId>/<ncode>-<biến thể>.outcomes.jsonl.
  report [ncode…|all] [--variants …] [--side-by-side 1-3]
      So các biến thể theo hai trục: Hoàn thành (kết cục từng đoạn trên toàn tập, chi phí) và Chất lượng
      (chỉ trên các đoạn dịch được ở mọi biến thể, kèm số đoạn bị loại); vài chương đặt cạnh nhau.
  polish <ncode> --from <bản> [--to <bản>+polish] [--chapters 1-30] [--model gemini-2.5-flash]
         [--max-usd 1] [--note "…"]
      Trau chuốt "soát rồi sửa": model gắn nhãn lỗi rồi sửa, code kiểm từng đoạn sửa, ghi vào bản mới
      (nhãn --to; hậu tố -think/-nothink chọn thinking). Ghi polish/<ncode>-<to>.jsonl và
      export/<…> — thay đổi.md (trước/sau từng đoạn).
  name <ncode> <nhãn bản> <tên tiếng Việt>
      Đặt tên cho một bản (tên tác phẩm trong app, tên tệp xuất).
  export | pdf [ncode…|all] [--variants …] [--chapters 1-30]
      Xuất mỗi bản ra txt, hoặc PDF khổ A5 cùng định dạng ebook của module Xuất.
  analyze [ncode…|all] [--chapters 1-30] [--model gemini-3.1-flash-lite] [--apply]
      AI đề xuất giới tính, đại từ ngôi ba và cặp xưng hô đủ ô kèm câu bằng chứng, ghi vào
      fixtures/private/lab/analysis/<ncode>.json; --apply điền ô trống và thêm cặp mới vào tệp glossary.
  pairs <ncode> --labels <biến thể> [--variants …] [--chapters 1-10]
      Chấm số câu thoại lệch cặp xưng hô đã chốt, dùng nhãn người nói của một biến thể.
  gaps [ncode…|all]
      Ô còn trống trong nhân vật và cặp xưng hô (thiếu đại từ ngôi hai, ngôi ba, giới tính).
  cost [ncode…|all]
      Token, chi phí (gồm thinking) và tần suất gọi của các lần chạy.
  runs [ncode…] [--variants …] [--limit 30]
      Các lần chạy trong sổ đăng ký, mới nhất trước.
  compare <ncode> <biến thể A> <biến thể B>
      So hai biến thể theo lần đo gần nhất (report, pairs) và cấu hình đã chạy; cảnh báo khi khác chương.
      Biến thể có bản lặp được so cả nhóm: chỉ ghi "khác biệt" khi mỗi bên ≥ 2 lần và khoảng không chồng.
  history
      Sinh lại docs/modules/measurement/history.md từ sổ (report, pairs, translate tự làm việc này).
  backfill
      Nhập các lần chạy cũ trong runs/ vào sổ; commit đoán theo thời điểm, glossary ghi claude-draft.
  list | open
      Tình trạng từng bản; lệnh mở thư viện lab bằng app Mira.
`

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const manifest = readManifest()
  switch (args.command) {
    case 'import': {
      if (args.positional.length === 0) throw new Error('Cần ít nhất một thư mục truyện.')
      const labels = (args.flags.get('variants') ?? DEFAULT_VARIANTS.join(','))
        .split(',')
        .map((value) => value.trim())
      labels.forEach(parseVariant)
      const library = openLibrary(manifest)
      try {
        for (const dir of args.positional) {
          importNovel(
            manifest,
            library,
            dir,
            labels,
            args.flags.has('replace'),
            args.flags.get('name')
          )
          writeManifest(manifest)
        }
      } finally {
        library.close()
      }
      return
    }
    case 'glossary': {
      const library = openLibrary(manifest)
      try {
        for (const novel of pickNovels(manifest, args.positional)) {
          for (const [label, workId] of Object.entries(novel.copies)) {
            const count = syncGlossary(library, workId, glossaryNameOf(novel, label))
            console.log(`${novel.ncode} [${label}]: ${count} thuật ngữ.`)
          }
        }
      } finally {
        library.close()
      }
      return
    }
    case 'prompt':
      return showPrompt(manifest, args)
    case 'translate':
      return translate(manifest, args)
    case 'report':
      return report(manifest, args)
    case 'export':
      return exportTexts(manifest, args)
    case 'pdf':
      return exportPdfs(manifest, args)
    case 'cost':
      return costReport(manifest, args)
    case 'analyze':
      return analyze(manifest, args)
    case 'pairs':
      return pairs(manifest, args)
    case 'gaps':
      return gaps(manifest, args)
    case 'fork':
      return fork(manifest, args)
    case 'polish':
      return polish(manifest, args)
    case 'name':
      return nameCopy(manifest, args)
    case 'extract':
      return extract(manifest, args)
    case 'runs':
      return listRuns(manifest, args)
    case 'compare':
      return compareVariants(args)
    case 'history':
      return writeHistory(manifest)
    case 'backfill':
      return backfill(manifest)
    case 'list':
      return list(manifest)
    case 'open':
      console.log('PowerShell:')
      console.log(
        `  $env:MIRA_DATA_DIR = "${manifest.dataDir}"; node_modules\\.bin\\electron-vite dev`
      )
      console.log('Git Bash:')
      console.log(`  MIRA_DATA_DIR="${manifest.dataDir}" node_modules/.bin/electron-vite dev`)
      return
    default:
      console.log(HELP)
      if (args.command !== 'help') process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
