import { describe, expect, it } from 'vitest'
import type { AddressingDyadResolved, CharacterItem } from '../contracts/addressing'
import type { ContextEntryItem } from '../contracts/glossary'
import { evaluateTaskItem, type QaContext, type QaSegment } from './taskQuality'

const term = (patch: Partial<ContextEntryItem>): ContextEntryItem => ({
  id: 'e-' + (patch.source ?? 'x'),
  kind: 'term',
  source: '韩立',
  target: 'Hàn Lập',
  status: 'approved',
  origin: 'user',
  forbidden: false,
  fromChapterId: null,
  toChapterId: null,
  notes: null,
  aliases: [],
  createdAt: 1,
  updatedAt: 1,
  ...patch
})

const character = (patch: Partial<CharacterItem>): CharacterItem =>
  ({
    id: 'c',
    source: '韩立',
    target: 'Hàn Lập',
    gender: 'male',
    role: null,
    thirdPerson: null,
    notes: null,
    aliases: [],
    status: 'approved',
    createdAt: 1,
    updatedAt: 1,
    ...patch
  }) as CharacterItem

const pair = (): AddressingDyadResolved =>
  ({
    id: 'd',
    sourceCharacterId: 'a',
    targetCharacterId: 'b',
    speakerPronoun: 'ta',
    recipientPronoun: 'nàng',
    secondPerson: null,
    formality: null,
    notes: null,
    status: 'approved',
    fromChapterId: null,
    toChapterId: null,
    createdAt: 1,
    updatedAt: 1,
    sourceCharacter: character({ id: 'a', source: '韩立', target: 'Hàn Lập' }),
    targetCharacter: character({
      id: 'b',
      source: '南宫婉',
      target: 'Nam Cung Uyển',
      gender: 'female'
    })
  }) as AddressingDyadResolved

const ctx = (patch: Partial<QaContext> = {}): QaContext => ({
  sourceLang: 'zh-Hans',
  glossary: [],
  dyads: [],
  ...patch
})

const seg = (source: string, target: string, index = 0): QaSegment => ({
  segmentId: 's' + index,
  paragraphIndex: index,
  source,
  target
})

const codes = (context: QaContext, segments: QaSegment[]) =>
  evaluateTaskItem('ch', context, segments).map((finding) => finding.ruleCode)

describe('evaluateTaskItem', () => {
  it('warns about a forbidden term and a missing approved target, with the term as evidence', () => {
    const findings = evaluateTaskItem(
      'ch',
      ctx({
        glossary: [
          term({}),
          term({ id: 'f', source: '韩老魔', target: 'Hàn lão ma', forbidden: true })
        ]
      }),
      [seg('韩立走了。', 'Hắn rời đi, Hàn lão ma cười.')]
    )
    expect(findings.map((finding) => [finding.ruleCode, finding.evidence])).toEqual([
      ['glossary.forbidden_used', 'Hàn lão ma'],
      ['glossary.missing_target', '韩立 → Hàn Lập']
    ])
    expect(findings[0]).toMatchObject({ chapterId: 'ch', segmentId: 's0', ruleVersion: 1 })
  })

  it('does not report a name kept in its source script as leftover source text', () => {
    const kept = term({ source: '凡人', target: '凡人' })
    expect(
      codes(ctx({ glossary: [kept] }), [seg('凡人修仙。', 'Tu tiên của 凡人.')])
    ).not.toContain('text.residual_source')
    expect(codes(ctx(), [seg('他笑了。', 'Hắn 笑 rồi.')])).toContain('text.residual_source')
  })

  it('reads the longer name when two terms overlap, and passes a translation that uses it', () => {
    const glossary = [term({}), term({ id: 'long', source: '韩立大师', target: 'Hàn Lập đại sư' })]
    expect(codes(ctx({ glossary }), [seg('韩立大师来了。', 'Hàn Lập đại sư tới.')])).toEqual([])
  })

  it('only warns about addressing in dialogue that names the pair, never in quoteless narration', () => {
    const dyads = [pair()]
    expect(
      codes(ctx({ dyads }), [
        seg('他说。', 'Hàn Lập nói với Nam Cung Uyển: “Tôi đi đây, ngươi ở lại.”')
      ])
    ).toContain('addressing.unexpected_pronoun')
    expect(codes(ctx({ dyads }), [seg('她笑了。', 'Nàng cười, không nói gì.')])).toEqual([])
    expect(codes(ctx({ dyads }), [seg('他说。', '“Đi thôi.”')])).toEqual([])
  })

  it('accepts a translation longer than the source inside the language band', () => {
    const source = '他抬起头看着远处的山峰，心中涌起一股说不出的感觉。'
    const target =
      'Hắn ngẩng lên nhìn dãy núi phía xa, trong lòng dâng lên một cảm giác không sao tả được.'
    expect(codes(ctx(), [seg(source, target)])).toEqual([])
    expect(codes(ctx(), [seg(source, 'Hắn nhìn.')])).toContain('text.length_ratio')
  })

  it('warns about unbalanced quotes and runaway repetition, and skips empty targets', () => {
    expect(codes(ctx(), [seg('「走」', '“Đi thôi.')])).toContain('text.unbalanced_quotes')
    // The source itself splits the quote over two paragraphs: the translation follows it.
    expect(codes(ctx(), [seg('「走。', '“Đi thôi.'), seg('快点」', 'Nhanh lên.”', 1)])).toEqual([])
    const loop = Array.from({ length: 5 }, () => 'đi mãi đi mãi').join(' ')
    expect(codes(ctx(), [seg('走走走走走走走走。', loop)])).toContain('text.repetition')
    expect(codes(ctx({ glossary: [term({})] }), [seg('韩立走了。', '   ')])).toEqual([])
  })
})
