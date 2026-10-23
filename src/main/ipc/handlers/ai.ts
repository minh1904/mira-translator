import {
  addConnectionKeySchema,
  addModelEntriesSchema,
  connectionRefSchema,
  createConnectionSchema,
  ensureWithKeySchema,
  probeEndpointSchema,
  modelEntryRefSchema,
  removeConnectionKeySchema,
  reorderModelEntriesSchema,
  updateConnectionSchema,
  updateModelEntrySchema
} from '../../../shared/contracts/aiConnections'
import { translateBatchSchema, translatePlanSchema } from '../../../shared/contracts/aiTranslate'
import {
  paragraphBatchSchema,
  paragraphFinalizeSchema,
  paragraphPlanSchema
} from '../../../shared/contracts/aiTranslateProposals'
import { CHANNELS } from '../../../shared/contracts/channels'
import {
  setAuxiliaryModelSchema,
  setFallbacksSchema,
  setMainModelSchema,
  setOnboardingSkippedSchema
} from '../../../shared/contracts/aiPreferences'
import { createAsyncHandler, createHandler } from '../handler'
import {
  connectionsOf,
  paragraphTranslatorOf,
  translatorOf,
  type AreaHandlers,
  type HandlerDeps
} from './deps'

/** Kết nối AI (khóa), mục model của chúng, và dịch chương bằng AI. */
export function aiHandlers(
  deps: HandlerDeps
): AreaHandlers<'ai:connections' | 'ai:models' | 'ai:translate' | 'ai:preferences'> {
  return {
    [CHANNELS.aiConnectionsList]: createHandler(null, () => connectionsOf(deps).list()),
    [CHANNELS.aiConnectionsCreate]: createHandler(createConnectionSchema, (input) =>
      connectionsOf(deps).create(input)
    ),
    [CHANNELS.aiConnectionsUpdate]: createHandler(updateConnectionSchema, (input) =>
      connectionsOf(deps).update(input)
    ),
    [CHANNELS.aiConnectionsDelete]: createHandler(connectionRefSchema, ({ id }) =>
      connectionsOf(deps).delete(id)
    ),
    [CHANNELS.aiConnectionsTest]: createAsyncHandler(connectionRefSchema, ({ id }) =>
      connectionsOf(deps).test(id)
    ),
    [CHANNELS.aiConnectionsProbe]: createAsyncHandler(probeEndpointSchema, (input) =>
      connectionsOf(deps).probe(input)
    ),
    [CHANNELS.aiPreferencesGet]: createHandler(null, () => connectionsOf(deps).preferences()),
    [CHANNELS.aiPreferencesSetMain]: createHandler(setMainModelSchema, ({ main }) =>
      connectionsOf(deps).setMainModel(main)
    ),
    [CHANNELS.aiPreferencesSetFallbacks]: createHandler(setFallbacksSchema, ({ fallbacks }) =>
      connectionsOf(deps).setFallbacks(fallbacks)
    ),
    [CHANNELS.aiPreferencesSetAuxiliary]: createHandler(setAuxiliaryModelSchema, ({ auxiliary }) =>
      connectionsOf(deps).setAuxiliaryModel(auxiliary)
    ),
    [CHANNELS.aiPreferencesSetOnboardingSkipped]: createHandler(
      setOnboardingSkippedSchema,
      ({ skipped }) => connectionsOf(deps).setOnboardingSkipped(skipped)
    ),
    [CHANNELS.aiConnectionsEnsureWithKey]: createAsyncHandler(ensureWithKeySchema, (input) =>
      connectionsOf(deps).ensureWithKey(input)
    ),
    [CHANNELS.aiKeysAdd]: createAsyncHandler(addConnectionKeySchema, ({ id, secret }) =>
      connectionsOf(deps).addApiKey(id, secret)
    ),
    [CHANNELS.aiKeysRemove]: createHandler(removeConnectionKeySchema, ({ id, keyId }) =>
      connectionsOf(deps).removeApiKey(id, keyId)
    ),
    [CHANNELS.aiModelsAdd]: createHandler(addModelEntriesSchema, ({ connectionId, items }) =>
      connectionsOf(deps).addModels(connectionId, items)
    ),
    [CHANNELS.aiModelsUpdate]: createHandler(updateModelEntrySchema, ({ entryId, patch }) =>
      connectionsOf(deps).updateEntry(entryId, patch)
    ),
    [CHANNELS.aiModelsDuplicate]: createHandler(modelEntryRefSchema, ({ entryId }) =>
      connectionsOf(deps).duplicateEntry(entryId)
    ),
    [CHANNELS.aiModelsDelete]: createHandler(modelEntryRefSchema, ({ entryId }) =>
      connectionsOf(deps).deleteEntry(entryId)
    ),
    [CHANNELS.aiModelsReorder]: createHandler(reorderModelEntriesSchema, ({ connectionId, ids }) =>
      connectionsOf(deps).reorderEntries(connectionId, ids)
    ),
    [CHANNELS.aiModelsTest]: createAsyncHandler(modelEntryRefSchema, ({ entryId }) =>
      connectionsOf(deps).testEntry(entryId)
    ),
    [CHANNELS.aiTranslatePlan]: createHandler(translatePlanSchema, (input) =>
      translatorOf(deps).plan(input)
    ),
    [CHANNELS.aiTranslateBatch]: createAsyncHandler(translateBatchSchema, (input) =>
      translatorOf(deps).runBatch(input)
    ),
    [CHANNELS.aiTranslateParagraphPlan]: createHandler(paragraphPlanSchema, (input) =>
      paragraphTranslatorOf(deps).plan(input)
    ),
    [CHANNELS.aiTranslateParagraphBatch]: createAsyncHandler(paragraphBatchSchema, (input) =>
      paragraphTranslatorOf(deps).runBatch(input)
    ),
    [CHANNELS.aiTranslateParagraphFinalize]: createHandler(paragraphFinalizeSchema, (input) =>
      paragraphTranslatorOf(deps).finalize(input)
    )
  }
}
