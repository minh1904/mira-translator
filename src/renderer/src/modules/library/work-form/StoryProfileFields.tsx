import type { JSX } from 'react'
import {
  GENRE_CHIPS,
  genreHasChip,
  toggleGenreChip
} from '../../../../../shared/contracts/addressing/genres'
import { CULTURE_LABELS, SETTING_LABELS } from '../../../../../shared/contracts/addressing/labels'
import { resolveRegister } from '../../../../../shared/contracts/addressing/resolve'
import {
  CULTURE_IDS,
  SETTING_IDS,
  type CultureId,
  type SettingId
} from '../../../../../shared/contracts/addressing/types'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import type { WorkFormValues } from './workFormValues'

type SetValue = <K extends keyof WorkFormValues>(key: K, value: WorkFormValues[K]) => void

/**
 * Chip thể loại. Bật hoặc tắt một chip chỉ thêm hoặc bớt nhãn trong chuỗi thể loại; chữ người dùng tự gõ ở ô
 * bên dưới được giữ nguyên. Chỉ chip nhóm bối cảnh tác động tới bảng xưng hô.
 */
export function GenreChips({
  genre,
  onChange,
  disabled
}: {
  genre: string
  onChange(genre: string): void
  disabled?: boolean
}): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-[7px]">
      <legend className="text-body-xs font-semibold">Thể loại (tùy chọn)</legend>
      <div className="flex flex-wrap gap-xs">
        {GENRE_CHIPS.map((chip) => {
          const on = genreHasChip(genre, chip.label)
          return (
            <Button
              key={chip.label}
              variant={on ? 'solid' : 'outline'}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(toggleGenreChip(genre, chip.label))}
            >
              {chip.label}
            </Button>
          )
        })}
      </div>
      <span className="text-body-xs text-subtle">
        Chọn các chip hợp với truyện, hoặc gõ thêm ở ô bên dưới. Chip về bối cảnh (Tiên Hiệp, Đô
        Thị, Fantasy…) giúp AI chọn xưng hô.
      </span>
    </fieldset>
  )
}

type SettingChoice = 'auto' | 'none' | SettingId
type CultureChoice = 'auto' | CultureId

const settingOptions = [
  { value: 'auto', label: 'Tự suy theo thể loại' },
  { value: 'none', label: 'Không dùng bảng xưng hô' },
  ...SETTING_IDS.map((id) => ({ value: id, label: SETTING_LABELS[id] }))
] satisfies Array<{ value: SettingChoice; label: string }>

const cultureOptions = [
  { value: 'auto', label: 'Tự suy theo ngôn ngữ gốc' },
  ...CULTURE_IDS.map((id) => ({ value: id, label: CULTURE_LABELS[id] }))
] satisfies Array<{ value: CultureChoice; label: string }>

/** Câu nói bảng xưng hô nào sẽ được dùng với các lựa chọn hiện tại, để người dùng không phải đoán. */
export function describeRegister(values: WorkFormValues): string {
  const picked = resolveRegister({
    sourceLang: values.sourceLang,
    genre: values.genre,
    setting: values.setting === '' ? null : values.setting,
    settingsExtra: values.settingsExtra,
    culture: values.culture === '' ? null : values.culture
  })
  if (values.setting === 'none') return 'Không dùng bảng xưng hô gợi ý; AI chỉ theo các luật chung.'
  if (picked.setting === null) {
    return 'Chưa chọn bối cảnh nên bản dịch không dùng bảng xưng hô gợi ý, chỉ có các luật chung. Chọn một chip bối cảnh hoặc chọn bối cảnh ở trên để dùng bảng.'
  }
  const settings = [picked.setting, ...picked.extra].map((id) => SETTING_LABELS[id]).join(' + ')
  const culture = picked.culture ? ' · văn hóa ' + CULTURE_LABELS[picked.culture] : ''
  const inferred = values.setting === '' ? ' (suy từ thể loại)' : ''
  return 'Bảng xưng hô gợi ý: ' + settings + culture + inferred + '.'
}

/**
 * Bối cảnh chính, bối cảnh phụ và văn hóa gốc của câu chuyện. Văn hóa gốc không phải ngôn ngữ văn bản: bản
 * tiếng Anh của truyện Nhật vẫn chọn văn hóa Nhật. Bối cảnh phụ chỉ chọn được khi đã có bối cảnh chính.
 */
export function StoryProfileFields({
  values,
  set,
  disabled
}: {
  values: WorkFormValues
  set: SetValue
  disabled?: boolean
}): JSX.Element {
  const hasPrimary = values.setting !== '' && values.setting !== 'none'

  const pickSetting = (choice: SettingChoice): void => {
    set('setting', choice === 'auto' ? '' : choice)
    // Bối cảnh phụ đi theo bối cảnh chính: bỏ nó khỏi danh sách phụ, và xóa hết khi không còn bối cảnh chính.
    set(
      'settingsExtra',
      choice === 'auto' || choice === 'none'
        ? []
        : values.settingsExtra.filter((id) => id !== choice)
    )
  }

  const toggleExtra = (id: SettingId): void => {
    set(
      'settingsExtra',
      values.settingsExtra.includes(id)
        ? values.settingsExtra.filter((item) => item !== id)
        : [...values.settingsExtra, id]
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-[7px]">
        <span className="text-body-xs font-semibold">Bối cảnh chính (tùy chọn)</span>
        <Select<SettingChoice>
          label="Bối cảnh chính"
          value={values.setting === '' ? 'auto' : values.setting}
          options={settingOptions}
          onChange={pickSetting}
          disabled={disabled}
          className="w-full"
        />
      </div>

      <fieldset className="flex flex-col gap-[7px]">
        <legend className="text-body-xs font-semibold">Bối cảnh phụ (tùy chọn)</legend>
        <div className="flex flex-wrap gap-xs">
          {SETTING_IDS.filter((id) => id !== values.setting).map((id) => {
            const on = values.settingsExtra.includes(id)
            return (
              <Button
                key={id}
                variant={on ? 'solid' : 'outline'}
                aria-pressed={on}
                disabled={disabled || !hasPrimary}
                onClick={() => toggleExtra(id)}
              >
                {SETTING_LABELS[id]}
              </Button>
            )
          })}
        </div>
        <span className="text-body-xs text-subtle">
          {hasPrimary
            ? 'Dùng cho truyện lai, ví dụ cung đấu có đạo sĩ. Dòng của bối cảnh chính thắng khi trùng quan hệ.'
            : 'Chọn bối cảnh chính trước khi thêm bối cảnh phụ.'}
        </span>
      </fieldset>

      <div className="flex flex-col gap-[7px]">
        <span className="text-body-xs font-semibold">Văn hóa gốc (tùy chọn)</span>
        <Select<CultureChoice>
          label="Văn hóa gốc"
          value={values.culture === '' ? 'auto' : values.culture}
          options={cultureOptions}
          onChange={(choice) => set('culture', choice === 'auto' ? '' : choice)}
          disabled={disabled}
          className="w-full"
        />
        <span className="text-body-xs text-subtle">
          Văn hóa của câu chuyện, không phải ngôn ngữ văn bản: bản tiếng Anh của truyện Nhật vẫn
          chọn Nhật.
        </span>
      </div>

      <p role="status" className="text-body-xs text-subtle">
        {describeRegister(values)}
      </p>
    </div>
  )
}
