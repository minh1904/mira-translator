import type { CultureData, PresetRow } from './types'

const NAM_NU_CHUA_XAC_NHAN: PresetRow = {
  relation: 'Nam ↔ nữ chưa xác nhận tình cảm',
  signals: '公子, 姑娘',
  forward: 'tại hạ – cô nương',
  backward: 'tiểu nữ – công tử',
  notes:
    'Chưa gọi "nàng" khi nói trực tiếp; quen thân thì "ta – cô nương/công tử". Chiều backward là nữ nói',
  confidence: 'high'
}

/** Văn hóa Trung. Fantasy không có dòng riêng (huyền huyễn rơi vào cultivation). */
export const ZH: CultureData = {
  label: 'Trung',
  rows: {
    modern: [
      {
        relation: 'Bạn đồng lứa, chưa thân',
        signals: '同学, 你, tên',
        forward: 'tớ – cậu',
        notes:
          'Cho học sinh, sinh viên. Nam chính kể "tôi" thì giữ "tôi – cậu". Người lớn: xem dòng đồng nghiệp, người lạ',
        confidence: 'medium'
      },
      {
        relation: 'Sếp ↔ nhân viên',
        signals: '陆总, 总裁, 老板, 您',
        forward: 'tôi – cậu/cô',
        backward: 'tôi – Lục tổng',
        notes:
          'Chiều backward là nhân viên nói; giữ chức danh kèm họ ("Lục tổng") nơi công sở, lúc riêng đổi theo mốc, không đổi sớm. 老板 với chủ quán → "ông chủ/bà chủ". Sếp gọi tên: "tôi – cậu/cô"',
        confidence: 'medium'
      },
      {
        relation: 'Người ngoài dùng danh từ thân tộc',
        signals: '叔叔, 阿姨, 大爷, 大妈, 小姐姐, 小哥哥, 师傅',
        forward: 'cháu – chú/cô/bác',
        notes:
          'Gọi theo tuổi người nghe (người ngang tuổi: "anh/chị"; thợ, tài xế: "bác tài", "anh thợ"). 大妈 có thể là xúc phạm; không ép thành họ hàng thật',
        confidence: 'medium'
      },
      {
        relation: 'Nhà chồng, nhà vợ',
        signals: '婆婆, 岳父, 妈, 爸',
        forward: 'con – bố/mẹ',
        notes:
          'Con dâu, con rể gọi bố mẹ chồng, vợ là "bố/mẹ" khi nói; nhắc đến người thứ ba: "mẹ chồng", "bố vợ". Giữ một cách cho cả truyện',
        confidence: 'low'
      }
    ],
    court: [
      {
        relation: 'Thái hậu → hoàng đế, hậu bối',
        signals: '哀家',
        forward: 'ai gia – hoàng đế',
        notes:
          'Thái hậu (mẹ vua) tự xưng 哀家 → "ai gia". Nói với phi tần, cung nữ: "ai gia – ngươi"',
        confidence: 'high'
      },
      {
        relation: 'Vương gia, hoàng tử → thuộc hạ, vợ',
        signals: '本王',
        forward: 'bổn vương – ngươi',
        backward: 'thần thiếp – vương gia',
        notes:
          'Nói với vợ: "bổn vương – nàng". Chiều backward là vợ nói; thuộc hạ nói: "thuộc hạ – vương gia"',
        confidence: 'medium'
      },
      {
        relation: 'Nô bộc → chủ trong nhà quan, thế gia',
        signals: '老爷, 夫人, 小姐, 少爷, 丫鬟',
        forward: 'nô tỳ – lão gia',
        backward: 'ta – ngươi',
        notes:
          'Phu nhân: "nô tỳ – phu nhân"; tiểu thư: "nô tỳ – tiểu thư"; thiếu gia: "nô tỳ – thiếu gia". Nha hoàn thân tiểu thư: "em – tiểu thư" chỉ khi thẻ nhân vật cho biết gắn bó. Chiều backward là chủ nói',
        confidence: 'medium'
      },
      {
        relation: 'Thái giám, hạ nhân nam → chủ',
        signals: '奴才, 主子',
        forward: 'nô tài – chủ tử',
        backward: 'ta – ngươi',
        notes:
          'Cung đình Thanh; có thể "nô tài – nương nương/vương gia". Cung nữ vẫn "nô tỳ". Chiều backward là chủ nói',
        confidence: 'low'
      },
      {
        relation: 'Phi tần cao → phi tần thấp',
        signals: '本宫, 嫔妾',
        forward: 'bổn cung – muội muội',
        backward: 'tần thiếp – tỷ tỷ',
        notes:
          'Phi tần thấp tự xưng "tần thiếp" hoặc "thần thiếp", chọn một cho cả truyện. "Tiểu chủ" là cách cung nhân gọi phi tần cấp thấp. Chiều backward là phi tần thấp nói',
        confidence: 'low'
      },
      {
        relation: 'Quan ngang hàng',
        signals: '在下, 大人',
        forward: 'tại hạ – đại nhân',
        notes:
          'Quan thấp hơn có thể "hạ quan – đại nhân". Không dùng "tại hạ" cho cặp thân: giọng giang hồ',
        confidence: 'medium'
      },
      NAM_NU_CHUA_XAC_NHAN
    ],
    cultivation: [
      {
        relation: 'Trưởng bối trong môn (sư thúc, sư bá, sư tổ)',
        signals: '师叔, 师伯, 师祖',
        forward: 'đệ tử – sư thúc',
        backward: 'ta – sư điệt',
        notes:
          'Sư thúc là em/sư đệ của sư phụ; sư bá là anh/sư huynh của sư phụ; sư tổ: "đệ tử – sư tổ". Chiều backward là trưởng bối nói',
        confidence: 'medium'
      },
      {
        relation: 'Chưởng môn, trưởng lão ↔ đệ tử',
        signals: '掌门, 长老, 老祖',
        forward: 'đệ tử – chưởng môn',
        backward: 'bổn tọa – ngươi',
        notes:
          'Chức danh giữ nguyên làm nhãn; trưởng lão: "đệ tử – trưởng lão". Chiều backward là chưởng môn nói; có thể "ta – ngươi"',
        confidence: 'medium'
      },
      {
        relation: 'Tu sĩ ngang hàng, gọi người nhỏ hơn',
        signals: '道友, 小友, 道兄',
        forward: 'tại hạ – đạo hữu',
        notes: 'Có thể "X mỗ – đạo hữu". Tiền bối gọi người trẻ: "tiểu hữu"',
        confidence: 'medium'
      },
      {
        relation: 'Cường giả tự cao, lão quái',
        signals: '本座, 本尊, 老夫',
        forward: 'bổn tọa – tiểu bối',
        notes:
          'Giữ Hán Việt; mỗi nhân vật một cách tự xưng cho cả truyện (bổn tôn, lão phu cùng loại)',
        confidence: 'medium'
      },
      {
        relation: 'Giang hồ: gọi người già, người trẻ, đại hiệp',
        signals: '大侠, 老前辈, 少侠',
        forward: 'tại hạ – đại hiệp',
        notes:
          'Người già: "lão tiền bối"; người trẻ: "thiếu hiệp"; nữ: "nữ hiệp", "cô nương". Vãn bối tự xưng "vãn bối"',
        confidence: 'medium'
      },
      NAM_NU_CHUA_XAC_NHAN
    ],
    game: [
      {
        relation: 'Tân thủ → cao thủ, tiền bối',
        signals: '大神, 大佬, 老大, 带带我',
        forward: 'em – đại thần',
        backward: 'anh – em',
        notes:
          'Giữ như danh hiệu gọi trực tiếp; nếu glossary truyện dùng thuần Việt thì "cao thủ". Chiều backward là cao thủ nói',
        confidence: 'low'
      },
      {
        relation: 'Hệ thống ↔ ký chủ',
        signals: '系统, 宿主',
        forward: 'tôi – hệ thống',
        backward: 'tôi – ký chủ',
        notes:
          'Chiều forward là ký chủ nói. Giọng hệ thống máy móc hoặc lém lỉnh, cố định cả truyện; có thể "bản hệ thống – ký chủ"',
        confidence: 'low'
      }
    ]
  },
  thirdPerson: {
    court: [
      'Nam chính: "hắn"; nhân vật thanh nhã, trầm tĩnh: "y"; nữ trẻ: "nàng"; "chàng" chỉ khi đoạn văn nhìn từ người yêu. Mỗi nhân vật một đại từ, không đổi qua lại.'
    ]
  }
}
