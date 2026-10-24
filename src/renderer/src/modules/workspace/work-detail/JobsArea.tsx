import type { JSX } from 'react'
import { TaskList, useAgentStore } from '@renderer/modules/agent/public'
import { useAiOverlayStore } from '@renderer/modules/ai-connections/public'
import { useWorkspaceStore } from '../store/workspaceStore'
import { openGlossaryReview } from './openGlossaryReview'
import type { WorkAreaProps } from './workArea'

/** The text waits in the Assistant's composer after what is typed there; nothing is sent. */
function askAssistant(text: string): void {
  useAgentStore.getState().appendDraft(text)
  void useWorkspaceStore.getState().navigate({ name: 'assistant' })
}

/** Khu Hoạt động của tác phẩm: các tác vụ dịch bền của riêng tác phẩm này, đọc từ Main. */
export function JobsArea({
  workId,
  workTitle,
  chapterCount,
  onOpenChapter
}: Pick<WorkAreaProps, 'workId' | 'workTitle' | 'chapterCount' | 'onOpenChapter'>): JSX.Element {
  return (
    <TaskList
      workId={workId}
      onOpenChapter={(_workId, chapterId) => onOpenChapter(chapterId)}
      onReviewContext={(id, view) => void openGlossaryReview(id, view)}
      onOpenSegment={(id, chapterId, paragraph) =>
        void useWorkspaceStore.getState().openParagraph(id, chapterId, paragraph)
      }
      onOpenConnections={() => useAiOverlayStore.getState().openSettings()}
      onAskAssistant={askAssistant}
      onStartTranslate={
        chapterCount > 0
          ? () => askAssistant(`Dịch chương 1 đến chương ${chapterCount} của "${workTitle}".`)
          : undefined
      }
    />
  )
}
