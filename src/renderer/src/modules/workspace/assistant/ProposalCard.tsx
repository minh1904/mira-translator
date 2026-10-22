import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ChatToolProposal } from '../../../../../shared/contracts/aiChat'
import type {
  ProposalPartStatus,
  ProposalPartView,
  ProposalQueueItem
} from '../../../../../shared/contracts/aiProposals'
import type { ContextStatus } from '../../../../../shared/contracts/glossary'
import { Button, LinkButton } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { isOpenPart, PART_STATUS_LABEL, proposalStatus } from './proposalStatus'

/**
 * Thẻ hiển thị đề xuất thay đổi nội dung hoặc thuật ngữ.
 * Trạng thái của đề xuất luôn được đồng bộ trực tiếp từ hàng chờ chương hoặc glossary.
 */

const TONE: Record<ProposalPartStatus, string> = {
  pending: 'text-subtle',
  applied: 'text-success',
  rejected: 'text-subtle',
  conflict: 'text-error',
  stale: 'text-warning',
  'needs-placement': 'text-warning'
}

/** Thẻ đề xuất: hiển thị tiêu đề, trạng thái, văn bản trước/sau và các nút thao tác. */
export function ProposalCard({
  title,
  status,
  statusLabel,
  before,
  after,
  note,
  onAccept,
  onDeny,
  onShow,
  acceptDisabled
}: {
  title: string
  status: ProposalPartStatus | null
  /** Nhãn trạng thái tùy chỉnh thay thế cho nhãn mặc định của `status`. */
  statusLabel?: string
  before: string
  after: string
  note?: string
  onAccept?: () => void
  onDeny?: () => void
  onShow?: () => void
  acceptDisabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const label = statusLabel ?? (status === null ? 'Đang tải…' : PART_STATUS_LABEL[status])
  return (
    <div className="rounded-sm border border-default bg-surface p-2 text-body-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-default">{title}</span>
        <span className={cn('shrink-0', status === null ? 'text-subtle' : TONE[status])}>
          {label}
        </span>
      </div>
      {note && <p className="mt-1 text-subtle">{note}</p>}
      <LinkButton
        color="neutral"
        aria-expanded={open}
        className="mt-1"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Thu gọn' : 'Xem trước và sau'}
      </LinkButton>
      {open && (
        <div className="mt-2 space-y-2">
          {before !== '' && (
            <div>
              <p className="text-subtle">Trước</p>
              <pre className="selectable max-h-32 overflow-auto whitespace-pre-wrap text-default">
                {before}
              </pre>
            </div>
          )}
          <div>
            <p className="text-subtle">Sau</p>
            <pre className="selectable max-h-32 overflow-auto whitespace-pre-wrap text-default">
              {after}
            </pre>
          </div>
        </div>
      )}
      {(onAccept || onDeny || onShow) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {onShow && <Button onClick={onShow}>Xem trong bản dịch</Button>}
          {onAccept && (
            <Button variant="solid" disabled={acceptDisabled} onClick={onAccept}>
              Chấp nhận
            </Button>
          )}
          {onDeny && <Button onClick={onDeny}>Bỏ</Button>}
        </div>
      )}
    </div>
  )
}

/** Các thao tác người dùng có thể thực hiện trên một đề xuất văn bản. */
export interface ProposalActions {
  accept(partIds: string[]): void
  deny(partIds: string[]): void
  show(part: ProposalPartView): void
}

/** Thẻ hiển thị đề xuất chỉnh sửa văn bản bên dưới lượt hỏi, lấy dữ liệu từ hàng chờ theo ID. */
export function TextProposalCard({
  proposal,
  item,
  actions
}: {
  proposal: Extract<ChatToolProposal, { type: 'edit' | 'translation' }>
  /** Dữ liệu đề xuất lấy từ hàng chờ; `undefined` khi đang tải lại hoặc không còn trong danh sách. */
  item: ProposalQueueItem | undefined
  actions: ProposalActions
}): JSX.Element {
  const parts = item?.parts.filter((part) => proposal.partIds.includes(part.id)) ?? []
  const status = proposalStatus(parts)
  const open = parts.filter(isOpenPart)
  const placeable = open.filter((part) => part.status !== 'needs-placement')
  const shown = parts.find(
    (part) => part.baseFrom !== null && part.baseTo !== null && isOpenPart(part)
  )
  return (
    <ProposalCard
      title={proposal.label}
      status={item === undefined ? null : status}
      statusLabel={item === undefined ? 'Không còn trong hàng chờ của chương' : undefined}
      before={parts.map((part) => part.beforeText).join('\n\n')}
      after={parts.map((part) => part.afterText).join('\n\n')}
      note={
        open.some((part) => part.status === 'needs-placement')
          ? 'Chưa tìm được chỗ đặt trong bản dịch; đặt vị trí trong hàng chờ.'
          : undefined
      }
      onShow={shown ? () => actions.show(shown) : undefined}
      onAccept={
        open.length > 0 ? () => actions.accept(placeable.map((part) => part.id)) : undefined
      }
      acceptDisabled={placeable.length === 0}
      onDeny={open.length > 0 ? () => actions.deny(open.map((part) => part.id)) : undefined}
    />
  )
}

const TERM_LABEL: Record<ContextStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã bỏ'
}

const TERM_TONE: Record<ContextStatus, ProposalPartStatus> = {
  pending: 'pending',
  approved: 'applied',
  rejected: 'rejected'
}

/** Thẻ hiển thị đề xuất thuật ngữ glossary: cho phép duyệt hoặc từ chối trực tiếp. */
export function TermProposalCard({
  workId,
  proposal
}: {
  workId: string
  proposal: Extract<ChatToolProposal, { type: 'term' }>
}): JSX.Element {
  const [status, setStatus] = useState<ContextStatus | 'missing' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.mira.glossary.get({ workId, entryId: proposal.entryId }).then((result) => {
      if (active) setStatus(result.ok ? result.value.status : 'missing')
    })
    return () => {
      active = false
    }
  }, [workId, proposal.entryId])

  const decide = useCallback(
    async (next: ContextStatus): Promise<void> => {
      const result = await window.mira.glossary.update({
        workId,
        entryId: proposal.entryId,
        status: next
      })
      if (result.ok) {
        setStatus(result.value.status)
        setError(null)
      } else setError(result.error.message)
    },
    [workId, proposal.entryId]
  )

  const known = status !== null && status !== 'missing'
  return (
    <ProposalCard
      title={proposal.label}
      status={known ? TERM_TONE[status] : null}
      statusLabel={
        status === 'missing'
          ? 'Mục đã bị xóa khỏi glossary'
          : known
            ? TERM_LABEL[status]
            : undefined
      }
      before=""
      after={`${proposal.term} → ${proposal.translation}`}
      note={error ?? undefined}
      onAccept={status === 'pending' ? () => void decide('approved') : undefined}
      onDeny={status === 'pending' ? () => void decide('rejected') : undefined}
    />
  )
}
