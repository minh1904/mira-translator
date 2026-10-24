import { describe, expect, it } from 'vitest'
import { ADDRESSING_RULES } from '../addressingPresets'
import { composePreset } from './compose'
import type { CultureId, PresetRow, SettingId } from './types'
import { CULTURE_IDS, SETTING_IDS } from './types'
import { PRESET_TABLES } from './presetTables'

/** Trần số dòng của một bảng ghép khi chỉ có một bối cảnh (D1): giữ system prompt gọn. */
const MAX_ROWS = 14

const allRows = (): Array<{ where: string; row: PresetRow }> => [
  ...SETTING_IDS.flatMap((id) =>
    PRESET_TABLES.settings[id].rows.map((row) => ({ where: `setting:${id}`, row }))
  ),
  ...CULTURE_IDS.flatMap((culture) =>
    SETTING_IDS.flatMap((id) =>
      (PRESET_TABLES.cultures[culture].rows[id] ?? []).map((row) => ({
        where: `${culture}:${id}`,
        row
      }))
    )
  )
]

describe('dữ liệu bảng xưng hô', () => {
  it('mỗi bối cảnh có nhãn, dòng chung và luật ngôi ba; mỗi văn hóa có nhãn', () => {
    for (const id of SETTING_IDS) {
      const setting = PRESET_TABLES.settings[id]
      expect(setting.label.trim(), id).not.toBe('')
      expect(setting.rows.length, id).toBeGreaterThan(2)
      expect(setting.thirdPerson.length, id).toBeGreaterThan(0)
    }
    for (const id of CULTURE_IDS) expect(PRESET_TABLES.cultures[id].label.trim(), id).not.toBe('')
  })

  it('mỗi văn hóa có dòng riêng cho ít nhất một bối cảnh', () => {
    for (const id of CULTURE_IDS) {
      expect(Object.keys(PRESET_TABLES.cultures[id].rows).length, id).toBeGreaterThan(0)
    }
  })

  it('mỗi dòng có quan hệ, đúng một cặp ở mỗi ô, và nhãn độ tin cậy', () => {
    for (const { where, row } of allRows()) {
      const label = `${where} · ${row.relation}`
      expect(row.relation.trim(), label).not.toBe('')
      expect(row.forward, label).toMatch(/–/)
      expect(row.forward, label).not.toMatch(/ hoặc /)
      expect(row.backward ?? '', label).not.toMatch(/ hoặc /)
      expect(['high', 'medium', 'low'], label).toContain(row.confidence)
    }
  })

  it('ghi chú chỉ nói với model: không lộ ngày chốt, câu hỏi mở hay nhãn nguồn của tài liệu khảo sát', () => {
    const meta =
      /Chốt \d{4}|câu hỏi mở|chưa chốt|chưa có nguồn|nguồn công khai|\[(Suy|Nguồn|Repo)\]|khảo sát|\bLab\b/i
    for (const { where, row } of allRows()) {
      for (const text of [
        row.relation,
        row.signals ?? '',
        row.forward,
        row.backward ?? '',
        row.notes ?? ''
      ]) {
        expect(text, where + ' · ' + row.relation).not.toMatch(meta)
      }
    }
  })

  it('không gợi ý cặp "tôi – bạn" ở bất kỳ đâu (chốt ngày 2026-10-05)', () => {
    for (const { where, row } of allRows()) {
      expect(row.forward, where).not.toMatch(/tôi – bạn/)
      expect(row.backward ?? '', where).not.toMatch(/tôi – bạn/)
    }
    expect(ADDRESSING_RULES.join('\n')).toContain('Không dùng "tôi – bạn"')
  })

  it('không có hai dòng cùng quan hệ trong cùng một danh sách', () => {
    const lists = [
      ...SETTING_IDS.map((id) => ({ where: id, rows: PRESET_TABLES.settings[id].rows })),
      ...CULTURE_IDS.flatMap((culture) =>
        SETTING_IDS.map((id) => ({
          where: `${culture}:${id}`,
          rows: PRESET_TABLES.cultures[culture].rows[id] ?? []
        }))
      )
    ]
    for (const { where, rows } of lists) {
      const keys = rows.map((row) => row.relation.trim().toLowerCase())
      expect(new Set(keys).size, where).toBe(keys.length)
    }
  })

  it('bảng ghép của mọi tổ hợp một bối cảnh không vượt trần dòng', () => {
    const cultures: Array<CultureId | null> = [null, ...CULTURE_IDS]
    for (const setting of SETTING_IDS) {
      for (const culture of cultures) {
        const preset = composePreset({ setting, extra: [], culture })
        expect(preset?.rows.length, `${setting}/${culture}`).toBeLessThanOrEqual(MAX_ROWS)
      }
    }
  })

  it('fantasy không gợi ý "thần" làm cách tự xưng của bề tôi (chốt ngày 2026-10-14)', () => {
    for (const culture of CULTURE_IDS) {
      const rows = [
        ...PRESET_TABLES.settings.fantasy.rows,
        ...(PRESET_TABLES.cultures[culture].rows.fantasy ?? [])
      ]
      for (const row of rows.filter((r) => r.relation.includes('hoàng tộc'))) {
        expect(row.forward, `${culture} · ${row.relation}`).not.toMatch(/^thần/)
      }
    }
  })

  it('quan hệ hầu hoặc người khế ước với chủ trong fantasy không đặt "em" làm cặp mặc định (D8)', () => {
    for (const culture of [null, ...CULTURE_IDS] as Array<CultureId | null>) {
      const preset = composePreset({ setting: 'fantasy', extra: [], culture })
      for (const row of preset?.rows.filter((r) => /hầu|khế ước|quản gia/i.test(r.relation)) ??
        []) {
        expect(row.forward, `${culture} · ${row.relation}`).not.toMatch(/^em\b/)
      }
    }
  })

  it('mọi bối cảnh được văn hóa tham chiếu đều có trong danh sách bối cảnh', () => {
    for (const culture of CULTURE_IDS) {
      for (const id of Object.keys(PRESET_TABLES.cultures[culture].rows)) {
        expect(SETTING_IDS as readonly string[]).toContain(id as SettingId)
      }
    }
  })
})
