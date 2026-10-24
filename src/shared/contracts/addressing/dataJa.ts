import type { CultureData } from './types'

/**
 * Văn hóa Nhật: dòng riêng. Cung đình Nhật bản địa (Heian, Sengoku), yakuza, idol không có dòng
 * (nguồn yếu hoặc ít giá trị); cultivation không có truyện Nhật đủ phổ biến.
 */
export const JA: CultureData = {
  label: 'Nhật',
  rows: {
    modern: [
      {
        relation: 'Bạn thân, nói thô',
        signals: '俺 + お前, gọi trống tên',
        forward: 'tao – mày',
        notes:
          'Chỉ vai phụ ồn ào, côn đồ hoặc cặp thân lâu năm cùng nói thô; không gán cho nhân vật chính. Bạn nữ hoặc nam–nữ là bạn: "tớ – cậu"',
        confidence: 'medium'
      }
    ],
    fantasy: [
      {
        relation: 'Quý tộc ngang hàng, thân',
        signals: '俺/僕 + お前/君, nói trống',
        forward: 'tôi – cậu',
        notes: 'Nam rất thân, cả hai nói thô: "tao – mày" chỉ khi cặp đã duyệt',
        confidence: 'medium'
      }
    ],
    game: [
      {
        relation: 'Nhà mạo hiểm giả ↔ nhân viên hội',
        signals: '受付嬢, ギルド',
        forward: 'tôi – cô',
        backward: 'tôi – quý khách',
        notes: 'Cặp phục vụ và khách; một "ạ" mỗi lượt. Chiều backward là nhân viên hội nói',
        confidence: 'low'
      },
      {
        relation: 'Thần, nữ thần ↔ người chuyển sinh',
        signals: '女神, 神',
        forward: 'ta – ngươi',
        backward: 'tôi – ngài',
        notes:
          'Mặc định trang nghiêm; nữ thần nói thân mật kiểu hài thì "tôi – cậu" chỉ khi cặp đã duyệt',
        confidence: 'low'
      }
    ]
  }
}
