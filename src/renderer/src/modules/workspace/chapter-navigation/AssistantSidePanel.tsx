import { useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { ResolvedTarget } from '../../../../../shared/contracts/agent'
import { Drawer } from '../../../components/ui/Drawer'
import { AgentPanel } from '@renderer/modules/agent/public'
import { useWorkspaceStore } from '../store/workspaceStore'

/** Cửa sổ hẹp hơn mức này thì panel thành drawer phủ từ bên phải (quyết định 7). */
const NARROW_QUERY = '(max-width: 960px)'

function subscribeNarrow(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

const isNarrow = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(NARROW_QUERY).matches

export function useNarrowWindow(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
}

/** Mở đích của một thao tác: chương thì vào chương, tác phẩm thì vào trang tác phẩm. */
function openTarget(target: ResolvedTarget): void {
  void useWorkspaceStore
    .getState()
    .navigate(
      target.kind === 'chapter'
        ? { name: 'chapter', workId: target.workId, chapterId: target.chapterId }
        : { name: 'work', workId: target.workId }
    )
}

/**
 * Shell của side panel màn chương: hiển thị gọn gàng Agent chat, không còn thanh tab thừa.
 */
export function AssistantSidePanel({ onClose }: { onClose(): void }): JSX.Element {
  return (
    <section aria-label="Bảng Trợ lý" className="flex h-full min-h-0 flex-col bg-subtle">
      <AgentPanel onOpenTarget={openTarget} onClose={onClose} />
    </section>
  )
}

/** Trên cửa sổ hẹp, cùng shell nằm trong drawer giữ focus; trên cửa sổ rộng nó dock cạnh màn. */
export function AssistantSideDrawer({
  open,
  onOpenChange,
  children
}: {
  open: boolean
  onOpenChange(open: boolean): void
  children: ReactNode
}): JSX.Element {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} label="Bảng Trợ lý">
      {children}
    </Drawer>
  )
}
