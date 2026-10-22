import type * as v from 'valibot'
import type {
  AgentContext,
  AgentProgress,
  AgentTurnState,
  ResolvedTarget
} from '../../../shared/contracts/agent'
import type { TokenUsage } from '../../../shared/contracts/usage'
import type { LibraryStore } from '../library/library'

export type CapabilityKind = 'read' | 'reversible-write' | 'destructive' | 'external'

export interface CapabilityBudget {
  maxCallsPerTurn?: number
  maxInputChars?: number
  maxOutputChars?: number
}

export interface CapabilityExecutionInput<TArgs = unknown> {
  turnId: string
  commandId: string
  operationId?: string
  target?: ResolvedTarget
  args: TArgs
  library: LibraryStore
  now: number
  signal?: AbortSignal
  onProgress?: (progress: AgentProgress) => void
}

export interface CapabilityExecutionResult<TResult = unknown> {
  ok: boolean
  value?: TResult
  error?: { code: string; message: string; details?: unknown }
  progress?: AgentProgress
  hasChanges?: boolean
}

export interface CapabilityDefinition<TArgs = any, TResult = any> {
  name: string
  description: string
  kind: CapabilityKind
  schema: v.GenericSchema<TArgs>
  /**
   * Hand-written JSON Schema (OpenAI tool format) of the arguments the model sends. Present means the
   * capability is offered in chat. A `target` property is a turn handle the runtime swaps for the
   * resolved target before `schema` validates the rest; the repo has no valibot → JSON Schema export.
   */
  parameters?: { type: 'object'; properties: Record<string, unknown>; required: string[] }
  budget?: CapabilityBudget
  targetPolicy: 'requires_target' | 'no_target' | 'target_optional'
  handler: (input: CapabilityExecutionInput<TArgs>) => Promise<CapabilityExecutionResult<TResult>>
  /**
   * What a call does, as a verb phrase ("Đọc chương 12"). The runtime shows it as "Đang …" while the
   * call runs and "Đã …" after, like VS Code's invocation and past-tense messages.
   */
  describe?: (input: { args: TArgs; target?: ResolvedTarget }) => string
}

export interface AgentRunner {
  runTurn(input: {
    sessionId: string
    turnId: string
    instruction: string
    context: AgentContext
  }): Promise<{ status: AgentTurnState; answer: string; usage?: TokenUsage | null }>
}
