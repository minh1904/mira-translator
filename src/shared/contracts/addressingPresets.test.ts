import { describe, expect, it } from 'vitest'
import { ADDRESSING_RULES } from './addressingPresets'

// Dữ liệu bảng theo bối cảnh và văn hóa có test riêng ở `addressing/presetTables.test.ts`.
describe('luật xưng hô chung', () => {
  it('cấm cặp "tôi – bạn" (chốt ngày 2026-10-05)', () => {
    expect(ADDRESSING_RULES.join('\n')).toContain('Không dùng "tôi – bạn"')
  })

  it('không gắn đại từ của một ngôn ngữ nguồn hay một quan hệ riêng', () => {
    const general = ADDRESSING_RULES.join('\n')
    expect(general).not.toMatch(/[぀-ヿ]|お前|貴様/)
    expect(general).not.toContain('Giáo viên')
    expect(general).toContain('giữ cách gọi tương ứng theo quy ước tên')
  })

  it('có luật suy cặp từ tuổi, quan hệ, trang trọng và tước vị khi chưa có cặp hay dòng phù hợp', () => {
    const general = ADDRESSING_RULES.join('\n')
    expect(general).toContain('suy cặp từ tuổi tương đối')
    expect(general).toContain('chức danh hay tước vị')
  })
})
