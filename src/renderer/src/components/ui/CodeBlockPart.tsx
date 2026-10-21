import { useState, type JSX } from 'react'
import { CheckIcon, CopyIcon } from '@renderer/components/ui/reicon'
import { focusRing } from './focus'
import { ICON } from './icon'
import { cn } from '../../lib/cn'

export interface CodeBlockPartProps {
  text: string
  language?: string
}

export function CodeBlockPart({ text, language }: CodeBlockPartProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Best effort clipboard copy
    }
  }

  const langLabel = language?.trim() ? language.trim() : 'text'

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-default/70 bg-surface shadow-2xs">
      <div className="flex h-6 select-none items-center justify-between border-b border-default/50 bg-muted/40 px-2 text-label-xs text-muted font-mono uppercase tracking-wider">
        <span>{langLabel}</span>
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={copied ? 'Đã sao chép' : 'Sao chép đoạn mã'}
          title={copied ? 'Đã sao chép' : 'Sao chép'}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded-xs px-1 text-label-xs text-subtle hover:text-default transition-colors',
            focusRing
          )}
        >
          {copied ? (
            <>
              <CheckIcon size={ICON['2xs']} className="text-success-emphasis" />
              <span className="text-success-emphasis">Đã chép</span>
            </>
          ) : (
            <>
              <CopyIcon size={ICON['2xs']} />
              <span>Chép</span>
            </>
          )}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-2 font-mono text-body-xs text-default whitespace-pre">
        <code>{text}</code>
      </pre>
    </div>
  )
}
