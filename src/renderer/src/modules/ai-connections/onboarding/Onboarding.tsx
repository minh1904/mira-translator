import { useEffect, useReducer, useState, type JSX } from 'react'
import { CheckIcon, CloseIcon, DangerCircleIcon, RefreshIcon } from '@renderer/components/ui/reicon'

import { CONNECTION_PRESETS } from '../../../../../shared/contracts/aiConnections'
import { PROVIDER_CARDS } from '../../../../../shared/contracts/aiProviders'
import { ActionRow } from '../../../components/ui/ActionRow'
import { Badge } from '../../../components/ui/Badge'
import { Button, LinkButton } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { Disclosure } from '../../../components/ui/Disclosure'
import { TextField } from '../../../components/ui/Field'
import { ICON } from '../../../components/ui/icon'
import { emptyTest, useConnectionStore } from '../store/connectionStore'
import { useAiOverlayStore } from '../store/overlayStore'
import { ModelSelectionMenu } from '../model-selection/ModelSelectionMenu'
import { thinkingPatch } from '../model-selection/modelSettingsForm'
import { FlowPanel } from './AccountFlow'
import { useAccountLogin } from './accountLogin'
import { INITIAL_ONBOARDING, onboardingReducer, type OnboardingState } from './onboardingMachine'

const GATEWAY = CONNECTION_PRESETS.find((preset) => preset.id === 'gateway')!
const LOCALS = CONNECTION_PRESETS.filter(
  (preset) => preset.id === 'ollama' || preset.id === 'lmstudio'
)

function openLink(url: string): void {
  void window.mira.openExternal(url).catch(() => undefined)
}

/** Một hàng trong danh sách lựa chọn nhà cung cấp: tiêu đề, mô tả cách kết nối và mũi tên điều hướng. */
function ProviderRow({
  title,
  subtitle,
  tag,
  featured = false,
  disabled = false,
  onClick
}: {
  title: string
  subtitle: string
  tag?: JSX.Element
  featured?: boolean
  disabled?: boolean
  onClick?(): void
}): JSX.Element {
  return (
    <ActionRow
      title={title}
      tag={tag}
      description={subtitle}
      featured={featured}
      disabled={disabled}
      onClick={onClick}
    />
  )
}

function Picker({
  state,
  dispatch,
  onSkip,
  manual
}: {
  state: Extract<OnboardingState, { step: 'idle' }>
  dispatch: React.Dispatch<Parameters<typeof onboardingReducer>[1]>
  onSkip(): void
  manual: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <ProviderRow
        featured
        title="Gateway tự dựng"
        tag={
          <Badge variant="outline" dot color="success">
            Khuyên dùng
          </Badge>
        }
        subtitle="Gateway chạy trên máy bạn (ví dụ CLIProxyAPI) gom nhiều tài khoản về một địa chỉ tương thích OpenAI."
        onClick={() =>
          dispatch({ type: 'pick_endpoint', baseUrl: GATEWAY.baseUrl, label: GATEWAY.label })
        }
      />
      <Disclosure
        label="Nhà cung cấp khác"
        open={state.showAll}
        onOpenChange={(open) => {
          if (open !== state.showAll) dispatch({ type: 'toggle_all' })
        }}
        className="mt-2"
      >
        <div className="flex flex-col gap-1">
          {PROVIDER_CARDS.map((card) => (
            <ProviderRow
              key={card.id}
              title={card.label}
              subtitle="Dán khóa API; Mira kiểm khóa rồi kết nối."
              onClick={() => dispatch({ type: 'pick_key', providerId: card.id })}
            />
          ))}
          {LOCALS.map((preset) => (
            <ProviderRow
              key={preset.id}
              title={preset.label}
              subtitle="Model chạy trên máy này, không cần khóa."
              onClick={() =>
                dispatch({ type: 'pick_endpoint', baseUrl: preset.baseUrl, label: preset.label })
              }
            />
          ))}
          <ProviderRow
            title="ChatGPT / Codex"
            subtitle="Đăng nhập bằng gói ChatGPT Plus/Pro; Mira mở trang xác minh của OpenAI."
            onClick={() => dispatch({ type: 'pick_account', provider: 'codex' })}
          />
          <ProviderRow
            title="GitHub Copilot"
            subtitle="Đăng nhập bằng gói Copilot; Mira mở trang xác minh của GitHub."
            onClick={() => dispatch({ type: 'pick_account', provider: 'copilot' })}
          />
          <p className="m-0 px-3 text-body-xs text-muted">
            Đăng nhập dùng cách giống công cụ chính hãng; nhà cung cấp có thể đổi hoặc chặn cách
            này.
          </p>
        </div>
      </Disclosure>
      <div className="mt-4 flex items-center justify-between gap-2">
        {manual ? (
          <span />
        ) : (
          <LinkButton color="neutral" onClick={onSkip}>
            Để sau
          </LinkButton>
        )}
        <Button onClick={() => dispatch({ type: 'pick_key', providerId: PROVIDER_CARDS[0]!.id })}>
          Tôi có khóa API
        </Button>
      </div>
    </div>
  )
}

function KeyForm({
  providerId,
  dispatch,
  onConnect
}: {
  providerId: string
  dispatch: React.Dispatch<Parameters<typeof onboardingReducer>[1]>
  onConnect(providerId: string, key: string): void
}): JSX.Element {
  const connections = useConnectionStore((state) => state.connections)
  const [key, setKey] = useState('')
  const card = PROVIDER_CARDS.find((item) => item.id === providerId) ?? PROVIDER_CARDS[0]!
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {PROVIDER_CARDS.map((item) => {
          const selected = item.id === card.id
          const hasKey = connections.some(
            (connection) => connection.providerId === item.id && connection.keys.length > 0
          )
          return (
            <Button
              key={item.id}
              variant={selected ? 'light' : 'outline'}
              aria-pressed={selected}
              className="justify-between"
              onClick={() => dispatch({ type: 'pick_key', providerId: item.id })}
              rightIcon={
                hasKey ? (
                  <CheckIcon size={ICON.sm} aria-hidden="true" className="text-success" />
                ) : undefined
              }
            >
              {item.label}
            </Button>
          )
        })}
      </div>
      <p className="m-0 text-body-xs leading-normal text-subtle">
        {card.description}{' '}
        <LinkButton className="h-auto" onClick={() => openLink(card.keyUrl)}>
          Lấy khóa ↗
        </LinkButton>
      </p>
      <TextField
        label={'Khóa API ' + card.label}
        type="password"
        autoFocus
        placeholder="Dán khóa API"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && key.trim()) {
            event.preventDefault()
            onConnect(card.id, key.trim())
          }
        }}
      />
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={() => dispatch({ type: 'back' })}>
          Quay lại
        </Button>
        <Button
          variant="solid"
          disabled={!key.trim()}
          onClick={() => onConnect(card.id, key.trim())}
        >
          Kết nối
        </Button>
      </div>
    </div>
  )
}

function EndpointForm({
  baseUrl,
  label,
  dispatch,
  onConnect
}: {
  baseUrl: string
  label: string
  dispatch: React.Dispatch<Parameters<typeof onboardingReducer>[1]>
  onConnect(baseUrl: string, label: string, key: string): void
}): JSX.Element {
  const [url, setUrl] = useState(baseUrl)
  const [key, setKey] = useState('')
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url)
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Địa chỉ (URL)"
        className="font-mono"
        value={url}
        hint={CONNECTION_PRESETS.find((preset) => preset.baseUrl === baseUrl)?.hint}
        onChange={(event) => setUrl(event.target.value)}
      />
      <TextField
        label={local ? 'Khóa API (thường không cần)' : 'Khóa API'}
        type="password"
        value={key}
        onChange={(event) => setKey(event.target.value)}
      />
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={() => dispatch({ type: 'back' })}>
          Quay lại
        </Button>
        <Button
          variant="solid"
          disabled={!url.trim()}
          onClick={() => onConnect(url.trim(), label, key.trim())}
        >
          Kết nối
        </Button>
      </div>
    </div>
  )
}

export function ConfirmModel({
  connectionId,
  onBegin
}: {
  connectionId: string
  onBegin(entryId: string): void
}): JSX.Element {
  const connection = useConnectionStore((state) =>
    state.connections.find((item) => item.id === connectionId)
  )
  const test = useConnectionStore((state) => state.tests[connectionId] ?? emptyTest)
  const setThinking = useConnectionStore((state) => state.entries.update)
  const [entryId, setEntryId] = useState<string | null>(null)
  if (!connection) return <p className="m-0 text-body-sm text-subtle">Đang tải…</p>
  const entry =
    connection.models.find((item) => item.id === entryId) ??
    connection.models.find((item) => item.id === connection.defaultEntryId) ??
    connection.models[0]
  const price = entry ? test.models.find((model) => model.id === entry.model) : undefined
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex items-center gap-2 text-body-lg font-semibold">
        <CheckIcon size={18} className="text-success" />
        Đã kết nối {connection.name}
      </span>
      <span className="text-body-xs font-medium tracking-wide text-muted uppercase">
        Model mặc định
      </span>
      {entry ? (
        <>
          <span className="font-mono text-body-md">{entry.name}</span>
          {price?.inputCost !== undefined && price.outputCost !== undefined ? (
            <span className="text-body-xs text-subtle">
              ${price.inputCost} / ${price.outputCost} mỗi triệu token (vào / ra)
            </span>
          ) : (
            <span className="text-body-xs text-muted">Chưa có giá tham khảo cho model này.</span>
          )}
          <ModelSelectionMenu
            variant="field"
            label="Đổi model"
            connections={[connection]}
            selected={{ connectionId: connection.id, entryId: entry.id }}
            onSelect={(selection) => setEntryId(selection.entryId)}
            onSelectThinking={(selection, choice) => {
              setEntryId(selection.entryId)
              void setThinking(selection.entryId, { settings: thinkingPatch(choice) })
            }}
          />
          <Button variant="solid" onClick={() => onBegin(entry.id)}>
            Bắt đầu
          </Button>
        </>
      ) : (
        <p className="m-0 text-body-xs text-subtle">
          Kết nối không liệt kê model nào. Thêm một mục model trong Cài đặt rồi chọn làm model
          chính.
        </p>
      )}
    </div>
  )
}

/**
 * Thẻ hướng dẫn kết nối AI ban đầu: tự động mở khi thư viện chưa có kết nối AI nào
 * và chưa chọn "Để sau", hoặc khi người dùng chọn thêm nhà cung cấp từ menu model.
 */
export function Onboarding(): JSX.Element | null {
  const store = useConnectionStore()
  const manual = useAiOverlayStore((state) => state.onboardingOpen)
  const setManual = useAiOverlayStore((state) => state.setOnboardingOpen)
  const [dismissed, setDismissed] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [state, dispatch] = useReducer(onboardingReducer, INITIAL_ONBOARDING)
  // Danh sách model của tài khoản mới được nạp tự động từ tiến trình chính.
  useAccountLogin(state, dispatch, () => undefined)

  useEffect(() => {
    if (store.load === 'loading') void store.reload()
    if (store.preferences === null) void store.loadPreferences()
  }, [store])

  const auto =
    store.load === 'ready' &&
    store.preferences !== null &&
    !store.preferences.onboardingSkipped &&
    store.connections.length === 0 &&
    !dismissed
  // Khi một quy trình kết nối đã bắt đầu, giữ nguyên hiển thị cho đến khi hoàn tất hoặc đóng lại.
  const visible = manual || auto || state.step !== 'idle'
  if (!visible) return null

  function close(): void {
    setManual(false)
    setDismissed(true)
    dispatch({ type: 'back' })
  }

  async function finishConnection(connectionId: string, keyTail?: string): Promise<void> {
    await store.test(connectionId)
    const test = useConnectionStore.getState().tests[connectionId]
    if (test?.error) {
      // Khóa API không hoạt động sẽ được tự động gỡ bỏ để tránh tồn đọng khóa lỗi khi thử lại.
      const added = useConnectionStore
        .getState()
        .connections.find((item) => item.id === connectionId)
        ?.keys.findLast((key) => key.tail === keyTail)
      if (added) await store.removeKey(connectionId, added.id)
      dispatch({ type: 'failed', message: test.error.message })
      return
    }
    const connection = useConnectionStore
      .getState()
      .connections.find((item) => item.id === connectionId)
    if (connection && connection.models.length === 0 && test?.models[0]) {
      await store.entries.add(connectionId, [{ model: test.models[0].id }])
    }
    dispatch({ type: 'connected', connectionId })
  }

  async function connectKey(providerId: string, key: string): Promise<void> {
    const card = PROVIDER_CARDS.find((item) => item.id === providerId)
    dispatch({ type: 'submit', label: card?.label ?? providerId })
    const result = await store.ensureWithKey(providerId, key)
    if (!result.ok) {
      dispatch({ type: 'failed', message: result.message })
      return
    }
    await finishConnection(result.connection.id, key.slice(-4))
  }

  async function connectEndpoint(baseUrl: string, label: string, key: string): Promise<void> {
    dispatch({ type: 'submit', label })
    const probe = await store.probe({ baseUrl, secret: key || undefined })
    if (!probe.ok) {
      dispatch({ type: 'failed', message: probe.message })
      return
    }
    if (!probe.value.ok) {
      dispatch({ type: 'failed', message: probe.value.message })
      return
    }
    const preset = CONNECTION_PRESETS.find((item) => item.baseUrl === baseUrl)
    const created = await store.create({
      name: preset?.label ?? label,
      baseUrl: probe.value.resolvedBaseUrl ?? baseUrl,
      providerId: preset?.providerId ?? null
    })
    if (!created) {
      dispatch({
        type: 'failed',
        message: useConnectionStore.getState().notice ?? 'Không tạo được kết nối.'
      })
      return
    }
    if (key) await store.addKey(created.id, key)
    if (probe.value.models[0])
      await store.entries.add(created.id, [{ model: probe.value.models[0] }])
    dispatch({ type: 'connected', connectionId: created.id })
  }

  async function begin(entryId: string): Promise<void> {
    if (state.step !== 'confirm_model') return
    await store.setMainModel({ connectionId: state.connectionId, entryId })
    close()
  }

  return (
    <div className="fixed inset-0 z-(--mira-z-toast) flex items-center justify-center bg-backdrop p-6 backdrop-blur-[0.125rem]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Kết nối nhà cung cấp AI"
        className="relative flex max-h-full w-full max-w-[45rem] flex-col gap-4 overflow-y-auto rounded-md border border-strong bg-surface p-6 text-default shadow-lg"
      >
        {(manual || state.step !== 'idle') && (
          <CompactButton
            aria-label="Đóng"
            className="absolute top-3 right-3"
            onClick={close}
            icon={<CloseIcon size={14} />}
          />
        )}
        {state.step !== 'confirm_model' && (
          <header className="flex flex-col gap-1 pr-8">
            <h2 className="m-0 text-body-lg font-semibold">Kết nối một nhà cung cấp AI</h2>
            <p className="m-0 text-body-sm text-subtle">
              Cần một kết nối để dịch và chat bằng AI. Phần lớn chỉ mất một lần dán khóa.
            </p>
          </header>
        )}
        {state.step === 'idle' && (
          <Picker
            state={state}
            dispatch={dispatch}
            manual={manual}
            onSkip={() => {
              void store.setOnboardingSkipped(true)
              close()
            }}
          />
        )}
        {state.step === 'key_form' && (
          <KeyForm
            providerId={state.providerId}
            dispatch={dispatch}
            onConnect={(id, key) => void connectKey(id, key)}
          />
        )}
        {state.step === 'endpoint_form' && (
          <EndpointForm
            baseUrl={state.baseUrl}
            label={state.label}
            dispatch={dispatch}
            onConnect={(url, label, key) => void connectEndpoint(url, label, key)}
          />
        )}
        {(state.step === 'starting' || state.step === 'polling') && (
          <FlowPanel state={state} onCancel={() => dispatch({ type: 'back' })} />
        )}
        {state.step === 'connecting' && (
          <p role="status" className="m-0 flex items-center gap-2 py-6 text-body-sm text-subtle">
            <RefreshIcon size={14} className="animate-spin" />
            Đang kết nối {state.label}…
          </p>
        )}
        {state.step === 'confirm_model' && (
          <ConfirmModel
            connectionId={state.connectionId}
            onBegin={(entryId) => void begin(entryId)}
          />
        )}
        {state.step === 'error' && (
          <div role="alert" className="flex flex-col gap-3">
            <p className="m-0 flex items-start gap-2 text-body-sm">
              <DangerCircleIcon size={16} className="mt-0.5 shrink-0 text-error" />
              <span>
                {state.form.step === 'account'
                  ? state.message.startsWith('Đăng nhập')
                    ? state.message
                    : 'Đăng nhập ' + state.label + ' chưa xong. ' + state.message
                  : 'Kết nối ' + state.label + ' chưa xong. ' + state.message}
              </span>
            </p>
            {state.detail && (
              <Disclosure label="Chi tiết" open={detailOpen} onOpenChange={setDetailOpen}>
                <pre className="selectable mt-1 whitespace-pre-wrap text-body-xs text-subtle">
                  {state.detail}
                </pre>
              </Disclosure>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => dispatch({ type: 'back' })}>
                Chọn nhà cung cấp khác
              </Button>
              <Button
                onClick={() => dispatch({ type: 'pick_key', providerId: PROVIDER_CARDS[0]!.id })}
              >
                {state.form.step === 'account' ? 'Dùng khóa API' : 'Dùng khóa API khác'}
              </Button>
              <Button variant="solid" onClick={() => dispatch({ type: 'retry' })}>
                Thử lại
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
