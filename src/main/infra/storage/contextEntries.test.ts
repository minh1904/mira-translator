import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { workSchema } from './workSchema'
import {
  createContextEntry,
  deleteContextEntry,
  getContextEntry,
  getEffectiveGlossary,
  listContextEntries,
  updateContextEntry
} from './contextEntries'
import { StorageError } from './errors'

const tempDir = createTempDirs()

function createTestDb(): Db {
  const db = openDatabase(join(tempDir(), 'work.mira'))
  migrate(db, workSchema)
  db.exec(`
    INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'Truyện', 'zh-Hans', 100, 100);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c1', 0, 'Chương 1', 100, 100);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c2', 1, 'Chương 2', 100, 100);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c3', 2, 'Chương 3', 100, 100);
  `)
  return db
}

describe('contextEntries storage', () => {
  it('creates, retrieves, updates and deletes a glossary entry', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, {
      source: '韩立',
      target: 'Hàn Lập',
      notes: 'Nhân vật chính',
      aliases: ['Lập Ca', 'Hàn Thiên Tôn']
    })

    expect(entry.id).toBeDefined()
    expect(entry.kind).toBe('term')
    expect(entry.status).toBe('approved')
    expect(entry.origin).toBe('user')
    expect(entry.forbidden).toBe(false)
    expect(entry.aliases).toEqual(['Hàn Thiên Tôn', 'Lập Ca'])

    // Retrieve
    const fetched = getContextEntry(db, entry.id)
    expect(fetched).toEqual(entry)

    // Update
    const updated = updateContextEntry(db, entry.id, {
      target: 'Hàn Lập (sửa)',
      forbidden: true,
      aliases: ['Lập Ca']
    })
    expect(updated.target).toBe('Hàn Lập (sửa)')
    expect(updated.forbidden).toBe(true)
    expect(updated.aliases).toEqual(['Lập Ca'])

    // Delete
    deleteContextEntry(db, entry.id)
    expect(getContextEntry(db, entry.id)).toBeNull()
    db.close()
  })

  it('rejects duplicate source or alias and prevents self-collision on update', () => {
    const db = createTestDb()
    createContextEntry(db, {
      source: '筑基',
      target: 'Trúc Cơ',
      aliases: ['Trúc Cơ Kỳ']
    })

    // Same source
    expect(() => createContextEntry(db, { source: '筑基', target: 'Trúc cơ khác' })).toThrowError(
      StorageError
    )

    // Source matching existing alias
    expect(() => createContextEntry(db, { source: 'Trúc Cơ Kỳ', target: 'Khác' })).toThrowError(
      StorageError
    )

    // Alias matching existing source
    expect(() =>
      createContextEntry(db, { source: 'Mới', target: 'Mới', aliases: ['筑基'] })
    ).toThrowError(StorageError)

    // Intra-input conflict: alias identical to source
    expect(() =>
      createContextEntry(db, { source: 'Kiếm', target: 'Kiếm', aliases: ['Kiếm'] })
    ).toThrowError(StorageError)

    // Intra-input conflict: duplicate alias
    expect(() =>
      createContextEntry(db, { source: 'Đao', target: 'Đao', aliases: ['Bảo Đao', 'Bảo Đao'] })
    ).toThrowError(StorageError)

    // Updating existing entry without changing source or aliases succeeds (no self-conflict)
    const entry2 = createContextEntry(db, {
      source: 'Kim Đan',
      target: 'Kim Đan',
      aliases: ['Kim Đan Kỳ']
    })
    const updated = updateContextEntry(db, entry2.id, {
      target: 'Kim Đan Cảnh'
    })
    expect(updated.target).toBe('Kim Đan Cảnh')

    db.close()
  })

  it('replaces a hidden rejected entry when a person adds or renames to the same word', () => {
    const db = createTestDb()
    const rejected = createContextEntry(db, { source: '东西', target: '', status: 'rejected' })
    const added = createContextEntry(db, { source: '东西', target: 'đồ vật' })
    expect(getContextEntry(db, rejected.id)).toBeNull()
    expect(getContextEntry(db, added.id)).toMatchObject({ target: 'đồ vật', status: 'approved' })

    createContextEntry(db, { source: '门', target: '', status: 'rejected' })
    const other = createContextEntry(db, { source: '大门', target: 'cổng' })
    expect(updateContextEntry(db, other.id, { aliases: ['门'] }).aliases).toEqual(['门'])
    // An approved entry still blocks.
    expect(() => createContextEntry(db, { source: '东西', target: 'x' })).toThrow(StorageError)
    db.close()
  })

  it('validates chapter scope and rejects invalid intervals', () => {
    const db = createTestDb()
    // Non-existent chapter
    expect(() =>
      createContextEntry(db, {
        source: 'S1',
        target: 'T1',
        fromChapterId: 'non-existent'
      })
    ).toThrowError('Không tìm thấy chương bắt đầu.')

    // Inverted chapters (c3 is pos 2, c1 is pos 0)
    expect(() =>
      createContextEntry(db, {
        source: 'S2',
        target: 'T2',
        fromChapterId: 'c3',
        toChapterId: 'c1'
      })
    ).toThrowError('Chương bắt đầu phải đứng trước hoặc bằng chương kết thúc.')

    // Valid range
    const valid = createContextEntry(db, {
      source: 'S3',
      target: 'T3',
      fromChapterId: 'c1',
      toChapterId: 'c2'
    })
    expect(valid.fromChapterId).toBe('c1')
    expect(valid.toChapterId).toBe('c2')
    db.close()
  })

  it('filters effective glossary by chapter and approval status', () => {
    const db = createTestDb()
    // Entry 1: universal, approved
    createContextEntry(db, {
      source: 'Thiên Lam Tông',
      target: 'Thiên Lam Tông',
      status: 'approved'
    })
    // Entry 2: c1 to c2 only, approved
    createContextEntry(db, {
      source: 'Luyện Khí',
      target: 'Luyện Khí',
      fromChapterId: 'c1',
      toChapterId: 'c2',
      status: 'approved'
    })
    // Entry 3: c3 onwards, approved
    createContextEntry(db, {
      source: 'Hóa Thần',
      target: 'Hóa Thần',
      fromChapterId: 'c3',
      status: 'approved'
    })
    // Entry 4: universal, pending
    createContextEntry(db, {
      source: 'Đan Dược',
      target: 'Đan Dược',
      status: 'pending'
    })

    // At c1: should have Thiên Lam Tông, Luyện Khí
    const atC1 = getEffectiveGlossary(db, 'c1')
    expect(atC1.map((e) => e.source)).toEqual(['Thiên Lam Tông', 'Luyện Khí'])

    // At c3: should have Thiên Lam Tông, Hóa Thần (Luyện Khí expired)
    const atC3 = getEffectiveGlossary(db, 'c3')
    expect(atC3.map((e) => e.source)).toEqual(['Thiên Lam Tông', 'Hóa Thần'])

    // When asking for pending too
    const allAtC1 = getEffectiveGlossary(db, 'c1', { approvedOnly: false })
    expect(allAtC1.map((e) => e.source)).toContain('Đan Dược')

    db.close()
  })

  it('retains glossary entry when bounding chapters are deleted', () => {
    const db = createTestDb()
    const entry = createContextEntry(db, {
      source: 'Thần Thú',
      target: 'Thần Thú',
      fromChapterId: 'c1',
      toChapterId: 'c2'
    })

    db.exec("DELETE FROM chapter WHERE id = 'c1'")
    const refreshed = getContextEntry(db, entry.id)
    expect(refreshed?.fromChapterId).toBeNull()
    expect(refreshed?.toChapterId).toBe('c2')
    db.close()
  })

  it('lists context entries with text search and status filter', () => {
    const db = createTestDb()
    createContextEntry(db, {
      source: 'Trúc Cơ',
      target: 'Trúc Cơ',
      status: 'approved',
      aliases: ['Trúc Cơ Đỉnh Phong']
    })
    createContextEntry(db, {
      source: 'Kim Đan',
      target: 'Kim Đan',
      status: 'pending'
    })
    createContextEntry(db, {
      source: 'Nguyên Anh',
      target: 'Nguyên Anh',
      status: 'rejected'
    })

    // Filter by status
    const approved = listContextEntries(db, { status: 'approved' })
    expect(approved).toHaveLength(1)
    expect(approved[0].source).toBe('Trúc Cơ')

    // Search by alias
    const searchedByAlias = listContextEntries(db, { query: 'Đỉnh Phong' })
    expect(searchedByAlias).toHaveLength(1)
    expect(searchedByAlias[0].source).toBe('Trúc Cơ')

    // Search by target
    const searchedByTarget = listContextEntries(db, { query: 'Kim Đan' })
    expect(searchedByTarget).toHaveLength(1)
    expect(searchedByTarget[0].source).toBe('Kim Đan')

    db.close()
  })
})
