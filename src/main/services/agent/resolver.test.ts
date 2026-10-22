import { afterEach, describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { LibraryStore } from '../library/library'
import { resolveTarget } from './resolver'
import type { ResolvedTarget } from '../../../shared/contracts/agent'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close()
    } catch {
      // ignore
    }
  }
})

describe('target resolver', () => {
  function setup() {
    const dir = tempDir()
    const library = LibraryStore.open({ dataDir: dir, now: () => 1000 })
    stores.push(library)

    const work1 = library.create({ title: 'Tác phẩm A', sourceLang: 'ja' })
    const ch1_1 = library.createChapter(work1.id, 'Khởi đầu')
    const ch1_2 = library.createChapter(work1.id, 'Hành trình')

    const work2 = library.create({ title: 'Tác phẩm B', sourceLang: 'en' })
    const ch2_1 = library.createChapter(work2.id, 'Chương 1')
    const ch2_2 = library.createChapter(work2.id, 'Khởi đầu') // Trùng tên chương với work 1

    const work3 = library.create({ title: 'Tác phẩm A', sourceLang: 'zh' }) // Trùng tên tác phẩm với work 1
    const ch3_1 = library.createChapter(work3.id, 'Mở màn')

    return {
      library,
      work1,
      work2,
      work3,
      ch1_1: ch1_1.chapter,
      ch1_2: ch1_2.chapter,
      ch2_1: ch2_1.chapter,
      ch2_2: ch2_2.chapter,
      ch3_1: ch3_1.chapter
    }
  }

  it('resolves "chương này" từ ngữ cảnh', () => {
    const { library, work1, ch1_1 } = setup()

    const res = resolveTarget(library, {
      selector: { relative: 'current_chapter' },
      context: { workId: work1.id, chapterId: ch1_1.id }
    })

    expect(res.status).toBe('resolved')
    if (res.status === 'resolved') {
      expect(res.target).toEqual({
        kind: 'chapter',
        workId: work1.id,
        workLabel: 'Tác phẩm A',
        chapterId: ch1_1.id,
        chapterLabel: 'Khởi đầu',
        side: undefined,
        range: undefined
      })
    }
  })

  it('fails with not_found when "chương này" points to a deleted resource', () => {
    const { library, work1, ch1_1 } = setup()
    library.deleteChapter(work1.id, ch1_1.id)

    const res = resolveTarget(library, {
      selector: { relative: 'current_chapter' },
      context: { workId: work1.id, chapterId: ch1_1.id }
    })

    expect(res.status).toBe('not_found')
  })

  it('resolves chương khác cùng work khi có work trong context', () => {
    const { library, work1, ch1_2 } = setup()

    const res = resolveTarget(library, {
      selector: { chapterNumber: 2 },
      context: { workId: work1.id }
    })

    expect(res.status).toBe('resolved')
    if (res.status === 'resolved') {
      expect(res.target).toEqual({
        kind: 'chapter',
        workId: work1.id,
        workLabel: 'Tác phẩm A',
        chapterId: ch1_2.id,
        chapterLabel: 'Hành trình',
        side: undefined,
        range: undefined
      })
    }
  })

  it('resolves chapter ở work khác khi nêu rõ tên tác phẩm', () => {
    const { library, work1, work2, ch2_1 } = setup()

    // Context is work 1, but selector targets work 2 explicitly
    const res = resolveTarget(library, {
      selector: { workTitle: 'Tác phẩm B', chapterNumber: 1 },
      context: { workId: work1.id }
    })

    expect(res.status).toBe('resolved')
    if (res.status === 'resolved') {
      expect(res.target).toEqual({
        kind: 'chapter',
        workId: work2.id,
        workLabel: 'Tác phẩm B',
        chapterId: ch2_1.id,
        chapterLabel: 'Chương 1',
        side: undefined,
        range: undefined
      })
    }
  })

  it('returns ambiguous khi có nhiều tác phẩm trùng tên', () => {
    const { library } = setup()

    const res = resolveTarget(library, {
      selector: { workTitle: 'Tác phẩm A' }
    })

    expect(res.status).toBe('ambiguous')
    if (res.status === 'ambiguous') {
      expect(res.candidates).toHaveLength(2)
      expect(res.reason).toContain('trùng tên')
    }
  })

  it('returns ambiguous khi tìm chương trùng tên không có work context', () => {
    const { library } = setup()

    // 'Khởi đầu' exists in both work 1 and work 2
    const res = resolveTarget(library, {
      selector: { chapterTitle: 'Khởi đầu' }
    })

    expect(res.status).toBe('ambiguous')
    if (res.status === 'ambiguous') {
      expect(res.candidates).toHaveLength(2)
    }
  })

  it('retry không resolve lại: giữ nguyên currentResolvedTarget bất biến', () => {
    const { library, work1, ch1_1 } = setup()

    const existingTarget: ResolvedTarget = {
      kind: 'chapter',
      workId: work1.id,
      workLabel: 'Custom Label',
      chapterId: ch1_1.id,
      chapterLabel: 'Custom Chapter'
    }

    // Pass selector that would otherwise resolve differently or fail
    const res = resolveTarget(library, {
      selector: { workTitle: 'Nonexistent', chapterNumber: 999 },
      currentResolvedTarget: existingTarget
    })

    expect(res.status).toBe('resolved')
    if (res.status === 'resolved') {
      expect(res.target).toBe(existingTarget)
    }
  })

  describe('tác phẩm đang mở trong snapshot', () => {
    function openWorks(titles: string[]) {
      const dir = tempDir()
      const library = LibraryStore.open({ dataDir: dir, now: () => 1000 })
      stores.push(library)
      const works = titles.map((title) => library.create({ title, sourceLang: 'zh' }))
      for (const work of works) library.createChapter(work.id, 'Chương 1')
      return { library, works }
    }

    it('resolves lệnh không nêu tác phẩm về tác phẩm đang mở', () => {
      const { library, works } = openWorks(['New', 'ádasd'])

      const res = resolveTarget(library, { selector: {}, context: { workId: works[0]!.id } })

      expect(res).toEqual({
        status: 'resolved',
        target: { kind: 'work', workId: works[0]!.id, workLabel: 'New' }
      })
    })

    it('chỉ sang tác phẩm khác khi mô tả nêu rõ nó', () => {
      const { library, works } = openWorks(['New', 'ádasd'])

      const res = resolveTarget(library, {
        selector: { workTitle: 'ádasd', chapterNumber: 1 },
        context: { workId: works[0]!.id }
      })

      expect(res.status).toBe('resolved')
      if (res.status === 'resolved') {
        expect(res.target).toMatchObject({ kind: 'chapter', workId: works[1]!.id })
      }
    })

    it('hỏi lại khi mô tả khớp cả tác phẩm đang mở và tác phẩm khác', () => {
      const { library, works } = openWorks(['Kiếm Đạo', 'Kiếm Thần'])

      const res = resolveTarget(library, {
        selector: { workTitle: 'Kiếm' },
        context: { workId: works[0]!.id }
      })

      expect(res.status).toBe('ambiguous')
      if (res.status === 'ambiguous') {
        expect(res.candidates.map((c) => c.workId).sort()).toEqual(works.map((w) => w.id).sort())
      }
    })

    it('resolves thẳng tác phẩm đang mở khi mô tả chỉ khớp nó', () => {
      const { library, works } = openWorks(['Kiếm Đạo', 'Hoa Sen'])

      const res = resolveTarget(library, {
        selector: { workTitle: 'kiếm' },
        context: { workId: works[0]!.id }
      })

      expect(res).toEqual({
        status: 'resolved',
        target: { kind: 'work', workId: works[0]!.id, workLabel: 'Kiếm Đạo' }
      })
    })
  })
})
