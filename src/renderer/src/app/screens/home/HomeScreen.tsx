import type { JSX, ReactNode } from 'react'
import {
  CheckCircleIcon,
  DocumentTextIcon,
  ChecklistMinimalisticIcon,
  PlayIcon,
  ShieldWarningIcon,
  WalletIcon
} from '@renderer/components/ui/reicon'

import { PageFrame, SoonTitle } from '../../../components/ui/PageFrame'
import { Badge } from '../../../components/ui/Badge'
import { Button, LinkButton } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { cn } from '../../../lib/cn'
import { SOON_LABEL } from '../../../lib/mockFeatures'
import { MOCK_WORKS, MockCover, type MockWork } from '../../../components/ui/mockParts'
import { formatUpdated } from '../../../modules/library/public'
import { WorkCover } from '../../../modules/library/public'
import { byUpdated, statusLabels, type Work } from '../../../modules/library/public'

export interface HomeScreenProps {
  works: Work[]
  /** True khi danh sách kết nối đã tải xong và có ít nhất một kết nối AI sẵn sàng. */
  connected: boolean
  onContinue(work: Work): void
  onOpenWork(workId: string): void
  onCreateWork(): void
  onOpenSettings(): void
  onOpenJobs(): void
  onOpenUpdates(): void
}

/**
 * Màn hình chính khi mở ứng dụng: cho phép tiếp tục thao tác với tác phẩm làm việc gần nhất.
 * Các phần số liệu, tác vụ, cập nhật chương mới và lịch sử hoạt động bên dưới là giao diện mẫu minh họa.
 */
export function HomeScreen({
  works,
  connected,
  onContinue,
  onOpenWork,
  onCreateWork,
  onOpenSettings,
  onOpenJobs,
  onOpenUpdates
}: HomeScreenProps): JSX.Element {
  const active = works.filter((work) => !work.archived).sort(byUpdated)

  if (active.length === 0) {
    return (
      <PageFrame title="Trang chủ">
        <StartSteps
          connected={connected}
          onOpenSettings={onOpenSettings}
          onCreateWork={onCreateWork}
        />
      </PageFrame>
    )
  }

  const [latest, ...others] = active
  return (
    <PageFrame title="Trang chủ">
      <ResumeCard
        work={latest!}
        others={others.slice(0, 3)}
        onContinue={onContinue}
        onOpenWork={onOpenWork}
      />
      <StatsMock />
      <div className="grid grid-cols-1 gap-md min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <JobsMock onOpenJobs={onOpenJobs} />
        <div className="flex min-w-0 flex-col gap-md">
          <UpdatesMock onOpenUpdates={onOpenUpdates} />
          <ActivityMock />
        </div>
      </div>
    </PageFrame>
  )
}

function ResumeCard({
  work,
  others,
  onContinue,
  onOpenWork
}: {
  work: Work
  others: Work[]
  onContinue(work: Work): void
  onOpenWork(workId: string): void
}): JSX.Element {
  const chapter = work.lastChapter
  return (
    <section aria-label="Tiếp tục dịch" className="rounded-lg border border-default bg-surface">
      <div className="flex items-center gap-lg p-lg">
        <WorkCover work={work} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-2xs">
          <span className="text-label-xs text-muted">Tiếp tục dịch</span>
          <span className="truncate text-title">{work.title}</span>
          <span className="truncate text-body-sm text-subtle">
            {chapter
              ? `Chương ${chapter.number}${chapter.title ? ' · ' + chapter.title : ''}`
              : work.chapterCount === 0
                ? 'Chưa có chương nào'
                : `${work.chapterCount} chương`}
          </span>
          <span className="text-body-xs text-muted">
            {statusLabels[work.status]} · sửa {formatUpdated(work.updatedAt)}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-xs">
          <Button
            variant="solid"
            leftIcon={<PlayIcon size={ICON.sm} />}
            onClick={() => onContinue(work)}
          >
            {chapter ? 'Dịch tiếp' : 'Mở tác phẩm'}
          </Button>
          {chapter && (
            <LinkButton color="neutral" onClick={() => onOpenWork(work.id)}>
              Mở tác phẩm
            </LinkButton>
          )}
        </div>
      </div>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-md gap-y-2xs border-t border-subtle px-lg py-xs text-body-xs text-subtle">
          <span>Cũng đang làm:</span>
          {others.map((other) => (
            <LinkButton key={other.id} color="neutral" onClick={() => onOpenWork(other.id)}>
              {other.title}
            </LinkButton>
          ))}
        </div>
      )}
    </section>
  )
}

function StartSteps({
  connected,
  onOpenSettings,
  onCreateWork
}: {
  connected: boolean
  onOpenSettings(): void
  onCreateWork(): void
}): JSX.Element {
  const steps: { title: string; body: string; done?: boolean; action?: ReactNode }[] = [
    {
      title: 'Kết nối một model AI',
      body: 'Cài đặt › Kết nối AI. Cần cho dịch và chat.',
      done: connected,
      action: !connected && (
        <Button variant="solid" onClick={onOpenSettings}>
          Kết nối
        </Button>
      )
    },
    {
      title: 'Tạo tác phẩm đầu tiên',
      body: 'Tên, ngôn ngữ gốc, ảnh bìa nếu có.',
      action: (
        <Button variant={connected ? 'solid' : 'outline'} onClick={onCreateWork}>
          Tạo tác phẩm
        </Button>
      )
    },
    {
      title: 'Thêm chương',
      body: 'Trong tác phẩm, thêm chương rồi dán bản gốc vào.'
    },
    {
      title: 'Nhập bộ Names.txt có sẵn',
      body: 'Không bắt buộc: đưa tên riêng bạn đã có vào Kho dùng chung.',
      action: <Badge color="accent">{SOON_LABEL}</Badge>
    }
  ]
  return (
    <section aria-label="Bắt đầu với Mira" className="rounded-lg border border-default bg-surface">
      <header className="flex h-11 items-center justify-between border-b border-subtle px-md">
        <h2 className="m-0 text-heading">Bắt đầu với Mira</h2>
        <span className="text-body-xs text-muted">
          {steps.filter((step) => step.done).length}/{steps.length} bước
        </span>
      </header>
      <ol className="m-0 list-none divide-y divide-subtle p-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-center gap-sm px-md py-sm">
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full border text-label-sm',
                step.done
                  ? 'border-success-muted bg-success-subtle text-success'
                  : 'border-default text-subtle'
              )}
            >
              {step.done ? <CheckCircleIcon size={ICON.sm} aria-label="Đã xong" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-label-sm">{step.title}</span>
              <span className="block text-body-xs text-subtle">{step.body}</span>
            </span>
            {step.action}
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ───────────── Giao diện mẫu tính năng (dữ liệu minh họa cố định) ───────────── */

function StatsMock(): JSX.Element {
  const stats = [
    {
      label: 'Chương dịch tuần này',
      value: '86',
      note: '+12 so với tuần trước',
      icon: DocumentTextIcon
    },
    {
      label: 'Chi phí tuần này',
      value: '—',
      note: 'Tính theo lượt chạy hoàn tất',
      icon: WalletIcon
    },
    {
      label: 'Đề xuất chờ duyệt',
      value: '16',
      note: 'ở 2 tác phẩm',
      icon: ChecklistMinimalisticIcon,
      tone: 'text-warning'
    },
    {
      label: 'Lỗi kiểm tra',
      value: '8',
      note: 'Kiếm Lai 7 · Slime 1',
      icon: ShieldWarningIcon,
      tone: 'text-error'
    }
  ]
  return (
    <section aria-label="Số liệu tuần này" className="flex flex-col gap-xs">
      <h2 className="m-0 text-label-sm text-subtle">
        <SoonTitle>Tuần này</SoonTitle>
      </h2>
      <div className="grid grid-cols-2 gap-md min-[1100px]:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-2xs rounded-lg border border-default bg-surface p-md"
          >
            <div className="flex items-center justify-between gap-xs">
              <span className="text-body-xs text-subtle">{stat.label}</span>
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-md bg-muted',
                  stat.tone ?? 'text-subtle'
                )}
              >
                <stat.icon size={ICON.sm} aria-hidden="true" />
              </span>
            </div>
            <span className="text-title tabular-nums">{stat.value}</span>
            <span className="text-body-xs text-muted">{stat.note}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function MockCard({
  title,
  action,
  children
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <section aria-label={title} className="min-w-0 rounded-lg border border-default bg-surface">
      <header className="flex h-11 items-center justify-between gap-sm border-b border-subtle px-md">
        <h2 className="m-0 text-heading">
          <SoonTitle>{title}</SoonTitle>
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function JobsMock({ onOpenJobs }: { onOpenJobs(): void }): JSX.Element {
  const jobs: { work: MockWork; task: string; done: number; total: number; note: string }[] = [
    {
      work: MOCK_WORKS.pntt,
      task: 'Dịch chương 1.205–1.250',
      done: 19,
      total: 47,
      note: 'còn ~13 phút'
    },
    {
      work: MOCK_WORKS.qbcc,
      task: 'Trích nhân vật và thuật ngữ, chương 1–412',
      done: 252,
      total: 412,
      note: 'còn ~4 phút'
    },
    { work: MOCK_WORKS.kl, task: 'Dịch 3 chương mới (89–91)', done: 0, total: 3, note: 'Đang chờ' }
  ]
  return (
    <MockCard
      title="Tác vụ"
      action={
        <LinkButton color="neutral" onClick={onOpenJobs}>
          Xem tất cả
        </LinkButton>
      }
    >
      <ul className="m-0 list-none divide-y divide-subtle p-0">
        {jobs.map((job) => (
          <li key={job.task} className="flex items-center gap-sm px-md py-sm">
            <MockCover work={job.work} />
            <span className="flex min-w-0 flex-1 flex-col gap-2xs">
              <span className="flex min-w-0 items-baseline gap-xs">
                <span className="truncate text-label-sm">{job.task}</span>
                <span className="shrink-0 text-body-xs text-muted">{job.work.title}</span>
              </span>
              <span className="flex items-center gap-sm">
                <ProgressBar
                  value={(job.done / job.total) * 100}
                  tone={job.done > 0 ? 'info' : 'neutral'}
                  label={`${job.task}: ${job.done} trên ${job.total}`}
                />
                <span className="w-16 shrink-0 text-right text-body-xs text-muted tabular-nums">
                  {job.done}/{job.total}
                </span>
              </span>
              <span className="text-body-xs text-subtle">{job.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </MockCard>
  )
}

function UpdatesMock({ onOpenUpdates }: { onOpenUpdates(): void }): JSX.Element {
  const updates: { work: MockWork; text: string; time: string }[] = [
    { work: MOCK_WORKS.kl, text: '3 chương mới · 89–91', time: '09:40' },
    { work: MOCK_WORKS.dqdt, text: '14 chương · lần tải đầu', time: 'Hôm qua' },
    { work: MOCK_WORKS.dtcd, text: '2 chương mới · 1.021–1.022', time: 'Hôm qua' }
  ]
  return (
    <MockCard
      title="Chương mới từ nguồn"
      action={
        <LinkButton color="neutral" onClick={onOpenUpdates}>
          Mở Cập nhật
        </LinkButton>
      }
    >
      <ul className="m-0 list-none divide-y divide-subtle p-0">
        {updates.map((update) => (
          <li key={update.work.title} className="flex items-center gap-sm px-md py-xs">
            <MockCover work={update.work} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label-sm">{update.work.title}</span>
              <span className="block text-body-xs text-subtle">{update.text}</span>
            </span>
            <span className="text-body-xs text-muted">{update.time}</span>
          </li>
        ))}
      </ul>
    </MockCard>
  )
}

function ActivityMock(): JSX.Element {
  const items = [
    { time: '10:58', what: 'Duyệt 6 đề xuất ở chương 1.203', where: 'Phàm Nhân Tu Tiên' },
    { time: '10:31', what: 'Thêm 4 mục vào Tu tiên chung', where: 'Kho dùng chung' },
    { time: '09:40', what: 'Tải 3 chương mới', where: 'Kiếm Lai' },
    { time: 'Hôm qua', what: 'Xuất .docx chương 1–412', where: 'Quỷ Bí Chi Chủ' }
  ]
  return (
    <MockCard title="Hoạt động gần đây">
      <ol className="m-0 flex list-none flex-col gap-sm px-md py-sm">
        {items.map((item) => (
          <li key={item.what} className="flex gap-sm">
            <span className="w-14 shrink-0 text-body-xs text-muted tabular-nums">{item.time}</span>
            <span className="min-w-0">
              <span className="block text-body-sm">{item.what}</span>
              <span className="block text-body-xs text-subtle">{item.where}</span>
            </span>
          </li>
        ))}
      </ol>
    </MockCard>
  )
}
