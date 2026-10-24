/** A queued or running item, by its task and the model entry of that task (design D2). */
export interface RunningSlot {
  taskId: string
  entryId: string
}

/**
 * The next item to start, or `null`: among tasks whose model entry has a free place and that are not
 * blocked (extracting terms), the task with the fewest running items, then the older task, then the
 * lowest ordinal. `candidates` come ordered by task age, task id and ordinal.
 */
export function pickNextItem<T extends RunningSlot>(
  candidates: readonly T[],
  running: readonly RunningSlot[],
  ceilingOf: (entryId: string) => number,
  blocked: ReadonlySet<string> = new Set()
): T | null {
  const perTask = new Map<string, number>()
  const perEntry = new Map<string, number>()
  for (const slot of running) {
    perTask.set(slot.taskId, (perTask.get(slot.taskId) ?? 0) + 1)
    perEntry.set(slot.entryId, (perEntry.get(slot.entryId) ?? 0) + 1)
  }
  let best: T | null = null
  for (const candidate of candidates) {
    if (blocked.has(candidate.taskId)) continue
    if ((perEntry.get(candidate.entryId) ?? 0) >= ceilingOf(candidate.entryId)) continue
    // Strictly fewer only: on a tie the earlier candidate (older task, lower ordinal) keeps its place.
    if (best === null || (perTask.get(candidate.taskId) ?? 0) < (perTask.get(best.taskId) ?? 0)) {
      best = candidate
    }
  }
  return best
}
