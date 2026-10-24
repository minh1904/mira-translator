import { useEffect, useState, type JSX } from 'react'
import type {
  ContextChangeActor,
  ContextEntryChange,
  ContextEntryHistory,
  ContextEntryItem
} from '../../../../../shared/contracts/glossary'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog, type ConfirmRequest } from '../../../components/ui/ConfirmDialog'
import { Dialog } from '../../../components/ui/Dialog'

const ACTOR_LABELS: Record<ContextChangeActor, string> = {
  ai: 'AI',
  user: 'Bạn',
  user_edit_signal: 'Học từ bản dịch bạn sửa',
  code: 'Tự động'
}

const FIELD_LABELS: Record<string, string> = {
  source: 'Từ gốc',
  target: 'Bản dịch',
  notes: 'Ghi chú',
  aliases: 'Biến thể',
  addressing: 'Xưng hô'
}

/** One line of history: who, what changed, from which chapter, and the quote behind it. */
export function describeChange(
  change: ContextEntryChange,
  chapterNumber: (chapterId: string | null) => number | undefined
): { title: string; detail: string | null } {
  const who = ACTOR_LABELS[change.actor]
  const field = FIELD_LABELS[change.field] ?? change.field
  const from = chapterNumber(change.fromChapterId)
  const title =
    change.kind === 'create'
      ? `${who} tạo: ${change.newValue ?? ''}`
      : `${who} đổi ${field.toLowerCase()}: ${change.oldValue || '—'} → ${change.newValue || '—'}` +
        (change.kind === 'progression' && from !== undefined ? ` (từ C.${from})` : '')
  const quoteAt = chapterNumber(change.quoteChapterId)
  const detail = change.quote
    ? `${quoteAt !== undefined ? `C.${quoteAt}: ` : ''}“${change.quote}”`
    : null
  return { title, detail }
}

export function EntryHistoryView({
  history,
  chapterNumber,
  onRetranslate
}: {
  history: ContextEntryHistory
  chapterNumber: (chapterId: string | null) => number | undefined
  onRetranslate(chapterIds: string[]): Promise<void>
}): JSX.Element {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const affected = history.affectedChapterIds
  const labels = affected.map((id) => `C.${chapterNumber(id) ?? '?'}`).join(', ')
  return (
    <div className="flex flex-col gap-3 text-body-xs">
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {affected.length > 0 && (
        <div className="flex flex-col gap-2 rounded-sm border border-default bg-subtle p-2">
          <span className="text-default">
            {affected.length} chương đã dịch trước lần sửa này vẫn dùng bản dịch cũ: {labels}
          </span>
          <div>
            <Button
              variant="light"
              disabled={done}
              onClick={() =>
                setConfirm({
                  title: 'Dịch lại các chương này?',
                  description: `Bản dịch hiện có của ${labels} sẽ bị ghi đè bằng bản dịch mới theo từ điển hiện tại.`,
                  confirmLabel: 'Dịch lại',
                  onConfirm: () => {
                    onRetranslate(affected)
                      .then(() => setDone(true))
                      .catch((err: unknown) =>
                        setError(err instanceof Error ? err.message : 'Không tạo được tác vụ dịch.')
                      )
                  }
                })
              }
            >
              {done ? 'Đã tạo tác vụ dịch lại' : 'Dịch lại các chương này'}
            </Button>
          </div>
        </div>
      )}
      {history.changes.length === 0 ? (
        <span className="text-subtle">Chưa có thay đổi nào.</span>
      ) : (
        <ol className="flex flex-col divide-y divide-default">
          {history.changes.map((change) => {
            const line = describeChange(change, chapterNumber)
            return (
              <li key={change.id} className="flex flex-col gap-0.5 py-2">
                <span className="text-default">{line.title}</span>
                {line.detail && <span className="text-subtle">{line.detail}</span>}
                <span className="text-subtle">
                  {new Date(change.createdAt).toLocaleString('vi-VN')}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

/** The history of one entry, newest first, with the chapters a correction left out of date. */
export function EntryHistoryDialog({
  workId,
  entry,
  onOpenChange,
  chapterNumber
}: {
  workId: string
  entry: ContextEntryItem | null
  onOpenChange(open: boolean): void
  chapterNumber: (chapterId: string | null) => number | undefined
}): JSX.Element {
  const [history, setHistory] = useState<ContextEntryHistory | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!entry) return
    let active = true
    setHistory(null)
    window.mira.glossary.history({ workId, entryId: entry.id }).then((res) => {
      if (!active) return
      if (res.ok) setHistory(res.value)
      else setError(res.error.message)
    })
    return () => {
      active = false
    }
  }, [workId, entry])

  const retranslate = async (chapterIds: string[]): Promise<void> => {
    const res = await window.mira.agent.tasks.create({
      clientCommandId: crypto.randomUUID(),
      workId,
      chapterIds,
      contextStrategy: 'approved_only'
    })
    if (!res.ok) throw new Error(res.error.message)
  }

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={onOpenChange}
      title={`Lịch sử: ${entry?.source ?? ''}`}
    >
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : history ? (
        <EntryHistoryView
          history={history}
          chapterNumber={chapterNumber}
          onRetranslate={retranslate}
        />
      ) : (
        <span className="text-body-xs text-subtle">Đang tải…</span>
      )}
    </Dialog>
  )
}
