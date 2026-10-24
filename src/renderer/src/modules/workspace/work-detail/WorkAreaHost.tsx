import {
  Component,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type JSX,
  type ReactNode
} from 'react'
import { Button } from '../../../components/ui/Button'
import { TabsList, TabsPanel, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import { SOON_LABEL } from '../../../lib/mockFeatures'
import type { WorkArea, WorkAreaProps } from './workArea'

/** Giới hạn phạm vi lỗi trong từng khu vực; phần đầu trang và các khu vực khác vẫn dùng được. */
class AreaBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Khu vực “' + this.props.label + '” bị lỗi:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-8 text-body-sm">
        <p>
          Không hiển thị được khu vực “{this.props.label}”. Tác phẩm và dữ liệu không bị ảnh hưởng.
        </p>
        <Button variant="light" onClick={() => this.setState({ failed: false })}>
          Thử lại
        </Button>
      </div>
    )
  }
}

export interface WorkAreaHostProps {
  areas: ReadonlyArray<WorkArea>
  selectedId: string
  onSelect(id: string): void
  areaProps: WorkAreaProps
}

/**
 * Vùng hiển thị nội dung các khu vực của màn hình chi tiết tác phẩm.
 * Hiển thị thanh tab lựa chọn khi có từ hai khu vực trở lên.
 */
export function WorkAreaHost({
  areas,
  selectedId,
  onSelect,
  areaProps
}: WorkAreaHostProps): JSX.Element | null {
  const active = areas.find((area) => area.id === selectedId) ?? areas[0]
  const panel = useRef<HTMLDivElement>(null)
  const previous = useRef(active?.id)
  const [visited, setVisited] = useState(() => new Set(active ? [active.id] : []))

  // Sau khi người dùng chuyển khu vực, chuyển tiêu điểm vào khu vực mới
  useEffect(() => {
    if (previous.current !== active?.id) panel.current?.focus()
    previous.current = active?.id
  }, [active?.id])

  if (!active) return null

  const body = (area: WorkArea): JSX.Element => (
    <AreaBoundary key={area.id + areaProps.workId} label={area.label}>
      {area.render(areaProps)}
    </AreaBoundary>
  )

  if (areas.length === 1) return body(active)

  return (
    <TabsRoot
      value={active.id}
      onValueChange={(value) => {
        const id = String(value)
        setVisited((current) => new Set(current).add(id))
        onSelect(id)
      }}
    >
      <TabsList className="max-w-full overflow-x-auto" aria-label="Khu vực của tác phẩm">
        {areas.map((area) => (
          <TabsTab key={area.id} value={area.id} className="shrink-0">
            {area.label}
            {area.Badge && <area.Badge workId={areaProps.workId} />}
            {area.soon && (
              <span className="ml-1.5 rounded-sm bg-selected px-1 py-px text-body-xs text-default">
                {SOON_LABEL}
              </span>
            )}
          </TabsTab>
        ))}
      </TabsList>
      {areas.map((area) => (
        <TabsPanel key={area.id} value={area.id} keepMounted className="pt-4 outline-none">
          <div
            ref={area.id === active.id ? panel : undefined}
            tabIndex={-1}
            className="outline-none"
          >
            {(area.id === active.id || visited.has(area.id)) && body(area)}
          </div>
        </TabsPanel>
      ))}
    </TabsRoot>
  )
}
