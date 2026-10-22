import { describe, expect, it } from 'vitest'
import type { SessionStatus } from '../chapter-editor/editorSession'
import { combinedSaveLabel, textStats } from './chapterStats'

const status = (state: SessionStatus['state'], dirty = false): SessionStatus => ({
  state,
  message: null,
  dirty
})

describe('textStats', () => {
  it('counts Vietnamese syllables as words and leaves line breaks out of characters', () => {
    expect(textStats('Đại Đồng năm thứ ba,\r\nmùa đông.')).toEqual({ words: 7, characters: 29 })
  })

  it('keeps contractions and hyphenated words whole', () => {
    expect(textStats("don't stop — well-known")).toEqual({ words: 3, characters: 23 })
  })

  it('is zero for an empty translation', () => {
    expect(textStats('')).toEqual({ words: 0, characters: 0 })
  })
})

describe('combinedSaveLabel', () => {
  it('is saved only when both sides are', () => {
    expect(combinedSaveLabel([status('saved'), status('saved')])).toEqual({
      label: 'Đã lưu',
      safe: true
    })
    expect(combinedSaveLabel([status('saved'), status('dirty', true)]).label).toBe('Chưa lưu')
  })

  it('puts saving and failures ahead of plain unsaved text', () => {
    expect(combinedSaveLabel([status('dirty', true), status('saving', true)]).label).toBe(
      'Đang lưu…'
    )
    expect(combinedSaveLabel([status('error', true), status('dirty', true)]).label).toBe('Lưu lỗi')
  })
})
