import type { TranslationModelCaller } from '../../../shared/contracts/translateCore'
import { addUsage, type Usage } from '../../infra/providers/usage'
import { appendAiCall } from '../../infra/storage/aiCallLog'
import type { CallBudget } from './translate/callBudget'
import type { ContextSnapshot } from './translate/contextSnapshot'
import { addressingLines, approvedDyads, characterLines } from './translate/translatePrompt'
import {
  POLISH_PROMPT_VERSION,
  buildPolishMessages,
  parsePolish,
  polishBatches,
  verifyEdits,
  type PolishItem,
  type PolishName,
  type PolishTerm
} from './polish'

/**
 * Trau chuốt các câu vừa dịch xong của một chương (change `add-auto-polish`): gửi cặp gốc/dịch cho
 * model, nhận lại các câu sửa đã qua bước kiểm của `verifyEdits`. Chỉ nhận bản sửa `gain` cao; không
 * ghi gì vào thư viện, người gọi quyết định ghi.
 *
 * Trau chuốt là bước làm thêm: lỗi một lô (mạng, ngân sách, bộ lọc nội dung) chỉ khiến lô đó giữ
 * nguyên bản dịch, không làm hỏng lượt dịch.
 */

export interface ChapterPolishInput {
  caller: TranslationModelCaller
  /** Ngữ cảnh đã chụp của lượt dịch; trau chuốt dùng đúng nhân vật, cặp xưng hô và glossary đó. */
  snapshot: ContextSnapshot
  /** Các câu vừa dịch, theo thứ tự trong chương. */
  rows: Array<{ sourceId: string; src: string; dst: string }>
  /** Mỗi lô tính một lượt `polish`; hết ngân sách hoặc chạm trần của tác vụ thì dừng, không lỗi. */
  budget: CallBudget
  signal?: AbortSignal
  /** Có thì mỗi lời gọi và kết quả giữ lại được ghi vào nhật ký AI của tác phẩm. */
  log?: { workId: string; chapterId: string; runKey?: string; model?: string }
}

export interface ChapterPolishResult {
  edits: Array<{ sourceId: string; text: string }>
  usage: Usage | null
  /** Số lời gọi model đã thực hiện, kể cả lời gọi lỗi. */
  calls: number
  rejected: number
}

export async function polishChapterRows(input: ChapterPolishInput): Promise<ChapterPolishResult> {
  const { caller, snapshot, rows, budget, signal, log } = input
  const items: PolishItem[] = rows.map((row, index) => ({
    id: `[${index + 1}]`,
    src: row.src,
    dst: row.dst
  }))
  const sourceIdOf = new Map(items.map((item, index) => [item.id, rows[index]!.sourceId]))

  const glossary: PolishTerm[] = snapshot.glossary
    .filter((entry) => !entry.forbidden)
    .map((entry) => ({ source: entry.source, aliases: entry.aliases, target: entry.target }))
  const names: PolishName[] = snapshot.characters
    .map((character) => ({
      target: character.target || character.source,
      forms: [character.source, ...character.aliases]
    }))
    .filter((name) => name.target !== '')
  const context = {
    sourceLang: snapshot.sourceLang,
    characters: characterLines(snapshot.characters),
    addressing: addressingLines(approvedDyads(snapshot.dyads)),
    glossary
  }

  const edits: ChapterPolishResult['edits'] = []
  let usage: Usage | null = null
  let calls = 0
  let rejected = 0
  for (const batch of polishBatches(items)) {
    if (signal?.aborted || !budget.take('polish')) break
    const messages = buildPolishMessages(context, batch)
    calls++
    let answer
    try {
      answer = await caller.complete(messages, { signal })
    } catch (error) {
      budget.addAttempts(1)
      if (log) {
        appendAiCall(log.workId, {
          kind: 'polish.main',
          ...log,
          promptVersion: POLISH_PROMPT_VERSION,
          messages,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      break
    }
    budget.addAttempts(answer.attempts ?? 1)
    usage = addUsage(usage, answer.usage)
    // A refusal by the provider's content filter leaves this batch as translated; no split, no retry.
    const verdict =
      answer.finishReason === 'filter'
        ? { accepted: [], rejected: [] }
        : verifyEdits(batch, parsePolish(answer.text), { glossary, names, requireGain: true })
    rejected += verdict.rejected.length
    for (const edit of verdict.accepted) {
      const sourceId = sourceIdOf.get(edit.id)
      if (sourceId) edits.push({ sourceId, text: edit.dst })
    }
    if (log) {
      appendAiCall(log.workId, {
        kind: 'polish.main',
        ...log,
        promptVersion: POLISH_PROMPT_VERSION,
        messages,
        raw: answer.text,
        finishReason: answer.finishReason,
        usage: answer.usage,
        attempts: answer.attempts,
        accepted: verdict.accepted.map((edit) => ({
          id: edit.id,
          issue: edit.issue,
          dst: edit.dst
        })),
        rejected: verdict.rejected.map((edit) => ({ id: edit.id, reason: edit.reason }))
      })
    }
  }
  return { edits, usage, calls, rejected }
}
