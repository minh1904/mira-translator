import { afterEach, describe, expect, it } from 'vitest'
import { segment } from '../../../shared/segmentation/segmenter'
import { getProposal } from '../../infra/storage/aiProposals'
import { SecretStore, type SecretCrypto } from '../../infra/storage/secretStore'
import { createTempDirs } from '../../testing/testing'
import { LibraryStore } from '../library/library'
import { GlossaryService } from '../context/glossaryService'
import { acceptProposalParts, textHash } from '../proposals/proposalService'
import { ConnectionService } from './connectionService'
import { ParagraphTranslator, paragraphUnits } from './paragraphTranslation'
import { TRANSLATE_PROMPT_VERSION } from './translate/translatePrompt'
import { parseSnapshot, rebuildTranslateRequest } from './translate/contextSnapshot'
import { getRunContext } from '../../infra/storage/translateRunContext'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

const crypto: SecretCrypto = {
  isEncryptionAvailable: () => true,
  async encrypt(value) {
    return Buffer.from(value)
  },
  async decrypt(value) {
    return { value: Buffer.from(value).toString('utf8'), shouldReEncrypt: false }
  }
}

function setup(
  sourceText = 'First paragraph.\n\nSecond paragraph.',
  targetText = '',
  beforeReply?: () => void,
  answer?: (units: Array<{ id: string; src: string }>) => Response | null,
  options: { outputSchema?: boolean } = {}
): {
  library: LibraryStore
  translator: ParagraphTranslator
  workId: string
  chapterId: string
  connectionId: string
  entryId: string
  calls: string[][]
  messages: Array<Array<{ content: string }>>
  bodies: Array<Record<string, unknown>>
} {
  const library = LibraryStore.open({ dataDir: tempDir() })
  stores.push(library)
  const calls: string[][] = []
  const messages: Array<Array<{ content: string }>> = []
  const bodies: Array<Record<string, unknown>> = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
    bodies.push(body)
    messages.push(body.messages)
    const user = body.messages[1].content
    const units = JSON.parse(/<source>\n([\s\S]*?)\n<\/source>/.exec(user)?.[1] ?? user) as Array<{
      id: string
      src: string
    }>
    calls.push(units.map((unit) => unit.src))
    beforeReply?.()
    const special = answer?.(units)
    if (special) return special
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(
                units.map((unit) => ({
                  id: unit.id,
                  dst: 'VI:' + unit.src
                }))
              )
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }),
      { status: 200 }
    )
  }) as typeof fetch
  const connections = new ConnectionService({
    db: library.appDb,
    secrets: new SecretStore(crypto),
    now: () => 1000,
    newId: () => library.newAppId(),
    fetchImpl
  })
  const translator = new ParagraphTranslator({ library, connections, now: () => 1000, ...options })
  const work = library.create({ title: 'A', sourceLang: 'en' })
  const chapter = library.createChapter(work.id, 'Một').chapter
  library.saveText(work.id, chapter.id, 'source', sourceText, 0, segment(sourceText, 'en'))
  if (targetText)
    library.saveText(work.id, chapter.id, 'target', targetText, 0, segment(targetText, 'vi'))
  const connection = connections.create({
    name: 'Mock',
    baseUrl: 'http://127.0.0.1:8317/v1',
    providerId: 'google'
  })
  const entryId = connections.addModels(connection.id, [{ model: 'gemini-flash-latest' }]).models[0]
    .id
  return {
    library,
    translator,
    workId: work.id,
    chapterId: chapter.id,
    connectionId: connection.id,
    entryId,
    calls,
    messages,
    bodies
  }
}

describe('paragraph translation proposals', () => {
  it('keeps paragraph order and ignores blank blocks', () => {
    expect(paragraphUnits('\n First line\nsecond line \n\n \nThird\n')).toMatchObject([
      { order: 0, text: 'First line' },
      { order: 1, text: 'second line' },
      { order: 2, text: 'Third' }
    ])
  })

  it('stores review parts without changing the target, and retries a batch without duplicates', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    const input = {
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review' as const,
      sourceIds: plan.batches.flatMap((batch) => batch.sourceIds)
    }
    const first = await h.translator.runBatch(input)
    const retry = await h.translator.runBatch(input)
    expect(first.proposed).toHaveLength(2)
    expect(retry.proposed).toEqual(first.proposed)
    expect(h.calls).toHaveLength(1)
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe('')
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!))
    expect(proposal.parts).toHaveLength(2)
    expect(proposal.parts.map((part) => part.sourceOrder)).toEqual([0, 1])
    expect(
      h.translator.finalize({
        workId: h.workId,
        chapterId: h.chapterId,
        runId: plan.runId,
        policy: 'review'
      }).needsReview
    ).toBe(2)
    h.library.withWork(h.workId, (db) =>
      acceptProposalParts(db, {
        chapterId: h.chapterId,
        partIds: proposal.parts.map((part) => part.id),
        commandId: h.library.newAppId(),
        actor: 'user',
        now: 1000,
        newId: () => h.library.newAppId()
      })
    )
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe(
      'VI:First paragraph.\n\nVI:Second paragraph.'
    )
  })

  it('accepts individual parts of one blank-target run in either order', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    const batch = await h.translator.runBatch({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review',
      sourceIds: plan.batches.flatMap((item) => item.sourceIds)
    })
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    const apply = (partId: string): void => {
      h.library.withWork(h.workId, (db) =>
        acceptProposalParts(db, {
          chapterId: h.chapterId,
          partIds: [partId],
          commandId: h.library.newAppId(),
          actor: 'user',
          now: 1000,
          newId: () => h.library.newAppId()
        })
      )
    }
    apply(proposal.parts[1].id)
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe('VI:Second paragraph.')
    apply(proposal.parts[0].id)
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe(
      'VI:First paragraph.\n\nVI:Second paragraph.'
    )
  })

  it('auto accepts only a complete run on an unchanged blank target', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    for (const batch of plan.batches)
      await h.translator.runBatch({
        workId: h.workId,
        chapterId: h.chapterId,
        runId: plan.runId,
        connectionId: h.connectionId,
        entryId: h.entryId,
        settingsKey: plan.settingsKey,
        sourceRev: plan.sourceRev,
        targetRev: plan.targetRev,
        targetBaseContent: plan.targetBaseContent,
        policy: 'auto',
        sourceIds: batch.sourceIds
      })
    const final = h.translator.finalize({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      policy: 'auto'
    })
    expect(final).toMatchObject({ proposed: 2, applied: 2, needsReview: 0 })
    expect(final.targetContent).toBe('VI:First paragraph.\n\nVI:Second paragraph.')
  })

  it('keeps the first finished part when later batches are not sent, then resumes without duplication', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    const input = {
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review' as const
    }
    const first = await h.translator.runBatch({
      ...input,
      sourceIds: [plan.batches[0].sourceIds[0]]
    })
    expect(
      h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!)).parts
    ).toHaveLength(1)
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe('')
    await h.translator.runBatch({
      ...input,
      sourceIds: plan.batches.flatMap((batch) => batch.sourceIds)
    })
    expect(
      h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!)).parts
    ).toHaveLength(2)
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]).toEqual(['Second paragraph.'])
  })

  it('refuses a stale source or target before sending a batch', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    h.library.saveText(
      h.workId,
      h.chapterId,
      'target',
      'new text',
      plan.targetRev,
      segment('new text', 'vi')
    )
    await expect(
      h.translator.runBatch({
        workId: h.workId,
        chapterId: h.chapterId,
        runId: plan.runId,
        connectionId: h.connectionId,
        entryId: h.entryId,
        settingsKey: plan.settingsKey,
        sourceRev: plan.sourceRev,
        targetRev: plan.targetRev,
        targetBaseContent: plan.targetBaseContent,
        policy: 'auto',
        sourceIds: plan.batches[0].sourceIds
      })
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(h.calls).toHaveLength(0)
  })

  it('persists the answer against its original base when target changes during the provider call', async () => {
    let changeTarget = (): void => {}
    const h = setup('First paragraph.', '', () => changeTarget())
    const plan = h.translator.plan(h)
    changeTarget = () => {
      h.library.saveText(
        h.workId,
        h.chapterId,
        'target',
        'human edit',
        plan.targetRev,
        segment('human edit', 'vi')
      )
    }
    const batch = await h.translator.runBatch({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'auto',
      sourceIds: plan.batches[0].sourceIds
    })
    expect(batch.proposed).toHaveLength(1)
    expect(
      h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!)).targetBaseContent
    ).toBe('')
    expect(
      h.translator.finalize({
        workId: h.workId,
        chapterId: h.chapterId,
        runId: plan.runId,
        policy: 'auto'
      })
    ).toMatchObject({ applied: 0, needsReview: 1 })
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe('human edit')
  })

  it('keeps a translation for placement when target already has text', async () => {
    const h = setup('First paragraph.', 'Human text')
    const plan = h.translator.plan(h)
    const batch = await h.translator.runBatch({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'auto',
      sourceIds: plan.batches[0].sourceIds
    })
    expect(batch.proposed).toHaveLength(1)
    expect(
      h.translator.finalize({
        workId: h.workId,
        chapterId: h.chapterId,
        runId: plan.runId,
        policy: 'auto'
      })
    ).toMatchObject({ applied: 0, needsReview: 1 })
    expect(h.library.readText(h.workId, h.chapterId, 'target').content).toBe('Human text')
  })

  it('records only approved context and hashes the payload actually sent', async () => {
    const h = setup()
    const glossary = new GlossaryService(h.library, () => 1000)
    const approved = glossary.create(h.workId, {
      source: 'First',
      target: 'Đầu',
      status: 'approved'
    })
    const pending = glossary.create(h.workId, {
      source: 'Second',
      target: 'Không gửi',
      status: 'pending'
    })
    const plan = h.translator.plan(h)
    const batch = await h.translator.runBatch({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review',
      sourceIds: plan.batches.flatMap((item) => item.sourceIds)
    })
    const payload = h.messages[0]
    expect(payload[1].content).toContain('Đầu')
    expect(payload[1].content).not.toContain('Không gửi')
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    const trace = proposal.context[0] as { context: unknown[]; contextHash: string; usage: unknown }
    expect(JSON.stringify(trace.context)).toContain(approved.id)
    expect(JSON.stringify(trace.context)).not.toContain(pending.id)
    expect(trace.contextHash).toBe(
      textHash(JSON.stringify([payload[0].content, payload[1].content]))
    )
    expect(proposal.contextHash).toBe(textHash(JSON.stringify([trace.contextHash])))
    expect(proposal.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 })
  })

  it('sends the paragraphs before the batch and records the prompt version it used', async () => {
    const h = setup('One.\nTwo.\nThree.\nFour.\nFive.', '')
    const plan = h.translator.plan(h)
    const ids = plan.batches.flatMap((item) => item.sourceIds)
    const batch = await h.translator.runBatch({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review',
      sourceIds: ids.slice(4)
    })
    const [system, user] = h.messages[0]
    expect(system.content).toContain('<output>')
    expect(user.content).toContain('<previous>\nTwo.\nThree.\nFour.\n</previous>')
    expect(h.calls[0]).toEqual(['Five.'])
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    const trace = proposal.context[0] as { contextHash: string; promptVersion: string }
    expect(trace.promptVersion).toBe(TRANSLATE_PROMPT_VERSION)
    expect(trace.contextHash).toBe(textHash(JSON.stringify([system.content, user.content])))
  })

  it('accumulates metadata for each completed batch in the same proposal', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    const input = {
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review' as const
    }
    const ids = plan.batches.flatMap((batch) => batch.sourceIds)
    const first = await h.translator.runBatch({ ...input, sourceIds: [ids[0]] })
    await h.translator.runBatch({ ...input, sourceIds: [ids[1]] })
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!))
    expect(proposal.context).toHaveLength(2)
    expect(proposal.usage).toMatchObject({ inputTokens: 20, outputTokens: 10 })
    await h.translator.runBatch({ ...input, sourceIds: [ids[1]] })
    expect(
      h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!)).usage
    ).toMatchObject({ inputTokens: 20, outputTokens: 10 })
  })
})

describe('what a failed batch tells the run', () => {
  const blocked = (): Response =>
    new Response(
      JSON.stringify({
        choices: [
          { message: { role: 'assistant' }, finish_reason: 'content_filter: PROHIBITED_CONTENT' }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 0 }
      }),
      { status: 200 }
    )

  const runAll = async (
    h: ReturnType<typeof setup>
  ): ReturnType<ParagraphTranslator['runBatch']> => {
    const plan = h.translator.plan(h)
    return h.translator.runBatch({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      connectionId: h.connectionId,
      entryId: h.entryId,
      settingsKey: plan.settingsKey,
      sourceRev: plan.sourceRev,
      targetRev: plan.targetRev,
      targetBaseContent: plan.targetBaseContent,
      policy: 'review',
      sourceIds: plan.batches.flatMap((batch) => batch.sourceIds)
    })
  }

  it('lets the run go on past a blocked paragraph, and keeps the reason in the result and the trace', async () => {
    const h = setup('Clean one.\n\nBLOCKED two.\n\nClean three.', '', undefined, (units) =>
      units.some((unit) => unit.src.includes('BLOCKED')) ? blocked() : null
    )
    const batch = await runAll(h)
    expect(batch.proposed).toHaveLength(2)
    expect(batch.refusals).toEqual([
      { id: expect.any(String), group: 'prohibited', raw: 'PROHIBITED_CONTENT' }
    ])
    expect(batch.failed).toEqual([batch.refusals[0].id])
    expect(batch.error).toMatchObject({ kind: 'refused', haltsRun: false })
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    expect((proposal.context[0] as { refusals?: unknown }).refusals).toEqual(batch.refusals)
  })

  it('stops the run on a request the provider will not take, naming what was sent', async () => {
    const h = setup(
      'One.\n\nTwo.',
      '',
      undefined,
      () =>
        new Response(
          JSON.stringify({
            error: { code: 400, message: 'Request contains an invalid argument.' }
          }),
          { status: 400 }
        )
    )
    const batch = await runAll(h)
    expect(batch.proposed).toEqual([])
    expect(batch.refusals).toEqual([])
    expect(batch.error).toMatchObject({ kind: 'invalid_request', haltsRun: true })
    expect(batch.error?.message).toContain('Request contains an invalid argument')
    expect(batch.error?.message).toContain('Kiểm tra cài đặt model')
  })

  it('writes no refusals into the trace of an ordinary batch, so old proposals read the same', async () => {
    const h = setup()
    const batch = await runAll(h)
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    expect(proposal.context[0]).not.toHaveProperty('refusals')
    expect(batch.error).toBeNull()
  })
})

describe('the context snapshot of a run', () => {
  const inputOf = (
    h: ReturnType<typeof setup>,
    plan: ReturnType<ParagraphTranslator['plan']>
  ): Omit<Parameters<ParagraphTranslator['runBatch']>[0], 'sourceIds'> => ({
    workId: h.workId,
    chapterId: h.chapterId,
    runId: plan.runId,
    connectionId: h.connectionId,
    entryId: h.entryId,
    settingsKey: plan.settingsKey,
    sourceRev: plan.sourceRev,
    targetRev: plan.targetRev,
    targetBaseContent: plan.targetBaseContent,
    policy: 'review' as const
  })

  it('says in the plan how much context the run was frozen with', () => {
    const h = setup()
    const glossary = new GlossaryService(h.library, () => 1000)
    glossary.create(h.workId, { source: 'First', target: 'Đầu', status: 'approved' })
    glossary.create(h.workId, { source: 'Second', target: 'Chờ', status: 'pending' })
    const plan = h.translator.plan(h)
    expect(plan.context).toMatchObject({ glossary: 1, dyads: 0, characters: 0 })
    expect(plan.context.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('keeps the frozen setting after the setting changes mid-run, and says the context changed', async () => {
    const h = setup()
    h.library.update(h.workId, { setting: 'modern', culture: 'ja' })
    const plan = h.translator.plan(h)
    const ids = plan.batches.flatMap((batch) => batch.sourceIds)

    const first = await h.translator.runBatch({ ...inputOf(h, plan), sourceIds: [ids[0]] })
    expect(first.contextChanged).toBe(false)
    expect(h.messages[0][0].content).toContain('Bối cảnh: Hiện đại, đô thị; văn hóa: Nhật.')

    h.library.update(h.workId, { setting: 'fantasy' })
    const second = await h.translator.runBatch({ ...inputOf(h, plan), sourceIds: [ids[1]] })
    expect(second.contextChanged).toBe(true)
    expect(h.messages[1][0].content).toContain('Hiện đại, đô thị')
    expect(h.messages[1][0].content).not.toContain('Fantasy, quý tộc, isekai')
  })

  it('keeps sending the snapshot after the glossary changes mid-run, and says it changed', async () => {
    const h = setup()
    const glossary = new GlossaryService(h.library, () => 1000)
    const entry = glossary.create(h.workId, {
      source: 'paragraph',
      target: 'đoạn cũ',
      status: 'approved'
    })
    const plan = h.translator.plan(h)
    const ids = plan.batches.flatMap((batch) => batch.sourceIds)

    const first = await h.translator.runBatch({ ...inputOf(h, plan), sourceIds: [ids[0]] })
    expect(first.contextChanged).toBe(false)

    glossary.update(h.workId, entry.id, { target: 'đoạn mới' })
    const second = await h.translator.runBatch({ ...inputOf(h, plan), sourceIds: [ids[1]] })
    expect(second.contextChanged).toBe(true)
    expect(h.messages[1][1].content).toContain('đoạn cũ')
    expect(h.messages[1][1].content).not.toContain('đoạn mới')

    // Cả hai lô đều trỏ tới cùng một bản chụp ngữ cảnh.
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!))
    const traces = proposal.context as Array<{ snapshot: { runKey: string; hash: string } }>
    expect(traces).toHaveLength(2)
    expect(traces[0].snapshot).toEqual({
      runKey: `translate:${plan.runId}`,
      hash: plan.context.hash
    })
    expect(traces[1].snapshot).toEqual(traces[0].snapshot)
  })

  it('refuses a batch whose run has no snapshot, without calling the model', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    h.library.withWork(h.workId, (db) => db.exec('DELETE FROM translate_run_context'))
    await expect(
      h.translator.runBatch({
        ...inputOf(h, plan),
        sourceIds: plan.batches.flatMap((batch) => batch.sourceIds)
      })
    ).rejects.toMatchObject({
      code: 'conflict'
    })
    expect(h.calls).toHaveLength(0)
  })

  it('records what the trace needs to rebuild the request, and the rebuild matches', async () => {
    const h = setup('One.\nTwo.\nThree.\nFour.\nFive.', '')
    new GlossaryService(h.library, () => 1000).create(h.workId, {
      source: 'Five',
      target: 'Năm',
      status: 'approved'
    })
    const plan = h.translator.plan(h)
    const ids = plan.batches.flatMap((batch) => batch.sourceIds)
    const batch = await h.translator.runBatch({ ...inputOf(h, plan), sourceIds: ids.slice(4) })
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    const trace = proposal.context[0] as {
      previous: string[]
      contextHash: string
      register: unknown
      characters: unknown[]
      snapshot: { runKey: string }
    }
    expect(trace.previous).toEqual(['Two.', 'Three.', 'Four.'])
    expect(trace).toHaveProperty('register')
    expect(trace.characters).toEqual([])
    const stored = h.library.withWork(h.workId, (db) => getRunContext(db, trace.snapshot.runKey))!
    const rebuilt = rebuildTranslateRequest(trace, parseSnapshot(stored.snapshotJson), [
      { id: ids[4], text: 'Five.' }
    ])
    expect(rebuilt.matches).toBe(true)
  })
})

describe('the call budget of a run', () => {
  const blockedAnswer = (): Response =>
    new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant' }, finish_reason: 'content_filter: SAFETY' }],
        usage: { prompt_tokens: 1, completion_tokens: 0 }
      }),
      { status: 200 }
    )
  const base = (
    h: ReturnType<typeof setup>,
    plan: ReturnType<ParagraphTranslator['plan']>
  ): Omit<Parameters<ParagraphTranslator['runBatch']>[0], 'sourceIds'> => ({
    workId: h.workId,
    chapterId: h.chapterId,
    runId: plan.runId,
    connectionId: h.connectionId,
    entryId: h.entryId,
    settingsKey: plan.settingsKey,
    sourceRev: plan.sourceRev,
    targetRev: plan.targetRev,
    targetBaseContent: plan.targetBaseContent,
    policy: 'review'
  })

  it('is shared by the batches of one run, and the trace keeps what each batch used', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    const ids = plan.batches.flatMap((batch) => batch.sourceIds)
    const first = await h.translator.runBatch({ ...base(h, plan), sourceIds: [ids[0]] })
    expect(first.budget).toMatchObject({ used: 1, limit: 1 + 8 })
    const second = await h.translator.runBatch({ ...base(h, plan), sourceIds: [ids[1]] })
    expect(second.budget).toMatchObject({ used: 2, limit: 9, byRound: { main: 2 } })
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, first.proposalId!))
    expect((proposal.context[0] as { budget: unknown }).budget).toEqual({
      byRound: { main: 1, split: 0, bare: 0, repair: 0, fallback: 0, polish: 0 },
      httpAttempts: 1
    })
  })

  it('stops splitting when the run is out of calls, and a retry gets a fresh share', async () => {
    const text = Array.from({ length: 12 }, (_, i) => `BLOCKED ${i}.`).join('\n')
    const h = setup(text, '', undefined, () => blockedAnswer())
    const plan = h.translator.plan(h)
    const ids = plan.batches.flatMap((batch) => batch.sourceIds)
    const first = await h.translator.runBatch({ ...base(h, plan), sourceIds: ids })
    expect(h.calls).toHaveLength(1 + 8)
    expect(first.budget).toMatchObject({ used: 9, limit: 9, warn: true })
    expect(first.budgetIds.length).toBeGreaterThan(0)
    expect(first.error).toMatchObject({ kind: 'refused', haltsRun: false })

    const retry = await h.translator.runBatch({
      ...base(h, plan),
      sourceIds: first.budgetIds,
      retry: true
    })
    expect(retry.budget.limit).toBe(9 + 1 + 8)
    expect(retry.budget.used).toBeGreaterThan(9)
  })

  it('starts a fresh budget for a run it no longer holds', async () => {
    const h = setup()
    const plan = h.translator.plan(h)
    h.translator.finalize({
      workId: h.workId,
      chapterId: h.chapterId,
      runId: plan.runId,
      policy: 'review'
    })
    const batch = await h.translator.runBatch({
      ...base(h, plan),
      sourceIds: plan.batches.flatMap((item) => item.sourceIds)
    })
    expect(batch.budget).toMatchObject({ used: 1, limit: plan.batches.length + 8 })
  })
})

describe('the output mode of a run', () => {
  const runAll = async (
    h: ReturnType<typeof setup>
  ): Promise<Array<Awaited<ReturnType<ParagraphTranslator['runBatch']>>>> => {
    const plan = h.translator.plan(h)
    const results: Array<Awaited<ReturnType<ParagraphTranslator['runBatch']>>> = []
    for (const batch of plan.batches) {
      results.push(
        await h.translator.runBatch({
          workId: h.workId,
          chapterId: h.chapterId,
          runId: plan.runId,
          connectionId: h.connectionId,
          entryId: h.entryId,
          settingsKey: plan.settingsKey,
          sourceRev: plan.sourceRev,
          targetRev: plan.targetRev,
          targetBaseContent: plan.targetBaseContent,
          policy: 'review',
          sourceIds: batch.sourceIds
        })
      )
    }
    return results
  }
  const objectReply = (units: Array<{ id: string; src: string }>): Response =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: units.map((unit) => ({ id: unit.id, dst: 'VI:' + unit.src }))
              })
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }),
      { status: 200 }
    )

  it('sends no schema by default', async () => {
    const h = setup()
    const [batch] = await runAll(h)
    expect(h.bodies.every((body) => !('response_format' in body))).toBe(true)
    expect(batch.output).toEqual({
      mode: 'array',
      structure: { extraneous: 0, duplicate: 0, repaired: 0 }
    })
  })

  it('sends the schema when the Lab asks for it and records the mode in the trace', async () => {
    const h = setup('One.\n\nTwo.', '', undefined, objectReply, { outputSchema: true })
    const [batch] = await runAll(h)
    expect(h.bodies[0]).toHaveProperty('response_format')
    expect(batch.output.mode).toBe('object')
    expect(batch.proposed).toHaveLength(2)
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, batch.proposalId!))
    expect(proposal.context[0]).toMatchObject({ outputMode: 'object', fallbacks: 0 })
  })

  it('after one batch falls back, the later batches of the run send no schema', async () => {
    let first = true
    const h = setup(
      'One.\nTwo.\nThree.',
      '',
      undefined,
      () => {
        if (first) {
          first = false
          return new Response(
            JSON.stringify({ error: { code: 400, message: 'Invalid JSON schema' } }),
            { status: 400 }
          )
        }
        return null
      },
      { outputSchema: true }
    )
    // Giới hạn 1 token: mỗi lô xử lý một đoạn.
    h.translator['options'].connections.updateEntry(h.entryId, { settings: { inputTokenLimit: 1 } })
    const results = await runAll(h)
    expect(results.map((result) => result.output.mode)).toEqual([
      'object→fallback',
      'array',
      'array'
    ])
    expect(results[1].output.reason).toBe('run_fell_back')
    // Một lệnh gọi bị từ chối, sau đó các lệnh gọi tiếp theo đều không gửi kèm schema.
    expect(h.bodies.filter((body) => 'response_format' in body)).toHaveLength(1)
    const proposal = h.library.withWork(h.workId, (db) => getProposal(db, results[0].proposalId!))
    expect(proposal.context[0]).toMatchObject({ outputMode: 'object→fallback', fallbacks: 1 })
    expect(proposal.context[1]).toMatchObject({
      outputMode: 'array',
      outputModeReason: 'run_fell_back'
    })
  })
})
