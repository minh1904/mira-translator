import { describe, expect, it } from 'vitest'
import type { TextRecord } from '../../../shared/contracts/text'
import { segment } from '../../../shared/segmentation/segmenter'
import { AgentRepository } from '../../infra/storage/agentRepository'
import { AgentTaskRepository } from '../../infra/storage/agentTaskRepository'
import { setupAgent } from './agentTestKit'
import { AgentTaskService } from './taskService'
import { AgentWriteCoordinator } from './writeCoordinator'

let commands = 0
const command = () => `00000000-0000-4000-8000-${(++commands).toString().padStart(12, '0')}`

/** One English chapter and a glossary term the fake translation will never use. */
function qualityKit() {
  const kit = setupAgent()
  const work = kit.library.create({ title: 'QA', sourceLang: 'en' })
  const chapter = kit.library.createChapter(work.id, 'Chương 1').chapter
  const other = kit.library.createChapter(work.id, 'Chương 2').chapter
  const text = 'The dragon sleeps under the old mountain tonight.'
  for (const each of [chapter, other]) {
    kit.library.saveText(work.id, each.id, 'source', text, 0, segment(text, 'en'))
  }
  const term = kit.services.glossary.create(work.id, {
    source: 'dragon',
    target: 'rồng',
    status: 'approved'
  })
  const tasks = new AgentTaskService({
    library: kit.library,
    connections: kit.services.connections,
    tasks: new AgentTaskRepository(kit.library.appDb),
    operations: new AgentRepository(kit.library.appDb),
    writeCoordinator: new AgentWriteCoordinator(1_000)
  })
  tasks.connect({ publishIntent: () => [], changed: () => {} })
  const create = (chapterIds: string[]) =>
    tasks.create({
      clientCommandId: command(),
      contextStrategy: 'approved_only',
      workId: work.id,
      chapterIds,
      modelSelection: kit.modelSelection
    }).task
  /** Rewrites the first target paragraph, keeping its segment ID and links. */
  const editTarget = (text: string) => {
    const record: TextRecord = kit.library.readText(work.id, chapter.id, 'target')
    const [first, ...rest] = record.segments
    const shift = text.length - (first!.end - first!.start)
    const content = text + record.content.slice(first!.end)
    kit.library.saveText(work.id, chapter.id, 'target', content, record.rev, [
      { id: first!.id, start: 0, end: text.length },
      ...rest.map((each) => ({ id: each.id, start: each.start + shift, end: each.end + shift }))
    ])
  }
  return { ...kit, work, chapter, other, term, tasks, create, editTarget }
}

describe('task quality warnings', () => {
  it('reads the snapshot the item pinned, not the glossary as it is now', async () => {
    const kit = qualityKit()
    const task = kit.create([kit.chapter.id])
    await kit.tasks.idle()
    expect(kit.tasks.get(task.id).task.state).toBe('completed')

    const first = kit.tasks.quality(task.id)
    expect(first.openCount).toBe(1)
    expect(first.items[0]).toMatchObject({ status: 'checked' })
    expect(first.items[0]!.findings[0]).toMatchObject({
      ruleCode: 'glossary.missing_target',
      evidence: 'dragon → rồng',
      paragraphIndex: 0
    })

    // Today's glossary would pass ("dragon" is in the fake translation); the warning stays on the snapshot.
    kit.services.glossary.update(kit.work.id, kit.term.id, { target: 'dragon' })
    expect(kit.tasks.quality(task.id).openCount).toBe(1)
    // The warning never changes the item's state.
    expect(kit.tasks.get(task.id).items[0]!.state).toBe('completed')
  })

  it('shows N/A for an item that has not run', async () => {
    const kit = qualityKit()
    const task = kit.create([kit.chapter.id, kit.other.id])
    kit.tasks.control({
      taskId: task.id,
      command: 'pause',
      stateVersion: kit.tasks.get(task.id).task.stateVersion,
      clientCommandId: command()
    })
    await kit.tasks.idle()
    const quality = kit.tasks.quality(task.id)
    expect(quality.items.map((item) => item.status)).toEqual(['na', 'na'])
    expect(quality.openCount).toBe(0)
  })

  it('hides a dismissed warning until the paragraph text or the rule version changes', async () => {
    const kit = qualityKit()
    const task = kit.create([kit.chapter.id])
    await kit.tasks.idle()
    const [finding] = kit.tasks.quality(task.id).items[0]!.findings
    const itemId = kit.tasks.get(task.id).items[0]!.id
    const before = kit.library.readText(kit.work.id, kit.chapter.id, 'target')

    // Another rule version does not match.
    kit.tasks.dismiss({
      taskId: task.id,
      itemId,
      segmentId: finding!.segmentId,
      ruleCode: finding!.ruleCode,
      ruleVersion: finding!.ruleVersion + 1
    })
    expect(kit.tasks.quality(task.id).openCount).toBe(1)

    kit.tasks.dismiss({
      taskId: task.id,
      itemId,
      segmentId: finding!.segmentId,
      ruleCode: finding!.ruleCode,
      ruleVersion: finding!.ruleVersion,
      reason: 'Tên giữ tiếng Anh ở đoạn này'
    })
    expect(kit.tasks.quality(task.id).openCount).toBe(0)
    // Dismissing touches neither the text nor the item.
    expect(kit.library.readText(kit.work.id, kit.chapter.id, 'target')).toEqual(before)
    expect(kit.tasks.get(task.id).items[0]!.state).toBe('completed')

    // An edit that still breaks the rule brings it back; one that fixes it clears it.
    kit.editTarget('Con dragon vẫn ngủ say dưới ngọn núi cũ đêm nay.')
    expect(kit.tasks.quality(task.id).openCount).toBe(1)
    kit.editTarget('Con rồng ngủ dưới ngọn núi cũ đêm nay.')
    expect(kit.tasks.quality(task.id).openCount).toBe(0)
  })
})
