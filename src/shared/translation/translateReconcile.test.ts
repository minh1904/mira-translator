import { describe, expect, it } from 'vitest'
import {
  mapToTempIds,
  normalizeTempId,
  reconcileTempItems,
  restoreDialogueQuotes
} from './translateReconcile'

describe('translateReconcile — Đối soát hợp đồng Lõi dịch', () => {
  it('ánh xạ đúng các đơn vị nguồn sang ID tạm [1], [2] và bỏ qua đơn vị rỗng', () => {
    const units = [
      { id: 'u1', text: 'Câu thứ nhất.' },
      { id: 'u2', text: '   ' },
      { id: 'u3', text: 'Câu thứ ba.' }
    ]

    const { sendable, skippedEmpty, idToTemp, tempToId } = mapToTempIds(units)

    expect(sendable).toEqual([
      { tempId: '[1]', originalId: 'u1', text: 'Câu thứ nhất.' },
      { tempId: '[2]', originalId: 'u3', text: 'Câu thứ ba.' }
    ])
    expect(skippedEmpty).toEqual([{ id: 'u2', text: '' }])
    expect(idToTemp.get('u1')).toBe('[1]')
    expect(idToTemp.get('u3')).toBe('[2]')
    expect(tempToId.get('[1]')).toBe('u1')
    expect(tempToId.get('[2]')).toBe('u3')
    expect(tempToId.get('1')).toBe('u1')
  })

  it('chép nguyên dòng phân cách, vẫn gửi thoại không chữ và dòng có chữ', () => {
    const units = [
      { id: 'u1', text: '　　　　　　　◇◇◇' },
      { id: 'u2', text: '――――――――――――――' },
      { id: 'u3', text: '＊＊＊' },
      { id: 'u4', text: '「――――？」' },
      { id: 'u5', text: '――そして。' },
      { id: 'u6', text: '◇ティルダ視点' }
    ]
    const { sendable, skippedEmpty } = mapToTempIds(units)
    expect(skippedEmpty).toEqual([
      { id: 'u1', text: '◇◇◇' },
      { id: 'u2', text: '――――――――――――――' },
      { id: 'u3', text: '＊＊＊' }
    ])
    expect(sendable.map((unit) => unit.originalId)).toEqual(['u4', 'u5', 'u6'])
  })

  it('bỏ khoảng trắng trước ngoặc đóng trong bản dịch', () => {
    const { sendable, tempToId } = mapToTempIds([{ id: 'u1', text: '「登録を……」' }])
    const result = reconcileTempItems(sendable, tempToId, [
      { tempId: '[1]', text: '“Tôi muốn đăng ký... ” và ‘ừ ’' }
    ])
    expect(result.matched).toEqual([{ id: 'u1', text: '“Tôi muốn đăng ký...” và ‘ừ’' }])
  })

  it('thêm lại ngoặc thoại mà bản dịch làm mất', () => {
    const dialogue = '「王都にはね……見捨てられた人間がいる」'
    // Mất cả hai ngoặc, quên ngoặc đóng, đã đủ: chỉ sửa hai ca đầu.
    expect(restoreDialogueQuotes(dialogue, 'Ở Vương đô ấy… có những người bị bỏ rơi.')).toBe(
      '“Ở Vương đô ấy… có những người bị bỏ rơi.”'
    )
    expect(restoreDialogueQuotes(dialogue, '“Ở làng Olum bên cạnh… đâu.')).toBe(
      '“Ở làng Olum bên cạnh… đâu.”'
    )
    expect(restoreDialogueQuotes(dialogue, '“Đủ rồi.”')).toBe('“Đủ rồi.”')
    expect(restoreDialogueQuotes('『肩書だけ立派』', 'Toàn là danh hão.')).toBe(
      '‘Toàn là danh hão.’'
    )
    // Lời kể, hay thoại kèm lời dẫn sau ngoặc, không bị đụng tới.
    expect(restoreDialogueQuotes('僕は頭を下げる。', 'Tôi cúi đầu.')).toBe('Tôi cúi đầu.')
    expect(restoreDialogueQuotes('「はい」と僕は言った。', 'Tôi đáp vâng.')).toBe('Tôi đáp vâng.')
  })

  it('chuẩn hóa các biến thể của ID tạm', () => {
    expect(normalizeTempId('[1]')).toBe('[1]')
    expect(normalizeTempId(' 1 ')).toBe('[1]')
    expect(normalizeTempId('[ 2 ]')).toBe('[2]')
    expect(normalizeTempId('#3')).toBe('[3]')
    expect(normalizeTempId('custom-id')).toBe('custom-id')
  })

  it('đối soát thành công 1–1 khi mô hình trả về đúng và đủ', () => {
    const units = [
      { id: 'u1', text: 'Hello' },
      { id: 'u2', text: 'World' }
    ]
    const { sendable, tempToId } = mapToTempIds(units)

    const modelItems = [
      { tempId: '[1]', text: 'Xin chào' },
      { tempId: '[2]', text: 'Thế giới' }
    ]

    const result = reconcileTempItems(sendable, tempToId, modelItems)

    expect(result.matched).toEqual([
      { id: 'u1', text: 'Xin chào' },
      { id: 'u2', text: 'Thế giới' }
    ])
    expect(result.missing).toHaveLength(0)
    expect(result.extraneous).toHaveLength(0)
    expect(result.empty).toHaveLength(0)
  })

  it('bảo toàn đúng ID khi mô hình đảo lộn thứ tự trả về', () => {
    const units = [
      { id: 'u1', text: 'Một' },
      { id: 'u2', text: 'Hai' },
      { id: 'u3', text: 'Ba' }
    ]
    const { sendable, tempToId } = mapToTempIds(units)

    const modelItems = [
      { tempId: '[3]', text: 'Three' },
      { tempId: '[1]', text: 'One' },
      { tempId: '[2]', text: 'Two' }
    ]

    const result = reconcileTempItems(sendable, tempToId, modelItems)

    expect(result.matched).toEqual([
      { id: 'u3', text: 'Three' },
      { id: 'u1', text: 'One' },
      { id: 'u2', text: 'Two' }
    ])
    expect(result.missing).toHaveLength(0)
  })

  it('phát hiện ID bị thiếu khi mô hình bỏ sót', () => {
    const units = [
      { id: 'u1', text: 'A' },
      { id: 'u2', text: 'B' },
      { id: 'u3', text: 'C' }
    ]
    const { sendable, tempToId } = mapToTempIds(units)

    const modelItems = [
      { tempId: '[1]', text: 'Bản dịch A' },
      { tempId: '[3]', text: 'Bản dịch C' }
    ]

    const result = reconcileTempItems(sendable, tempToId, modelItems)

    expect(result.matched).toHaveLength(2)
    expect(result.missing).toEqual(['u2'])
  })

  it('coi bản gốc chép lại là rỗng, trừ đoạn không có chữ', () => {
    const units = [
      { id: 'u1', text: '「そうですか」' },
      { id: 'u2', text: '「――――？」' }
    ]
    const { sendable, tempToId } = mapToTempIds(units)

    const result = reconcileTempItems(sendable, tempToId, [
      { tempId: '[1]', text: '「そうですか」' },
      { tempId: '[2]', text: '「――――？」' }
    ])

    expect(result.empty).toEqual(['u1'])
    expect(result.matched).toEqual([{ id: 'u2', text: '「――――？」' }])
  })

  it('nhận bản chép nguyên ở lượt hỏi lại: đoạn không dịch được thì giữ nguyên là đúng', () => {
    const units = [{ id: 'u1', text: 'asdsadfghgjghj' }]
    const { sendable, tempToId } = mapToTempIds(units)
    const items = [{ tempId: '[1]', text: 'asdsadfghgjghj' }]

    expect(reconcileTempItems(sendable, tempToId, items).empty).toEqual(['u1'])
    const repaired = reconcileTempItems(sendable, tempToId, items, { acceptEcho: true })
    expect(repaired.empty).toEqual([])
    expect(repaired.matched).toEqual([{ id: 'u1', text: 'asdsadfghgjghj' }])
  })

  it('bỏ qua ID lạ ngoài danh sách yêu cầu', () => {
    const units = [{ id: 'u1', text: 'Alpha' }]
    const { sendable, tempToId } = mapToTempIds(units)

    const modelItems = [
      { tempId: '[1]', text: 'Bản dịch 1' },
      { tempId: '[99]', text: 'Bản dịch lạ' },
      { tempId: 'ghost', text: 'Bản dịch ma' }
    ]

    const result = reconcileTempItems(sendable, tempToId, modelItems)

    expect(result.matched).toEqual([{ id: 'u1', text: 'Bản dịch 1' }])
    expect(result.extraneous).toEqual(['[99]', 'ghost'])
    expect(result.missing).toHaveLength(0)
  })

  it('chọn bản đầu tiên khi mô hình trả trùng một ID và phát hiện bản dịch rỗng', () => {
    const units = [
      { id: 'u1', text: 'X' },
      { id: 'u2', text: 'Y' }
    ]
    const { sendable, tempToId } = mapToTempIds(units)

    const modelItems = [
      { tempId: '[1]', text: 'Bản dịch đầu' },
      { tempId: '[1]', text: 'Bản dịch trùng' },
      { tempId: '[2]', text: '   ' }
    ]

    const result = reconcileTempItems(sendable, tempToId, modelItems)

    expect(result.matched).toEqual([{ id: 'u1', text: 'Bản dịch đầu' }])
    expect(result.empty).toEqual(['u2'])
    expect(result.missing).toHaveLength(0)
  })
})

describe('reconcileTempItems — duplicates', () => {
  it('counts a repeated id and keeps the first translation', () => {
    const { sendable, tempToId } = mapToTempIds([
      { id: 'a', text: 'x' },
      { id: 'b', text: 'y' }
    ])
    const result = reconcileTempItems(sendable, tempToId, [
      { tempId: '[1]', text: 'đầu' },
      { tempId: '[1]', text: 'lặp' },
      { tempId: '[2]', text: 'hai' }
    ])
    expect(result.duplicate).toBe(1)
    expect(result.matched).toEqual([
      { id: 'a', text: 'đầu' },
      { id: 'b', text: 'hai' }
    ])
  })
})
