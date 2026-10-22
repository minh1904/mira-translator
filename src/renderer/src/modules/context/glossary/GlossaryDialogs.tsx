import { useState, type ChangeEvent, type JSX } from 'react'
import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type {
  ContextEntryItem,
  ContextStatus,
  ImportNamesResult
} from '../../../../../shared/contracts/glossary'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Select, type SelectOption } from '../../../components/ui/Select'
import { Switch } from '../../../components/ui/Switch'
import { TextareaField } from '../../../components/ui/Field'
import { TextField } from '../../../components/ui/Field'

interface EditGlossaryDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  entry: ContextEntryItem | null
  chapters: ChapterItem[]
  onSave(data: {
    source: string
    target: string
    aliases: string[]
    forbidden: boolean
    status: ContextStatus
    fromChapterId: string | null
    toChapterId: string | null
    notes: string | null
  }): Promise<void>
}

export function EditGlossaryDialog({
  open,
  onOpenChange,
  entry,
  chapters,
  onSave
}: EditGlossaryDialogProps): JSX.Element {
  const isEditing = entry !== null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={isEditing ? 'Chỉnh sửa thuật ngữ' : 'Thêm thuật ngữ mới'}
      description={
        isEditing
          ? 'Cập nhật bản dịch, dạng viết khác hoặc phạm vi hiệu lực của thuật ngữ.'
          : 'Thêm thuật ngữ gốc và bản dịch để AI tự động tuân thủ khi dịch chương.'
      }
    >
      {open && (
        <EditGlossaryForm
          key={entry?.id ?? 'new'}
          entry={entry}
          chapters={chapters}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
        />
      )}
    </Dialog>
  )
}

function EditGlossaryForm({
  entry,
  chapters,
  onClose,
  onSave
}: {
  entry: ContextEntryItem | null
  chapters: ChapterItem[]
  onClose(): void
  onSave: EditGlossaryDialogProps['onSave']
}): JSX.Element {
  const [source, setSource] = useState(entry?.source ?? '')
  const [target, setTarget] = useState(entry?.target ?? '')
  const [aliasesText, setAliasesText] = useState((entry?.aliases ?? []).join(', '))
  const [forbidden, setForbidden] = useState(entry?.forbidden ?? false)

  const [fromChapterId, setFromChapterId] = useState<string>(entry?.fromChapterId ?? 'none')
  const [toChapterId, setToChapterId] = useState<string>(entry?.toChapterId ?? 'none')
  const [notes, setNotes] = useState(entry?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chapterOptions: SelectOption<string>[] = [
    { value: 'none', label: 'Không giới hạn' },
    ...chapters.map((c) => ({
      value: c.id,
      label: `Chương ${c.number}: ${c.title || 'Không tiêu đề'}`
    }))
  ]

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!source.trim()) {
      setError('Vui lòng nhập thuật ngữ gốc.')
      return
    }
    if (!target.trim()) {
      setError('Vui lòng nhập bản dịch đích.')
      return
    }

    setSaving(true)
    setError(null)

    const aliases = aliasesText
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)

    try {
      await onSave({
        source: source.trim(),
        target: target.trim(),
        aliases,
        forbidden,
        status: 'approved',
        fromChapterId: fromChapterId === 'none' ? null : fromChapterId,
        toChapterId: toChapterId === 'none' ? null : toChapterId,
        notes: notes.trim() || null
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu thuật ngữ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-body-xs">
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Thuật ngữ gốc (Source)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Ví dụ: 筑基, Linley, ..."
          autoFocus
        />
        <TextField
          label="Bản dịch đích (Target)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Ví dụ: Trúc Cơ, Lâm Lôi, ..."
        />
      </div>

      <TextField
        label="Dạng viết khác (Aliases, cách nhau bằng dấu phẩy)"
        value={aliasesText}
        onChange={(e) => setAliasesText(e.target.value)}
        placeholder="Ví dụ: Trúc Cơ Kỳ, Lập Ca, ..."
      />

      <div className="flex items-center gap-2 py-1">
        <Switch id="forbidden-switch" checked={forbidden} onCheckedChange={setForbidden} />
        <label htmlFor="forbidden-switch" className="cursor-pointer font-medium text-default">
          Thuật ngữ bị cấm (Cảnh báo khi dùng)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-default">Hiệu lực từ chương</label>
          <Select
            label="Từ chương"
            value={fromChapterId}
            options={chapterOptions}
            onChange={(val) => setFromChapterId(val)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-default">Đến hết chương</label>
          <Select
            label="Đến chương"
            value={toChapterId}
            options={chapterOptions}
            onChange={(val) => setToChapterId(val)}
          />
        </div>
      </div>

      <TextareaField
        label="Ghi chú ngữ cảnh (Tùy chọn)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Ghi chú về ngữ cảnh xuất hiện, lưu ý dịch..."
        rows={2}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>
          Hủy
        </Button>
        <Button variant="solid" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : entry ? 'Cập nhật' : 'Tạo thuật ngữ'}
        </Button>
      </div>
    </form>
  )
}

interface ImportNamesDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  onImport(content: string): Promise<ImportNamesResult>
}

export function ImportNamesDialog({
  open,
  onOpenChange,
  onImport
}: ImportNamesDialogProps): JSX.Element {
  const [content, setContent] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportNamesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text === 'string') {
        setContent(text)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleStartImport = async (): Promise<void> => {
    if (!content.trim()) {
      setError('Vui lòng chọn tệp hoặc dán nội dung Names.txt.')
      return
    }
    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const res = await onImport(content)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi nhập tệp.')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = (): void => {
    setContent('')
    setResult(null)
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Nhập thuật ngữ từ tệp Names.txt"
      description="Định dạng chuẩn: Từ_gốc=Từ_dịch (mỗi dòng một cặp). Bỏ qua các dòng chú thích bắt đầu bằng # hoặc //."
    >
      <div className="flex flex-col gap-4 text-body-xs">
        {error && (
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {result && (
          <Alert
            tone={result.importedCount > 0 ? 'success' : 'error'}
            onDismiss={() => setResult(null)}
          >
            <div className="flex flex-col gap-1">
              <p className="font-semibold">
                Đã nhập thành công {result.importedCount} thuật ngữ.
                {result.skippedCount > 0 && ` Bỏ qua ${result.skippedCount} dòng.`}
              </p>
              {result.skippedReasons.length > 0 && (
                <div className="max-h-36 overflow-y-auto pt-1 text-body-xs text-subtle">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {result.skippedReasons.slice(0, 50).map((s, idx) => (
                      <li key={idx}>
                        Dòng {s.line} ({s.raw}): {s.reason}
                      </li>
                    ))}
                    {result.skippedReasons.length > 50 && (
                      <li>... và {result.skippedReasons.length - 50} dòng khác.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-sm border border-strong bg-surface px-3 py-1.5 text-body-xs font-medium text-default hover:bg-hover">
            <span>Chọn tệp .txt từ máy</span>
            <input type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
          </label>
          <span className="text-body-xs text-subtle">Hoặc dán trực tiếp vào khung dưới:</span>
        </div>

        <TextareaField
          label="Nội dung Names.txt"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`# Danh sách thuật ngữ\n筑基=Trúc Cơ\n韩立=Hàn Lập`}
          rows={8}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={importing}>
            {result ? 'Đóng' : 'Hủy'}
          </Button>
          {!result && (
            <Button
              variant="solid"
              onClick={handleStartImport}
              disabled={importing || !content.trim()}
            >
              {importing ? 'Đang nhập...' : 'Bắt đầu nhập'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

interface DeleteGlossaryDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  entry: ContextEntryItem | null
  onConfirm(): Promise<void>
}

export function DeleteGlossaryDialog({
  open,
  onOpenChange,
  entry,
  onConfirm
}: DeleteGlossaryDialogProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xóa thuật ngữ.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Xác nhận xóa thuật ngữ"
      description="Mục này sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu tác phẩm và không thể khôi phục."
    >
      <div className="flex flex-col gap-4 text-body-xs">
        {error && (
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <p className="text-default">
          Bạn có chắc chắn muốn xóa thuật ngữ{' '}
          <strong className="font-semibold text-error">{entry?.source}</strong> ({entry?.target})?
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            Hủy
          </Button>
          <Button color="danger" variant="solid" onClick={handleConfirm} disabled={deleting}>
            {deleting ? 'Đang xóa...' : 'Xóa thuật ngữ'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
