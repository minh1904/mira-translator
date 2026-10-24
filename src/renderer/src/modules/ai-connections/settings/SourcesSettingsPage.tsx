import { useEffect, useState, type JSX } from 'react'
import { SettingRow, SettingsSection } from '../../../components/ui/Setting'
import { Switch } from '../../../components/ui/Switch'

/** Cài đặt › Nguồn truyện: xác nhận đủ 18 tuổi cho nguồn R18, thu hồi được bất cứ lúc nào. */
export function SourcesSettingsPage(): JSX.Element {
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.mira?.sources?.age?.get().then((res) => {
      if (res.ok) setConfirmed(res.value.confirmed)
    })
  }, [])

  const change = async (next: boolean): Promise<void> => {
    setError(null)
    const res = await window.mira.sources.age.set({ confirmed: next })
    if (res.ok) setConfirmed(res.value.confirmed)
    else setError(res.error.message)
  }

  return (
    <SettingsSection>
      <SettingRow
        id="age-confirmation"
        title="Đã xác nhận đủ 18 tuổi"
        hint={
          error ??
          'Cho phép Mira truy cập nguồn R18 (なろう R18, Akatsuki). Tắt để thu hồi; lượt kiểm tra hay tải chương của các nguồn này sẽ dừng và hỏi lại.'
        }
      >
        <Switch
          aria-label="Đã xác nhận đủ 18 tuổi"
          checked={confirmed}
          onCheckedChange={(next) => void change(next)}
        />
      </SettingRow>
    </SettingsSection>
  )
}
