import { useState, type JSX } from 'react'
import type { AgentTaskSummary } from '../../../../../shared/contracts/agentTask'
import type { QaFinding, TaskQualityView } from '../../../../../shared/contracts/taskQuality'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Field } from '../../../components/ui/Field'
import { Input } from '../../../components/ui/Input'
import { useTaskStore } from '../store/taskStore'
import { QA_RULE_LABELS, type TaskActions } from './taskView'

function FindingRow({
  task,
  itemId,
  finding,
  onOpenSegment
}: {
  task: AgentTaskSummary
  itemId: string
  finding: QaFinding
  onOpenSegment: TaskActions['onOpenSegment']
}): JSX.Element {
  const dismiss = useTaskStore((s) => s.dismiss)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <li className="flex flex-col gap-2xs text-body-sm">
      <div className="flex flex-wrap items-center gap-xs">
        <Badge color="warning" variant="plain">
          Cảnh báo · {QA_RULE_LABELS[finding.ruleCode]}
        </Badge>
        <span className="min-w-0 flex-1">{finding.message}</span>
        {onOpenSegment && (
          <Button
            variant="ghost"
            onClick={() => onOpenSegment(task.workId, finding.chapterId, finding.paragraphIndex)}
          >
            Mở đoạn
          </Button>
        )}
        {!asking && (
          <Button variant="ghost" onClick={() => setAsking(true)}>
            Bỏ qua
          </Button>
        )}
      </div>
      <span className="text-body-xs text-muted">Bằng chứng: {finding.evidence}</span>
      {asking && (
        <form
          aria-label="Bỏ qua cảnh báo"
          className="flex flex-wrap items-end gap-xs"
          onSubmit={(event) => {
            event.preventDefault()
            void dismiss(task.id, itemId, finding, reason)
          }}
        >
          <Field label="Lý do (không bắt buộc)" className="min-w-0 flex-1">
            {({ id }) => (
              <Input id={id} value={reason} onChange={(event) => setReason(event.target.value)} />
            )}
          </Field>
          <Button type="submit">Xác nhận bỏ qua</Button>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Hủy
          </Button>
        </form>
      )}
    </li>
  )
}

/** How the "Cảnh báo" tab is titled: the count of open warnings, when there are any. */
export const warningsTabLabel = (quality: TaskQualityView | undefined): string =>
  quality && quality.openCount > 0 ? `Cảnh báo (${quality.openCount})` : 'Cảnh báo'

/**
 * Quality warnings of a task (change `add-translation-task-qa`): only warnings, counted, never a score or
 * "100% correct". Chapters with nothing to check are one line, not one line each.
 */
export function QualityPanel({
  task,
  quality,
  onOpenSegment
}: {
  task: AgentTaskSummary
  quality: TaskQualityView
  onOpenSegment: TaskActions['onOpenSegment']
}): JSX.Element {
  const checked = quality.items.filter((item) => item.status === 'checked')
  const unchecked = quality.items.filter((item) => item.status === 'na').length
  return (
    <section aria-label="Cảnh báo chất lượng" className="flex flex-col gap-xs">
      <h4 className="m-0 text-label-sm">
        {quality.openCount > 0
          ? `Cảnh báo chất lượng: ${quality.openCount} đang mở`
          : checked.length > 0
            ? 'Không có cảnh báo đang mở'
            : 'Chưa có chương nào để kiểm'}
      </h4>
      {quality.items.map((item) =>
        item.status === 'checked' && item.findings.length > 0 ? (
          <div key={item.itemId} className="flex flex-col gap-2xs">
            <span className="text-body-xs text-muted">{item.chapterLabel}</span>
            <ul className="m-0 flex list-none flex-col gap-xs p-0">
              {item.findings.map((finding) => (
                <FindingRow
                  key={finding.ruleCode + finding.segmentId}
                  task={task}
                  itemId={item.itemId}
                  finding={finding}
                  onOpenSegment={onOpenSegment}
                />
              ))}
            </ul>
          </div>
        ) : null
      )}
      {unchecked > 0 && (
        <p className="m-0 text-body-xs text-muted">{unchecked} chương chưa dịch nên chưa kiểm</p>
      )}
    </section>
  )
}
