import * as v from 'valibot'
import { readSideContents, readText } from '../../../infra/storage/textFile'
import {
  AGENT_OPTION_LIMIT,
  AGENT_QUESTION_LIMIT,
  AGENT_QUESTION_TYPES,
  askQuestionsArgsSchema,
  type AgentQuestion
} from '../../../../shared/contracts/agent'
import type { AgentTaskDetailView, AgentTaskSummary } from '../../../../shared/contracts/agentTask'
import type { ResolvedTarget } from '../../../../shared/contracts/agent'
import type { CapabilityDefinition } from '../types'

/** Characters of one side `read_chapter` returns per call; longer chapters are read by `offset`. */
export const READ_CHAPTER_PAGE = 20_000

export const TARGET_PARAM = {
  type: 'string',
  description:
    'Handle của đích do resolve_target hoặc ngữ cảnh cấp (ví dụ "ctx", "t1"). Không dùng ID.'
}

const TARGET_NEEDED =
  'Cần target là handle tác phẩm hoặc chương: dùng handle "ctx" nếu có, hoặc gọi resolve_target với tên tác phẩm.'

/** Says which target a capability needs and how to get it, so the model fixes the call next round. */
const needsChapter = (name: string, target: ResolvedTarget | undefined): string =>
  `${name} cần target là handle chương` +
  (target?.kind === 'work'
    ? ` nhưng nhận handle tác phẩm "${target.workLabel}". Gọi resolve_target với mô tả chương (ví dụ "chương 5") để lấy handle chương.`
    : '. Dùng handle "ctx" nếu nó là chương, hoặc gọi resolve_target với mô tả chương (ví dụ "chương 5").')

const targetOnly = {
  type: 'object' as const,
  properties: { target: TARGET_PARAM },
  required: ['target']
}

// Results carry labels and numbers, never IDs: a target reaches a capability only as a turn handle.
export const listWorksCapability: CapabilityDefinition<Record<string, never>> = {
  name: 'list_works',
  description:
    'Liệt kê các tác phẩm trong thư viện. Không cần gọi khi handle "ctx" đã là tác phẩm cần làm; chỉ gọi ' +
    'khi người dùng hỏi về thư viện hoặc nêu một tác phẩm khác.',
  kind: 'read',
  schema: v.object({}),
  parameters: { type: 'object', properties: {}, required: [] },
  targetPolicy: 'no_target',
  handler: async ({ library }) => {
    const { works } = library.list()
    return {
      ok: true,
      value: works.map((w) => ({
        title: w.title,
        sourceLang: w.sourceLang,
        chapterCount: w.chapterCount,
        status: w.status
      }))
    }
  },
  describe: () => 'Đọc danh sách tác phẩm'
}

export const listChaptersCapability: CapabilityDefinition<Record<string, never>> = {
  name: 'list_chapters',
  description: 'Liệt kê danh sách các chương của tác phẩm.',
  kind: 'read',
  schema: v.object({}),
  parameters: targetOnly,
  targetPolicy: 'requires_target',
  handler: async ({ library, target }) => {
    if (!target) {
      return {
        ok: false,
        error: { code: 'validation', message: TARGET_NEEDED }
      }
    }
    try {
      const chapters = library.listChapters(target.workId)
      return {
        ok: true,
        value: chapters.map((c) => ({
          number: c.number,
          title: c.title,
          updatedAt: c.updatedAt
        }))
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'not_found',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  },
  describe: ({ target }) => `Đọc danh mục chương (${target?.workLabel ?? 'tác phẩm'})`
}

/** Translation tasks listed in one overview; the newest ones, so a long history stays short. */
const OVERVIEW_TASK_LIMIT = 10

/**
 * One call that tells the model where a work stands: size, translation progress, glossary and
 * addressing counts, and its translation tasks. It replaces a chain of single reads at the start of
 * a command like "dịch toàn bộ truyện". No chapter text and no glossary entries are returned.
 */
export function getWorkOverviewCapability(tasks?: {
  list(filter: { workId?: string }): AgentTaskSummary[]
  get(taskId: string): AgentTaskDetailView
}): CapabilityDefinition<Record<string, never>> {
  return {
    name: 'get_work_overview',
    description:
      'Tổng quan một tác phẩm trong một lần gọi: tên, ngôn ngữ, số chương, số chương đã dịch và chương đầu ' +
      'tiên chưa dịch, số mục glossary theo trạng thái, số cặp xưng hô và các tác vụ dịch. Gọi một lần ' +
      'thay cho nhiều lệnh đọc lẻ; target là handle tác phẩm hoặc chương.',
    kind: 'read',
    schema: v.object({}),
    parameters: targetOnly,
    targetPolicy: 'requires_target',
    handler: async ({ library, target }) => {
      if (!target) return { ok: false, error: { code: 'validation', message: TARGET_NEEDED } }
      try {
        const work = library.get(target.workId)
        const progress = library.translationProgress(target.workId)
        const counts = library.contextCounts(target.workId)
        const numbers = new Map(
          library.listChapters(target.workId).map((chapter) => [chapter.id, chapter.number])
        )
        const taskRows = (tasks?.list({ workId: target.workId }) ?? [])
          .slice(0, OVERVIEW_TASK_LIMIT)
          .map((summary) => {
            const chapterNumbers = (tasks?.get(summary.id).items ?? [])
              .map((item) => numbers.get(item.chapterId))
              .filter((n): n is number => n !== undefined)
            return {
              state: summary.state,
              reason: summary.reason,
              fromChapter: chapterNumbers.length > 0 ? Math.min(...chapterNumbers) : null,
              toChapter: chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : null,
              chapters: summary.counts
            }
          })
        return {
          ok: true,
          value: {
            title: work.title,
            sourceLang: work.sourceLang,
            chapterCount: progress.chapterCount,
            translatedChapters: progress.translatedChapters,
            untranslatedChapters: progress.chapterCount - progress.translatedChapters,
            firstUntranslatedChapter: progress.firstUntranslatedNumber,
            glossary: counts.glossary,
            addressingPairs: counts.addressingPairs,
            tasks: taskRows
          }
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'not_found',
            message: error instanceof Error ? error.message : String(error)
          }
        }
      }
    },
    describe: ({ target }) => `Đọc tổng quan "${target?.workLabel ?? 'tác phẩm'}"`
  }
}

interface ChapterPage {
  content: string
  rev: number
  totalChars: number
  nextOffset: number | null
}

export const readChapterCapability: CapabilityDefinition<{
  side?: 'source' | 'target' | 'both'
  offset?: number
}> = {
  name: 'read_chapter',
  description:
    'Đọc nội dung văn bản gốc hoặc bản dịch của một chương theo trang ' +
    `(tối đa ${READ_CHAPTER_PAGE} ký tự mỗi phía). Còn tiếp thì gọi lại với offset = nextOffset.`,
  kind: 'read',
  schema: v.object({
    side: v.optional(v.picklist(['source', 'target', 'both'])),
    offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)))
  }),
  parameters: {
    type: 'object',
    properties: {
      target: TARGET_PARAM,
      side: { type: 'string', enum: ['source', 'target', 'both'] },
      offset: { type: 'integer', minimum: 0, description: 'Ký tự bắt đầu, mặc định 0.' }
    },
    required: ['target']
  },
  targetPolicy: 'requires_target',
  handler: async ({ library, target, args }) => {
    if (!target || target.kind !== 'chapter') {
      return {
        ok: false,
        error: { code: 'validation', message: needsChapter('read_chapter', target) }
      }
    }
    const side = args.side ?? 'both'
    const offset = args.offset ?? 0
    return library.withWork(target.workId, (workDb) => {
      const page = (which: 'source' | 'target'): ChapterPage => {
        const text = readText(workDb, target.chapterId, which)
        const end = offset + READ_CHAPTER_PAGE
        return {
          content: text.content.slice(offset, end),
          rev: text.rev,
          totalChars: text.content.length,
          nextOffset: end < text.content.length ? end : null
        }
      }
      const result: { source?: ChapterPage; target?: ChapterPage } = {}
      if (side === 'source' || side === 'both') result.source = page('source')
      if (side === 'target' || side === 'both') result.target = page('target')
      return { ok: true, value: result }
    })
  },
  describe: ({ target }) =>
    `Đọc nội dung chương "${target?.kind === 'chapter' ? target.chapterLabel : ''}"`
}

export const readSegmentsCapability: CapabilityDefinition<{ side: 'source' | 'target' }> = {
  name: 'read_segments',
  description: 'Đọc danh sách các đoạn (segments) của chương.',
  kind: 'read',
  schema: v.object({
    side: v.picklist(['source', 'target'])
  }),
  parameters: {
    type: 'object',
    properties: { target: TARGET_PARAM, side: { type: 'string', enum: ['source', 'target'] } },
    required: ['target', 'side']
  },
  targetPolicy: 'requires_target',
  handler: async ({ library, target, args }) => {
    if (target?.kind !== 'chapter') {
      return {
        ok: false,
        error: { code: 'validation', message: needsChapter('read_segments', target) }
      }
    }
    return library.withWork(target.workId, (workDb) => {
      const text = readText(workDb, target.chapterId, args.side)
      return {
        ok: true,
        value: text.segments.map((s) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          textRev: s.textRev,
          status: s.status
        }))
      }
    })
  },
  describe: ({ target, args }) =>
    `Đọc các đoạn (${args.side}) của chương "${target?.kind === 'chapter' ? target.chapterLabel : ''}"`
}

export const searchWorkCapability: CapabilityDefinition<{
  query: string
  side?: 'source' | 'target'
}> = {
  name: 'search_work',
  description: 'Tìm kiếm chuỗi văn bản trong toàn bộ các chương của tác phẩm.',
  kind: 'read',
  schema: v.object({
    query: v.pipe(v.string(), v.minLength(1)),
    side: v.optional(v.picklist(['source', 'target']))
  }),
  parameters: {
    type: 'object',
    properties: {
      target: TARGET_PARAM,
      query: { type: 'string', minLength: 1 },
      side: { type: 'string', enum: ['source', 'target'] }
    },
    required: ['target', 'query']
  },
  targetPolicy: 'requires_target',
  handler: async ({ library, target, args }) => {
    if (!target) {
      return {
        ok: false,
        error: { code: 'validation', message: TARGET_NEEDED }
      }
    }
    const side = args.side ?? 'source'
    const q = args.query.toLowerCase()
    const chapters = new Map(library.listChapters(target.workId).map((c) => [c.id, c]))
    return library.withWork(target.workId, (workDb) => {
      const sideContents = readSideContents(workDb, side)
      const matches: Array<{ chapterNumber: number; chapterTitle: string; snippet: string }> = []
      for (const [chapterId, content] of sideContents) {
        const idx = content.toLowerCase().indexOf(q)
        const chapter = chapters.get(chapterId)
        if (idx !== -1 && chapter) {
          const from = Math.max(0, idx - 30)
          const to = Math.min(content.length, idx + q.length + 30)
          matches.push({
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            snippet: content.slice(from, to)
          })
        }
      }
      matches.sort((a, b) => a.chapterNumber - b.chapterNumber)
      return { ok: true, value: { matches, totalMatches: matches.length } }
    })
  },
  describe: ({ target, args }) =>
    `Tìm kiếm "${args.query}" trong "${target?.workLabel ?? 'tác phẩm'}"`
}

/** Chapter number of a range end, or null when the entry is not limited on that side. */
const chapterNumberOf = (
  numbers: ReadonlyMap<string, number>,
  chapterId: string | null
): number | null => (chapterId === null ? null : (numbers.get(chapterId) ?? null))

export const listGlossaryCapability: CapabilityDefinition<Record<string, never>> = {
  name: 'list_glossary',
  description:
    'Đọc bảng thuật ngữ đã duyệt. Với handle chương: các mục hiệu lực cho chương đó. Với handle tác phẩm: ' +
    'mọi mục đã duyệt của tác phẩm, kèm dải chương (fromChapter, toChapter) nếu mục chỉ áp dụng một đoạn truyện.',
  kind: 'read',
  schema: v.object({}),
  parameters: targetOnly,
  targetPolicy: 'requires_target',
  handler: async ({ library, target }) => {
    if (!target) {
      return { ok: false, error: { code: 'validation', message: TARGET_NEEDED } }
    }
    if (target.kind === 'work') {
      const numbers = new Map(library.listChapters(target.workId).map((c) => [c.id, c.number]))
      return {
        ok: true,
        value: library.listApprovedGlossary(target.workId).map((entry) => ({
          source: entry.source,
          target: entry.target,
          aliases: entry.aliases,
          forbidden: entry.forbidden,
          notes: entry.notes,
          fromChapter: chapterNumberOf(numbers, entry.fromChapterId),
          toChapter: chapterNumberOf(numbers, entry.toChapterId)
        }))
      }
    }
    const entries = library.getEffectiveGlossary(target.workId, target.chapterId)
    return { ok: true, value: entries }
  },
  describe: ({ target }) =>
    target?.kind === 'chapter'
      ? `Đọc thuật ngữ chương "${target.chapterLabel}"`
      : `Đọc thuật ngữ "${target?.workLabel ?? 'tác phẩm'}"`
}

export const listAddressingCapability: CapabilityDefinition<Record<string, never>> = {
  name: 'list_addressing',
  description:
    'Đọc các cặp xưng hô đã duyệt. Với handle chương: các cặp hiệu lực cho chương đó. Với handle tác phẩm: ' +
    'mọi cặp đã duyệt của tác phẩm, kèm dải chương (fromChapter, toChapter) mà cặp có hiệu lực.',
  kind: 'read',
  schema: v.object({}),
  parameters: targetOnly,
  targetPolicy: 'requires_target',
  handler: async ({ library, target }) => {
    if (!target) {
      return { ok: false, error: { code: 'validation', message: TARGET_NEEDED } }
    }
    if (target.kind === 'work') {
      const numbers = new Map(library.listChapters(target.workId).map((c) => [c.id, c.number]))
      return {
        ok: true,
        value: library.listApprovedAddressing(target.workId).map((dyad) => ({
          speaker: dyad.sourceCharacter.target,
          recipient: dyad.targetCharacter.target,
          speakerPronoun: dyad.speakerPronoun,
          recipientPronoun: dyad.recipientPronoun,
          secondPerson: dyad.secondPerson ?? null,
          formality: dyad.formality,
          notes: dyad.notes,
          fromChapter: chapterNumberOf(numbers, dyad.fromChapterId),
          toChapter: chapterNumberOf(numbers, dyad.toChapterId)
        }))
      }
    }
    const dyads = library.getEffectiveAddressing(target.workId, target.chapterId)
    return { ok: true, value: dyads }
  },
  describe: ({ target }) =>
    target?.kind === 'chapter'
      ? `Đọc xưng hô chương "${target.chapterLabel}"`
      : `Đọc xưng hô "${target?.workLabel ?? 'tác phẩm'}"`
}

export const askQuestionsCapability: CapabilityDefinition<{
  questions: AgentQuestion[]
  allowSkip?: boolean
}> = {
  name: 'ask_questions',
  description:
    'Hỏi người dùng 1–5 câu trong một lần khi cần làm rõ yêu cầu hoặc cần họ chọn hướng xử lý. Mỗi câu chọn một ' +
    '(single), chọn nhiều (multi) hoặc nhập chữ (text); câu chọn có 2–9 lựa chọn. Đặt default cho phương án ' +
    'bạn đề xuất: Autopilot trả lời bằng nó. Kết quả là đáp án theo nhãn, hoặc skipped khi người dùng bỏ qua.',
  kind: 'read',
  schema: askQuestionsArgsSchema,
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: AGENT_QUESTION_LIMIT,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID ngắn, duy nhất trong lần hỏi, ví dụ "style".' },
            title: { type: 'string', description: 'Câu hỏi ngắn gọn.' },
            description: { type: 'string', description: 'Giải thích thêm nếu cần.' },
            type: { type: 'string', enum: [...AGENT_QUESTION_TYPES] },
            options: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: AGENT_OPTION_LIMIT,
              description: 'Nhãn các lựa chọn, bắt buộc với single và multi.'
            },
            default: {
              description: 'Nhãn lựa chọn đề xuất (danh sách nhãn với multi).',
              anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
            },
            allowFreeText: {
              type: 'boolean',
              description: 'Cho người dùng gõ câu trả lời khác ngoài các lựa chọn.'
            },
            required: { type: 'boolean', description: 'Mặc định true.' }
          },
          required: ['id', 'title', 'type']
        }
      },
      allowSkip: {
        type: 'boolean',
        description: 'Cho người dùng bỏ qua cả lần hỏi; mặc định true.'
      }
    },
    required: ['questions']
  },
  targetPolicy: 'no_target',
  handler: async () => ({ ok: true, value: {} }),
  describe: ({ args }) => {
    const questions = (args as { questions?: Array<{ title?: string }> }).questions ?? []
    return questions.length > 1
      ? `Hỏi ${questions.length} câu`
      : `Hỏi "${questions[0]?.title ?? ''}"`
  }
}

export const runSubagentCapability: CapabilityDefinition<{
  task: string
  description: string
}> = {
  name: 'run_subagent',
  description:
    'Ủy quyền cho một Subagent độc lập thực hiện nhiệm vụ nghiên cứu, đối chiếu hoặc tìm kiếm chuyên sâu trong tác phẩm mà không làm tràn ngữ cảnh của phiên chính. Subagent chỉ trả về bản tóm tắt kết quả.',
  kind: 'read',
  schema: v.object({
    task: v.pipe(v.string(), v.minLength(1, 'task không được để trống.')),
    description: v.pipe(v.string(), v.minLength(1, 'description không được để trống.'))
  }),
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          'Chỉ dẫn chi tiết, rõ ràng và đầy đủ cho subagent thực hiện tự trị và trả về kết quả tóm tắt.'
      },
      description: {
        type: 'string',
        description: 'Mô tả ngắn gọn (3-7 từ) về nhiệm vụ để hiển thị trên giao diện.'
      }
    },
    required: ['task', 'description']
  },
  targetPolicy: 'no_target',
  handler: async () => ({ ok: true, value: {} }),
  describe: ({ args }) =>
    `Chạy subagent: ${(args as { description?: string }).description ?? 'Nhiệm vụ phụ'}`
}

export const defaultReadCapabilities: CapabilityDefinition[] = [
  listWorksCapability,
  listChaptersCapability,
  readChapterCapability,
  readSegmentsCapability,
  searchWorkCapability,
  listGlossaryCapability,
  listAddressingCapability,
  askQuestionsCapability,
  runSubagentCapability
]
