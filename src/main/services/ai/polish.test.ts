import { describe, expect, it } from 'vitest'
import {
  buildPolishMessages,
  parsePolish,
  polishBatches,
  verifyEdits,
  type PolishEdit,
  type PolishItem
} from './polish'

const items: PolishItem[] = [
  {
    id: '[1]',
    src: 'こっちのサイズが小さいんだから窒息しちゃうって！',
    dst: 'Bên này bé tí thế này thì nghẹt thở mất!'
  },
  {
    id: '[2]',
    src: 'ミリィはグランシェス家のメイドだ。',
    dst: 'Milly là hầu gái của gia tộc Granches.'
  },
  { id: '[3]', src: '「３年後に会おう」', dst: '“Ba năm nữa gặp lại, 3 năm.”' }
]
const glossary = [{ source: 'グランシェス家', target: 'gia tộc Granches' }]
const edit = (over: Partial<PolishEdit>): PolishEdit => ({
  id: '[1]',
  issue: 'literal',
  note: 'こっち là tôi',
  dst: 'Tôi bé tí thế này thì nghẹt thở mất!',
  ...over
})

describe('polish — trau chuốt soát rồi sửa', () => {
  it('chỉ gửi thuật ngữ có trong bản gốc của lô, kèm nhân vật và cặp xưng hô', () => {
    const [system, user] = buildPolishMessages(
      {
        sourceLang: 'ja',
        characters: ['- リオン → Leon: nam'],
        addressing: ['- Leon → Milly: tự xưng tôi, gọi chị'],
        glossary: [...glossary, { source: '魔法', target: 'ma pháp' }]
      },
      items
    )
    expect(system.content).toContain('tiếng Nhật')
    expect(system.content).toContain('literal')
    expect(user.content).toContain('<characters>\n- リオン → Leon: nam')
    expect(user.content).toContain('<addressing>')
    expect(user.content).toContain('グランシェス家 → gia tộc Granches')
    expect(user.content).not.toContain('ma pháp')
    expect(user.content).toContain('"id":"[1]"')
  })

  it('đọc mảng sửa kể cả khi có rào ``` và xuống dòng trong dst', () => {
    const text =
      '```json\n[{"id":"[1]","issue":"literal","note":"x","dst":"Tôi bé tí\\nthế này"}]\n```'
    expect(parsePolish(text)).toEqual([
      { id: '[1]', issue: 'literal', note: 'x', dst: 'Tôi bé tí thế này' }
    ])
    expect(parsePolish('[]')).toEqual([])
    expect(parsePolish('không có gì')).toEqual([])
  })

  it('nhận bản sửa hợp lệ', () => {
    const result = verifyEdits(items, [edit({})], {
      glossary,
      names: [{ target: 'Milly', forms: ['ミリィ'] }]
    })
    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toEqual([])
  })

  it('loại bản sửa làm mất thuật ngữ, tên, con số, dấu thoại hay lệch độ dài', () => {
    const result = verifyEdits(
      items,
      [
        edit({ id: '[9]' }),
        edit({ id: '[2]', issue: 'awkward', dst: 'Milly là hầu gái của nhà Granches.' }),
        edit({ id: '[3]', issue: 'awkward', dst: '“Ba năm nữa gặp lại, ba năm.”' }),
        edit({ dst: 'Tôi bé tí thế này thì nghẹt thở mất! Thật sự là nghẹt thở mất thôi!' }),
        edit({ id: '[2]', issue: 'style' as PolishEdit['issue'] })
      ],
      { glossary, names: [{ target: 'Milly', forms: ['ミリィ'] }] }
    )
    expect(result.accepted).toEqual([])
    expect(result.rejected.map((r) => r.reason)).toEqual([
      'id lạ',
      'mất thuật ngữ "gia tộc Granches"',
      'đổi con số',
      expect.stringMatching(/^độ dài/),
      'trùng id'
    ])
  })

  it('loại khi mất tên riêng hoặc dấu mở thoại', () => {
    const named = verifyEdits(
      items,
      [edit({ id: '[2]', issue: 'awkward', dst: 'Cô ấy là hầu gái của gia tộc Granches.' })],
      { glossary, names: [{ target: 'Milly', forms: ['ミリィ'] }] }
    )
    expect(named.rejected[0].reason).toBe('mất tên "Milly"')
    const quoted = verifyEdits(
      items,
      [edit({ id: '[3]', issue: 'awkward', dst: 'Ba năm nữa gặp lại nhé, 3 năm.' })],
      {}
    )
    expect(quoted.rejected[0].reason).toBe('mất dấu thoại')
  })

  it('loại khi thêm tên mà bản gốc không nhắc, nhận khi bản gốc có tên', () => {
    const maid: PolishItem = {
      id: '[1]',
      src: 'メイドさんが慌てて解放してくれた。',
      dst: 'Cô hầu gái vội vàng thả tôi ra.'
    }
    const named: PolishItem = {
      id: '[2]',
      src: 'ミリィが慌てて解放してくれた。',
      dst: 'Cô ấy vội vàng thả tôi ra.'
    }
    const result = verifyEdits(
      [maid, named],
      [
        edit({ id: '[1]', issue: 'awkward', dst: 'Milly vội vàng thả tôi ra.' }),
        edit({ id: '[2]', issue: 'awkward', dst: 'Milly vội vàng thả tôi ra.' })
      ],
      { names: [{ target: 'Milly', forms: ['ミリィ'] }] }
    )
    expect(result.rejected.map((r) => r.reason)).toEqual([
      'thêm tên "Milly" không có trong bản gốc'
    ])
    expect(result.accepted.map((e) => e.id)).toEqual(['[2]'])
  })

  it('đọc trường gain và bỏ giá trị lạ; requireGain chỉ nhận gain cao', () => {
    const edits = parsePolish(
      '[{"id":"[1]","issue":"literal","gain":"cao","note":"a","dst":"Tôi bé tí thế này!"},' +
        '{"id":"[2]","issue":"awkward","gain":"thấp","note":"b","dst":"Milly là hầu gái của gia tộc Granches!"},' +
        '{"id":"[3]","issue":"awkward","gain":"khác","note":"c","dst":"“Ba năm nữa gặp lại.”"}]'
    )
    expect(edits.map((e) => e.gain)).toEqual(['cao', 'thấp', undefined])
    const result = verifyEdits(items, edits, { glossary, requireGain: true })
    expect(result.accepted.map((e) => e.id)).toEqual(['[1]'])
    expect(result.rejected.map((r) => r.reason)).toEqual(['gain thấp', 'gain thấp'])
  })

  it('loại kiểu ngoặc CJK mà bản nháp không có', () => {
    const result = verifyEdits(
      [{ id: '[1]', src: '「あ」', dst: 'Chỉ là, vẫn còn một người “chưa kết hôn” thôi.' }],
      [edit({ issue: 'awkward', dst: 'Chỉ là, vẫn còn một người 『chưa kết hôn』 thôi.' })],
      {}
    )
    expect(result.rejected.map((r) => r.reason)).toEqual(['kiểu ngoặc lạ'])
  })

  it('loại khi thêm đại từ gọi người khác hoặc bỏ đại từ trang trọng, nhận khi thêm "tôi"', () => {
    const talk: PolishItem[] = [
      { id: '[1]', src: '「あの方は生きている」', dst: '“Ngài ấy vẫn còn sống ư?”' },
      { id: '[2]', src: '「結婚しましょう」', dst: '“Chúng ta kết hôn đi ngài!”' },
      { id: '[3]', src: 'こっちが小さい', dst: 'Bên này bé tí thế này.' }
    ]
    const result = verifyEdits(
      talk,
      [
        edit({ id: '[1]', issue: 'voice', dst: '“Cậu ấy vẫn còn sống ư?”' }),
        edit({ id: '[2]', issue: 'voice', dst: '“Chúng ta kết hôn đi ạ!”' }),
        edit({ id: '[3]', dst: 'Tôi bé tí thế này.' })
      ],
      {}
    )
    expect(result.rejected.map((r) => r.reason)).toEqual(['đại từ mới "cậu"', 'bỏ đại từ "ngài"'])
    expect(result.accepted.map((e) => e.id)).toEqual(['[3]'])
  })

  it('nêu ngôn ngữ nguồn trong prompt và ví dụ tiểu từ chỉ khi là tiếng Nhật', () => {
    const [ja] = buildPolishMessages({ sourceLang: 'ja' }, items)
    const [zh] = buildPolishMessages({ sourceLang: 'zh-Hans' }, items)
    expect(ja.content).toContain('ゴホン')
    expect(zh.content).not.toContain('ゴホン')
    expect(zh.content).toContain('tiếng Trung')
    expect(ja.content).toContain('"gain"')
  })

  it('chia lô theo số ký tự, giữ thứ tự', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `[${i}]`,
      src: 'あ'.repeat(30),
      dst: 'a'.repeat(20)
    }))
    const batches = polishBatches(many, 100)
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1])
    expect(batches.flat().map((i) => i.id)).toEqual(many.map((i) => i.id))
  })
})
