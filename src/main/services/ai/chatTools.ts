import type { AddressingDyadResolved } from '../../../shared/contracts/addressing'
import type { ChapterItem } from '../../../shared/contracts/chapters'
import type { ChatLocation, ChatToolProposal } from '../../../shared/contracts/aiChat'
import {
  TERM_NOTES_MAX,
  TERM_TEXT_MAX,
  type ContextEntryItem
} from '../../../shared/contracts/glossary'
import type { LinkRecord } from '../../../shared/contracts/links'
import type { TextRecord, TextSide } from '../../../shared/contracts/text'
import {
  SEARCH_QUERY_MAX,
  SEARCH_RESULTS_MAX,
  alignmentOf,
  counterpartOf,
  hitsIn,
  type SearchHit
} from './chatSearch'
import {
  decodeCursor,
  encodeCursor,
  formatCount,
  paragraphAt,
  readPage,
  splitParagraphs,
  type ParagraphSpan
} from './chatToolText'
import { addressingLines, approvedDyads, glossaryLines } from './translate/translatePrompt'

/**
 * Các công cụ AI có thể dùng để tra cứu dữ liệu và đề xuất sửa đổi.
 *
 * Nguyên tắc bất biến: tool chỉ được đọc, được trỏ và được đề xuất; chỉ người dùng
 * mới có quyền áp dụng vào văn bản. Các công cụ đọc không làm thay đổi dữ liệu.
 * Các công cụ ghi chỉ tạo đề xuất chờ duyệt hoặc thêm thuật ngữ mới (có hiệu lực ngay); không công
 * cụ nào tự ý thay đổi văn bản của chương hay sửa thuật ngữ đã có.
 *
 * Phạm vi hoạt động gắn chặt với tác phẩm (`workId`) và chương hiện tại mà người dùng đang mở.
 */

/** Các phần của kho lưu trữ mà các công cụ có quyền đọc. */
export interface ChatToolLibrary {
  listChapters(workId: string): ChapterItem[]
  readText(workId: string, chapterId: string, side: TextSide): TextRecord
  /** Các liên kết gióng hàng của chương: phương tiện duy nhất để đối chiếu hai phía của đoạn văn. */
  listLinks(workId: string, chapterId: string): LinkRecord[]
  /** Đọc nội dung một phía của toàn bộ các chương trong một lần đọc để tối ưu tìm kiếm. */
  readSideContents?(workId: string, side: TextSide): Map<string, string>
  /** Thuật ngữ ngữ cảnh của tác phẩm; công cụ chỉ giữ lại các mục đã duyệt. */
  listGlossary?(workId: string): ContextEntryItem[]
  /** Cặp xưng hô có hiệu lực tại chương; công cụ chỉ giữ lại các mục đã duyệt. */
  listAddressing?(workId: string, chapterId: string): AddressingDyadResolved[]
}

/** Đề xuất chỉnh sửa văn bản do công cụ ghi tạo ra, neo vào bản sửa đổi hiện tại. */
export interface ToolProposalInput {
  turnId: string
  chapterId: string
  /** Định danh lệnh dạng `turnId:n` để tránh tạo trùng đề xuất khi gọi lại. */
  commandId: string
  sourceRev: number
  sourceContent: string
  targetBaseRev: number
  targetBaseContent: string
  part: {
    baseFrom: number | null
    baseTo: number | null
    beforeText: string
    afterText: string
    sourceOrder: number | null
    sourceText: string | null
    status: 'pending' | 'needs-placement'
  }
}

/**
 * Các quyền ghi duy nhất của công cụ: tạo đề xuất hoặc thêm thuật ngữ.
 * Nếu không có, các công cụ ghi sẽ thông báo không khả dụng.
 */
export interface ChatToolWrites {
  createProposal(
    workId: string,
    input: ToolProposalInput
  ): { proposalId: string; partIds: string[] }
  createTerm(
    workId: string,
    input: { term: string; translation: string; variants: string[]; note: string | null }
  ): { entryId: string }
}

/** Phạm vi của lượt hội thoại: vị trí hiện tại của người dùng và lượt mà đề xuất thuộc về. */
export interface ChatTurnScope {
  chapterId: string
  location: ChatLocation
  turnId: string
  writes?: ChatToolWrites
}

/** Yêu cầu gọi tool từ model gửi về. */
export interface ToolCall {
  id: string
  name: string
  /** Tham số JSON thô từ model, cần xử lý an toàn phòng trường hợp sai định dạng. */
  args: string
}

export interface ToolResult {
  id: string
  name: string
  /** Tóm tắt một dòng hiển thị trên giao diện: tóm tắt thao tác đọc hoặc đề xuất. */
  detail: string
  /** Nội dung phản hồi gửi lại cho model. */
  content: string
  status: 'ok' | 'error'
  /** Gắn kèm khi công cụ ghi tạo ra đề xuất mới. */
  proposal?: ChatToolProposal
  /** Số ký tự tiêu tốn vào ngân sách của lượt hội thoại. */
  charge?: number
}

/** Độ dài văn bản tối đa cho một lần đọc; chương dài hơn sẽ đọc theo trang. */
export const TOOL_TEXT_MAX = 20_000
/** Số lượng mục thuật ngữ tối đa trả về cho một lần tra cứu. */
export const GLOSSARY_LIMIT_MAX = 50
/** Số lượng đề xuất tối đa một lượt hội thoại có thể tạo ra. */
export const MAX_PROPOSALS_PER_TURN = 10

const PARAGRAPH_RULE = 'Một đoạn là một dòng không trống, đếm từ 1 như read_chapter.'

/**
 * Danh sách định nghĩa công cụ gửi cho nhà cung cấp theo định dạng OpenAI.
 *
 * `get_current_chapter` đứng đầu tiên để model tra cứu vị trí người dùng trước khi phỏng đoán.
 * Các công cụ ghi nêu rõ trong mô tả rằng chúng chỉ tạo đề xuất chứ không tự ý sửa đổi.
 */
export const CHAT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_current_chapter',
      description:
        'Cho biết người dùng đang mở chương nào, con trỏ ở đoạn nào, đang chọn những đoạn nào, mỗi phía có bao nhiêu đoạn và chương đã được dịch tới đâu. Không trả văn bản. Gọi trước tiên khi câu hỏi nói "chương này", "đoạn này".',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_chapters',
      description:
        'Liệt kê các chương của tác phẩm đang mở: số thứ tự, tên, đã có bản gốc chưa, đã có bản dịch chưa. Dùng khi cần biết tác phẩm có những chương nào.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_chapter',
      description:
        'Đọc văn bản của một chương trong tác phẩm đang mở, theo trang. Chỉ đọc, không sửa được gì. Mỗi lần trả tối đa một trang, kèm vị trí (đoạn từ–đến trên tổng) và con trỏ nếu còn tiếp. Đọc tiếp bằng cách gửi lại con trỏ; muốn bắt đầu ở một đoạn thì dùng from_paragraph. ' +
        PARAGRAPH_RULE,
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'integer', description: 'Số thứ tự chương, bắt đầu từ 1.' },
          side: {
            type: 'string',
            enum: ['source', 'target'],
            description: 'source là bản gốc, target là bản dịch.'
          },
          from_paragraph: {
            type: 'integer',
            description: 'Đoạn bắt đầu, tính từ 1. Không dùng cùng cursor.'
          },
          cursor: {
            type: 'string',
            description: 'Con trỏ đọc tiếp do lần đọc trước trả về; chép nguyên văn.'
          }
        },
        required: ['chapter', 'side']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_segments',
      description:
        'Đọc một khoảng đoạn của một chương, mỗi đoạn kèm đoạn tương ứng ở phía kia theo liên kết căn chỉnh. Đoạn chưa căn chỉnh được ghi rõ. Dùng để xem đoạn gốc và đoạn dịch của cùng một chỗ, ví dụ đoạn người dùng đang chọn. ' +
        PARAGRAPH_RULE,
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'integer', description: 'Số thứ tự chương, bắt đầu từ 1.' },
          from: { type: 'integer', description: 'Đoạn đầu, tính từ 1.' },
          to: { type: 'integer', description: 'Đoạn cuối, tính cả đoạn này.' },
          side: {
            type: 'string',
            enum: ['source', 'target'],
            description: 'Phía mà from và to đếm theo: source là bản gốc, target là bản dịch.'
          }
        },
        required: ['chapter', 'from', 'to', 'side']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_work',
      description:
        'Tìm một chuỗi trong mọi chương của tác phẩm đang mở, ở bản gốc hoặc bản dịch. Trả số chỗ khớp, chương, số đoạn và đoạn trích; kèm đoạn tương ứng ở phía kia khi có liên kết căn chỉnh. Dùng để tra một tên hay thuật ngữ đã được dịch thế nào ở chương khác.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Chuỗi cần tìm, 1–100 ký tự. Chữ CJK không cần dấu cách.'
          },
          side: {
            type: 'string',
            enum: ['source', 'target'],
            description: 'source là tìm trong bản gốc, target là tìm trong bản dịch.'
          }
        },
        required: ['query', 'side']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_glossary',
      description:
        'Tra glossary đã duyệt của tác phẩm: từ gốc, biến thể, bản dịch bắt buộc, ghi chú. Bản dịch nào bạn viết ra cũng phải theo các mục này.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Chỉ lấy mục có chuỗi này ở từ gốc, biến thể hoặc bản dịch. Bỏ trống để lấy tất cả.'
          },
          limit: { type: 'integer', description: `Số mục tối đa, 1–${GLOSSARY_LIMIT_MAX}.` }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_addressing',
      description:
        'Tra cách xưng hô đã duyệt giữa các cặp nhân vật, có hiệu lực ở chương đang mở. Dùng khi dịch hay soát lời thoại.',
      parameters: {
        type: 'object',
        properties: {
          character: {
            type: 'string',
            description: 'Chỉ lấy các cặp có nhân vật mang tên này (tên gốc hoặc tên dịch).'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_edit',
      description:
        'ĐỀ XUẤT thay một khoảng đoạn của bản dịch chương đang mở. Chỉ tạo đề xuất chờ người dùng duyệt; bản dịch chưa đổi cho tới khi họ chấp nhận. Văn bản mới thay cho cả khoảng; mỗi dòng là một đoạn. Đọc các đoạn đó trước khi đề xuất. Gộp các đoạn liền nhau vào một đề xuất. ' +
        PARAGRAPH_RULE,
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'integer', description: 'Số thứ tự của chương đang mở.' },
          from: { type: 'integer', description: 'Đoạn đầu của bản dịch, tính từ 1.' },
          to: { type: 'integer', description: 'Đoạn cuối của bản dịch, tính cả đoạn này.' },
          text: { type: 'string', description: 'Văn bản thay thế, mỗi dòng một đoạn.' },
          note: { type: 'string', description: 'Một câu ngắn: sửa gì và vì sao.' }
        },
        required: ['chapter', 'from', 'to', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_translation',
      description:
        'ĐỀ XUẤT bản dịch cho một khoảng đoạn bản gốc của chương đang mở mà chưa có bản dịch liên kết. Chỉ tạo đề xuất chờ duyệt. text phải có đúng một dòng cho mỗi đoạn gốc trong khoảng, theo thứ tự. Đoạn đã có bản dịch thì dùng propose_edit. ' +
        PARAGRAPH_RULE,
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'integer', description: 'Số thứ tự của chương đang mở.' },
          from: { type: 'integer', description: 'Đoạn đầu của bản gốc, tính từ 1.' },
          to: { type: 'integer', description: 'Đoạn cuối của bản gốc, tính cả đoạn này.' },
          text: { type: 'string', description: 'Bản dịch, mỗi dòng một đoạn gốc.' }
        },
        required: ['chapter', 'from', 'to', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_glossary_term',
      description:
        'Thêm một thuật ngữ mới vào glossary. Mục mới có hiệu lực ngay cho các lượt dịch sau; không sửa mục đã có.',
      parameters: {
        type: 'object',
        properties: {
          term: { type: 'string', description: 'Từ gốc, như trong bản gốc.' },
          translation: { type: 'string', description: 'Bản dịch đề xuất.' },
          variants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Các cách viết khác của từ gốc.'
          },
          note: { type: 'string', description: 'Vì sao dịch như vậy.' }
        },
        required: ['term', 'translation']
      }
    }
  }
] as const

/** A tool answer the model can act on; failures come back as text, not as thrown errors. */
function failed(call: ToolCall, message: string): ToolResult {
  return {
    id: call.id,
    name: call.name,
    detail: message,
    content: 'LỖI: ' + message,
    status: 'error'
  }
}

function readArgs(call: ToolCall): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(call.args === '' ? '{}' : call.args)
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const sideName = (side: TextSide): string => (side === 'source' ? 'bản gốc' : 'bản dịch')
const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)
const span = (from: number, to: number): string =>
  from === to ? `đoạn ${from}` : `đoạn ${from}–${to}`

/** Từng dòng không trống do model viết, mỗi dòng là một đoạn văn bản. */
function paragraphsOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** Chuỗi phân tách giữa các đoạn văn bản trong `content` (mặc định là `\n\n`). */
function separatorOf(content: string, spans: ParagraphSpan[]): string {
  return spans.length > 1 ? content.slice(spans[0].lineEnd, spans[1].lineStart) : '\n\n'
}

export interface ToolRunOptions {
  /**
   * Số ký tự còn lại mà lượt hội thoại có thể dùng cho tool.
   */
  remainingChars?: number
  /** Tổng ngân sách ký tự của lượt hội thoại. */
  turnBudget?: number
}

export interface ChatToolRunner {
  run(call: ToolCall, options?: ToolRunOptions): ToolResult
}

/** Phản hồi trả về khi lượt hội thoại đã sử dụng hết ngân sách ký tự đọc. */
export function budgetSpent(call: ToolCall, budget: number): ToolResult {
  const message = `Hết ngân sách đọc của lượt (${formatCount(budget)} ký tự)`
  return {
    id: call.id,
    name: call.name,
    detail: message,
    content:
      message +
      '. Không đọc thêm được trong lượt này; hãy trả lời bằng những gì đã đọc và nói rõ phần chưa đọc.',
    status: 'error'
  }
}

const READING = new Set([
  'read_chapter',
  'search_work',
  'read_segments',
  'list_glossary',
  'list_addressing'
])
const WRITING = new Set(['propose_edit', 'propose_translation', 'propose_glossary_term'])

export function createChatTools(
  library: ChatToolLibrary,
  workId: string,
  scope?: ChatTurnScope
): ChatToolRunner {
  /** Bản sửa đổi gần nhất của từng phía văn bản chương được đọc trong lượt này; từ chối ghi đè lên bản cũ. */
  const readAt = new Map<string, number>()
  const noteRead = (chapterId: string, side: TextSide, rev: number): void => {
    readAt.set(chapterId + ':' + side, rev)
  }
  let proposals = 0
  /** Số lệnh gọi ghi đã thực hiện, dùng đánh số định danh lệnh `turnId:n`. */
  let writeCount = 0

  function chapterByNumber(call: ToolCall, number: unknown): ChapterItem | ToolResult {
    if (!isInteger(number))
      return failed(call, 'Thiếu số chương, hoặc số chương không phải số nguyên.')
    const chapters = library.listChapters(workId)
    const chapter = chapters.find((entry) => entry.number === number)
    return (
      chapter ??
      failed(call, 'Không có chương số ' + number + '. Tác phẩm có ' + chapters.length + ' chương.')
    )
  }

  function readSide(args: Record<string, unknown>): TextSide | null {
    return args.side === 'source' || args.side === 'target' ? args.side : null
  }

  function getCurrentChapter(call: ToolCall): ToolResult {
    if (!scope) return failed(call, 'Lượt này không có vị trí người dùng.')
    const chapter = library.listChapters(workId).find((entry) => entry.id === scope.chapterId)
    if (!chapter) return failed(call, 'Chương đang mở không còn trong tác phẩm.')
    const source = library.readText(workId, chapter.id, 'source')
    const target = library.readText(workId, chapter.id, 'target')
    const sourceSpans = splitParagraphs(source.content)
    const targetSpans = splitParagraphs(target.content)
    const linked = alignmentOf(
      source,
      target,
      library.listLinks(workId, chapter.id)
    ).linkedSources()
    const translated = new Set<number>()
    for (const segment of source.segments) {
      if (linked.has(segment.id) && sourceSpans.length > 0) {
        translated.add(paragraphAt(sourceSpans, segment.start))
      }
    }
    const { caret, selection } = scope.location
    const carets = [
      caret.source === null ? null : `đoạn ${caret.source} bản gốc`,
      caret.target === null ? null : `đoạn ${caret.target} bản dịch`
    ].filter((part) => part !== null)
    const lines = [
      `Chương ${chapter.number} «${chapter.title}» là chương đang mở.`,
      `Bản gốc: ${sourceSpans.length} đoạn (rev ${source.rev}). Bản dịch: ${targetSpans.length} đoạn (rev ${target.rev}).`,
      `Đã dịch (có liên kết căn chỉnh): ${translated.size}/${sourceSpans.length} đoạn gốc.`,
      'Con trỏ: ' + (carets.length > 0 ? carets.join(', ') : 'chưa đặt') + '.',
      'Vùng chọn: ' +
        (selection === null
          ? 'không có.'
          : `${span(selection.from, selection.to)} ${sideName(selection.side)}.`)
    ]
    return {
      id: call.id,
      name: call.name,
      detail: `Chương ${chapter.number} · vị trí người dùng`,
      content: lines.join('\n'),
      status: 'ok'
    }
  }

  function listChapters(call: ToolCall): ToolResult {
    const chapters = library.listChapters(workId)
    const lines = chapters.map(
      (chapter) =>
        chapter.number +
        '. ' +
        chapter.title +
        ' — bản gốc: ' +
        (chapter.hasSource ? 'có' : 'chưa') +
        ', bản dịch: ' +
        (chapter.hasTarget ? 'có' : 'chưa')
    )
    return {
      id: call.id,
      name: call.name,
      detail: 'Liệt kê ' + chapters.length + ' chương',
      content: lines.length === 0 ? 'Tác phẩm chưa có chương nào.' : lines.join('\n'),
      status: 'ok'
    }
  }

  function readChapter(call: ToolCall, limit: number): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')

    const found = chapterByNumber(call, args.chapter)
    if ('content' in found) return found
    const chapter = found
    const side = readSide(args)
    if (side === null) return failed(call, 'Tham số side phải là "source" hoặc "target".')
    const from = args.from_paragraph
    const cursorText = args.cursor
    if (from !== undefined && cursorText !== undefined) {
      return failed(call, 'Chỉ dùng một trong from_paragraph hoặc cursor.')
    }
    if (from !== undefined && (!isInteger(from) || from < 1)) {
      return failed(call, 'from_paragraph phải là số nguyên từ 1.')
    }

    const label = 'Chương ' + chapter.number + ' · ' + sideName(side)
    const record = library.readText(workId, chapter.id, side)
    noteRead(chapter.id, side, record.rev)
    const spans = splitParagraphs(record.content)
    if (spans.length === 0) {
      return {
        id: call.id,
        name: call.name,
        detail: label + ' — trống',
        content: label + ' chưa có nội dung.',
        status: 'ok'
      }
    }

    let paragraph = typeof from === 'number' ? from : 1
    let offset = 0
    let warning = ''
    if (cursorText !== undefined) {
      const cursor = typeof cursorText === 'string' ? decodeCursor(cursorText) : null
      if (cursor === null || cursor.chapter !== chapter.number || cursor.side !== side) {
        return failed(
          call,
          'Con trỏ không hợp lệ cho ' +
            label.toLowerCase() +
            '. Đọc lại bằng from_paragraph (chương có ' +
            spans.length +
            ' đoạn).'
        )
      }
      paragraph = cursor.paragraph
      offset = cursor.offset
      if (cursor.rev !== record.rev) {
        // A small edit is the usual case: carry on from the same paragraph instead of starting over.
        offset = 0
        warning =
          `Văn bản đã đổi kể từ lần đọc trước (rev ${cursor.rev} → ${record.rev}); đọc lại từ đầu ` +
          `đoạn ${cursor.paragraph}, vị trí có thể lệch.\n`
      }
    }
    if (paragraph > spans.length) {
      return failed(call, `${label} có ${spans.length} đoạn; không có đoạn ${paragraph}.`)
    }
    const spanLength = spans[paragraph - 1].end - spans[paragraph - 1].start
    if (offset >= spanLength) {
      return failed(
        call,
        'Con trỏ trỏ ra ngoài đoạn ' + paragraph + '. Đọc lại bằng from_paragraph.'
      )
    }

    const page = readPage(record.content, spans, paragraph, offset, limit)
    const range = `đoạn ${page.fromParagraph}–${page.toParagraph}/${page.total}`
    const size = `${formatCount(page.text.length)} ký tự`
    const next =
      page.next === null
        ? null
        : encodeCursor({
            chapter: chapter.number,
            side,
            paragraph: page.next.paragraph,
            offset: page.next.offset,
            rev: record.rev
          })
    const state =
      next === null
        ? 'hết chương'
        : (page.cutInParagraph ? `đoạn ${page.toParagraph} chưa hết, ` : '') +
          'còn tiếp, con trỏ: ' +
          next
    return {
      id: call.id,
      name: call.name,
      detail: `${label} — ${range}, ${size}, ${next === null ? 'hết chương' : 'còn tiếp'}`,
      content: `${warning}${label} · rev ${record.rev} · ${range} · ${size} · ${state}\n${page.text}`,
      status: 'ok'
    }
  }

  function readSegments(call: ToolCall, limit: number): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    const found = chapterByNumber(call, args.chapter)
    if ('content' in found) return found
    const chapter = found
    const side = readSide(args)
    if (side === null) return failed(call, 'Tham số side phải là "source" hoặc "target".')
    const { from, to } = args
    if (!isInteger(from) || !isInteger(to) || from < 1 || to < from) {
      return failed(call, 'from và to phải là số nguyên, 1 ≤ from ≤ to.')
    }

    const source = library.readText(workId, chapter.id, 'source')
    const target = library.readText(workId, chapter.id, 'target')
    noteRead(chapter.id, 'source', source.rev)
    noteRead(chapter.id, 'target', target.rev)
    const here = side === 'source' ? source : target
    const spans = splitParagraphs(here.content)
    const label = `Chương ${chapter.number} · ${sideName(side)}`
    if (to > spans.length) {
      return failed(call, `${label} có ${spans.length} đoạn; không có ${span(from, to)}.`)
    }

    const alignment = alignmentOf(source, target, library.listLinks(workId, chapter.id))
    const other = sideName(side === 'source' ? 'target' : 'source')
    const header = `${label} · rev ${here.rev} · ${span(from, to)}/${spans.length}`
    const blocks: string[] = []
    let used = header.length
    let last = from - 1
    for (let paragraph = from; paragraph <= to; paragraph++) {
      const line = spans[paragraph - 1]
      const text = here.content.slice(line.lineStart, line.lineEnd)
      const counterpart = alignment.counterpart(side, line.lineStart, line.lineEnd)
      const pair =
        counterpart.kind === 'linked'
          ? `   ${other}${counterpart.uncertain ? ' (liên kết chưa chắc đúng)' : ''}${counterpart.partial ? ' (một phần chưa căn chỉnh)' : ''}: ` +
            counterpart.texts.join(' ')
          : `   ${other}: chưa căn chỉnh.`
      const block = `[${paragraph}] ${text}\n${pair}`
      // Stop on a paragraph bound rather than cut one in half; the first one always goes.
      if (paragraph > from && used + block.length + 1 > limit) break
      blocks.push(block)
      used += block.length + 1
      last = paragraph
    }
    const cut =
      last < to ? `\n(Dừng ở đoạn ${last} vì trần ký tự; đọc tiếp từ đoạn ${last + 1}.)` : ''
    return {
      id: call.id,
      name: call.name,
      detail: `${label} — ${span(from, last)} kèm đoạn tương ứng`,
      content: [header, ...blocks].join('\n') + cut,
      status: 'ok'
    }
  }

  function searchWork(call: ToolCall, budget: number): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    const side = readSide(args)
    if (side === null) return failed(call, 'Tham số side phải là "source" hoặc "target".')
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (query.length < 1 || query.length > SEARCH_QUERY_MAX) {
      return failed(call, `Chuỗi tìm phải dài 1–${SEARCH_QUERY_MAX} ký tự sau khi bỏ khoảng trắng.`)
    }

    const chapters = library.listChapters(workId)
    const hits: SearchHit[] = []
    const matched = new Set<number>()
    const contents = library.readSideContents?.(workId, side)
    for (const chapter of chapters) {
      const content = contents
        ? (contents.get(chapter.id) ?? '')
        : library.readText(workId, chapter.id, side).content
      const found = hitsIn(chapter, content, query)
      if (found.length > 0) matched.add(chapter.number)
      hits.push(...found)
    }
    const label = `Tìm "${query}" · ${sideName(side)}`
    if (hits.length === 0) {
      return {
        id: call.id,
        name: call.name,
        detail: `${label} — không có chỗ khớp`,
        content: `${label}: không có chỗ khớp trong ${chapters.length} chương.`,
        status: 'ok'
      }
    }

    // Chỉ đọc liên kết cho các chương có kết quả hiển thị để tránh lãng phí hiệu năng.
    const shown = hits.slice(0, SEARCH_RESULTS_MAX)
    const sides = new Map<string, { source: TextRecord; target: TextRecord; links: LinkRecord[] }>()
    const otherSide = sideName(side === 'source' ? 'target' : 'source')
    const lines = shown.map((hit, index) => {
      let pair = sides.get(hit.chapterId)
      if (!pair) {
        pair = {
          source: library.readText(workId, hit.chapterId, 'source'),
          target: library.readText(workId, hit.chapterId, 'target'),
          links: library.listLinks(workId, hit.chapterId)
        }
        sides.set(hit.chapterId, pair)
      }
      const counterpart = counterpartOf(side, hit.offset, pair.source, pair.target, pair.links)
      const other =
        counterpart.kind === 'linked'
          ? `   ${otherSide}${counterpart.uncertain ? ' (liên kết chưa chắc đúng)' : ''}: ` +
            counterpart.texts.join(' ')
          : `   ${otherSide}: chưa căn chỉnh — đọc ${otherSide} chương ${hit.chapter} bằng read_chapter.`
      return (
        `${index + 1}. Chương ${hit.chapter} «${hit.title}» · đoạn ${hit.paragraph}: ${hit.excerpt}\n` +
        other
      )
    })

    const dropped = hits.length - shown.length
    const header =
      `${label}: ${formatCount(hits.length)} chỗ khớp ở ${matched.size}/${chapters.length} chương` +
      (dropped > 0
        ? `; trả ${shown.length}, bỏ ${formatCount(dropped)} — thu hẹp chuỗi tìm để xem phần còn lại.`
        : '.')
    // Giữ trong ngân sách lượt bằng cách giảm số lượng kết quả thay vì cắt ngang một kết quả.
    let kept = lines.length
    const size = (count: number): number =>
      header.length + lines.slice(0, count).reduce((sum, line) => sum + line.length + 1, 0)
    while (kept > 1 && size(kept) > budget) kept--
    const trimmed =
      kept < lines.length ? `\n(Chỉ hiện ${kept} kết quả vì gần hết ngân sách đọc của lượt.)` : ''
    return {
      id: call.id,
      name: call.name,
      detail: `${label} — ${formatCount(hits.length)} chỗ ở ${matched.size} chương, trả ${kept}`,
      content: [header, ...lines.slice(0, kept)].join('\n') + trimmed,
      status: 'ok'
    }
  }

  function listGlossary(call: ToolCall, budget: number): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    if (!library.listGlossary) return failed(call, 'Không đọc được glossary trong lượt này.')
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    const limit = args.limit === undefined ? GLOSSARY_LIMIT_MAX : args.limit
    if (!isInteger(limit) || limit < 1 || limit > GLOSSARY_LIMIT_MAX) {
      return failed(call, `limit phải là số nguyên 1–${GLOSSARY_LIMIT_MAX}.`)
    }
    const needle = query.toLowerCase()
    const approved = library
      .listGlossary(workId)
      .filter((entry) => entry.kind === 'term' && entry.status === 'approved')
      .filter(
        (entry) =>
          needle === '' ||
          [entry.source, entry.target, ...entry.aliases].some((form) =>
            form.toLowerCase().includes(needle)
          )
      )
    const label = query === '' ? 'Thuật ngữ' : `Thuật ngữ "${query}"`
    if (approved.length === 0) {
      return {
        id: call.id,
        name: call.name,
        detail: `${label} — 0 mục`,
        content: `${label}: không có mục đã duyệt nào.`,
        status: 'ok'
      }
    }
    let shown = approved.slice(0, limit)
    let body = glossaryLines(shown).join('\n')
    while (shown.length > 1 && body.length > budget) {
      shown = shown.slice(0, Math.max(1, Math.floor(shown.length / 2)))
      body = glossaryLines(shown).join('\n')
    }
    const more =
      shown.length < approved.length
        ? `; trả ${shown.length} — thu hẹp bằng query để xem phần còn lại.`
        : '.'
    return {
      id: call.id,
      name: call.name,
      detail: `${label} — ${shown.length}/${approved.length} mục`,
      content: `${label}: ${approved.length} mục đã duyệt${more}\n${body}`,
      status: 'ok'
    }
  }

  function listAddressing(call: ToolCall): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    if (!library.listAddressing || !scope) {
      return failed(call, 'Không đọc được xưng hô trong lượt này.')
    }
    const name = typeof args.character === 'string' ? args.character.trim().toLowerCase() : ''
    const named = (character: AddressingDyadResolved['sourceCharacter']): boolean =>
      [character.source, character.target, ...character.aliases].some((form) =>
        form.toLowerCase().includes(name)
      )
    const dyads = approvedDyads(library.listAddressing(workId, scope.chapterId)).filter(
      (dyad) => name === '' || named(dyad.sourceCharacter) || named(dyad.targetCharacter)
    )
    const label = name === '' ? 'Xưng hô' : `Xưng hô "${String(args.character).trim()}"`
    return {
      id: call.id,
      name: call.name,
      detail: `${label} — ${dyads.length} cặp`,
      content:
        dyads.length === 0
          ? `${label}: không có cặp đã duyệt nào.`
          : `${label}: ${dyads.length} cặp đã duyệt.\n` + addressingLines(dyads).join('\n'),
      status: 'ok'
    }
  }

  /** Checks shared by the two text proposals: writes allowed, the open chapter, a fresh read. */
  function writableChapter(
    call: ToolCall,
    args: Record<string, unknown>
  ):
    | { chapter: ChapterItem; source: TextRecord; target: TextRecord; writes: ChatToolWrites }
    | ToolResult {
    if (!scope?.writes) return failed(call, 'Lượt này không được tạo đề xuất.')
    const found = chapterByNumber(call, args.chapter)
    if ('content' in found) return found
    if (found.id !== scope.chapterId) {
      const open = library.listChapters(workId).find((entry) => entry.id === scope.chapterId)
      return failed(
        call,
        `Chỉ đề xuất được cho chương đang mở${open ? ` (chương ${open.number})` : ''}. ` +
          'Hãy nói người dùng mở chương kia rồi hỏi lại.'
      )
    }
    const source = library.readText(workId, found.id, 'source')
    const target = library.readText(workId, found.id, 'target')
    for (const [side, record] of [
      ['source', source],
      ['target', target]
    ] as const) {
      const seen = readAt.get(found.id + ':' + side)
      if (seen !== undefined && seen !== record.rev) {
        return failed(
          call,
          `Văn bản đã đổi kể từ lần đọc trước (${sideName(side)} rev ${seen} → ${record.rev}); đọc lại rồi đề xuất.`
        )
      }
    }
    return { chapter: found, source, target, writes: scope.writes }
  }

  function textArgs(
    call: ToolCall,
    args: Record<string, unknown>
  ): { from: number; to: number; lines: string[] } | ToolResult {
    const { from, to } = args
    if (!isInteger(from) || !isInteger(to) || from < 1 || to < from) {
      return failed(call, 'from và to phải là số nguyên, 1 ≤ from ≤ to.')
    }
    const lines = typeof args.text === 'string' ? paragraphsOf(args.text) : []
    if (lines.length === 0) return failed(call, 'Thiếu văn bản đề xuất.')
    return { from, to, lines }
  }

  function proposeEdit(call: ToolCall): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    const checked = writableChapter(call, args)
    if ('content' in checked) return checked
    const parsed = textArgs(call, args)
    if ('content' in parsed) return parsed
    const { chapter, source, target, writes } = checked
    const { from, to, lines } = parsed

    const spans = splitParagraphs(target.content)
    if (spans.length === 0) {
      return failed(call, 'Bản dịch của chương còn trống; dùng propose_translation.')
    }
    if (to > spans.length) {
      return failed(call, `Bản dịch có ${spans.length} đoạn; không có ${span(from, to)}.`)
    }
    const baseFrom = spans[from - 1].lineStart
    const baseTo = spans[to - 1].lineEnd
    const before = target.content.slice(baseFrom, baseTo)
    // Giữ nguyên các dòng trống của tài liệu: dùng cùng ký tự phân cách khi số lượng khớp.
    const separators = spans
      .slice(from - 1, to - 1)
      .map((line, index) => target.content.slice(line.lineEnd, spans[from + index].lineStart))
    const after =
      lines.length === to - from + 1
        ? lines.map((line, index) => (index === 0 ? '' : separators[index - 1]) + line).join('')
        : lines.join(separators[0] ?? separatorOf(target.content, spans))
    if (after === before) return failed(call, 'Văn bản đề xuất trùng với bản dịch hiện có.')

    const where = `${span(from, to)} bản dịch`
    let created: { proposalId: string; partIds: string[] }
    try {
      created = writes.createProposal(workId, {
        turnId: scope!.turnId,
        chapterId: chapter.id,
        commandId: scope!.turnId + ':' + ++writeCount,
        sourceRev: source.rev,
        sourceContent: source.content,
        targetBaseRev: target.rev,
        targetBaseContent: target.content,
        part: {
          baseFrom,
          baseTo,
          beforeText: before,
          afterText: after,
          sourceOrder: null,
          sourceText: null,
          status: 'pending'
        }
      })
    } catch (error) {
      return failed(call, error instanceof Error ? error.message : String(error))
    }
    proposals++
    const label = `Sửa ${where}`
    return {
      id: call.id,
      name: call.name,
      detail: `Đề xuất sửa ${where} · chương ${chapter.number}`,
      content: `Đã tạo đề xuất ${created.proposalId} (chờ duyệt): sửa ${where} của chương ${chapter.number}, mốc rev ${target.rev}. Bản dịch chưa đổi cho tới khi người dùng chấp nhận.`,
      status: 'ok',
      proposal: {
        type: 'edit',
        proposalId: created.proposalId,
        partIds: created.partIds,
        chapterId: chapter.id,
        label
      }
    }
  }

  function proposeTranslation(call: ToolCall): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    const checked = writableChapter(call, args)
    if ('content' in checked) return checked
    const parsed = textArgs(call, args)
    if ('content' in parsed) return parsed
    const { chapter, source, target, writes } = checked
    const { from, to, lines } = parsed

    const sourceSpans = splitParagraphs(source.content)
    if (to > sourceSpans.length) {
      return failed(call, `Bản gốc có ${sourceSpans.length} đoạn; không có ${span(from, to)}.`)
    }
    const expected = to - from + 1
    if (lines.length !== expected) {
      return failed(
        call,
        `${span(from, to)} bản gốc cần đúng ${expected} dòng dịch, mỗi dòng một đoạn; nhận ${lines.length}.`
      )
    }
    const alignment = alignmentOf(source, target, library.listLinks(workId, chapter.id))
    const counterpartAt = (paragraph: number): ReturnType<typeof alignment.counterpart> => {
      const line = sourceSpans[paragraph - 1]
      return alignment.counterpart('source', line.lineStart, line.lineEnd)
    }
    for (let paragraph = from; paragraph <= to; paragraph++) {
      if (counterpartAt(paragraph).kind === 'linked') {
        return failed(
          call,
          `Đoạn gốc ${paragraph} đã có bản dịch liên kết; dùng propose_edit cho đoạn dịch tương ứng.`
        )
      }
    }

    const targetSpans = splitParagraphs(target.content)
    const separator = separatorOf(target.content, targetSpans)
    const translation = lines.join(separator)
    const sourceText = sourceSpans
      .slice(from - 1, to)
      .map((line) => source.content.slice(line.lineStart, line.lineEnd))
      .join('\n\n')

    // Xác định vị trí chèn đoạn dịch mới: bản dịch trống thì chèn vào đầu; nếu không thì đặt cạnh
    // đoạn gốc gần nhất đã có liên kết. Nếu không có lân cận liên kết nào thì để người dùng tự đặt vị trí.
    let part: ToolProposalInput['part'] = {
      baseFrom: null,
      baseTo: null,
      beforeText: '',
      afterText: translation,
      sourceOrder: from - 1,
      sourceText,
      status: 'needs-placement'
    }
    let placed = 'chưa tìm được chỗ đặt trong bản dịch; người dùng sẽ cần đặt vị trí'
    const anchorLine = (texts: string[], last: boolean): ParagraphSpan | null => {
      const wanted = last ? texts[texts.length - 1] : texts[0]
      const at = target.content.indexOf(wanted)
      return at < 0 || targetSpans.length === 0 ? null : targetSpans[paragraphAt(targetSpans, at)]
    }
    if (target.content.trim() === '') {
      part = { ...part, baseFrom: 0, baseTo: 0, status: 'pending' }
      placed = 'đặt vào bản dịch đang trống'
    } else {
      let anchor: { line: ParagraphSpan; after: boolean } | null = null
      for (let paragraph = from - 1; paragraph >= 1 && anchor === null; paragraph--) {
        const counterpart = counterpartAt(paragraph)
        const line = counterpart.kind === 'linked' ? anchorLine(counterpart.texts, true) : null
        if (line) anchor = { line, after: true }
      }
      for (
        let paragraph = to + 1;
        paragraph <= sourceSpans.length && anchor === null;
        paragraph++
      ) {
        const counterpart = counterpartAt(paragraph)
        const line = counterpart.kind === 'linked' ? anchorLine(counterpart.texts, false) : null
        if (line) anchor = { line, after: false }
      }
      if (anchor) {
        const before = target.content.slice(anchor.line.lineStart, anchor.line.lineEnd)
        const index = targetSpans.indexOf(anchor.line) + 1
        part = {
          ...part,
          baseFrom: anchor.line.lineStart,
          baseTo: anchor.line.lineEnd,
          beforeText: before,
          afterText: anchor.after
            ? before + separator + translation
            : translation + separator + before,
          status: 'pending'
        }
        placed = `${anchor.after ? 'sau' : 'trước'} đoạn ${index} bản dịch`
      }
    }

    const where = `${span(from, to)} bản gốc`
    let created: { proposalId: string; partIds: string[] }
    try {
      created = writes.createProposal(workId, {
        turnId: scope!.turnId,
        chapterId: chapter.id,
        commandId: scope!.turnId + ':' + ++writeCount,
        sourceRev: source.rev,
        sourceContent: source.content,
        targetBaseRev: target.rev,
        targetBaseContent: target.content,
        part
      })
    } catch (error) {
      return failed(call, error instanceof Error ? error.message : String(error))
    }
    proposals++
    return {
      id: call.id,
      name: call.name,
      detail: `Đề xuất dịch ${where} · chương ${chapter.number}`,
      content: `Đã tạo đề xuất ${created.proposalId} (chờ duyệt): dịch ${where} của chương ${chapter.number}, ${placed}. Bản dịch chưa đổi cho tới khi người dùng chấp nhận.`,
      status: 'ok',
      proposal: {
        type: 'translation',
        proposalId: created.proposalId,
        partIds: created.partIds,
        chapterId: chapter.id,
        label: `Dịch ${where}`
      }
    }
  }

  function proposeTerm(call: ToolCall): ToolResult {
    const args = readArgs(call)
    if (args === null) return failed(call, 'Tham số không phải JSON hợp lệ.')
    if (!scope?.writes) return failed(call, 'Lượt này không được tạo đề xuất.')
    const term = typeof args.term === 'string' ? args.term.trim() : ''
    const translation = typeof args.translation === 'string' ? args.translation.trim() : ''
    if (term === '' || translation === '') return failed(call, 'Thiếu term hoặc translation.')
    if (term.length > TERM_TEXT_MAX || translation.length > TERM_TEXT_MAX) {
      return failed(call, `Thuật ngữ và bản dịch tối đa ${TERM_TEXT_MAX} ký tự.`)
    }
    const variants = Array.isArray(args.variants)
      ? args.variants
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item !== '' && item !== term)
      : []
    if (variants.some((item) => item.length > TERM_TEXT_MAX)) {
      return failed(call, `Mỗi biến thể tối đa ${TERM_TEXT_MAX} ký tự.`)
    }
    const note = typeof args.note === 'string' && args.note.trim() !== '' ? args.note.trim() : null
    if (note !== null && note.length > TERM_NOTES_MAX) {
      return failed(call, `Ghi chú tối đa ${TERM_NOTES_MAX} ký tự.`)
    }
    let created: { entryId: string }
    try {
      created = scope.writes.createTerm(workId, {
        term,
        translation,
        variants: [...new Set(variants)],
        note
      })
    } catch (error) {
      return failed(call, error instanceof Error ? error.message : String(error))
    }
    writeCount++
    proposals++
    const label = `${term} → ${translation}`
    return {
      id: call.id,
      name: call.name,
      detail: `Đề xuất thuật ngữ ${label}`,
      content: `Đã thêm thuật ngữ ${label} vào glossary. Mục có hiệu lực ngay; người dùng sửa hoặc xóa ở màn Thuật ngữ nếu cần.`,
      status: 'ok',
      proposal: {
        type: 'term',
        entryId: created.entryId,
        term,
        translation,
        label: `Thuật ngữ ${label}`
      }
    }
  }

  return {
    run(call, options = {}) {
      const remaining = options.remainingChars ?? Infinity
      if (call.name === 'get_current_chapter') return getCurrentChapter(call)
      if (call.name === 'list_chapters') return listChapters(call)
      if (READING.has(call.name)) {
        if (remaining <= 0) return budgetSpent(call, options.turnBudget ?? 0)
        if (call.name === 'read_chapter')
          return readChapter(call, Math.min(TOOL_TEXT_MAX, remaining))
        if (call.name === 'read_segments') {
          return readSegments(call, Math.min(TOOL_TEXT_MAX, remaining))
        }
        if (call.name === 'list_glossary') return listGlossary(call, remaining)
        if (call.name === 'list_addressing') return listAddressing(call)
        return searchWork(call, remaining)
      }
      if (WRITING.has(call.name)) {
        if (proposals >= MAX_PROPOSALS_PER_TURN) {
          return failed(
            call,
            `Đã đạt trần ${MAX_PROPOSALS_PER_TURN} đề xuất của lượt; không tạo thêm. Hãy dừng và tóm tắt các đề xuất đã tạo.`
          )
        }
        const args = readArgs(call)
        const text = args === null ? '' : JSON.stringify(args)
        if (text.length > remaining) {
          return failed(
            call,
            `Hết ngân sách ký tự của lượt (${formatCount(options.turnBudget ?? 0)} ký tự); không tạo thêm đề xuất.`
          )
        }
        const result =
          call.name === 'propose_edit'
            ? proposeEdit(call)
            : call.name === 'propose_translation'
              ? proposeTranslation(call)
              : proposeTerm(call)
        return { ...result, charge: result.content.length + text.length }
      }
      return failed(call, 'Không có công cụ tên "' + call.name + '".')
    }
  }
}
