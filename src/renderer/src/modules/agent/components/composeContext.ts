import {
  AGENT_ATTACHMENT_LIMIT,
  type AgentAttachment,
  type AgentChatMode,
  type AgentContext,
  type AgentSelection
} from '../../../../../shared/contracts/agent'
import type { ContextLabels } from '../adapter/workspaceAdapter'

/**
 * A chip of the composer's context row. The suggested chip is what is open in the workspace; it is
 * sent only once added. The selection chip is always sent. Attachment chips are what the user added.
 */
export type ComposerChip =
  | { type: 'suggested'; key: string; kind: 'work' | 'chapter'; label: string; added: boolean }
  | { type: 'selection'; key: string; label: string; selection: AgentSelection }
  | { type: 'attachment'; key: string; label: string; attachment: AgentAttachment }

export interface ComposeInput {
  /** What the workspace has open now, from the adapter. */
  active: AgentContext
  labels: ContextLabels
  mode: AgentChatMode
  /** The user's choice for the suggested chip; `null` follows the mode (Ask adds it, Agent dims it). */
  implicitAdded: boolean | null
  attachments: AgentAttachment[]
}

export interface ComposedContext {
  /** Suggested chip first, then the selection, then attachments in the order they were added. */
  chips: ComposerChip[]
  /** Exactly what the chips say is sent. */
  context: AgentContext
}

const sideName = (side: 'source' | 'target'): string => (side === 'source' ? 'bản gốc' : 'bản dịch')

export function selectionLabel({ side, from, to }: AgentSelection): string {
  return from === to ? `Đoạn ${from} ${sideName(side)}` : `Đoạn ${from}–${to} ${sideName(side)}`
}

/** Identity of an attachment, so the same chapter, entry or pinned range is not added twice. */
export function attachmentKey(attachment: AgentAttachment): string {
  switch (attachment.kind) {
    case 'work':
      return `work:${attachment.workId}`
    case 'chapter': {
      const range = attachment.range
      return `chapter:${attachment.chapterId}${range ? `:${range.side}:${range.from}-${range.to}` : ''}`
    }
    default:
      return `${attachment.kind}:${attachment.entryId}`
  }
}

/** Whether the suggested chip is added, given the user's choice and the mode. */
export function isImplicitAdded(implicitAdded: boolean | null, mode: AgentChatMode): boolean {
  return implicitAdded ?? mode === 'ask'
}

export function composeContext(input: ComposeInput): ComposedContext {
  const { active, labels, attachments } = input
  const chips: ComposerChip[] = []
  const context: AgentContext = {}
  const taken = new Set(attachments.map(attachmentKey))

  const suggested: AgentAttachment | null = active.workId
    ? active.chapterId
      ? {
          kind: 'chapter',
          workId: active.workId,
          chapterId: active.chapterId,
          label: labels.chapter ?? 'Chương đang mở'
        }
      : { kind: 'work', workId: active.workId, label: labels.work ?? 'Tác phẩm đang mở' }
    : null
  // When the user already attached what is open, the attachment chip stands for it.
  const shown = suggested !== null && !taken.has(attachmentKey(suggested))
  const added = isImplicitAdded(input.implicitAdded, input.mode)
  if (suggested && shown) {
    chips.push({
      type: 'suggested',
      key: `suggested:${attachmentKey(suggested)}`,
      kind: suggested.kind === 'chapter' ? 'chapter' : 'work',
      label: suggested.label,
      added
    })
  }

  // The selection goes with its chapter even while the chapter chip is dimmed.
  const sendsMain = (shown && added) || (active.chapterId && active.selection)
  if (sendsMain && active.workId) {
    context.workId = active.workId
    if (active.chapterId) {
      context.chapterId = active.chapterId
      if (active.caret) context.caret = active.caret
      if (active.selection) context.selection = active.selection
    }
  }
  if (context.selection) {
    chips.push({
      type: 'selection',
      key: 'selection',
      label: selectionLabel(context.selection),
      selection: context.selection
    })
  }

  for (const attachment of attachments) {
    chips.push({
      type: 'attachment',
      key: attachmentKey(attachment),
      label: attachment.label,
      attachment
    })
  }
  if (attachments.length > 0) context.attachments = attachments
  return { chips, context }
}

export type AddAttachmentResult =
  | { ok: true; attachments: AgentAttachment[] }
  | { ok: false; reason: 'duplicate' | 'full' }

/** Adds a chip unless it is already there or the row holds the most attachments a turn takes. */
export function addAttachment(
  attachments: AgentAttachment[],
  attachment: AgentAttachment
): AddAttachmentResult {
  const key = attachmentKey(attachment)
  if (attachments.some((item) => attachmentKey(item) === key)) {
    return { ok: false, reason: 'duplicate' }
  }
  if (attachments.length >= AGENT_ATTACHMENT_LIMIT) return { ok: false, reason: 'full' }
  return { ok: true, attachments: [...attachments, attachment] }
}

/** The attachment that keeps the current selection after the editor's selection moves on. */
export function pinnedSelection(
  active: AgentContext,
  labels: ContextLabels
): AgentAttachment | null {
  if (!active.workId || !active.chapterId || !active.selection) return null
  const chapter = labels.chapter ?? 'Chương đang mở'
  return {
    kind: 'chapter',
    workId: active.workId,
    chapterId: active.chapterId,
    label: `${chapter}, ${selectionLabel(active.selection).toLowerCase()}`,
    range: active.selection
  }
}
