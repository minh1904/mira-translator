import { useEffect, useState, type JSX } from 'react'
import type { WorkPatch } from '../../../../../shared/contracts/library'
import type { Result } from '../../../../../shared/contracts/result'
import { Dialog } from '../../../components/ui/Dialog'
import type { Work } from '../catalog/works'
import { WorkForm } from './WorkForm'
import { buildPatch, type WorkFormValues } from './workFormValues'

function initialValues(work: Work, cover: string | null): WorkFormValues {
  return {
    title: work.title,
    sourceLang: work.sourceLanguage,
    originalTitle: work.originalTitle ?? '',
    author: work.author ?? '',
    genre: work.genre ?? '',
    setting: work.setting ?? '',
    settingsExtra: work.settingsExtra ?? [],
    culture: work.culture ?? '',
    description: work.description ?? '',
    cover
  }
}

/**
 * Chỉnh sửa thông tin chi tiết và ảnh bìa của tác phẩm trong một lần lưu.
 * Hộp thoại sẽ tải ảnh bìa hiện tại trước vì bản tóm tắt tác phẩm chỉ lưu thông tin phiên bản.
 */
export function EditWorkDialog({
  work,
  open,
  onClose,
  onSave
}: {
  work: Work
  open: boolean
  onClose(): void
  onSave(patch: WorkPatch): Promise<Result<unknown>>
}): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="lg"
      title="Sửa thông tin tác phẩm"
      description="Thông tin và ảnh bìa được lưu cùng lúc. Ngôn ngữ gốc không đổi được."
    >
      {/* Chỉ mount khi mở hộp thoại, giúp mỗi lần mở đều nạp dữ liệu lưu mới nhất. */}
      {open && <EditBody work={work} onClose={onClose} onSave={onSave} />}
    </Dialog>
  )
}

function EditBody({
  work,
  onClose,
  onSave
}: {
  work: Work
  onClose(): void
  onSave(patch: WorkPatch): Promise<Result<unknown>>
}): JSX.Element {
  const [initial, setInitial] = useState<WorkFormValues | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Chỉ lấy snapshot một lần khi mở; các thay đổi sau đó đối với work không được ghi đè nội dung đang nhập.
  useEffect(() => {
    let active = true
    if (work.coverVersion === undefined) {
      void Promise.resolve().then(() => {
        if (active) setInitial(initialValues(work, null))
      })
    } else {
      void window.mira.works.getCover(work.id).then((result) => {
        if (!active) return
        if (result.ok) setInitial(initialValues(work, result.value))
        else setLoadError(result.error.message)
      })
    }
    return () => {
      active = false
    }
  }, [])

  if (loadError) {
    return (
      <p role="alert" className="text-body-xs text-error">
        Không đọc được ảnh bìa hiện tại: {loadError}
      </p>
    )
  }
  if (!initial) {
    return (
      <p role="status" className="py-8 text-center text-body-xs text-subtle">
        Đang mở thông tin…
      </p>
    )
  }

  return (
    <WorkForm
      mode="edit"
      initial={initial}
      submitLabel="Lưu thay đổi"
      busyLabel="Đang lưu…"
      onSubmit={async (values) => {
        const patch = buildPatch(initial, values)
        // Không có thay đổi: đóng hộp thoại mà không tác động đến tệp hoặc thời gian sửa đổi.
        if (Object.keys(patch).length === 0) return { ok: true, value: null }
        return onSave(patch)
      }}
      onSuccess={onClose}
      onCancel={onClose}
    />
  )
}
