import { Fragment, type JSX, type ReactNode } from 'react'
import { CodeBlockPart } from './CodeBlockPart'

type Block =
  | { kind: 'paragraph' | 'quote'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string; language: string }
  | { kind: 'list'; ordered: boolean; items: string[] }

/** Phân tích cú pháp tập con Markdown cơ bản: HTML luôn hiển thị dạng văn bản thô và không tải ảnh ngoài. */
function parseSafeMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }
    const fence = /^\s*```([^`]*)$/.exec(line)
    if (fence) {
      const code: string[] = []
      index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index++
      blocks.push({ kind: 'code', language: fence[1].trim().slice(0, 32), text: code.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      index++
      continue
    }
    const listItem = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line)
    if (listItem) {
      const ordered = listItem[2] !== undefined
      const items: string[] = []
      while (index < lines.length) {
        const next = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(lines[index])
        if (!next || (next[2] !== undefined) !== ordered) break
        items.push(next[3])
        index++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      const quoted: string[] = []
      while (index < lines.length) {
        const next = /^>\s?(.*)$/.exec(lines[index])
        if (!next) break
        quoted.push(next[1])
        index++
      }
      blocks.push({ kind: 'quote', text: quoted.join('\n') })
      continue
    }
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*```/.test(lines[index]) &&
      !/^#{1,6}\s+/.test(lines[index]) &&
      !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index])
    ) {
      paragraph.push(lines[index++])
    }
    if (paragraph.length === 0) paragraph.push(lines[index++])
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') })
  }
  return blocks
}

function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
      ? url.href
      : null
  } catch {
    return null
  }
}

function inline(text: string): ReactNode[] {
  const result: ReactNode[] = []
  const token =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let cursor = 0
  for (const match of text.matchAll(token)) {
    if (match.index > cursor) result.push(text.slice(cursor, match.index))
    const key = match.index
    if (match[1] !== undefined) result.push(<span key={key}>[ảnh bị chặn: {match[1]}]</span>)
    else if (match[3] !== undefined) {
      const href = safeHref(match[4])
      result.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline"
          >
            {match[3]}
          </a>
        ) : (
          <span key={key}>{match[3]}</span>
        )
      )
    } else if (match[5] !== undefined)
      result.push(
        <code key={key} className="rounded bg-muted px-1">
          {match[5]}
        </code>
      )
    else if (match[6] !== undefined) result.push(<strong key={key}>{match[6]}</strong>)
    else if (match[7] !== undefined) result.push(<em key={key}>{match[7]}</em>)
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) result.push(text.slice(cursor))
  return result
}

export function SafeMarkdown({ text }: { text: string }): JSX.Element {
  return (
    <div className="selectable space-y-2 text-body-sm leading-normal text-default">
      {parseSafeMarkdown(text).map((block, index) => {
        if (block.kind === 'code')
          return <CodeBlockPart key={index} text={block.text} language={block.language} />
        if (block.kind === 'heading') {
          const content = inline(block.text)
          if (block.level === 1)
            return (
              <h4 key={index} className="text-body-md font-semibold">
                {content}
              </h4>
            )
          return (
            <h5 key={index} className="text-body-sm font-semibold">
              {content}
            </h5>
          )
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={index} className={block.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>
              {block.items.map((item, at) => (
                <li key={at}>{inline(item)}</li>
              ))}
            </Tag>
          )
        }
        if (block.kind === 'quote')
          return (
            <blockquote key={index} className="border-l-2 border-strong pl-3 text-subtle">
              {inline(block.text)}
            </blockquote>
          )
        return (
          <p key={index} className="whitespace-pre-wrap">
            {inline(block.text).map((node, at) => (
              <Fragment key={at}>{node}</Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
