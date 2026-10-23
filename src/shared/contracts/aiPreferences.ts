import * as v from 'valibot'
import { idSchema } from './library'
import { THINKING_LEVELS } from './modelSettings'

/**
 * Lựa chọn model toàn ứng dụng trong Cài đặt › Model:
 * model chính và danh sách model dự phòng thử theo thứ tự khi model chính không phản hồi.
 */

export const MAX_FALLBACKS = 8

export const modelRefSchema = v.strictObject({
  connectionId: idSchema,
  entryId: idSchema
})
export type ModelRef = v.InferOutput<typeof modelRefSchema>

export const mainModelSchema = v.strictObject({
  connectionId: idSchema,
  entryId: idSchema,
  /** Mức suy luận chọn cùng model chính; không có nghĩa là dùng cài đặt riêng của mục. */
  thinking: v.optional(v.picklist(THINKING_LEVELS))
})
export type MainModel = v.InferOutput<typeof mainModelSchema>

export const setMainModelSchema = v.strictObject({ main: v.nullable(mainModelSchema) })

export const setFallbacksSchema = v.strictObject({
  fallbacks: v.pipe(
    v.array(modelRefSchema, 'Danh sách dự phòng không hợp lệ.'),
    v.maxLength(MAX_FALLBACKS, 'Tối đa ' + MAX_FALLBACKS + ' model dự phòng.')
  )
})

export const setAuxiliaryModelSchema = v.strictObject({ auxiliary: v.nullable(modelRefSchema) })

export interface AiPreferences {
  main: MainModel | null
  fallbacks: ModelRef[]
  /** Model for background agent work such as summarising chat history; `null` uses the turn's model. */
  auxiliary: ModelRef | null
  /** Onboarding was dismissed with "Để sau". */
  onboardingSkipped: boolean
}

export const setOnboardingSkippedSchema = v.strictObject({ skipped: v.boolean() })
