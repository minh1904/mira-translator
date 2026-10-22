import type {
  AgentAttachment,
  AgentContext,
  AgentContextSearchGroup,
  AgentContextSearchInput,
  AgentContextSearchItem
} from '../../../shared/contracts/agent'
import type { AddressingDyadItem, CharacterItem } from '../../../shared/contracts/addressing'
import type { ContextEntryItem, ContextKind } from '../../../shared/contracts/glossary'
import { getCharacter, getDyad, listDyads } from '../../infra/storage/addressingEntries'
import { getContextEntry, listContextEntries } from '../../infra/storage/contextEntries'
import type { Db } from '../../infra/storage/sqlite'
import type { LibraryStore } from '../library/library'

/** Rows per picker group; together they make `AGENT_CONTEXT_SEARCH_LIMIT`. */
const GROUP_LIMITS = { work: 10, chapter: 20, glossary: 10, addressing: 10 } as const

const KIND_LABELS: Record<Exclude<ContextKind, 'dyad'>, string> = {
  term: 'Thuật ngữ',
  character: 'Nhân vật',
  world: 'Thế giới',
  style: 'Văn phong',
  summary: 'Tóm tắt'
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

function matches(query: string, ...texts: Array<string | null | undefined>): boolean {
  return query === '' || texts.some((text) => text && normalize(text).includes(query))
}

export function chapterLabel(number: number): string {
  return `Chương ${number}`
}

function entryLabel(entry: ContextEntryItem): string {
  return entry.target ? `${entry.source} → ${entry.target}` : entry.source
}

function dyadLabel(source: CharacterItem, target: CharacterItem): string {
  return `${source.target || source.source} ↔ ${target.target || target.source}`
}

function entryContent(entry: ContextEntryItem): string {
  const kind = entry.kind === 'dyad' ? 'Xưng hô' : KIND_LABELS[entry.kind]
  const parts = [`[${kind}] ${entryLabel(entry)}`]
  if (entry.aliases.length > 0) parts.push(`Dạng khác: ${entry.aliases.join(', ')}`)
  if (entry.forbidden) parts.push('Không dùng bản dịch này')
  if (entry.notes) parts.push(`Ghi chú: ${entry.notes}`)
  return parts.join('. ')
}

function dyadContent(
  dyad: AddressingDyadItem,
  source: CharacterItem,
  target: CharacterItem
): string {
  const parts = [
    `[Xưng hô] ${source.target || source.source} nói với ${target.target || target.source}: tự xưng "${dyad.speakerPronoun}", gọi "${dyad.recipientPronoun}"`
  ]
  if (dyad.secondPerson) parts.push(`ngôi hai "${dyad.secondPerson}"`)
  if (dyad.formality) parts.push(dyad.formality)
  if (dyad.notes) parts.push(`Ghi chú: ${dyad.notes}`)
  return parts.join('; ')
}

/** An approved pair with both of its people approved, or null. */
function approvedDyad(
  db: Db,
  dyad: AddressingDyadItem | null
): { dyad: AddressingDyadItem; source: CharacterItem; target: CharacterItem } | null {
  if (dyad?.status !== 'approved') return null
  const source = getCharacter(db, dyad.sourceCharacterId)
  const target = getCharacter(db, dyad.targetCharacterId)
  if (source?.status !== 'approved' || target?.status !== 'approved') return null
  return { dyad, source, target }
}

/**
 * The + picker's rows for a query: works, chapters of the open work, then approved glossary entries
 * and addressing pairs of that work. Entries waiting for review never appear (decision 9).
 */
export function searchContext(
  library: LibraryStore,
  input: AgentContextSearchInput
): AgentContextSearchGroup[] {
  const query = normalize(input.query)
  const groups: AgentContextSearchGroup[] = []
  const add = (kind: AgentContextSearchGroup['kind'], items: AgentContextSearchItem[]) => {
    if (items.length > 0) groups.push({ kind, items: items.slice(0, GROUP_LIMITS[kind]) })
  }

  const works = library.list().works
  add(
    'work',
    works
      .filter((work) => matches(query, work.title, work.originalTitle))
      // The open work comes first.
      .sort((a, b) => Number(b.id === input.workId) - Number(a.id === input.workId))
      .map((work) => ({
        attachment: { kind: 'work', workId: work.id, label: work.title },
        detail: work.originalTitle
      }))
  )

  const workId = input.workId
  const work = workId ? works.find((candidate) => candidate.id === workId) : undefined
  if (!work) return groups

  add(
    'chapter',
    library
      .listChapters(work.id)
      .filter((chapter) => matches(query, chapterLabel(chapter.number), chapter.title))
      .map((chapter) => ({
        attachment: {
          kind: 'chapter',
          workId: work.id,
          chapterId: chapter.id,
          label: chapterLabel(chapter.number)
        },
        detail: chapter.title || null
      }))
  )

  library.withWork(work.id, (db) => {
    add(
      'glossary',
      listContextEntries(db, { status: 'approved', query: input.query })
        .filter((entry) => entry.kind !== 'dyad')
        .map((entry) => ({
          attachment: {
            kind: 'glossary',
            workId: work.id,
            entryId: entry.id,
            label: entryLabel(entry)
          },
          detail: KIND_LABELS[entry.kind as Exclude<ContextKind, 'dyad'>]
        }))
    )
    add(
      'addressing',
      listDyads(db, { status: 'approved' })
        .map((dyad) => approvedDyad(db, dyad))
        .filter((found) => found !== null)
        .filter(({ source, target }) =>
          matches(query, source.source, source.target, target.source, target.target)
        )
        .map(({ dyad, source, target }) => ({
          attachment: {
            kind: 'addressing',
            workId: work.id,
            entryId: dyad.id,
            label: dyadLabel(source, target)
          },
          detail: `${dyad.speakerPronoun} / ${dyad.recipientPronoun}`
        }))
    )
  })
  return groups
}

/** The text of an approved glossary entry or addressing pair, or null when it is gone or unapproved. */
function attachmentContent(library: LibraryStore, attachment: AgentAttachment): string | null {
  if (attachment.kind !== 'glossary' && attachment.kind !== 'addressing') return null
  try {
    return library.withWork(attachment.workId, (db) => {
      if (attachment.kind === 'addressing') {
        const found = approvedDyad(db, getDyad(db, attachment.entryId))
        return found ? dyadContent(found.dyad, found.source, found.target) : null
      }
      const entry = getContextEntry(db, attachment.entryId)
      return entry && entry.kind !== 'dyad' && entry.status === 'approved'
        ? entryContent(entry)
        : null
    })
  } catch {
    // The work was deleted or cannot be opened: the attachment is dropped with a note.
    return null
  }
}

/**
 * The context main stores for a turn: glossary and addressing attachments carry the text read now,
 * so continuing the turn or reading it later shows what was sent, not what the entry says later.
 */
export function snapshotContext(library: LibraryStore, context: AgentContext): AgentContext {
  if (!context.attachments?.length) return context
  return {
    ...context,
    attachments: context.attachments.map((attachment) =>
      attachment.kind === 'glossary' || attachment.kind === 'addressing'
        ? { ...attachment, content: attachmentContent(library, attachment) }
        : attachment
    )
  }
}

/** Prompt lines for the glossary entries and addressing pairs the user attached. */
export function describeAttachedEntries(context: AgentContext): string[] {
  const entries = (context.attachments ?? []).filter(
    (attachment): attachment is Extract<AgentAttachment, { kind: 'glossary' | 'addressing' }> =>
      attachment.kind === 'glossary' || attachment.kind === 'addressing'
  )
  if (entries.length === 0) return []
  const lines = ['', 'Ngữ cảnh người dùng đính kèm:']
  for (const entry of entries) {
    lines.push(
      entry.content
        ? `- ${entry.content}`
        : `- "${entry.label}" không còn được duyệt hoặc đã bị xóa; đã bỏ khỏi ngữ cảnh.`
    )
  }
  return lines
}
