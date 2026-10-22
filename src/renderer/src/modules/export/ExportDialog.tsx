import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ChapterItem } from '../../../../shared/contracts/chapters'
import type {
  ExportFormat,
  ExportPageSize,
  ExportParagraphSpacing,
  ExportResult,
  ExportWorkMode
} from '../../../../shared/contracts/export'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Radio, RadioGroup } from '../../components/ui/Checkbox'
import { Dialog } from '../../components/ui/Dialog'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Select, type SelectOption } from '../../components/ui/Select'
import { Switch } from '../../components/ui/Switch'
import { notify } from '../../components/ui/notificationStore'
import {
  foldNumbers,
  planScope,
  readExportPrefs,
  writeExportPrefs,
  type ExportPrefs,
  type ExportScope
} from './exportScope'

export interface ExportDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  workId: string
  workTitle: string
  /** Thiết lập nếu chỉ xuất một chương này; nếu không hộp thoại sẽ xuất nhiều chương của tác phẩm. */
  chapter?: ChapterItem
  /** Các chương được chọn trong danh sách; phạm vi xuất sẽ khởi đầu theo các chương này nếu được cung cấp. */
  selectedIds?: ReadonlySet<string>
}

const FORMAT_OPTIONS: SelectOption<ExportFormat>[] = [
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'txt', label: 'Văn bản (.txt)' },
  { value: 'md', label: 'Markdown (.md)' }
]

const PAGE_SIZE_OPTIONS: SelectOption<ExportPageSize>[] = [
  { value: 'A5', label: 'A5, khổ tiểu thuyết' },
  { value: 'A4', label: 'A4' }
]

const SPACING_OPTIONS: SelectOption<ExportParagraphSpacing>[] = [
  { value: 'indent', label: 'Thụt lề đầu dòng' },
  { value: 'spacing', label: 'Dòng trống giữa các đoạn' }
]

const WORK_MODE_OPTIONS: SelectOption<ExportWorkMode>[] = [
  { value: 'combined', label: 'Gộp thành một tệp' },
  { value: 'separate', label: 'Mỗi chương một tệp, trong một thư mục' }
]

type ScopeKind = ExportScope['kind']

interface Running {
  done: number
  total: number
}

/** Mở thư mục chứa tệp vừa xuất từ thông báo hoàn tất. */
function revealAction(path: string | undefined) {
  if (!path) return undefined
  return {
    label: 'Mở thư mục',
    onClick: () => {
      void window.mira.export.reveal(path)
    }
  }
}

export function ExportDialog(props: ExportDialogProps): JSX.Element {
  // Trong khi đang xuất, phím Escape, lớp nền và nút đóng sẽ không đóng hộp thoại:
  // việc đóng hộp thoại sẽ ẩn tiến độ và nút Dừng trong khi tiến trình chính vẫn đang ghi, dễ dẫn đến xuất trùng lặp.
  const [busy, setBusy] = useState(false)
  const title = props.chapter
    ? 'Xuất chương ' + props.chapter.number
    : 'Xuất tác phẩm: ' + props.workTitle
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next && busy) return
        props.onOpenChange(next)
      }}
      size="md"
      title={title}
      description={props.chapter?.title || undefined}
    >
      {/* Chỉ mount khi mở, giúp mỗi lần mở đều đọc lại danh sách chương và tùy chọn đã lưu. */}
      {props.open && <ExportBody {...props} onBusyChange={setBusy} />}
    </Dialog>
  )
}

function ExportBody({
  onOpenChange,
  workId,
  chapter,
  selectedIds,
  onBusyChange
}: ExportDialogProps & { onBusyChange(busy: boolean): void }): JSX.Element {
  const single = chapter !== undefined
  const [prefs, setPrefs] = useState<ExportPrefs>(readExportPrefs)
  const update = (patch: Partial<ExportPrefs>): void => setPrefs((now) => ({ ...now, ...patch }))

  const [chapters, setChapters] = useState<ChapterItem[] | null>(null)
  const [scopeKind, setScopeKind] = useState<ScopeKind>(
    selectedIds && selectedIds.size > 0 ? 'selected' : 'all'
  )
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('')
  const [running, setRunning] = useState<Running | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (single) return
    let live = true
    void window.mira.chapters.list(workId).then((result) => {
      if (!live) return
      if (result.ok) {
        setChapters(result.value.chapters)
        setTo((now) => (now === '' ? String(result.value.chapters.length) : now))
      } else {
        setError(result.error.message)
      }
    })
    return () => {
      live = false
    }
  }, [single, workId])

  const isRunning = running !== null
  // Đánh dấu khi người dùng nhấn Dừng, giúp thông báo rõ ràng trường hợp xuất một tệp bị dừng khi chưa ghi nội dung.
  const stopping = useRef(false)
  useEffect(() => {
    onBusyChange(isRunning)
    return () => onBusyChange(false)
  }, [isRunning, onBusyChange])
  useEffect(() => {
    if (!isRunning) return
    return window.mira.export.onProgress((progress) => {
      if (progress.workId === workId) setRunning({ done: progress.done, total: progress.total })
    })
  }, [isRunning, workId])

  const scope = useMemo<ExportScope>(() => {
    if (scopeKind === 'selected') return { kind: 'selected', ids: selectedIds ?? new Set() }
    if (scopeKind === 'range') return { kind: 'range', from: Number(from), to: Number(to) }
    return { kind: 'all' }
  }, [scopeKind, selectedIds, from, to])

  const total = chapters?.length ?? 0
  const rangeError =
    scopeKind !== 'range' || chapters === null
      ? undefined
      : !isPosition(from, total) || !isPosition(to, total)
        ? 'Nhập số chương từ 1 đến ' + total + '.'
        : undefined
  const plan = useMemo(
    () => (chapters && !rangeError ? planScope(chapters, scope) : null),
    [chapters, scope, rangeError]
  )

  const missingTranslation = single && !chapter.hasTarget
  const nothingToWrite = !single && (plan === null || plan.included.length === 0)
  const blocked = running !== null || missingTranslation || nothingToWrite

  async function run(): Promise<void> {
    setError(null)
    writeExportPrefs(prefs)
    const options = {
      includeTitle: prefs.includeTitle,
      includeAuthor: true,
      includeDescription: prefs.includeDescription,
      paragraphSpacing: prefs.paragraphSpacing,
      pageSize: prefs.pageSize
    }
    stopping.current = false
    setRunning({ done: 0, total: single ? 1 : (plan?.included.length ?? 0) })
    try {
      const result = single
        ? await window.mira.export.exportChapter({
            workId,
            chapterId: chapter.id,
            format: prefs.format,
            options
          })
        : await window.mira.export.exportWork({
            workId,
            // "Tất cả" được gửi dưới dạng undefined để bao gồm cả chương mới thêm trong lúc xuất.
            chapterIds: scope.kind === 'all' ? undefined : plan?.included.map((item) => item.id),
            format: prefs.format,
            mode: prefs.workMode,
            options
          })
      if (!result.ok) setError(result.error.message)
      else finish(result.value)
    } finally {
      setRunning(null)
    }
  }

  function finish(result: ExportResult): void {
    if (result.canceled) {
      // Dừng giữa chừng: thông báo các tệp đã ghi vào đĩa. Trường hợp đóng hộp thoại lưu tệp thì không thông báo.
      if (result.count) {
        notify({
          kind: 'info',
          title: 'Đã dừng xuất sau ' + result.count + ' chương',
          message: 'Các tệp đã ghi vẫn còn trong thư mục.',
          action: revealAction(result.filePath)
        })
        onOpenChange(false)
      } else if (stopping.current) {
        notify({
          kind: 'info',
          title: 'Đã dừng xuất',
          message: 'Chưa ghi tệp nào.'
        })
      }
      return
    }
    if (!result.success) {
      setError(result.error ?? 'Xuất tệp không thành công.')
      return
    }
    const skippedCount = scope.kind === 'all' ? (result.skipped ?? 0) : (plan?.skipped.length ?? 0)
    const skipped = skippedCount ? ' Bỏ qua ' + skippedCount + ' chương chưa có bản dịch.' : ''
    notify({
      kind: 'success',
      title: single ? 'Đã xuất chương ' + chapter.number : 'Đã xuất ' + result.count + ' chương',
      message: (result.filePath ?? '') + skipped,
      action: revealAction(result.filePath),
      durationMs: 10_000
    })
    onOpenChange(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {missingTranslation && (
        <p
          role="note"
          className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-body-xs leading-normal"
        >
          Chương này chưa có bản dịch nên chưa có gì để xuất.
        </p>
      )}

      {!single && (
        <fieldset className="flex min-w-0 flex-col gap-2 rounded-sm border border-default px-3 py-2.5">
          <legend className="px-1 text-label-sm">Phạm vi</legend>
          <RadioGroup
            aria-label="Phạm vi"
            name="export-scope"
            value={scopeKind}
            onValueChange={(value) => setScopeKind(value as ScopeKind)}
          >
            <Radio value="all">Tất cả chương{chapters ? ' (' + chapters.length + ')' : ''}</Radio>
            <Radio value="range">Từ chương đến chương</Radio>
            {scopeKind === 'range' && (
              <div className="flex flex-col gap-1 pl-6">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Từ chương"
                    inputMode="numeric"
                    value={from}
                    className="w-24"
                    onChange={(event) => setFrom(event.target.value)}
                  />
                  <span className="text-body-sm text-subtle">đến</span>
                  <Input
                    aria-label="Đến chương"
                    inputMode="numeric"
                    value={to}
                    className="w-24"
                    onChange={(event) => setTo(event.target.value)}
                  />
                </div>
                {rangeError && (
                  <span role="alert" className="text-body-xs text-error">
                    {rangeError}
                  </span>
                )}
              </div>
            )}
            {selectedIds && selectedIds.size > 0 && (
              <Radio value="selected">Các chương đang chọn ({selectedIds.size})</Radio>
            )}
          </RadioGroup>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Định dạng">
          {({ id }) => (
            <Select
              id={id}
              label="Định dạng"
              value={prefs.format}
              onChange={(format) => update({ format })}
              options={FORMAT_OPTIONS}
            />
          )}
        </Field>
        {!single && (
          <Field label="Cách lưu">
            {({ id }) => (
              <Select
                id={id}
                label="Cách lưu"
                value={prefs.workMode}
                onChange={(workMode) => update({ workMode })}
                options={WORK_MODE_OPTIONS}
              />
            )}
          </Field>
        )}
        <Field label="Trình bày đoạn">
          {({ id }) => (
            <Select
              id={id}
              label="Trình bày đoạn"
              value={prefs.paragraphSpacing}
              onChange={(paragraphSpacing) => update({ paragraphSpacing })}
              options={SPACING_OPTIONS}
            />
          )}
        </Field>
        {prefs.format === 'pdf' && (
          <Field label="Khổ trang">
            {({ id }) => (
              <Select
                id={id}
                label="Khổ trang"
                value={prefs.pageSize}
                onChange={(pageSize) => update({ pageSize })}
                options={PAGE_SIZE_OPTIONS}
              />
            )}
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-sm border border-default p-3">
        <Toggle
          label="Kèm tên truyện và tác giả"
          checked={prefs.includeTitle}
          onChange={(includeTitle) => update({ includeTitle })}
        />
        <Toggle
          label="Kèm lời giới thiệu"
          checked={prefs.includeDescription}
          onChange={(includeDescription) => update({ includeDescription })}
        />
      </div>

      {!single && <ScopeSummary plan={plan} loading={chapters === null && !error} />}

      {running && <ProgressLine running={running} />}

      <div className="flex justify-end gap-2">
        {running && !single ? (
          <Button
            variant="light"
            onClick={() => {
              stopping.current = true
              void window.mira.export.cancel(workId)
            }}
          >
            Dừng
          </Button>
        ) : (
          <Button variant="light" onClick={() => onOpenChange(false)} disabled={running !== null}>
            Hủy
          </Button>
        )}
        <Button
          variant="solid"
          onClick={() => void run()}
          disabled={blocked}
          loading={running !== null}
        >
          {single || !plan ? 'Xuất' : 'Xuất ' + plan.included.length + ' chương'}
        </Button>
      </div>
    </div>
  )
}

function isPosition(value: string, total: number): boolean {
  const number = Number(value)
  return value.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= total
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body-sm text-default">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Tóm tắt dự kiến trước khi xuất: số chương sẽ xuất, các chương bị bỏ qua và lý do. */
function ScopeSummary({
  plan,
  loading
}: {
  plan: ReturnType<typeof planScope> | null
  loading: boolean
}): JSX.Element | null {
  if (loading) {
    return (
      <p role="status" className="text-body-xs text-subtle">
        Đang đếm chương…
      </p>
    )
  }
  if (!plan) return null
  if (plan.included.length === 0) {
    return (
      <p role="status" className="text-body-xs text-subtle">
        Không có chương nào đã dịch trong phạm vi này.
      </p>
    )
  }
  return (
    <p role="status" className="text-body-xs leading-normal text-subtle">
      Sẽ xuất <strong className="font-semibold text-default">{plan.included.length} chương</strong>
      {plan.skipped.length > 0 && (
        <>
          {' '}
          · bỏ qua {plan.skipped.length} chương chưa dịch:{' '}
          {foldNumbers(plan.skipped.map((item) => item.number))}
        </>
      )}
    </p>
  )
}

function ProgressLine({ running }: { running: Running }): JSX.Element {
  const share = running.total > 0 ? running.done / running.total : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label="Tiến độ xuất"
        aria-valuemin={0}
        aria-valuemax={running.total}
        aria-valuenow={running.done}
        className="h-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-inverted transition-[width] duration-(--mira-duration-fast)"
          style={{ width: share * 100 + '%' }}
        />
      </div>
      <span className="text-body-xs text-subtle tabular-nums">
        {running.done === 0 ? 'Đang chuẩn bị…' : 'Đã ghi ' + running.done + '/' + running.total}
      </span>
    </div>
  )
}
