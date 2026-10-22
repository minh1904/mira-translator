import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type RefObject
} from 'react'
import type { SourceLanguage } from '../../../../../shared/contracts/library'
import {
  FILE_MAX_BYTES,
  describeSaveFailure,
  prepareImport,
  saveImport,
  type ImportPlan
} from '../../../../../shared/text/rawImport'
import {
  ENCODINGS,
  describeChange,
  encodingLabel,
  type EncodingId
} from '../../../../../shared/text/rawText'
import type { TextRecord } from '../../../../../shared/contracts/text'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Select } from '../../../components/ui/Select'
import { TextareaField } from '../../../components/ui/Field'
import { backupWork, savedMessage } from '../../library/public'

const FIRST_SAMPLES = 3
const LAST_SAMPLES = 2

const REASONS = {
  bom: 'nhận theo dấu thứ tự byte (BOM)',
  utf8: 'UTF-8 hợp lệ',
  legacy: 'đoán theo ngôn ngữ nguồn của tác phẩm',
  fallback: 'không bảng mã nào đọc sạch, đã chọn bảng mã ít lỗi nhất',
  chosen: 'do bạn chọn'
} as const

export interface ImportDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  workId: string
  chapterId: string
  sourceLang: SourceLanguage
  /** Phiên bản của bản gốc khi mở màn hình; từ chối lưu nếu bản gốc đã bị sửa đổi ở nơi khác. */
  baseRev: number
  /** Đánh dấu chương đã có bản gốc và thao tác này sẽ thay thế bản gốc cũ. */
  replacing: boolean
  /** Đánh dấu chương đã có bản dịch. */
  hasTarget: boolean
  /** Tệp đã được chọn trước đó trên màn hình chương để mở thẳng vào bước xem trước. */
  initialFile: File | null
  /** Phần tử kích hoạt mở hộp thoại để trả lại focus khi đóng. */
  finalFocus?: RefObject<HTMLElement | null>
  onSaved(record: TextRecord): void
}

/** Hộp thoại nhập hoặc dán bản gốc cho chương, xem trước kết quả chuẩn hóa trước khi lưu. */
export function ImportDialog(props: ImportDialogProps): JSX.Element {
  const { open, onOpenChange } = props
  const [saving, setSaving] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Không đóng hộp thoại khi đang trong quá trình lưu dữ liệu.
        if (!saving) onOpenChange(next)
      }}
      size="lg"
      finalFocus={props.finalFocus}
      title={props.replacing ? 'Thay bản gốc của chương' : 'Nhập bản gốc cho chương'}
      description="Văn bản được đọc ngay trên máy bạn và chưa lưu gì cho tới khi bạn xác nhận ở bước xem trước."
    >
      {/* Chỉ mount khi mở để mỗi lần mở đều bắt đầu với biểu mẫu mới. */}
      {open && <ImportBody {...props} saving={saving} setSaving={setSaving} />}
    </Dialog>
  )
}

function ImportBody({
  onOpenChange,
  workId,
  chapterId,
  sourceLang,
  baseRev,
  replacing,
  hasTarget,
  initialFile,
  onSaved,
  saving,
  setSaving
}: ImportDialogProps & { saving: boolean; setSaving(value: boolean): void }): JSX.Element {
  const [pasted, setPasted] = useState('')
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [encoding, setEncoding] = useState<EncodingId | undefined>(undefined)
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [inputError, setInputError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [backupNote, setBackupNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  async function takeFile(chosen: File): Promise<void> {
    setInputError(null)
    if (chosen.size > FILE_MAX_BYTES) {
      setInputError(
        'Tệp lớn ' +
          (chosen.size / 1024 / 1024).toFixed(1) +
          ' MB, vượt giới hạn 8 MB. Hãy chọn đúng tệp của một chương.'
      )
      return
    }
    const bytes = new Uint8Array(await chosen.arrayBuffer())
    const result = prepareImport({ kind: 'file', name: chosen.name, bytes }, sourceLang)
    if (!result.ok) {
      setInputError(result.message)
      return
    }
    setFile({ name: chosen.name, bytes })
    setEncoding(undefined)
    setStep('preview')
  }

  // Nếu đã chọn tệp từ trước, mở thẳng bước xem trước.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Once per opening; the dialog is remounted each time it opens.
  useEffect(() => {
    if (initialFile) void takeFile(initialFile)
  }, [])

  const prepared = useMemo(() => {
    if (step !== 'preview') return null
    return prepareImport(
      file ? { kind: 'file', name: file.name, bytes: file.bytes } : { kind: 'paste', text: pasted },
      sourceLang,
      encoding
    )
  }, [step, file, pasted, sourceLang, encoding])

  // Chuyển focus sang nút xác nhận khi chuyển sang bước xem trước.
  const previewing = step === 'preview' && prepared?.ok === true
  useEffect(() => {
    if (previewing) confirmButton.current?.focus()
  }, [previewing])

  function previewPasted(): void {
    const result = prepareImport({ kind: 'paste', text: pasted }, sourceLang)
    if (!result.ok) {
      setInputError(result.message)
      return
    }
    setInputError(null)
    setFile(null)
    setStep('preview')
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped) void takeFile(dropped)
  }

  async function confirm(plan: ImportPlan): Promise<void> {
    setSaving(true)
    setSaveError(null)
    const result = await saveImport(window.mira.text, { workId, chapterId }, baseRev, plan)
    setSaving(false)
    if (result.ok) {
      onSaved(result.value)
      onOpenChange(false)
    } else {
      setSaveError(describeSaveFailure(result.error))
    }
  }

  const hidden = (
    <input
      ref={picker}
      type="file"
      accept=".txt,.md,.markdown,text/plain,text/markdown"
      className="hidden"
      aria-label="Chọn tệp văn bản"
      onChange={(event) => {
        const chosen = event.target.files?.[0]
        event.target.value = ''
        if (chosen) void takeFile(chosen)
      }}
    />
  )

  if (step === 'input' || !prepared) {
    return (
      <div
        className="flex flex-col gap-4"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {hidden}
        <TextareaField
          label="Dán văn bản"
          value={pasted}
          autoFocus
          rows={10}
          lang={sourceLang}
          placeholder="Dán nội dung chương vào đây…"
          onChange={(event) => {
            setPasted(event.target.value)
            setInputError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              previewPasted()
            }
          }}
          hint="Ctrl+Enter để xem trước."
        />
        <div
          className={
            'flex flex-wrap items-center gap-3 rounded-sm border border-dashed px-3 py-3 text-body-xs ' +
            (dragging ? 'border-focus bg-muted' : 'border-strong')
          }
        >
          <span className="text-subtle">hoặc kéo tệp .txt / .md vào đây,</span>
          <Button variant="light" onClick={() => picker.current?.click()}>
            Chọn tệp…
          </Button>
        </div>
        {inputError && (
          <p role="alert" className="text-body-xs text-error">
            {inputError}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-default pt-4">
          <Button variant="light" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button variant="solid" onClick={previewPasted} disabled={pasted.trim() === ''}>
            Xem trước
          </Button>
        </div>
      </div>
    )
  }

  if (!prepared.ok) {
    return (
      <div className="flex flex-col gap-4">
        {hidden}
        <p role="alert" className="text-body-xs text-error">
          {prepared.message}
        </p>
        <div className="flex justify-end gap-2 border-t border-default pt-4">
          <Button variant="light" onClick={() => setStep('input')}>
            Quay lại
          </Button>
        </div>
      </div>
    )
  }

  const { plan } = prepared
  const sampleItems = sampleOf(plan.segments.length)

  return (
    <div className="flex flex-col gap-4 text-body-xs">
      {hidden}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {plan.fileName && (
          <>
            <dt className="text-subtle">Tệp</dt>
            <dd className="break-words">{plan.fileName}</dd>
          </>
        )}
        {plan.encoding && (
          <>
            <dt className="text-subtle">Bảng mã</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <Select<EncodingId>
                label="Bảng mã"
                value={plan.encoding.id}
                options={ENCODINGS.map((item) => ({ value: item.id, label: item.label }))}
                onChange={setEncoding}
              />
              <span className="text-subtle">
                {REASONS[plan.encoding.reason]} · {encodingLabel(plan.encoding.id)}
              </span>
            </dd>
          </>
        )}
        <dt className="text-subtle">Kích thước</dt>
        <dd>
          {plan.text.length.toLocaleString('vi')} ký tự ·{' '}
          {plan.segments.length.toLocaleString('vi')} segment
        </dd>
        <dt className="text-subtle">Chuẩn hóa</dt>
        <dd>
          {plan.changes.length === 0 ? (
            'Văn bản được giữ nguyên, không đổi gì.'
          ) : (
            <ul className="list-disc pl-4">
              {plan.changes.map((change) => (
                <li key={change.kind}>{describeChange(change)}</li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      {plan.warnings.map((warning) => (
        <p
          key={warning}
          role="note"
          className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 leading-normal"
        >
          {warning}
        </p>
      ))}

      <div className="flex flex-col gap-1.5">
        <span className="text-body-xs font-semibold">Xem trước các segment</span>
        <ol
          lang={sourceLang}
          className="flex flex-col divide-y divide-default rounded-sm border border-default text-body-sm"
        >
          {sampleItems.map((item) =>
            item.kind === 'gap' ? (
              <li
                key={'gap-' + item.after}
                aria-hidden="true"
                className="px-3 py-1 text-center text-subtle"
              >
                … {item.count} segment ở giữa …
              </li>
            ) : (
              <li
                key={item.index}
                className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 px-3 py-1.5"
              >
                <span className="text-subtle">{item.index + 1}</span>
                <span className="break-words whitespace-pre-wrap">
                  {plan.text.slice(plan.segments[item.index].start, plan.segments[item.index].end)}
                  {plan.longSegments.includes(item.index) && (
                    <span className="ml-2 rounded-sm bg-warning/20 px-1.5 text-body-xs">
                      dài bất thường
                    </span>
                  )}
                </span>
              </li>
            )
          )}
        </ol>
      </div>

      {replacing && (
        <div
          role="note"
          className="flex flex-col gap-1.5 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 leading-normal"
        >
          <strong className="font-semibold">Bản gốc hiện có sẽ bị thay.</strong>
          <span>
            Các segment cũ bị thay bằng segment mới; các liên kết với segment cũ được đánh dấu cần
            kiểm tra.
            {hasTarget
              ? ' Bản dịch của chương được giữ nguyên.'
              : ' Chương chưa có bản dịch nên không có gì khác bị ảnh hưởng.'}
          </span>
          {hasTarget && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                onClick={() =>
                  void backupWork(workId).then((outcome) =>
                    setBackupNote(
                      outcome.kind === 'saved'
                        ? savedMessage(outcome.path)
                        : outcome.kind === 'failed'
                          ? 'Không sao lưu được: ' + outcome.message
                          : null
                    )
                  )
                }
              >
                Sao lưu trước…
              </Button>
              {backupNote && (
                <span role="status" className="break-words text-subtle">
                  {backupNote}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {saveError && (
        <p role="alert" className="text-error">
          {saveError}
        </p>
      )}
      <p role="status" className="sr-only">
        {saving ? 'Đang lưu…' : ''}
      </p>

      <div className="flex justify-end gap-2 border-t border-default pt-4">
        <Button variant="light" disabled={saving} onClick={() => setStep('input')}>
          Quay lại
        </Button>
        <Button variant="light" disabled={saving} onClick={() => onOpenChange(false)}>
          Hủy
        </Button>
        <Button
          variant="solid"
          ref={confirmButton}
          disabled={saving}
          onClick={() => void confirm(plan)}
        >
          {saving ? 'Đang lưu…' : replacing ? 'Thay bản gốc' : 'Nhập vào chương'}
        </Button>
      </div>
    </div>
  )
}

type SampleItem = { kind: 'row'; index: number } | { kind: 'gap'; after: number; count: number }

/** Tạo danh sách hiển thị mẫu các đoạn đầu và đoạn cuối, kèm số lượng đoạn ở giữa. */
function sampleOf(total: number): SampleItem[] {
  const rows = (from: number, to: number): SampleItem[] =>
    Array.from({ length: to - from }, (_, i) => ({ kind: 'row' as const, index: from + i }))
  if (total <= FIRST_SAMPLES + LAST_SAMPLES) return rows(0, total)
  return [
    ...rows(0, FIRST_SAMPLES),
    { kind: 'gap', after: FIRST_SAMPLES, count: total - FIRST_SAMPLES - LAST_SAMPLES },
    ...rows(total - LAST_SAMPLES, total)
  ]
}
