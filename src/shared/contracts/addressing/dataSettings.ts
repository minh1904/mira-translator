import type { PresetRow, SettingData, SettingId } from './types'

/**
 * Dòng chung của từng bối cảnh: chỉ những quan hệ mà các khảo sát ja/ko/zh/west đều xếp là chung.
 * Court và cultivation dùng chung vài dòng (cùng `relation`) để ghép bối cảnh phụ không bị lặp.
 */

const PHU_THE: PresetRow = {
  relation: 'Phu thê, người yêu đã xác nhận',
  signals: '夫君, 娘子, 부인, 서방님, 낭군, đã tỏ tình',
  forward: 'ta – nàng',
  backward: 'ta – chàng',
  notes:
    '"Thiếp" chỉ khi trang trọng hoặc trước người ngoài. Nhân vật xuyên không kể chuyện giữ "tôi"',
  confidence: 'high'
}

const KE_THU: PresetRow = {
  relation: 'Kẻ thù',
  signals: '貴様, 네놈, 老子, 小子',
  forward: 'ta – ngươi',
  notes: 'Thô: "lão tử – tên nhãi" chỉ khi bản gốc thô; đổi giữa cảnh khi bản gốc đổi',
  confidence: 'high'
}

const CHA_ME_CO_TRANG: PresetRow = {
  relation: 'Cha mẹ ↔ con cháu (cổ trang)',
  signals: '父上, 爹, 娘, 아버지, 어머니',
  forward: 'cha/mẹ – con',
  backward: 'con – cha/mẹ',
  notes: 'Hoàng tử, công chúa với vua, hoàng hậu: "nhi thần – phụ hoàng/mẫu hậu" khi nghi lễ',
  confidence: 'medium'
}

const ANH_EM_CO_TRANG: PresetRow = {
  relation: 'Anh chị em ruột (cổ trang)',
  signals: '哥, 姐, 형님, 누님, 오라버니',
  forward: 'đệ/muội – huynh/tỷ',
  backward: 'huynh/tỷ – đệ/muội',
  notes:
    'Hán Việt, trừ nhân vật xuyên không kể chuyện. 형님 có thể do nữ gọi chị dâu: cần giới tính người nói',
  confidence: 'high'
}

export const SETTINGS: Record<SettingId, SettingData> = {
  modern: {
    label: 'Hiện đại, đô thị',
    rows: [
      {
        relation: 'Bạn đồng lứa, chưa thân',
        signals: 'gọi tên hoặc họ, nói lịch sự hoặc trống',
        forward: 'tôi – cậu',
        notes:
          'Nếu truyện có cậu ruột của người kể thì chỉ người đó là "cậu" thân tộc, bạn đồng lứa gọi tên',
        confidence: 'high'
      },
      {
        relation: 'Người yêu đã xác nhận',
        signals: 'đã tỏ tình và gọi trống tên, 자기, 老公/老婆',
        forward: 'anh – em',
        backward: 'em – anh',
        notes:
          'Cần cả hai tín hiệu; chưa đủ thì giữ cặp bạn bè. Biệt danh như honey, 宝贝 chưa chứng minh quan hệ',
        confidence: 'high'
      },
      {
        relation: 'Vợ chồng',
        signals: 'あなた, 여보, 老公/老婆, husband/wife',
        forward: 'anh – em',
        backward: 'em – anh',
        notes:
          'Ngôi ba: "chồng tôi", "vợ tôi" (không dịch 旦那/主人 thành "ông chủ"). Thân mật kiểu đùa có thể "ông xã/bà xã"',
        confidence: 'medium'
      },
      {
        relation: 'Cha mẹ, ông bà ↔ con cháu',
        signals: 'お父さん, 아빠, 爸/妈, Mom/Dad',
        forward: 'bố/mẹ – con',
        backward: 'con – bố/mẹ',
        notes:
          'Ông bà: "ông/bà – cháu", cần nội hoặc ngoại khi truyện nêu. "Ba/má" chỉ khi thẻ nhân vật chọn giọng miền',
        confidence: 'high'
      },
      {
        relation: 'Anh chị em ruột',
        signals: 'お兄ちゃん, 姉さん, 형/누나, 哥/姐, bro, sis',
        forward: 'em – anh/chị',
        backward: 'anh/chị – em',
        notes:
          'Theo giới người nghe. Gọi "anh/chị" không chứng minh ruột thịt. Anh em trai cãi nhau thô: "tao – mày" chỉ khi cặp đã duyệt',
        confidence: 'high'
      },
      {
        relation: 'Thầy cô ↔ học trò',
        signals: '先生, 선생님, 老师, Professor, Mr/Ms + họ',
        forward: 'thầy/cô – em',
        backward: 'em – thầy/cô',
        notes:
          'Thầy cô xa cách hoặc gắt: "thầy/cô – cậu" chỉ khi cặp đã duyệt; giữ độ gắt bằng từ ngữ. 先生 cho bác sĩ, luật sư thì dịch theo nghề',
        confidence: 'high'
      },
      {
        relation: 'Đồng nghiệp ngang cấp, người lạ',
        signals: "あなた, 존댓말, 你/您, 苗字さん, sir/ma'am",
        forward: 'tôi – anh/chị',
        notes:
          'Theo tuổi và giới người nghe (có thể cô, cậu, chú, bác, ông, bà), kèm tên khi bản gốc gọi tên. Không dùng "bạn". Người phục vụ nói với khách: "tôi – quý khách"',
        confidence: 'high'
      },
      {
        relation: 'Sếp ↔ nhân viên',
        signals: '役職, 팀장님, 总, boss, 君',
        forward: 'tôi – cậu/cô',
        backward: 'tôi – anh/chị',
        notes:
          'Chiều forward là sếp nói. Cấp dưới dùng "tôi"; nếu bản gốc gọi chức danh thì gọi chức danh. Sếp gọi tên thì không ép "sếp"',
        confidence: 'medium'
      },
      {
        relation: 'Hậu bối → tiền bối',
        signals: '先輩, 선배, 学长/学姐, senior',
        forward: 'em – anh/chị',
        backward: 'anh/chị – em',
        notes:
          'Chính sách hậu tố của tác phẩm quyết định giữ "senpai/sunbae" hay dịch. 後輩 không phải cách gọi. 学长 không ngụ ý yêu',
        confidence: 'medium'
      },
      {
        relation: 'Họ hàng bậc trên ↔ cháu',
        signals: 'おじさん/おばさん, 叔叔, 阿姨, 舅舅, 姑姑, uncle, aunt',
        forward: 'cháu – chú/bác/cậu/dì/cô',
        backward: 'chú/bác/cậu/dì/cô – cháu',
        notes:
          'Tiếng Việt phân bên nội, ngoại và bậc; điều kiện: thẻ nhân vật cho biết quan hệ họ hàng. Thiếu dữ kiện thì gọi tên kèm "chú/cô" theo giới và chờ duyệt',
        confidence: 'medium'
      },
      {
        relation: 'Kẻ thù, đối đầu',
        signals: 'てめぇ, 네놈, 你 lạnh, you khinh',
        forward: 'tôi – anh/cô',
        notes:
          'Thể hiện độ gắt bằng từ ngữ, không tự đổi sang "mày" khi nhân vật giận. 貴様 không tự thành "ngươi" ở hiện đại',
        confidence: 'medium'
      }
    ],
    thirdPerson: [
      'Lời kể ngôi một dịch là "tôi".',
      'Nam: anh ấy, cậu ấy hoặc gọi tên; nữ: cô ấy hoặc gọi tên. Không dùng "nàng", "hắn ta" kiểu cổ văn cho truyện hiện đại.',
      'Phản diện hoặc người kể khinh: gã, hắn, cô ta; người lớn tuổi: ông ấy, bà ấy; trẻ con: nó, thằng bé, con bé.'
    ]
  },
  fantasy: {
    label: 'Fantasy, quý tộc, isekai',
    rows: [
      {
        relation: 'Hầu gái, quản gia → chủ',
        signals: 'お嬢様, 坊ちゃま, 아가씨, 도련님, my lady, milady, master',
        forward: 'tôi – tiểu thư',
        backward: 'tôi – chị',
        notes:
          'Chủ là nam: "tôi – thiếu gia". Chiều backward là chủ nói; chủ lớn tuổi hơn hẳn thì "tôi – cô". "Em" chỉ khi thẻ nhân vật cho biết người hầu là thiếu nữ nhỏ tuổi gắn bó với chủ ("em – tiểu thư"). Không dùng "nô tỳ". Kèm "ạ" tối đa một lần mỗi lượt thoại',
        confidence: 'high'
      },
      {
        relation: 'Vua, hoàng tử → người dưới, nghi lễ',
        signals: '余, 我, そなた, 짐, We/thou',
        forward: 'ta – ngươi',
        notes: 'Chỉ tầng nghi lễ: phong tước, tuyên bố hoàng gia; thường ngày xem dòng hoàng tộc',
        confidence: 'high'
      },
      {
        relation: 'Thần dân, quý tộc → hoàng tộc',
        signals: '殿下, 陛下, 전하, 폐하, Your Majesty, Your Highness',
        forward: 'tôi – ngài',
        backward: 'tôi – cậu/cô',
        notes:
          'Kèm "thưa Điện hạ/Bệ hạ" (殿下/전하/Highness: điện hạ; 陛下/폐하/Majesty: bệ hạ). Không dùng "thần"; chỉ cận vệ, quan lại trực thuộc mới xưng "thần". Chiều backward là hoàng tộc nói thường ngày',
        confidence: 'high'
      },
      {
        relation: 'Quý tộc ngang hàng, lịch sự',
        signals: '～様, 각하, Lord/Lady + tên',
        forward: 'tôi – ngài',
        notes:
          'Nam gọi nữ: "tiểu thư/phu nhân"; hai bạn gái thân thì "mình – cậu". Hậu tố -sama phần lớn là màu giai cấp, không ghép lai',
        confidence: 'medium'
      },
      {
        relation: 'Hôn phu ↔ hôn thê, chưa yêu',
        signals: '婚約者, 약혼자, betrothed, tên',
        forward: 'tôi – cô',
        backward: 'tôi – ngài',
        notes:
          'Chọn một cặp và khóa tới mốc truyện, không trộn "anh … nàng" trong một câu. Không dùng "ta – nàng" (trái luật "ta" chỉ nghi lễ, phản diện). Chiều backward là hôn thê nói',
        confidence: 'medium'
      },
      {
        relation: 'Người yêu, hôn phu hôn thê đã yêu',
        signals: 'đã tỏ tình, gọi trống tên, my love',
        forward: 'anh – em',
        backward: 'em – anh',
        notes:
          'Mốc đổi do truyện, không đổi sớm hơn nguyên tác. Giọng thô thể hiện bằng từ ngữ, không đổi cặp',
        confidence: 'high'
      },
      {
        relation: 'Cha mẹ quý tộc ↔ con',
        signals: '父上, お父様, 아버지, Father, Lord Father',
        forward: 'cha/mẹ – con',
        backward: 'con – cha/mẹ',
        notes: 'Không dùng "ta" cho cha mẹ với con, trừ cha nghiêm khắc có chủ ý',
        confidence: 'high'
      },
      {
        relation: 'Anh chị em quý tộc',
        signals: 'お兄様, 오라버니, 언니',
        forward: 'em – anh/chị',
        backward: 'anh/chị – em',
        notes:
          'Giữ "Onii-sama" hay dịch theo chính sách hậu tố; 오라버니 là dạng cổ của 오빠, vẫn đặt "anh"',
        confidence: 'medium'
      },
      {
        relation: 'Hiệp sĩ, cận vệ → chủ',
        signals: '殿下, お嬢様, 기사, 경호',
        forward: 'tôi – điện hạ',
        backward: 'tôi – tên',
        notes:
          'Chủ là tiểu thư: "tôi – tiểu thư". Chỉ cận vệ trực thuộc có thể xưng "thần" (ngoại lệ đã chốt). Chiều backward là chủ nói',
        confidence: 'medium'
      },
      {
        relation: 'Giáo viên học viện ↔ học sinh',
        signals: '先生, 선생님, Professor, Headmaster',
        forward: 'thầy/cô – em',
        backward: 'em – thầy/cô',
        notes: 'Chỉ khi truyện có học viện; cùng cặp với thầy cô hiện đại',
        confidence: 'high'
      },
      {
        relation: 'Phản diện, kẻ thù',
        signals: '貴様, 네놈, thou, villain monologue',
        forward: 'ta – ngươi',
        notes:
          'Bề trên giận cấp dưới: "ngươi", giọng gằn. Côn đồ, dân thường: "tao – mày" chỉ khi cặp đã duyệt',
        confidence: 'medium'
      }
    ],
    thirdPerson: [
      'Lời kể ngôi một dịch là "tôi"; nội tâm người chuyển sinh, hồi quy giữ giọng hiện đại, lệch với thoại quý tộc là chất hài của thể loại.',
      'Nhân vật chính: anh ấy, cô ấy hoặc gọi tên; công chúa, tiểu thư có thể là "nàng" nếu giọng kể trang trọng.',
      'Phản diện: hắn, gã, lão; người già: ông lão, bà lão.'
    ]
  },
  court: {
    label: 'Cung đình, cổ trang',
    rows: [
      {
        relation: 'Quan lại → vua, hoàng tộc',
        signals: '陛下, 殿下, 微臣, 신, 전하',
        forward: 'thần – bệ hạ',
        backward: 'trẫm – khanh',
        notes:
          'Chỉ ở bối cảnh Á Đông. 朕 → trẫm, 我 → ta khi riêng tư. Hoàng tử, vương gia: "điện hạ"; hậu phi: "nương nương"',
        confidence: 'high'
      },
      {
        relation: 'Phi tần → vua',
        signals: '臣妾, 陛下, 신첩',
        forward: 'thần thiếp – bệ hạ',
        backward: 'trẫm – ái phi',
        notes: '臣妾 và 신첩 là "thần thiếp", không "nô tỳ". Riêng tư vua gọi "ta – nàng"',
        confidence: 'high'
      },
      {
        relation: 'Cung nữ, nô tỳ → chủ',
        signals: '奴婢, 娘娘, 마마, 主子',
        forward: 'nô tỳ – nương nương',
        backward: 'bổn cung – ngươi',
        notes:
          'Khác fantasy: ở đây "nô tỳ" được dùng. Chiều backward là phi tần nói (本宮 → bổn cung); chủ khác: "ta – ngươi"',
        confidence: 'medium'
      },
      PHU_THE,
      CHA_ME_CO_TRANG,
      ANH_EM_CO_TRANG,
      KE_THU
    ],
    thirdPerson: [
      'Vua, hoàng tộc khi người kể kính trọng: người, ngài; nữ trẻ: nàng hoặc cô (giữ một cách); người kể khinh: hắn, gã, ả.',
      'Lời kể ngôi một của nhân vật xuyên không giữ "tôi", dù thoại với người bản địa theo bảng cổ trang.'
    ]
  },
  cultivation: {
    label: 'Tiên hiệp, kiếm hiệp',
    rows: [
      {
        relation: 'Sư phụ → đồ đệ',
        signals: '师父, 师尊, 为师, 徒儿',
        forward: 'ta – đồ nhi',
        backward: 'đệ tử – sư phụ',
        notes:
          '"Vi sư", "ngươi", tên + "nhi" cùng dùng được; không dùng "con". Sư tôn trang trọng hơn sư phụ. Đồ đệ cũng xưng "đồ nhi"',
        confidence: 'high'
      },
      {
        relation: 'Đồng môn',
        signals: '师兄, 师姐, 师弟, 师妹',
        forward: 'đệ/muội – sư huynh/sư tỷ',
        backward: 'huynh/tỷ – sư đệ/sư muội',
        notes: 'Theo thứ tự nhập môn, không theo tuổi',
        confidence: 'high'
      },
      {
        relation: 'Vãn bối → tiền bối',
        signals: '晚辈, 前辈, 老夫',
        forward: 'vãn bối – tiền bối',
        backward: 'ta – ngươi',
        notes:
          'Xét theo cảnh giới, không theo tuổi; khác môn vẫn dùng. Chiều backward là tiền bối nói; cường giả lớn tuổi có thể "lão phu", gọi "tiểu tử"',
        confidence: 'high'
      },
      {
        relation: 'Người giang hồ ngang hàng, mới gặp',
        signals: '在下, 阁下, 兄台',
        forward: 'tại hạ – các hạ',
        notes: 'Có thể "huynh đài". Đã quen: "X mỗ – X huynh", "tiểu đệ"; trung tính ≈ "tôi – anh"',
        confidence: 'high'
      },
      PHU_THE,
      CHA_ME_CO_TRANG,
      ANH_EM_CO_TRANG,
      KE_THU
    ],
    thirdPerson: [
      'Nam chính: "hắn"; nhân vật thanh nhã, trầm tĩnh: "y"; nữ trẻ: "nàng"; "chàng" chỉ khi đoạn văn nhìn từ người yêu. Mỗi nhân vật một đại từ, không đổi qua lại.',
      'Phản diện: hắn, gã, y; người già: lão, ông ta; bậc tôn quý khi người kể kính trọng: người, ngài; phụ nữ bị ghét: ả, nàng ta.'
    ]
  },
  game: {
    label: 'Game, hệ thống, tận thế',
    rows: [
      {
        relation: 'Đồng đội, mới gặp',
        signals: 'tên nhân vật, ID, party',
        forward: 'tôi – cậu',
        notes:
          'Người lớn hơn rõ rệt: "tôi – anh/chị". Gọi tên nhân vật hoặc ID nếu bản gốc gọi vậy. Thô chỉ khi cặp đã duyệt',
        confidence: 'medium'
      },
      {
        relation: 'Thủ lĩnh (hội trưởng, đội trưởng, chỉ huy) ↔ thành viên',
        signals: '会长, 団長, 길드장님, 팀장님, Guildmaster, Commander',
        forward: 'tôi – hội trưởng',
        backward: 'tôi – cậu',
        notes:
          'Chức danh game dịch thuần Việt, không ghép lai; thay bằng chức danh thực ("đội trưởng", "chỉ huy"). Bản gốc gọi tên thì gọi tên. Chiều backward là thủ lĩnh nói',
        confidence: 'medium'
      },
      {
        relation: 'Tân thủ → cao thủ, tiền bối',
        signals: '先輩, 선배, newbie, vet',
        forward: 'em – anh/chị',
        backward: 'anh/chị – em',
        notes: 'Theo tuổi, không theo cấp độ hay rank, trừ khi bản gốc đề cao cấp',
        confidence: 'medium'
      },
      {
        relation: 'Boss, quái thông minh, ma vương → người chơi',
        signals: '貴様, 我, 네놈, mortal, demon lord',
        forward: 'ta – ngươi',
        notes:
          'Ngoại lệ có chủ ý. Trò chơi hài (boss thân thiện) không áp. Người chơi đáp lại theo cặp với kẻ thù, giữ độ gắt bằng từ ngữ',
        confidence: 'medium'
      },
      {
        relation: 'Đối thủ, kẻ thù người chơi',
        signals: '네놈, rival, 你 khinh',
        forward: 'tôi – anh',
        notes: 'Giữ độ gắt bằng từ ngữ, không tự sang "mày". Game cổ phong: "ta – ngươi"',
        confidence: 'medium'
      },
      {
        relation: 'Người lạ, NPC, người sống sót mới gặp',
        signals: 'NPC, stranger, 아저씨, 基地',
        forward: 'tôi – anh/chị',
        notes:
          'Theo tuổi người nghe (ông, bà, chú, cô, bác); không dùng "bạn". Thủ lĩnh căn cứ gọi bằng chức danh. Hoàn cảnh khẩn cấp: lời ngắn, không hạ xuống "tao – mày" nếu chưa thô',
        confidence: 'medium'
      },
      {
        relation: 'Người yêu đã xác nhận',
        signals: 'đã tỏ tình, 老公/老婆 trong game',
        forward: 'anh – em',
        backward: 'em – anh',
        notes: 'Vợ/chồng trong game có thể chỉ là trò chơi: chờ mốc xác nhận',
        confidence: 'medium'
      },
      {
        relation: 'Nô lệ, thú khế ước → chủ',
        signals: 'ご主人様, 奴隷, 契約, familiar, master',
        forward: 'tôi – chủ nhân',
        backward: 'tôi – cô',
        notes:
          'ご主人様 dịch "chủ nhân", không "ông chủ". Chiều backward là chủ nói; chủ là nam nói với nô lệ nam: "tôi – cậu". "Em" chỉ khi thẻ nhân vật cho biết người này là thiếu nữ nhỏ tuổi gắn bó với chủ. Con vật nhỏ: "nó"',
        confidence: 'low'
      }
    ],
    thirdPerson: [
      'Cửa sổ hệ thống, thông báo ([ ], 【 】): giữ khung và con số, văn trung tính, không đại từ, không dùng "bạn"; "Player/Host" → "người chơi".',
      'Nhân vật chính: anh ấy, cô ấy hoặc gọi tên; boss, quái: hắn, nó, lão. Giữ một cách gọi cho mỗi nhân vật.',
      'Lời kể ngôi một dịch là "tôi".'
    ]
  }
}
