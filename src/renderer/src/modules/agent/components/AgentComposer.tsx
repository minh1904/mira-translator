import { useRef, useState, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react'
import type { AgentAttachment, ResolvedTarget } from '../../../../../shared/contracts/agent'
import { ArrowUpIcon, StopCircleIcon } from '@renderer/components/ui/reicon'
import { Button } from '../../../components/ui/Button'
import { CompactButton } from '../../../components/ui/CompactButton'
import { focusWithinRing } from '../../../components/ui/focus'
import { cn } from '../../../lib/cn'
import { Textarea } from '../../../components/ui/Textarea'
import {
  ModelSelectionMenu,
  openModelList,
  useModelPicker,
  type ModelPicker
} from '../../ai-connections/public'
import { NEW_CHAT, useAgentStore } from '../store/agentStore'
import { AddContextPicker } from './AddContextPicker'
import { commandHistory, historyStep } from './commandHistory'
import { attachmentKey, composeContext, pinnedSelection } from './composeContext'
import { ContextChipRow } from './ContextChipRow'
import { PermissionLevelMenu } from './PermissionLevelMenu'

const NO_ATTACHMENTS: AgentAttachment[] = []

/** Placeholder của ô nhập theo chế độ (C7). */
export const COMPOSER_PLACEHOLDERS = {
  ask: 'Hỏi về truyện, chương hoặc bản dịch',
  agent: 'Mô tả việc cần làm'
} as const

/** Model của Trợ lý: chọn một lần trên ô soạn, dùng cho mọi phiên và cả khi trả lời câu hỏi đang chờ. */
export function useAgentModel(): ModelPicker {
  return useModelPicker(
    useAgentStore((s) => s.model),
    useAgentStore((s) => s.setModel)
  )
}

interface Recall {
  key: string
  index: number
  /** The draft to give back after the newest command. */
  saved: { text: string; attachments: AgentAttachment[] }
}

/**
 * Ô soạn của Trợ lý theo VS Code (C1–C8): hàng chip ngữ cảnh phía trên chỗ gõ, thanh dưới gồm + · chế
 * độ · model · Gửi/Dừng, mức quyền ở thanh phụ bên dưới khung. Draft và chip theo phiên (đổi bề mặt
 * không mất); Enter gửi, Shift+Enter xuống dòng, Lên/Xuống ở đầu/cuối ô duyệt các lệnh đã gửi.
 */
export function AgentComposer({
  placeholder,
  onOpenTarget
}: {
  placeholder?: string
  onOpenTarget?: (target: ResolvedTarget) => void
}): JSX.Element {
  const adapter = useAgentStore((s) => s.adapter)
  const draftKey = useAgentStore((s) => s.activeSessionId ?? NEW_CHAT)
  const draft = useAgentStore((s) => s.drafts[s.activeSessionId ?? NEW_CHAT] ?? '')
  const implicitAdded = useAgentStore(
    (s) => s.composer[s.activeSessionId ?? NEW_CHAT]?.implicitAdded ?? null
  )
  const attachments = useAgentStore(
    (s) => s.composer[s.activeSessionId ?? NEW_CHAT]?.attachments ?? NO_ATTACHMENTS
  )
  const turns = useAgentStore((s) => s.turns)
  const setDraft = useAgentStore((s) => s.setDraft)
  const setImplicitAdded = useAgentStore((s) => s.setImplicitAdded)
  const addAttachment = useAgentStore((s) => s.addAttachment)
  const removeAttachment = useAgentStore((s) => s.removeAttachment)
  const setAttachments = useAgentStore((s) => s.setAttachments)
  const send = useAgentStore((s) => s.send)
  const cancel = useAgentStore((s) => s.cancel)
  const busy = useAgentStore((s) => s.isStreaming)
  const mode = useAgentStore((s) => s.mode)
  const setMode = useAgentStore((s) => s.setMode)
  const model = useAgentModel()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [recall, setRecall] = useState<Recall | null>(null)
  const ready = draft.trim() !== '' && model.selection !== null

  // Chips follow the workspace as it moves; what the user added belongs to the draft being written.
  useSyncExternalStore(adapter.subscribeContext, adapter.contextSnapshot, adapter.contextSnapshot)
  const active = adapter.captureContext()
  const labels = adapter.contextLabels()
  const { chips, context } = composeContext({ active, labels, mode, implicitAdded, attachments })
  const taken = new Set(attachments.map(attachmentKey))

  const focusInput = (): void => textarea.current?.focus()

  const submit = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy || !model.selection) return
    const sent = await send(text, { context, modelSelection: model.selection, mode })
    if (sent) setRecall(null)
  }

  /** Shows the previous or next instruction with its chips; false when there is nowhere to go. */
  const browse = (direction: 'up' | 'down'): boolean => {
    const history = commandHistory(turns)
    const current = recall?.key === draftKey ? recall : null
    if (direction === 'down' && current === null) return false
    const next = historyStep(history.length, current?.index ?? null, direction)
    if (next === null) {
      if (!current) return false
      setDraft(current.saved.text)
      setAttachments(current.saved.attachments)
      setRecall(null)
      return true
    }
    const command = history[next]!
    setDraft(command.text)
    setAttachments(command.attachments)
    setRecall({ key: draftKey, index: next, saved: current?.saved ?? { text: draft, attachments } })
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return
    const field = event.currentTarget
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    } else if (
      event.key === 'ArrowUp' &&
      field.selectionStart === 0 &&
      field.selectionEnd === 0 &&
      browse('up')
    ) {
      event.preventDefault()
    } else if (
      event.key === 'ArrowDown' &&
      field.selectionStart === field.value.length &&
      browse('down')
    ) {
      event.preventDefault()
    }
  }

  const onFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault()
      setPickerOpen((open) => !open)
    }
  }

  const pinSelection = (): void => {
    const pinned = pinnedSelection(active, labels)
    if (pinned) addAttachment(pinned)
  }

  return (
    <div className="flex min-w-0 flex-col">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Ctrl+/ mở picker từ mọi control trong khung. */}
      <div
        onKeyDown={onFrameKeyDown}
        className={cn(
          'flex flex-col rounded-sm border border-default bg-surface p-1.5 shadow-xs transition-shadow duration-150',
          focusWithinRing
        )}
      >
        <ContextChipRow
          chips={chips}
          onAddSuggested={() => {
            setImplicitAdded(true)
            focusInput()
          }}
          onRemoveSuggested={() => setImplicitAdded(false)}
          onPinSelection={pinSelection}
          onRemove={(key) => {
            removeAttachment(key)
            focusInput()
          }}
          onOpenTarget={onOpenTarget}
        />
        <Textarea
          ref={textarea}
          aria-label="Câu hỏi hoặc yêu cầu cho Trợ lý"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (recall) setRecall(null)
          }}
          onKeyDown={onKeyDown}
          rows={2}
          className="min-h-[38px] max-h-[160px] resize-none border-0 bg-transparent px-1.5 py-1 text-body-sm leading-normal text-default hover:bg-transparent focus-visible:outline-none placeholder:text-muted"
          placeholder={placeholder ?? COMPOSER_PLACEHOLDERS[mode]}
        />
        {(model.loadError ?? model.modelNotice) && (
          <p role="alert" className="m-0 px-1 py-0.5 text-body-xs text-error">
            {model.loadError
              ? `Không đọc được danh sách kết nối: ${model.loadError}`
              : model.modelNotice}
          </p>
        )}
        {/* Thứ tự VS Code: + · chế độ · model · Gửi; model co lại trước để Gửi luôn hiện. */}
        <div className="mt-1 flex h-[22px] min-w-0 items-center gap-1.5 overflow-hidden">
          <AddContextPicker
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open)
              if (!open) focusInput()
            }}
            workId={active.workId}
            taken={taken}
            count={attachments.length}
            onPick={(attachment) => {
              addAttachment(attachment)
              focusInput()
            }}
          />
          <Button
            variant="ghost"
            onClick={() => setMode(mode === 'agent' ? 'ask' : 'agent')}
            title={
              mode === 'agent'
                ? 'Chế độ Agent (Đọc và chỉnh sửa) – Bấm để chuyển sang Hỏi đáp'
                : 'Chế độ Ask (Chỉ hỏi đáp) – Bấm để chuyển sang Agent'
            }
            className="h-[20px] shrink-0 px-1.5 text-label-xs font-medium text-subtle hover:text-default"
          >
            {mode === 'agent' ? 'Agent' : 'Ask'}
          </Button>
          <ModelSelectionMenu
            label="Model của Trợ lý"
            className="!h-[20px] !gap-1 !px-1.5 !py-0 min-w-0 max-w-36 shrink truncate"
            connections={model.usable}
            selected={model.selection}
            onSelect={model.selectModel}
            onSelectThinking={(selection, choice) => void model.setThinking(selection, choice)}
            onOpen={model.refreshConnections}
            overridesMain={model.overridesMain}
            onUseDefault={model.useDefaultModel}
            onRefresh={model.refreshModels}
            refreshing={model.refreshing}
            suggestions={model.suggestions}
            onAddCustom={model.addCustomModel}
            onOpenSettings={openModelList}
          />
          <span className="flex-1" />
          {busy ? (
            <CompactButton
              variant="outline"
              tone="danger"
              round
              aria-label="Dừng lượt đang chạy"
              icon={<StopCircleIcon size={12} />}
              onClick={() => void cancel()}
              className="!size-[22px] !min-h-[22px] !min-w-[22px] shrink-0 p-0"
            />
          ) : (
            <CompactButton
              variant="dark"
              round
              aria-label="Gửi"
              title={ready ? 'Gửi (Enter)' : 'Cần câu hỏi và một model'}
              disabled={!ready}
              icon={<ArrowUpIcon size={12} />}
              onClick={() => void submit()}
              className="!size-[22px] !min-h-[22px] !min-w-[22px] shrink-0 p-0"
            />
          )}
        </div>
      </div>
      <div className="flex items-center px-0.5 pt-0.5">
        <PermissionLevelMenu />
      </div>
    </div>
  )
}
