import { describe, expect, it } from 'vitest'
import { setupAgent } from '../agentTestKit'
import { updateWorkCapability } from './writeCapabilities'

describe('update_work', () => {
  const run = (setup: ReturnType<typeof setupAgent>, args: object) =>
    updateWorkCapability.handler({
      turnId: 't',
      commandId: 'c',
      target: { kind: 'work', workId: setup.work1.id, workLabel: setup.work1.title },
      args,
      library: setup.library,
      now: 0
    })

  it('updates work details, keeps the old title as the original, and renames chapters', async () => {
    const setup = setupAgent()
    const res = await run(setup, {
      work: { title: 'Great Dao', author: 'Unknown', status: 'in-progress' },
      chapters: [{ number: 2, title: 'Chapter Two' }]
    })

    expect(res.ok).toBe(true)
    expect(res.value).toMatchObject({
      work: {
        title: { from: 'Đại Đạo Triều Thiên', to: 'Great Dao' },
        originalTitle: { from: null, to: 'Đại Đạo Triều Thiên' },
        author: { to: 'Unknown' }
      },
      chapters: [{ number: 2, to: 'Chapter Two' }]
    })
    const work = setup.library.get(setup.work1.id)
    expect(work).toMatchObject({
      title: 'Great Dao',
      originalTitle: 'Đại Đạo Triều Thiên',
      author: 'Unknown',
      status: 'in-progress'
    })
    expect(setup.library.listChapters(setup.work1.id)[1]!.title).toBe('Chapter Two')
  })

  it('keeps an original title the model sends explicitly', async () => {
    const setup = setupAgent()
    await run(setup, { work: { title: 'Great Dao', originalTitle: '大道朝天' } })

    expect(setup.library.get(setup.work1.id).originalTitle).toBe('大道朝天')
  })

  it('writes nothing when a chapter number does not exist', async () => {
    const setup = setupAgent()
    const res = await run(setup, {
      work: { title: 'Great Dao' },
      chapters: [
        { number: 1, title: 'One' },
        { number: 99, title: 'Lost' }
      ]
    })

    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('not_found')
    expect(setup.library.get(setup.work1.id).title).toBe('Đại Đạo Triều Thiên')
    expect(setup.library.listChapters(setup.work1.id)[0]!.title).not.toBe('One')
  })
})
