import { useState, type JSX, type ReactNode } from 'react'
import {
  AltArrowRightIcon,
  CheckIcon,
  CloseCircleIcon,
  CpuIcon,
  DangerCircleIcon
} from '@renderer/components/ui/reicon'
import type { AgentToolCallView } from '../../../../../shared/contracts/agent'
import { Button } from '../../../components/ui/Button'
import { ICON } from '../../../components/ui/icon'
import { Spinner } from '../../../components/ui/Spinner'
import { cn } from '../../../lib/cn'
import { RUN_SUBAGENT_TOOL } from './toolNames'

/** Tên trạng thái cho trình đọc màn hình; icon không phải dấu hiệu duy nhất. */
export const TOOL_STATE_LABEL: Record<AgentToolCallView['state'], string> = {
  waiting_user: 'đang chờ bạn',
  running: 'đang chạy',
  completed: 'xong',
  failed: 'lỗi',
  cancelled: 'đã dừng',
  skipped: 'bị bỏ qua'
}

/** "Đang …" while it waits or runs, "Đã …" once it completed, like VS Code's tool messages. */
export function toolCallMessage(call: AgentToolCallView): string {
  return call.state === 'completed' ? call.pastTenseMessage : call.invocationMessage
}

export function formatWorkTime(ms: number | null): string | null {
  if (ms === null || ms < 0) return null
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`
}

function StateIcon({ state }: { state: AgentToolCallView['state'] }): JSX.Element {
  if (state === 'running' || state === 'waiting_user') return <Spinner size={ICON['2xs']} />
  if (state === 'completed') {
    return <CheckIcon size={ICON['2xs']} className="text-success-emphasis" aria-hidden="true" />
  }
  if (state === 'failed') {
    return <DangerCircleIcon size={ICON['2xs']} className="text-error" aria-hidden="true" />
  }
  return <CloseCircleIcon size={ICON['2xs']} className="text-muted" aria-hidden="true" />
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label-xs text-muted">{title}</span>
      <pre className="selectable m-0 max-h-48 overflow-auto rounded-xs bg-muted/40 p-1.5 font-mono text-body-xs whitespace-pre-wrap wrap-anywhere">
        {children}
      </pre>
    </div>
  )
}

const json = (value: unknown): string => JSON.stringify(value, null, 2) ?? ''

export interface ToolCallRowProps {
  call: AgentToolCallView
  /** The stored result, once read; `undefined` until then. */
  detail: unknown
  onOpen(callId: string): void
  /** Calls a subagent made, drawn inside its row. */
  subagentCalls?: AgentToolCallView[]
  details?: Readonly<Record<string, unknown>>
}

/**
 * Một lời gọi tool trong câu trả lời: icon trạng thái, câu "Đang …"/"Đã …"; bấm để xem Đầu vào và Kết
 * quả (kết quả chỉ được đọc khi mở lần đầu). Lời gọi `run_subagent` mở ra thấy các tool con.
 */
export function ToolCallRow({
  call,
  detail,
  onOpen,
  subagentCalls,
  details
}: ToolCallRowProps): JSX.Element {
  const subagent = call.name === RUN_SUBAGENT_TOOL
  const active = call.state === 'running' || call.state === 'waiting_user'
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  // A subagent shows its calls while it works and folds once it is done.
  const open = userOpen ?? (subagent && active)
  const toggle = (): void => {
    if (!open && !subagent) onOpen(call.id)
    setUserOpen(!open)
  }
  const workTime = subagent ? formatWorkTime(call.durationMs) : null

  return (
    <div
      className="flex flex-col text-body-xs"
      data-tool-call={call.id}
      data-tool-state={call.state}
    >
      <Button
        variant="ghost"
        aria-expanded={open}
        onClick={toggle}
        className="h-auto min-h-5 w-full justify-start gap-1.5 px-1 py-0.5 text-left font-normal text-subtle hover:text-default"
      >
        <span className="flex size-3 shrink-0 items-center justify-center">
          <StateIcon state={call.state} />
        </span>
        {subagent && (
          <CpuIcon size={ICON['2xs']} className="shrink-0 text-muted" aria-hidden="true" />
        )}
        <span className={cn('min-w-0 flex-1 truncate', active && 'text-default')}>
          {toolCallMessage(call)}
          {workTime && <span className="text-muted"> · Làm trong {workTime}</span>}
          {call.summary && !subagent && <span className="text-muted"> · {call.summary}</span>}
        </span>
        <span className="sr-only">({TOOL_STATE_LABEL[call.state]})</span>
        <AltArrowRightIcon
          size={ICON['2xs']}
          aria-hidden="true"
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')}
        />
      </Button>
      {call.reason && (call.state === 'failed' || call.state === 'skipped') && (
        <p className="m-0 ml-5 text-body-xs text-error">{call.reason}</p>
      )}
      {open &&
        (subagent ? (
          <div className="mt-0.5 ml-2.5 flex flex-col border-l border-default pl-2">
            {(subagentCalls ?? []).length === 0 && (
              <span className="px-1 text-muted">
                {active ? 'Đang làm…' : 'Không gọi công cụ nào.'}
              </span>
            )}
            {(subagentCalls ?? []).map((child) => (
              <ToolCallRow
                key={child.id}
                call={child}
                detail={details?.[child.id]}
                onOpen={onOpen}
              />
            ))}
          </div>
        ) : (
          <div className="mt-0.5 ml-5 flex flex-col gap-1">
            <Section title="Đầu vào">{json(call.args)}</Section>
            <Section title="Kết quả">{detail === undefined ? 'Đang tải…' : json(detail)}</Section>
          </div>
        ))}
    </div>
  )
}
