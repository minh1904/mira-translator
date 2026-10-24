import { describe, expect, it } from 'vitest'
import { writeConvention } from '../../../infra/storage/workConventions'
import { setupAgent } from '../../agent/agentTestKit'
import { buildClassifyMessages } from '../glossaryExtraction'
import { parseSnapshot, promptFromSnapshot, takeContextSnapshot } from './contextSnapshot'
import { buildTranslateRequest } from './translatePrompt'

const system = (snapshotJson: string): string =>
  buildTranslateRequest(promptFromSnapshot(parseSnapshot(snapshotJson), 'アキラさん', []), [
    { tempId: '[1]', originalId: 's', text: 'アキラさん' }
  ]).messages[0]!.content

describe('work conventions in prompts', () => {
  it('names Japanese people in the romanization style of the work', () => {
    const rule = (style: 'hepburn_plain' | 'hepburn_macron' | 'wapuro') =>
      buildClassifyMessages('ja', [], [], [], style)[0]!.content
    expect(rule('hepburn_plain')).toContain('bỏ dấu nguyên âm dài (Ryota, Yuki)')
    expect(rule('hepburn_macron')).toContain('giữ dấu nguyên âm dài (Ryōta, Yūki)')
    expect(rule('wapuro')).toContain('(Ryouta, Yuuki)')
  })

  it('a work that localizes honorifics says so in the translation prompt; a pinned snapshot keeps its own', () => {
    const kit = setupAgent()
    const work = kit.library.create({ title: 'Thử', sourceLang: 'ja' })
    const chapter = kit.library.createChapter(work.id, 'Chương 3').chapter
    const pinned = takeContextSnapshot(kit.library, work.id, chapter.id, 'アキラさん')
    expect(system(pinned.json)).toContain('Giữ hậu tố gắn sau tên')

    kit.library.withWork(work.id, (db) => writeConvention(db, 'honorifics', 'vietnamize', true, 2))
    const fresh = takeContextSnapshot(kit.library, work.id, chapter.id, 'アキラさん')
    expect(system(fresh.json)).toContain('Việt hóa kính ngữ gắn sau tên')
    expect(system(fresh.json)).not.toContain('Giữ hậu tố gắn sau tên')
    // The item that pinned before the change still translates with what it pinned.
    expect(system(pinned.json)).toContain('Giữ hậu tố gắn sau tên')
    expect(pinned.json).not.toContain('honorifics')
  })
})
