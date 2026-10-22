import { createHash } from 'node:crypto'
import * as v from 'valibot'
import { StorageError } from '../../../infra/storage/errors'
import type { CapabilityDefinition } from '../types'
import { runChapterTranslation } from '../chapterTranslationRunner'
import type { ConnectionService } from '../../ai/connectionService'
import { TARGET_PARAM } from './readCapabilities'

export interface WriteCapabilitiesOptions {
  connections: ConnectionService
}

export function createWriteCapabilities(options: WriteCapabilitiesOptions) {
  const { connections } = options

  const translateChapterCapability: CapabilityDefinition<{
    connectionId?: string
    entryId?: string
    settingsKey?: string
  }> = {
    name: 'translate_chapter',
    description: 'Dịch toàn bộ hoặc các câu còn thiếu trong một chương bằng mô hình AI đã chọn.',
    kind: 'reversible-write',
    schema: v.object({
      connectionId: v.optional(v.string()),
      entryId: v.optional(v.string()),
      settingsKey: v.optional(v.string())
    }),
    // The model names only the chapter; the runtime fills in the model chosen for the turn.
    parameters: { type: 'object', properties: { target: TARGET_PARAM }, required: ['target'] },
    targetPolicy: 'requires_target',
    handler: async ({ library, target, args, operationId, now, signal, onProgress }) => {
      if (target?.kind !== 'chapter') {
        return {
          ok: false,
          error: { code: 'validation', message: 'translate_chapter yêu cầu target loại chapter.' }
        }
      }

      const activeOperationId = operationId ?? `op-${now}`

      // Model resolution: pick specified or active/default model
      let connectionId = args.connectionId
      let entryId = args.entryId
      if (!connectionId || !entryId) {
        const conns = connections.list().connections
        const found = conns.find((c) => c.models.length > 0)
        if (!found || found.models.length === 0) {
          return {
            ok: false,
            error: { code: 'validation', message: 'Chưa có cấu hình kết nối AI nào khả dụng.' }
          }
        }
        connectionId = found.id
        entryId = found.models[0].id
      }

      try {
        const result = await runChapterTranslation({
          library,
          connections,
          workId: target.workId,
          chapterId: target.chapterId,
          operationId: activeOperationId,
          modelSelection: { connectionId, entryId, settingsKey: args.settingsKey },
          signal,
          onProgress,
          now: () => now
        })

        return {
          ok: result.state === 'completed' || result.state === 'partially_completed',
          value: {
            state: result.state,
            appliedUnits: result.appliedUnits,
            totalUnits: result.totalUnits,
            protectedCount: result.protectedCount,
            summary: result.summary,
            lastAppliedRev: result.lastAppliedRev,
            usage: result.usage ?? null
          },
          error:
            result.state === 'cancelled'
              ? { code: 'cancelled', message: result.summary }
              : result.state === 'conflict'
                ? { code: 'conflict', message: result.summary }
                : undefined,
          hasChanges: result.appliedUnits > 0
        }
      } catch (error) {
        if (error instanceof StorageError) {
          return {
            ok: false,
            error: { code: error.code, message: error.message }
          }
        }
        throw error
      }
    },
    describe: ({ target }) =>
      `Dịch chương "${target?.kind === 'chapter' ? target.chapterLabel : ''}"`
  }

  const editTranslationCapability: CapabilityDefinition<{
    replacements: Array<{ sourceId: string; text: string }>
    expectedRev?: number
  }> = {
    name: 'edit_translation',
    description: 'Chỉnh sửa bản dịch của các câu cụ thể sau khi đã đọc nội dung đích.',
    kind: 'reversible-write',
    schema: v.object({
      replacements: v.pipe(
        v.array(
          v.object({
            sourceId: v.pipe(v.string(), v.minLength(1)),
            text: v.pipe(v.string(), v.minLength(1))
          })
        ),
        v.minLength(1),
        v.maxLength(50)
      ),
      expectedRev: v.optional(v.number())
    }),
    parameters: {
      type: 'object',
      properties: {
        target: TARGET_PARAM,
        replacements: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: 'ID đoạn gốc lấy từ read_segments.' },
              text: { type: 'string' }
            },
            required: ['sourceId', 'text']
          }
        },
        expectedRev: { type: 'number', description: 'rev của bản dịch khi đọc.' }
      },
      required: ['target', 'replacements']
    },
    targetPolicy: 'requires_target',
    handler: async ({ library, target, args, operationId, now }) => {
      if (target?.kind !== 'chapter') {
        return {
          ok: false,
          error: { code: 'validation', message: 'edit_translation yêu cầu target loại chapter.' }
        }
      }

      // Check duplicate source IDs
      const seen = new Set<string>()
      for (const r of args.replacements) {
        if (seen.has(r.sourceId)) {
          return {
            ok: false,
            error: {
              code: 'validation',
              message: `Mã câu trùng lặp trong replacements: ${r.sourceId}`
            }
          }
        }
        seen.add(r.sourceId)
      }

      // Character limit check (max 20,000 characters)
      const totalChars = args.replacements.reduce((sum, r) => sum + r.text.length, 0)
      if (totalChars > 20_000) {
        return {
          ok: false,
          error: {
            code: 'validation',
            message: 'Tổng độ dài nội dung chỉnh sửa vượt quá 20.000 ký tự.'
          }
        }
      }

      const activeOperationId = operationId ?? `op-edit-${now}`
      const currentTarget = library.readText(target.workId, target.chapterId, 'target')

      if (args.expectedRev !== undefined && args.expectedRev !== currentTarget.rev) {
        return {
          ok: false,
          error: {
            code: 'conflict',
            message: `Bản dịch đã thay đổi (revision hiện tại ${currentTarget.rev}, dự kiến ${args.expectedRev}).`
          }
        }
      }

      library.prepareAgentOperation(target.workId, {
        operationId: activeOperationId,
        chapterId: target.chapterId,
        side: 'target',
        totalUnits: args.replacements.length
      })

      const releaseLease = library.acquireTargetWriteLease(
        { workId: target.workId, chapterId: target.chapterId, side: 'target' },
        activeOperationId
      )

      try {
        const checksum =
          'sha256:' + createHash('sha256').update(JSON.stringify(args.replacements)).digest('hex')

        const batch = library.applyAgentTranslationBatch(target.workId, {
          operationId: activeOperationId,
          batchKey: 'edit-batch-1',
          expectedRev: currentTarget.rev,
          checksum,
          rows: args.replacements,
          by: { origin: 'ai', provider: 'agent', model: 'edit' }
        })

        library.markAgentOperationTerminal(target.workId, activeOperationId, 'completed', {
          editedCount: args.replacements.length
        })

        return {
          ok: true,
          value: {
            appliedUnits: args.replacements.length,
            newRev: batch.afterRev
          },
          hasChanges: true
        }
      } catch (error) {
        if (error instanceof StorageError) {
          return { ok: false, error: { code: error.code, message: error.message } }
        }
        throw error
      } finally {
        releaseLease()
      }
    },
    describe: ({ target, args }) =>
      `Chỉnh sửa ${args.replacements.length} câu trong chương "${target?.kind === 'chapter' ? target.chapterLabel : ''}"`
  }

  const undoOperationCapability: CapabilityDefinition<{ operationId: string }> = {
    name: 'undo_operation',
    description: 'Hoàn tác toàn bộ các thay đổi do một operation đã thực hiện trên chương.',
    kind: 'reversible-write',
    schema: v.object({
      operationId: v.pipe(v.string(), v.minLength(1))
    }),
    // The target is the operation's own; the runtime reads it from the operation.
    parameters: {
      type: 'object',
      properties: { operationId: { type: 'string' } },
      required: ['operationId']
    },
    targetPolicy: 'requires_target',
    handler: async ({ library, target, args }) => {
      if (target?.kind !== 'chapter') {
        return {
          ok: false,
          error: { code: 'validation', message: 'undo_operation yêu cầu target loại chapter.' }
        }
      }

      try {
        const undone = library.undoAgentOperation(target.workId, args.operationId)
        return {
          ok: true,
          value: {
            operationId: args.operationId,
            restoredRev: undone.restoredRev,
            state: undone.checkpoint.state
          },
          hasChanges: true
        }
      } catch (error) {
        if (error instanceof StorageError) {
          return { ok: false, error: { code: error.code, message: error.message } }
        }
        throw error
      }
    },
    describe: () => 'Hoàn tác một thao tác'
  }

  return {
    translateChapterCapability,
    editTranslationCapability,
    undoOperationCapability
  }
}
