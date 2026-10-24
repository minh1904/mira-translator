import type { JSX } from 'react'
import { PageFrame } from '../../../components/ui/PageFrame'
import { useAiOverlayStore } from '../../../modules/ai-connections/public'
import { TaskList, useAgentStore } from '../../../modules/agent/public'
import { openGlossaryReview, useWorkspaceStore } from '../../../modules/workspace/public'

/**
 * Màn Hoạt động toàn ứng dụng: việc cần xử lý, việc đang chạy và việc gần đây của mọi tác phẩm, từ
 * tác vụ dịch bền (tạm dừng, tiếp tục, hủy, thử lại) đến lượt chat của Trợ lý. Bảng như trang pipelines; bấm tên một
 * tác vụ để mở trang chi tiết của nó. Cập nhật khi Main báo đổi, kể cả khi màn đang mở sẵn.
 */
export function JobsScreen({
  onOpenChapter
}: {
  onOpenChapter: (workId: string, chapterId: string) => void
}): JSX.Element {
  return (
    <PageFrame title="Hoạt động" width="full">
      <TaskList
        onOpenChapter={onOpenChapter}
        onReviewContext={(workId, view) => void openGlossaryReview(workId, view)}
        onOpenSegment={(workId, chapterId, paragraph) =>
          void useWorkspaceStore.getState().openParagraph(workId, chapterId, paragraph)
        }
        onOpenConnections={() => useAiOverlayStore.getState().openSettings()}
        onAskAssistant={(text) => {
          // The text waits in the composer after what is typed there; nothing is sent.
          useAgentStore.getState().appendDraft(text)
          void useWorkspaceStore.getState().navigate({ name: 'assistant' })
        }}
      />
    </PageFrame>
  )
}
