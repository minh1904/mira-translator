import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { ArrowUpIcon, StopCircleIcon } from '@renderer/components/ui/reicon'

import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'
import { ModelSelectionMenu } from '../../ai-connections/public'
import { openModelList } from '../../ai-connections/public'
import { openRequestIds } from './chatTurns'
import type { AiChatController } from './useAiChat'

/**
 * Khung nhập liệu cho trợ lý AI: nhập câu hỏi, chọn model, gửi câu hỏi hoặc dừng lượt phản hồi đang chạy.
 *
 * Model tự động đọc ngữ cảnh cần thiết qua công cụ và trả về đề xuất thay đổi để người dùng duyệt.
 */
export function AiComposer({ chat }: { chat: AiChatController }): JSX.Element {
  const [draft, setDraft] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)

  // Phím tắt Ctrl+Shift+M mở menu chọn model khi bảng trợ lý đang mở.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        setModelMenuOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tự động co giãn theo nội dung đến chiều cao tối đa, sau đó cuộn bên trong. Dùng useLayoutEffect để tránh giật khung hình khi gõ.
  useLayoutEffect(() => {
    const node = field.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = node.scrollHeight + 'px'
  }, [draft])

  const running = openRequestIds(chat.session)
  const ready = chat.canSend(draft)

  const submit = (): void => {
    if (!chat.canSend(draft)) return
    const question = draft
    setDraft('')
    void chat.send(question)
  }

  return (
    <div className="relative m-3 shrink-0">
      <form
        className="flex flex-col rounded-lg border border-strong bg-muted p-1 focus-within:outline-1 focus-within:outline-solid focus-within:-outline-offset-1 focus-within:outline-focus"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          ref={field}
          rows={1}
          value={draft}
          aria-label="Câu hỏi cho AI"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Phím Enter để gửi, Shift+Enter để xuống dòng. Không gửi khi đang gõ bộ gõ IME.
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            submit()
          }}
          className="max-h-40 min-h-6 w-full resize-none bg-transparent px-1.5 text-body-sm leading-normal text-default outline-none placeholder:text-subtle"
          placeholder="Hỏi về chương này, nhờ dịch hay sửa đoạn đang chọn…"
        />

        <div className="flex items-center gap-0.5 pt-1">
          <ModelSelectionMenu
            label="Model để hỏi"
            connections={chat.usable}
            selected={chat.selection}
            onSelect={chat.selectModel}
            onSelectThinking={(selection, choice) => void chat.setThinking(selection, choice)}
            onOpen={chat.refreshConnections}
            open={modelMenuOpen}
            onOpenChange={setModelMenuOpen}
            overridesMain={chat.overridesMain}
            onUseDefault={chat.useDefaultModel}
            onRefresh={chat.refreshModels}
            refreshing={chat.refreshing}
            suggestions={chat.suggestions}
            onAddCustom={chat.addCustomModel}
            onOpenSettings={openModelList}
          />

          {running.length > 0 ? (
            <CompactButton
              variant="outline"
              aria-label="Dừng"
              title="Dừng câu trả lời đang chạy"
              onClick={() => running.forEach((requestId) => chat.cancel(requestId))}
              className="ml-auto"
              icon={<StopCircleIcon size={ICON.sm} aria-hidden="true" />}
            />
          ) : (
            <CompactButton
              type="submit"
              variant="dark"
              round
              disabled={!ready}
              aria-label="Gửi"
              title={ready ? 'Gửi (Enter)' : 'Cần câu hỏi và một model'}
              className="ml-auto"
              icon={<ArrowUpIcon size={ICON.sm} aria-hidden="true" />}
            />
          )}
        </div>
      </form>
    </div>
  )
}
