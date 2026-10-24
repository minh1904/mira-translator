import { describe, expect, it } from 'vitest'
import type { ContextEntryItem } from '../contracts/glossary'
import { evaluateGlossaryCompliance } from './glossaryCompliance'

function makeEntry(overrides: Partial<ContextEntryItem>): ContextEntryItem {
  return {
    id: overrides.id ?? 'entry-id',
    kind: overrides.kind ?? 'term',
    source: overrides.source ?? '韩立',
    target: overrides.target ?? 'Hàn Lập',
    status: overrides.status ?? 'approved',
    origin: overrides.origin ?? 'user',
    forbidden: overrides.forbidden ?? false,
    fromChapterId: null,
    toChapterId: null,
    notes: null,
    aliases: overrides.aliases ?? [],
    createdAt: 1,
    updatedAt: 1
  }
}

describe('glossaryCompliance', () => {
  it('passes when all matched terms are present in translation', () => {
    const entries = [
      makeEntry({ source: '筑基', target: 'Trúc Cơ' }),
      makeEntry({ source: '韩立', target: 'Hàn Lập' })
    ]

    const src = '韩立成功突破到了筑基期。'
    const tgt = 'Hàn Lập đã thành công đột phá đến cảnh giới Trúc Cơ.'

    const report = evaluateGlossaryCompliance(src, tgt, entries, 'zh-Hans')
    expect(report.hasIssues).toBe(false)
    expect(report.issues).toHaveLength(0)
    expect(report.matchedCount).toBe(2)
  })

  it('flags missing_target when an approved term in source is missing in target', () => {
    const entries = [
      makeEntry({ source: '筑基', target: 'Trúc Cơ' }),
      makeEntry({ source: '韩立', target: 'Hàn Lập' })
    ]

    const src = '韩立成功突破到了筑基期。'
    // Bản dịch thiếu 'Trúc Cơ'
    const tgt = 'Hàn Lập đã đột phá thành công cảnh giới mới.'

    const report = evaluateGlossaryCompliance(src, tgt, entries, 'zh-Hans')
    expect(report.hasIssues).toBe(true)
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0]).toMatchObject({
      type: 'missing_target',
      source: '筑基',
      term: 'Trúc Cơ'
    })
  })

  it('flags forbidden_used when a forbidden term appears in target', () => {
    const entries = [
      makeEntry({
        id: 'forb-1',
        source: 'BadTerm',
        target: 'Từ Bậy',
        forbidden: true
      })
    ]

    const src = 'Some text'
    const tgt = 'Bản dịch này có chứa Từ Bậy ở đây.'

    const report = evaluateGlossaryCompliance(src, tgt, entries, 'en')
    expect(report.hasIssues).toBe(true)
    const forbIssue = report.issues.find((i) => i.type === 'forbidden_used')
    expect(forbIssue).toBeDefined()
    expect(forbIssue?.term).toBe('Từ Bậy')
  })

  it('ignores pending and rejected entries', () => {
    const entries = [
      makeEntry({
        source: '筑基',
        target: 'Trúc Cơ',
        status: 'pending'
      }),
      makeEntry({
        source: '金丹',
        target: 'Kim Đan',
        status: 'rejected'
      })
    ]

    const src = '筑基与金丹。'
    const tgt = 'Không nhắc đến hai từ này.'

    const report = evaluateGlossaryCompliance(src, tgt, entries, 'zh-Hans')
    expect(report.hasIssues).toBe(false)
    expect(report.checkedCount).toBe(0)
  })

  it('flags missing target when term was matched in source via alias', () => {
    const entries = [
      makeEntry({
        source: '韩立',
        target: 'Hàn Lập',
        aliases: ['厉飞雨']
      })
    ]

    const src = '厉飞雨拔出长剑。'
    const tgt = 'Người nọ rút ra trường kiếm.' // không chứa Hàn Lập

    const report = evaluateGlossaryCompliance(src, tgt, entries, 'zh-Hans')
    expect(report.hasIssues).toBe(true)
    expect(report.issues[0].type).toBe('missing_target')
    expect(report.issues[0].source).toBe('韩立')
  })

  it('accepts the short form of the target when only an alias matched', () => {
    const entries = [
      makeEntry({ source: 'ノエル・アーデン', target: 'Noel Arden', aliases: ['ノエル'] })
    ]

    expect(evaluateGlossaryCompliance('「ノエル。', '“Noel.', entries, 'ja').hasIssues).toBe(false)
    // The full name in the source still needs the full target.
    const full = evaluateGlossaryCompliance('ノエル・アーデンです。', 'Tôi là Noel.', entries, 'ja')
    expect(full.issues).toMatchObject([{ type: 'missing_target', term: 'Noel Arden' }])
  })
})
