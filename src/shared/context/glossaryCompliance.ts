import type {
  ContextEntryItem,
  GlossaryComplianceIssue,
  GlossaryComplianceReport
} from '../contracts/glossary'
import { matchContextEntries } from './contextMatching'
import { containsWord } from '../translation/translationChecks'

export type { GlossaryComplianceIssue, GlossaryComplianceReport }

/**
 * Kiểm tra xem bản dịch có tuân thủ bảng thuật ngữ đang hoạt động hay không.
 * - Thiếu bản dịch: Khi một thuật ngữ đã duyệt xuất hiện trong bản gốc nhưng thiếu dạng dịch tương ứng ở bản dịch.
 * - Dùng từ bị cấm: Khi dạng dịch của một thuật ngữ bị cấm xuất hiện trong bản dịch.
 */
export function evaluateGlossaryCompliance(
  sourceText: string,
  targetText: string,
  entries: ContextEntryItem[],
  sourceLang: string
): GlossaryComplianceReport {
  const issues: GlossaryComplianceIssue[] = []

  // Chỉ kiểm tra các mục đã được phê duyệt
  const approvedEntries = entries.filter((e) => e.status === 'approved')

  const regularEntries: ContextEntryItem[] = []
  const forbiddenEntries: ContextEntryItem[] = []

  for (const entry of approvedEntries) {
    if (entry.forbidden) {
      forbiddenEntries.push(entry)
    } else {
      regularEntries.push(entry)
    }
  }

  // 1. Kiểm tra các thuật ngữ bị cấm trong bản dịch
  for (const forbidden of forbiddenEntries) {
    if (containsWord(targetText, forbidden.target)) {
      issues.push({
        type: 'forbidden_used',
        entryId: forbidden.id,
        source: forbidden.source,
        term: forbidden.target,
        message: `Bản dịch chứa thuật ngữ bị cấm: "${forbidden.target}".`
      })
    }
  }

  // 2. Kiểm tra các lần xuất hiện ở bản gốc và bản dịch tương ứng
  const matched = matchContextEntries(sourceText, regularEntries, sourceLang)

  for (const item of matched) {
    const entry = item.entry
    // Matched only through an alias (a short name such as ノエル for ノエル・アーデン): the matching
    // short form of the target ("Noel" of "Noel Arden") is enough, so any capitalised word of it counts.
    const shortForm =
      item.matchedForm !== entry.source.trim() &&
      entry.target
        .split(/\s+/)
        .some((word) => /^\p{Lu}/u.test(word) && containsWord(targetText, word))
    if (!shortForm && !containsWord(targetText, entry.target)) {
      issues.push({
        type: 'missing_target',
        entryId: entry.id,
        source: entry.source,
        term: entry.target,
        message: `Thuật ngữ "${entry.source}" xuất hiện ở bản gốc nhưng thiếu bản dịch "${entry.target}".`
      })
    }
  }

  return {
    checkedCount: approvedEntries.length,
    matchedCount: matched.length,
    issues,
    hasIssues: issues.length > 0
  }
}
