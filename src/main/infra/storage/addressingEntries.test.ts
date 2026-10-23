import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempDirs } from '../../testing/testing'
import { migrate } from './migrate'
import { openDatabase, type Db } from './sqlite'
import { workSchema } from './workSchema'
import {
  createCharacter,
  deleteCharacter,
  deleteDyad,
  getCharacter,
  getDyad,
  getEffectiveDyadsForChapter,
  listCharacters,
  listDyads,
  saveAddressingProposals,
  setDyad,
  updateCharacter
} from './addressingEntries'
import { StorageError } from './errors'

const tempDir = createTempDirs()
const dbs: Db[] = []

afterEach(() => {
  for (const db of dbs.splice(0)) {
    db.close()
  }
})

function createTestDb(): Db {
  const db = openDatabase(join(tempDir(), `work-${Math.random().toString(36).slice(2)}.mira`))
  dbs.push(db)
  migrate(db, workSchema)
  db.exec(`
    INSERT INTO work (id, title, source_lang, created_at, updated_at) VALUES ('w', 'Truyện', 'zh-Hans', 100, 100);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c1', 0, 'Chương 1', 100, 100);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c2', 1, 'Chương 2', 100, 100);
    INSERT INTO chapter (id, position, title, created_at, updated_at) VALUES ('c3', 2, 'Chương 3', 100, 100);
  `)
  return db
}

describe('addressingEntries storage', () => {
  it('thực hiện các thao tác CRUD cho nhân vật', () => {
    const db = createTestDb()

    // 1. Create
    const char = createCharacter(db, {
      source: '韩立',
      target: 'Hàn Lập',
      gender: 'male',
      role: 'Nhân vật chính',
      notes: 'Thanh niên tu tiên cẩn thận',
      aliases: ['Lập Ca', 'Hàn Trưởng Lão']
    })

    expect(char.id).toBeDefined()
    expect(char.source).toBe('韩立')
    expect(char.target).toBe('Hàn Lập')
    expect(char.gender).toBe('male')
    expect(char.role).toBe('Nhân vật chính')
    expect(char.aliases).toEqual(['Hàn Trưởng Lão', 'Lập Ca'])

    // 2. Get
    const fetched = getCharacter(db, char.id)
    expect(fetched).toEqual(char)

    // 3. List
    const all = listCharacters(db, { query: 'Hàn' })
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(char.id)

    // 4. Update
    const updated = updateCharacter(db, char.id, {
      role: 'Đại tu sĩ',
      aliases: ['Lập Ca']
    })
    expect(updated.role).toBe('Đại tu sĩ')
    expect(updated.aliases).toEqual(['Lập Ca'])

    // 5. Delete
    deleteCharacter(db, char.id)
    expect(getCharacter(db, char.id)).toBeNull()
  })

  it('từ chối tạo nhân vật trùng tên gốc', () => {
    const db = createTestDb()
    createCharacter(db, { source: '韩立', target: 'Hàn Lập' })

    expect(() => createCharacter(db, { source: '韩立', target: 'Hàn Lập 2' })).toThrowError(
      StorageError
    )
  })

  it('adding a hidden rejected person by hand brings the same row back, approved', () => {
    const db = createTestDb()
    const old = createCharacter(db, { source: '墨大夫', target: 'Mặc', status: 'rejected' })
    const again = createCharacter(db, { source: '墨大夫', target: 'Mặc đại phu' })
    expect(again).toMatchObject({ id: old.id, target: 'Mặc đại phu', status: 'approved' })
    expect(listCharacters(db)).toHaveLength(1)
  })

  it('a new AI pair approves a rejected person, so the pair reaches the prompt', () => {
    const db = createTestDb()
    const han = createCharacter(db, { source: '韩立', target: 'Hàn Lập' })
    const mo = createCharacter(db, { source: '墨大夫', target: 'Mặc đại phu', status: 'rejected' })
    saveAddressingProposals(db, {
      runId: 'run',
      model: 'm',
      promptHash: 'h',
      now: 200,
      proposals: [
        {
          from: { source: '韩立', target: 'Hàn Lập' },
          to: { source: '墨大夫', target: 'Mặc đại phu' },
          self: 'đệ tử',
          address: 'sư phụ',
          evidence: [{ chapterId: 'c1', quote: '韩立道' }]
        }
      ]
    })
    expect(getCharacter(db, mo.id)?.status).toBe('approved')
    expect(getEffectiveDyadsForChapter(db, 'c1')).toEqual([
      expect.objectContaining({ sourceCharacterId: han.id, targetCharacterId: mo.id })
    ])
  })

  it('thao tác thiết lập, truy vấn và xóa quan hệ xưng hô (dyad)', () => {
    const db = createTestDb()
    const charA = createCharacter(db, { source: '韩立', target: 'Hàn Lập', gender: 'male' })
    const charB = createCharacter(db, {
      source: '南宫婉',
      target: 'Nam Cung Uyển',
      gender: 'female'
    })

    // 1. Set dyad A -> B
    const dyadAB = setDyad(db, {
      sourceCharacterId: charA.id,
      targetCharacterId: charB.id,
      speakerPronoun: 'ta',
      recipientPronoun: 'nàng',
      formality: 'thân mật',
      fromChapterId: 'c2'
    })

    expect(dyadAB.id).toBeDefined()
    expect(dyadAB.sourceCharacterId).toBe(charA.id)
    expect(dyadAB.targetCharacterId).toBe(charB.id)
    expect(dyadAB.speakerPronoun).toBe('ta')
    expect(dyadAB.recipientPronoun).toBe('nàng')
    expect(dyadAB.fromChapterId).toBe('c2')
    expect(dyadAB.toChapterId).toBeNull()

    // 2. Set dyad B -> A (chiều ngược lại độc lập)
    const dyadBA = setDyad(db, {
      sourceCharacterId: charB.id,
      targetCharacterId: charA.id,
      speakerPronoun: 'thiếp',
      recipientPronoun: 'chàng'
    })

    expect(dyadBA.speakerPronoun).toBe('thiếp')
    expect(dyadBA.recipientPronoun).toBe('chàng')

    // 3. List dyads
    const list = listDyads(db)
    expect(list).toHaveLength(2)

    // 4. Update dyad via setDyad with dyadId
    const updatedDyad = setDyad(db, {
      dyadId: dyadAB.id,
      sourceCharacterId: charA.id,
      targetCharacterId: charB.id,
      speakerPronoun: 'huynh',
      recipientPronoun: 'muội'
    })
    expect(updatedDyad.speakerPronoun).toBe('huynh')
    expect(updatedDyad.recipientPronoun).toBe('muội')

    // 5. Delete dyad
    deleteDyad(db, dyadAB.id)
    expect(getDyad(db, dyadAB.id)).toBeNull()
  })

  it('kiểm tra tính hợp lệ khi thiết lập dyad', () => {
    const db = createTestDb()
    const charA = createCharacter(db, { source: '韩立', target: 'Hàn Lập' })

    // Self-dyad not allowed
    expect(() =>
      setDyad(db, {
        sourceCharacterId: charA.id,
        targetCharacterId: charA.id,
        speakerPronoun: 'ta',
        recipientPronoun: 'ta'
      })
    ).toThrowError(StorageError)

    // Invalid chapter order (c3 before c1)
    const charB = createCharacter(db, { source: '南宫婉', target: 'Nam Cung Uyển' })
    expect(() =>
      setDyad(db, {
        sourceCharacterId: charA.id,
        targetCharacterId: charB.id,
        speakerPronoun: 'ta',
        recipientPronoun: 'nàng',
        fromChapterId: 'c3',
        toChapterId: 'c1'
      })
    ).toThrowError(StorageError)
  })

  it('lọc xưng hô có hiệu lực theo chương getEffectiveDyadsForChapter', () => {
    const db = createTestDb()
    const charA = createCharacter(db, { source: '韩立', target: 'Hàn Lập' })
    const charB = createCharacter(db, { source: '南宫婉', target: 'Nam Cung Uyển' })

    // Dyad hiệu lực từ c2 trở đi
    setDyad(db, {
      sourceCharacterId: charA.id,
      targetCharacterId: charB.id,
      speakerPronoun: 'huynh',
      recipientPronoun: 'muội',
      fromChapterId: 'c2'
    })

    // Ở c1: chưa có hiệu lực
    const dyadsAtC1 = getEffectiveDyadsForChapter(db, 'c1')
    expect(dyadsAtC1).toHaveLength(0)

    // Ở c2: có hiệu lực
    const dyadsAtC2 = getEffectiveDyadsForChapter(db, 'c2')
    expect(dyadsAtC2).toHaveLength(1)
    expect(dyadsAtC2[0].sourceCharacter.target).toBe('Hàn Lập')
    expect(dyadsAtC2[0].targetCharacter.target).toBe('Nam Cung Uyển')
    expect(dyadsAtC2[0].speakerPronoun).toBe('huynh')

    // Ở c3: vẫn có hiệu lực (không có toChapterId)
    const dyadsAtC3 = getEffectiveDyadsForChapter(db, 'c3')
    expect(dyadsAtC3).toHaveLength(1)
  })

  it('xóa nhân vật tự động dọn dẹp các dyad liên quan', () => {
    const db = createTestDb()
    const charA = createCharacter(db, { source: '韩立', target: 'Hàn Lập' })
    const charB = createCharacter(db, { source: '南宫婉', target: 'Nam Cung Uyển' })

    setDyad(db, {
      sourceCharacterId: charA.id,
      targetCharacterId: charB.id,
      speakerPronoun: 'ta',
      recipientPronoun: 'nàng'
    })
    setDyad(db, {
      sourceCharacterId: charB.id,
      targetCharacterId: charA.id,
      speakerPronoun: 'thiếp',
      recipientPronoun: 'chàng'
    })

    expect(listDyads(db)).toHaveLength(2)

    deleteCharacter(db, charA.id)
    expect(listDyads(db)).toHaveLength(0)
  })
})
