import { describe, expect, it } from 'vitest'
import { planBatches, estimateTextTokens } from './translatePlanner'

describe('translatePlanner — Lập kế hoạch phân lô Lõi dịch', () => {
  it('ước tính số token phân biệt theo ngôn ngữ', () => {
    const zh = '这是中文内容。'
    const en = 'This is English content.'
    expect(estimateTextTokens(zh, 'zh-Hans')).toBeGreaterThan(0)
    expect(estimateTextTokens(en, 'en')).toBeGreaterThan(0)
  })

  it('chia lô khi vượt giới hạn số đơn vị (maxUnits)', () => {
    const units = Array.from({ length: 15 }, (_, i) => ({
      id: `u${i + 1}`,
      text: `Câu thứ ${i + 1}.`
    }))

    const plan = planBatches(units, { maxUnits: 5, maxTokens: 10000 })

    expect(plan.batches).toHaveLength(3)
    expect(plan.batches[0].units).toHaveLength(5)
    expect(plan.batches[1].units).toHaveLength(5)
    expect(plan.batches[2].units).toHaveLength(5)
    expect(plan.totalUnits).toBe(15)
  })

  it('chia lô khi vượt giới hạn token (maxTokens)', () => {
    const units = [
      { id: 'u1', text: 'Đoạn văn tương đối dài thứ nhất...' },
      { id: 'u2', text: 'Đoạn văn tương đối dài thứ hai...' },
      { id: 'u3', text: 'Đoạn văn tương đối dài thứ ba...' }
    ]

    // Đặt trần token rất nhỏ để mỗi đơn vị rơi vào 1 lô
    const plan = planBatches(units, { maxUnits: 10, maxTokens: 10 })

    expect(plan.batches.length).toBeGreaterThanOrEqual(2)
  })

  // Mảnh tạm không được ráp lại ở đâu cả, nên cắt đoạn là làm mất bản dịch của đoạn đó.
  it('giữ nguyên một đoạn dài hơn trần token, đặt nó trong một lô riêng', () => {
    const longUnit = { id: 'long-u1', text: 'Câu một. '.repeat(2500) }
    const plan = planBatches([{ id: 'u0', text: 'Ngắn.' }, longUnit, { id: 'u2', text: 'Ngắn.' }])

    expect(plan.batches.map((batch) => batch.units.map((unit) => unit.id))).toEqual([
      ['u0'],
      ['long-u1'],
      ['u2']
    ])
    expect(plan.batches[1].units[0]).toEqual(longUnit)
    expect(plan.totalUnits).toBe(3)
  })
})
