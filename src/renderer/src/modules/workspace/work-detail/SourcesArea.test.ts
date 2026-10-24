import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SourceBinding } from '../../../../../shared/contracts/sources'
import { describeDownloadSummary, SourcesArea } from './SourcesArea'

const binding = (id: string, sourceId: string, label: string): SourceBinding => ({
  id,
  workId: 'w1',
  sourceId,
  adapterVersion: '1.0.0',
  remoteWorkId: 'r1',
  canonicalUrl: null,
  countryCode: null,
  languageTag: 'ja',
  label,
  role: 'primary',
  authProfileId: null,
  enabled: true,
  checkpoint: null,
  createdAt: 1,
  updatedAt: 1
})

describe('SourcesArea', () => {
  it('offers the catalog for every network source and the full check only for API-checked ones', () => {
    const html = renderToStaticMarkup(
      createElement(SourcesArea, {
        workId: 'w1',
        initialBindings: [
          binding('b1', 'mira.jp.syosetu', 'Narou'),
          binding('b2', 'mira.jp.akatsuki', 'Aka'),
          binding('b3', 'mira.folder', 'Folder')
        ]
      })
    )
    expect(html.match(/Danh mục chương/g)).toHaveLength(2)
    expect(html.match(/Tùy chọn kiểm tra/g)).toHaveLength(1)
    expect(html).toContain('小説家になろう (Syosetu)')
  })

  it('summarises a range download with the titles that need attention', () => {
    expect(
      describeDownloadSummary({
        state: 'stopped',
        downloaded: 2,
        skipped: 1,
        empty: ['第3話'],
        failed: [{ title: '第4話', message: 'HTTP 404' }],
        stopReason: 'nguồn trả 503'
      })
    ).toBe('Đã dừng: nguồn trả 503. Đã tải 2 chương; bỏ qua 1; rỗng: 第3話; lỗi: 第4話 (HTTP 404)')
    expect(
      describeDownloadSummary({
        state: 'cancelled',
        downloaded: 0,
        skipped: 0,
        empty: [],
        failed: [],
        stopReason: null
      })
    ).toBe('Đã hủy tải. Đã tải 0 chương')
  })
})
