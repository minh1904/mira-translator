/**
 * Guards on one model round (`add-agent-empty-reply-guard`): a round that came back empty is sent
 * again a bounded number of times, and a round stuck repeating one passage is cut off while it streams.
 * Thresholds follow Hermes' `empty_response_guard.py` and `repetition_guard.py`.
 */

export const EMPTY_RETRIES_PER_ROUND = 2
export const EMPTY_RETRIES_PER_TURN = 3
/** Repetition is only looked for once the round has this much text, and again every `STEP` more. */
export const REPETITION_MIN_CHARS = 2_000
export const REPETITION_CHECK_STEP = 500
const MIN_PERIOD = 60

/** No answer, no call, and no content filter said why: reasoning alone does not count as an answer. */
export function isEmptyRound(round: {
  text: string
  calls: number
  finishReason: string | undefined
}): boolean {
  return round.text.trim() === '' && round.calls === 0 && round.finishReason !== 'filter'
}

/** The provider reported usage and it says the model wrote nothing; missing usage proves nothing. */
export function zeroOutput(usage: { outputTokens: number } | null | undefined): boolean {
  return usage !== null && usage !== undefined && usage.outputTokens === 0
}

/** Two empties in a row with zero output are deterministic: sending the same request again is wasted. */
export function shouldRetryEmpty(state: {
  roundRetries: number
  turnRetries: number
  zeroOutputStreak: number
}): boolean {
  return (
    state.roundRetries < EMPTY_RETRIES_PER_ROUND &&
    state.turnRetries < EMPTY_RETRIES_PER_TURN &&
    state.zeroOutputStreak < 2
  )
}

/**
 * Whether the text ends in one passage of at least 60 characters repeated verbatim back to back,
 * covering more than half of it. Returns how much text to keep: everything before the second copy.
 */
export function detectRepetition(text: string): { keep: number } | null {
  const length = text.length
  if (length < REPETITION_MIN_CHARS) return null
  const tail = text.slice(length - MIN_PERIOD)
  const previous = text.lastIndexOf(tail, length - MIN_PERIOD - 1)
  if (previous < 0) return null
  const period = length - MIN_PERIOD - previous
  if (period < MIN_PERIOD) return null
  // Walk back while each character equals the one a period earlier: that run is the repeated part.
  let start = length
  while (start - period > 0 && text[start - 1] === text[start - 1 - period]) start--
  const firstCopy = start - period
  if (length - firstCopy <= length / 2) return null
  return { keep: start }
}
