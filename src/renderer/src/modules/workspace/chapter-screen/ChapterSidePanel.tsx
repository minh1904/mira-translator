import type { JSX, ReactNode } from 'react'
import type { ChapterPanelId } from '../store/workspaceStore'
import { ChecksPanelMock, ContextPanelMock, JobsPanelMock, SearchPanelMock } from './SidePanelMocks'

export interface ChapterSidePanelProps {
  panel: ChapterPanelId
  /** Danh sách chương thật (`ChapterNavSidebar`), do app lắp vì cần điều hướng cấp app. */
  chapters: ReactNode
  /** Mở khu Ngữ cảnh của tác phẩm ở chế độ duyệt. */
  onOpenContextReview?(): void
}

/** Nội dung sidebar màn dịch chương theo mục đang chọn trên activity bar. */
export function ChapterSidePanel({
  panel,
  chapters,
  onOpenContextReview
}: ChapterSidePanelProps): JSX.Element {
  switch (panel) {
    case 'search':
      return <SearchPanelMock />
    case 'context':
      return <ContextPanelMock onOpenReview={onOpenContextReview} />
    case 'checks':
      return <ChecksPanelMock />
    case 'jobs':
      return <JobsPanelMock />
    default:
      return <>{chapters}</>
  }
}
