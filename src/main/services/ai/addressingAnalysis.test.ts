import { describe, expect, it } from 'vitest'
import {
  addressChanges,
  buildAnalysisMessages,
  collectAddressingEvidence,
  parseAnalysis,
  provenGender,
  verifiedQuotes
} from './addressingAnalysis'

const chapters = [
  {
    number: 1,
    text: 'ミリィが扉を開けた。\n「リオン様ったら、探しましたよ？」\n地の文。\n「リオン様？」'
  },
  {
    number: 2,
    text: '姉が笑う。\n「ね、弟くんもそう思うでしょ？」\n「リオン様、お昼寝の時間です」'
  }
]
const characters = [{ source: 'リオン', target: 'Rion', aliases: [] }]

describe('addressingAnalysis', () => {
  it('gom câu thoại có tên nhân vật, kèm câu dẫn, rải đều qua các chương', () => {
    const [evidence] = collectAddressingEvidence(chapters, characters, 'ja', 2)
    expect(evidence.lines).toEqual([
      { chapter: 1, cue: 'ミリィが扉を開けた。', line: '「リオン様ったら、探しましたよ？」' },
      { chapter: 2, cue: '姉が笑う。', line: '「リオン様、お昼寝の時間です」' }
    ])
  })

  it('prompt bắt buộc đại từ ngôi hai khi cách gọi là tên và kèm bảng mặc định', () => {
    const messages = buildAnalysisMessages({
      sourceLang: 'ja',
      register: 'ja-fantasy',
      characters,
      evidence: collectAddressingEvidence(chapters, characters, 'ja')
    })
    expect(messages[0].content).toContain('BẮT BUỘC có "secondPerson"')
    expect(messages[0].content).toContain('<addressing_defaults>')
    expect(messages[1].content).toContain(
      'ch1: [ミリィが扉を開けた。] 「リオン様ったら、探しましたよ？」'
    )
  })

  it('đọc JSON có rào và bỏ cặp thiếu trường bắt buộc', () => {
    const result = parseAnalysis(
      '```json\n{"characters":[{"source":"リオン","gender":"male"}],"dyads":[{"from":"ミリィ","to":"リオン","self":"tôi","address":"Rion-sama","secondPerson":"cậu"},{"from":"x"}]}\n```'
    )
    expect(result.characters).toHaveLength(1)
    expect(result.dyads).toEqual([
      { from: 'ミリィ', to: 'リオン', self: 'tôi', address: 'Rion-sama', secondPerson: 'cậu' }
    ])
  })
  it('chỉ giữ câu bằng chứng có nguyên văn trong chương, bỏ tiền tố ch/câu dẫn', () => {
    expect(
      verifiedQuotes(
        [
          'ch2: 「リオン様、お昼寝の時間です」',
          '[ミリィが扉を開けた。] 「リオン様？」',
          'ch1: 「リオン様、帰りましょう」',
          42
        ],
        chapters
      )
    ).toEqual([
      { chapter: 2, quote: '「リオン様、お昼寝の時間です」' },
      { chapter: 1, quote: '「リオン様？」' }
    ])
    expect(verifiedQuotes(undefined, chapters)).toEqual([])
  })
})

describe('provenGender', () => {
  const chapters = [
    { number: 3, text: '「僕は女の子だよ」とモルグレイドは笑った。' },
    { number: 4, text: '「僕が行く」とモルグレイドが言った。' }
  ]
  const forms = ['モルグレイド']

  it('keeps male/female only with a real quote that has the name and a gender word', () => {
    expect(
      provenGender(
        { gender: 'female', genderEvidence: 'ch3: 「僕は女の子だよ」とモルグレイドは笑った。' },
        forms,
        chapters
      )
    ).toBe('female')
    // 僕 is no evidence of gender.
    expect(
      provenGender(
        { gender: 'male', genderEvidence: 'ch4: 「僕が行く」とモルグレイドが言った。' },
        forms,
        chapters
      )
    ).toBe('unknown')
    expect(
      provenGender({ gender: 'female', genderEvidence: 'ch9: 彼女はモルグレイド' }, forms, chapters)
    ).toBe('unknown')
    expect(provenGender({ gender: 'female' }, forms, chapters)).toBe('unknown')
    expect(provenGender(undefined, forms, chapters)).toBe('unknown')
  })
})

describe('addressChanges', () => {
  const kiritani = { source: '桐谷彰', target: 'Kiritani Akira', aliases: ['桐谷', '彰'] }
  const chapter = (number: number, line: string) => ({
    number,
    text: `「${line}」\n「${line}、待って」`
  })

  it('suggests a change from the chapter where the usual call changes', () => {
    const chapters = [
      ...Array.from({ length: 9 }, (_, i) => chapter(i + 1, '桐谷さん')),
      chapter(10, '彰'),
      chapter(11, '彰'),
      chapter(12, '彰')
    ]
    expect(addressChanges(chapters, [kiritani])).toEqual([
      { source: '桐谷彰', fromChapter: 10, before: '桐谷さん', after: '彰' }
    ])
    expect(
      buildAnalysisMessages({
        sourceLang: 'ja',
        register: null,
        characters: [kiritani],
        evidence: [],
        possibleChanges: addressChanges(chapters, [kiritani])
      })[1]!.content
    ).toContain('<possible_changes>\n- 桐谷彰: chương 9 gọi "桐谷さん", chương 10 gọi "彰"')
  })

  it('suggests nothing for one scene in one chapter', () => {
    const chapters = [
      chapter(6, '桐谷さん'),
      { number: 7, text: '「彰！」\n「桐谷さん、ごめん」' },
      chapter(8, '桐谷さん')
    ]
    expect(addressChanges(chapters, [kiritani])).toEqual([])
  })
})
