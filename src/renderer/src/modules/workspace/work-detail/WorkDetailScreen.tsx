import { useState, type JSX } from 'react'
import { AltArrowLeftIcon } from '@renderer/components/ui/reicon'

import type { WorkSummary } from '../../../../../shared/contracts/library'
import { TopBarTitle } from '../../../components/ui/TopBarActions'
import { Alert } from '../../../components/ui/Alert'
import { Breadcrumb } from '../../../components/ui/Breadcrumb'
import { Button } from '../../../components/ui/Button'
import { backupWork, savedMessage } from '../../library/public'
import { EditWorkDialog } from '../../library/public'
import { useWorkDetail } from './useWorkDetail'
import { WorkAreaHost } from './WorkAreaHost'
import { WorkHeader } from './WorkHeader'
import { workAreas } from './workAreas'
import { ExportDialog } from '../../export/public'

export interface WorkDetailScreenProps {
  workId: string
  areaId?: string
  onAreaChange?(areaId: string): void
  onBackToLibrary(): void
  onOpenChapter(workId: string, chapterId: string): void
  /** Nhận mọi thay đổi trên màn hình này để danh sách và thanh bên thư viện đồng bộ. */
  onWorkChanged(summary: WorkSummary): void
}

/**
 * Màn hình chi tiết tác phẩm: phần đầu thông tin và các khu vực chức năng.
 * Màn hình có key theo workId để luôn khởi tạo trạng thái mới khi chuyển tác phẩm.
 */
export function WorkDetailScreen({
  workId,
  areaId: controlledAreaId,
  onAreaChange,
  onBackToLibrary,
  onOpenChapter,
  onWorkChanged
}: WorkDetailScreenProps): JSX.Element {
  const detail = useWorkDetail(workId, onWorkChanged)
  const { work } = detail
  const [localAreaId, setLocalAreaId] = useState(workAreas[0].id)
  const areaId = controlledAreaId ?? localAreaId
  const [editing, setEditing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // Các chương được chọn trong danh sách khi mở hộp thoại xuất từ danh sách
  const [exportSelection, setExportSelection] = useState<ReadonlySet<string> | undefined>()
  const [addChapterSignal, setAddChapterSignal] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)

  if (detail.load === 'loading') {
    return (
      <p role="status" className="px-6 pt-8 text-body-sm text-subtle">
        Đang mở tác phẩm…
      </p>
    )
  }

  if (detail.load === 'failed' || !work) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col gap-3 px-6 pt-12">
        <h2 className="text-body-lg font-semibold tracking-heading">Không mở được tác phẩm</h2>
        <p role="alert" className="text-body-sm leading-normal text-subtle">
          {detail.loadError}
        </p>
        <div className="flex gap-2">
          <Button variant="solid" onClick={onBackToLibrary}>
            <AltArrowLeftIcon size={14} />
            Về thư viện
          </Button>
          <Button variant="light" onClick={() => void detail.reload()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  async function continueWork(): Promise<void> {
    const chapter = work?.lastChapter
    if (!chapter) return
    const result = await window.mira.chapters.open(workId, chapter.id)
    if (result.ok) {
      detail.applyWork(result.value.work)
      onOpenChapter(workId, chapter.id)
    } else {
      detail.reportNotice('Không mở được chương: ' + result.error.message)
    }
  }

  async function backUp(): Promise<void> {
    const outcome = await backupWork(workId)
    if (outcome.kind === 'saved') {
      detail.dismissNotice()
      setSaved(savedMessage(outcome.path))
    } else if (outcome.kind === 'failed') {
      setSaved(null)
      detail.reportNotice('Không sao lưu được: ' + outcome.message)
    }
  }

  return (
    <>
      <TopBarTitle onBack={onBackToLibrary} backLabel="Về thư viện" size="sm">
        <Breadcrumb
          items={[
            { label: 'Thư viện', onClick: onBackToLibrary, title: 'Về thư viện' },
            { label: work.title }
          ]}
        />
      </TopBarTitle>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
        {saved && (
          <Alert tone="success" onDismiss={() => setSaved(null)}>
            {saved}
          </Alert>
        )}
        {detail.notice && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-sm border border-error/40 bg-error/8 px-3.5 py-2.5 text-body-xs"
          >
            <span>{detail.notice}</span>
            <Button variant="ghost" onClick={detail.dismissNotice}>
              Đóng
            </Button>
          </div>
        )}

        <WorkHeader
          work={work}
          actions={{
            onContinue: () => void continueWork(),
            onAddChapter: () => setAddChapterSignal((signal) => signal + 1),
            onEdit: () => setEditing(true),
            onSetPaused: (paused) => void detail.setPaused(paused),
            onSetArchived: (archived) => void detail.setArchived(archived),
            onSetCover: (file) => void detail.setCover(file),
            onBackup: () => void backUp(),
            onExport: () => {
              setExportSelection(undefined)
              setExportOpen(true)
            }
          }}
        />

        <WorkAreaHost
          areas={workAreas}
          selectedId={areaId}
          onSelect={(selected) => {
            setLocalAreaId(selected)
            onAreaChange?.(selected)
          }}
          areaProps={{
            workId,
            onWork: detail.applyWork,
            onOpenChapter: (chapterId) => onOpenChapter(workId, chapterId),
            addChapterSignal,
            workTitle: work.title,
            chapterCount: work.chapterCount,
            onExportChapters: (ids) => {
              setExportSelection(ids)
              setExportOpen(true)
            }
          }}
        />

        <EditWorkDialog
          work={work}
          open={editing}
          onClose={() => setEditing(false)}
          onSave={(patch) => detail.update(patch)}
        />

        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          workId={workId}
          workTitle={work.title}
          selectedIds={exportSelection}
        />
      </div>
    </>
  )
}
