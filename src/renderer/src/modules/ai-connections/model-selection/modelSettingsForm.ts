import * as v from 'valibot'
import { nearestThinkingLevel } from '../../../../../shared/models/thinkingLevels'
import {
  modelSettingsPatchSchema,
  type ModelCapabilityView,
  type ModelEntryView,
  type ModelSettings,
  type ModelSettingsPatch,
  type ThinkingLevel
} from '../../../../../shared/contracts/modelSettings'

/**
 * Xử lý dữ liệu cài đặt cho từng mục model: tên hiển thị các mức suy luận, các mức model hỗ trợ,
 * và chuyển đổi giữa văn bản người dùng nhập với cấu trúc bản vá (patch) cài đặt.
 *
 * Hàm thuần túy để dễ kiểm thử độc lập:
 *  - Ô trống nghĩa là "chưa đặt" (gửi `null` để xóa), còn `0` là giá trị 0 cụ thể;
 *  - Công tắc khi tắt vẫn lưu giữ giá trị đã nhập;
 *  - Giá trị vượt giới hạn hiển thị thông báo lỗi thay vì tự ý điều chỉnh;
 *  - Dữ liệu lưu sẽ được gửi trực tiếp tới nhà cung cấp theo đúng hợp đồng dữ liệu.
 */

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'Tắt',
  minimal: 'Tối thiểu',
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
  xhigh: 'Rất cao',
  max: 'Tối đa'
}

export const DEFAULT_THINKING_LABEL = 'Mặc định'

export const DEFAULT_THINKING_HINT =
  '“Mặc định” không gửi gì về suy luận: nhà cung cấp dùng mặc định của họ, và mức đó có thể tốn thêm token.'

/** Lựa chọn của người dùng trong menu suy luận: một mức cụ thể hoặc "Mặc định" (không gửi cấu hình suy luận). */
export type ThinkingChoice = ThinkingLevel | 'default'

export interface ThinkingOption {
  value: ThinkingChoice
  label: string
  /** Giải thích chi tiết cho lựa chọn khi nhãn chưa đủ rõ. */
  hint?: string
}

export function thinkingLabelOf(level: ThinkingLevel | undefined): string {
  return level === undefined ? DEFAULT_THINKING_LABEL : THINKING_LABELS[level]
}

/**
 * Danh sách lựa chọn cho một model: các mức model hỗ trợ, kèm tùy chọn "Mặc định".
 * Nếu model chưa có thông tin trong danh mục, chỉ hiển thị tùy chọn "Mặc định".
 *
 * `current` là mức đang được lưu. Nếu model không còn hỗ trợ mức này nữa, tùy chọn vẫn được
 * liệt kê kèm ghi chú để người dùng nhận biết.
 */
export function thinkingOptions(
  capability: ModelCapabilityView,
  current?: ThinkingLevel
): ThinkingOption[] {
  const options: ThinkingOption[] = capability.thinkingLevels.map((level) => ({
    value: level,
    label: THINKING_LABELS[level]
  }))
  if (current !== undefined && !capability.thinkingLevels.includes(current)) {
    options.push({
      value: current,
      label: THINKING_LABELS[current] + ' (model này không hỗ trợ)'
    })
  }
  options.push({ value: 'default', label: DEFAULT_THINKING_LABEL, hint: DEFAULT_THINKING_HINT })
  return options
}

/**
 * Cảnh báo khi mức suy luận đang lưu không còn được model hỗ trợ, gợi ý mức gần nhất;
 * trả về `null` nếu mức đang lưu hợp lệ.
 */
export function staleThinkingNotice(
  capability: ModelCapabilityView,
  current?: ThinkingLevel
): string | null {
  if (current === undefined || capability.thinkingLevels.includes(current)) return null
  const nearest = nearestThinkingLevel(capability.thinkingLevels, current)
  return (
    `Mức “${THINKING_LABELS[current]}” đang lưu không hợp lệ với model này, nên mọi lời gọi bằng mục này ` +
    'sẽ bị chặn. ' +
    (nearest === null
      ? `Chọn “${DEFAULT_THINKING_LABEL}”.`
      : `Chọn mức khác, ví dụ “${THINKING_LABELS[nearest]}”.`)
  )
}

export function thinkingChoiceOf(settings: ModelSettings): ThinkingChoice {
  return settings.thinking ?? 'default'
}

/** Tạo bản vá cài đặt khi chọn mức suy luận: lưu mức cụ thể, hoặc `null` khi chọn "Mặc định". */
export function thinkingPatch(choice: ThinkingChoice): ModelSettingsPatch {
  return { thinking: choice === 'default' ? null : choice }
}

/** Định dạng "Tên · mức" hiển thị trên ô soạn chat và hộp thoại dịch. */
export function entryLabel(entry: Pick<ModelEntryView, 'name' | 'settings'>): string {
  return entry.name + ' · ' + thinkingLabelOf(entry.settings.thinking)
}

// ---- Kết quả và thông báo lỗi -----------------------------------------------------------------------------------

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

/** Kiểm tra tính hợp lệ của bản vá cài đặt; trả về thông báo lỗi đầu tiên hoặc `null` nếu hợp lệ. */
export function patchProblem(patch: ModelSettingsPatch): string | null {
  const result = v.safeParse(modelSettingsPatchSchema, patch)
  return result.success ? null : (result.issues[0]?.message ?? 'Giá trị không hợp lệ.')
}

// ---- Hộp thoại Tác vụ ---------------------------------------------------------------------------------------

export const TASK_FIELDS = [
  'inputTokenLimit',
  'outputTokenLimit',
  'concurrencyLimit',
  'rpmLimit'
] as const
export type TaskField = (typeof TASK_FIELDS)[number]
export type TaskForm = Record<TaskField, string>

/** Dữ liệu hiển thị trong các ô nhập của hộp thoại Tác vụ. Trường chưa đặt hiển thị ô trống; `0` hiển thị là "0". */
export function taskFormOf(settings: ModelSettings): TaskForm {
  const text = (value: number | undefined): string => (value === undefined ? '' : String(value))
  return {
    inputTokenLimit: text(settings.inputTokenLimit),
    outputTokenLimit: text(settings.outputTokenLimit),
    concurrencyLimit: text(settings.concurrencyLimit),
    rpmLimit: text(settings.rpmLimit)
  }
}

/**
 * Phân tích giá trị ô nhập số: ô trống sẽ xóa trường (về giá trị mặc định);
 * chuỗi số hợp lệ trả về số tương ứng; giá trị không hợp lệ trả về thông báo lỗi.
 */
export function parseTaskField(field: TaskField, text: string): FieldResult<number | null> {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: 'Chỉ nhập số nguyên không âm, không có dấu phân cách.' }
  }
  const value = Number(trimmed)
  const problem = patchProblem({ [field]: value })
  return problem === null ? { ok: true, value } : { ok: false, message: problem }
}

export function taskPatch(field: TaskField, value: number | null): ModelSettingsPatch {
  return { [field]: value }
}

/** Mô tả và placeholder hiển thị dưới mỗi ô nhập giới hạn tác vụ. */
export const TASK_HINTS: Record<TaskField, { title: string; hint: string; placeholder: string }> = {
  inputTokenLimit: {
    title: 'Giới hạn token đầu vào mỗi lô',
    hint: 'Cỡ tối đa của một lô khi dịch; lô nhỏ hơn thì nhiều lượt gọi hơn nhưng mỗi lượt nhẹ hơn. Để trống hoặc 0 để dùng mặc định (4.500).',
    placeholder: '4.500'
  },
  outputTokenLimit: {
    title: 'Giới hạn token đầu ra',
    hint: 'Trần số token model được trả về. Để trống hoặc 0 để không gửi trần. Khi suy luận đang bật, token suy luận dùng chung trần này: trần nhỏ có thể ra câu rỗng hoặc cụt.',
    placeholder: 'tự động'
  },
  concurrencyLimit: {
    title: 'Giới hạn đồng thời',
    hint: 'Số yêu cầu tối đa chạy cùng lúc cho mục này; yêu cầu thừa xếp hàng. Để trống hoặc 0 để dùng mặc định (4).',
    placeholder: '4'
  },
  rpmLimit: {
    title: 'Giới hạn yêu cầu mỗi phút (RPM)',
    hint: 'Mira giãn các yêu cầu để không vượt con số này, kể cả giữa dịch và chat. Để trống hoặc 0 để không giãn nhịp.',
    placeholder: 'không giới hạn'
  }
}

// ---- Hộp thoại Nâng cao -------------------------------------------------------------------------------------

export type SliderField = 'temperature' | 'topP'
export type JsonField = 'extraHeaders' | 'extraBody'

export interface SliderForm {
  enabled: boolean
  value: number
}

export interface JsonForm {
  enabled: boolean
  /** Nội dung ô nhập: chuỗi JSON định dạng hoặc chuỗi rỗng. */
  text: string
}

export interface AdvancedForm {
  temperature: SliderForm
  topP: SliderForm
  extraHeaders: JsonForm
  extraBody: JsonForm
}

/** Giá trị khởi tạo cho thanh trượt khi người dùng bật lần đầu tiên. */
export const SLIDER_START: Record<SliderField, number> = { temperature: 1, topP: 1 }

export const SLIDER_RANGE: Record<SliderField, { min: number; max: number; step: number }> = {
  temperature: { min: 0, max: 2, step: 0.05 },
  topP: { min: 0, max: 1, step: 0.01 }
}

export function advancedFormOf(settings: ModelSettings): AdvancedForm {
  const json = (
    switched: { enabled: boolean; value: Record<string, unknown> } | undefined
  ): JsonForm => ({
    enabled: switched?.enabled ?? false,
    text:
      switched === undefined || Object.keys(switched.value).length === 0
        ? ''
        : JSON.stringify(switched.value, null, 2)
  })
  return {
    temperature: {
      enabled: settings.temperature?.enabled ?? false,
      value: settings.temperature?.value ?? SLIDER_START.temperature
    },
    topP: {
      enabled: settings.topP?.enabled ?? false,
      value: settings.topP?.value ?? SLIDER_START.topP
    },
    extraHeaders: json(settings.extraHeaders),
    extraBody: json(settings.extraBody)
  }
}

/** Làm tròn vị trí thanh trượt tới 2 chữ số thập phân để tránh sai số dấu phẩy động. */
export function roundSlider(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatSlider(value: number): string {
  return roundSlider(value).toLocaleString('vi-VN', { minimumFractionDigits: 2 })
}

export function sliderPatch(field: SliderField, form: SliderForm): ModelSettingsPatch {
  return { [field]: { enabled: form.enabled, value: roundSlider(form.value) } }
}

/**
 * Phân tích dữ liệu JSON nâng cao: chuỗi rỗng tương đương đối tượng rỗng `{}`.
 * Bắt buộc phải là đối tượng JSON hợp lệ và không chứa các trường bị cấm trong hợp đồng dữ liệu.
 */
export function parseJsonField(
  field: JsonField,
  text: string
): FieldResult<Record<string, unknown>> {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      ok: false,
      message: 'Không đọc được JSON. Kiểm tra dấu ngoặc, dấu phẩy và dấu nháy kép.'
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'Phải là một đối tượng JSON, ví dụ {"khóa": "giá trị"}.' }
  }
  const value = parsed as Record<string, unknown>
  const problem = patchProblem({ [field]: { enabled: true, value } } as ModelSettingsPatch)
  return problem === null ? { ok: true, value } : { ok: false, message: problem }
}

export function jsonPatch(
  field: JsonField,
  enabled: boolean,
  value: Record<string, unknown>
): ModelSettingsPatch {
  return { [field]: { enabled, value } } as ModelSettingsPatch
}

export const ADVANCED_HINTS = {
  temperature: {
    title: 'Nhiệt độ',
    hint: 'Càng cao càng thoáng, càng thấp càng sát. Chỉ được gửi khi công tắc bật; giá trị được giữ khi tắt.'
  },
  topP: {
    title: 'Top P',
    hint: 'Chỉ lấy các từ có tổng xác suất tới ngưỡng này. Thường chỉnh nhiệt độ hoặc Top P, không cả hai.'
  },
  extraHeaders: {
    title: 'Header thêm',
    hint: 'Một đối tượng JSON, gửi kèm mỗi yêu cầu, ví dụ {"HTTP-Referer": "https://…"}. Không nhập khóa API ở đây: khóa của kết nối có đường riêng và các header xác thực bị từ chối.'
  },
  extraBody: {
    title: 'Tham số thêm (extra_body)',
    hint: 'Một đối tượng JSON gộp vào thân yêu cầu, cho các tham số riêng của nhà cung cấp, ví dụ {"top_k": 40}. Không đổi được model, messages, stream, stream_options và tools.'
  }
} as const

export const TEMPERATURE_LOCKED_HINT =
  'Theo bảng dữ liệu đi kèm, model này không nhận nhiệt độ nên Mira khóa ô này.'
