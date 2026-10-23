import { useEffect, useState, type JSX } from 'react'
import type { AppliedContext as AppliedContextValue } from '../../../../../shared/contracts/glossary'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'

export interface AppliedContextProps {
  workId: string
  chapterId: string
  /** "Xem ngữ cảnh": opens the work's Glossary screen to edit what applies. */
  onReview(workId: string): void
}

/**
 * Tab Ngữ cảnh of the chapter side panel: what a translation of this chapter would use now, read through
 * the same snapshot function as the prompt, so rejected or out-of-scope entries never show. Read-only.
 */
export function AppliedContext({ workId, chapterId, onReview }: AppliedContextProps): JSX.Element {
  const [value, setValue] = useState<AppliedContextValue | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setValue(null)
    setError(null)
    void window.mira.glossary.applied({ workId, chapterId }).then((res) => {
      if (!active) return
      if (res.ok) setValue(res.value)
      else setError(res.error.message)
    })
    return () => {
      active = false
    }
  }, [workId, chapterId])

  const review = (
    <Button variant="light" onClick={() => onReview(workId)}>
      Xem ngữ cảnh
    </Button>
  )

  if (error) {
    return (
      <p role="alert" className="m-0 p-md text-body-sm text-error">
        {error}
      </p>
    )
  }
  if (!value) return <p className="m-0 p-md text-body-sm text-muted">Đang tải ngữ cảnh…</p>
  if (value.glossary.length + value.dyads.length + value.characters.length === 0) {
    return (
      <EmptyState title="Chưa có ngữ cảnh áp dụng" actions={review}>
        Chương này chưa có thuật ngữ, nhân vật hay cặp xưng hô nào.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-md p-md">
      <div className="flex items-center justify-between gap-sm">
        <h3 className="m-0 text-label-sm">Đang áp dụng</h3>
        {review}
      </div>
      {value.glossary.length > 0 && (
        <section aria-label="Thuật ngữ" className="flex flex-col gap-2xs">
          <h4 className="m-0 text-body-xs text-muted">Thuật ngữ</h4>
          <ul className="m-0 flex list-none flex-col gap-2xs p-0">
            {value.glossary.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-xs text-body-sm">
                <span>{entry.source}</span>
                <span className="text-muted">→</span>
                <span className={entry.forbidden ? 'text-error line-through' : ''}>
                  {entry.target}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {value.characters.length > 0 && (
        <section aria-label="Nhân vật" className="flex flex-col gap-2xs">
          <h4 className="m-0 text-body-xs text-muted">Nhân vật · lời kể</h4>
          <ul className="m-0 flex list-none flex-col gap-2xs p-0">
            {value.characters.map((character) => (
              <li key={character.id} className="text-body-sm">
                {character.target || character.source}
                {character.thirdPerson ? (
                  <span className="text-muted"> · người kể gọi “{character.thirdPerson}”</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      {value.dyads.length > 0 && (
        <section aria-label="Xưng hô" className="flex flex-col gap-2xs">
          <h4 className="m-0 text-body-xs text-muted">Xưng hô · lời thoại</h4>
          <ul className="m-0 flex list-none flex-col gap-2xs p-0">
            {value.dyads.map((dyad) => (
              <li key={dyad.id} className="text-body-sm">
                {dyad.sourceCharacter.target || dyad.sourceCharacter.source} →{' '}
                {dyad.targetCharacter.target || dyad.targetCharacter.source}: “{dyad.speakerPronoun}
                ” – “{dyad.recipientPronoun}”
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
