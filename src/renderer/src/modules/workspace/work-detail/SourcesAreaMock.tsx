import type { JSX } from 'react'
import { ImportIcon, StarIcon } from '@renderer/components/ui/reicon'

import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { LanguageMark } from '../../library/public'
import type { SourceLanguage } from '../../library/public'
import { SOON_LABEL } from '../../../lib/mockFeatures'

/** Dữ liệu mẫu cố định: hiển thị minh họa nội dung khu vực nguồn raw. */
interface SourceRow {
  language: SourceLanguage
  label: string
  matched: number
  total: number
  updated: string
  primary?: boolean
}

const SOURCES: SourceRow[] = [
  {
    language: 'zh-Hant',
    label: 'Bản gốc phồn thể',
    matched: 12,
    total: 12,
    updated: 'Cập nhật hôm qua',
    primary: true
  },
  {
    language: 'en',
    label: 'Bản dịch tiếng Anh (đối chiếu)',
    matched: 8,
    total: 12,
    updated: 'Cập nhật 3 ngày trước'
  },
  {
    language: 'ja',
    label: 'Bản dịch tiếng Nhật',
    matched: 0,
    total: 12,
    updated: 'Chưa nhập chương nào'
  }
]

/**
 * Minh họa khu vực nguồn raw: hiển thị danh sách các nguồn raw, nguồn chính, và số chương
 * tương ứng đã khớp. Không đọc hoặc ghi dữ liệu thực tế.
 */
export function SourcesAreaMock(): JSX.Element {
  return (
    <section
      aria-labelledby="sources-heading"
      className="@container flex flex-col gap-4 rounded-sm border border-default p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="sources-heading" className="flex items-center gap-2 text-body-md font-semibold">
            Nguồn raw
            <span className="rounded-sm bg-selected px-1.5 py-px text-body-xs font-normal text-subtle">
              {SOON_LABEL}
            </span>
          </h2>
          <p className="max-w-[60ch] text-body-xs leading-normal text-subtle">
            Quản lý các bản raw của tác phẩm và chọn nguồn chính để dịch; các bản còn lại dùng để
            đối chiếu.
          </p>
        </div>
        <Button variant="light" disabled>
          <ImportIcon size={14} />
          Nhập nguồn mới
        </Button>
      </div>

      <ul className="grid gap-3 @min-[640px]:grid-cols-2">
        {SOURCES.map((source) => (
          <li
            key={source.language}
            className={cn(
              'flex flex-col gap-2.5 rounded-sm border p-3.5',
              source.primary ? 'border-strong bg-muted/50' : 'border-default'
            )}
          >
            <div className="flex items-center gap-2.5">
              <LanguageMark language={source.language} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium">{source.label}</p>
                <p className="text-body-xs text-subtle">{source.updated}</p>
              </div>
              {source.primary && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-selected px-2 py-0.5 text-body-xs font-semibold whitespace-nowrap text-default">
                  <StarIcon size={12} />
                  Nguồn chính
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    source.matched === 0 ? 'bg-neutral/30' : 'bg-info'
                  )}
                  style={{
                    width: (source.total === 0 ? 0 : (source.matched / source.total) * 100) + '%'
                  }}
                />
              </div>
              <span className="shrink-0 text-body-xs whitespace-nowrap text-subtle">
                {source.matched}/{source.total} chương khớp
              </span>
            </div>
            {!source.primary && (
              <Button disabled className="self-start">
                Đặt làm nguồn chính
              </Button>
            )}
          </li>
        ))}
      </ul>

      <p className="text-body-xs text-subtle">
        Bản minh họa: khu vực này chưa hoạt động và không thay đổi tác phẩm của bạn.
      </p>
    </section>
  )
}
