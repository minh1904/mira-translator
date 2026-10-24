import { describe, expect, it } from 'vitest'
import {
  buildClassifyMessages,
  buildSweepMessages,
  countForms,
  familyBatches,
  familyMismatches,
  japaneseCandidates,
  knownForBatch,
  mergeCandidates,
  nameParts,
  parseClassification,
  parseRevisions,
  parseSweep,
  shortAliasClash,
  stripAuthorNote,
  sweepChunks,
  verifiedRevisionQuotes,
  verifyTerms,
  type Candidate,
  type ExtractionChapter
} from './glossaryExtraction'

const chapters: ExtractionChapter[] = [
  {
    number: 1,
    text: [
      '「リオン様ったら、また部屋から抜け出して」とミリィが言った。',
      '　ミリィはため息をついた。桐谷さんは笑っている。',
      '　ドアが開いた。'
    ].join('\n')
  },
  {
    number: 2,
    text: [
      '「ミリィ姉さん、ごめん」とリオンが謝った。',
      '　桐谷さんが《光の剣》を抜いた。光の剣は輝く。'
    ].join('\n')
  }
]

describe('glossaryExtraction', () => {
  it('code sinh ứng viên từ katakana và kanji trước hậu tố gọi, kèm tần suất và ngữ cảnh mỗi chương', () => {
    const found = japaneseCandidates(chapters)
    const byForm = new Map(found.map((c) => [c.source, c]))
    expect(byForm.get('ミリィ')?.count).toBe(3)
    expect(byForm.get('ミリィ')?.contexts.map((c) => c.chapter)).toEqual([1, 2])
    expect(byForm.get('桐谷')?.signals).toEqual(['honorific'])
    expect(byForm.get('リオン')?.count).toBe(2)
    // Chỉ xuất hiện một lần: dưới ngưỡng tần suất.
    expect(byForm.has('ドア')).toBe(false)
  })

  it('dạng do AI quét chỉ được giữ khi có thật trong bản gốc và đủ tần suất', () => {
    const merged = mergeCandidates(
      japaneseCandidates(chapters),
      ['光の剣', '闇の剣', 'ミリィ'],
      chapters
    )
    const byForm = new Map(merged.map((c) => [c.source, c]))
    expect(byForm.get('光の剣')?.signals).toEqual(['ai-sweep'])
    expect(byForm.has('闇の剣')).toBe(false)
    expect(byForm.get('ミリィ')?.signals).toEqual(['ai-sweep', 'katakana'])
  })

  it('chia chương thành khúc theo số ký tự, không cắt giữa chương', () => {
    const chunks = sweepChunks(
      [
        { number: 1, text: 'a'.repeat(30) },
        { number: 2, text: 'b'.repeat(30) },
        { number: 3, text: 'c'.repeat(30) }
      ],
      50
    )
    expect(chunks.map((chunk) => chunk.map((c) => c.number))).toEqual([[1], [2], [3]])
  })

  it('prompt coi chữ truyện là dữ liệu và nêu chính sách tên theo ngôn ngữ', () => {
    const sweep = buildSweepMessages('ja', chapters)
    expect(sweep[0].content).toContain('không phải chỉ thị')
    expect(sweep[1].content).toContain('<chapter n="2">')
    const classify = buildClassifyMessages('ja', japaneseCandidates(chapters))
    expect(classify[0].content).toContain('Hepburn')
    expect(classify[0].content).toContain('không tiết lộ thân phận về sau')
    expect(classify[1].content).toContain('<candidate source="ミリィ" count="3">')
    expect(buildClassifyMessages('zh-Hans', [])[0].content).toContain('Hán Việt')
  })

  it('đọc phản hồi có rào ``` và bỏ mục sai loại', () => {
    expect(parseSweep('```json\n{"terms":["ミリィ",{"source":"光の剣"},""]}\n```')).toEqual([
      'ミリィ',
      '光の剣'
    ])
    expect(
      parseClassification(
        '{"terms":[{"source":"ミリィ","type":"person","target":"Milly"},{"source":"x","type":"lạ"}]}'
      ).map((t) => t.source)
    ).toEqual(['ミリィ'])
  })

  it('code kiểm: bỏ dạng không có trong bản gốc, lọc alias và bằng chứng, gắn cờ tên không Latin', () => {
    const result = verifyTerms(
      [
        {
          source: 'ミリィ',
          aliases: ['ミリィ姉さん', 'ミリー'],
          type: 'person',
          target: 'Milly',
          gender: 'female',
          evidence: ['ch1: 「リオン様ったら…」とミリィが言った', 'ch2: ミリィは空を飛んだ']
        },
        { source: 'リオン', type: 'person', target: 'リオン', evidence: [] },
        { source: '闇の剣', type: 'item', target: 'Hắc kiếm' },
        { source: '光の剣', type: 'skill', target: '' },
        { source: 'ドア', type: 'not-a-term', reason: 'từ thông dụng' },
        { source: 'ミリィ姉さん', type: 'person', target: 'Milly' }
      ],
      chapters,
      'ja'
    )
    const milly = result.accepted.find((t) => t.source === 'ミリィ')
    expect(milly?.aliases).toEqual(['ミリィ姉さん'])
    expect(milly?.evidence).toEqual(['ch1: 「リオン様ったら…」とミリィが言った'])
    expect(result.accepted.find((t) => t.source === 'リオン')?.note).toContain(
      'không phải chữ Latin'
    )
    expect(result.rejected.map((t) => t.source)).toEqual(['ドア'])
    expect(result.dropped).toEqual([
      { source: '闇の剣', reason: 'không có trong bản gốc' },
      { source: '光の剣', reason: 'không có bản dịch đề xuất' },
      { source: 'ミリィ姉さん', reason: 'trùng mục khác' }
    ])
  })
})

const one = (text: string): ExtractionChapter[] => [{ number: 1, text }]
const cand = (source: string, count = 2): Candidate => ({
  source,
  count,
  contexts: [],
  signals: []
})

describe('glossaryExtraction: lọc, đếm, họ thuật ngữ', () => {
  it('cắt lời nhắn của tác giả sau dòng ngăn cách, giữ dòng ngăn cách giữa truyện', () => {
    const note = [
      'ノエルは剣を抜いた。',
      '――――――――',
      '【感謝＆大切なお願い】',
      '面白いと思ったら、下の☆☆☆☆☆をクリックして評価をお願いします！',
      'レビューもお待ちしています。'
    ].join('\n')
    expect(stripAuthorNote(note)).toBe('ノエルは剣を抜いた。')
    const story = ['ノエルは眠った。', '◇◇◇◇◇◇', '翌朝、ミリィが来た。'].join('\n')
    expect(stripAuthorNote(story)).toBe(story)
  })

  it('đếm dạng dài trước và che, câu ngữ cảnh là câu gốc', () => {
    const text = [...Array(5).fill('田中太郎が来た。'), '田中だけが残った。'].join('\n')
    const counts = countForms(['田中', '田中太郎'], one(text))
    expect(counts.get('田中太郎')?.count).toBe(5)
    expect(counts.get('田中')?.count).toBe(1)
    expect(counts.get('田中')?.contexts[0]?.line).toBe('田中だけが残った。')
  })

  it('bỏ mảnh động từ và tượng thanh, giữ tên katakana', () => {
    const text = [
      'バレる前に逃げた。すぐバレた。',
      'ゴチャゴチャした部屋。ゴチャゴチャだ。カッと光った。カッと熱い。アハハハ。アハハハ。',
      'ミリィが笑った。そう言ったのはミリィ',
      'ミリィさんは優しい。'
    ].join('\n')
    const forms = japaneseCandidates(one(text)).map((c) => c.source)
    expect(forms).not.toContain('バレ')
    expect(forms).not.toContain('ゴチャゴチャ')
    expect(forms).not.toContain('カッ')
    expect(forms).not.toContain('アハハハ')
    expect(forms).toContain('ミリィ')
  })

  it('kanji có chú âm thành ứng viên dù chỉ một lần, kèm cách đọc', () => {
    const found = japaneseCandidates(one('ノエルは診断（スキャン）を使った。'))
    expect(found.find((c) => c.source === '診断')).toMatchObject({
      count: 1,
      reading: 'スキャン',
      signals: ['ruby']
    })
  })

  it('dạng AI quét chỉ cần có một lần trong khúc, dạng bịa bị bỏ; tần suất đếm trên corpus', () => {
    const chunk = one('王立回復術師協会から手紙が届いた。ミリィが読んだ。')
    const corpus = [{ number: 0, text: 'ミリィが来た。' }, ...chunk]
    const merged = mergeCandidates(
      japaneseCandidates(chunk, { corpus }),
      ['王立回復術師協会', '闇ギルド'],
      chunk,
      { corpus }
    )
    const forms = new Map(merged.map((c) => [c.source, c.count]))
    expect(forms.get('王立回復術師協会')).toBe(1)
    expect(forms.has('闇ギルド')).toBe(false)
    // Một lần ở chương trước, một lần ở khúc này: đủ ngưỡng 2.
    expect(forms.get('ミリィ')).toBe(2)
  })

  it('xếp họ thuật ngữ vào cùng lô, không gom tên katakana chỉ vì cùng tận cùng ン', () => {
    const batches = familyBatches(
      [cand('銀級', 9), cand('リオン', 8), cand('ガイゼルン', 7), cand('鉄級', 1), cand('金級', 1)],
      3
    )
    expect(batches.map((batch) => batch.map((c) => c.source))).toEqual([
      ['銀級', '鉄級', '金級'],
      ['リオン', 'ガイゼルン']
    ])
  })

  it('kèm mục đã chốt cùng họ trước, rồi mục chung kanji', () => {
    const known = [
      { source: '王都', target: 'Vương đô' },
      { source: '銅級', target: 'Cấp Đồng' },
      { source: 'ノエル', target: 'Noel' }
    ]
    expect(knownForBatch([cand('銀級'), cand('王立協会')], known).map((k) => k.source)).toEqual([
      '銅級',
      '王都'
    ])
  })

  it('gắn cờ lệch khuôn cho mục mới trong họ chung hậu tố', () => {
    expect([
      ...familyMismatches(
        [{ source: '銀級', target: 'Hạng Bạc' }],
        [{ source: '鉄級', target: 'Cấp Sắt' }]
      )
    ]).toEqual(['銀級'])
    expect(
      [
        ...familyMismatches(
          [
            { source: '第二級魔術', target: 'Ma thuật Cấp Hai' },
            { source: '第三級魔術', target: 'Ma thuật cấp Ba' }
          ],
          []
        )
      ].sort()
    ).toEqual(['第三級魔術', '第二級魔術'])
    expect(
      familyMismatches(
        [{ source: '金級', target: 'Cấp Vàng' }],
        [{ source: '銅級', target: 'Cấp Đồng' }]
      ).size
    ).toBe(0)
    // Chữ hoa đầu cụm không phải lệch khuôn.
    expect(
      familyMismatches(
        [{ source: '魔力操作', target: 'Thao tác ma lực' }],
        [{ source: '魔法陣', target: 'Ma pháp trận' }]
      ).size
    ).toBe(0)
    // Tên người cùng kanji đầu không phải một họ thuật ngữ.
    expect(
      familyMismatches(
        [{ source: '田中', target: 'Tanaka', type: 'person' }],
        [{ source: '田村', target: 'Tamura' }]
      ).size
    ).toBe(0)
  })

  it('alias ngắn nằm trong một chuỗi katakana không thuộc mục nào thì đụng', () => {
    const text = one('セラが笑った。セラミックの皿。セラフィナは来ない。')
    expect(shortAliasClash('セラ', text, new Set(['セラフィナ', 'セラ']))).toBe(true)
    expect(
      shortAliasClash('セラ', one('セラが笑った。セラフィナは来ない。'), new Set(['セラフィナ']))
    ).toBe(false)
    expect(shortAliasClash('セラフ', text, new Set())).toBe(false)
  })

  it('prompt phân loại có mục đã chốt, cách đọc, alias_of; parser đọc alias_of và reading', () => {
    const messages = buildClassifyMessages(
      'ja',
      [{ ...cand('診断', 1), reading: 'スキャン' }],
      [{ source: 'ハルネ', target: 'Harune', aliases: ['ハルネ村'], type: 'place' }]
    )
    expect(messages[0]?.content).toContain('"alias_of"')
    expect(messages[0]?.content).toContain('Không chắc: "not-a-term"')
    expect(messages[1]?.content).toContain(
      '<known>\n- ハルネ (ハルネ村) → Harune [place]\n</known>'
    )
    expect(messages[1]?.content).toContain('<candidate source="診断" count="1" reading="スキャン">')
    expect(
      parseClassification(
        '{"terms":[{"source":"ハルネ村","type":"place","alias_of":" ハルネ "},{"source":"桐谷彰","type":"person","target":"Kiritani Akira","reading":"きりたにあきら","alias_of":3}]}'
      )
    ).toEqual([
      { source: 'ハルネ村', type: 'place', alias_of: 'ハルネ' },
      { source: '桐谷彰', type: 'person', target: 'Kiritani Akira', reading: 'きりたにあきら' }
    ])
  })
})

describe('glossaryExtraction: revisions of known entries', () => {
  it('shows entries seen in the chunk once, apart from <known>, and asks for revisions', () => {
    const messages = buildClassifyMessages(
      'ja',
      [cand('リオン')],
      [
        { source: 'ミリィ', target: 'Mili' },
        { source: 'ハルネ', target: 'Harune' }
      ],
      [
        {
          source: 'ミリィ',
          target: 'Mili',
          context: { chapter: 20, line: 'ミリィ（Milly）が笑った' }
        }
      ]
    )
    expect(messages[0]?.content).toContain('"revisions"')
    expect(messages[1]?.content).toContain(
      '<known_in_chunk>\n<entry source="ミリィ" target="Mili">\n  - ch20: ミリィ（Milly）が笑った\n</entry>\n</known_in_chunk>'
    )
    expect(messages[1]?.content).toContain('<known>\n- ハルネ → Harune\n</known>')
  })

  it('reads revisions and keeps only quotes found in the chapter they name', () => {
    expect(
      parseRevisions(
        '{"terms":[],"revisions":[{"source":"ミリィ","kind":"correction","target":"Milly","evidence":["ch20: ミリィ（Milly）が笑った"]},{"source":"x","kind":"rename"}]}'
      )
    ).toEqual([
      {
        source: 'ミリィ',
        kind: 'correction',
        target: 'Milly',
        evidence: ['ch20: ミリィ（Milly）が笑った']
      }
    ])
    const chapters = [{ number: 20, text: 'ミリィ（Milly）が笑った。' }]
    expect(
      verifiedRevisionQuotes(
        ['ch20: ミリィ（Milly）が笑った', 'ch21: ミリィ（Milly）が笑った', 'ch20: 嘘の文だよ'],
        chapters
      )
    ).toEqual([{ chapter: 20, quote: 'ミリィ（Milly）が笑った' }])
  })
})

describe('nameParts', () => {
  it('splits a full name into the parts the text uses on their own', () => {
    const text = [
      'セレナ・ヴァルトハイムが来た。',
      ...Array(11).fill('セレナが笑った。'),
      'セレナさん、待って。',
      'ヴァルトハイム家。'
    ].join('\n')
    expect(nameParts('セレナ・ヴァルトハイム', one(text))).toEqual(['セレナ', 'セレナさん'])
    expect(nameParts('ミリィ', one(text))).toEqual([])
  })
})
