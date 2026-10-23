import { useEffect, useState, type JSX } from 'react'
import { AddCircleIcon, CloseIcon, CpuIcon, RestartIcon } from '@renderer/components/ui/reicon'

import type { ConnectionView } from '../../../../../shared/contracts/aiConnections'
import { connectionSection } from '../../../../../shared/contracts/aiProviders'
import { MAX_FALLBACKS, type ModelRef } from '../../../../../shared/contracts/aiPreferences'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { Select } from '../../../components/ui/Select'
import { SettingRow, SettingsSection } from '../../../components/ui/Setting'
import { TextField } from '../../../components/ui/Field'
import { useConnectionStore } from '../store/connectionStore'
import { notify } from '../../../components/ui/notificationStore'
import { useAiOverlayStore } from '../store/overlayStore'
import { firstFreeModel, resolveModelChoice } from '../model-selection/modelChoice'
import {
  DEFAULT_THINKING_LABEL,
  thinkingChoiceOf,
  thinkingOptions,
  thinkingPatch,
  type ThinkingChoice
} from '../model-selection/modelSettingsForm'
import { connectionLive } from './connectionStatus'
import { useConnections } from './useConnections'

const usable = (connections: readonly ConnectionView[]): ConnectionView[] =>
  connections.filter((connection) => connection.enabled && connection.models.length > 0)

function usePreferences(): void {
  const loaded = useConnectionStore((state) => state.preferences !== null)
  const load = useConnectionStore((state) => state.loadPreferences)
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
}

/** Cài đặt › Model › Model chính. */
export function MainModelPage(): JSX.Element {
  usePreferences()
  const { connections } = useConnections()
  const store = useConnectionStore()
  const openSettings = useAiOverlayStore((state) => state.openSettings)
  const main = store.preferences?.main ?? null
  const live = usable(connections)
  const current = resolveModelChoice(connections, { connectionId: null, entryId: null }, main)

  // Lựa chọn tạm thời của người dùng tại giao diện; mặc định hiển thị giá trị đã lưu.
  const [picked, setPicked] = useState<{ connectionId: string; entryId: string | null } | null>(
    null
  )
  const connectionId = picked?.connectionId ?? current?.connectionId ?? null
  const entryId = picked ? picked.entryId : (current?.entryId ?? null)
  const [now] = useState(() => Date.now())
  const [applying, setApplying] = useState(false)
  const [key, setKey] = useState('')
  const [activating, setActivating] = useState(false)

  const connection = live.find((item) => item.id === connectionId) ?? null
  const entry =
    connection?.models.find((item) => item.id === entryId) ?? connection?.models[0] ?? null
  const changed =
    connection !== null &&
    entry !== null &&
    (main?.connectionId !== connection.id || main?.entryId !== entry.id)
  const needsKey =
    connection !== null &&
    connectionSection(connection) === 'keys' &&
    !connectionLive(connection, now)

  async function apply(): Promise<void> {
    if (!connection || !entry) return
    setApplying(true)
    const ok = await store.setMainModel({ connectionId: connection.id, entryId: entry.id })
    setApplying(false)
    if (ok) {
      notify({
        kind: 'success',
        title: 'Đã đổi model chính',
        message: 'Chat mới và hộp thoại dịch sẽ dùng ' + connection.name + ' · ' + entry.name + '.'
      })
    }
  }

  async function activate(): Promise<void> {
    if (!connection || !key.trim()) return
    setActivating(true)
    // Kết nối nhà cung cấp đi qua bước kiểm tra khóa; gateway chỉ lưu khóa trực tiếp.
    const outcome = connection.providerId
      ? await store.connectKey(connection.providerId, key.trim())
      : (await store.addKey(connection.id, key.trim()))
        ? { ok: true as const }
        : {
            ok: false as const,
            message:
              useConnectionStore.getState().tests[connection.id]?.error?.message ??
              'Không lưu được khóa.'
          }
    setActivating(false)
    if (!outcome.ok) {
      notify({
        kind: 'error',
        title: 'Chưa kích hoạt được ' + connection.name,
        message: outcome.message
      })
      return
    }
    setKey('')
    notify({ kind: 'success', title: connection.name, message: 'Đã kích hoạt.' })
  }

  async function setThinking(choice: ThinkingChoice): Promise<void> {
    if (!entry) return
    const outcome = await store.entries.update(entry.id, { settings: thinkingPatch(choice) })
    if (!outcome.ok)
      notify({ kind: 'error', title: 'Không đổi được mức suy luận', message: outcome.message })
  }

  if (live.length === 0) {
    return (
      <SettingsSection title="Model chính" icon={<CpuIcon size={16} />}>
        <SettingRow
          id="main-model"
          title="Chưa có model nào"
          hint="Thêm một kết nối và ít nhất một mục model trước, rồi chọn model chính ở đây."
        >
          <Button
            variant="solid"
            onClick={() => openSettings({ group: 'connections', page: 'keys' })}
          >
            Thêm kết nối
          </Button>
        </SettingRow>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection title="Model chính" icon={<CpuIcon size={16} />}>
      <SettingRow
        id="main-model"
        wide
        title="Model chính"
        hint="Dùng cho chat mới, hộp thoại dịch và hàng chờ dịch khi chưa chọn model khác. Đổi model trong ô chat chỉ áp cho phiên đó."
        below={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Kết nối"
              value={connection?.id ?? ''}
              options={live.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                const next = live.find((item) => item.id === value)
                setPicked({
                  connectionId: value,
                  entryId:
                    next?.models.find((item) => item.id === next.defaultEntryId)?.id ??
                    next?.models[0]?.id ??
                    null
                })
              }}
              className="min-w-40"
            />
            <Select
              label="Mục model"
              value={entry?.id ?? ''}
              options={(connection?.models ?? []).map((item) => ({
                value: item.id,
                label: item.name
              }))}
              onChange={(value) =>
                connection && setPicked({ connectionId: connection.id, entryId: value })
              }
              className="min-w-60"
            />
            <Button
              variant="solid"
              loading={applying}
              disabled={!changed}
              onClick={() => void apply()}
            >
              Áp dụng
            </Button>
            {current?.source === 'default' && !main && (
              <span className="text-body-xs text-subtle">
                Chưa đặt; đang dùng mặc định của{' '}
                {connections.find((item) => item.id === current.connectionId)?.name}.
              </span>
            )}
          </div>
        }
      />
      {needsKey && connection && (
        <SettingRow
          title={'Kích hoạt ' + connection.name}
          hint="Kết nối này chưa có khóa dùng được."
        >
          <TextField
            label={'Khóa ' + connection.name}
            type="password"
            className="min-w-0 flex-1 [&>label]:sr-only"
            placeholder={'Dán khóa ' + connection.name}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void activate()
              }
            }}
          />
          <Button
            variant="solid"
            loading={activating}
            disabled={!key.trim()}
            onClick={() => void activate()}
          >
            Kích hoạt
          </Button>
        </SettingRow>
      )}
      {entry && (
        <SettingRow
          id="main-thinking"
          title="Mức suy luận"
          hint={
            entry.capability.thinkingLevels.length === 0
              ? 'Chưa biết model này hỗ trợ mức nào, nên chỉ có Mặc định (không gửi gì).'
              : 'Ghi vào mục model, nên menu model trong chat cũng thấy mức này.'
          }
        >
          <Select
            label="Mức suy luận"
            value={thinkingChoiceOf(entry.settings)}
            options={thinkingOptions(entry.capability, entry.settings.thinking).map((option) => ({
              value: option.value,
              label: option.value === 'default' ? DEFAULT_THINKING_LABEL : option.label
            }))}
            onChange={(value) => void setThinking(value as ThinkingChoice)}
          />
        </SettingRow>
      )}
    </SettingsSection>
  )
}

const SAME_AS_TURN = 'Dùng model của lượt'

/** Cài đặt › Model › Model phụ: việc nền của agent (tóm tắt lịch sử chat), tự lưu khi chọn. */
export function AuxiliaryModelPage(): JSX.Element {
  usePreferences()
  const { connections } = useConnections()
  const store = useConnectionStore()
  const auxiliary = store.preferences?.auxiliary ?? null
  const live = usable(connections)
  const connection = live.find((item) => item.id === auxiliary?.connectionId) ?? null

  return (
    <SettingsSection title="Model phụ" icon={<CpuIcon size={16} />}>
      <SettingRow
        id="auxiliary-model"
        wide
        title="Model cho việc nền của agent"
        hint="Dùng để tóm tắt các lượt chat cũ khi phiên quá dài, nên chọn một model rẻ và nhanh. Không dùng cho chat hay dịch. Chưa chọn thì dùng model của lượt."
        below={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Kết nối"
              value={connection?.id ?? ''}
              options={[
                { value: '', label: SAME_AS_TURN },
                ...live.map((item) => ({ value: item.id, label: item.name }))
              ]}
              onChange={(value) => {
                const next = live.find((item) => item.id === value)
                const entry =
                  next?.models.find((item) => item.id === next.defaultEntryId) ?? next?.models[0]
                void store.setAuxiliaryModel(
                  next && entry ? { connectionId: next.id, entryId: entry.id } : null
                )
              }}
              className="min-w-40"
            />
            {connection && (
              <Select
                label="Mục model"
                value={auxiliary?.entryId ?? ''}
                options={connection.models.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(entryId) =>
                  void store.setAuxiliaryModel({ connectionId: connection.id, entryId })
                }
                className="min-w-60"
              />
            )}
          </div>
        }
      />
    </SettingsSection>
  )
}

/** Cài đặt › Model › Dự phòng: danh sách có thứ tự, tự lưu sau mỗi thay đổi. */
export function FallbacksPage(): JSX.Element {
  usePreferences()
  const { connections } = useConnections()
  const store = useConnectionStore()
  const saved = store.preferences?.fallbacks ?? []
  // Danh sách đang cập nhật hiển thị ngay lập tức (optimistic UI); dữ liệu lưu sẽ đồng bộ sau khi hoàn tất.
  const [draft, setDraft] = useState<ModelRef[] | null>(null)
  const list = draft ?? saved
  const live = usable(connections)
  const mainEntryId = store.preferences?.main?.entryId ?? null
  // Main bỏ mục trùng khi lưu, nên mọi lựa chọn mặc định phải tránh model đã có ở dòng khác.
  const takenBesides = (index: number): Set<string> =>
    new Set(list.filter((_, at) => at !== index).map((item) => item.entryId))
  const nextFree = firstFreeModel(connections, takenBesides(-1), mainEntryId)

  async function commit(next: ModelRef[]): Promise<void> {
    setDraft(next)
    await store.setFallbacks(next)
    setDraft(null)
  }

  function entriesOf(connectionId: string): ConnectionView['models'] {
    return live.find((item) => item.id === connectionId)?.models ?? []
  }

  return (
    <SettingsSection title="Model dự phòng" icon={<RestartIcon size={16} />}>
      <SettingRow
        id="fallbacks"
        wide
        title="Thử theo thứ tự khi model chính không dùng được"
        hint="Chỉ khi hết hạn mức, model không tồn tại, hoặc máy chủ lỗi kéo dài. Lỗi do nội dung bị chặn hay request sai không chuyển dự phòng. Chat tự chuyển và ghi lại trên lượt. Dịch chương thì dừng và hỏi “Dịch tiếp bằng …” cho các đoạn còn lại, để một chương không tự đổi giọng văn."
        below={
          <div className="flex flex-col gap-1.5">
            {list.length === 0 && (
              <p className="m-0 text-body-xs text-subtle">
                Chưa có model dự phòng; khi model chính lỗi, Mira dừng và báo lỗi.
              </p>
            )}
            {list.map((ref, index) => {
              const others = takenBesides(index)
              return (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-right font-mono text-body-xs text-muted">
                    {index + 1}
                  </span>
                  <Select
                    label={'Kết nối dự phòng ' + (index + 1)}
                    value={ref.connectionId}
                    options={live
                      .filter(
                        (item) =>
                          item.id === ref.connectionId ||
                          firstFreeModel(connections, others, mainEntryId, item.id) !== null
                      )
                      .map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(connectionId) => {
                      const free = firstFreeModel(connections, others, mainEntryId, connectionId)
                      if (!free) return
                      void commit(list.map((item, at) => (at === index ? free : item)))
                    }}
                    className="min-w-36"
                  />
                  <Select
                    label={'Model dự phòng ' + (index + 1)}
                    value={ref.entryId}
                    options={entriesOf(ref.connectionId)
                      .filter((item) => !others.has(item.id))
                      .map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(entryId) =>
                      void commit(
                        list.map((item, at) => (at === index ? { ...item, entryId } : item))
                      )
                    }
                    className="min-w-52 flex-1"
                  />
                  <CompactButton
                    aria-label={'Bỏ dự phòng ' + (index + 1)}
                    onClick={() => void commit(list.filter((_, at) => at !== index))}
                    icon={<CloseIcon size={12} />}
                  />
                </div>
              )
            })}
            {list.length < MAX_FALLBACKS && nextFree && (
              <Button
                variant="ghost"
                className="self-start"
                onClick={() => void commit([...list, nextFree])}
              >
                <AddCircleIcon size={14} />
                Thêm dự phòng
              </Button>
            )}
            {list.length > 0 && list.length < MAX_FALLBACKS && !nextFree && (
              <p className="m-0 text-body-xs text-subtle">
                Mọi model của các kết nối đã có trong danh sách. Thêm model ở thẻ kết nối để có thêm
                dự phòng.
              </p>
            )}
          </div>
        }
      />
    </SettingsSection>
  )
}
