import { useMemo, useState, type JSX } from 'react'
import { AddIcon, LibraryIcon } from '@renderer/components/ui/reicon'

import { PageFrame } from '../../../components/ui/PageFrame'
import { Alert } from '../../../components/ui/Alert'
import { Badge, type BadgeColor } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ButtonGroup } from '../../../components/ui/ButtonGroup'
import { CardButton } from '../../../components/ui/CardButton'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ICON } from '../../../components/ui/icon'
import { SearchInput } from '../../../components/ui/Input'
import { formatUpdated } from './format'
import { WorkCover } from './WorkCover'
import { byUpdated, statusLabels, type Work, type WorkStatus } from './works'

type Filter = 'all' | WorkStatus | 'archived'

const STATUS_COLORS: Record<WorkStatus, BadgeColor> = {
  'not-started': 'neutral',
  'in-progress': 'info',
  paused: 'warning'
}

function matches(work: Work, filter: Filter, query: string): boolean {
  if (filter === 'archived' ? !work.archived : work.archived) return false
  if (filter !== 'all' && filter !== 'archived' && work.status !== filter) return false
  if (!query) return true
  const text = (work.title + ' ' + (work.originalTitle ?? '')).toLocaleLowerCase('vi')
  return text.includes(query.toLocaleLowerCase('vi'))
}

/**
 * Hiển thị tác phẩm dưới dạng thẻ, sắp xếp theo thời gian mới nhất, kèm bộ lọc trạng thái và tìm kiếm theo tên.
 * Tác phẩm lưu trữ chỉ hiển thị trong bộ lọc Lưu trữ riêng biệt.
 */
export function LibraryScreen({
  works,
  problems,
  onOpenWork,
  onCreateWork
}: {
  works: Work[]
  /** Số lượng tệp tác phẩm gặp lỗi không mở được. */
  problems: number
  onOpenWork(workId: string): void
  onCreateWork(): void
}): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const sorted = useMemo(() => [...works].sort(byUpdated), [works])
  const shown = sorted.filter((work) => matches(work, filter, query.trim()))
  const count = (value: Filter): number => works.filter((work) => matches(work, value, '')).length
  const archived = count('archived')

  const create = (
    <Button variant="solid" leftIcon={<AddIcon size={ICON.sm} />} onClick={onCreateWork}>
      Tạo tác phẩm
    </Button>
  )

  return (
    <PageFrame
      title="Thư viện"
      note={
        works.length > 0
          ? `${works.length - archived} tác phẩm${archived ? ` · ${archived} trong Lưu trữ` : ''}`
          : undefined
      }
      wide
    >
      {problems > 0 && (
        <Alert tone="warning">
          {problems} tệp tác phẩm không mở được; các tác phẩm còn lại vẫn dùng bình thường.
        </Alert>
      )}
      {works.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon size={ICON.lg} />}
          title="Thư viện còn trống"
          actions={create}
        >
          Tạo một tác phẩm rồi thêm chương để bắt đầu dịch.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-xs">
            <ButtonGroup<Filter>
              label="Lọc theo trạng thái"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `Tất cả ${count('all')}` },
                { value: 'in-progress', label: `Đang dịch ${count('in-progress')}` },
                { value: 'not-started', label: `Chưa bắt đầu ${count('not-started')}` },
                { value: 'paused', label: `Tạm dừng ${count('paused')}` },
                { value: 'archived', label: `Lưu trữ ${archived}` }
              ]}
            />
            <div className="flex-1" />
            <SearchInput
              label="Tìm tác phẩm"
              placeholder="Tìm theo tên, tên gốc"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-[240px]"
            />
            {create}
          </div>
          {shown.length === 0 ? (
            <p className="m-0 py-xl text-center text-body-sm text-subtle">
              Không có tác phẩm nào khớp.
            </p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-md p-0">
              {shown.map((work) => (
                <li key={work.id} className="flex">
                  <WorkCard work={work} onOpen={() => onOpenWork(work.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageFrame>
  )
}

function WorkCard({ work, onOpen }: { work: Work; onOpen(): void }): JSX.Element {
  return (
    <CardButton onClick={onOpen} className="w-full gap-md">
      <WorkCover work={work} size="md" />
      <span className="flex min-w-0 flex-1 flex-col gap-2xs">
        <span className="line-clamp-2 text-label-md">{work.title}</span>
        {work.originalTitle && (
          <span lang={work.sourceLanguage} className="truncate text-body-xs text-muted">
            {work.originalTitle}
          </span>
        )}
        <span className="mt-auto flex flex-wrap items-center gap-2xs pt-xs">
          {work.archived ? (
            <Badge>Lưu trữ</Badge>
          ) : (
            <Badge color={STATUS_COLORS[work.status]} dot>
              {statusLabels[work.status]}
            </Badge>
          )}
        </span>
        <span className="text-body-xs text-muted">
          {work.chapterCount === 0
            ? 'Chưa có chương'
            : work.lastChapter
              ? `${work.chapterCount} chương · đang ở chương ${work.lastChapter.number}`
              : `${work.chapterCount} chương`}
        </span>
        <span className="text-body-xs text-muted">Sửa {formatUpdated(work.updatedAt)}</span>
      </span>
    </CardButton>
  )
}
