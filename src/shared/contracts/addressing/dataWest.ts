import type { CultureData } from './types'

/**
 * Văn hóa Phương Tây. Không có dòng cho court (thần – bệ hạ là cung đình Á Đông), cultivation và game.
 * Không dùng "thần", "khanh", "trẫm", "nô tỳ" ở bất kỳ đâu.
 */
export const WEST: CultureData = {
  label: 'Phương Tây',
  rows: {
    modern: [
      {
        relation: 'Bạn đồng lứa, thân',
        signals: 'tên riêng, dude, mate, bro',
        forward: 'tớ – cậu',
        notes:
          'Tuổi teen đến khoảng 25. Nam chính nói "tôi" ngoài lời thoại thì giữ "tôi – cậu"; không dùng "mình – bồ" làm mặc định. "Bro" không tự thành "anh em"',
        confidence: 'medium'
      },
      {
        relation: 'Quý tộc hiện đại Anh',
        signals: 'Lord X, Lady X, Sir + tên riêng, Your Grace',
        forward: 'tôi – ngài',
        notes:
          'Sir đi với tên riêng ("ngài John"); Lord theo tước hiệu ("ngài + tước"); Duke/Your Grace → "công tước" hoặc "ngài"',
        confidence: 'medium'
      }
    ],
    fantasy: [
      {
        relation: 'Hầu gái, quản gia → chủ',
        signals: 'my lord, my lady, milady, master, mistress',
        forward: 'tôi – ngài',
        backward: 'tôi – cô',
        notes:
          '"My lady/milady" → "tiểu thư" hoặc "phu nhân"; "master" → "chủ nhân" hoặc "thiếu gia". Chiều backward là chủ nói; quản gia lớn tuổi: "tôi – ông". "Em – tiểu thư" chỉ khi thẻ nhân vật cho biết người hầu là thiếu nữ nhỏ tuổi gắn bó. Không "nô tỳ"',
        confidence: 'medium'
      },
      {
        relation: 'Thần dân, quý tộc → hoàng tộc',
        signals: 'Your Majesty, Your Highness, sire',
        forward: 'tôi – bệ hạ',
        backward: 'tôi – cậu/cô',
        notes:
          '"Your Majesty" → "bệ hạ" (vua, hoàng hậu); "Your Highness" → "điện hạ" (hoàng tử, công chúa), kèm "thưa". Không dùng "thần" hay "khanh". Chiều backward là hoàng tộc nói thường ngày',
        confidence: 'high'
      },
      {
        relation: 'Quý tộc ngang hàng, lịch sự',
        signals: 'Lord X, Lady X, tên + tước',
        forward: 'tôi – ngài',
        notes:
          'Lord theo tước hiệu, Sir đi với tên riêng. Nam gọi nữ: "tiểu thư/phu nhân". Chưa quen không dùng "cậu"',
        confidence: 'medium'
      },
      {
        relation: 'Công tước, quý tộc cao gọi nhau',
        signals: 'Your Grace, My Lord Duke',
        forward: 'tôi – ngài',
        notes:
          '"Your Grace" → "công tước" (kèm "thưa") hoặc "ngài", không dịch "Ân điển". Vợ công tước: "công tước phu nhân"; nữ tự mang tước: "nữ công tước"',
        confidence: 'medium'
      },
      {
        relation: 'Hiệp sĩ gọi theo Sir/Ser',
        signals: 'Sir + tên riêng, Ser X',
        forward: 'tôi – ngài',
        notes:
          '"Sir Lancelot" → "ngài Lancelot" hoặc "hiệp sĩ Lancelot", không Sir + họ. "Ser" trong A Song of Ice and Fire là tước hiệu riêng của thế giới, có thể giữ nguyên',
        confidence: 'medium'
      },
      {
        relation: 'Giáo sĩ, tu sĩ, thánh nữ',
        signals: 'Father, High Septon, Sister, Your Holiness',
        forward: 'con – cha',
        backward: 'cha – con',
        notes:
          'Giáo hội phương Tây: giáo dân tự xưng "con"; "Your Holiness" → "đức thánh cha" hoặc "thánh thượng" theo thế giới truyện. Nữ tu: "con – sơ". Cặp riêng của thế giới, nên chờ duyệt',
        confidence: 'low'
      }
    ]
  }
}
