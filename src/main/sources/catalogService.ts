import type { Db } from '../infra/storage/sqlite'
import { StorageError } from '../infra/storage/errors'
import type { CatalogItem } from './domain'
import {
  getCatalogItem,
  insertCatalogItem,
  listCatalogItems,
  updateCatalogItem,
  type StoredCatalogItem
} from '../infra/storage/sourceStorage'

export class SourceCatalogService {
  list(db: Db, bindingId?: string): StoredCatalogItem[] {
    return listCatalogItems(db, bindingId)
  }

  get(db: Db, id: string): StoredCatalogItem | null {
    return getCatalogItem(db, id)
  }

  /** First snapshot of a new binding, taken from its preview; creates no update events. */
  saveInitialSnapshot(
    db: Db,
    bindingId: string,
    items: CatalogItem[],
    now: number,
    newId: () => string
  ): void {
    db.transaction(() => {
      for (const item of items) {
        insertCatalogItem(db, {
          id: newId(),
          bindingId,
          remoteChapterId: item.remoteChapterId,
          remoteUrl: item.url ?? null,
          chapterId: null,
          ordinalKey: String(item.order).padStart(6, '0'),
          volumeTitle: item.volumeTitle ?? null,
          title: item.title,
          kind: 'chapter',
          publishedAt: null,
          remoteUpdatedAt: null,
          revisionToken: null,
          accessState: item.access,
          firstSeenAt: now,
          lastSeenAt: now,
          missingStreak: 0,
          removedAt: null,
          metadataHash: ''
        })
      }
    })
  }

  mapChapter(db: Db, catalogItemId: string, chapterId: string | null): StoredCatalogItem {
    const item = getCatalogItem(db, catalogItemId)
    if (!item) {
      throw new StorageError('not_found', `Catalog item ${catalogItemId} not found`)
    }

    if (chapterId) {
      const chapter = db.prepare('SELECT 1 FROM chapter WHERE id = ?').get<{ 1: number }>(chapterId)
      if (!chapter) {
        throw new StorageError('not_found', `Chapter ${chapterId} not found`)
      }
    }

    const updated: StoredCatalogItem = {
      ...item,
      chapterId
    }
    updateCatalogItem(db, updated)
    return updated
  }

  mapBatch(db: Db, mappings: Array<{ catalogItemId: string; chapterId: string | null }>): void {
    db.transaction(() => {
      for (const m of mappings) {
        this.mapChapter(db, m.catalogItemId, m.chapterId)
      }
    })
  }
}
