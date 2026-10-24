import { useState, type JSX } from 'react'
import {
  FolderIcon,
  DocumentIcon,
  GlobeIcon,
  CheckCircleIcon,
  DangerTriangleIcon
} from '@renderer/components/ui/reicon'

import { Dialog } from '../../../components/ui/Dialog'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/Field'
import { Select } from '../../../components/ui/Select'
import { ICON } from '../../../components/ui/icon'
import type {
  SourceBinding,
  SourceBindingIdentifyResult,
  SourceBindingPreview
} from '../../../../../shared/contracts/sources'

export interface AddRawDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workId: string
  defaultLanguageTag?: string
  onBindingCreated: (binding: SourceBinding) => void
}

type SourceKind = 'file' | 'folder' | 'url'

const SOURCE_KINDS = [
  {
    kind: 'folder' as SourceKind,
    title: 'Theo dõi thư mục',
    description: 'Quét toàn bộ tệp chương .txt, .md trong thư mục theo thứ tự xác định',
    icon: <FolderIcon size={ICON.md} />
  },
  {
    kind: 'file' as SourceKind,
    title: 'Tệp văn bản đơn',
    description: 'Nhập nội dung từ một tệp văn bản .txt hoặc .md',
    icon: <DocumentIcon size={ICON.md} />
  },
  {
    kind: 'url' as SourceKind,
    title: 'URL nguồn mạng',
    description: 'Theo dõi tác phẩm từ website web novel được hỗ trợ qua URL',
    icon: <GlobeIcon size={ICON.md} />
  }
]

/** Sites the URL tab understands; shown under the URL field. */
export const SUPPORTED_SITES = [
  'kakuyomu.jp',
  'ncode.syosetu.com',
  'novel18.syosetu.com (R18)',
  'www.akatsuki-novels.com (R18)'
]

/** One-time 18+ confirmation shown before previewing an R18 source; stored as an app preference. */
export function AgeConfirmation({
  sourceName,
  onConfirm,
  disabled
}: {
  sourceName: string
  onConfirm: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-sm rounded-sm border border-warning bg-warning/10 p-md">
      <div className="flex items-center gap-xs text-warning">
        <DangerTriangleIcon size={ICON.sm} />
        <span className="text-label-sm font-medium">Nguồn R18: {sourceName}</span>
      </div>
      <p className="m-0 text-body-xs text-default">
        Nguồn này có tác phẩm dành cho người lớn. Mira chỉ truy cập sau khi bạn xác nhận đủ 18 tuổi;
        xác nhận được lưu trong ứng dụng và có thể thu hồi trong Cài đặt.
      </p>
      <div>
        <Button variant="solid" onClick={onConfirm} disabled={disabled}>
          Tôi đã đủ 18 tuổi
        </Button>
      </div>
    </div>
  )
}

const LANGUAGE_OPTIONS = [
  { value: 'ja', label: 'Tiếng Nhật (ja)' },
  { value: 'ko', label: 'Tiếng Hàn (ko)' },
  { value: 'zh-Hans', label: 'Trung giản thể (zh-Hans)' },
  { value: 'zh-Hant', label: 'Trung phồn thể (zh-Hant)' },
  { value: 'en', label: 'Tiếng Anh (en)' },
  { value: 'vi', label: 'Tiếng Việt (vi)' }
]

const ROLE_OPTIONS = [
  { value: 'primary', label: 'Bản chính (Mặc định dùng để dịch)' },
  { value: 'reference', label: 'Bản đối chiếu (Tham khảo song song)' }
]

export function AddRawDialog({
  open,
  onOpenChange,
  workId,
  defaultLanguageTag = 'ja',
  onBindingCreated
}: AddRawDialogProps): JSX.Element {
  const [kind, setKind] = useState<SourceKind>('folder')
  const [pathValue, setPathValue] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [label, setLabel] = useState('')
  const [languageTag, setLanguageTag] = useState(defaultLanguageTag)
  const [role, setRole] = useState<'primary' | 'reference'>('primary')

  // Trạng thái các bước
  const [step, setStep] = useState<'select' | 'preview' | 'config'>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ageGate, setAgeGate] = useState<SourceBindingIdentifyResult | null>(null)

  // Kết quả xem trước — dùng kiểu đầy đủ cho URL, kiểu đơn giản cho file/folder
  const [previewResult, setPreviewResult] = useState<{
    previewId: string
    totalCount: number
    matchedCount: number
    unmatchedCount: number
    errorCount: number
    // Thêm cho URL preview
    title?: string
    author?: string | null
    siteName?: string | null
    adult?: boolean
    warnings?: string[]
    sample?: Array<{ remoteChapterId: string; title: string; position: number }>
    canonicalUrl?: string | null
    inputRemoteChapterId?: string | null
    sourceId?: string
    remoteWorkId?: string
  } | null>(null)

  const reset = (): void => {
    setKind('folder')
    setPathValue('')
    setUrlValue('')
    setLabel('')
    setLanguageTag(defaultLanguageTag)
    setRole('primary')
    setStep('select')
    setLoading(false)
    setError(null)
    setPreviewResult(null)
    setAgeGate(null)
  }

  const handleClose = (): void => {
    reset()
    onOpenChange(false)
  }

  const sourceId = kind === 'folder' ? 'mira.folder' : 'mira.single-file'
  const remoteWorkId = kind === 'folder' ? `folder:${pathValue.trim()}` : `file:${pathValue.trim()}`

  // Bước 1 -> Bước 2 (Xem trước) — cho file/folder
  const handlePreviewFilePath = async (): Promise<void> => {
    if (!pathValue.trim()) {
      setError('Vui lòng nhập đường dẫn tệp hoặc thư mục')
      return
    }
    setError(null)
    setLoading(true)

    try {
      if (typeof window !== 'undefined' && window.mira?.sources?.bindings) {
        const res = await window.mira.sources.bindings.previewCreate({
          workId,
          sourceId,
          remoteWorkId
        })
        if (res.ok) {
          const val = res.value as any
          setPreviewResult({
            previewId: val.previewId ?? 'preview-1',
            totalCount: val.totalCount ?? 0,
            matchedCount: val.matchedCount ?? 0,
            unmatchedCount: val.unmatchedCount ?? 0,
            errorCount: val.errorCount ?? 0
          })
          if (!label) {
            const defaultLabel = kind === 'folder' ? 'Bản Raw Thư mục' : 'Bản Raw Tệp'
            setLabel(defaultLabel)
          }
          setStep('preview')
        } else {
          setError(res.error.message || 'Không thể đọc bản raw từ đường dẫn này')
        }
      } else {
        // Dữ liệu dự phòng cho môi trường kiểm thử
        setPreviewResult({
          previewId: 'mock-preview-id',
          totalCount: 10,
          matchedCount: 10,
          unmatchedCount: 0,
          errorCount: 0
        })
        if (!label) {
          setLabel(kind === 'folder' ? 'Bản Raw Thư mục' : 'Bản Raw Tệp')
        }
        setStep('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra đường dẫn')
    } finally {
      setLoading(false)
    }
  }

  // Bước 1 -> Bước 2 (Xem trước) — cho URL
  const handlePreviewUrl = async (): Promise<void> => {
    const candidate = urlValue.trim()
    if (!candidate) {
      setError('Vui lòng nhập URL tác phẩm')
      return
    }
    setError(null)
    setLoading(true)

    try {
      if (typeof window !== 'undefined' && window.mira?.sources?.bindings) {
        // Bước 1: identify URL
        const identifyRes = await window.mira.sources.bindings.identify({ workId, candidate })
        if (!identifyRes.ok) {
          setError(identifyRes.error.message || 'Không thể nhận diện URL này')
          return
        }
        if (!identifyRes.value) {
          setError('URL này không được hỗ trợ hoặc nguồn tương ứng chưa khả dụng')
          return
        }
        const identified = identifyRes.value

        // Kiểm tra gate: nếu health không phải unchecked/healthy thì báo lỗi
        const health = identified.source.health.state
        if (health === 'broken') {
          setError('Nguồn này hiện không hoạt động. Vui lòng thử lại sau.')
          return
        }

        if (identified.source.adult) {
          const age = await window.mira.sources.age.get()
          if (!age.ok || !age.value.confirmed) {
            setAgeGate(identified)
            return
          }
        }
        await previewIdentified(identified)
      } else {
        // Mock cho môi trường kiểm thử
        setPreviewResult({
          previewId: 'mock-url-preview',
          totalCount: 5,
          matchedCount: 5,
          unmatchedCount: 0,
          errorCount: 0,
          title: 'テスト作品',
          author: 'テスト著者',
          warnings: [],
          sample: [
            { remoteChapterId: '111000001', title: '第一話', position: 0 },
            { remoteChapterId: '111000002', title: '第二話', position: 1 }
          ],
          canonicalUrl: candidate,
          sourceId: 'mira.jp.kakuyomu',
          remoteWorkId: '1234567890'
        })
        if (!label) setLabel('テスト作品')
        setStep('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xem trước URL')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmAge = async (): Promise<void> => {
    if (!ageGate) return
    setError(null)
    setLoading(true)
    try {
      const res = await window.mira.sources.age.set({ confirmed: true })
      if (!res.ok) {
        setError(res.error.message || 'Không lưu được xác nhận tuổi')
        return
      }
      const identified = ageGate
      setAgeGate(null)
      await previewIdentified(identified)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xem trước URL')
    } finally {
      setLoading(false)
    }
  }

  // Bước 2: preview-create cho nguồn đã nhận diện
  const previewIdentified = async (identified: SourceBindingIdentifyResult): Promise<void> => {
    const previewRes = await window.mira.sources.bindings.previewCreate({
      workId,
      sourceId: identified.source.sourceId,
      remoteWorkId: identified.remoteWorkId,
      canonicalUrl: identified.canonicalUrl,
      inputRemoteChapterId: identified.inputRemoteChapterId ?? null
    })

    if (!previewRes.ok) {
      // Giữ input khi retry
      setError(previewRes.error.message || 'Không thể xem trước tác phẩm này. Vui lòng thử lại.')
      return
    }

    const p = previewRes.value as SourceBindingPreview
    setPreviewResult({
      previewId: p.previewId,
      totalCount: p.totalCount,
      matchedCount: p.matchedCount,
      unmatchedCount: p.unmatchedCount,
      errorCount: p.errorCount,
      title: p.title,
      author: p.author,
      siteName: p.siteName ?? null,
      adult: identified.source.adult,
      warnings: p.warnings,
      sample: p.sample,
      canonicalUrl: p.canonicalUrl,
      inputRemoteChapterId: p.inputRemoteChapterId,
      sourceId: p.sourceId,
      remoteWorkId: p.remoteWorkId
    })
    if (!label && p.title) setLabel(p.title)
    // URL source ngôn ngữ thường là ja
    if (p.languageTag) setLanguageTag(p.languageTag)
    setStep('preview')
  }

  const handlePreview = kind === 'url' ? handlePreviewUrl : handlePreviewFilePath

  // Bước 2 -> Bước 3 (Cấu hình)
  const handleProceedToConfig = (): void => {
    setStep('config')
  }

  // Xác nhận và tạo bản raw
  const handleConfirm = async (): Promise<void> => {
    setError(null)
    setLoading(true)

    try {
      const effectiveSourceId = kind === 'url' ? (previewResult?.sourceId ?? '') : sourceId
      const effectiveRemoteWorkId =
        kind === 'url' ? (previewResult?.remoteWorkId ?? '') : remoteWorkId
      const defaultLabel =
        kind === 'folder'
          ? 'Bản Raw Thư mục'
          : kind === 'file'
            ? 'Bản Raw Tệp'
            : (previewResult?.title ?? 'Bản Raw URL')

      if (typeof window !== 'undefined' && window.mira?.sources?.bindings) {
        const res = await window.mira.sources.bindings.create({
          workId,
          sourceId: effectiveSourceId,
          remoteWorkId: effectiveRemoteWorkId,
          languageTag,
          label: label.trim() || defaultLabel,
          role,
          expectedPreviewId: previewResult?.previewId ?? 'preview-1'
        })
        if (res.ok) {
          onBindingCreated(res.value)
          handleClose()
        } else {
          setError(res.error.message || 'Không thể tạo bản raw')
        }
      } else {
        // Tạo thành công trong môi trường kiểm thử
        onBindingCreated({
          id: 'mock-binding-' + Date.now(),
          workId,
          sourceId: effectiveSourceId,
          adapterVersion: '1.0.0',
          remoteWorkId: effectiveRemoteWorkId,
          canonicalUrl: previewResult?.canonicalUrl ?? null,
          countryCode: null,
          languageTag,
          label: label.trim() || defaultLabel,
          role,
          authProfileId: null,
          enabled: true,
          checkpoint: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
        handleClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo bản raw')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => !val && handleClose()}
      title="Thêm Bản raw"
      description="Gắn nguồn nội dung vào tác phẩm để theo dõi chương và dịch thuật"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-xs">
          <Button variant="ghost" onClick={handleClose}>
            Hủy
          </Button>
          {step === 'select' && (
            <Button variant="solid" onClick={() => void handlePreview()} disabled={loading}>
              {loading ? 'Đang đọc…' : 'Tiếp tục'}
            </Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                Quay lại
              </Button>
              <Button variant="solid" onClick={handleProceedToConfig}>
                Cấu hình vai trò
              </Button>
            </>
          )}
          {step === 'config' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Quay lại
              </Button>
              <Button variant="solid" onClick={() => void handleConfirm()} disabled={loading}>
                {loading ? 'Đang thêm…' : 'Xác nhận tạo'}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-lg px-lg py-md">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-xs rounded-xs border border-error bg-error/10 p-sm text-body-xs text-error"
          >
            <DangerTriangleIcon size={ICON.sm} />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: SELECT KIND & PATH/URL */}
        {step === 'select' && (
          <div className="flex flex-col gap-md">
            <div className="flex flex-col gap-xs">
              <span className="text-label-sm font-medium text-default">Phương thức nhập</span>
              <div className="grid grid-cols-3 gap-sm">
                {SOURCE_KINDS.map((opt) => (
                  <div
                    key={opt.kind}
                    onClick={() => setKind(opt.kind)}
                    className={`flex cursor-pointer flex-col gap-2xs rounded-sm border p-md transition-colors ${
                      kind === opt.kind
                        ? 'border-selected bg-selected/10'
                        : 'border-default bg-surface hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-xs">
                      <span className="text-subtle">{opt.icon}</span>
                      <span className="text-label-md font-semibold text-default">{opt.title}</span>
                    </div>
                    <p className="m-0 text-body-xs text-subtle">{opt.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {kind === 'url' ? (
              <div className="flex flex-col gap-xs">
                <TextField
                  label="URL tác phẩm"
                  value={urlValue}
                  onChange={(e) => {
                    setUrlValue(e.target.value)
                    setError(null)
                    setAgeGate(null)
                  }}
                  placeholder="https://ncode.syosetu.com/n1234ab/"
                />
                <span className="text-body-xs text-muted">
                  Paste URL trang tác phẩm hoặc tập chương. Mira sẽ nhận diện nguồn và xem trước
                  danh mục trước khi xác nhận. Hỗ trợ: {SUPPORTED_SITES.join(', ')}.
                </span>
                {ageGate && (
                  <AgeConfirmation
                    sourceName={ageGate.source.displayName}
                    onConfirm={() => void handleConfirmAge()}
                    disabled={loading}
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-xs">
                <TextField
                  label={
                    kind === 'folder' ? 'Đường dẫn thư mục chương' : 'Đường dẫn tệp .txt hoặc .md'
                  }
                  value={pathValue}
                  onChange={(e) => setPathValue(e.target.value)}
                  placeholder={
                    kind === 'folder' ? 'D:\\Novels\\MyNovel\\raw' : 'D:\\Novels\\raw.txt'
                  }
                />
                <span className="text-body-xs text-muted">
                  Mira sẽ đọc theo yêu cầu và không chỉnh sửa tệp gốc trên máy tính của bạn.
                </span>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: PREVIEW MATCHING */}
        {step === 'preview' && previewResult && (
          <div className="flex flex-col gap-md">
            <div className="flex items-center gap-xs text-success">
              <CheckCircleIcon size={ICON.md} />
              <span className="text-label-md font-medium text-default">
                {kind === 'url'
                  ? 'Đã xem trước tác phẩm thành công'
                  : 'Đã quét thông tin nguồn thành công'}
              </span>
            </div>

            {/* Tiêu đề/tác giả cho URL preview */}
            {kind === 'url' && previewResult.title && (
              <div className="rounded-sm border border-default bg-muted p-md">
                <div className="flex items-center gap-xs text-label-md font-semibold text-default">
                  <span>{previewResult.title}</span>
                  {previewResult.adult && (
                    <span className="rounded-xs bg-error/15 px-1 py-0.5 text-body-2xs text-error">
                      R18
                    </span>
                  )}
                  {previewResult.siteName && (
                    <span className="text-body-xs font-normal text-muted">
                      {previewResult.siteName}
                    </span>
                  )}
                </div>
                {previewResult.author && (
                  <div className="mt-2xs text-body-xs text-muted">{previewResult.author}</div>
                )}
                {previewResult.canonicalUrl && (
                  <div className="mt-2xs truncate text-body-xs text-subtle">
                    {previewResult.canonicalUrl}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-sm rounded-sm border border-default bg-muted p-md">
              <div className="flex flex-col gap-3xs">
                <span className="text-body-xs text-muted">Tổng số mục / chương:</span>
                <span className="text-heading font-semibold text-default">
                  {previewResult.totalCount}
                </span>
              </div>
              <div className="flex flex-col gap-3xs">
                <span className="text-body-xs text-muted">
                  {kind === 'url' ? 'Có thể theo dõi:' : 'Chương ghép được:'}
                </span>
                <span className="text-heading font-semibold text-success">
                  {previewResult.matchedCount}
                </span>
              </div>
              {previewResult.unmatchedCount > 0 && (
                <div className="flex flex-col gap-3xs">
                  <span className="text-body-xs text-muted">Chưa ghép:</span>
                  <span className="text-body-md font-medium text-default">
                    {previewResult.unmatchedCount}
                  </span>
                </div>
              )}
              {previewResult.errorCount > 0 && (
                <div className="flex flex-col gap-3xs">
                  <span className="text-body-xs text-muted">Không đọc được:</span>
                  <span className="text-body-md font-medium text-muted">
                    {previewResult.errorCount}
                  </span>
                </div>
              )}
            </div>

            {/* Cảnh báo */}
            {previewResult.warnings && previewResult.warnings.length > 0 && (
              <div className="flex flex-col gap-xs rounded-sm border border-warning bg-warning/10 p-sm">
                <div className="flex items-center gap-xs text-warning">
                  <DangerTriangleIcon size={ICON.sm} />
                  <span className="text-label-xs font-medium">Cảnh báo</span>
                </div>
                {previewResult.warnings.map((w, i) => (
                  <span key={i} className="text-body-xs text-warning">
                    {w}
                  </span>
                ))}
              </div>
            )}

            {/* Sample catalog cho URL */}
            {kind === 'url' && previewResult.sample && previewResult.sample.length > 0 && (
              <div className="flex flex-col gap-xs">
                <span className="text-label-xs font-medium text-muted">
                  Một số chương đầu tiên:
                </span>
                <div className="flex flex-col gap-2xs rounded-sm border border-default bg-surface p-sm">
                  {previewResult.sample.slice(0, 5).map((item) => (
                    <div key={item.remoteChapterId} className="flex items-center gap-xs">
                      <span className="min-w-[2rem] text-body-xs text-muted tabular-nums">
                        {item.position + 1}.
                      </span>
                      <span className="text-body-xs text-default">{item.title}</span>
                      {previewResult.inputRemoteChapterId === item.remoteChapterId && (
                        <span className="rounded-xs bg-selected/20 px-1 py-0.5 text-body-2xs text-selected">
                          được chọn
                        </span>
                      )}
                    </div>
                  ))}
                  {previewResult.sample.length > 5 && (
                    <span className="text-body-xs text-muted">
                      +{previewResult.sample.length - 5} chương khác…
                    </span>
                  )}
                </div>
              </div>
            )}

            <p className="m-0 text-body-xs text-subtle">
              Việc xem trước không thay đổi cơ sở dữ liệu tác phẩm. Xác nhận ở bước tiếp theo để tạo
              Bản raw chính thức.
            </p>
          </div>
        )}

        {/* STEP 3: CONFIGURE LABEL, LANGUAGE, ROLE */}
        {step === 'config' && (
          <div className="flex flex-col gap-md">
            <TextField
              label="Tên / Nhãn Bản raw"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ví dụ: Bản Raw Thư mục, Bản Qidian..."
            />

            <Select
              label="Ngôn ngữ bản raw"
              value={languageTag}
              options={LANGUAGE_OPTIONS}
              onChange={(val) => setLanguageTag(val)}
            />

            <Select
              label="Vai trò bản raw"
              value={role}
              options={ROLE_OPTIONS}
              onChange={(val) => setRole(val as any)}
            />

            <div className="rounded-xs border border-default bg-muted p-sm text-body-xs text-subtle">
              {role === 'primary' ? (
                <span>
                  <strong>Bản chính:</strong> Các chương trong tác phẩm sẽ mặc định lấy nội dung từ
                  bản này để dịch.
                </span>
              ) : (
                <span>
                  <strong>Bản đối chiếu:</strong> Dùng để tham khảo câu chữ đối chiếu song song khi
                  dịch, không ghi đè bản dịch.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
