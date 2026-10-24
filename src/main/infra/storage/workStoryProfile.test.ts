import { join } from 'node:path'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createWorkSchema, workPatchSchema } from '../../../shared/contracts/library'
import { createTempDirs } from '../../testing/testing'
import { migrate, type SchemaSpec } from './migrate'
import { openDatabase } from './sqlite'
import { insertWork, openWorkFile, patchWork, readWork } from './workFile'
import { workSchema } from './workSchema'

const tempDir = createTempDirs()

const upTo = (spec: SchemaSpec, version: number): SchemaSpec => ({
  ...spec,
  migrations: spec.migrations.filter((m) => m.version <= version)
})

const ID = '11111111-1111-4111-8111-111111111111'

function freshWork() {
  const db = openWorkFile(join(tempDir(), 'work.mira'))
  insertWork(db, ID, { title: 'T', sourceLang: 'ja' }, 1)
  return db
}

describe('hồ sơ truyện của tác phẩm (bối cảnh và văn hóa)', () => {
  it('tác phẩm lưu trước thay đổi này mở ra với các giá trị chưa chọn, không mất dữ liệu khác', () => {
    const path = join(tempDir(), 'old.mira')
    const old = openDatabase(path)
    migrate(old, upTo(workSchema, 17))
    old.exec(
      `INSERT INTO work (id, title, source_lang, genre, created_at, updated_at)
       VALUES ('${ID}', 'Cũ', 'ja', 'Fantasy', 1, 1)`
    )
    old.close()

    const db = openWorkFile(path)
    const work = readWork(db)
    db.close()
    expect(work).toMatchObject({
      title: 'Cũ',
      genre: 'Fantasy',
      setting: null,
      settingsExtra: [],
      culture: null
    })
  })

  it('đọc lại đúng bối cảnh chính, bối cảnh phụ và văn hóa đã lưu', () => {
    const db = freshWork()
    expect(
      patchWork(db, { setting: 'court', settingsExtra: ['cultivation'], culture: 'zh' }, 2)
    ).toBe(true)
    expect(readWork(db)).toMatchObject({
      setting: 'court',
      settingsExtra: ['cultivation'],
      culture: 'zh'
    })
    db.close()
  })

  it('"none" tắt bảng và xóa bối cảnh phụ, văn hóa vẫn giữ', () => {
    const db = freshWork()
    patchWork(db, { setting: 'modern', settingsExtra: ['game'], culture: 'ko' }, 2)
    patchWork(db, { setting: 'none' }, 3)
    expect(readWork(db)).toMatchObject({ setting: 'none', settingsExtra: [], culture: 'ko' })
    db.close()
  })

  it('bỏ chọn bối cảnh chính xóa luôn bối cảnh phụ', () => {
    const db = freshWork()
    patchWork(db, { setting: 'court', settingsExtra: ['cultivation'] }, 2)
    patchWork(db, { setting: null }, 3)
    expect(readWork(db)).toMatchObject({ setting: null, settingsExtra: [] })
    db.close()
  })

  it('bối cảnh phụ chỉ có nghĩa khi có bối cảnh chính thật', () => {
    const db = freshWork()
    expect(() => patchWork(db, { settingsExtra: ['game'] }, 2)).toThrow(/bối cảnh chính/)
    patchWork(db, { setting: 'none' }, 2)
    expect(() => patchWork(db, { settingsExtra: ['game'] }, 3)).toThrow(/bối cảnh chính/)
    expect(readWork(db).settingsExtra).toEqual([])
    db.close()
  })

  it('bối cảnh phụ trùng bối cảnh chính hoặc trùng nhau chỉ lưu một lần', () => {
    const db = freshWork()
    patchWork(db, { setting: 'court', settingsExtra: ['court', 'game', 'game'] }, 2)
    expect(readWork(db).settingsExtra).toEqual(['game'])
    db.close()
  })

  it('đổi bối cảnh chính khác đi giữ bối cảnh phụ còn hợp lệ', () => {
    const db = freshWork()
    patchWork(db, { setting: 'court', settingsExtra: ['cultivation'] }, 2)
    patchWork(db, { setting: 'fantasy' }, 3)
    expect(readWork(db)).toMatchObject({ setting: 'fantasy', settingsExtra: ['cultivation'] })
    patchWork(db, { setting: 'cultivation' }, 4)
    expect(readWork(db)).toMatchObject({ setting: 'cultivation', settingsExtra: [] })
    db.close()
  })

  it('giá trị ngoài danh sách bị schema ở biên từ chối và giá trị đã lưu không đổi', () => {
    expect(v.safeParse(workPatchSchema, { setting: 'steampunk' }).success).toBe(false)
    expect(v.safeParse(workPatchSchema, { culture: 'fr' }).success).toBe(false)
    expect(v.safeParse(workPatchSchema, { settingsExtra: ['none'] }).success).toBe(false)
    expect(
      v.safeParse(createWorkSchema, { title: 'T', sourceLang: 'ja', culture: 'xx' }).success
    ).toBe(false)
    expect(v.safeParse(workPatchSchema, { setting: 'none', culture: null }).success).toBe(true)
  })

  it('tạo tác phẩm với bối cảnh và văn hóa ghi luôn các giá trị đó', () => {
    const db = openWorkFile(join(tempDir(), 'new.mira'))
    insertWork(
      db,
      ID,
      { title: 'T', sourceLang: 'en', setting: 'modern', settingsExtra: ['game'], culture: 'ja' },
      1
    )
    expect(readWork(db)).toMatchObject({
      setting: 'modern',
      settingsExtra: ['game'],
      culture: 'ja'
    })
    db.close()
  })

  it('giá trị lạ đọc từ tệp (do bản khác ghi) bị bỏ qua thay vì làm hỏng tác phẩm', () => {
    const db = freshWork()
    db.exec(`UPDATE work SET setting = 'steampunk', settings_extra = 'game,xx', culture = 'fr'`)
    expect(readWork(db)).toMatchObject({ setting: null, settingsExtra: [], culture: null })
    db.close()
  })
})
