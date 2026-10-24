import { parse } from 'parse5'
import { inlineText, sha256 } from '../html'
import { isElement, walk, attr, type ChildNode } from './traverse'

export const EPISODE_NORMALIZATION_VERSION = 1 as const
export const EPISODE_BODY_SELECTOR = 'widget-episodeBody js-episode-body'

export interface EpisodeParseResult {
  text: string
  contentHash: string
  normalizationVersion: typeof EPISODE_NORMALIZATION_VERSION
  access: 'public' | 'login_required' | 'parser_broken'
}

/**
 * Parses a Kakuyomu episode HTML response.
 * - Returns access=login_required if the login widget is detected.
 * - Returns access=parser_broken if the expected body structure is absent.
 * - Preserves ruby text (reading), normalizes paragraph/br boundaries.
 */
export function parseKakuyomuEpisode(html: string): EpisodeParseResult {
  const doc = parse(html)
  const allNodes: ChildNode[] = doc.childNodes

  // Check for login wall
  for (const node of walk(allNodes)) {
    if (isElement(node) && node.tagName === 'div') {
      const cls = attr(node, 'class') ?? ''
      if (cls.includes('widget-loginRequired')) {
        return {
          text: '',
          contentHash: sha256(''),
          normalizationVersion: EPISODE_NORMALIZATION_VERSION,
          access: 'login_required'
        }
      }
    }
  }

  // Find episode body container
  let bodyEl: ChildNode | null = null
  for (const node of walk(allNodes)) {
    if (isElement(node) && node.tagName === 'div') {
      const cls = attr(node, 'class') ?? ''
      if (cls.includes('widget-episodeBody')) {
        bodyEl = node
        break
      }
    }
  }

  if (!bodyEl || !isElement(bodyEl)) {
    return {
      text: '',
      contentHash: sha256(''),
      normalizationVersion: EPISODE_NORMALIZATION_VERSION,
      access: 'parser_broken'
    }
  }

  // Extract paragraphs
  const paragraphs: string[] = []
  const parasElements = bodyEl.childNodes.filter(
    (n) => isElement(n) && (n as unknown as { tagName: string }).tagName === 'p'
  )
  for (const para of parasElements) {
    if (!isElement(para)) continue
    const text = inlineText(para.childNodes)
    paragraphs.push(text)
  }

  // Remove trailing empty paragraphs, keep internal ones
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === '') {
    paragraphs.pop()
  }

  const normalized = paragraphs.join('\n')
  return {
    text: normalized,
    contentHash: sha256(normalized),
    normalizationVersion: EPISODE_NORMALIZATION_VERSION,
    access: 'public'
  }
}
