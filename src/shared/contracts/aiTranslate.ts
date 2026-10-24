import * as v from 'valibot'
import { idSchema } from './library'
import { settingsKeySchema } from './modelSettings'
import type { TokenUsage } from './usage'

/**
 * Dịch bản gốc của một chương bằng AI: những gì đi qua IPC.
 *
 * Việc dịch **do renderer điều phối từng lô**, không phải một lời gọi dài trong main process. Lý
 * do: kho này chỉ có `invoke`/`handle`, chưa có kênh main → renderer, nên tiến độ và nút Hủy chỉ
 * đúng được khi mỗi lô là một lời gọi riêng. Mỗi lô cũng **ghi ngay** phần đã qua kiểm tra, nên hủy
 * giữa chừng hay mất kết nối không làm mất phần đã dịch.
 */

export interface TranslateBatchPlan {
  /** ID các segment nguồn của lô, theo thứ tự trong chương. */
  sourceIds: string[]
  /** Tổng số ký tự nguồn của lô, để giao diện chia tiến độ theo khối lượng thật nếu cần. */
  sourceChars: number
}

export interface TranslateEstimate {
  inputTokens: number
  outputTokens: number
  /** Thiếu nghĩa là **chưa biết giá** của model này, không phải 0. */
  usd?: number
}

export interface TranslatePlan {
  connectionId: string
  connectionName: string
  /** Mục model đã chọn: dịch bằng cấu hình của chính mục này. */
  entryId: string
  /** Tên hiển thị của mục, để hộp thoại nói "dịch bằng …". */
  entryName: string
  /** Tên model thật mục đó gửi cho nhà cung cấp. */
  model: string
  /**
   * Khóa của cấu hình lúc lập kế hoạch. Mỗi lô gửi lại nó; nếu mục đã bị sửa giữa chừng thì lô không được
   * gửi (`conflict`) và người dùng lập kế hoạch lại, thay vì một chương mang hai cấu hình lẫn nhau.
   */
  settingsKey: string
  /** Ngày của bản chụp giá đi kèm bản cài, để nói "giá tham khảo, cập nhật ngày…". */
  catalogReadAt: string
  /** Số segment sẽ gửi. */
  segmentCount: number
  batches: TranslateBatchPlan[]
  /**
   * Số segment người dùng đã viết hoặc đã soát. Vẫn gửi đi, nhưng kết quả chỉ là **đề xuất**: AI
   * không ghi đè chúng.
   */
  protectedCount: number
  /** Chương đã có bản dịch nào chưa — để hộp thoại cảnh báo trước khi dịch lại. */
  hasTranslation: boolean
  estimate: TranslateEstimate
  /** Revision bản dịch lúc lập kế hoạch; lô đầu tiên gửi kèm số này. */
  targetRev: number
}

/** Một hàng người dùng đã sửa: giữ bản của họ, bày bản AI cạnh bên để họ tự chọn. */
export interface HeldSuggestion {
  sourceId: string
  sourceText: string
  /** Bản đang nằm trong bản dịch của chương. */
  userText: string
  /** Bản AI đề xuất. **Chưa** được ghi vào bản dịch. */
  aiText: string
}

export type TranslateErrorKind =
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'quota'
  | 'refused'
  | 'invalid_request'
  | 'invalid_response'
  | 'cancelled'
  | 'conflict'
  /** Ngân sách lượt gọi của phiên dịch đã cạn trước khi các đoạn này kịp thử lại. */
  | 'budget_exhausted'

/** Các vòng gọi model trong một phiên dịch, được tính vào ngân sách gọi. */
export type BudgetRound = 'main' | 'split' | 'bare' | 'repair' | 'fallback' | 'polish'

/** Báo cáo mức tiêu thụ ngân sách gọi của phiên dịch sau mỗi lô. */
export interface BudgetReport {
  /** Số lượt gọi model đã thực hiện. */
  used: number
  limit: number
  byRound: Record<BudgetRound, number>
  /** Số lượt yêu cầu HTTP thực tế (bao gồm cả các lần thử lại). */
  httpAttempts: number
  /** Cảnh báo khi đã dùng từ 80% giới hạn trở lên. */
  warn: boolean
}

export interface TranslateFailure {
  kind: TranslateErrorKind
  message: string
  /** Mốc sớm nhất có khóa hồi phục, khi lỗi là hết hạn mức và biết được mốc đó. */
  recoverAt: number | null
  /**
   * Lỗi này có dừng cả lượt dịch chương không. Main quyết định theo chính sách lỗi; renderer làm theo.
   */
  haltsRun: boolean
  /**
   * Đề xuất tiếp tục các đoạn còn thiếu bằng model dự phòng trong Cài đặt.
   */
  fallback?: boolean
  /** Hết hạn mức theo phút hay theo ngày, chỉ khi nhà cung cấp nói rõ. */
  quotaScope?: 'minute' | 'day'
  /** Thông điệp gốc và phần thân phản hồi đã che khóa, cho khung chi tiết kỹ thuật; không đưa cho agent. */
  detail?: string
}

/**
 * Nhóm lý do bộ lọc nội dung chặn một đoạn. `prohibited` không bao giờ được chuyển sang model khác;
 * `recitation` là bộ lọc trích dẫn, không phải vấn đề nội dung.
 */
export type RefusalGroup = 'prohibited' | 'safety' | 'recitation' | 'other'

/** Một đoạn còn bị bộ lọc chặn sau khi đã chia nhỏ và gửi lại, kèm lý do nhà cung cấp nêu. */
export interface SegmentRefusal {
  id: string
  group: RefusalGroup
  /** Chữ gốc của nhà cung cấp, ví dụ `PROHIBITED_CONTENT`; rỗng khi không nêu. */
  raw: string
}

/** Lượng token nhà cung cấp báo đã dùng thật. Thiếu khi endpoint không báo. */
export type TranslateUsage = TokenUsage

export interface TranslateBatchResult {
  /** Segment đã ghi vào bản dịch. */
  written: string[]
  held: HeldSuggestion[]
  /** Segment của lô này không dịch được; đi cùng `error`. */
  failed: string[]
  /** Những segment trong `failed` bị bộ lọc nội dung chặn, kèm lý do. */
  refusals: SegmentRefusal[]
  error: TranslateFailure | null
  /** Revision bản dịch sau khi ghi; lô sau gửi kèm số này. */
  targetRev: number
  /** Bốn ký tự cuối của khóa đã dùng, để nói "đã chuyển sang khóa …". `null` khi không dùng khóa. */
  keyTail: string | null
  usage: TranslateUsage | null
}

const chapterRef = {
  workId: idSchema,
  chapterId: v.pipe(v.string('ID chương phải là chữ.'), v.uuid('ID chương không hợp lệ.'))
}

export const translatePlanSchema = v.strictObject({
  ...chapterRef,
  connectionId: idSchema,
  entryId: idSchema
})

export const translateBatchSchema = v.strictObject({
  ...chapterRef,
  connectionId: idSchema,
  entryId: idSchema,
  settingsKey: settingsKeySchema,
  sourceIds: v.pipe(
    v.array(
      v.pipe(v.string('ID segment phải là chữ.'), v.uuid('ID segment không hợp lệ.')),
      'Danh sách segment không hợp lệ.'
    ),
    v.minLength(1, 'Lô rỗng.'),
    v.maxLength(2000, 'Lô quá lớn.')
  ),
  expectedRev: v.pipe(
    v.number('Revision phải là số.'),
    v.integer('Revision phải là số nguyên.'),
    v.minValue(0)
  )
})

export type TranslatePlanInput = v.InferOutput<typeof translatePlanSchema>
export type TranslateBatchInput = v.InferOutput<typeof translateBatchSchema>
