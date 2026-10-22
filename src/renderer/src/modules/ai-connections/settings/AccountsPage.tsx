import { useCallback, useReducer, useState, type JSX } from 'react'
import {
  CheckCircleIcon,
  DangerCircleIcon,
  RefreshIcon,
  TrashBinTrashIcon,
  UserCircleIcon
} from '@renderer/components/ui/reicon'

import {
  USAGE_WARN_BELOW,
  usageChip,
  type AccountProvider,
  type UsageWindowView
} from '../../../../../shared/contracts/aiAccounts'
import type { ConnectionView } from '../../../../../shared/contracts/aiConnections'
import { ActionRow } from '../../../components/ui/ActionRow'
import { Button, LinkButton } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { cn } from '../../../lib/cn'
import { Dialog } from '../../../components/ui/Dialog'
import { Disclosure } from '../../../components/ui/Disclosure'
import { SettingsSection } from '../../../components/ui/Setting'
import { useConnectionStore } from '../store/connectionStore'
import { notify } from '../../../components/ui/notificationStore'
import { useAiOverlayStore } from '../store/overlayStore'
import { FlowPanel } from '../onboarding/AccountFlow'
import { useAccountLogin } from '../onboarding/accountLogin'
import { useAccountUsage } from './accountUsage'
import { ConfirmModel } from '../onboarding/Onboarding'
import {
  ACCOUNT_LABELS,
  INITIAL_ONBOARDING,
  onboardingReducer
} from '../onboarding/onboardingMachine'

/**
 * Cài đặt › Kết nối AI › Tài khoản: đăng nhập bằng gói ChatGPT hoặc Copilot qua mã thiết bị,
 * xem thông tin tài khoản đã kết nối, đăng nhập lại khi phiên hết hạn, và ngắt kết nối.
 */

const ACCOUNT_CARDS: ReadonlyArray<{ id: AccountProvider; flow: string }> = [
  {
    id: 'codex',
    flow: 'Mở trang xác minh trên trình duyệt; Mira tự kết nối khi bạn nhập mã.'
  },
  {
    id: 'copilot',
    flow: 'Mở trang xác minh của GitHub; Mira tự kết nối khi bạn nhập mã.'
  }
]

const TERMS_NOTE =
  'Đăng nhập dùng cách giống công cụ chính hãng; nhà cung cấp có thể đổi hoặc chặn cách này.'

function formatReset(at: number | null): string {
  if (at === null) return ''
  return (
    ' · đặt lại ' +
    new Date(at).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    })
  )
}

/** Hiển thị phần trăm hạn mức còn lại và thời gian đặt lại khi dưới ngưỡng 20%. */
export function UsageChip({ windows }: { windows: UsageWindowView[] }): JSX.Element | null {
  const chip = usageChip(windows)
  if (!chip) return null
  const warn = chip.remainingPercent < USAGE_WARN_BELOW
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm px-1.5 text-body-xs',
        warn ? 'bg-warning/15 text-warning' : 'bg-muted text-subtle'
      )}
    >
      {(chip.kind === 'week' ? 'Tuần: ' : chip.kind === 'session' ? 'Phiên: ' : '') +
        'Còn ' +
        Math.round(chip.remainingPercent) +
        ' %' +
        formatReset(chip.resetsAt)}
    </span>
  )
}

/** Nhãn thông tin hạn mức tài khoản hiển thị trên tiêu đề nhóm của menu model. */
export function AccountUsageChip({
  connection
}: {
  connection: ConnectionView | undefined
}): JSX.Element | null {
  const windows = useAccountUsage(connection)
  return <UsageChip windows={windows} />
}

/** Thẻ tài khoản đã kết nối: thông tin người dùng, hạn mức sử dụng, nút đăng nhập lại hoặc ngắt kết nối. */
export function ConnectedCard({
  provider,
  connection,
  onRelogin
}: {
  provider: AccountProvider
  connection: ConnectionView
  onRelogin(): void
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const windows = useAccountUsage(connection)
  const label = ACCOUNT_LABELS[provider]
  const relogin = connection.account?.state === 'relogin'

  async function disconnect(): Promise<void> {
    setConfirming(false)
    setRemoving(true)
    const result = await window.mira.ai.accounts.disconnect(connection.id)
    setRemoving(false)
    if (!result.ok) {
      notify({ kind: 'error', title: label, message: result.error.message })
      return
    }
    await useConnectionStore.getState().reload()
    await useConnectionStore.getState().loadPreferences()
    notify({ kind: 'success', title: label, message: 'Đã ngắt kết nối.' })
  }

  return (
    <div
      data-setting-id={'account:' + provider}
      className="flex items-center justify-between gap-3 rounded-sm bg-muted px-3 py-2.5"
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 text-body-sm font-semibold">
          {label}
          {relogin ? (
            <span className="inline-flex items-center gap-1 text-body-xs font-normal text-error">
              <DangerCircleIcon size={12} aria-hidden="true" />
              Cần đăng nhập lại
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-body-xs font-normal text-success">
              <CheckCircleIcon size={12} aria-hidden="true" />
              Đã kết nối
            </span>
          )}
          <UsageChip windows={windows} />
        </span>
        <span className="mt-1 truncate text-body-xs text-subtle">
          {connection.account?.label ?? 'Tài khoản đã đăng nhập'} · {connection.models.length} model
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {relogin && (
          <Button variant="solid" onClick={onRelogin}>
            Đăng nhập lại
          </Button>
        )}
        <CompactButton
          aria-label={'Ngắt ' + label}
          title={'Ngắt ' + label}
          disabled={removing}
          onClick={() => setConfirming(true)}
          icon={
            removing ? (
              <RefreshIcon size={14} className="motion-safe:animate-spin" />
            ) : (
              <TrashBinTrashIcon size={14} />
            )
          }
        />
      </span>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={'Ngắt ' + label + '?'}
        description="Token đăng nhập bị xóa khỏi máy này. Model chính hay dự phòng trỏ tới tài khoản này cũng bị gỡ."
      >
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Giữ
          </Button>
          <Button color="danger" variant="solid" onClick={() => void disconnect()}>
            Ngắt
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

/** Cài đặt › Kết nối AI › Tài khoản. */
export function AccountsPage(): JSX.Element {
  const openSettings = useAiOverlayStore((state) => state.openSettings)
  const connections = useConnectionStore((state) => state.connections)
  const [flow, dispatch] = useReducer(onboardingReducer, INITIAL_ONBOARDING)
  const [detailOpen, setDetailOpen] = useState(false)
  const onConnected = useCallback((connectionId: string) => {
    const name = useConnectionStore
      .getState()
      .connections.find((item) => item.id === connectionId)?.name
    notify({ kind: 'success', title: name ?? 'Tài khoản', message: 'Đã kết nối.' })
  }, [])
  useAccountLogin(flow, dispatch, onConnected)

  const accountOf = (provider: AccountProvider): ConnectionView | undefined =>
    connections.find((item) => item.oauthProvider === provider)
  const connected = ACCOUNT_CARDS.filter((card) => accountOf(card.id))
  const others = ACCOUNT_CARDS.filter((card) => !accountOf(card.id))

  return (
    <SettingsSection
      title="Kết nối tài khoản"
      icon={<UserCircleIcon size={16} />}
      aside={
        <LinkButton
          color="neutral"
          onClick={() => openSettings({ group: 'connections', page: 'keys' })}
        >
          Có khóa API?
        </LinkButton>
      }
    >
      <p className="m-0 mb-2 text-body-xs text-subtle">
        Đăng nhập bằng gói thuê bao, không cần sao chép khóa.
      </p>

      {(flow.step === 'starting' || flow.step === 'polling') && (
        <div className="rounded-sm border border-default p-3">
          <FlowPanel state={flow} onCancel={() => dispatch({ type: 'back' })} />
        </div>
      )}
      {flow.step === 'confirm_model' && (
        <div className="rounded-sm border border-default p-3">
          <ConfirmModel
            connectionId={flow.connectionId}
            onBegin={(entryId) => {
              void useConnectionStore
                .getState()
                .setMainModel({ connectionId: flow.connectionId, entryId })
              dispatch({ type: 'back' })
            }}
          />
        </div>
      )}
      {flow.step === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-sm border border-error/40 bg-error/5 p-3"
        >
          <p className="m-0 flex items-start gap-2 text-body-sm">
            <DangerCircleIcon size={16} className="mt-0.5 shrink-0 text-error" />
            <span>
              {flow.message.startsWith('Đăng nhập')
                ? flow.message
                : 'Đăng nhập ' + flow.label + ' chưa xong. ' + flow.message}
            </span>
          </p>
          {flow.detail && (
            <Disclosure label="Chi tiết" open={detailOpen} onOpenChange={setDetailOpen}>
              <pre className="selectable mt-1 whitespace-pre-wrap text-body-xs text-subtle">
                {flow.detail}
              </pre>
            </Disclosure>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => dispatch({ type: 'back' })}>
              Chọn nhà cung cấp khác
            </Button>
            <Button onClick={() => openSettings({ group: 'connections', page: 'keys' })}>
              Dùng khóa API
            </Button>
            <Button variant="solid" onClick={() => dispatch({ type: 'retry' })}>
              Thử lại
            </Button>
          </div>
        </div>
      )}

      {connected.length > 0 && (
        <>
          <span className="mt-3 block px-0.5 text-body-xs font-medium text-muted">Đã kết nối</span>
          <div className="mt-1 flex flex-col gap-1">
            {connected.map((card) => (
              <ConnectedCard
                key={card.id}
                provider={card.id}
                connection={accountOf(card.id)!}
                onRelogin={() => dispatch({ type: 'pick_account', provider: card.id })}
              />
            ))}
          </div>
        </>
      )}

      <span className="mt-3 block px-0.5 text-body-xs font-medium text-muted">
        Nhà cung cấp khác
      </span>
      <div className="mt-1 flex flex-col gap-1">
        {others.map((card) => (
          <ActionRow
            key={card.id}
            data-setting-id={'account:' + card.id}
            disabled={flow.step === 'starting' || flow.step === 'polling'}
            onClick={() => dispatch({ type: 'pick_account', provider: card.id })}
            title={ACCOUNT_LABELS[card.id]}
            description={
              <>
                <span className="block">{card.flow}</span>
                <span className="mt-0.5 block text-muted">{TERMS_NOTE}</span>
              </>
            }
          />
        ))}
        <ActionRow
          data-setting-id="account:claude"
          onClick={() =>
            openSettings({ group: 'connections', page: 'keys', key: 'provider:anthropic' })
          }
          title="Claude"
          description="Mira không đăng nhập bằng gói Claude Pro/Max. Dùng khóa API Anthropic hoặc gateway tự dựng."
        />
      </div>
    </SettingsSection>
  )
}
