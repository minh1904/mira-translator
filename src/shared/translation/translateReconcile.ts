import type {
  TranslateUnit,
  TempMappedUnit,
  ParsedTranslateItem,
  ReconciliationResult
} from '../contracts/translateCore'

export interface TempMappingResult {
  /** Các đơn vị gửi đi với ID tạm [1], [2], ... */
  sendable: TempMappedUnit[]
  /** Các đơn vị không gửi tới mô hình: rỗng, hoặc dòng phân cách được chép nguyên. */
  skippedEmpty: TranslateUnit[]
  /** Ánh xạ từ ID gốc sang ID tạm */
  idToTemp: Map<string, string>
  /** Ánh xạ từ ID tạm sang ID gốc */
  tempToId: Map<string, string>
}

/**
 * Dòng chỉ gồm ký tự ngắt cảnh hay phân cách (◇◇◇, ＊＊＊, ――――): không có gì để dịch. Gửi model thì nó
 * áp luật dấu câu và biến "――――" thành "...". Thoại không chữ như 「――――？」 có ngoặc nên vẫn được gửi.
 */
const SEPARATOR_ONLY = /^[\s―ー—–\-─━＝=＊*◇◆□■○●◎☆★※・·〜~#]+$/u

/**
 * Ánh xạ danh sách đơn vị gốc sang ID tạm [1], [2], ...
 * Bỏ qua các đơn vị có nội dung rỗng (trả về trực tiếp) và chép nguyên dòng phân cách.
 */
export function mapToTempIds(units: TranslateUnit[]): TempMappingResult {
  const sendable: TempMappedUnit[] = []
  const skippedEmpty: TranslateUnit[] = []
  const idToTemp = new Map<string, string>()
  const tempToId = new Map<string, string>()

  let index = 1
  for (const unit of units) {
    if (unit.text.trim() === '') {
      skippedEmpty.push({ id: unit.id, text: '' })
      continue
    }
    if (SEPARATOR_ONLY.test(unit.text)) {
      skippedEmpty.push({ id: unit.id, text: unit.text.trim() })
      continue
    }

    const tempId = `[${index}]`
    index++

    sendable.push({
      tempId,
      originalId: unit.id,
      text: unit.text
    })

    idToTemp.set(unit.id, tempId)
    tempToId.set(tempId, unit.id)
    // Cũng hỗ trợ trường hợp model trả về số trần "1" thay vì "[1]"
    tempToId.set(String(index - 1), unit.id)
  }

  return { sendable, skippedEmpty, idToTemp, tempToId }
}

/**
 * Đoạn thoại nằm trọn trong 「…」 (hay 『…』) thì bản dịch phải có ngoặc. Model đôi khi bỏ ngoặc cho cả loạt
 * câu thoại liền nhau, hoặc mở “ mà quên đóng; thêm lại ngoặc còn thiếu.
 */
export function restoreDialogueQuotes(source: string, text: string): string {
  const src = source.trim()
  const pair =
    src.startsWith('「') && src.endsWith('」')
      ? ['“', '”']
      : src.startsWith('『') && src.endsWith('』')
        ? ['‘', '’']
        : null
  const body = text.trim()
  if (pair === null || body === '') return text
  if (!/^["“‘'「『]/.test(body)) return pair[0] + body + pair[1]
  return /["”’'」』]$/.test(body) ? text : body + (body.startsWith('‘') ? '’' : '”')
}

/**
 * Chuẩn hóa ID tạm nhận từ model (ví dụ: "1", "[1]", "[ 1 ]", "#1").
 */
export function normalizeTempId(rawId: string): string {
  const trimmed = rawId.trim()
  const bracketMatch = /^\[\s*(\d+)\s*\]$/.exec(trimmed)
  if (bracketMatch) return `[${bracketMatch[1]}]`

  const numMatch = /^\d+$/.exec(trimmed)
  if (numMatch) return `[${numMatch[0]}]`

  const hashMatch = /^#\s*(\d+)$/.exec(trimmed)
  if (hashMatch) return `[${hashMatch[1]}]`

  return trimmed
}

/**
 * Đối soát kết quả phân tích từ mô hình với danh sách đơn vị gốc yêu cầu.
 * `acceptEcho`: nhận bản chép nguyên bản gốc làm bản dịch. Lượt hỏi lại bật cờ này: model đã được hỏi
 * đích danh đoạn đó mà vẫn giữ nguyên (chữ gõ bừa, mã, tên Latin) thì đó là câu trả lời, không phải thiếu.
 */
export function reconcileTempItems(
  sendable: TempMappedUnit[],
  tempToId: Map<string, string>,
  items: ParsedTranslateItem[],
  options: { acceptEcho?: boolean } = {}
): ReconciliationResult {
  const matched: TranslateUnit[] = []
  const missing: string[] = []
  const extraneous: string[] = []
  const empty: string[] = []
  let duplicate = 0

  const seenOriginalIds = new Set<string>()
  const expectedOriginalIds = new Set(sendable.map((u) => u.originalId))
  const sourceOf = new Map(sendable.map((u) => [u.originalId, u.text.trim()]))

  for (const item of items) {
    const normTemp = normalizeTempId(item.tempId)
    const originalId = tempToId.get(normTemp) ?? tempToId.get(item.tempId)

    if (!originalId || !expectedOriginalIds.has(originalId)) {
      extraneous.push(item.tempId)
      continue
    }

    // Nếu model trả trùng một ID, ưu tiên bản đầu tiên
    if (seenOriginalIds.has(originalId)) {
      duplicate++
      continue
    }

    // Chép lại nguyên bản gốc (thường khi bản dịch được đọc từ khóa `src`) không phải bản dịch: coi như
    // rỗng để lượt hỏi lại dịch đoạn đó. Đoạn không có chữ (「――――？」) dịch ra vẫn y nguyên, giữ lại.
    const source = sourceOf.get(originalId) ?? ''
    const echoed = !options.acceptEcho && item.text.trim() === source && /\p{L}/u.test(source)
    if (item.text.trim() === '' || echoed) {
      empty.push(originalId)
      seenOriginalIds.add(originalId)
      continue
    }

    matched.push({
      id: originalId,
      // Model đôi khi để khoảng trắng trước ngoặc đóng ("đội... ”"); tiếng Việt không có cách viết đó.
      text: restoreDialogueQuotes(source, item.text.replace(/\s+(?=[”’])/g, ''))
    })
    seenOriginalIds.add(originalId)
  }

  // Tìm các ID bị thiếu hoàn toàn
  for (const unit of sendable) {
    if (!seenOriginalIds.has(unit.originalId)) {
      missing.push(unit.originalId)
    }
  }

  return { matched, missing, extraneous, empty, duplicate }
}
