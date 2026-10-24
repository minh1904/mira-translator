import type { AgentContext, ResolvedTarget } from '../../../shared/contracts/agent'
import type { WorkSummary } from '../../../shared/contracts/library'
import type { LibraryStore } from '../library/library'

export interface TargetSelector {
  workId?: string
  workTitle?: string
  chapterId?: string
  chapterTitle?: string
  chapterNumber?: number
  relative?: 'current_chapter' | 'current_work'
  side?: 'source' | 'target'
  range?: { from: number; to: number }
}

export interface ResolveTargetInput {
  selector?: TargetSelector
  context?: AgentContext
  currentResolvedTarget?: ResolvedTarget
}

export interface AmbiguousCandidate {
  workId: string
  workLabel: string
  chapterId?: string
  chapterLabel?: string
}

export type ResolveTargetResult =
  | { status: 'resolved'; target: ResolvedTarget }
  | {
      status: 'ambiguous'
      reason: string
      candidates: AmbiguousCandidate[]
    }
  | { status: 'not_found'; reason: string }

function normalizeText(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * Deterministic target resolver for work and chapter resources (D4).
 *
 * Rules:
 * 1. If an operation target is already resolved (retry / idempotent rerun), return it without re-resolving.
 * 2. If selector is relative ("chương này", "current_chapter"), resolve from context; if missing or deleted, fail.
 * 3. If explicit resource is named (work / chapter), resolve deterministically.
 * 4. If chapter is named without work, check context work first, then global works.
 * 5. If more than one candidate matches equally, return ambiguous clarify state.
 */
export function resolveTarget(
  library: LibraryStore,
  input: ResolveTargetInput
): ResolveTargetResult {
  // 1. Retry / already resolved target is immutable
  if (input.currentResolvedTarget) {
    return { status: 'resolved', target: input.currentResolvedTarget }
  }

  const selector = input.selector ?? {}
  const context = input.context ?? {}
  const allWorks = library.list().works

  // Helper to find work by ID
  const findWorkById = (id: string): WorkSummary | undefined => {
    return allWorks.find((w) => w.id === id)
  }

  // 2. Relative selector ("current_chapter")
  if (selector.relative === 'current_chapter') {
    if (!context.workId || !context.chapterId) {
      return {
        status: 'ambiguous',
        reason: 'Không có chương hiện tại trong ngữ cảnh để phân giải "chương này".',
        candidates: []
      }
    }
    const work = findWorkById(context.workId)
    if (!work) {
      return { status: 'not_found', reason: 'Tác phẩm trong ngữ cảnh không còn tồn tại.' }
    }
    const chapters = library.listChapters(work.id)
    const chapter = chapters.find((c) => c.id === context.chapterId)
    if (!chapter) {
      return { status: 'not_found', reason: 'Chương trong ngữ cảnh không còn tồn tại.' }
    }
    return {
      status: 'resolved',
      target: {
        kind: 'chapter',
        workId: work.id,
        workLabel: work.title,
        chapterId: chapter.id,
        chapterLabel: chapter.title,
        side: selector.side,
        range: selector.range
      }
    }
  }

  // Relative selector ("current_work")
  if (selector.relative === 'current_work') {
    if (!context.workId) {
      return {
        status: 'ambiguous',
        reason: 'Không có tác phẩm hiện tại trong ngữ cảnh.',
        candidates: []
      }
    }
    const work = findWorkById(context.workId)
    if (!work) {
      return { status: 'not_found', reason: 'Tác phẩm trong ngữ cảnh không còn tồn tại.' }
    }
    return {
      status: 'resolved',
      target: {
        kind: 'work',
        workId: work.id,
        workLabel: work.title
      }
    }
  }

  // 3. Resolve work if workId or workTitle is provided
  let targetWork: WorkSummary | undefined
  if (selector.workId) {
    targetWork = findWorkById(selector.workId)
    if (!targetWork) {
      return { status: 'not_found', reason: `Không tìm thấy tác phẩm với ID ${selector.workId}.` }
    }
  } else if (selector.workTitle) {
    const query = normalizeText(selector.workTitle)
    const matchingWorks = allWorks.filter((w) => normalizeText(w.title) === query)
    if (matchingWorks.length === 0) {
      // Try substring match if no exact match
      const substringMatches = allWorks.filter((w) => normalizeText(w.title).includes(query))
      if (substringMatches.length === 1) {
        targetWork = substringMatches[0]
      } else if (substringMatches.length > 1) {
        return {
          status: 'ambiguous',
          reason: `Tìm thấy nhiều tác phẩm có tên chứa "${selector.workTitle}".`,
          candidates: substringMatches.map((w) => ({ workId: w.id, workLabel: w.title }))
        }
      } else {
        return {
          status: 'not_found',
          reason: `Không tìm thấy tác phẩm "${selector.workTitle}".`
        }
      }
    } else if (matchingWorks.length > 1) {
      return {
        status: 'ambiguous',
        reason: `Có ${matchingWorks.length} tác phẩm trùng tên "${selector.workTitle}".`,
        candidates: matchingWorks.map((w) => ({ workId: w.id, workLabel: w.title }))
      }
    } else {
      targetWork = matchingWorks[0]
    }
  } else if (context.workId) {
    targetWork = findWorkById(context.workId)
  }

  // 4. Chapter specified with targetWork resolved
  if (targetWork) {
    const chapters = library.listChapters(targetWork.id)

    if (selector.chapterId) {
      const chapter = chapters.find((c) => c.id === selector.chapterId)
      if (!chapter) {
        return {
          status: 'not_found',
          reason: `Không tìm thấy chương với ID ${selector.chapterId} trong tác phẩm "${targetWork.title}".`
        }
      }
      return {
        status: 'resolved',
        target: {
          kind: 'chapter',
          workId: targetWork.id,
          workLabel: targetWork.title,
          chapterId: chapter.id,
          chapterLabel: chapter.title,
          side: selector.side,
          range: selector.range
        }
      }
    }

    if (selector.chapterNumber !== undefined) {
      const chapter = chapters.find((c) => c.number === selector.chapterNumber)
      if (!chapter) {
        return {
          status: 'not_found',
          reason: `Không tìm thấy chương số ${selector.chapterNumber} trong tác phẩm "${targetWork.title}".`
        }
      }
      return {
        status: 'resolved',
        target: {
          kind: 'chapter',
          workId: targetWork.id,
          workLabel: targetWork.title,
          chapterId: chapter.id,
          chapterLabel: chapter.title,
          side: selector.side,
          range: selector.range
        }
      }
    }

    if (selector.chapterTitle) {
      const query = normalizeText(selector.chapterTitle)
      const matchingChapters = chapters.filter((c) => normalizeText(c.title) === query)
      if (matchingChapters.length === 1) {
        return {
          status: 'resolved',
          target: {
            kind: 'chapter',
            workId: targetWork.id,
            workLabel: targetWork.title,
            chapterId: matchingChapters[0].id,
            chapterLabel: matchingChapters[0].title,
            side: selector.side,
            range: selector.range
          }
        }
      }
      if (matchingChapters.length > 1) {
        return {
          status: 'ambiguous',
          reason: `Có nhiều chương cùng tên "${selector.chapterTitle}" trong tác phẩm "${targetWork.title}".`,
          candidates: matchingChapters.map((c) => ({
            workId: targetWork!.id,
            workLabel: targetWork!.title,
            chapterId: c.id,
            chapterLabel: c.title
          }))
        }
      }
      // Substring match
      const subMatches = chapters.filter((c) => normalizeText(c.title).includes(query))
      if (subMatches.length === 1) {
        return {
          status: 'resolved',
          target: {
            kind: 'chapter',
            workId: targetWork.id,
            workLabel: targetWork.title,
            chapterId: subMatches[0].id,
            chapterLabel: subMatches[0].title,
            side: selector.side,
            range: selector.range
          }
        }
      }
      if (subMatches.length > 1) {
        return {
          status: 'ambiguous',
          reason: `Tìm thấy nhiều chương có tên chứa "${selector.chapterTitle}" trong tác phẩm "${targetWork.title}".`,
          candidates: subMatches.map((c) => ({
            workId: targetWork!.id,
            workLabel: targetWork!.title,
            chapterId: c.id,
            chapterLabel: c.title
          }))
        }
      }
      return {
        status: 'not_found',
        reason: `Không tìm thấy chương "${selector.chapterTitle}" trong tác phẩm "${targetWork.title}".`
      }
    }

    // No chapter selector specified: target is the entire work
    return {
      status: 'resolved',
      target: {
        kind: 'work',
        workId: targetWork.id,
        workLabel: targetWork.title
      }
    }
  }

  // 5. Chapter selector specified WITHOUT work selector
  const hasChapterSelector =
    selector.chapterId || selector.chapterTitle || selector.chapterNumber !== undefined

  if (hasChapterSelector) {
    // If context has workId, try context work first
    if (context.workId) {
      const contextWork = findWorkById(context.workId)
      if (contextWork) {
        const chapters = library.listChapters(contextWork.id)
        let foundChapter = selector.chapterId
          ? chapters.find((c) => c.id === selector.chapterId)
          : undefined
        if (!foundChapter && selector.chapterNumber !== undefined) {
          foundChapter = chapters.find((c) => c.number === selector.chapterNumber)
        }
        if (!foundChapter && selector.chapterTitle) {
          const query = normalizeText(selector.chapterTitle)
          const matches = chapters.filter((c) => normalizeText(c.title) === query)
          if (matches.length === 1) foundChapter = matches[0]
        }
        if (foundChapter) {
          return {
            status: 'resolved',
            target: {
              kind: 'chapter',
              workId: contextWork.id,
              workLabel: contextWork.title,
              chapterId: foundChapter.id,
              chapterLabel: foundChapter.title,
              side: selector.side,
              range: selector.range
            }
          }
        }
      }
    }

    // Search across all works
    const candidates: AmbiguousCandidate[] = []
    for (const work of allWorks) {
      const chapters = library.listChapters(work.id)
      for (const ch of chapters) {
        let matches = false
        if (selector.chapterId && ch.id === selector.chapterId) matches = true
        if (selector.chapterNumber !== undefined && ch.number === selector.chapterNumber)
          matches = true
        if (
          selector.chapterTitle &&
          normalizeText(ch.title) === normalizeText(selector.chapterTitle)
        )
          matches = true
        if (matches) {
          candidates.push({
            workId: work.id,
            workLabel: work.title,
            chapterId: ch.id,
            chapterLabel: ch.title
          })
        }
      }
    }

    if (candidates.length === 1) {
      const match = candidates[0]
      return {
        status: 'resolved',
        target: {
          kind: 'chapter',
          workId: match.workId,
          workLabel: match.workLabel,
          chapterId: match.chapterId!,
          chapterLabel: match.chapterLabel!,
          side: selector.side,
          range: selector.range
        }
      }
    }

    if (candidates.length > 1) {
      return {
        status: 'ambiguous',
        reason: `Tìm thấy ${candidates.length} chương phù hợp ở các tác phẩm khác nhau.`,
        candidates
      }
    }

    return {
      status: 'not_found',
      reason: 'Không tìm thấy chương phù hợp trong thư viện.'
    }
  }

  // 6. Neither work nor chapter specified
  if (context.workId) {
    const work = findWorkById(context.workId)
    if (work) {
      return {
        status: 'resolved',
        target: { kind: 'work', workId: work.id, workLabel: work.title }
      }
    }
  }

  return {
    status: 'ambiguous',
    reason: 'Không có mục tiêu nào được chỉ định và ngữ cảnh rỗng.',
    candidates: allWorks.map((w) => ({ workId: w.id, workLabel: w.title }))
  }
}

export class TargetResolver {
  constructor(private readonly options: { library: LibraryStore }) {}

  resolve(
    instructionOrInput: string | ResolveTargetInput,
    context?: AgentContext
  ): ResolveTargetResult {
    if (typeof instructionOrInput === 'string') {
      const selector: TargetSelector = {}
      const chapterNumMatch = /chương\s*(\d+)/i.exec(instructionOrInput)
      const chapterTitleMatch = /chương\s+([^\n,.!?]+)/i.exec(instructionOrInput)

      if (chapterNumMatch) {
        selector.chapterNumber = parseInt(chapterNumMatch[1], 10)
      } else if (chapterTitleMatch) {
        selector.chapterTitle = chapterTitleMatch[1].trim()
      } else if (/chương này|đoạn này|hiện tại/i.test(instructionOrInput)) {
        selector.relative = 'current_chapter'
      }

      // A title written in full wins over the prefix rule, which would cut "Truyện" off "Truyện test";
      // the longest one, so "Truyện test 2" is not also "Truyện test".
      const lower = instructionOrInput.toLowerCase()
      const named = this.options.library
        .list()
        .works.filter((w) => w.title && lower.includes(w.title.toLowerCase()))
      const longest = Math.max(0, ...named.map((w) => w.title.length))
      const fullTitles = named.filter((w) => w.title.length === longest)
      const workPrefixMatch = /(?:tác phẩm|truyện|bộ)\s+([^\n,.!?]+?)(?:\s+chương|\s*$)/i.exec(
        instructionOrInput
      )
      if (fullTitles.length === 1) {
        selector.workTitle = fullTitles[0].title
      } else if (workPrefixMatch) {
        selector.workTitle = workPrefixMatch[1].trim()
      }

      return resolveTarget(this.options.library, { selector, context })
    }
    return resolveTarget(this.options.library, instructionOrInput)
  }
}
