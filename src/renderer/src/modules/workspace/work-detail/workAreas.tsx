import { ActivityTabBadge } from '@renderer/modules/agent/public'
import { ChaptersArea } from './ChaptersArea'
import { ContextAreaMock } from './ContextAreaMock'
import { JobsArea } from './JobsArea'
import { MOCK_FEATURES } from '../../../lib/mockFeatures'
import { SourcesArea } from './SourcesArea'
import type { WorkArea } from './workArea'

/**
 * Các khu vực trong màn hình chi tiết tác phẩm theo thứ tự hiển thị:
 * Chương, Ngữ cảnh, Bản raw và Tác vụ dịch AI.
 */
export const chaptersArea: WorkArea = {
  id: 'chapters',
  label: 'Chương',
  render: (props) => <ChaptersArea {...props} />
}

export const contextArea: WorkArea = {
  id: MOCK_FEATURES.contextArea.id,
  label: MOCK_FEATURES.contextArea.label,
  render: (props) => <ContextAreaMock workId={props.workId} />
}

export const sourcesArea: WorkArea = {
  id: MOCK_FEATURES.sourcesArea.id,
  label: 'Bản raw',
  render: (props) => <SourcesArea workId={props.workId} onWork={props.onWork} />
}

export const jobsArea: WorkArea = {
  id: 'jobs-area',
  label: 'Hoạt động',
  Badge: ActivityTabBadge,
  render: (props) => (
    <JobsArea
      workId={props.workId}
      workTitle={props.workTitle}
      chapterCount={props.chapterCount}
      onOpenChapter={props.onOpenChapter}
    />
  )
}

export const workAreas: ReadonlyArray<WorkArea> = [chaptersArea, contextArea, sourcesArea, jobsArea]
