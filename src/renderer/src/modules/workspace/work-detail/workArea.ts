import type { ReactNode } from 'react'
import type { WorkSummary } from '../../../../../shared/contracts/library'

/** Dữ liệu truyền từ khung màn hình vào từng khu vực của màn hình chi tiết tác phẩm. */
export interface WorkAreaProps {
  /** Định danh tác phẩm của khu vực hiện tại. */
  workId: string
  /** Gọi khi có thay đổi tác phẩm để cập nhật lại phần đầu trang. */
  onWork(summary: WorkSummary): void
  /** Mở chương trong trình biên tập. */
  onOpenChapter(chapterId: string): void
  /** Tăng giá trị mỗi khi phần đầu trang yêu cầu khu vực chương bắt đầu thêm chương mới. */
  addChapterSignal: number
  /** Mở hộp thoại xuất cho các chương được chọn. */
  onExportChapters(ids: ReadonlySet<string>): void
  /** Tên và số chương của tác phẩm, cho khu cần nói tên tác phẩm trong câu lệnh điền sẵn. */
  workTitle: string
  chapterCount: number
}

/**
 * Một khu vực trong màn hình chi tiết tác phẩm: Chương, Ngữ cảnh, Nguồn raw và Tác vụ.
 * Mỗi khu vực có thể là màn hình thực tế hoặc giao diện đánh dấu "Sắp có".
 */
export interface WorkArea {
  id: string
  label: string
  /** Đánh dấu khu vực đang ở dạng minh họa ("Sắp có"). */
  soon?: boolean
  /** Dấu nhỏ cạnh nhãn tab (đang chạy, số việc cần xử lý); trả về null khi không có gì để báo. */
  Badge?: (props: { workId: string }) => ReactNode
  render(props: WorkAreaProps): ReactNode
}
