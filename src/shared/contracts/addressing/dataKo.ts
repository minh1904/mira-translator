import type { CultureData } from './types'

/** Văn hóa Hàn. Cultivation không có dòng (Hàn gần như không có thể loại này). */
export const KO: CultureData = {
  label: 'Hàn',
  rows: {
    modern: [
      {
        relation: 'Em → anh/chị thân hơn tuổi',
        signals: '오빠, 형, 누나, 언니 ± tên',
        forward: 'em – anh/chị',
        backward: 'anh/chị – em',
        notes:
          'Mặc định dịch theo vai (quyết định 2026-10-23); chính sách giữ hậu tố thì giữ "oppa/hyung". 오빠 chỉ nữ nói, 형 chỉ nam nói: là tín hiệu giới người nói. "Tên + oppa" → "anh + tên". Không dùng với người lạ',
        confidence: 'high'
      },
      {
        relation: 'Chủ tịch, gia đình chaebol',
        signals: '회장님, 도련님, 사모님',
        forward: 'tôi – chủ tịch',
        backward: 'tôi – cậu/cô',
        notes:
          'Nhân viên giữ danh xưng với 회장님. Chiều backward là con cháu chủ tịch nói: 도련님 là cậu chủ khi người hầu, nhân viên gọi con trai chủ. -ssi Việt hóa: "anh/chị + tên"',
        confidence: 'low'
      },
      {
        relation: 'Sếp ↔ nhân viên',
        signals: '팀장님, 과장님, 부장님, 씨, 존댓말',
        forward: 'tôi – cậu/cô',
        backward: 'tôi – anh/chị',
        notes:
          'Chiều forward là sếp nói, gọi "cậu/cô + tên" cho 이름 + 씨; sếp lạnh: "tôi – anh/chị". Cấp dưới gọi chức danh thay đại từ (팀장님 → "trưởng nhóm"), không giữ -nim; cấp dưới dùng "tôi"',
        confidence: 'medium'
      },
      {
        relation: 'Hậu bối → tiền bối',
        signals: '선배, 선배님 ± tên, công ty hoặc trường',
        forward: 'em – anh/chị',
        backward: 'anh/chị – em',
        notes:
          'Khi gọi trống không kèm tên: "tiền bối" (quyết định 2026-10-23). Tiền bối biết rõ lớn tuổi hơn thì "anh/chị + tên". 선배 tính theo thâm niên; chính sách giữ hậu tố thì giữ "sunbae"',
        confidence: 'high'
      }
    ],
    fantasy: [
      {
        relation: 'Hoàng đế → bề tôi (짐)',
        signals: '짐, 경, 폐하',
        forward: 'trẫm – khanh',
        backward: 'tôi – bệ hạ',
        notes:
          'Dùng "trẫm" chỉ khi bản gốc là 짐; hoàng đế dùng 나 thì "ta". Khác ja/west vì tiếng Hàn có 짐. Không dùng "thần" (luật fantasy); chiều backward là bề tôi nói',
        confidence: 'medium'
      }
    ],
    court: [
      {
        relation: 'Quan lại → vua, hoàng tộc',
        signals: '신, 소신, 전하',
        forward: 'thần – điện hạ',
        backward: 'ta – khanh',
        notes:
          'Vua Joseon là 전하 → "điện hạ", tự xưng 과인 → "ta" ("quả nhân" chỉ khi diễn văn trang trọng), không dùng "trẫm" cho vua Joseon. Chiều backward là vua nói',
        confidence: 'high'
      },
      {
        relation: 'Phi tần → vua',
        signals: '신첩, 전하',
        forward: 'thần thiếp – điện hạ',
        backward: 'ta – nàng',
        notes: '신첩 = "thần thiếp"; vua Joseon là "điện hạ". Chiều backward là vua nói',
        confidence: 'high'
      },
      {
        relation: 'Cung nữ, nô tỳ → chủ',
        signals: '소인, 마마',
        forward: 'nô tỳ – nương nương',
        backward: 'ta – ngươi',
        notes: '마마 → "nương nương" cho nữ hoàng tộc. Sageuk không dùng "bổn cung"',
        confidence: 'medium'
      },
      {
        relation: 'Hoàng đế (Đại Hàn Đế quốc, Goryeo đầu)',
        signals: '짐, 폐하',
        forward: 'trẫm – khanh',
        backward: 'thần – bệ hạ',
        notes:
          'Chỉ Đại Hàn Đế quốc hoặc Goryeo đầu; đừng đặt "bệ hạ" mặc định cho mọi vua Hàn. Chiều backward là bề tôi nói',
        confidence: 'medium'
      },
      {
        relation: 'Bề tôi → thế tử',
        signals: '저하',
        forward: 'thần – điện hạ',
        notes: '저하 chuyên cho thế tử: "thế tử điện hạ" lần đầu, sau đó "điện hạ"',
        confidence: 'medium'
      },
      {
        relation: 'Người dưới → quan (나리, 대감)',
        signals: '소인 + 나리, 대감',
        forward: 'tiểu nhân – đại nhân',
        notes:
          'Cho nam; chưa có đối ứng nữ đã kiểm (쇤네). 나리 cho quan dưới hàng đại giám, 대감 là bậc cao hơn',
        confidence: 'low'
      },
      {
        relation: 'Người hầu → chủ nhà (마님, 도련님, 아가씨)',
        signals: '마님, 도련님, 아가씨',
        forward: 'tiểu nhân – phu nhân',
        notes: 'Vợ chủ → phu nhân, con trai → cậu chủ, con gái → cô chủ/tiểu thư',
        confidence: 'low'
      }
    ]
  }
}
