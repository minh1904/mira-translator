import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  AddIcon,
  BookBookmarkIcon,
  PenNewSquareIcon,
  UsersGroupRoundedIcon
} from '@renderer/components/ui/reicon'

import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { TabsList, TabsPanel, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import { GlossaryScreen } from '../../context/public'
import { AddressingScreen } from '../../context/public'
import { SOON_LABEL } from '../../../lib/mockFeatures'

/** Dữ liệu mẫu cố định: hiển thị minh họa nội dung khu vực ngữ cảnh. */
interface HonorificRow {
  from: string
  to: string
  form: string
  changedAtChapter?: number
  note: string
  pending?: boolean
}

const HONORIFICS: HonorificRow[] = [
  { from: 'Tuệ Lâm', to: 'Bạch Dực', form: '"cậu" – "tớ"', note: 'Bạn học cùng lớp, từ chương 1' },
  {
    from: 'Tuệ Lâm',
    to: 'Bạch Dực',
    form: '"anh" – "em"',
    changedAtChapter: 14,
    note: 'AI phát hiện đổi cách xưng sau cảnh tỏ tình ở chương 13',
    pending: true
  },
  { from: 'Bạch Dực', to: 'thầy Vũ Thành', form: '"thầy" – "em"', note: 'Giữ nguyên suốt truyện' },
  {
    from: 'Tuệ Lâm',
    to: 'mẹ',
    form: '—',
    note: 'Chỉ xuất hiện 1 chương, chưa đủ hội thoại để xác định'
  }
]

interface TermRow {
  source: string
  target: string
  note: string
}

const TERMS: TermRow[] = [
  { source: 'Linh khí', target: 'linh khí', note: 'Sức mạnh tu luyện — không dịch là "khí linh"' },
  { source: 'Thiên Lam Tông', target: 'Thiên Lam Tông', note: 'Tên môn phái, giữ Hán Việt' },
  {
    source: 'Phá Quân Kiếm Pháp Đệ Tam Thức: Vân Tranh',
    target: 'Phá Quân Kiếm Pháp — chiêu thứ ba: Vân Tranh',
    note: 'Tên chiêu thức dài, đã thống nhất cách ngắt từ chương 4'
  },
  { source: 'Dao Trì', target: 'Dao Trì', note: '' }
]

/**
 * Giao diện khu vực ngữ cảnh: thuật ngữ, xưng hô và văn phong. Khi có tác phẩm, hai phần đầu
 * là màn hình thực tế của thuật ngữ và xưng hô; phần văn phong là giao diện mẫu tạm thời.
 */
export function ContextAreaMock({ workId }: { workId?: string } = {}): JSX.Element {
  // Pairs the addressing analysis left for review; recounted whenever the tab changes.
  const [pendingPairs, setPendingPairs] = useState(0)
  const countPending = useCallback(() => {
    if (!workId) return
    void window.mira.addressing.dyads.list({ workId, status: 'pending' }).then((result) => {
      if (result.ok) setPendingPairs(result.value.dyads.length)
    })
  }, [workId])
  useEffect(countPending, [countPending])

  return (
    <section
      aria-labelledby="context-heading"
      className="@container flex flex-col gap-4 rounded-sm border border-default p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="context-heading" className="flex items-center gap-2 text-body-md font-semibold">
          Ngữ cảnh dịch
        </h2>
        <p className="max-w-[60ch] text-body-xs leading-normal text-subtle">
          Những quy ước giúp AI dịch nhất quán trong cả tác phẩm: thuật ngữ gốc–dịch, xưng hô giữa
          các nhân vật, và văn phong học từ bản dịch cũ.
        </p>
      </div>

      <TabsRoot defaultValue="thuat-ngu" onValueChange={countPending}>
        <TabsList aria-label="Loại ngữ cảnh">
          <TabsTab value="thuat-ngu">Thuật ngữ</TabsTab>
          <TabsTab value="xung-ho">
            Xưng hô
            {pendingPairs > 0 && (
              <span className="ml-1.5 rounded-sm bg-warning/10 px-1 py-px text-body-xs text-warning">
                {pendingPairs} chờ duyệt
              </span>
            )}
            {!workId && (
              <span className="ml-1.5 rounded-sm bg-selected px-1 py-px text-body-xs text-subtle">
                {SOON_LABEL}
              </span>
            )}
          </TabsTab>
          <TabsTab value="van-phong">
            Văn phong
            <span className="ml-1.5 rounded-sm bg-selected px-1 py-px text-body-xs text-subtle">
              {SOON_LABEL}
            </span>
          </TabsTab>
        </TabsList>

        <TabsPanel value="thuat-ngu" className="pt-4 outline-none">
          {workId ? <GlossaryScreen workId={workId} /> : <TermsTable />}
        </TabsPanel>
        <TabsPanel value="xung-ho" className="pt-4 outline-none">
          {workId ? <AddressingScreen workId={workId} /> : <HonorificsTable />}
        </TabsPanel>
        <TabsPanel value="van-phong" className="pt-4 outline-none">
          <StylePanel />
        </TabsPanel>
      </TabsRoot>
    </section>
  )
}

const honorificGrid =
  'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_84px_minmax(0,1.4fr)] items-start gap-3 @max-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
const hideBelow720 = '@max-[720px]:hidden'

function HonorificsTable(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-xs text-subtle">Ai gọi ai là gì, và từ chương nào đổi cách xưng.</p>
        <Button disabled>
          <AddIcon size={14} />
          Thêm cách xưng hô
        </Button>
      </div>
      <div className="overflow-hidden rounded-sm border border-default">
        <div
          className={cn(
            honorificGrid,
            'border-b border-default bg-subtle px-3 py-2 text-body-xs font-medium text-subtle'
          )}
        >
          <span>Người nói → người nghe</span>
          <span>Cách xưng</span>
          <span className={hideBelow720}>Đổi từ</span>
          <span className={hideBelow720}>Ghi chú</span>
        </div>
        <ul>
          {HONORIFICS.map((row, index) => (
            <li
              key={index}
              className={cn(
                honorificGrid,
                'border-b border-default px-3 py-2.5 text-body-sm last:border-b-0',
                row.pending && 'bg-warning/6'
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <UsersGroupRoundedIcon size={14} className="shrink-0 text-subtle" />
                {row.from} → {row.to}
              </span>
              <span className="flex flex-col items-start gap-1.5">
                {row.form}
                {row.pending && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="w-fit rounded-full bg-warning/14 px-1.5 py-px text-body-xs font-semibold whitespace-nowrap text-warning">
                      Chờ duyệt · từ chương {row.changedAtChapter}
                    </span>
                    <Button variant="solid" disabled>
                      Duyệt
                    </Button>
                    <Button disabled>Từ chối</Button>
                  </span>
                )}
              </span>
              <span className={cn('text-subtle', hideBelow720)}>
                {row.changedAtChapter ? 'Ch. ' + row.changedAtChapter : '—'}
              </span>
              <span className={cn('leading-normal text-subtle', hideBelow720)}>{row.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const termGrid =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-start gap-3 @max-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
const hideBelow640 = '@max-[640px]:hidden'

function TermsTable(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-xs text-subtle">
          Tên người, địa danh, chiêu thức: bản gốc và cách dịch đã chốt.
        </p>
        <Button disabled>
          <AddIcon size={14} />
          Thêm thuật ngữ
        </Button>
      </div>
      <div className="overflow-hidden rounded-sm border border-default">
        <div
          className={cn(
            termGrid,
            'border-b border-default bg-subtle px-3 py-2 text-body-xs font-medium text-subtle'
          )}
        >
          <span className="flex items-center gap-1.5">
            <BookBookmarkIcon size={14} />
            Bản gốc
          </span>
          <span>Bản dịch</span>
          <span className={hideBelow640}>Ghi chú</span>
        </div>
        <ul>
          {TERMS.map((term) => (
            <li
              key={term.source}
              className={cn(
                termGrid,
                'border-b border-default px-3 py-2.5 text-body-sm last:border-b-0'
              )}
            >
              <span className="font-medium" lang="zh-Hant">
                {term.source}
              </span>
              <span>{term.target}</span>
              <span className={cn('leading-normal text-subtle', hideBelow640)}>
                {term.note || '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StylePanel(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-xs leading-normal text-subtle">
        Học giọng văn từ bản dịch cũ của bạn, áp dụng khi AI dịch đoạn mới hoặc viết lại theo yêu
        cầu.
      </p>
      <div className="flex flex-col gap-1.5 rounded-sm border border-default bg-muted/50 p-3.5">
        <p className="text-body-sm font-medium">Giọng văn hiện tại</p>
        <p className="text-body-sm leading-normal text-subtle">
          Câu ngắn, thoại tự nhiên, ít từ Hán Việt trừ thuật ngữ tu luyện. Người kể xưng “tôi” ở các
          đoạn hồi tưởng.
        </p>
      </div>
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-sm border border-default p-3">
          <p className="text-body-xs font-medium text-subtle">Bản dịch cũ (nguồn học văn phong)</p>
          <p className="text-body-sm leading-normal text-subtle italic">
            “Nàng chỉ lặng im, ánh mắt dõi theo bóng hắn khuất dần sau rặng trúc.”
          </p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-sm border border-default p-3">
          <p className="text-body-xs font-medium text-subtle">Áp dụng cho câu mới</p>
          <p className="text-body-sm leading-normal italic">
            “Cô chẳng nói gì, chỉ nhìn theo bóng cậu khuất dần sau hàng trúc.”
          </p>
        </div>
      </div>
      <div>
        <Button disabled>
          <PenNewSquareIcon size={14} />
          Sửa mô tả văn phong
        </Button>
      </div>
    </div>
  )
}
