import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SourceDescriptor } from '../../../../../shared/contracts/sources'
import { SourceCard } from './SourceCard'
import { SourcesScreen } from './SourcesScreen'

const mockDescriptors: SourceDescriptor[] = [
  {
    sourceId: 'mira.qidian',
    displayName: 'Khởi Điểm',
    nativeName: '起点中文网',
    aliases: ['qidian'],
    domains: ['qidian.com'],
    countryCode: 'CN',
    languageTags: ['zh-Hans'],
    capabilities: ['identify', 'catalog', 'chapter'],
    access: 'account',
    health: { state: 'healthy', checkedAt: 1728500000000, message: null },
    adult: false
  },
  {
    sourceId: 'mira.syosetu',
    displayName: 'Syosetu',
    nativeName: '小説家になろう',
    aliases: ['shousetsu'],
    domains: ['syosetu.com'],
    countryCode: 'JP',
    languageTags: ['ja'],
    capabilities: ['identify', 'catalog', 'chapter'],
    access: 'public',
    health: { state: 'degraded', checkedAt: 1728500000000, message: 'Rate limit' },
    adult: false
  },
  {
    sourceId: 'mira.novelpia',
    displayName: 'Novelpia',
    nativeName: '노벨피아',
    aliases: ['novelpia'],
    domains: ['novelpia.com'],
    countryCode: 'KR',
    languageTags: ['ko'],
    capabilities: ['identify', 'catalog'],
    access: 'subscription',
    health: { state: 'inconclusive', checkedAt: null, message: null },
    adult: false
  },
  {
    sourceId: 'mira.folder',
    displayName: 'Thư mục tệp',
    nativeName: null,
    aliases: ['folder'],
    domains: [],
    countryCode: null,
    languageTags: ['en', 'zh-Hans', 'ja', 'ko', 'vi'],
    capabilities: ['identify', 'catalog', 'chapter'],
    access: 'local',
    health: { state: 'healthy', checkedAt: null, message: null },
    adult: false
  },
  {
    sourceId: 'mira.broken-source',
    displayName: 'Nguồn Lỗi',
    nativeName: null,
    aliases: [],
    domains: ['broken.com'],
    countryCode: 'CN',
    languageTags: ['zh-Hans'],
    capabilities: ['catalog'],
    access: 'public',
    health: { state: 'broken', checkedAt: 1728500000000, message: 'Parser broken' },
    adult: false
  }
]

describe('SourceCard component (Task 8.2)', () => {
  it('renders domain, country, language tags, access kind and health badge', () => {
    const html = renderToStaticMarkup(createElement(SourceCard, { source: mockDescriptors[0] }))
    expect(html).toContain('Khởi Điểm')
    expect(html).toContain('起点中文网')
    expect(html).toContain('qidian.com')
    expect(html).toContain('Trung Quốc')
    expect(html).toContain('Trung giản thể')
    expect(html).toContain('Cần tài khoản')
    expect(html).toContain('Ổn định')
  })

  it('distinguishes catalog-only adapter from full-content adapter', () => {
    const html = renderToStaticMarkup(createElement(SourceCard, { source: mockDescriptors[2] }))
    expect(html).toContain('Novelpia')
    expect(html).toContain('Chỉ mục lục')
    expect(html).toContain('Chưa xác định')
  })

  it('renders broken state with appropriate CTA', () => {
    const html = renderToStaticMarkup(createElement(SourceCard, { source: mockDescriptors[4] }))
    expect(html).toContain('Nguồn Lỗi')
    expect(html).toContain('Hỏng')
    expect(html).toContain('Xem tình trạng')
  })
})

describe('SourcesScreen component (Task 8.1 & 8.3)', () => {
  it('renders initial toolbar, tabs and facet filters', () => {
    const html = renderToStaticMarkup(
      createElement(SourcesScreen, { initialSources: mockDescriptors })
    )
    expect(html).toContain('Nguồn nội dung')
    expect(html).toContain('Khám phá')
    expect(html).toContain('Đã kết nối')
    expect(html).toContain('Tình trạng')
    expect(html).toContain('Tất cả')
    expect(html).toContain('Trung Quốc')
    expect(html).toContain('Nhật Bản')
    expect(html).toContain('Hàn Quốc')
    expect(html).toContain('Khác')
    expect(html).toContain('Tất cả ngôn ngữ')
    expect(html).toContain('Tất cả khả năng')
    expect(html).toContain('Tất cả tình trạng')
  })

  it('renders source cards for explore tab', () => {
    const html = renderToStaticMarkup(
      createElement(SourcesScreen, { initialSources: mockDescriptors })
    )
    expect(html).toContain('Khởi Điểm')
    expect(html).toContain('Syosetu')
    expect(html).toContain('Novelpia')
    expect(html).toContain('Thư mục tệp')
  })

  it('renders empty state when no adapters exist in registry', () => {
    const html = renderToStaticMarkup(createElement(SourcesScreen, { initialSources: [] }))
    expect(html).toContain('Chưa có nguồn nào được cài đặt')
  })
})
