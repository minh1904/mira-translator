import type { JSX } from 'react'
import { RefreshIcon } from '@renderer/components/ui/reicon'

import { PageFrame } from '../../../components/ui/PageFrame'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { cn } from '../../../lib/cn'
import { MOCK_WORKS, MockCover, type MockWork } from '../../../components/ui/mockParts'

interface Update {
  work: MockWork
  text: string
  source: string
  /** Thao tác chính: dịch các chương mới, hoặc tải trước đối với tác phẩm đang tạm dừng. */
  action: string
  failed?: boolean
}

/** Dữ liệu mẫu cố định: danh sách chương mới từ các tác phẩm đang theo dõi. */
const DAYS: { day: string; updates: Update[] }[] = [
  {
    day: 'Hôm nay',
    updates: [
      {
        work: MOCK_WORKS.kl,
        text: '3 chương mới: 89 Xuân phong, 90 Một kiếm, 91 Núi Lạc Phách',
        source: '起点中文网 · 09:40',
        action: 'Dịch 3 chương'
      },
      {
        work: MOCK_WORKS.slime,
        text: 'Không kiểm được: nguồn trả lỗi 403',
        source: 'kakuyomu.jp · 10:42',
        action: 'Sửa nguồn',
        failed: true
      }
    ]
  },
  {
    day: 'Hôm qua',
    updates: [
      {
        work: MOCK_WORKS.dqdt,
        text: '14 chương, lần tải đầu',
        source: '起点中文网 · 21:15',
        action: 'Dịch 14 chương'
      },
      {
        work: MOCK_WORKS.dtcd,
        text: '2 chương mới: 1.021–1.022 · tác phẩm đang tạm dừng',
        source: '起点中文网 · 18:02',
        action: 'Tải về'
      }
    ]
  }
]

/**
 * Giao diện mẫu hiển thị luồng cập nhật chương mới từ các nguồn đang theo dõi.
 * Mọi nút điều khiển đều ở trạng thái vô hiệu hóa để minh họa giao diện.
 */
export function UpdatesScreenMock(): JSX.Element {
  return (
    <PageFrame
      title="Cập nhật"
      soon
      note="Theo dõi 5 tác phẩm · kiểm lần cuối 10:42 · tự kiểm mỗi 6 giờ"
      actions={
        <Button disabled leftIcon={<RefreshIcon size={ICON.sm} />}>
          Kiểm ngay
        </Button>
      }
    >
      {DAYS.map(({ day, updates }) => (
        <section key={day} aria-label={day} className="flex flex-col gap-xs">
          <h2 className="m-0 text-label-sm text-subtle">{day}</h2>
          <ul className="m-0 list-none divide-y divide-subtle rounded-sm border border-default bg-surface p-0">
            {updates.map((update) => (
              <li key={update.work.title} className="flex items-center gap-md px-md py-sm">
                <MockCover work={update.work} size="md" />
                <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                  <span className="truncate text-label-md">{update.work.title}</span>
                  <span className={cn('text-body-sm', update.failed && 'text-error')}>
                    {update.text}
                  </span>
                  <span className="text-body-xs text-muted">{update.source}</span>
                </span>
                <span className="flex shrink-0 gap-xs">
                  {!update.failed && (
                    <Button disabled variant="ghost">
                      Xem
                    </Button>
                  )}
                  <Button disabled variant={update.failed ? 'outline' : 'solid'}>
                    {update.action}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageFrame>
  )
}
