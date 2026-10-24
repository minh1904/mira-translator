import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkAreaHost } from './WorkAreaHost'
import type { WorkArea, WorkAreaProps } from './workArea'

const WORK_ID = '11111111-1111-4111-8111-111111111111'

const areaProps: WorkAreaProps = {
  workId: WORK_ID,
  onWork: () => undefined,
  onOpenChapter: () => undefined,
  addChapterSignal: 0,
  workTitle: 'Truyện',
  chapterCount: 3,
  onExportChapters: () => {}
}

const fakeArea = (id: string, label: string): WorkArea => ({
  id,
  label,
  render: (props) => createElement('section', { 'data-area': id }, id + ' sees ' + props.workId)
})

function render(areas: WorkArea[], selectedId: string): string {
  return renderToStaticMarkup(
    createElement(WorkAreaHost, { areas, selectedId, onSelect: () => undefined, areaProps })
  )
}

describe('WorkAreaHost', () => {
  it('shows a single area directly, without a tab bar or disabled tabs', () => {
    const html = render([fakeArea('chapters', 'Chương')], 'chapters')
    expect(html).toContain('chapters sees ' + WORK_ID)
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('role="tab"')
    expect(html).not.toContain('Chương</')
  })

  it('shows tabs in registration order once there are two areas', () => {
    const html = render(
      [fakeArea('chapters', 'Chương'), fakeArea('context', 'Ngữ cảnh')],
      'chapters'
    )
    expect(html).toContain('role="tablist"')
    expect(html.indexOf('Chương')).toBeLessThan(html.indexOf('Ngữ cảnh'))
    expect(html.match(/role="tab"/g)).toHaveLength(2)
  })

  it('mounts only the selected area at first and hides inactive panels', () => {
    const areas = [
      fakeArea('chapters', 'Chương'),
      fakeArea('context', 'Ngữ cảnh'),
      fakeArea('sources', 'Nguồn'),
      fakeArea('jobs', 'Tác vụ')
    ]
    const html = render(areas, 'sources')
    const positions = ['Chương', 'Ngữ cảnh', 'Nguồn', 'Tác vụ'].map((label) => html.indexOf(label))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html).toContain('sources sees ' + WORK_ID)
    expect(html).not.toContain('chapters sees')
    expect(html).not.toContain('jobs sees')
    expect(html.match(/inert=""/g)).toHaveLength(3)
  })

  it('falls back to the first area when the selected one is not registered', () => {
    const html = render([fakeArea('chapters', 'Chương'), fakeArea('context', 'Ngữ cảnh')], 'jobs')
    expect(html).toContain('chapters sees ' + WORK_ID)
  })

  it('renders nothing for an empty catalogue', () => {
    expect(render([], 'chapters')).toBe('')
  })

  it('hands every area the work id of the frame it is in', () => {
    const other = '22222222-2222-4222-8222-222222222222'
    const html = renderToStaticMarkup(
      createElement(WorkAreaHost, {
        areas: [fakeArea('chapters', 'Chương')],
        selectedId: 'chapters',
        onSelect: () => undefined,
        areaProps: { ...areaProps, workId: other }
      })
    )
    expect(html).toContain('chapters sees ' + other)
    expect(html).not.toContain(WORK_ID)
  })
})
