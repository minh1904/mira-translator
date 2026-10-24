import type { AddressingDyadResolved } from '../contracts/addressing'
import type { ContextEntryItem } from '../contracts/glossary'
import type { SourceLanguage } from '../contracts/library'
import { QA_RULE_VERSIONS, type QaFinding, type QaRuleCode } from '../contracts/taskQuality'
import { evaluateAddressingCompliance } from '../context/addressingCompliance'
import { evaluateGlossaryCompliance } from '../context/glossaryCompliance'
import type { Bead } from './paragraphAlign'
import {
  checkLengthOutliers,
  checkRepetitions,
  checkResidualSourceChars,
  checkUnbalancedQuotes
} from './translationChecks'

/** One source paragraph and its committed translation, matched by segment ID. */
export interface QaSegment {
  segmentId: string
  paragraphIndex: number
  source: string
  target: string
}

/** What the item sent the model: the glossary and pairs of its pinned snapshot. */
export interface QaContext {
  sourceLang: string
  glossary: ContextEntryItem[]
  dyads: AddressingDyadResolved[]
}

const ONE_TO_ONE: Bead[] = [{ type: '1-1', srcIdx: [0], tgtIdx: [0] }]
// A glossary target written in the source script (a name kept as is) exempts its source from "leftover".
const SOURCE_SCRIPT = /[぀-ヿ㐀-䶿一-鿿가-힯]/

/**
 * Warnings for one item, from its pinned context and the current target of each paragraph. Pure. Every
 * rule only warns: nothing here changes text or state (change `add-translation-task-qa`).
 */
export function evaluateTaskItem(
  chapterId: string,
  context: QaContext,
  segments: QaSegment[]
): QaFinding[] {
  const findings: QaFinding[] = []
  const keptSources = context.glossary
    .filter((entry) => entry.status === 'approved' && SOURCE_SCRIPT.test(entry.target))
    .map((entry) => entry.source)
  const lang = context.sourceLang as SourceLanguage

  for (const segment of segments) {
    if (segment.target.trim() === '') continue
    const add = (ruleCode: QaRuleCode, message: string, evidence: string): void => {
      findings.push({
        ruleCode,
        ruleVersion: QA_RULE_VERSIONS[ruleCode],
        chapterId,
        segmentId: segment.segmentId,
        paragraphIndex: segment.paragraphIndex,
        message,
        evidence
      })
    }

    const glossary = evaluateGlossaryCompliance(
      segment.source,
      segment.target,
      context.glossary,
      context.sourceLang
    )
    for (const issue of glossary.issues) {
      if (issue.type === 'forbidden_used') {
        add('glossary.forbidden_used', `Bản dịch dùng từ bị cấm "${issue.term}".`, issue.term)
      } else {
        add(
          'glossary.missing_target',
          `Bản gốc có "${issue.source}" nhưng bản dịch không có "${issue.term}".`,
          `${issue.source} → ${issue.term}`
        )
      }
    }

    const addressing = evaluateAddressingCompliance(
      [{ paragraphIndex: 0, text: segment.target }],
      context.dyads
    )
    for (const issue of addressing.issues) {
      add(
        issue.issueType === 'unexpected_pronoun'
          ? 'addressing.unexpected_pronoun'
          : 'addressing.inconsistent_pair',
        issue.message,
        issue.expectedPronoun
          ? `"${issue.actualPronoun}" thay vì "${issue.expectedPronoun}"`
          : `"${issue.actualPronoun}"`
      )
    }

    const residual = checkResidualSourceChars([segment.source], [segment.target], ONE_TO_ONE, {
      sourceLang: lang,
      exemptWhere: keptSources
    })
    for (const issue of residual) {
      add(
        'text.residual_source',
        'Bản dịch còn chữ hoặc dấu câu của bản gốc.',
        issue.chars.join(' ')
      )
    }

    for (const issue of checkLengthOutliers([segment.source], [segment.target], ONE_TO_ONE, {
      sourceLang: lang
    })) {
      add(
        'text.length_ratio',
        'Độ dài bản dịch khác thường so với bản gốc; có thể sót hoặc thừa ý.',
        `tỉ lệ ${issue.ratio.toFixed(2)} (thường ${issue.band[0]}–${issue.band[1]})`
      )
    }

    for (const issue of checkRepetitions([segment.target])) {
      add('text.repetition', 'Bản dịch lặp bất thường.', issue.pattern ?? issue.reason)
    }

    // A source paragraph that itself opens or closes a quote split across paragraphs ("「神学校？" then
    // "いえ……」") is followed by a faithful translation; only a quote the translation broke is a warning.
    const sourceSplit = checkUnbalancedQuotes([segment.source]).length > 0
    for (const issue of sourceSplit ? [] : checkUnbalancedQuotes([segment.target])) {
      add('text.unbalanced_quotes', 'Dấu ngoặc thoại không cân.', issue.reason)
    }
  }
  return findings
}
