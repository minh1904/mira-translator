import { CHANNELS } from '../../../shared/contracts/channels'
import { saveTextSchema, textRefSchema } from '../../../shared/contracts/text'
import { recordEditSignals } from '../../infra/storage/editSignals'
import { createHandler } from '../handler'
import type { AreaHandlers, HandlerDeps } from './deps'

/** Văn bản của một bên (gốc hoặc dịch) trong một chương. */
export function textHandlers({ library }: HandlerDeps): AreaHandlers<'text'> {
  return {
    [CHANNELS.textGet]: createHandler(textRefSchema, ({ workId, chapterId, side }) =>
      library.readText(workId, chapterId, side)
    ),
    [CHANNELS.textSave]: createHandler(
      saveTextSchema,
      ({ workId, chapterId, side, content, expectedRev, segments }) => {
        // A person editing a translation here is what the glossary learns from.
        const before = side === 'target' ? library.readText(workId, chapterId, side).content : ''
        const saved = library.saveText(workId, chapterId, side, content, expectedRev, segments)
        if (before !== '') {
          library.withWork(workId, (db) =>
            recordEditSignals(db, chapterId, before, content, Date.now())
          )
        }
        return saved
      }
    )
  }
}
