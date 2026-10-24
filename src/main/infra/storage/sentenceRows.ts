import type { LinkRecord } from '../../../shared/contracts/links'
import { buildRows, normalizeRowText, type RowSaved } from '../../../shared/contracts/rows'
import {
  applyEdits,
  resegment,
  segFromRecord,
  toSegmentInputs,
  type Edit,
  type Seg
} from '../../../shared/segmentation/segmentMap'
import type { TextRecord } from '../../../shared/contracts/text'
import { StorageError } from './errors'
import { createLink, deleteLink, listLinks, setProvenance, type ProvenanceOrigin } from './linkFile'
import type { Db } from './sqlite'
import { readText, saveText } from './textFile'

/**
 * Writing the translation of one row (one source segment) into the translation of the chapter, and
 * keeping the segments and the links in step with it. The translation stays one long text; a row is
 * a stretch of it, found through the links.
 */

export interface RowRef {
  chapterId: string
  sourceId: string
}

/**
 * Who wrote the row's translation. The default is the person at the keyboard; an AI translation
 * comes through here so its link is `kind: 'ai'` and unconfirmed, and its provenance carries the
 * provider and the model. That difference is what tells "AI suggested" apart from "looked at".
 */
export interface RowAuthor {
  origin: ProvenanceOrigin
  provider: string | null
  model: string | null
}

const BY_HAND: RowAuthor = { origin: 'human', provider: null, model: null }

/**
 * Between two translated sentences: a line break when their source sentences are on different lines,
 * and one blank line where the source leaves blank lines between them (pacing, scene breaks).
 */
function separatorBetween(source: TextRecord, before: number, after: number): string {
  const gap = source.content.slice(source.segments[before].end, source.segments[after].start)
  const breaks = gap.split('\n').length - 1
  return breaks === 0 ? ' ' : breaks === 1 ? '\n' : '\n\n'
}

/**
 * Deleting a stretch of text should not leave a stray space or an empty line where it was: take the
 * one separator that touches it. Between two line breaks the longer one stays, so a blank line
 * on either side survives.
 */
function withSeparator(content: string, from: number, to: number): [number, number] {
  if (content[from - 1] === ' ') return [from - 1, to]
  if (content[to] === ' ') return [from, to + 1]
  let start = from
  while (content[start - 1] === '\n') start--
  let end = to
  while (content[end] === '\n') end++
  if (start === 0) return [from, end]
  if (end === content.length) return [start, to]
  return from - start < end - to ? [start, to] : [from, end]
}

function rowOf(source: TextRecord, sourceId: string): number {
  const index = source.segments.findIndex((segment) => segment.id === sourceId)
  if (index === -1) throw new StorageError('not_found', 'Không tìm thấy hàng này trong bản gốc.')
  return index
}

/** Links that touch the row, refusing the ones that join several source segments (not editable here). */
function linksOfRow(links: LinkRecord[], source: TextRecord, sourceId: string): LinkRecord[] {
  const sourceIds = new Set(source.segments.map((segment) => segment.id))
  const own = links.filter((link) => link.members.includes(sourceId))
  for (const link of own) {
    if (link.members.filter((member) => sourceIds.has(member)).length > 1) {
      throw new StorageError(
        'validation',
        'Hàng này thuộc một liên kết nối nhiều câu gốc với nhau nên chưa sửa được ở mode Từng câu.'
      )
    }
  }
  return own
}

export function saveRow(
  db: Db,
  args: RowRef & { text: string; expectedRev: number; by?: RowAuthor },
  now: number,
  newId: () => string
): RowSaved {
  const { chapterId, sourceId, expectedRev } = args
  const source = readText(db, chapterId, 'source')
  const target = readText(db, chapterId, 'target')
  if (target.rev !== expectedRev) {
    throw new StorageError(
      'conflict',
      'Bản dịch đã đổi ở nơi khác (revision hiện tại ' +
        target.rev +
        ', bạn đang giữ ' +
        expectedRev +
        '). Hãy tải lại.'
    )
  }

  const index = rowOf(source, sourceId)
  const links = listLinks(db, chapterId)
  const own = linksOfRow(links, source, sourceId)
  const view = buildRows(source, target, links)
  const row = view.rows[index]
  const text = normalizeRowText(args.text)
  const content = target.content

  // What to change in the translation, and where the row's own text will sit afterwards.
  let edit: Edit
  let lead = ''
  if (row.targetIds.length > 0) {
    const first = target.segments.find((segment) => segment.id === row.targetIds[0])!
    const last = target.segments.find(
      (segment) => segment.id === row.targetIds[row.targetIds.length - 1]
    )!
    if (text === '') {
      const [from, to] = withSeparator(content, first.start, last.end)
      edit = { from, to, insert: '' }
    } else {
      edit = { from: first.start, to: last.end, insert: text }
    }
  } else if (text === '') {
    return { target, links }
  } else {
    const translated = (i: number): boolean => view.rows[i].targetIds.length > 0
    let before = -1
    for (let i = index - 1; i >= 0 && before === -1; i--) if (translated(i)) before = i
    let after = -1
    for (let i = index + 1; i < view.rows.length && after === -1; i++) if (translated(i)) after = i

    if (before !== -1) {
      const lastId = view.rows[before].targetIds[view.rows[before].targetIds.length - 1]
      const end = target.segments.find((segment) => segment.id === lastId)!.end
      lead = separatorBetween(source, before, index)
      edit = { from: end, to: end, insert: lead + text }
      // Between two translated rows the old separator was for the pair; write both new ones instead.
      if (after !== -1) {
        const next = target.segments.find(
          (segment) => segment.id === view.rows[after].targetIds[0]
        )!
        if (content.slice(end, next.start).trim() === '') {
          edit = {
            from: end,
            to: next.start,
            insert: lead + text + separatorBetween(source, index, after)
          }
        }
      }
    } else if (after !== -1) {
      const firstId = view.rows[after].targetIds[0]
      const start = target.segments.find((segment) => segment.id === firstId)!.start
      edit = { from: start, to: start, insert: text + separatorBetween(source, index, after) }
    } else {
      // Nothing is linked yet: the row goes at the end, on its own line after whatever is there.
      lead = content === '' || content.endsWith('\n') ? '' : '\n'
      edit = { from: content.length, to: content.length, insert: lead + text }
    }
  }

  const nextContent = content.slice(0, edit.from) + edit.insert + content.slice(edit.to)
  const rowFrom = edit.from + lead.length
  const rowTo = rowFrom + text.length
  const current = target.segments.map(segFromRecord)
  let moved: Seg[]
  if (row.targetIds.length > 0) {
    moved = applyEdits(current, [edit])
  } else {
    // A new row's text is its own segment. The rule for typing at the edge of a segment would
    // stretch a neighbour over it and could take the neighbour's ID, so the neighbours only move.
    const shift = edit.insert.length - (edit.to - edit.from)
    moved = current
      .map((seg) =>
        seg.from >= edit.from ? { ...seg, from: seg.from + shift, to: seg.to + shift } : seg
      )
      .concat({ id: null, from: rowFrom, to: rowTo, edited: true })
      .sort((a, b) => a.from - b.from)
  }
  const split = resegment(nextContent, moved, 'vi')
  const rowIndices =
    text === ''
      ? []
      : split.flatMap((segment, i) => (segment.from < rowTo && segment.to > rowFrom ? [i] : []))

  // The old links of the row go first, so deleting the old segments flags nothing else.
  for (const link of own) deleteLink(db, link.id)
  const saved = saveText(
    db,
    {
      chapterId,
      side: 'target',
      content: nextContent,
      expectedRev: target.rev,
      segments: toSegmentInputs(split)
    },
    now,
    newId
  )

  // Deleting segments flags the links that used them, so the links are read again unless every
  // segment that went was one of the row's own (whose links were removed first).
  const ownTargets = new Set(row.targetIds)
  const savedIds = new Set(saved.segments.map((segment) => segment.id))
  const touchedOthers = target.segments.some(
    (segment) => !savedIds.has(segment.id) && !ownTargets.has(segment.id)
  )
  let created: LinkRecord | null = null

  if (rowIndices.length > 0) {
    const by = args.by ?? BY_HAND
    const byHand = by.origin === 'human'
    const targetIds = rowIndices.map((i) => saved.segments[i].id)
    created = createLink(
      db,
      chapterId,
      {
        kind: byHand ? 'user' : 'ai',
        status: 'ok',
        // A person writing a row has looked at it by definition; a machine has not.
        reviewedAt: byHand ? now : null,
        members: [sourceId, ...targetIds]
      },
      now,
      newId()
    )
    for (const segmentId of targetIds) {
      setProvenance(db, {
        segmentId,
        origin: by.origin,
        provider: by.provider,
        model: by.model,
        at: now
      })
    }
  }
  const remaining = links.filter((link) => !own.includes(link))
  return {
    target: saved,
    links: touchedOthers ? listLinks(db, chapterId) : created ? [...remaining, created] : remaining
  }
}
