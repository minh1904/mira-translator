/** Capabilities that change a chapter or start work on one; a turn that ran one did something. */
export const AGENT_WRITE_TOOLS = [
  'translate_chapter',
  'edit_translation',
  'undo_operation',
  'create_translation_task',
  'steer_translation_task',
  'answer_context_questions',
  'set_work_conventions'
] as const

/** Progress message Main stores at the end of a turn that gave the user nothing. */
export const EMPTY_TURN_NOTICE = 'Lượt kết thúc mà không có phản hồi'

/**
 * Whether a turn that ended `completed` gave the user nothing: no answer text and no write that
 * completed. Main uses it to store the notice and the transcript uses it to offer **Tiếp tục**, so both
 * agree without comparing message strings.
 */
export function isEmptyTurn(turn: {
  parts: ReadonlyArray<{ kind: string; text: string }>
  toolCalls: ReadonlyArray<{ name: string; state: string }>
}): boolean {
  const said = turn.parts.some((part) => part.kind === 'text' && part.text.trim() !== '')
  if (said) return false
  const wrote = turn.toolCalls.some(
    (call) =>
      call.state === 'completed' && (AGENT_WRITE_TOOLS as readonly string[]).includes(call.name)
  )
  return !wrote
}
