import { describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import { callTools, say, setupAgent } from './agentTestKit'
import { AgentService } from './agentService'

type Kit = ReturnType<typeof setupAgent>

/** Sends one turn in the session that translates the given chapter through `ctx`. */
async function translate(kit: Kit, sessionId: string | undefined, chapterId: string) {
  kit.model.script(
    callTools({ name: 'translate_chapter', args: { target: 'ctx' } }),
    say('Đã dịch.')
  )
  const res = await kit.agent.send({
    ...(sessionId ? { sessionId } : {}),
    instruction: 'dịch chương này',
    context: { workId: kit.work1.id, chapterId },
    modelSelection: kit.modelSelection
  })
  expect(res.status).toBe('completed')
  return res
}

const targetOf = (kit: Kit, chapterId: string) =>
  kit.library.readText(kit.work1.id, chapterId, 'target')

/** The user edits a translation by hand after the agent wrote it. */
function editByHand(kit: Kit, chapterId: string) {
  const current = targetOf(kit, chapterId)
  const text = 'Bản sửa tay.'
  kit.library.saveText(kit.work1.id, chapterId, 'target', text, current.rev, segment(text, 'vi'))
}

describe('chapters edited in a session', () => {
  it('lists every unkept chapter across turns and after the app restarts, until kept', async () => {
    const kit = setupAgent()
    const first = await translate(kit, undefined, kit.ch1_1.id)
    await translate(kit, first.sessionId, kit.ch1_2.id)
    expect(kit.agent.getSessionDetail(first.sessionId).editedChapters).toEqual([
      expect.objectContaining({ chapterId: kit.ch1_1.id, chapterLabel: 'Chương 1' }),
      expect.objectContaining({ chapterId: kit.ch1_2.id, chapterLabel: 'Chương 2' })
    ])

    const restarted = new AgentService({
      library: kit.library,
      connections: kit.services.connections,
      repository: kit.repository,
      registry: kit.registry,
      openChatModel: (selection) => kit.model.open(selection)
    })
    expect(restarted.editedChapters(first.sessionId)).toHaveLength(2)

    const before = targetOf(kit, kit.ch1_1.id).content
    expect(restarted.keepEdits(first.sessionId).editedChapters).toEqual([])
    expect(targetOf(kit, kit.ch1_1.id).content).toBe(before)
  })

  it('undoes two writes of one chapter back to the text before the first', async () => {
    const kit = setupAgent()
    const first = await translate(kit, undefined, kit.ch1_1.id)
    await translate(kit, first.sessionId, kit.ch1_1.id)
    const [row] = kit.agent.editedChapters(first.sessionId)
    expect(row?.operationIds).toHaveLength(2)

    const result = kit.agent.undoEdits(first.sessionId, {
      workId: kit.work1.id,
      chapterId: kit.ch1_1.id
    })
    expect(result).toMatchObject({ editedChapters: [], conflicts: [] })
    expect(targetOf(kit, kit.ch1_1.id).content).toBe('')
    expect(kit.agent.listOperations(first.turnId)[0]?.state).toBe('undone')
  })

  it('keeps a row with its conflict when the user changed the chapter after the agent', async () => {
    const kit = setupAgent()
    const res = await translate(kit, undefined, kit.ch1_1.id)
    editByHand(kit, kit.ch1_1.id)
    const result = kit.agent.undoEdits(res.sessionId, {
      workId: kit.work1.id,
      chapterId: kit.ch1_1.id
    })
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        chapterId: kit.ch1_1.id,
        message: expect.stringContaining('chỉnh sửa')
      })
    ])
    expect(result.editedChapters).toHaveLength(1)
    expect(targetOf(kit, kit.ch1_1.id).content).toBe('Bản sửa tay.')
  })
})

describe('checkpoints', () => {
  async function threeTurns() {
    const kit = setupAgent()
    kit.model.script(say('Chào bạn.'))
    const first = await kit.agent.send({ instruction: 'chào', modelSelection: kit.modelSelection })
    const second = await translate(kit, first.sessionId, kit.ch1_1.id)
    const third = await translate(kit, first.sessionId, kit.ch1_2.id)
    return { kit, first, second, third, sessionId: first.sessionId }
  }

  it('restores both chapters, hides turns 2 and 3 and gives back the command of turn 2', async () => {
    const { kit, first, second, sessionId } = await threeTurns()
    const result = kit.agent.revertToTurn(second.turnId)
    expect(result).toMatchObject({
      instruction: 'dịch chương này',
      context: { workId: kit.work1.id, chapterId: kit.ch1_1.id }
    })
    expect(result.revertedTurnIds).toHaveLength(2)
    expect(targetOf(kit, kit.ch1_1.id).content).toBe('')
    expect(targetOf(kit, kit.ch1_2.id).content).toBe('')
    const detail = kit.agent.getSessionDetail(sessionId)
    expect(detail.turns.map((turn) => turn.id)).toEqual([first.turnId])
    expect(detail.editedChapters).toEqual([])

    // The next request only carries turn 1 in its history.
    kit.model.script(say('Ừ.'))
    await kit.agent.send({ sessionId, instruction: 'tiếp', modelSelection: kit.modelSelection })
    const sent = JSON.stringify(kit.model.requests.at(-1)!.messages)
    expect(sent).toContain('Chào bạn.')
    expect(sent).not.toContain('Đã dịch.')
  })

  it('changes nothing when one chapter was edited by hand after the agent wrote it', async () => {
    const { kit, second, sessionId } = await threeTurns()
    editByHand(kit, kit.ch1_2.id)
    const translated = targetOf(kit, kit.ch1_1.id).content
    expect(() => kit.agent.revertToTurn(second.turnId)).toThrow('"Chương 2"')
    expect(targetOf(kit, kit.ch1_1.id).content).toBe(translated)
    expect(kit.agent.getSessionDetail(sessionId).turns).toHaveLength(3)
  })

  it('starts over from the first turn of a chat that only talked', async () => {
    const kit = setupAgent()
    kit.model.script(say('Chào bạn.'))
    const first = await kit.agent.send({ instruction: 'chào', modelSelection: kit.modelSelection })
    expect(kit.agent.revertToTurn(first.turnId).revertedTurnIds).toEqual([first.turnId])
    expect(kit.agent.getSessionDetail(first.sessionId).turns).toEqual([])
  })
})
