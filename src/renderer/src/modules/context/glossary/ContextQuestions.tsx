import { useEffect, useState, type JSX } from 'react'
import type { AgentQuestion } from '../../../../../shared/contracts/agent'
import {
  WORK_CONVENTION_LABELS,
  WORK_CONVENTIONS,
  type ContextQuestionView,
  type WorkConventionKey,
  type WorkConventions
} from '../../../../../shared/contracts/contextQuestions'
import { Alert } from '../../../components/ui/Alert'
import { ConfirmDialog, type ConfirmRequest } from '../../../components/ui/ConfirmDialog'
import { Disclosure } from '../../../components/ui/Disclosure'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Select } from '../../../components/ui/Select'
import { QuestionForm } from '@renderer/modules/agent/public'

/** A context question as the shared question card shows it: one choice, the default picked already. */
export function asAgentQuestion(
  question: ContextQuestionView,
  chapterNumber: (chapterId: string | null) => number | undefined
): AgentQuestion {
  const quotes = question.evidence.map((quote) => {
    const n = chapterNumber(quote.chapterId)
    return `${n !== undefined ? `C.${n}: ` : ''}“${quote.quote}”`
  })
  return {
    id: question.id,
    title: `${question.entrySource} — ${question.title}`,
    ...(quotes.length > 0 ? { description: quotes.join('\n') } : {}),
    type: 'single',
    options: question.options,
    default: question.default
  }
}

/**
 * The "Cần xem" list: every open question with its default already in effect; answering applies it at
 * once. Choosing to translate chapters again asks for a confirmation first.
 */
export function ContextQuestionsView({
  questions,
  chapterNumber,
  onAnswer
}: {
  questions: ContextQuestionView[]
  chapterNumber: (chapterId: string | null) => number | undefined
  onAnswer(question: ContextQuestionView, label: string): Promise<boolean>
}): JSX.Element {
  if (questions.length === 0) {
    return (
      <EmptyState title="Không có gì cần xem">
        Mira đã áp mặc định cho mọi chỗ chưa chắc; câu hỏi mới sẽ hiện ở đây.
      </EmptyState>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {questions.map((question) => (
        <li key={question.id}>
          <QuestionForm
            label={`Câu hỏi về ${question.entrySource}`}
            questions={[asAgentQuestion(question, chapterNumber)]}
            onAnswer={(answers) => onAnswer(question, String(answers[question.id] ?? ''))}
          />
        </li>
      ))}
    </ul>
  )
}

export function useContextQuestions(workId: string, onChanged: () => void) {
  const [questions, setQuestions] = useState<ContextQuestionView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const reload = async (): Promise<void> => {
    const res = await window.mira.glossary.questions(workId)
    if (res.ok) setQuestions(res.value)
    else setError(res.error.message)
  }
  useEffect(() => {
    void reload()
    // biome-ignore lint/correctness/useExhaustiveDependencies: reload reads the latest workId.
  }, [workId])

  const answer = async (question: ContextQuestionView, label: string): Promise<boolean> => {
    const res = await window.mira.glossary.answerQuestion({
      workId,
      questionId: question.id,
      label
    })
    if (!res.ok) {
      setError(res.error.message)
      await reload()
      return false
    }
    const chapterIds = res.value.retranslateChapterIds
    if (chapterIds && chapterIds.length > 0) {
      setConfirm({
        title: 'Dịch lại các chương này?',
        description: `Bản dịch hiện có của ${chapterIds.length} chương sẽ bị ghi đè theo từ điển hiện tại.`,
        confirmLabel: 'Dịch lại',
        onConfirm: () => {
          void window.mira.agent.tasks
            .create({
              clientCommandId: crypto.randomUUID(),
              workId,
              chapterIds,
              contextStrategy: 'approved_only'
            })
            .then((created) => {
              if (!created.ok) setError(created.error.message)
            })
        }
      })
    }
    await reload()
    onChanged()
    return true
  }
  return { questions, error, setError, answer, confirm, setConfirm, reload }
}

/** The work's three conventions, each with whether someone chose it or the default is in use. */
export function WorkConventionsPanel({ workId }: { workId: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [conventions, setConventions] = useState<WorkConventions | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    window.mira.glossary.conventions(workId).then((res) => {
      if (active && res.ok) setConventions(res.value)
    })
    return () => {
      active = false
    }
  }, [workId])
  const set = async (key: WorkConventionKey, value: string): Promise<void> => {
    const res = await window.mira.glossary.setConvention({ workId, key, value })
    if (!res.ok) {
      setNote(res.error.message)
      return
    }
    setConventions(res.value.conventions)
    setNote(
      key === 'ja_romanization'
        ? `Đã phiên lại ${res.value.renamed} tên; giữ nguyên ${res.value.skipped} tên đã sửa tay hoặc viết khác.`
        : null
    )
  }
  return (
    <Disclosure label="Quy ước của tác phẩm" open={open} onOpenChange={setOpen}>
      {conventions && (
        <div className="flex flex-col gap-2 py-2 text-body-xs">
          {(Object.keys(WORK_CONVENTIONS) as WorkConventionKey[]).map((key) => {
            const labels = WORK_CONVENTION_LABELS[key] as {
              title: string
              values: Record<string, string>
            }
            return (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <span className="w-56 text-default">{labels.title}</span>
                <Select
                  label={labels.title}
                  value={conventions[key].value as string}
                  options={WORK_CONVENTIONS[key].map((value) => ({
                    value,
                    label: labels.values[value]!
                  }))}
                  onChange={(value) => void set(key, value)}
                />
                <span className="text-subtle">
                  {conventions[key].settled ? 'Đã chốt' : 'Đang dùng mặc định'}
                </span>
              </div>
            )
          })}
          {note && <span className="text-subtle">{note}</span>}
        </div>
      )}
    </Disclosure>
  )
}

export function QuestionsConfirm({
  confirm,
  onClose,
  error,
  onDismissError
}: {
  confirm: ConfirmRequest | null
  onClose(): void
  error: string | null
  onDismissError(): void
}): JSX.Element {
  return (
    <>
      {error && (
        <Alert tone="error" onDismiss={onDismissError}>
          {error}
        </Alert>
      )}
      <ConfirmDialog request={confirm} onClose={onClose} />
    </>
  )
}
