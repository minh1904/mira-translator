import { useWorkspaceStore } from '../store/workspaceStore'
import { MOCK_FEATURES } from '../../../lib/mockFeatures'
import { requestGlossaryView } from '../../context/public'

/**
 * "Xem ngữ cảnh": the work's Context area, where Glossary and Addressing list what applies; `review`
 * opens the Glossary on its open questions.
 */
export async function openGlossaryReview(workId: string, view?: 'review'): Promise<void> {
  if (view) requestGlossaryView(workId, view)
  const store = useWorkspaceStore.getState()
  if (await store.navigate({ name: 'work', workId }))
    store.setWorkArea(workId, MOCK_FEATURES.contextArea.id)
}
