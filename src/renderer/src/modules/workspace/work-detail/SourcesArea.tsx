import { useEffect, useState, type JSX } from 'react'
import {
  ImportIcon,
  StarIcon,
  RefreshIcon,
  TrashBinTrashIcon
} from '@renderer/components/ui/reicon'

import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { ConfirmDialog, type ConfirmRequest } from '../../../components/ui/ConfirmDialog'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { Input } from '../../../components/ui/Input'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'
import { LanguageMark, useLibraryStore } from '../../library/public'
import type { SourceLanguage } from '../../library/public'
import type { WorkSummary } from '../../../../../shared/contracts/library'
import { useChapterStore } from '../store/chapterStore'
import type {
  SourceBinding,
  SourceCatalogItem,
  SourceCatalogPage
} from '../../../../../shared/contracts/sources'
import { AddRawDialog } from './AddRawDialog'

export interface SourcesAreaProps {
  workId: string
  initialBindings?: SourceBinding[]
  onWork?: (summary: WorkSummary) => void
}

const ADAPTER_NAMES: Record<string, string> = {
  'mira.folder': 'Thư mục tệp',
  'builtin.folder': 'Thư mục tệp',
  'mira.single-file': 'Tệp văn bản',
  'builtin.single-file': 'Tệp văn bản',
  'mira.jp.kakuyomu': 'カクヨム (Kakuyomu)'
}

export function SourcesArea({ workId, initialBindings, onWork }: SourcesAreaProps): JSX.Element {
  const [bindings, setBindings] = useState<SourceBinding[]>(initialBindings ?? [])
  const [loading, setLoading] = useState(!initialBindings)
  const [addRawOpen, setAddRawOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [catalogBindingId, setCatalogBindingId] = useState<string | null>(null)
  const [catalogItems, setCatalogItems] = useState<SourceCatalogItem[]>([])
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null)
  const [catalogExhausted, setCatalogExhausted] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [rangeInput, setRangeInput] = useState('')
  const [downloadingRange, setDownloadingRange] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{
    current: number
    total: number
    itemTitle: string
  } | null>(null)

  // Trạng thái đồng bộ
  const [activeSync, setActiveSync] = useState<{
    bindingId: string
    runId: string
    phase: string
    processed: number
    total: number
  } | null>(null)

  const reloadBindings = async (): Promise<void> => {
    if (initialBindings) return
    setLoading(true)
    try {
      if (typeof window !== 'undefined' && window.mira?.sources?.bindings) {
        const res = await window.mira.sources.bindings.list({ workId })
        if (res.ok) {
          setBindings(res.value)
        }
      }
    } catch {
      // Bỏ qua lỗi khi tải lại
    } finally {
      setLoading(false)
    }
  }

  const loadCatalog = async (bindingId: string, cursor?: string): Promise<void> => {
    if (!window.mira?.sources?.catalog) return
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const result = await window.mira.sources.catalog.list({
        workId,
        bindingId,
        cursor,
        limit: 50
      })
      if (!result.ok) {
        setCatalogError(result.error.message)
        return
      }
      const page: SourceCatalogPage = result.value
      setCatalogItems((current) => (cursor ? [...current, ...page.items] : page.items))
      setCatalogCursor(page.nextCursor)
      setCatalogExhausted(page.exhausted)
    } catch {
      setCatalogError('Không tải được danh mục chương.')
    } finally {
      setCatalogLoading(false)
    }
  }

  const notifyChaptersChanged = async (): Promise<void> => {
    void useChapterStore.getState().reload()
    void useLibraryStore.getState().reload()
    if (onWork && window.mira?.works?.get) {
      try {
        const workRes = await window.mira.works.get(workId)
        if (workRes?.ok) {
          onWork(workRes.value)
        }
      } catch {
        // Bỏ qua lỗi cập nhật thông tin tác phẩm
      }
    }
  }

  const handleDownloadChapter = async (item: SourceCatalogItem): Promise<void> => {
    if (!window.mira?.sources?.catalog) return
    setDownloadingId(item.id)
    setCatalogError(null)
    try {
      const result = await window.mira.sources.catalog.download({ workId, itemId: item.id })
      if (!result.ok) {
        setCatalogError(result.error.message)
        return
      }
      setCatalogItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, chapterId: result.value.chapterId } : candidate
        )
      )
      void notifyChaptersChanged()
    } catch {
      setCatalogError('Không tải được chương.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadRange = async (bindingId: string): Promise<void> => {
    if (!window.mira?.sources?.catalog || !rangeInput.trim()) return
    setDownloadingRange(true)
    setCatalogError(null)
    try {
      const res = await window.mira.sources.catalog.downloadRange({
        workId,
        bindingId,
        range: rangeInput.trim()
      })
      if (!res.ok) {
        setCatalogError(res.error.message)
      } else {
        setRangeInput('')
        void notifyChaptersChanged()
      }
    } catch {
      setCatalogError('Không thể thực hiện tải dải chương.')
    } finally {
      setDownloadingRange(false)
    }
  }

  useEffect(() => {
    if (!initialBindings) {
      void reloadBindings()
    }
  }, [workId, initialBindings])

  // Lắng nghe tiến trình tải chương nền
  // biome-ignore lint/correctness/useExhaustiveDependencies: Lắng nghe sự kiện tải chương nền
  useEffect(() => {
    if (typeof window !== 'undefined' && window.mira?.sources?.catalog?.onDownloadProgress) {
      const unsubscribe = window.mira.sources.catalog.onDownloadProgress((progress) => {
        setDownloadProgress(progress)
        if (progress.current >= progress.total && progress.total > 0) {
          void notifyChaptersChanged()
          setTimeout(() => {
            setDownloadProgress(null)
            if (catalogBindingId) {
              void loadCatalog(catalogBindingId)
            }
          }, 1500)
        }
      })
      return () => unsubscribe()
    }
    return undefined
  }, [catalogBindingId, workId, onWork])

  // Lắng nghe tiến trình đồng bộ
  useEffect(() => {
    if (typeof window !== 'undefined' && window.mira?.sources?.sync?.onProgress) {
      const unsubscribe = window.mira.sources.sync.onProgress((progress) => {
        if (progress.bindingId) {
          setActiveSync({
            bindingId: progress.bindingId,
            runId: progress.runId,
            phase: progress.phase,
            processed: progress.processedCount,
            total: progress.totalCount ?? 0
          })
          if (progress.phase === 'done') {
            setTimeout(() => {
              setActiveSync(null)
              void reloadBindings()
            }, 1000)
          }
        }
      })
      return () => unsubscribe()
    }
    return undefined
  }, [workId])

  // Đặt làm nguồn chính
  const handleSetPrimary = async (bindingId: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.mira?.sources?.bindings) {
      const res = await window.mira.sources.bindings.update({
        workId,
        bindingId,
        patch: { role: 'primary' }
      })
      if (res.ok) {
        setBindings((prev) =>
          prev.map((b) => ({
            ...b,
            role: b.id === bindingId ? 'primary' : 'reference'
          }))
        )
      }
    } else {
      setBindings((prev) =>
        prev.map((b) => ({
          ...b,
          role: b.id === bindingId ? 'primary' : 'reference'
        }))
      )
    }
  }

  // Kích hoạt đồng bộ thủ công
  const handleStartSync = async (bindingId: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.mira?.sources?.sync) {
      setActiveSync({
        bindingId,
        runId: 'running',
        phase: 'catalog',
        processed: 0,
        total: 100
      })
      try {
        const res = await window.mira.sources.sync.start({ workId, bindingId })
        if (res.ok) {
          void reloadBindings()
        }
      } finally {
        setTimeout(() => setActiveSync(null), 800)
      }
    }
  }

  // Hủy tiến trình đồng bộ đang chạy
  const handleCancelSync = async (runId: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.mira?.sources?.sync) {
      await window.mira.sources.sync.cancel({ runId })
      setActiveSync(null)
    }
  }

  // Gỡ liên kết nguồn raw
  const handleUnlink = (binding: SourceBinding): void => {
    setConfirmRequest({
      title: `Gỡ Bản raw "${binding.label}"?`,
      description:
        'Thao tác này sẽ tách nguồn raw khỏi tác phẩm. Các chương, bản dịch và nội dung đã có trong tác phẩm sẽ được giữ nguyên 100%.',
      confirmLabel: 'Gỡ Bản raw',
      onConfirm: async () => {
        if (typeof window !== 'undefined' && window.mira?.sources?.bindings) {
          const res = await window.mira.sources.bindings.delete({
            workId,
            bindingId: binding.id,
            confirmed: true
          })
          if (res.ok) {
            setBindings((prev) => prev.filter((b) => b.id !== binding.id))
          }
        } else {
          setBindings((prev) => prev.filter((b) => b.id !== binding.id))
        }
      }
    })
  }

  return (
    <section
      aria-labelledby="sources-heading"
      className="flex flex-col gap-lg rounded-sm border border-default p-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex flex-col gap-2xs">
          <h2 id="sources-heading" className="m-0 text-heading">
            Bản raw
          </h2>
          <p className="m-0 max-w-(--container-md) text-body-sm text-subtle">
            Quản lý các bản raw của tác phẩm và chọn bản chính để dịch; các bản còn lại dùng để đối
            chiếu song song.
          </p>
        </div>
        <div className="flex items-center gap-xs">
          {bindings.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                const primary = bindings.find((b) => b.role === 'primary') ?? bindings[0]
                if (primary) void handleStartSync(primary.id)
              }}
              leftIcon={<RefreshIcon size={ICON.sm} />}
            >
              Kiểm tra cập nhật
            </Button>
          )}
          <Button
            variant="solid"
            onClick={() => setAddRawOpen(true)}
            leftIcon={<ImportIcon size={ICON.sm} />}
          >
            Thêm Bản raw
          </Button>
        </div>
      </div>

      {/* Sync active notice */}
      {activeSync && (
        <div className="flex flex-col gap-xs rounded-sm border border-info bg-info/10 p-md">
          <div className="flex items-center justify-between text-body-sm">
            <span className="font-medium text-default">
              Đang kiểm tra cập nhật nguồn: {activeSync.phase}...
            </span>
            <Button variant="ghost" onClick={() => void handleCancelSync(activeSync.runId)}>
              Hủy
            </Button>
          </div>
          <ProgressBar
            label="Tiến độ kiểm tra"
            value={activeSync.total > 0 ? (activeSync.processed / activeSync.total) * 100 : 50}
          />
        </div>
      )}

      {/* List of raw bindings */}
      {loading ? (
        <p role="status" className="py-xl text-center text-body-sm text-subtle">
          Đang tải danh sách Bản raw…
        </p>
      ) : bindings.length === 0 ? (
        <EmptyState
          icon={<ImportIcon size={ICON.md} />}
          title="Chưa có Bản raw nào"
          actions={
            <Button variant="light" onClick={() => setAddRawOpen(true)}>
              Thêm Bản raw ngay
            </Button>
          }
        >
          Gắn thư mục chương hoặc tệp văn bản để theo dõi tiến độ và đối chiếu nội dung khi dịch.
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-md p-0 @min-[640px]:grid-cols-2">
          {bindings.map((binding) => {
            const isPrimary = binding.role === 'primary'
            const adapterTitle = ADAPTER_NAMES[binding.sourceId] ?? binding.sourceId
            const totalCount = binding.checkpoint ? 1 : 0
            const lastSync = binding.updatedAt
              ? new Date(binding.updatedAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : 'Chưa kiểm tra'

            return (
              <li
                key={binding.id}
                data-slot="raw-binding-card"
                className={cn(
                  'flex min-w-0 flex-col justify-between gap-md rounded-sm border p-md transition-colors',
                  isPrimary ? 'border-strong bg-muted/30' : 'border-default bg-surface'
                )}
              >
                <div className="flex flex-col gap-sm">
                  {/* Title & language */}
                  <div className="flex items-start justify-between gap-xs">
                    <div className="flex min-w-0 flex-1 items-center gap-xs">
                      <LanguageMark language={binding.languageTag as SourceLanguage} />
                      <div className="min-w-0 flex-1">
                        <h3
                          title={binding.label}
                          className="m-0 truncate text-label-md font-semibold text-default"
                        >
                          {binding.label}
                        </h3>
                        <p className="m-0 text-body-xs text-subtle">
                          {adapterTitle} · {lastSync}
                        </p>
                      </div>
                    </div>
                    {isPrimary ? (
                      <Badge color="accent" dot className="shrink-0">
                        <span className="inline-flex items-center gap-3xs">
                          <StarIcon size={12} />
                          Bản chính
                        </span>
                      </Badge>
                    ) : (
                      <Badge color="neutral" className="shrink-0">
                        Đối chiếu
                      </Badge>
                    )}
                  </div>

                  {/* Matching progress bar */}
                  <div className="flex flex-col gap-2xs">
                    <div className="flex items-center justify-between text-body-xs text-subtle">
                      <span>Độ phủ nội dung</span>
                      <span>{totalCount > 0 ? 'Có dữ liệu' : 'Chưa có dữ liệu'}</span>
                    </div>
                    <ProgressBar label="Độ phủ nội dung" value={totalCount > 0 ? 100 : 0} />
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center justify-between gap-xs border-t border-subtle pt-xs">
                  <div className="flex items-center gap-2xs">
                    {!isPrimary && (
                      <Button variant="outline" onClick={() => void handleSetPrimary(binding.id)}>
                        Đặt làm bản chính
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => void handleStartSync(binding.id)}
                      leftIcon={<RefreshIcon size={ICON.xs} />}
                    >
                      Kiểm tra
                    </Button>
                    {binding.sourceId === 'mira.jp.kakuyomu' && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (catalogBindingId === binding.id) {
                            setCatalogBindingId(null)
                          } else {
                            setCatalogBindingId(binding.id)
                            setCatalogItems([])
                            setCatalogCursor(null)
                            setCatalogExhausted(false)
                            void loadCatalog(binding.id)
                          }
                        }}
                      >
                        {catalogBindingId === binding.id ? 'Ẩn chương' : 'Danh mục chương'}
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => handleUnlink(binding)}
                    aria-label={`Gỡ ${binding.label}`}
                    leftIcon={<TrashBinTrashIcon size={ICON.xs} />}
                  >
                    Gỡ
                  </Button>
                </div>
                {catalogBindingId === binding.id && (
                  <div className="flex flex-col gap-xs border-t border-subtle pt-sm">
                    {/* Bulk range download toolbar */}
                    <div className="flex flex-col gap-xs rounded-sm border border-subtle bg-muted/20 p-xs">
                      <div className="flex items-center gap-xs">
                        <Input
                          placeholder="Dải chương (ví dụ: 1, 5, 10-25)"
                          value={rangeInput}
                          onChange={(e) => setRangeInput(e.target.value)}
                          disabled={downloadingRange}
                        />
                        <Button
                          variant="outline"
                          disabled={downloadingRange || !rangeInput.trim()}
                          onClick={() => void handleDownloadRange(binding.id)}
                        >
                          {downloadingRange ? 'Đang gửi…' : 'Tải dải chương'}
                        </Button>
                      </div>
                      {downloadProgress && (
                        <div className="flex flex-col gap-2xs pt-2xs">
                          <div className="flex items-center justify-between text-body-xs text-subtle">
                            <span className="truncate">Đang tải: {downloadProgress.itemTitle}</span>
                            <span>
                              {downloadProgress.current} / {downloadProgress.total}
                            </span>
                          </div>
                          <ProgressBar
                            label="Tiến độ tải chương"
                            value={
                              downloadProgress.total > 0
                                ? (downloadProgress.current / downloadProgress.total) * 100
                                : 0
                            }
                          />
                        </div>
                      )}
                    </div>

                    {catalogItems.length === 0 && catalogLoading ? (
                      <p role="status" className="m-0 text-body-sm text-subtle">
                        Đang tải danh mục…
                      </p>
                    ) : catalogItems.length === 0 ? (
                      <p className="m-0 text-body-sm text-subtle">
                        Chưa có danh mục. Nhấn “Kiểm tra” để đồng bộ danh sách chương trước.
                      </p>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-2xs p-0">
                        {catalogItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-sm py-2xs"
                          >
                            <span className="min-w-0 truncate text-body-sm text-default">
                              {item.position}. {item.title}
                            </span>
                            {item.chapterId ? (
                              <Badge color="accent">Đã tải</Badge>
                            ) : item.access === 'public' ? (
                              <Button
                                variant="outline"
                                disabled={downloadingId === item.id || catalogLoading}
                                onClick={() => void handleDownloadChapter(item)}
                              >
                                {downloadingId === item.id ? 'Đang tải…' : 'Tải chương'}
                              </Button>
                            ) : (
                              <Badge color="neutral">Chưa truy cập được</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {catalogError && (
                      <p role="alert" className="m-0 text-body-sm text-danger">
                        {catalogError}
                      </p>
                    )}
                    {!catalogExhausted && catalogItems.length > 0 && (
                      <Button
                        variant="ghost"
                        disabled={catalogLoading || !catalogCursor}
                        onClick={() => catalogCursor && void loadCatalog(binding.id, catalogCursor)}
                      >
                        {catalogLoading ? 'Đang tải…' : 'Tải thêm danh mục'}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="m-0 text-body-xs text-subtle">
        Chỉ kiểm tra khi ứng dụng đang mở và người dùng yêu cầu. Không tự động chạy nền khi tắt app.
      </p>

      {/* Add Raw Wizard Dialog */}
      <AddRawDialog
        open={addRawOpen}
        onOpenChange={setAddRawOpen}
        workId={workId}
        onBindingCreated={(newBinding) => {
          setBindings((prev) => [...prev, newBinding])
        }}
      />

      {/* Unlink Confirmation */}
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </section>
  )
}
