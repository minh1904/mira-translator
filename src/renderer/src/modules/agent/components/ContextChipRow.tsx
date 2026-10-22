import type { JSX } from 'react'
import type { AgentAttachment, ResolvedTarget } from '../../../../../shared/contracts/agent'
import { ICON } from '../../../components/ui/icon'
import {
  BookBookmarkIcon,
  DocumentTextIcon,
  LibraryIcon,
  LinkIcon,
  UsersGroupRoundedIcon
} from '../../../components/ui/reicon'
import { SuggestedTag, Tag, TagAction } from '../../../components/ui/Tag'
import type { ComposerChip } from './composeContext'

function KindIcon({ kind }: { kind: AgentAttachment['kind'] }): JSX.Element {
  const Icon = {
    work: LibraryIcon,
    chapter: DocumentTextIcon,
    glossary: BookBookmarkIcon,
    addressing: UsersGroupRoundedIcon
  }[kind]
  return <Icon size={ICON.xs} aria-hidden="true" className="shrink-0 text-subtle" />
}

/** Where clicking an attachment chip goes; a glossary entry or pair opens its work for now. */
function targetOf(attachment: AgentAttachment): ResolvedTarget {
  return attachment.kind === 'chapter'
    ? {
        kind: 'chapter',
        workId: attachment.workId,
        workLabel: '',
        chapterId: attachment.chapterId,
        chapterLabel: attachment.label
      }
    : { kind: 'work', workId: attachment.workId, workLabel: attachment.label }
}

export interface ContextChipRowProps {
  chips: ComposerChip[]
  onAddSuggested(): void
  onRemoveSuggested(): void
  onDismissWork(): void
  onPinSelection(): void
  onRemove(key: string): void
  onOpenTarget?: (target: ResolvedTarget) => void
}

/**
 * Hàng ngữ cảnh phía trên chỗ gõ (C1–C3, C5): chip tác phẩm đang mở luôn được gửi và tắt được, chip
 * chương gợi ý mờ cho tới khi được thêm, chip vùng chọn luôn được gửi và ghim được, chip người dùng thêm
 * có × bên trái. Không có chip thì không vẽ gì.
 */
export function ContextChipRow({
  chips,
  onAddSuggested,
  onRemoveSuggested,
  onDismissWork,
  onPinSelection,
  onRemove,
  onOpenTarget
}: ContextChipRowProps): JSX.Element | null {
  if (chips.length === 0) return null
  return (
    <ul
      aria-label="Ngữ cảnh gửi kèm"
      className="m-0 flex list-none flex-wrap gap-2xs p-0 px-0.5 pb-1"
    >
      {chips.map((chip) => (
        <li key={chip.key} className="min-w-0 max-w-full">
          {chip.type === 'work' ? (
            <Tag
              icon={<KindIcon kind="work" />}
              removeLabel={`Bỏ ${chip.label} khỏi ngữ cảnh`}
              onRemove={onDismissWork}
            >
              {chip.label}
            </Tag>
          ) : chip.type === 'suggested' ? (
            chip.added ? (
              <Tag
                icon={<KindIcon kind={chip.kind} />}
                removeLabel={`Bỏ ${chip.label} khỏi ngữ cảnh`}
                onRemove={onRemoveSuggested}
              >
                {chip.label}
              </Tag>
            ) : (
              <SuggestedTag
                icon={<KindIcon kind={chip.kind} />}
                label={`Thêm ${chip.label} vào ngữ cảnh`}
                title="Ngữ cảnh gợi ý: bấm để gửi kèm"
                onAdd={onAddSuggested}
              >
                {chip.label}
              </SuggestedTag>
            )
          ) : chip.type === 'selection' ? (
            <Tag
              action={
                <TagAction
                  label={`Ghim ${chip.label} vào ngữ cảnh`}
                  title="Ghim: giữ đoạn này khi chọn đoạn khác"
                  icon={<LinkIcon size={ICON.xs} aria-hidden="true" />}
                  onClick={onPinSelection}
                />
              }
            >
              {chip.label}
            </Tag>
          ) : (
            <Tag
              icon={<KindIcon kind={chip.attachment.kind} />}
              removeLabel={`Bỏ ${chip.label} khỏi ngữ cảnh`}
              onRemove={() => onRemove(chip.key)}
              onOpen={onOpenTarget && (() => onOpenTarget(targetOf(chip.attachment)))}
              openLabel={`Mở ${chip.label}`}
            >
              {chip.label}
            </Tag>
          )}
        </li>
      ))}
    </ul>
  )
}
