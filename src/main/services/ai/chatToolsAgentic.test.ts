import { describe, expect, it } from 'vitest'
import type { AddressingDyadResolved, CharacterItem } from '../../../shared/contracts/addressing'
import type { ChatLocation } from '../../../shared/contracts/aiChat'
import type { ChapterItem } from '../../../shared/contracts/chapters'
import type { ContextEntryItem } from '../../../shared/contracts/glossary'
import type { LinkRecord } from '../../../shared/contracts/links'
import type { SegmentRecord, TextRecord, TextSide } from '../../../shared/contracts/text'
import {
  CHAT_TOOL_DEFINITIONS,
  MAX_PROPOSALS_PER_TURN,
  createChatTools,
  type ChatToolLibrary,
  type ChatToolWrites,
  type ToolProposalInput
} from './chatTools'

/**
 * Công cụ cho trợ lý AI trò chuyện: thông tin vị trí người dùng, các đoạn văn kèm bản dịch tương ứng,
 * bảng thuật ngữ và xưng hô đã duyệt, cùng các công cụ ghi dữ liệu dưới dạng đề xuất.
 *
 * Quy tắc kiểm thử: thao tác đọc không thay đổi dữ liệu; thao tác ghi gắn liền với phiên bản (revision) hiện tại
 * và từ chối nếu mô hình đọc phiên bản cũ; từ chối dịch nếu đoạn đã được liên kết; và dừng đề xuất khi đạt giới hạn.
 */

const WORK = 'work-1'
const OPEN = 'ch-4'

function record(content: string, cuts: Array<[string, string]>, rev = 1): TextRecord {
  const segments: SegmentRecord[] = cuts.map(([id, text]) => {
    const start = content.indexOf(text)
    return { id, start, end: start + text.length, textRev: rev, status: 'ok' }
  })
  return { content, rev, segments }
}

function link(id: string, members: string[]): LinkRecord {
  return {
    id,
    chapterId: OPEN,
    kind: 'user',
    confidence: null,
    status: 'ok',
    members,
    createdAt: 0,
    reviewedAt: null
  }
}

function chapter(number: number, id: string): ChapterItem {
  return {
    id,
    number,
    title: 'Chương ' + number,
    createdAt: 0,
    updatedAt: 0,
    hasSource: true,
    hasTarget: true
  }
}

function term(
  source: string,
  target: string,
  status: ContextEntryItem['status'],
  aliases: string[] = []
): ContextEntryItem {
  return {
    id: source,
    kind: 'term',
    source,
    target,
    status,
    origin: 'user',
    forbidden: false,
    fromChapterId: null,
    toChapterId: null,
    notes: null,
    aliases,
    createdAt: 0,
    updatedAt: 0
  }
}

function character(source: string, target: string): CharacterItem {
  return {
    id: source,
    source,
    target,
    gender: 'male',
    role: null,
    status: 'approved',
    notes: null,
    aliases: [],
    createdAt: 0,
    updatedAt: 0
  }
}

function dyad(
  from: string,
  to: string,
  status: AddressingDyadResolved['status']
): AddressingDyadResolved {
  return {
    id: from + to,
    sourceCharacterId: from,
    targetCharacterId: to,
    speakerPronoun: 'ta',
    recipientPronoun: 'ngươi',
    formality: null,
    status,
    fromChapterId: null,
    toChapterId: null,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    sourceCharacter: character(from, from === '林' ? 'Lâm' : 'Vương'),
    targetCharacter: character(to, to === '林' ? 'Lâm' : 'Vương')
  }
}

interface Fixture {
  source: TextRecord
  target: TextRecord
  links: LinkRecord[]
}

/** Bốn đoạn gốc; hai đoạn đầu đã dịch và liên kết, hai đoạn sau chưa dịch. */
function fixture(): Fixture {
  return {
    source: record('一。\n\n二。\n\n三。\n\n四。', [
      ['s1', '一。'],
      ['s2', '二。'],
      ['s3', '三。'],
      ['s4', '四。']
    ]),
    target: record('Một.\n\nHai.', [
      ['t1', 'Một.'],
      ['t2', 'Hai.']
    ]),
    links: [link('l1', ['s1', 't1']), link('l2', ['s2', 't2'])]
  }
}

function libraryOf(texts: Fixture = fixture()): ChatToolLibrary & { texts: Fixture } {
  return {
    texts,
    listChapters: () => [chapter(3, 'ch-3'), chapter(4, OPEN)],
    readText: (_workId: string, chapterId: string, side: TextSide) =>
      chapterId === OPEN ? texts[side] : { content: '', rev: 0, segments: [] },
    listLinks: (_workId, chapterId) => (chapterId === OPEN ? texts.links : []),
    listGlossary: () => [
      term('魔王', 'Ma vương', 'approved', ['大魔王']),
      term('魔法', 'Ma pháp', 'pending'),
      term('魔族', 'Ma tộc', 'rejected'),
      term('勇者', 'Dũng giả', 'approved')
    ],
    listAddressing: () => [dyad('林', '王', 'approved'), dyad('王', '林', 'pending')]
  }
}

function writesOf(): ChatToolWrites & { proposals: ToolProposalInput[]; terms: unknown[] } {
  const proposals: ToolProposalInput[] = []
  const terms: unknown[] = []
  return {
    proposals,
    terms,
    createProposal: (_workId, input) => {
      proposals.push(input)
      return { proposalId: 'p' + proposals.length, partIds: ['part' + proposals.length] }
    },
    createTerm: (_workId, input) => {
      if (input.term === '魔王') throw new Error('Thuật ngữ "魔王" đã có trong glossary.')
      terms.push(input)
      return { entryId: 'e' + terms.length }
    }
  }
}

const NOWHERE: ChatLocation = { caret: { source: null, target: null }, selection: null }

function tools(
  library = libraryOf(),
  writes: ChatToolWrites | null = writesOf(),
  location: ChatLocation = NOWHERE
): ReturnType<typeof createChatTools> {
  return createChatTools(library, WORK, {
    chapterId: OPEN,
    location,
    turnId: 'turn',
    ...(writes ? { writes } : {})
  })
}

let id = 0
const call = (name: string, args: unknown = {}): { id: string; name: string; args: string } => ({
  id: 'c' + ++id,
  name,
  args: JSON.stringify(args)
})

describe('the tool list', () => {
  it('starts with where the user is, and says the text tools only propose', () => {
    const names = CHAT_TOOL_DEFINITIONS.map((tool) => tool.function.name)
    expect(names).toEqual([
      'get_current_chapter',
      'list_chapters',
      'read_chapter',
      'read_segments',
      'search_work',
      'list_glossary',
      'list_addressing',
      'propose_edit',
      'propose_translation',
      'propose_glossary_term'
    ])
    for (const tool of CHAT_TOOL_DEFINITIONS.filter((item) =>
      // A glossary term applies at once (change unblock-auto-translate-context); text edits wait.
      ['propose_edit', 'propose_translation'].includes(item.function.name)
    )) {
      expect(tool.function.description).toContain('ĐỀ XUẤT')
      expect(tool.function.description).toMatch(/chờ (người dùng )?duyệt/)
    }
  })

  it('has no parameter that names a work', () => {
    const text = JSON.stringify(CHAT_TOOL_DEFINITIONS).toLowerCase()
    expect(text).not.toContain('workid')
    expect(text).not.toContain('"work"')
  })
})

describe('get_current_chapter', () => {
  it('says where the user is and how far the chapter is translated, with no text', () => {
    const result = tools(libraryOf(), null, {
      caret: { source: 3, target: 2 },
      selection: { side: 'target', from: 1, to: 2 }
    }).run(call('get_current_chapter'))
    expect(result.status).toBe('ok')
    expect(result.content).toContain('Chương 4 «Chương 4» là chương đang mở.')
    expect(result.content).toContain('Bản gốc: 4 đoạn (rev 1). Bản dịch: 2 đoạn (rev 1).')
    expect(result.content).toContain('Đã dịch (có liên kết căn chỉnh): 2/4 đoạn gốc.')
    expect(result.content).toContain('Con trỏ: đoạn 3 bản gốc, đoạn 2 bản dịch.')
    expect(result.content).toContain('Vùng chọn: đoạn 1–2 bản dịch.')
    expect(result.content).not.toContain('Một.')
    expect(result.content).not.toContain('一。')
  })

  it('says when there is no selection and no caret', () => {
    const result = tools().run(call('get_current_chapter'))
    expect(result.content).toContain('Con trỏ: chưa đặt.')
    expect(result.content).toContain('Vùng chọn: không có.')
  })
})

describe('read_segments', () => {
  it('gives each paragraph with its linked counterpart, and says which are not aligned', () => {
    const result = tools().run(
      call('read_segments', { chapter: 4, from: 1, to: 3, side: 'source' })
    )
    expect(result.status).toBe('ok')
    expect(result.content).toContain('[1] 一。\n   bản dịch: Một.')
    expect(result.content).toContain('[2] 二。\n   bản dịch: Hai.')
    expect(result.content).toContain('[3] 三。\n   bản dịch: chưa căn chỉnh.')
    expect(result.detail).toBe('Chương 4 · bản gốc — đoạn 1–3 kèm đoạn tương ứng')
  })

  it('reads from the translation side too', () => {
    const result = tools().run(
      call('read_segments', { chapter: 4, from: 2, to: 2, side: 'target' })
    )
    expect(result.content).toContain('[2] Hai.\n   bản gốc: 二。')
  })

  it('refuses a range outside the chapter or upside down', () => {
    const outside = tools().run(
      call('read_segments', { chapter: 4, from: 3, to: 5, side: 'source' })
    )
    expect(outside).toMatchObject({ status: 'error' })
    expect(outside.content).toContain('có 4 đoạn; không có đoạn 3–5')
    const reversed = tools().run(
      call('read_segments', { chapter: 4, from: 3, to: 1, side: 'source' })
    )
    expect(reversed.status).toBe('error')
  })

  it('stops on a paragraph bound when the turn is almost out of characters', () => {
    const result = tools().run(
      call('read_segments', { chapter: 4, from: 1, to: 4, side: 'source' }),
      {
        remainingChars: 70
      }
    )
    expect(result.content).toMatch(/Dừng ở đoạn \d vì trần ký tự; đọc tiếp từ đoạn \d\./)
    expect(result.content).not.toContain('[4]')
  })
})

describe('list_glossary and list_addressing', () => {
  it('returns approved terms only, filtered on the source, its variants or the translation', () => {
    const all = tools().run(call('list_glossary'))
    expect(all.content).toContain('魔王')
    expect(all.content).toContain('勇者')
    expect(all.content).not.toContain('魔法')
    expect(all.content).not.toContain('魔族')

    const filtered = tools().run(call('list_glossary', { query: '魔' }))
    expect(filtered.content).toContain('- 魔王 (aliases: 大魔王) → Ma vương')
    expect(filtered.content).not.toContain('勇者')
    expect(filtered.detail).toBe('Thuật ngữ "魔" — 1/1 mục')
  })

  it('caps the number of entries', () => {
    expect(tools().run(call('list_glossary', { limit: 1 })).content).toContain('trả 1')
    expect(tools().run(call('list_glossary', { limit: 99 })).status).toBe('error')
  })

  it('returns approved addressing pairs only, filtered by character name', () => {
    const result = tools().run(call('list_addressing', { character: 'Lâm' }))
    expect(result.content).toContain('1 cặp đã duyệt')
    expect(result.content).toContain('Lâm → Vương')
    expect(result.content).not.toContain('Vương → Lâm')
  })
})

describe('propose_edit', () => {
  it('turns paragraphs 7–9 into a character range, anchored at the revision, that applies cleanly', () => {
    const content = Array.from({ length: 10 }, (_, index) => `Đoạn ${index + 1}.`).join('\n\n')
    const library = libraryOf({ ...fixture(), target: record(content, [], 5) })
    const writes = writesOf()
    const result = tools(library, writes).run(
      call('propose_edit', { chapter: 4, from: 7, to: 9, text: 'Bảy mới.\nTám mới.\nChín mới.' })
    )
    expect(result).toMatchObject({
      status: 'ok',
      proposal: {
        type: 'edit',
        proposalId: 'p1',
        partIds: ['part1'],
        label: 'Sửa đoạn 7–9 bản dịch'
      }
    })
    const [input] = writes.proposals
    expect(input).toMatchObject({ turnId: 'turn', commandId: 'turn:1', targetBaseRev: 5 })
    expect(input.part.beforeText).toBe('Đoạn 7.\n\nĐoạn 8.\n\nĐoạn 9.')
    // Giữ nguyên các dòng trống giữa các đoạn văn.
    expect(input.part.afterText).toBe('Bảy mới.\n\nTám mới.\n\nChín mới.')
    const applied =
      content.slice(0, input.part.baseFrom!) +
      input.part.afterText +
      content.slice(input.part.baseTo!)
    expect(applied).toBe(
      content.replace('Đoạn 7.\n\nĐoạn 8.\n\nĐoạn 9.', 'Bảy mới.\n\nTám mới.\n\nChín mới.')
    )
  })

  it('refuses an empty or upside-down range, one outside the translation, and unchanged text', () => {
    const writes = writesOf()
    const run = (args: unknown): string =>
      tools(libraryOf(), writes).run(call('propose_edit', args)).content
    expect(run({ chapter: 4, from: 2, to: 1, text: 'x' })).toContain('1 ≤ from ≤ to')
    expect(run({ chapter: 4, from: 1, to: 1, text: '   ' })).toContain('Thiếu văn bản')
    expect(run({ chapter: 4, from: 2, to: 3, text: 'x' })).toContain('Bản dịch có 2 đoạn')
    expect(run({ chapter: 4, from: 2, to: 2, text: 'Hai.' })).toContain(
      'trùng với bản dịch hiện có'
    )
    expect(writes.proposals).toEqual([])
  })

  it('only proposes for the chapter that is open', () => {
    const result = tools().run(call('propose_edit', { chapter: 3, from: 1, to: 1, text: 'x' }))
    expect(result.status).toBe('error')
    expect(result.content).toContain('Chỉ đề xuất được cho chương đang mở (chương 4)')
  })

  it('refuses when the translation changed since this turn read it', () => {
    const library = libraryOf()
    const runner = tools(library)
    runner.run(call('read_chapter', { chapter: 4, side: 'target' }))
    library.texts.target = { ...library.texts.target, rev: 2 }
    const result = runner.run(
      call('propose_edit', { chapter: 4, from: 1, to: 1, text: 'Một khác.' })
    )
    expect(result.status).toBe('error')
    expect(result.content).toContain('bản dịch rev 1 → 2')
    expect(result.content).toContain('đọc lại')
  })

  it('answers that it cannot propose when the turn has no way to write', () => {
    const result = tools(libraryOf(), null).run(
      call('propose_edit', { chapter: 4, from: 1, to: 1, text: 'x' })
    )
    expect(result).toMatchObject({ status: 'error', detail: 'Lượt này không được tạo đề xuất.' })
  })

  it('returns a store failure to the model instead of ending the turn', () => {
    const writes = writesOf()
    writes.createProposal = () => {
      throw new Error('Vùng thay thế không khớp bản dịch lúc đề xuất.')
    }
    const result = tools(libraryOf(), writes).run(
      call('propose_edit', { chapter: 4, from: 1, to: 1, text: 'Một khác.' })
    )
    expect(result).toMatchObject({
      status: 'error',
      content: 'LỖI: Vùng thay thế không khớp bản dịch lúc đề xuất.'
    })
  })
})

describe('propose_translation', () => {
  it('places new paragraphs after the nearest linked translation', () => {
    const writes = writesOf()
    const result = tools(libraryOf(), writes).run(
      call('propose_translation', { chapter: 4, from: 3, to: 4, text: 'Ba.\nBốn.' })
    )
    expect(result).toMatchObject({
      status: 'ok',
      proposal: { type: 'translation', label: 'Dịch đoạn 3–4 bản gốc' }
    })
    expect(result.content).toContain('sau đoạn 2 bản dịch')
    expect(writes.proposals[0].part).toMatchObject({
      beforeText: 'Hai.',
      afterText: 'Hai.\n\nBa.\n\nBốn.',
      sourceOrder: 2,
      sourceText: '三。\n\n四。',
      status: 'pending'
    })
  })

  it('writes into an empty translation the way a chapter translation does', () => {
    const writes = writesOf()
    const empty = { ...fixture(), target: record('', []), links: [] }
    tools(libraryOf(empty), writes).run(
      call('propose_translation', { chapter: 4, from: 1, to: 2, text: 'Một.\nHai.' })
    )
    expect(writes.proposals[0].part).toMatchObject({
      baseFrom: 0,
      baseTo: 0,
      beforeText: '',
      afterText: 'Một.\n\nHai.',
      sourceOrder: 0,
      status: 'pending'
    })
  })

  it('refuses a paragraph that already has a linked translation, pointing to propose_edit', () => {
    const writes = writesOf()
    const result = tools(libraryOf(), writes).run(
      call('propose_translation', { chapter: 4, from: 2, to: 3, text: 'Hai.\nBa.' })
    )
    expect(result.status).toBe('error')
    expect(result.content).toContain('Đoạn gốc 2 đã có bản dịch liên kết; dùng propose_edit')
    expect(writes.proposals).toEqual([])
  })

  it('refuses a translation with a different number of lines than source paragraphs', () => {
    const result = tools().run(
      call('propose_translation', { chapter: 4, from: 3, to: 4, text: 'Ba và bốn.' })
    )
    expect(result.status).toBe('error')
    expect(result.content).toContain('cần đúng 2 dòng dịch, mỗi dòng một đoạn; nhận 1')
  })
})

describe('propose_glossary_term', () => {
  it('adds a term and reports it', () => {
    const writes = writesOf()
    const result = tools(libraryOf(), writes).run(
      call('propose_glossary_term', {
        term: '魔族',
        translation: 'Ma tộc',
        variants: ['魔物', '魔族'],
        note: 'Chủng tộc'
      })
    )
    expect(result).toMatchObject({
      status: 'ok',
      proposal: { type: 'term', entryId: 'e1', term: '魔族', translation: 'Ma tộc' }
    })
    expect(writes.terms).toEqual([
      { term: '魔族', translation: 'Ma tộc', variants: ['魔物'], note: 'Chủng tộc' }
    ])
  })

  it('reports a term the glossary already has as an error, without throwing', () => {
    const result = tools().run(
      call('propose_glossary_term', { term: '魔王', translation: 'Quỷ vương' })
    )
    expect(result).toMatchObject({ status: 'error' })
    expect(result.content).toContain('đã có trong glossary')
  })
})

describe('the proposal cap', () => {
  it('makes no proposal past the cap and says so', () => {
    const writes = writesOf()
    const runner = tools(libraryOf(), writes)
    for (let index = 0; index < MAX_PROPOSALS_PER_TURN; index++) {
      const result = runner.run(
        call('propose_glossary_term', { term: 'T' + index, translation: 'D' + index })
      )
      expect(result.status).toBe('ok')
    }
    const eleventh = runner.run(
      call('propose_edit', { chapter: 4, from: 1, to: 1, text: 'Một khác.' })
    )
    expect(eleventh.status).toBe('error')
    expect(eleventh.content).toContain(`Đã đạt trần ${MAX_PROPOSALS_PER_TURN} đề xuất của lượt`)
    expect(writes.terms).toHaveLength(MAX_PROPOSALS_PER_TURN)
    expect(writes.proposals).toEqual([])
  })

  it('charges the text a write takes in, and refuses one the turn can no longer afford', () => {
    const runner = tools()
    const ok = runner.run(call('propose_edit', { chapter: 4, from: 1, to: 1, text: 'Một khác.' }))
    expect(ok.charge).toBeGreaterThan(ok.content.length)
    const poor = runner.run(
      call('propose_edit', { chapter: 4, from: 2, to: 2, text: 'Hai khác.' }),
      {
        remainingChars: 5,
        turnBudget: 80_000
      }
    )
    expect(poor.status).toBe('error')
    expect(poor.content).toContain('Hết ngân sách ký tự của lượt')
  })
})
