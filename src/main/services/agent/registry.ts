import * as v from 'valibot'
import type {
  CapabilityDefinition,
  CapabilityExecutionInput,
  CapabilityExecutionResult
} from './types'

export interface TurnBudgetLimits {
  maxModelRounds?: number
  maxReadChars?: number
  /** Distinct chapters a turn may write; writing again to one already written is free. */
  maxWriteChapters?: number
  maxCapabilityCalls?: number
}

export class TurnBudgetTracker {
  private modelRounds = 0
  private readChars = 0
  private readonly writtenChapters = new Set<string>()
  private capabilityCalls = 0

  constructor(private readonly limits: TurnBudgetLimits = {}) {}

  recordModelRound(): { allowed: boolean; isFinalRound: boolean; reason?: string } {
    const max = this.limits.maxModelRounds ?? 15
    this.modelRounds++
    if (this.modelRounds > max) {
      return {
        allowed: false,
        isFinalRound: true,
        reason: `Đã vượt quá số vòng trao đổi tối đa (${max}).`
      }
    }
    return {
      allowed: true,
      isFinalRound: this.modelRounds === max
    }
  }

  recordRead(chars: number): { allowed: boolean; reason?: string } {
    const max = this.limits.maxReadChars ?? 200_000
    if (this.readChars + chars > max) {
      return { allowed: false, reason: `Đã vượt quá hạn mức dữ liệu đọc (${max} ký tự).` }
    }
    this.readChars += chars
    return { allowed: true }
  }

  recordWrite(chapterKey: string): { allowed: boolean; reason?: string } {
    const max = this.limits.maxWriteChapters ?? 3
    if (this.writtenChapters.has(chapterKey)) return { allowed: true }
    if (this.writtenChapters.size >= max) {
      return { allowed: false, reason: `Đã ghi vào số chương tối đa của một lượt (${max}).` }
    }
    this.writtenChapters.add(chapterKey)
    return { allowed: true }
  }

  recordCapabilityCall(_capName?: string): { allowed: boolean; reason?: string } {
    const max = this.limits.maxCapabilityCalls ?? 40
    if (this.capabilityCalls >= max) {
      return { allowed: false, reason: `Đã vượt quá hạn mức gọi công cụ (${max} lượt).` }
    }
    this.capabilityCalls++
    return { allowed: true }
  }

  isExhausted(): boolean {
    return (
      (this.limits.maxModelRounds !== undefined &&
        this.modelRounds >= this.limits.maxModelRounds) ||
      (this.limits.maxReadChars !== undefined && this.readChars >= this.limits.maxReadChars) ||
      (this.limits.maxWriteChapters !== undefined &&
        this.writtenChapters.size >= this.limits.maxWriteChapters) ||
      (this.limits.maxCapabilityCalls !== undefined &&
        this.capabilityCalls >= this.limits.maxCapabilityCalls)
    )
  }

  getSnapshot(): {
    modelRounds: number
    readChars: number
    writeChapters: number
    capabilityCalls: number
  } {
    return {
      modelRounds: this.modelRounds,
      readChars: this.readChars,
      writeChapters: this.writtenChapters.size,
      capabilityCalls: this.capabilityCalls
    }
  }
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityDefinition<any, any>>()

  register(capability: CapabilityDefinition<any, any>): void {
    if (this.capabilities.has(capability.name)) {
      throw new Error(`Capability "${capability.name}" đã được đăng ký.`)
    }
    this.capabilities.set(capability.name, capability)
  }

  get(name: string): CapabilityDefinition | undefined {
    return this.capabilities.get(name)
  }

  list(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values())
  }

  async execute(
    name: string,
    rawArgs: unknown,
    input: Omit<CapabilityExecutionInput, 'args'>
  ): Promise<CapabilityExecutionResult> {
    const cap = this.capabilities.get(name)
    if (!cap) {
      return {
        ok: false,
        error: {
          code: 'not_found',
          message: `Công cụ / capability "${name}" không tồn tại hoặc chưa được đăng ký.`
        }
      }
    }

    // Validate schema
    const parseResult = v.safeParse(cap.schema, rawArgs)
    if (!parseResult.success) {
      const details = parseResult.issues.map((issue) => ({
        path: v.getDotPath(issue) ?? '',
        message: issue.message
      }))
      return {
        ok: false,
        error: {
          code: 'validation',
          message: `Tham số cho capability "${name}" không hợp lệ.`,
          details
        }
      }
    }

    // Target policy validation
    if (cap.targetPolicy === 'requires_target' && !input.target) {
      return {
        ok: false,
        error: {
          code: 'target_required',
          message: `Capability "${name}" yêu cầu target đã được phân giải.`
        }
      }
    }

    try {
      return await cap.handler({
        ...input,
        args: parseResult.output
      })
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }
}
