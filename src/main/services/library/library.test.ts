import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StorageError } from '../../infra/storage/errors'
import { LibraryStore } from './library'
import { LIBRARY_APPLICATION_ID, librarySchema } from '../../infra/storage/librarySchema'
import { migrate, readPragmas, type SchemaSpec } from '../../infra/storage/migrate'
import { openDatabase } from '../../infra/storage/sqlite'
import { createTempDirs } from '../../testing/testing'
import { workSchema } from '../../infra/storage/workSchema'

const tempDir = createTempDirs()
const stores: LibraryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function open(dataDir: string, now = 1_000): LibraryStore {
  let clock = now
  const store = LibraryStore.open({ dataDir, now: () => clock++ })
  stores.push(store)
  return store
}

function reopen(store: LibraryStore, dataDir: string, now = 5_000): LibraryStore {
  store.close()
  stores.splice(stores.indexOf(store), 1)
  return open(dataDir, now)
}

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (error) {
    return error instanceof StorageError ? error.code : 'not-a-storage-error'
  }
  return undefined
}

describe('LibraryStore', () => {
  it('starts empty on first run without errors', () => {
    const store = open(tempDir())
    expect(store.list()).toEqual({ works: [], problems: [] })
  })

  it('creates a work with only a title and a source language', () => {
    const store = open(tempDir())
    const work = store.create({ title: '  Hiệu thuốc trên núi  ', sourceLang: 'zh-Hans' })

    expect(work).toMatchObject({
      title: 'Hiệu thuốc trên núi',
      sourceLang: 'zh-Hans',
      status: 'not-started',
      archived: false,
      chapterCount: 0,
      lastChapter: null,
      originalTitle: null,
      description: null
    })
    expect(store.list().works.map((w) => w.id)).toEqual([work.id])
  })

  it('keeps optional details and round-trips Unicode exactly', () => {
    const store = open(tempDir())
    const work = store.create({
      title: 'Ngọc đình ký 玉庭記 😀',
      originalTitle: '玉庭記',
      description: 'Dòng một\r\nDòng hai',
      sourceLang: 'zh-Hant'
    })
    expect(store.get(work.id)).toEqual(work)
    expect(work.originalTitle).toBe('玉庭記')
    expect(work.description).toBe('Dòng một\r\nDòng hai')
  })

  it('rejects an empty or whitespace-only title and creates nothing', () => {
    const dir = tempDir()
    const store = open(dir)
    expect(codeOf(() => store.create({ title: '   ', sourceLang: 'en' }))).toBe('validation')
    expect(store.list().works).toEqual([])
    expect(readdirSync(join(dir, 'works')).filter((n) => n.endsWith('.mira'))).toEqual([])
  })

  it('leaves no partial file and lists nothing when a new work cannot be built', () => {
    const dir = tempDir()
    const store = open(dir)
    // The title passes but the empty language fails on the work file's own CHECK constraint, after
    // the partial file exists. The part has to be removed and the failure has to be a storage error.
    const code = codeOf(() => store.create({ title: 'Truyện', sourceLang: '' as never }))
    expect(code).toBeDefined()
    expect(code).not.toBe('not-a-storage-error')
    expect(store.list().works).toEqual([])
    expect(readdirSync(join(dir, 'works')).filter((n) => n.endsWith('.mira'))).toEqual([])
    expect(readdirSync(join(dir, 'works', '.tmp'))).toEqual([])
  })

  it('keeps works, names and timestamps after the app is reopened', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({ title: 'A', sourceLang: 'en' })
    store.update(work.id, { title: 'B', status: 'paused', archived: true })
    const before = store.list()

    store = reopen(store, dir)
    expect(store.list()).toEqual(before)
    expect(store.get(work.id)).toMatchObject({ title: 'B', status: 'paused', archived: true })
  })

  it('renames, pauses, resumes and archives, refreshing updatedAt each time', () => {
    const store = open(tempDir())
    const work = store.create({ title: 'A', sourceLang: 'ja' })

    const renamed = store.update(work.id, { title: 'B' })
    expect(renamed.title).toBe('B')
    expect(renamed.updatedAt).toBeGreaterThan(work.updatedAt)

    const paused = store.update(work.id, { status: 'paused' })
    expect(paused.status).toBe('paused')
    const resumed = store.update(work.id, { status: 'in-progress' })
    expect(resumed.status).toBe('in-progress')
    expect(resumed.updatedAt).toBeGreaterThan(paused.updatedAt)

    const archived = store.update(work.id, { archived: true })
    expect(archived.archived).toBe(true)
    expect(store.update(work.id, { archived: false }).archived).toBe(false)
  })

  it('archiving does not delete the work or its file', () => {
    const dir = tempDir()
    const store = open(dir)
    const work = store.create({ title: 'A', sourceLang: 'en' })
    store.update(work.id, { archived: true })
    expect(existsSync(join(dir, 'works', work.id + '.mira'))).toBe(true)
    expect(store.list().works).toHaveLength(1)
  })

  it('clears optional fields with null and leaves absent keys unchanged', () => {
    const store = open(tempDir())
    const work = store.create({
      title: 'A',
      originalTitle: 'X',
      description: 'D',
      sourceLang: 'en'
    })
    const changed = store.update(work.id, { originalTitle: null })
    expect(changed.originalTitle).toBeNull()
    expect(changed.description).toBe('D')
  })

  it('does not touch updatedAt for an empty patch', () => {
    const store = open(tempDir())
    const work = store.create({ title: 'A', sourceLang: 'en' })
    expect(store.update(work.id, {}).updatedAt).toBe(work.updatedAt)
  })

  it('rejects a patch that violates a rule and leaves the work unchanged', () => {
    const store = open(tempDir())
    const work = store.create({ title: 'A', sourceLang: 'en' })
    expect(codeOf(() => store.update(work.id, { title: '' }))).toBe('io')
    expect(store.get(work.id).title).toBe('A')
  })

  it('lists works by most recently updated first', () => {
    const store = open(tempDir())
    const a = store.create({ title: 'A', sourceLang: 'en' })
    const b = store.create({ title: 'B', sourceLang: 'en' })
    expect(store.list().works.map((w) => w.id)).toEqual([b.id, a.id])
    store.update(a.id, { title: 'A2' })
    expect(store.list().works.map((w) => w.id)).toEqual([a.id, b.id])
  })

  it('reports unknown ids as not found and refuses ids that are not UUIDs', () => {
    const store = open(tempDir())
    expect(codeOf(() => store.get('11111111-1111-4111-8111-111111111111'))).toBe('not_found')
    expect(codeOf(() => store.get('../library'))).toBe('validation')
    expect(codeOf(() => store.update('..\\..\\evil', { title: 'x' }))).toBe('validation')
  })
})

describe('LibraryStore recovery', () => {
  it('keeps other works usable when one work file is corrupt and reports the problem', () => {
    const dir = tempDir()
    let store = open(dir)
    const good = store.create({ title: 'Good', sourceLang: 'en' })
    const bad = store.create({ title: 'Bad', sourceLang: 'en' })
    store.close()
    stores.length = 0
    writeFileSync(join(dir, 'works', bad.id + '.mira'), 'this is not a database')

    store = open(dir)
    const { works, problems } = store.list()
    expect(works.map((w) => w.id)).toEqual([good.id])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ fileName: bad.id + '.mira', code: 'corrupt' })
    expect(store.update(good.id, { title: 'Still works' }).title).toBe('Still works')
  })

  it('rebuilds the index from work files when library.db is missing', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({ title: 'A', sourceLang: 'ja' })
    store.close()
    stores.length = 0
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(join(dir, 'library.db' + suffix), { force: true })

    store = open(dir)
    expect(store.list().works.map((w) => w.id)).toEqual([work.id])
  })

  it('restores a corrupt library.db from backup and rebuilds the index', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({ title: 'A', sourceLang: 'en' })
    store.close()
    stores.length = 0

    // Provide a valid backup
    mkdirSync(join(dir, 'backups'), { recursive: true })
    copyFileSync(join(dir, 'library.db'), join(dir, 'backups', 'library-backup-1.db'))

    for (const suffix of ['-wal', '-shm']) rmSync(join(dir, 'library.db' + suffix), { force: true })
    writeFileSync(join(dir, 'library.db'), 'garbage')

    store = open(dir)
    expect(store.list().works.map((w) => w.id)).toEqual([work.id])
    expect(readdirSync(dir).some((n) => n.startsWith('library.db.corrupt-'))).toBe(true)
  })

  it('refuses a corrupt library.db without silently recreating it when no backup exists', () => {
    const dir = tempDir()
    const store = open(dir)
    store.create({ title: 'A', sourceLang: 'en' })
    store.close()
    stores.length = 0

    for (const suffix of ['-wal', '-shm']) rmSync(join(dir, 'library.db' + suffix), { force: true })
    writeFileSync(join(dir, 'library.db'), 'garbage')

    expect(() => open(dir)).toThrow(/không tìm thấy bản sao lưu hợp lệ/)
    expect(readdirSync(dir).some((n) => n.startsWith('library.db.corrupt-'))).toBe(false)
    expect(readFileSync(join(dir, 'library.db'), 'utf-8')).toBe('garbage')
  })

  it('refuses a work file from a newer schema without modifying it', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({ title: 'A', sourceLang: 'en' })
    store.close()
    stores.length = 0
    const path = join(dir, 'works', work.id + '.mira')
    const raw = openDatabase(path)
    raw.exec('PRAGMA user_version = 99')
    raw.close()
    const before = readFileSync(path)

    store = open(dir)
    expect(store.list().works).toEqual([])
    expect(store.list().problems[0]).toMatchObject({ code: 'unsupported_version' })
    store.close()
    stores.length = 0
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('reports a work file whose name does not match the work inside', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({ title: 'A', sourceLang: 'en' })
    store.close()
    stores.length = 0
    renameSync(
      join(dir, 'works', work.id + '.mira'),
      join(dir, 'works', '22222222-2222-4222-8222-222222222222.mira')
    )

    store = open(dir)
    expect(store.list().works).toEqual([])
    expect(store.list().problems[0].code).toBe('corrupt')
  })

  it('repairs an index that drifted from the work file', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({ title: 'Old', sourceLang: 'en' })
    store.close()
    stores.length = 0

    const raw = openDatabase(join(dir, 'works', work.id + '.mira'))
    raw.prepare('UPDATE work SET title = ?').run('Changed behind the index')
    raw.close()

    store = open(dir)
    expect(store.list().works[0].title).toBe('Changed behind the index')
  })

  it('removes leftover partial files on startup and never lists them', () => {
    const dir = tempDir()
    const store = open(dir)
    store.close()
    stores.length = 0
    for (const name of [
      'abc.mira.part',
      'abc.mira.part-journal',
      'abc.mira.part-wal',
      'stray.txt'
    ]) {
      writeFileSync(join(dir, 'works', '.tmp', name), 'half written')
    }

    const reopened = open(dir)
    expect(reopened.list()).toEqual({ works: [], problems: [] })
    expect(readdirSync(join(dir, 'works', '.tmp'))).toEqual([])
  })
})

describe('LibraryStore author and genre', () => {
  it('stores optional author and genre and trims them', () => {
    const store = open(tempDir())
    const work = store.create({
      title: 'Hiệu thuốc trên núi',
      sourceLang: 'zh-Hans',
      author: '  Lý Minh  ',
      genre: 'Tiên hiệp, cổ đại'
    })
    expect(work).toMatchObject({ author: 'Lý Minh', genre: 'Tiên hiệp, cổ đại' })
    expect(store.list().works[0]).toMatchObject({ author: 'Lý Minh', genre: 'Tiên hiệp, cổ đại' })
  })

  it('defaults both to null and lets them be changed and cleared', () => {
    const store = open(tempDir())
    const work = store.create({ title: 'A', sourceLang: 'en' })
    expect(work).toMatchObject({ author: null, genre: null })

    const set = store.update(work.id, { author: 'X', genre: 'Hiện đại' })
    expect(set).toMatchObject({ author: 'X', genre: 'Hiện đại' })
    const cleared = store.update(work.id, { genre: null })
    expect(cleared).toMatchObject({ author: 'X', genre: null })
    expect(store.list().works[0]).toMatchObject({ author: 'X', genre: null })
  })
})

describe('LibraryStore upgrade from schema v1', () => {
  it('opens data written by the first release, keeps it, and adds the new fields', () => {
    const dir = tempDir()
    const id = '33333333-3333-4333-8333-333333333333'
    mkdirSync(join(dir, 'works'), { recursive: true })

    // A data directory exactly as version 1 wrote it: only migration 1 applied to both files.
    const stopAtV1 = (spec: SchemaSpec): SchemaSpec => ({
      ...spec,
      migrations: spec.migrations.filter((m) => m.version <= 1)
    })
    const work = openDatabase(join(dir, 'works', id + '.mira'))
    migrate(work, stopAtV1(workSchema))
    work
      .prepare(
        `INSERT INTO work (id, title, original_title, source_lang, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, 'Ngọc đình ký', '玉庭記', 'zh-Hant', 10, 20)
    work.close()
    const index = openDatabase(join(dir, 'library.db'))
    migrate(index, stopAtV1(librarySchema))
    index.close()

    const store = open(dir)
    expect(store.list().problems).toEqual([])
    expect(store.list().works).toHaveLength(1)
    expect(store.list().works[0]).toMatchObject({
      id,
      title: 'Ngọc đình ký',
      originalTitle: '玉庭記',
      author: null,
      genre: null,
      createdAt: 10
    })
    expect(store.update(id, { author: 'Tác giả', genre: 'Cung đấu' })).toMatchObject({
      title: 'Ngọc đình ký',
      author: 'Tác giả',
      genre: 'Cung đấu'
    })
    store.close()
    stores.length = 0

    for (const [name, spec] of [
      [join('works', id + '.mira'), workSchema],
      ['library.db', librarySchema]
    ] as const) {
      const db = openDatabase(join(dir, name))
      expect(readPragmas(db).userVersion).toBe(spec.migrations.length)
      db.close()
    }
    expect(LIBRARY_APPLICATION_ID).toBe(0x4d49524c)
  })

  it('lấy danh sách xưng hô có hiệu lực theo chương (getEffectiveAddressing)', () => {
    const store = open(tempDir())
    const work = store.create({ title: 'Truyện tu tiên', sourceLang: 'zh-Hans' })
    const c1 = store.createChapter(work.id, 'Chương 1')
    const c2 = store.createChapter(work.id, 'Chương 2')

    // Thêm nhân vật & dyad qua withWork
    store.withWork(work.id, (db) => {
      db.prepare(`
        INSERT INTO context_entry (id, kind, source, target, status, origin, forbidden, created_at, updated_at)
        VALUES ('char-a', 'character', '韩立', 'Hàn Lập', 'approved', 'user', 0, 100, 100),
               ('char-b', 'character', '南宫婉', 'Nam Cung Uyển', 'approved', 'user', 0, 100, 100)
      `).run()
      db.prepare(`
        INSERT INTO context_entry (id, kind, source, target, status, origin, forbidden, from_chapter_id, notes, created_at, updated_at)
        VALUES ('d1', 'dyad', 'char-a', 'char-b', 'approved', 'user', 0, ?, '{"speakerPronoun":"ta","recipientPronoun":"nàng"}', 100, 100)
      `).run(c2.chapter.id)
    })

    // Ở c1: chưa có hiệu lực
    const dyadsC1 = store.getEffectiveAddressing(work.id, c1.chapter.id)
    expect(dyadsC1).toHaveLength(0)

    // Ở c2: có hiệu lực
    const dyadsC2 = store.getEffectiveAddressing(work.id, c2.chapter.id)
    expect(dyadsC2).toHaveLength(1)
    expect(dyadsC2[0].sourceCharacter.target).toBe('Hàn Lập')
    expect(dyadsC2[0].targetCharacter.target).toBe('Nam Cung Uyển')
    expect(dyadsC2[0].speakerPronoun).toBe('ta')
    expect(dyadsC2[0].recipientPronoun).toBe('nàng')
  })
})

describe('LibraryStore story profile', () => {
  it('lưu bối cảnh và văn hóa, hiện ở danh sách, và dựng lại được từ tệp tác phẩm khi mất chỉ mục', () => {
    const dir = tempDir()
    let store = open(dir)
    const work = store.create({
      title: 'A',
      sourceLang: 'en',
      setting: 'court',
      settingsExtra: ['cultivation'],
      culture: 'zh'
    })
    expect(store.list().works[0]).toMatchObject({
      setting: 'court',
      settingsExtra: ['cultivation'],
      culture: 'zh'
    })

    store.update(work.id, { culture: 'ja', setting: 'none' })
    expect(store.get(work.id)).toMatchObject({ setting: 'none', settingsExtra: [], culture: 'ja' })
    expect(store.list().works[0]).toMatchObject({ setting: 'none', culture: 'ja' })

    store.close()
    stores.length = 0
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(join(dir, 'library.db' + suffix), { force: true })
    store = open(dir)
    expect(store.list().works[0]).toMatchObject({
      setting: 'none',
      settingsExtra: [],
      culture: 'ja'
    })
  })
})
