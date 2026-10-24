import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgeConfirmation, SUPPORTED_SITES } from './AddRawDialog'

describe('AddRawDialog R18 confirmation', () => {
  it('names the R18 source and offers the one-time 18+ confirmation', () => {
    const html = renderToStaticMarkup(
      createElement(AgeConfirmation, { sourceName: '暁 (Akatsuki)', onConfirm: () => {} })
    )
    expect(html).toContain('Nguồn R18: 暁 (Akatsuki)')
    expect(html).toContain('Tôi đã đủ 18 tuổi')
    expect(html).toContain('thu hồi trong Cài đặt')
  })

  it('lists every supported network site in the URL hint', () => {
    expect(SUPPORTED_SITES.join(' ')).toMatch(
      /kakuyomu\.jp.*ncode\.syosetu\.com.*novel18\.syosetu\.com.*akatsuki-novels\.com/
    )
  })
})
