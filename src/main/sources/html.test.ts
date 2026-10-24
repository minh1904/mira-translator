import { describe, expect, it } from 'vitest'
import { findAllByClass, findFirstByClass, ILLUSTRATION_MARK, inlineText, parseHtml } from './html'

describe('html helpers', () => {
  it('finds elements by a whole class name and extracts inline text', () => {
    const nodes = parseHtml(
      '<div class="a b-c"><p id="L1">　<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>です<br>次</p>' +
        '<p><img src="x.png"></p><script>alert(1)</script></div><div class="b"></div>'
    )
    expect(findAllByClass(nodes, 'b')).toHaveLength(1)
    expect(findFirstByClass(nodes, 'b-c')?.tagName).toBe('div')
    const [first, second] = findAllByClass(nodes, 'b-c')[0].childNodes
    expect(inlineText([first])).toBe('　漢字です\n次')
    expect(inlineText([second])).toBe(ILLUSTRATION_MARK)
    expect(inlineText(findAllByClass(nodes, 'a'))).not.toContain('alert')
  })
})
