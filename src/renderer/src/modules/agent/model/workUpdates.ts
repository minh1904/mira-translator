/**
 * Calls `listener` whenever an agent's `update_work` call completes. The call carries no work ID (the
 * model sees only handles), so screens refetch their own work. Returns the unsubscribe function.
 */
export function onAgentWorkUpdate(listener: () => void): () => void {
  return (
    window.mira?.agent?.onStreamEvent?.((event) => {
      if (event.kind !== 'tool-call') return
      const call = event.toolCall as { name?: string; state?: string }
      if (call.name === 'update_work' && call.state === 'completed') listener()
    }) ?? (() => {})
  )
}
