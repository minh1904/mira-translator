import type { BudgetReport, BudgetRound } from '../../../../shared/contracts/aiTranslate'

/**
 * How many model calls one chapter translation run may make (change `translation-call-budget`).
 *
 * One unit is one `caller.complete`, not one HTTP request: the gateway's own retries have their own cap and
 * only follow transient failures, so counting them would let a flaky line make innocent paragraphs "run out".
 * They are reported apart, as `httpAttempts`.
 *
 * The main call of every batch is reserved up front, so a first batch that the filter hits hard cannot
 * starve the later ones. Extra rounds (splitting a filtered batch, the retry without work context, the
 * repair of missing ids) draw from one shared fund. `take` is synchronous and subtracts at once, so batches
 * that interleave across `await`s in one process cannot overrun it.
 */

export type { BudgetRound }
export type BudgetSnapshot = BudgetReport

/** The share of the limit at which the run warns, once. */
export const BUDGET_WARN_SHARE = 0.8

/** The default extra fund for a run of `batches` batches: one split and one repair per batch, at least 8. */
export function defaultExtra(batches: number): number {
  return Math.max(8, 2 * batches)
}

export class CallBudget {
  private mainLeft: number
  private extraLeft: number
  private limitTotal: number
  private readonly rounds: Record<BudgetRound, number> = {
    main: 0,
    split: 0,
    bare: 0,
    repair: 0,
    fallback: 0,
    polish: 0
  }
  private attempts = 0
  /** Set once the outer gate refused a call: the run stopped for the task's cap, not its own. */
  gateClosed = false

  /**
   * `gate` is asked before every call that the run's own budget would allow; a durable task uses it for
   * its caps across runs (calls, tokens, cost). A refusal is final for this budget.
   */
  constructor(
    main: number,
    extra: number,
    private readonly gate?: (round: BudgetRound) => boolean
  ) {
    this.mainLeft = Math.max(0, main)
    this.extraLeft = Math.max(0, extra)
    this.limitTotal = this.mainLeft + this.extraLeft
  }

  /**
   * Asks for one call of `round`. A main call uses its reserved share first and the extra fund only when the
   * run has more batches than were planned; any other round uses the extra fund. `false` means no call.
   */
  take(round: BudgetRound): boolean {
    if (this.gateClosed) return false
    const own = (round === 'main' && this.mainLeft > 0) || this.extraLeft > 0
    if (own && this.gate && !this.gate(round)) {
      this.gateClosed = true
      return false
    }
    if (round === 'main' && this.mainLeft > 0) {
      this.mainLeft--
    } else if (this.extraLeft > 0) {
      this.extraLeft--
    } else {
      return false
    }
    this.rounds[round]++
    return true
  }

  /** Grants more: a person pressing "retry" gets a fresh share for the batches being retried. */
  grant(main: number, extra: number): void {
    this.mainLeft += Math.max(0, main)
    this.extraLeft += Math.max(0, extra)
    this.limitTotal += Math.max(0, main) + Math.max(0, extra)
  }

  /** Counts HTTP attempts the gateway made for calls already taken. */
  addAttempts(count: number): void {
    this.attempts += Math.max(0, count)
  }

  snapshot(): BudgetSnapshot {
    const used = Object.values(this.rounds).reduce((sum, count) => sum + count, 0)
    return {
      used,
      limit: this.limitTotal,
      byRound: { ...this.rounds },
      httpAttempts: this.attempts,
      warn: this.limitTotal > 0 && used >= BUDGET_WARN_SHARE * this.limitTotal
    }
  }
}

/** What `executeTranslateBatch` uses when no run budget is passed: the old caps (1 + 16 + 16 + 1). */
export const LOCAL_EXTRA = 33
