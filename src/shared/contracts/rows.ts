import type { LinkRecord } from './links'
import type { SegmentRecord, TextRecord } from './text'

/**
 * Các hàng đối chiếu của một chương: mỗi hàng ứng với một đoạn nguồn và các đoạn dịch được liên kết.
 * Luồng dịch ghi bản dịch theo hàng và kiểm tra chất lượng đọc các hàng này.
 */

export type RowState = 'untranslated' | 'ai' | 'reviewed' | 'check'

export interface Row {
  /** Vị trí 0-indexed của đoạn nguồn. */
  index: number
  sourceId: string
  sourceText: string
  /** Danh sách ID đoạn dịch thuộc hàng theo thứ tự bản dịch. */
  targetIds: string[]
  /** Văn bản dịch từ đầu đoạn dịch đầu tiên đến cuối đoạn dịch cuối cùng. */
  targetText: string
  state: RowState
  linkIds: string[]
}

export interface RowsView {
  rows: Row[]
  /** Các đoạn dịch chưa thuộc về liên kết nào. */
  unlinkedTargets: SegmentRecord[]
  counts: Record<RowState, number>
}

const NOTEWORTHY: RowState[] = ['check', 'ai', 'reviewed']

/**
 * Xác định trạng thái của hàng dựa trên các liên kết.
 */
export function rowState(links: LinkRecord[], hasTarget: boolean): RowState {
  if (!hasTarget) return 'untranslated'
  const states = links.map((link): RowState => {
    if (link.status === 'needs_review' || link.status === 'broken') return 'check'
    if (link.kind === 'ai' && link.reviewedAt === null) return 'ai'
    return 'reviewed'
  })
  return NOTEWORTHY.find((state) => states.includes(state)) ?? 'reviewed'
}

export function buildRows(source: TextRecord, target: TextRecord, links: LinkRecord[]): RowsView {
  const sourceIds = new Set(source.segments.map((segment) => segment.id))
  const targetPosition = new Map(target.segments.map((segment, index) => [segment.id, index]))

  const linksBySource = new Map<string, LinkRecord[]>()
  const linkedTargets = new Set<string>()
  for (const link of links) {
    for (const member of link.members) {
      if (sourceIds.has(member)) {
        const list = linksBySource.get(member) ?? []
        list.push(link)
        linksBySource.set(member, list)
      } else if (targetPosition.has(member)) {
        linkedTargets.add(member)
      }
    }
  }

  const counts: Record<RowState, number> = { untranslated: 0, ai: 0, reviewed: 0, check: 0 }
  const rows = source.segments.map((segment, index): Row => {
    const rowLinks = linksBySource.get(segment.id) ?? []
    const targetIds = [
      ...new Set(
        rowLinks.flatMap((link) => link.members.filter((member) => targetPosition.has(member)))
      )
    ].sort((a, b) => targetPosition.get(a)! - targetPosition.get(b)!)

    let targetText = ''
    if (targetIds.length > 0) {
      const first = target.segments[targetPosition.get(targetIds[0])!]
      const last = target.segments[targetPosition.get(targetIds[targetIds.length - 1])!]
      targetText = target.content.slice(first.start, last.end)
    }
    const state = rowState(rowLinks, targetIds.length > 0)
    counts[state]++
    return {
      index,
      sourceId: segment.id,
      sourceText: source.content.slice(segment.start, segment.end),
      targetIds,
      targetText,
      state,
      linkIds: rowLinks.map((link) => link.id)
    }
  })

  return {
    rows,
    unlinkedTargets: target.segments.filter((segment) => !linkedTargets.has(segment.id)),
    counts
  }
}

/** Chuẩn hóa văn bản của một hàng: gộp ngắt dòng và khoảng trắng xung quanh thành một dấu cách duy nhất. */
export function normalizeRowText(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

export interface RowSaved {
  target: TextRecord
  links: LinkRecord[]
}
