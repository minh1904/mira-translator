import type { JSX, ReactNode } from 'react'
import {
  CheckCircleIcon,
  DangerTriangleIcon,
  CloseCircleIcon,
  QuestionCircleIcon,
  FolderIcon,
  DocumentIcon,
  GlobalIcon
} from '@renderer/components/ui/reicon'

import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'
import type {
  SourceCapability,
  SourceDescriptor,
  SourceHealthState
} from '../../../../../shared/contracts/sources'

export interface SourceCardProps {
  source: SourceDescriptor
  onSelect?: (source: SourceDescriptor) => void
  onOpenSettings?: () => void
  className?: string
}

const COUNTRY_NAMES: Record<string, string> = {
  CN: 'Trung Quốc',
  JP: 'Nhật Bản',
  KR: 'Hàn Quốc',
  US: 'Hoa Kỳ',
  VN: 'Việt Nam',
  TW: 'Đài Loan'
}

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-Hans': 'Trung giản thể',
  'zh-Hant': 'Trung phồn thể',
  ja: 'Tiếng Nhật',
  ko: 'Tiếng Hàn',
  en: 'Tiếng Anh',
  vi: 'Tiếng Việt'
}

const HEALTH_LABELS: Record<
  SourceHealthState,
  { label: string; color: BadgeColor; icon: ReactNode }
> = {
  healthy: {
    label: 'Ổn định',
    color: 'success',
    icon: <CheckCircleIcon size={ICON.xs} />
  },
  degraded: {
    label: 'Suy giảm',
    color: 'warning',
    icon: <DangerTriangleIcon size={ICON.xs} />
  },
  broken: {
    label: 'Hỏng',
    color: 'error',
    icon: <CloseCircleIcon size={ICON.xs} />
  },
  inconclusive: {
    label: 'Chưa xác định',
    color: 'warning',
    icon: <QuestionCircleIcon size={ICON.xs} />
  },
  unchecked: {
    label: 'Chưa kiểm tra',
    color: 'neutral',
    icon: <QuestionCircleIcon size={ICON.xs} />
  }
}

const ACCESS_LABELS: Record<string, string> = {
  local: 'Thiết bị',
  public: 'Công khai',
  account: 'Cần tài khoản',
  subscription: 'Thuê bao'
}

export function SourceCard({
  source,
  onSelect,
  onOpenSettings,
  className
}: SourceCardProps): JSX.Element {
  const isCatalogOnly =
    source.capabilities.includes('catalog' as SourceCapability) &&
    !source.capabilities.includes('chapter' as SourceCapability)

  const healthInfo = HEALTH_LABELS[source.health?.state ?? 'unchecked'] ?? HEALTH_LABELS.unchecked
  const countryLabel = source.countryCode
    ? (COUNTRY_NAMES[source.countryCode] ?? source.countryCode)
    : 'Cục bộ'

  const isLocal = source.access === 'local'

  return (
    <div
      data-slot="source-card"
      className={cn(
        'flex flex-col justify-between gap-md rounded-sm border border-default bg-surface p-md transition-shadow hover:shadow-xs',
        className
      )}
    >
      <div className="flex flex-col gap-sm">
        {/* Hàng tiêu đề: biểu tượng, tên nguồn và tình trạng hoạt động */}
        <div className="flex items-start justify-between gap-xs">
          <div className="flex min-w-0 items-center gap-xs">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-subtle">
              {isLocal ? (
                source.sourceId.includes('folder') ? (
                  <FolderIcon size={ICON.sm} />
                ) : (
                  <DocumentIcon size={ICON.sm} />
                )
              ) : (
                <GlobalIcon size={ICON.sm} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 truncate text-label-md font-semibold text-default">
                {source.displayName}
              </h3>
              {source.nativeName && (
                <p className="m-0 truncate text-body-xs text-muted">{source.nativeName}</p>
              )}
            </div>
          </div>
          <Badge color={healthInfo.color} dot>
            {healthInfo.label}
          </Badge>
        </div>

        {/* Tên miền và quốc gia */}
        <div className="flex flex-wrap items-center gap-2xs text-body-xs text-subtle">
          <span className="font-medium text-default">{countryLabel}</span>
          {source.domains.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{source.domains.join(', ')}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{ACCESS_LABELS[source.access] ?? source.access}</span>
        </div>

        {/* Ngôn ngữ hỗ trợ */}
        <div className="flex flex-wrap gap-3xs">
          {source.languageTags.map((tag) => (
            <Badge key={tag} color="neutral" variant="outline">
              {LANGUAGE_NAMES[tag] ?? tag}
            </Badge>
          ))}
          {isCatalogOnly && (
            <Badge color="warning" variant="light">
              Chỉ mục lục
            </Badge>
          )}
        </div>
      </div>

      {/* Khu vực thao tác ở chân thẻ */}
      <div className="flex items-center justify-between gap-xs border-t border-subtle pt-xs">
        <span className="text-body-xs text-muted">
          {source.health?.checkedAt
            ? `Kiểm tra ${new Date(source.health.checkedAt).toLocaleDateString('vi-VN')}`
            : 'Chưa kiểm tra gần đây'}
        </span>
        <div className="flex items-center gap-2xs">
          {source.health?.state === 'broken' && (
            <Button variant="outline" onClick={onOpenSettings}>
              Xem tình trạng
            </Button>
          )}
          {source.access === 'account' && (
            <Button variant="outline" onClick={onOpenSettings}>
              Tài khoản
            </Button>
          )}
          {onSelect && (
            <Button variant="light" onClick={() => onSelect(source)}>
              Khám phá
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
