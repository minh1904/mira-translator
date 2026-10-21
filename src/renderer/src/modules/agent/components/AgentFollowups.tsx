import type { JSX } from 'react'
import { Button } from '../../../components/ui/Button'
import type { AgentTurnView } from '../../../../../shared/contracts/agent'

export function getSuggestedFollowups(lastTurn?: AgentTurnView): string[] {
  if (!lastTurn) {
    return ['Tóm tắt tác phẩm này', 'Liệt kê các chương mới nhất', 'Kiểm tra bảng thuật ngữ']
  }

  const text = lastTurn.instruction.toLowerCase()
  if (text.includes('dịch') || text.includes('translate')) {
    return ['Dịch chương tiếp theo', 'Rà soát xưng hô chương vừa dịch', 'Trích xuất thuật ngữ mới']
  }
  if (text.includes('thuật ngữ') || text.includes('glossary')) {
    return ['Thêm các thuật ngữ này vào bảng', 'Kiểm tra lại xưng hô', 'Tiếp tục dịch chương']
  }
  if (text.includes('tóm tắt') || text.includes('summary')) {
    return [
      'Phân tích diễn biến tiếp theo',
      'Các tình tiết quan trọng cần lưu ý',
      'Dịch chương kế tiếp'
    ]
  }
  return ['Dịch chương hiện tại', 'Kiểm tra bảng xưng hô', 'Tóm tắt nội dung chính']
}

export interface AgentFollowupsProps {
  lastTurn?: AgentTurnView
  onSelectPrompt: (prompt: string) => void
}

/**
 * Danh sách gợi ý hành động tiếp theo sau lượt hội thoại (tương đương chatSuggestNextWidget của VS Code).
 */
export function AgentFollowups({ lastTurn, onSelectPrompt }: AgentFollowupsProps): JSX.Element {
  const followups = getSuggestedFollowups(lastTurn)

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-label-xs text-muted font-medium select-none">Gợi ý:</span>
      {followups.map((prompt) => (
        <Button
          key={prompt}
          variant="outline"
          onClick={() => onSelectPrompt(prompt)}
          className="!h-[20px] rounded-full px-2 text-label-xs text-subtle hover:text-default"
        >
          {prompt}
        </Button>
      ))}
    </div>
  )
}
