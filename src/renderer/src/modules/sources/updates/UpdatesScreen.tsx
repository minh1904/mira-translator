import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import {
  RefreshIcon,
  CheckCircleIcon,
  EyeIcon,
  FileCorruptedIcon
} from '@renderer/components/ui/reicon'

import { PageFrame } from '../../../components/ui/PageFrame'
import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'
import type { SourceUpdateEvent } from '../../../../../shared/contracts/sources'

export interface UpdatesScreenProps {
  initialEvents?: SourceUpdateEvent[]
  onOpenWork?: (workId: string) => void
}

const EVENT_LABELS: Record<
  SourceUpdateEvent['kind'],
  { label: string; color: BadgeColor; desc: string }
> = {
  added: {
    label: 'Chương mới',
    color: 'success',
    desc: 'Phát hiện chương mới từ nguồn. Mira không tự tải nội dung hay xếp hàng dịch.'
  },
  raw_changed: {
    label: 'Raw sửa đổi',
    color: 'warning',
    desc: 'Tác giả đã cập nhật nội dung raw. Bản dịch hiện tại được giữ nguyên.'
  },
  renamed: {
    label: 'Đổi tiêu đề',
    color: 'neutral',
    desc: 'Chương đã được đổi tiêu đề trên nguồn từ xa.'
  },
  moved: {
    label: 'Đổi thứ tự',
    color: 'neutral',
    desc: 'Thứ tự của chương đã được sắp xếp lại trên nguồn.'
  },
  access_changed: {
    label: 'Thay đổi quyền',
    color: 'warning',
    desc: 'Trạng thái truy cập hoặc bản quyền của chương đã thay đổi.'
  },
  missing_remote: {
    label: 'Vắng từ xa (3 lần)',
    color: 'error',
    desc: 'Chương không còn xuất hiện trên nguồn sau 3 lần kiểm tra. Dữ liệu dịch được giữ nguyên.'
  },
  reappeared: {
    label: 'Xuất hiện lại',
    color: 'info',
    desc: 'Chương từng bị gỡ đã xuất hiện trở lại trên nguồn.'
  }
}

export function UpdatesScreen({ initialEvents }: UpdatesScreenProps): JSX.Element {
  const [events, setEvents] = useState<SourceUpdateEvent[]>(initialEvents ?? [])
  const [loading, setLoading] = useState(!initialEvents)

  // Trạng thái đồng bộ
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)

  // Trạng thái hộp thoại so sánh khác biệt (diff)
  const [diffDialog, setDiffDialog] = useState<{
    open: boolean
    event: SourceUpdateEvent | null
    loading: boolean
    previewData: {
      canApply?: boolean
      oldText?: string
      newText?: string
      currentRev?: number
    } | null
  }>({
    open: false,
    event: null,
    loading: false,
    previewData: null
  })

  const fetchEvents = useCallback(async (): Promise<void> => {
    if (initialEvents) return
    setLoading(true)
    try {
      if (typeof window !== 'undefined' && window.mira?.sources?.updates) {
        const res = await window.mira.sources.updates.list({ unseenOnly: false })
        if (res.ok) {
          setEvents(res.value.items)
        }
      }
    } catch {
      // Bỏ qua lỗi
    } finally {
      setLoading(false)
    }
  }, [initialEvents])

  useEffect(() => {
    if (!initialEvents) {
      void fetchEvents()
    }
  }, [initialEvents, fetchEvents])

  // Đánh dấu tất cả sự kiện đã xem
  const handleMarkAllSeen = async (): Promise<void> => {
    const unseens = events.filter((e) => e.seenAt === null)
    if (unseens.length === 0) return

    const eventIds = unseens.map((e) => e.id)
    if (typeof window !== 'undefined' && window.mira?.sources?.updates) {
      const res = await window.mira.sources.updates.markSeen({
        workId: '',
        eventIds
      })
      if (res.ok) {
        setEvents((prev) =>
          prev.map((e) => (eventIds.includes(e.id) ? { ...e, seenAt: Date.now() } : e))
        )
      }
    } else {
      setEvents((prev) =>
        prev.map((e) => (eventIds.includes(e.id) ? { ...e, seenAt: Date.now() } : e))
      )
    }
  }

  // Đánh dấu một sự kiện đã xem
  const handleMarkSingleSeen = async (eventId: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.mira?.sources?.updates) {
      const res = await window.mira.sources.updates.markSeen({
        workId: '',
        eventIds: [eventId]
      })
      if (res.ok) {
        setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, seenAt: Date.now() } : e)))
      }
    } else {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, seenAt: Date.now() } : e)))
    }
  }

  // Kích hoạt kiểm tra cập nhật thủ công
  const handleCheckNow = (): void => {
    setIsSyncing(true)
    setSyncProgress(20)
    setTimeout(() => setSyncProgress(60), 400)
    setTimeout(() => {
      setSyncProgress(100)
      setIsSyncing(false)
      void fetchEvents()
    }, 900)
  }

  // Xem trước khác biệt cho sự kiện sửa đổi bản raw
  const handleOpenDiff = async (event: SourceUpdateEvent): Promise<void> => {
    setDiffDialog({
      open: true,
      event,
      loading: true,
      previewData: null
    })

    if (typeof window !== 'undefined' && window.mira?.sources?.updates) {
      try {
        const res = await window.mira.sources.updates.previewApply({
          workId: '',
          eventId: event.id
        })
        if (res.ok) {
          const val = res.value as {
            canApply?: boolean
            oldText?: string
            newText?: string
            currentRev?: number
          }
          setDiffDialog({
            open: true,
            event,
            loading: false,
            previewData: {
              canApply: val.canApply,
              oldText: val.oldText ?? 'Nội dung raw cũ…',
              newText: val.newText ?? 'Nội dung raw mới từ nguồn…',
              currentRev: val.currentRev ?? 1
            }
          })
          return
        }
      } catch {
        // Dữ liệu dự phòng khi gặp lỗi
      }
    }

    setDiffDialog({
      open: true,
      event,
      loading: false,
      previewData: {
        canApply: true,
        oldText: 'Nội dung raw cũ trước khi tác giả sửa…',
        newText: 'Nội dung raw mới cập nhật từ nguồn từ xa…',
        currentRev: 1
      }
    })
  }

  // Áp dụng bản cập nhật raw mới
  const handleApplyDiff = async (): Promise<void> => {
    if (!diffDialog.event || !diffDialog.previewData) return
    const eventId = diffDialog.event.id
    const expectedRev = diffDialog.previewData.currentRev ?? 1

    if (typeof window !== 'undefined' && window.mira?.sources?.updates) {
      await window.mira.sources.updates.apply({
        workId: '',
        eventId,
        expectedRev,
        expectedPreviewId: 'preview-apply-1'
      })
    }
    setDiffDialog((prev) => ({ ...prev, open: false }))
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, actedAt: Date.now(), seenAt: Date.now() } : e))
    )
  }

  // Gom nhóm các sự kiện theo ngày
  const groupedDays = useMemo(() => {
    const groups: { day: string; items: SourceUpdateEvent[] }[] = []
    const now = new Date()
    const todayStr = now.toDateString()
    const yesterday = new Date(now.getTime() - 86400000)
    const yesterdayStr = yesterday.toDateString()

    const sorted = [...events].sort((a, b) => b.detectedAt - a.detectedAt)

    for (const ev of sorted) {
      const d = new Date(ev.detectedAt)
      let dayName = d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      if (d.toDateString() === todayStr) {
        dayName = 'Hôm nay'
      } else if (d.toDateString() === yesterdayStr) {
        dayName = 'Hôm qua'
      }

      let group = groups.find((g) => g.day === dayName)
      if (!group) {
        group = { day: dayName, items: [] }
        groups.push(group)
      }
      group.items.push(ev)
    }

    return groups
  }, [events])

  const unseenCount = useMemo(() => events.filter((e) => e.seenAt === null).length, [events])

  return (
    <PageFrame
      title="Cập nhật"
      note="Theo dõi chương mới và sửa đổi từ các nguồn theo yêu cầu"
      actions={
        <div className="flex items-center gap-xs">
          {unseenCount > 0 && (
            <Button variant="outline" onClick={() => void handleMarkAllSeen()}>
              Đánh dấu tất cả đã xem ({unseenCount})
            </Button>
          )}
          <Button
            variant="solid"
            onClick={handleCheckNow}
            disabled={isSyncing}
            leftIcon={<RefreshIcon size={ICON.sm} />}
          >
            {isSyncing ? 'Đang kiểm tra…' : 'Kiểm tra ngay'}
          </Button>
        </div>
      }
    >
      {/* Thông báo tiến độ đang đồng bộ */}
      {isSyncing && (
        <div className="flex flex-col gap-xs rounded-sm border border-info bg-info/10 p-md">
          <div className="flex items-center justify-between text-body-sm">
            <span className="font-medium text-default">
              Đang rà soát các nguồn đang theo dõi...
            </span>
            <span className="text-body-xs text-muted">{syncProgress}%</span>
          </div>
          <ProgressBar value={syncProgress} label="Tiến độ quét cập nhật" />
        </div>
      )}

      {loading ? (
        <p role="status" className="py-xl text-center text-body-sm text-subtle">
          Đang tải dữ liệu cập nhật…
        </p>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CheckCircleIcon size={ICON.md} />}
          title="Không có cập nhật mới"
          actions={
            <Button variant="light" onClick={handleCheckNow}>
              Kiểm tra ngay
            </Button>
          }
        >
          Tất cả các nguồn đang được theo dõi đều đã đồng bộ. Bấm 'Kiểm tra ngay' khi cần kiểm tra
          lại.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-xl">
          {groupedDays.map(({ day, items }) => (
            <section key={day} aria-label={day} className="flex flex-col gap-xs">
              <h2 className="m-0 text-label-sm font-semibold text-subtle">{day}</h2>
              <ul className="m-0 list-none divide-y divide-subtle rounded-sm border border-default bg-surface p-0">
                {items.map((ev) => {
                  const info = EVENT_LABELS[ev.kind] ?? EVENT_LABELS.added
                  const payload = ev.payload ?? {}
                  const title =
                    (payload.title as string) ??
                    (payload.chapterTitle as string) ??
                    (payload.remoteChapterId as string) ??
                    'Cập nhật từ nguồn'
                  const isUnseen = ev.seenAt === null
                  const isActed = ev.actedAt !== null

                  return (
                    <li
                      key={ev.id}
                      data-slot="update-item"
                      className={cn(
                        'flex items-center justify-between gap-md px-md py-sm transition-colors',
                        isUnseen && 'bg-subtle/40'
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-sm">
                        <span className="mt-2xs">
                          <Badge color={info.color} dot={isUnseen}>
                            {info.label}
                          </Badge>
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-3xs">
                          <div className="flex items-center gap-xs">
                            <span className="truncate text-label-md font-semibold text-default">
                              {title}
                            </span>
                            {isActed && (
                              <Badge color="success" variant="plain">
                                Đã áp dụng
                              </Badge>
                            )}
                          </div>
                          <p className="m-0 text-body-xs text-subtle">{info.desc}</p>
                          <span className="text-body-xs text-muted">
                            {new Date(ev.detectedAt).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-xs">
                        {ev.kind === 'raw_changed' && !isActed && (
                          <Button
                            variant="solid"
                            onClick={() => void handleOpenDiff(ev)}
                            leftIcon={<FileCorruptedIcon size={ICON.xs} />}
                          >
                            Xem & Áp dụng
                          </Button>
                        )}
                        {isUnseen && (
                          <Button
                            variant="ghost"
                            onClick={() => void handleMarkSingleSeen(ev.id)}
                            leftIcon={<EyeIcon size={ICON.xs} />}
                          >
                            Đã xem
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className={cn('m-0 text-body-xs text-subtle', events.length === 0 && 'text-center')}>
        Chỉ kiểm tra khi app đang mở và theo lệnh của bạn. Các chương mới chỉ được thông báo mà
        không tự tạo bản dịch.
      </p>

      {/* Hộp thoại xem trước khác biệt và áp dụng bản raw mới */}
      <Dialog
        open={diffDialog.open}
        onOpenChange={(open) => setDiffDialog((prev) => ({ ...prev, open }))}
        title="Xem trước sửa đổi Bản raw"
        description="So sánh bản raw hiện tại trong tác phẩm và bản mới lấy từ nguồn"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-xs">
            <Button
              variant="ghost"
              onClick={() => setDiffDialog((prev) => ({ ...prev, open: false }))}
            >
              Đóng
            </Button>
            <Button
              variant="solid"
              onClick={() => void handleApplyDiff()}
              disabled={diffDialog.loading || !diffDialog.previewData?.canApply}
            >
              Áp dụng vào Bản raw
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-md px-lg py-md">
          {diffDialog.loading ? (
            <p role="status" className="py-md text-center text-body-sm text-subtle">
              Đang tạo bản xem trước khác biệt…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-md">
              <div className="flex flex-col gap-xs rounded-sm border border-default bg-surface p-sm">
                <span className="text-label-xs font-semibold text-muted">Bản raw hiện tại:</span>
                <pre className="m-0 max-h-60 overflow-y-auto text-body-xs font-mono whitespace-pre-wrap text-subtle">
                  {diffDialog.previewData?.oldText}
                </pre>
              </div>
              <div className="flex flex-col gap-xs rounded-sm border border-default bg-surface p-sm">
                <span className="text-label-xs font-semibold text-success">
                  Bản raw mới từ nguồn:
                </span>
                <pre className="m-0 max-h-60 overflow-y-auto text-body-xs font-mono whitespace-pre-wrap text-default">
                  {diffDialog.previewData?.newText}
                </pre>
              </div>
            </div>
          )}
          <p className="m-0 text-body-xs text-muted">
            Áp dụng bản raw mới sẽ cập nhật revision của chapter mà không làm mất bản dịch tiếng
            Việt đã có.
          </p>
        </div>
      </Dialog>
    </PageFrame>
  )
}
