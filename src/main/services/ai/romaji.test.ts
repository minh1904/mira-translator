import { describe, expect, it } from 'vitest'
import { restyleName, romajiChunks } from './romaji'

const join = (kana: string, style: Parameters<typeof romajiChunks>[1]) =>
  romajiChunks(kana, style)?.join('')

describe('romajiChunks', () => {
  it('writes small kana, the small tsu, n and long vowels in each style', () => {
    expect(join('りょうた', 'hepburn_macron')).toBe('ryōta')
    expect(join('りょうた', 'hepburn_plain')).toBe('ryota')
    expect(join('りょうた', 'wapuro')).toBe('ryouta')
    expect(join('しゃちょう', 'hepburn_plain')).toBe('shacho')
    expect(join('じゅん', 'hepburn_plain')).toBe('jun')
    expect(join('いっぺい', 'hepburn_plain')).toBe('ippei')
    expect(join('まっちゃ', 'hepburn_plain')).toBe('matcha')
    expect(join('けんいち', 'hepburn_plain')).toBe('kenichi')
    expect(join('ユーリ', 'hepburn_macron')).toBe('yūri')
    expect(join('ユーリ', 'hepburn_plain')).toBe('yuri')
    expect(join('ユーリ', 'wapuro')).toBe('yuuri')
    expect(join('おおの', 'hepburn_macron')).toBe('ōno')
    expect(romajiChunks('涼太', 'hepburn_plain')).toBeNull()
  })
})

describe('restyleName', () => {
  it('writes a name again in the new style when the target is the old style, keeping its spaces', () => {
    expect(restyleName('りょうた', 'Ryōta', 'hepburn_macron', 'hepburn_plain')).toBe('Ryota')
    expect(restyleName('きりたにりょうた', 'Kiritani Ryōta', 'hepburn_macron', 'wapuro')).toBe(
      'Kiritani Ryouta'
    )
  })

  it('leaves a name written another way alone', () => {
    expect(restyleName('りょうた', 'Ryouta-kun', 'hepburn_macron', 'hepburn_plain')).toBeNull()
    expect(restyleName('みりぃ', 'Milly', 'hepburn_plain', 'wapuro')).toBeNull()
  })
})
