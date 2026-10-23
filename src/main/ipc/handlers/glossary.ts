import * as v from 'valibot'
import { CHANNELS } from '../../../shared/contracts/channels'
import {
  appliedContextSchema,
  createGlossaryEntrySchema,
  deleteGlossaryEntrySchema,
  importNamesSchema,
  listGlossarySchema,
  reviewInfoSchema,
  updateGlossaryEntrySchema
} from '../../../shared/contracts/glossary'
import { idSchema } from '../../../shared/contracts/library'
import { StorageError } from '../../infra/storage/errors'
import { createHandler } from '../handler'
import { glossaryOf, type AreaHandlers, type HandlerDeps } from './deps'

export function glossaryHandlers(deps: HandlerDeps): AreaHandlers<'glossary'> {
  const glossary = glossaryOf(deps)
  return {
    [CHANNELS.glossaryList]: createHandler(listGlossarySchema, (input) => ({
      entries: glossary.list(input.workId, {
        kind: input.kind,
        status: input.status,
        query: input.query,
        chapterId: input.chapterId
      })
    })),
    [CHANNELS.glossaryGet]: createHandler(
      v.strictObject({ workId: idSchema, entryId: idSchema }),
      (input) => {
        const entry = glossary.get(input.workId, input.entryId)
        if (!entry) throw new StorageError('not_found', 'Không tìm thấy mục thuật ngữ.')
        return entry
      }
    ),
    [CHANNELS.glossaryCreate]: createHandler(createGlossaryEntrySchema, (input) =>
      glossary.create(input.workId, input)
    ),
    [CHANNELS.glossaryUpdate]: createHandler(updateGlossaryEntrySchema, (input) =>
      glossary.update(input.workId, input.entryId, input)
    ),
    [CHANNELS.glossaryDelete]: createHandler(deleteGlossaryEntrySchema, (input) => {
      glossary.delete(input.workId, input.entryId)
    }),
    [CHANNELS.glossaryImportNames]: createHandler(importNamesSchema, (input) =>
      glossary.importNames(input.workId, input.content)
    ),
    [CHANNELS.glossaryReviewInfo]: createHandler(reviewInfoSchema, (input) => ({
      entries: glossary.reviewInfo(input.workId, input.entryIds)
    })),
    [CHANNELS.glossaryApplied]: createHandler(appliedContextSchema, (input) =>
      glossary.applied(input.workId, input.chapterId)
    ),
    [CHANNELS.glossaryCheckCompliance]: createHandler(
      v.strictObject({
        workId: idSchema,
        chapterId: v.pipe(v.string(), v.uuid()),
        sourceText: v.string(),
        targetText: v.string()
      }),
      (input) =>
        glossary.checkCompliance(input.workId, input.chapterId, input.sourceText, input.targetText)
    )
  }
}
