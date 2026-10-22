import type { JSX, ReactNode } from 'react'
import { CopyIcon } from '@renderer/components/ui/reicon'

import { PageFrame } from '../../../components/ui/PageFrame'
import { Badge } from '../../../components/ui/Badge'
import { Button, LinkButton } from '../../../components/ui/Button'
import { ButtonGroup } from '../../../components/ui/ButtonGroup'
import { ICON } from '../../../components/ui/icon'
import { NavItem } from '../../../components/ui/NavItem'
import { Textarea } from '../../../components/ui/Textarea'

/** Dữ liệu mẫu cố định: hồ sơ văn phong tác phẩm kế thừa và ghi đè. */
const PROFILES = [
  { name: 'Cổ trang – tu tiên', meta: '4 tác phẩm' },
  { name: 'Đô thị hiện đại', meta: '1 tác phẩm' },
  { name: 'Light novel Nhật', meta: '1 tác phẩm' },
  { name: 'Bản nháp mới', meta: 'Chưa dùng' }
]

const ADDRESSING = [
  'Sư phụ ↔ đồ nhi: ta – con',
  'Đồng môn: huynh – đệ, tỷ – muội',
  'Người lạ: các hạ – tại hạ',
  'Kẻ thù: ngươi – ta'
]

const EXAMPLES = [
  {
    source: '韩立心中一凛，暗道不好。',
    target: 'Hàn Lập trong lòng chấn động, thầm kêu không ổn.'
  },
  { source: '道友请留步。', target: 'Đạo hữu xin dừng bước.' }
]

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-md border-b border-subtle px-md py-md last:border-b-0">
      <div>
        <div className="text-label-sm">{label}</div>
        <div className="text-body-xs text-subtle">{hint}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Giao diện mẫu của hồ sơ văn phong: giọng văn, xưng hô mặc định, quy tắc phiên âm và các câu dịch mẫu.
 * Mọi nút điều khiển đều ở trạng thái vô hiệu hóa để minh họa giao diện.
 */
export function StyleProfilesMock(): JSX.Element {
  return (
    <PageFrame title="Prompt & văn phong" soon wide>
      <div className="flex items-start gap-lg">
        <nav aria-label="Hồ sơ văn phong" className="flex w-[260px] shrink-0 flex-col gap-2xs">
          {PROFILES.map((profile, index) => (
            <NavItem
              key={profile.name}
              active={index === 0}
              disabled={index !== 0}
              trailing={<span className="text-label-xs text-muted">{profile.meta}</span>}
            >
              {profile.name}
            </NavItem>
          ))}
        </nav>

        <section
          aria-label="Cổ trang – tu tiên"
          className="min-w-0 flex-1 overflow-hidden rounded-lg border border-default bg-surface"
        >
          <div className="flex items-center gap-xs border-b border-subtle px-md py-sm">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-heading">Cổ trang – tu tiên</h2>
              <p className="m-0 text-body-xs text-subtle">
                Mặc định cho truyện tiếng Trung · Phàm Nhân Tu Tiên ghi đè 2 mục, Kiếm Lai ghi đè 1
                mục
              </p>
            </div>
            <Button disabled variant="ghost" leftIcon={<CopyIcon size={ICON.sm} />}>
              Nhân bản
            </Button>
          </div>
          <Field label="Giọng văn" hint="Gửi kèm mọi lượt dịch">
            <Textarea
              disabled
              rows={3}
              defaultValue="Văn phong kiếm hiệp cổ điển, câu gọn. Giữ thành ngữ Hán Việt quen thuộc (nhất kiến chung tình), dịch nghĩa thành ngữ khó hiểu. Không dùng từ lóng hiện đại."
            />
          </Field>
          <Field label="Xưng hô mặc định" hint="Khi nhân vật chưa có quy ước riêng">
            <div className="flex flex-wrap gap-xs">
              {ADDRESSING.map((pair) => (
                <Badge key={pair}>{pair}</Badge>
              ))}
            </div>
          </Field>
          <Field label="Phiên âm tên" hint="Tên người, địa danh">
            <ButtonGroup
              label="Cách phiên âm tên"
              value="han-viet"
              onChange={() => undefined}
              options={[
                { value: 'han-viet', label: 'Hán Việt (Hàn Lập)' },
                { value: 'pinyin', label: 'Pinyin (Han Li)' }
              ]}
            />
          </Field>
          <Field label="Câu mẫu" hint="AI bắt chước cách dịch">
            <div className="flex flex-col gap-xs">
              {EXAMPLES.map((example) => (
                <div
                  key={example.source}
                  className="grid grid-cols-2 gap-xs rounded-sm border border-default p-xs text-body-sm"
                >
                  <span lang="zh">{example.source}</span>
                  <span>{example.target}</span>
                </div>
              ))}
            </div>
          </Field>
          <div className="flex items-center justify-between border-t border-subtle bg-subtle px-md py-xs text-body-xs text-muted">
            <span>Gửi kèm khoảng 640 token mỗi lượt dịch</span>
            <LinkButton disabled color="neutral">
              Xem prompt đầy đủ
            </LinkButton>
          </div>
        </section>
      </div>
    </PageFrame>
  )
}
