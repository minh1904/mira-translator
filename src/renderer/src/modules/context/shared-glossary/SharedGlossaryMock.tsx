import type { JSX } from 'react'
import { AddIcon, MenuDotsIcon } from '@renderer/components/ui/reicon'

import { PageFrame } from '../../../components/ui/PageFrame'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'
import { SearchInput } from '../../../components/ui/Input'
import { NavItem } from '../../../components/ui/NavItem'
import { cn } from '../../../lib/cn'

/** Dữ liệu mẫu cố định: các bộ thuật ngữ dùng chung cho nhiều tác phẩm. */
const SETS = [
  { name: 'Tu tiên chung', meta: '412 mục · 3 tác phẩm' },
  { name: 'Danh xưng cổ trang', meta: '96 mục · 4 tác phẩm' },
  { name: 'Names.txt (nhập 05/10)', meta: '18.230 mục · 1 tác phẩm' },
  { name: 'Bảng thay thế dấu câu', meta: '14 quy tắc · mọi tác phẩm' }
]

const ENTRIES: { source: string; target: string; kind: string; hits: string; note?: string }[] = [
  { source: '筑基', target: 'Trúc Cơ', kind: 'Cảnh giới', hits: '1.832' },
  { source: '金丹', target: 'Kim Đan', kind: 'Cảnh giới', hits: '1.207' },
  { source: '元婴', target: 'Nguyên Anh', kind: 'Cảnh giới', hits: '988' },
  {
    source: '化神',
    target: 'Hoá Thần',
    kind: 'Cảnh giới',
    hits: '341',
    note: 'Phàm Nhân Tu Tiên ghi đè: Hóa Thần'
  },
  { source: '道友', target: 'đạo hữu', kind: 'Xưng hô', hits: '1.247' },
  { source: '师兄', target: 'sư huynh', kind: 'Xưng hô', hits: '3.410' },
  { source: '灵石', target: 'linh thạch', kind: 'Vật phẩm', hits: '702' },
  { source: '储物袋', target: 'túi trữ vật', kind: 'Vật phẩm', hits: '215' },
  { source: '神识', target: 'thần thức', kind: 'Khái niệm', hits: '1.096' },
  { source: '散修', target: 'tán tu', kind: 'Khái niệm', hits: '0', note: 'Chưa khớp chỗ nào' }
]

/**
 * Giao diện mẫu của kho thuật ngữ dùng chung: các bộ thuật ngữ, tên riêng và quy tắc thay thế dùng cho nhiều tác phẩm.
 * Mọi nút điều khiển đều ở trạng thái vô hiệu hóa để minh họa giao diện.
 */
export function SharedGlossaryMock(): JSX.Element {
  return (
    <PageFrame title="Kho dùng chung" soon wide>
      <div className="flex items-start gap-lg">
        <nav aria-label="Các bộ" className="flex w-[260px] shrink-0 flex-col gap-2xs">
          {SETS.map((set, index) => (
            <NavItem
              key={set.name}
              active={index === 0}
              disabled={index !== 0}
              trailing={
                <span className="text-label-xs text-muted">{set.meta.split(' · ')[0]}</span>
              }
            >
              {set.name}
            </NavItem>
          ))}
          <Button disabled variant="ghost" leftIcon={<AddIcon size={ICON.sm} />}>
            Tạo bộ
          </Button>
        </nav>

        <section
          aria-label="Tu tiên chung"
          className="min-w-0 flex-1 overflow-hidden rounded-sm border border-default bg-surface"
        >
          <div className="flex items-center gap-xs border-b border-subtle px-md py-sm">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-heading">Tu tiên chung</h2>
              <p className="m-0 text-body-xs text-subtle">
                Dùng ở Phàm Nhân Tu Tiên, Kiếm Lai, Đạo Quỷ Dị Tiên · tác phẩm ghi đè được từng mục
              </p>
            </div>
            <SearchInput
              label="Tìm trong bộ"
              placeholder="Tìm trong 412 mục"
              disabled
              className="w-[220px] shrink-0"
            />
            <Button disabled leftIcon={<AddIcon size={ICON.sm} />}>
              Thêm mục
            </Button>
          </div>
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-default bg-subtle">
              <tr>
                {['Nguồn', 'Bản dịch', 'Loại', 'Khớp', ''].map((label) => (
                  <th
                    key={label || 'actions'}
                    className={cn(
                      'h-9 px-md text-label-xs text-subtle',
                      label === 'Khớp' && 'text-right'
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {ENTRIES.map((entry) => (
                <tr key={entry.source}>
                  <td lang="zh" className="px-md py-xs text-body-md">
                    {entry.source}
                  </td>
                  <td className="px-md py-xs">
                    <div className="text-body-sm">{entry.target}</div>
                    {entry.note && (
                      <div
                        className={cn(
                          'text-body-xs',
                          entry.hits === '0' ? 'text-muted' : 'text-warning'
                        )}
                      >
                        {entry.note}
                      </div>
                    )}
                  </td>
                  <td className="px-md py-xs">
                    <Badge>{entry.kind}</Badge>
                  </td>
                  <td className="px-md py-xs text-right text-body-sm text-subtle tabular-nums">
                    {entry.hits}
                  </td>
                  <td className="w-10 px-xs">
                    <CompactButton
                      disabled
                      aria-label="Thêm thao tác"
                      icon={<MenuDotsIcon size={ICON.sm} />}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-subtle px-md py-xs text-body-xs text-muted">
            10 trên 412 mục
          </div>
        </section>
      </div>
    </PageFrame>
  )
}
