import { useState, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react'
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
import { contextChips, withoutChips, type ChipKey } from './contextChips'

/** Model của Trợ lý: chọn một lần trên ô soạn, dùng cho mọi phiên và cả khi trả lời câu hỏi đang chờ. */
export function useAgentModel(): ModelPicker {
  return useModelPicker(
    useAgentStore((s) => s.model),
    useAgentStore((s) => s.setModel)
  )
}

/**
 * Ô soạn của Trợ lý: draft theo phiên (đổi bề mặt không mất chữ), chọn model và mức suy luận, chip ngữ
 * cảnh bỏ được trước khi gửi, Enter gửi và Shift+Enter xuống dòng. Khi lượt đang chạy, nút gửi thành nút
 * Dừng.
 */
export function AgentComposer({ placeholder }: { placeholder?: string }): JSX.Element {
  const adapter = useAgentStore((s) => s.adapter)
  const draftKey = useAgentStore((s) => s.activeSessionId ?? NEW_CHAT)
  const draft = useAgentStore((s) => s.drafts[s.activeSessionId ?? NEW_CHAT] ?? '')
  const setDraft = useAgentStore((s) => s.setDraft)
  const send = useAgentStore((s) => s.send)
  const cancel = useAgentStore((s) => s.cancel)
  const busy = useAgentStore((s) => s.isStreaming)
  const waiting = useAgentStore((s) => s.pending.length > 0)
  const mode = useAgentStore((s) => s.mode)
  const setMode = useAgentStore((s) => s.setMode)
  const permissionLevel = useAgentStore((s) => s.permissionLevel)
  const model = useAgentModel()
  const ready = draft.trim() !== '' && model.selection !== null
  // Chips follow the workspace as it moves; removals belong to the draft being written.
  useSyncExternalStore(adapter.subscribeContext, adapter.contextSnapshot, adapter.contextSnapshot)
  const [removed, setRemoved] = useState<{ key: string; chips: Set<ChipKey> }>({
    key: draftKey,
    chips: new Set()
  })
  const removedChips = removed.key === draftKey ? removed.chips : new Set<ChipKey>()
  const context = adapter.captureContext()
  const chips = contextChips(withoutChips(context, removedChips), adapter.contextLabels())

  const submit = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy || !model.selection) return
    const sent = await send(text, {
      context: withoutChips(context, removedChips),
      modelSelection: model.selection,
      mode,
      permissionLevel
    })
    if (sent) setRemoved({ key: draftKey, chips: new Set() })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-input bg-surface p-1.5 shadow-xs transition-shadow duration-150',
        focusWithinRing
      )}
    >
      <ul aria-label="Ngữ cảnh gửi kèm" className="hidden">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Button
              variant="ghost"
              aria-label={`Bỏ ngữ cảnh ${chip.label}`}
              onClick={() =>
                setRemoved({ key: draftKey, chips: new Set([...removedChips, chip.key]) })
              }
            >
              {chip.label}
            </Button>
          </li>
        ))}
      </ul>
      <Textarea
        aria-label="Câu hỏi hoặc yêu cầu cho Trợ lý"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        className="min-h-[38px] max-h-[160px] resize-none border-0 bg-transparent px-1.5 py-1 text-body-sm leading-normal text-default hover:bg-transparent focus-visible:outline-none placeholder:text-muted"
        placeholder={
          placeholder ??
          (waiting ? 'Trả lời câu hỏi ở trên, hoặc gửi yêu cầu mới…' : 'Hỏi, nhờ dịch hoặc sửa…')
        }
      />
      {(model.loadError ?? model.modelNotice) && (
        <p role="alert" className="m-0 px-1 py-0.5 text-body-xs text-error">
          {model.loadError
            ? `Không đọc được danh sách kết nối: ${model.loadError}`
            : model.modelNotice}
        </p>
      )}
      <div className="mt-1 flex h-[22px] items-center gap-1.5 overflow-hidden">
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
          className="!h-[20px] !gap-1 !px-1.5 !py-0 max-w-36 shrink truncate"
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
  )
}
