// Shared parse5 helpers for HTML source adapters. Never runs embedded scripts.
import { createHash } from 'node:crypto'
import { parse } from 'parse5'
import { attr, isElement, isText, walk, type ChildNode, type Element } from './kakuyomu/traverse'

export { attr, isElement, isText, walk, type ChildNode, type Element }

/** Placeholder kept where an illustration (挿絵) was; images are not downloaded. */
export const ILLUSTRATION_MARK = '［挿絵］'

export function parseHtml(html: string): ChildNode[] {
  return parse(html).childNodes
}

export function hasClass(node: ChildNode, className: string): node is Element {
  return isElement(node) && (attr(node, 'class') ?? '').split(/\s+/).includes(className)
}

export function findAllByClass(nodes: ChildNode[], className: string): Element[] {
  const found: Element[] = []
  for (const node of walk(nodes)) if (hasClass(node, className)) found.push(node)
  return found
}

export function findFirstByClass(nodes: ChildNode[], className: string): Element | undefined {
  for (const node of walk(nodes)) if (hasClass(node, className)) return node
  return undefined
}

/** Text of inline content: ruby keeps its base text only, `<br>` is a newline, an image a mark. */
export function inlineText(nodes: ChildNode[]): string {
  const parts: string[] = []
  for (const node of nodes) {
    if (isText(node)) {
      parts.push(node.value)
    } else if (isElement(node)) {
      switch (node.tagName) {
        case 'ruby':
          parts.push(
            inlineText(
              node.childNodes.filter(
                (child) => !(isElement(child) && (child.tagName === 'rt' || child.tagName === 'rp'))
              )
            )
          )
          break
        case 'br':
          parts.push('\n')
          break
        case 'img':
          parts.push(ILLUSTRATION_MARK)
          break
        case 'script':
        case 'style':
          break
        default:
          parts.push(inlineText(node.childNodes))
      }
    }
  }
  return parts.join('')
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
