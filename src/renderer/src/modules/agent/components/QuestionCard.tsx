import { useState, type JSX, type KeyboardEvent } from 'react'
import type {
  AgentPendingAction,
  AgentQuestionAnswers
} from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { Input } from '../../../components/ui/Input'
import { ListOption } from '../../../components/ui/ListOption'
import { AltArrowDownIcon, AltArrowUpIcon, CheckIcon } from '../../../components/ui/reicon'
import { cn } from '../../../lib/cn'
import {
  compileAnswers,
  initialDraft,
  isComplete,
  needsAnswer,
  optionForKey,
  pickOption,
  typeAnswer
} from './questionState'

export interface QuestionCardProps {
  action: AgentPendingAction
  onAnswer(answers: AgentQuestionAnswers): Promise<boolean>
  onSkip(): Promise<boolean>
}

/**
 * Thẻ câu hỏi của Trợ lý phía trên ô nhập (C18), như thẻ câu hỏi của VS Code: từng câu một với bước
 * i/n, lựa chọn đánh số chọn bằng phím 1–9, đáp án mặc định chọn sẵn, ô nhập câu trả lời khác,
 * Trước/Tiếp và Gửi ở câu cuối (Ctrl+Enter), Bỏ qua tất cả, thu gọn được.
 */
export function QuestionCard({ action, onAnswer, onSkip }: QuestionCardProps): JSX.Element | null {
  const questions = action.questions ?? []
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(() => initialDraft(questions))
  const [collapsed, setCollapsed] = useState(false)
  const [sending, setSending] = useState(false)
  const question = questions[step]
  if (!question) return null
  const last = step === questions.length - 1
  const blocked = needsAnswer(question, draft)
  const complete = isComplete(questions, draft)
  const picks = draft.picks[question.id] ?? []

  const run = async (send: () => Promise<boolean>): Promise<void> => {
    setSending(true)
    try {
      await send()
    } finally {
      setSending(false)
    }
  }
  const submit = (): void => {
    if (complete && !sending) void run(() => onAnswer(compileAnswers(questions, draft)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      submit()
      return
    }
    // Digits pick an option unless the user is typing an answer.
    if (event.target instanceof HTMLInputElement || event.ctrlKey || event.altKey) return
    const option = optionForKey(question, event.key)
    if (option !== undefined) {
      event.preventDefault()
      setDraft(pickOption(draft, question, option))
    }
  }

  return (
    <section
      aria-label="Câu hỏi của Trợ lý"
      aria-keyshortcuts="Control+Enter"
      data-pending-call={action.toolCallId}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-1.5 rounded-sm border border-default bg-surface p-2 text-body-xs shadow-xs"
    >
      <header className="flex items-center gap-1.5">
        <span className="text-label-xs font-medium text-subtle">
          Câu hỏi {step + 1}/{questions.length}
        </span>
        <span className="flex-1" />
        {action.allowSkip !== false && (
          <Button
            variant="ghost"
            loading={sending}
            onClick={() => void run(onSkip)}
            className="h-6 px-2 text-label-xs"
          >
            Bỏ qua tất cả
          </Button>
        )}
        <Button
          variant="ghost"
          aria-label={collapsed ? 'Mở rộng câu hỏi' : 'Thu gọn câu hỏi'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="h-6 px-1"
        >
          {collapsed ? (
            <AltArrowDownIcon size={ICON.xs} aria-hidden="true" />
          ) : (
            <AltArrowUpIcon size={ICON.xs} aria-hidden="true" />
          )}
        </Button>
      </header>
      <p className="m-0 text-body-sm font-medium text-default">{question.title}</p>
      {!collapsed && (
        <>
          {question.description && <p className="m-0 text-muted">{question.description}</p>}
          {question.options && question.type !== 'text' && (
            <div
              role="listbox"
              aria-label={question.title}
              aria-multiselectable={question.type === 'multi'}
              className="flex flex-col"
            >
              {question.options.map((option, index) => {
                const chosen = picks.includes(option)
                return (
                  <ListOption
                    key={option}
                    selected={chosen}
                    onClick={() => setDraft(pickOption(draft, question, option))}
                  >
                    <span className="w-4 shrink-0 text-muted">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{option}</span>
                    {chosen && <CheckIcon size={ICON.xs} aria-hidden="true" />}
                  </ListOption>
                )
              })}
            </div>
          )}
          {(question.type === 'text' || question.allowFreeText) && (
            <Input
              aria-label={question.type === 'text' ? 'Nhập câu trả lời' : 'Nhập câu trả lời khác'}
              placeholder={question.type === 'text' ? 'Nhập câu trả lời' : 'Nhập câu trả lời khác'}
              value={draft.free[question.id] ?? ''}
              onChange={(event) => setDraft(typeAnswer(draft, question, event.target.value))}
            />
          )}
          <footer className="flex items-center gap-1.5">
            <span className={cn('flex-1 text-muted', !blocked && 'invisible')} role="status">
              {blocked ? 'Câu này cần trả lời' : ''}
            </span>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)} className="h-6 px-2.5">
                Trước
              </Button>
            )}
            {last ? (
              <Button
                variant="solid"
                loading={sending}
                disabled={!complete}
                title="Gửi (Ctrl+Enter)"
                onClick={submit}
                className="h-6 px-2.5"
              >
                Gửi
              </Button>
            ) : (
              <Button
                variant="solid"
                disabled={blocked}
                onClick={() => setStep(step + 1)}
                className="h-6 px-2.5"
              >
                Tiếp
              </Button>
            )}
          </footer>
        </>
      )}
    </section>
  )
}
