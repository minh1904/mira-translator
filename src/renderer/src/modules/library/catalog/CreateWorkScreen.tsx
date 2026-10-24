import { useRef, type JSX } from 'react'
import type { CreateWorkInput } from '../../../../../shared/contracts/library'
import type { Result } from '../../../../../shared/contracts/result'
import { WorkForm } from '../work-form/WorkForm'
import type { WorkFormValues } from '../work-form/workFormValues'
import type { Work } from './works'

export interface CreateWorkScreenProps {
  onSubmit(input: CreateWorkInput): Promise<Result<Work>>
  onCreated(work: Work): void
  onCancel(): void
}

/** Chỉ gửi các trường tùy chọn khi có dữ liệu nhập, giúp tạo tác phẩm đúng với thông tin đã nhập. */
function toCreateInput(values: WorkFormValues): CreateWorkInput {
  return {
    title: values.title,
    sourceLang: values.sourceLang,
    ...(values.originalTitle.trim() !== '' && { originalTitle: values.originalTitle }),
    ...(values.author.trim() !== '' && { author: values.author }),
    ...(values.genre.trim() !== '' && { genre: values.genre }),
    ...(values.setting !== '' && { setting: values.setting }),
    ...(values.settingsExtra.length > 0 && { settingsExtra: values.settingsExtra }),
    ...(values.culture !== '' && { culture: values.culture }),
    ...(values.description.trim() !== '' && { description: values.description }),
    ...(values.cover !== null && { cover: values.cover })
  }
}

/** Tên tác phẩm và ngôn ngữ nguồn là thông tin bắt buộc; các trường khác có thể bổ sung sau. */
export function CreateWorkScreen({
  onSubmit,
  onCreated,
  onCancel
}: CreateWorkScreenProps): JSX.Element {
  const created = useRef<Work | null>(null)

  // Quy trình chia làm hai bước: bước đầu chỉ cần tên và ngôn ngữ; bước sau có thể bỏ qua.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkForm
        mode="create"
        stepped
        submitLabel="Tạo tác phẩm"
        busyLabel="Đang tạo…"
        onSubmit={async (values) => {
          const result = await onSubmit(toCreateInput(values))
          if (result.ok) created.current = result.value
          return result
        }}
        onSuccess={() => {
          if (created.current) onCreated(created.current)
        }}
        onCancel={onCancel}
      />
    </div>
  )
}
