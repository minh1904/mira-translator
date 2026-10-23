import { useWorkspaceStore } from '../store/workspaceStore'
import { MOCK_FEATURES } from '../../../lib/mockFeatures'

/** "Xem ngữ cảnh": the work's Context area, where Glossary and Addressing list what applies. */
export async function openGlossaryReview(workId: string): Promise<void> {
  const store = useWorkspaceStore.getState()
  if (await store.navigate({ name: 'work', workId }))
    store.setWorkArea(workId, MOCK_FEATURES.contextArea.id)
}
