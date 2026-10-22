import { useMemo, useState, type JSX, type ReactNode } from 'react'
import {
  AltArrowDownIcon,
  AltArrowRightIcon,
  CloseIcon,
  DangerCircleIcon,
  DangerTriangleIcon,
  DoubleAltArrowUpIcon,
  PauseIcon,
  RefreshIcon
} from '@renderer/components/ui/reicon'

import { Badge } from '../../../components/ui/Badge'
import { LinkButton } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'
import { Input, SearchInput } from '../../../components/ui/Input'
import { NavItem } from '../../../components/ui/NavItem'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { TabsList, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import { Tip } from '../../../components/ui/Tooltip'
import { cn } from '../../../lib/cn'
import { SOON_LABEL } from '../../../lib/mockFeatures'

/**
 * Màn minh hoạ cho các panel sidebar chưa có tính năng thật ở màn dịch chương. Dữ liệu là chữ cố định,
 * không đọc tác phẩm, không gọi main. Tìm và thay lọc trên đoạn mẫu để thấy cách hiện kết quả.
 * Nghiên cứu và lộ trình: docs/modules/workspace/find-replace.md.
 */

/** Dải đầu panel cao 28px, cùng kiểu với ô tìm của danh sách chương. */
export function SidePanelHeader({
  title,
  soon = true,
  actions
}: {
  title: string
  soon?: boolean
  actions?: ReactNode
}): JSX.Element {
  return (
    <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-default bg-subtle/30 pr-1 pl-2.5">
      <h2 className="min-w-0 flex-1 truncate text-label-xs text-subtle">{title}</h2>
      {soon && (
        <Badge variant="outline" className="shrink-0">
          {SOON_LABEL}
        </Badge>
      )}
      {actions}
    </div>
  )
}

// ---------------------------------------------------------------- Tìm và thay

interface MockParagraph {
  chapter: number
  title: string
  text: string
}

const PARAGRAPHS: MockParagraph[] = [
  {
    chapter: 3,
    title: 'Gặp lại cố nhân',
    text: 'Lâm Phong ngẩng đầu, nhìn về phía Thiên Lam Tông.'
  },
  {
    chapter: 3,
    title: 'Gặp lại cố nhân',
    text: '“Lâm sư huynh!” Tiểu sư muội gọi với theo Lâm Phong.'
  },
  {
    chapter: 3,
    title: 'Gặp lại cố nhân',
    text: 'Linh khí quanh người Lâm Phong cuộn lên như sóng.'
  },
  {
    chapter: 7,
    title: 'Thí luyện nội môn',
    text: 'Trưởng lão gật đầu: “Lâm Phong, ngươi vào trước.”'
  },
  {
    chapter: 7,
    title: 'Thí luyện nội môn',
    text: 'Không ai ngờ Lâm Phong lại chọn con đường khó nhất.'
  },
  { chapter: 12, title: 'Dao Trì', text: 'Nước Dao Trì phản chiếu bóng Lâm Phong đứng lặng.' },
  { chapter: 12, title: 'Dao Trì', text: 'Bạch Dực khẽ cười, gọi Lâm Phong là “anh”.' },
  {
    chapter: 15,
    title: 'Phá Quân Kiếm Pháp',
    text: 'Chiêu thứ ba: Vân Tranh. Kiếm khí của Lâm Phong xé gió.'
  }
]

interface Hit {
  paragraph: number
  at: number
}

function findHits(text: string, query: string, caseSensitive: boolean): number[] {
  if (query === '') return []
  const hay = caseSensitive ? text : text.toLocaleLowerCase('vi')
  const needle = caseSensitive ? query : query.toLocaleLowerCase('vi')
  const found: number[] = []
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
    found.push(at)
  }
  return found
}

function ToggleGlyph({
  label,
  pressed,
  onToggle,
  children
}: {
  label: string
  pressed: boolean
  onToggle(): void
  children: string
}): JSX.Element {
  return (
    <Tip label={label}>
      <CompactButton
        aria-label={label}
        aria-pressed={pressed}
        onClick={onToggle}
        icon={<span className="text-label-xs leading-none">{children}</span>}
      />
    </Tip>
  )
}

export function SearchPanelMock(): JSX.Element {
  const [query, setQuery] = useState('Lâm Phong')
  const [replacement, setReplacement] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(true)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [preserveCase, setPreserveCase] = useState(true)
  const [side, setSide] = useState('target')
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set())

  const groups = useMemo(() => {
    const byChapter = new Map<number, { title: string; hits: Hit[] }>()
    PARAGRAPHS.forEach((paragraph, index) => {
      for (const at of findHits(paragraph.text, query.trim(), caseSensitive)) {
        const group = byChapter.get(paragraph.chapter) ?? { title: paragraph.title, hits: [] }
        group.hits.push({ paragraph: index, at })
        byChapter.set(paragraph.chapter, group)
      }
    })
    return [...byChapter.entries()]
  }, [query, caseSensitive])
  const total = groups.reduce((sum, [, group]) => sum + group.hits.length, 0)
  const needle = query.trim()

  function toggleChapter(chapter: number): void {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(chapter)) next.delete(chapter)
      else next.add(chapter)
      return next
    })
  }

  return (
    <>
      <SidePanelHeader
        title="Tìm và thay"
        actions={
          <>
            <Tip label="Tìm lại">
              <CompactButton aria-label="Tìm lại" disabled icon={<RefreshIcon size={ICON.xs} />} />
            </Tip>
            <Tip label="Xoá kết quả">
              <CompactButton
                aria-label="Xoá kết quả"
                onClick={() => {
                  setQuery('')
                  setReplacement('')
                }}
                icon={<CloseIcon size={ICON.xs} />}
              />
            </Tip>
            <Tip label="Thu gọn tất cả">
              <CompactButton
                aria-label="Thu gọn tất cả"
                onClick={() => setCollapsed(new Set(groups.map(([chapter]) => chapter)))}
                icon={<DoubleAltArrowUpIcon size={ICON.xs} />}
              />
            </Tip>
          </>
        }
      />

      <div className="flex shrink-0 gap-1 px-1.5 pt-2 pb-1">
        <CompactButton
          aria-label={replaceOpen ? 'Ẩn ô thay' : 'Hiện ô thay'}
          aria-expanded={replaceOpen}
          onClick={() => setReplaceOpen((open) => !open)}
          className="mt-0.5"
          icon={
            replaceOpen ? <AltArrowDownIcon size={ICON.xs} /> : <AltArrowRightIcon size={ICON.xs} />
          }
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            aria-label="Tìm"
            placeholder="Tìm"
            className="pr-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rightSlot={
              <span className="flex shrink-0 items-center">
                <ToggleGlyph
                  label="Phân biệt hoa thường"
                  pressed={caseSensitive}
                  onToggle={() => setCaseSensitive((on) => !on)}
                >
                  Aa
                </ToggleGlyph>
                <ToggleGlyph
                  label="Khớp nguyên từ"
                  pressed={wholeWord}
                  onToggle={() => setWholeWord((on) => !on)}
                >
                  ab
                </ToggleGlyph>
                <ToggleGlyph
                  label="Biểu thức chính quy"
                  pressed={regex}
                  onToggle={() => setRegex((on) => !on)}
                >
                  .*
                </ToggleGlyph>
              </span>
            }
          />
          {replaceOpen && (
            <div className="flex items-center gap-1">
              <Input
                aria-label="Thay bằng"
                placeholder="Thay bằng"
                className="flex-1 pr-1"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                rightSlot={
                  <ToggleGlyph
                    label="Giữ hoa thường khi thay"
                    pressed={preserveCase}
                    onToggle={() => setPreserveCase((on) => !on)}
                  >
                    AB
                  </ToggleGlyph>
                }
              />
              <Tip label={`Thay tất cả (xem trước) · ${SOON_LABEL}`}>
                <CompactButton
                  aria-label="Thay tất cả"
                  disabled
                  icon={<span className="text-label-xs leading-none">⇄</span>}
                />
              </Tip>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 pb-2">
        <TabsRoot value={side} onValueChange={(value) => setSide(String(value))}>
          <TabsList variant="pill" aria-label="Tìm trong">
            <TabsTab variant="pill" value="target">
              Bản dịch
            </TabsTab>
            <TabsTab variant="pill" value="source">
              Bản gốc
            </TabsTab>
          </TabsList>
        </TabsRoot>
        <span className="truncate text-body-xs text-muted">C.1–120</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-default p-1.5">
        {needle === '' ? (
          <p className="px-2 py-1.5 text-body-xs text-subtle">
            Gõ chữ cần tìm trong cả truyện. Kết quả gom theo chương.
          </p>
        ) : total === 0 ? (
          <p className="px-2 py-1.5 text-body-xs text-subtle">Không có kết quả.</p>
        ) : (
          <>
            <p className="px-2 pb-1 text-body-xs text-subtle tabular-nums">
              {total} kết quả trong {groups.length} chương
            </p>
            {groups.map(([chapter, group]) => {
              const open = !collapsed.has(chapter)
              return (
                <div key={chapter}>
                  <NavItem
                    aria-expanded={open}
                    onClick={() => toggleChapter(chapter)}
                    leading={
                      open ? (
                        <AltArrowDownIcon size={ICON.xs} aria-hidden="true" />
                      ) : (
                        <AltArrowRightIcon size={ICON.xs} aria-hidden="true" />
                      )
                    }
                    trailing={
                      <span className="text-label-xs text-muted tabular-nums">
                        {group.hits.length}
                      </span>
                    }
                    strong
                  >
                    C.{chapter} {group.title}
                  </NavItem>
                  {open &&
                    group.hits.map((hit) => (
                      <NavItem
                        key={`${hit.paragraph}:${hit.at}`}
                        className="pl-7 text-body-xs"
                        title={PARAGRAPHS[hit.paragraph].text}
                      >
                        <Excerpt
                          text={PARAGRAPHS[hit.paragraph].text}
                          at={hit.at}
                          length={needle.length}
                          replacement={replaceOpen ? replacement : ''}
                        />
                      </NavItem>
                    ))}
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}

/** Một dòng kết quả: chữ quanh chỗ khớp; có chữ thay thì gạch chữ cũ và hiện chữ mới như VS Code. */
function Excerpt({
  text,
  at,
  length,
  replacement
}: {
  text: string
  at: number
  length: number
  replacement: string
}): JSX.Element {
  const start = Math.max(0, at - 12)
  const matched = text.slice(at, at + length)
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, at)}
      {replacement ? (
        <>
          <del className="rounded-xs bg-error-subtle text-error">{matched}</del>
          <ins className="rounded-xs bg-success-subtle text-success no-underline">
            {replacement}
          </ins>
        </>
      ) : (
        <mark className="rounded-xs bg-warning-subtle text-default">{matched}</mark>
      )}
      {text.slice(at + length)}
    </>
  )
}

// ---------------------------------------------------------------- Ngữ cảnh

interface MockTerm {
  source: string
  target: string
  kind: string
  chapters: number
  pending?: boolean
}

const TERMS: MockTerm[] = [
  { source: '林峰', target: 'Lâm Phong', kind: 'Người', chapters: 43 },
  { source: '白翼', target: 'Bạch Dực', kind: 'Người', chapters: 21 },
  { source: '天岚宗', target: 'Thiên Lam Tông', kind: 'Tổ chức', chapters: 9 },
  { source: '瑶池', target: 'Dao Trì', kind: 'Địa danh', chapters: 4 },
  { source: '灵气', target: 'linh khí', kind: 'Thuật ngữ', chapters: 37 },
  { source: '道友', target: 'đạo hữu', kind: 'Thuật ngữ', chapters: 6, pending: true },
  { source: '云筝', target: 'Vân Tranh', kind: 'Kỹ năng', chapters: 2, pending: true },
  { source: '师兄', target: 'sư huynh', kind: 'Danh hiệu', chapters: 18, pending: true }
]

export function ContextPanelMock({ onOpenReview }: { onOpenReview?(): void }): JSX.Element {
  const [tab, setTab] = useState('terms')
  const [filter, setFilter] = useState('')
  const pending = TERMS.filter((term) => term.pending).length
  const rows = TERMS.filter((term) => {
    if (tab === 'people' && term.kind !== 'Người') return false
    if (tab === 'pending' && !term.pending) return false
    const needle = filter.trim().toLocaleLowerCase('vi')
    return (
      needle === '' ||
      term.source.includes(needle) ||
      term.target.toLocaleLowerCase('vi').includes(needle)
    )
  })

  return (
    <>
      <SidePanelHeader title="Ngữ cảnh" />
      <div className="flex shrink-0 flex-col gap-2 px-2 pt-2 pb-2">
        <SearchInput
          label="Lọc thuật ngữ"
          placeholder="Lọc theo từ gốc hoặc bản dịch"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <TabsRoot value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList variant="pill" aria-label="Loại ngữ cảnh" className="w-full">
            <TabsTab variant="pill" value="terms" className="flex-1 justify-center">
              Thuật ngữ
            </TabsTab>
            <TabsTab variant="pill" value="people" className="flex-1 justify-center">
              Nhân vật
            </TabsTab>
            <TabsTab variant="pill" value="pending" className="flex-1 justify-center">
              Chờ duyệt <span className="tabular-nums text-muted">{pending}</span>
            </TabsTab>
          </TabsList>
        </TabsRoot>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-default p-1.5">
        {rows.length === 0 ? (
          <p className="px-2 py-1.5 text-body-xs text-subtle">Không có mục nào.</p>
        ) : (
          rows.map((term) => (
            <NavItem
              key={term.source}
              title={`${term.kind} · xuất hiện ở ${term.chapters} chương`}
              leading={
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    term.pending ? 'bg-warning' : 'bg-success'
                  )}
                />
              }
              trailing={
                <span className="text-label-xs text-muted tabular-nums">{term.chapters}c</span>
              }
            >
              <span lang="zh" className="text-subtle">
                {term.source}
              </span>{' '}
              → {term.target}
              {term.pending && <span className="sr-only"> (chờ duyệt)</span>}
            </NavItem>
          ))
        )}
      </div>
      {onOpenReview && (
        <div className="shrink-0 border-t border-default px-2.5 py-1.5">
          <LinkButton color="link" className="text-body-xs" onClick={onOpenReview}>
            Mở khu Ngữ cảnh để duyệt
          </LinkButton>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Kiểm tra

interface MockIssue {
  chapter: number
  severity: 'error' | 'warning'
  message: string
  excerpt: string
}

const ISSUES: MockIssue[] = [
  {
    chapter: 3,
    severity: 'error',
    message: 'Sót chữ Hán',
    excerpt: '…nhìn về phía 天岚宗 phía xa…'
  },
  {
    chapter: 3,
    severity: 'warning',
    message: 'Thuật ngữ không áp: 灵气 → linh khí',
    excerpt: '…khí linh quanh người…'
  },
  {
    chapter: 7,
    severity: 'warning',
    message: 'Xưng hô lệch cặp Bạch Dực → Lâm Phong',
    excerpt: '…“cậu” vào trước…'
  },
  {
    chapter: 12,
    severity: 'error',
    message: 'Sót đoạn (bản gốc 14 đoạn, bản dịch 13)',
    excerpt: 'Đoạn 9'
  },
  { chapter: 15, severity: 'warning', message: 'Dấu câu Trung: 「」', excerpt: '…「Vân Tranh」…' }
]

export function ChecksPanelMock(): JSX.Element {
  const chapters = [...new Set(ISSUES.map((issue) => issue.chapter))]
  return (
    <>
      <SidePanelHeader title="Kiểm tra" />
      <p className="shrink-0 px-2.5 pt-2 pb-1 text-body-xs text-subtle tabular-nums">
        {ISSUES.length} vấn đề trong {chapters.length} chương
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {chapters.map((chapter) => (
          <div key={chapter} className="pb-1">
            <p className="px-2 py-1 text-label-xs text-subtle">C.{chapter}</p>
            {ISSUES.filter((issue) => issue.chapter === chapter).map((issue) => (
              <NavItem
                key={issue.message}
                className="h-auto items-start py-1"
                leading={
                  issue.severity === 'error' ? (
                    <DangerCircleIcon
                      size={ICON.xs}
                      className="mt-0.5 text-error"
                      aria-label="Lỗi"
                    />
                  ) : (
                    <DangerTriangleIcon
                      size={ICON.xs}
                      className="mt-0.5 text-warning"
                      aria-label="Cảnh báo"
                    />
                  )
                }
              >
                <span className="block truncate">{issue.message}</span>
                <span className="block truncate text-body-xs text-muted">{issue.excerpt}</span>
              </NavItem>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Tác vụ

interface MockJob {
  title: string
  detail: string
  progress: number
  state: 'running' | 'paused' | 'done' | 'failed'
}

const JOBS: MockJob[] = [
  {
    title: 'Dịch C.121–130',
    detail: '4/10 chương · còn khoảng 6 phút',
    progress: 40,
    state: 'running'
  },
  { title: 'Trích thuật ngữ C.1–50', detail: '3 mục mới chờ duyệt', progress: 100, state: 'done' },
  {
    title: 'Dịch lại đoạn lỗi C.12',
    detail: 'Hết hạn mức, thử lại lúc 14:30',
    progress: 0,
    state: 'failed'
  },
  { title: 'Kiểm tra C.1–120', detail: 'Tạm dừng ở C.88', progress: 73, state: 'paused' }
]

const JOB_TONE = { running: 'info', paused: 'neutral', done: 'success', failed: 'error' } as const
const JOB_LABEL = { running: 'Đang chạy', paused: 'Tạm dừng', done: 'Xong', failed: 'Lỗi' }

export function JobsPanelMock(): JSX.Element {
  return (
    <>
      <SidePanelHeader
        title="Tác vụ của truyện"
        actions={
          <Tip label="Tạm dừng tất cả">
            <CompactButton
              aria-label="Tạm dừng tất cả"
              disabled
              icon={<PauseIcon size={ICON.xs} />}
            />
          </Tip>
        }
      />
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3 overflow-y-auto px-2.5 py-2.5">
        {JOBS.map((job) => (
          <li key={job.title} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-body-sm">{job.title}</span>
              <Badge variant="plain" dot color={JOB_TONE[job.state]} className="shrink-0">
                {JOB_LABEL[job.state]}
              </Badge>
            </div>
            <ProgressBar
              value={job.progress}
              tone={JOB_TONE[job.state]}
              label={`${job.title}: ${job.progress}%`}
            />
            <span className="truncate text-body-xs text-muted">{job.detail}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
