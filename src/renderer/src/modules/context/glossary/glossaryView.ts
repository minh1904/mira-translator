/**
 * The view a work's Glossary screen opens on the next time it mounts: "Cần xem" when a task's detail
 * sends the user to the questions it left.
 */
const requested = new Map<string, 'review'>()

export function requestGlossaryView(workId: string, view: 'review'): void {
  requested.set(workId, view)
}

/** The requested view, once: a later visit opens on the full list again. */
export function takeGlossaryView(workId: string): 'review' | undefined {
  const view = requested.get(workId)
  requested.delete(workId)
  return view
}
