# Văn phong bản dịch tiểu thuyết: nghiên cứu theo ngôn ngữ nguồn

Cập nhật: 2026-10-14 · Trạng thái: **quan sát và đề xuất**, chưa đo bằng Lab. Nguồn: năm đợt nghiên cứu song
song ngày 2026-10-14 (chung, Nhật, Trung, Hàn, Anh), đọc web và đối chiếu mã.

**Quyết định của chủ sản phẩm cùng ngày:** không còn luật cứng theo bối cảnh và không còn luật riêng cho
"mày – tao" (bản chốt trung gian "vai dưới không tự dùng với vai trên" đã bỏ, prompt `translate-v8`); văn
phong linh hoạt, sát nguyên tác; các điểm theo ngôn ngữ viết thành gợi ý linh hoạt; dấu ba chấm "...";
hạn chế gạch dài vì tiếng Việt không dùng.

**Đã triển khai ngày 2026-10-14** (prompt `translate-v7`, `polish-v3`): hai lỗi ở mục 2, năm dòng luật chung ở
mục 5, gợi ý theo ngôn ngữ ở mục 5, không tự đoán bộ học đường cho truyện Nhật. Chưa làm: dữ liệu theo tác
phẩm (giọng nhân vật, chính sách kính ngữ Hàn, mức Hán Việt) và các cờ kiểm văn dịch sau dịch — lát
`add-translation-task-qa` (đã triển khai 2026-10-14) mới có tám luật cơ bản, cờ văn dịch là change sau; xem [hệ thống prompt](prompt-system.md).

## 1. Kết luận chính

- **Câu chỉ dẫn văn phong trong prompt gần như không có tác dụng ở lượt dịch.** Prompt đòi "trôi chảy, hợp
  phong cách" chỉ đổi tỉ lệ văn dịch của GPT-4 từ 0,50 lên 0,53. Một lượt tự trau chuốt có neo bản gốc thì
  giảm văn dịch từ 43% xuống 25% ([arXiv 2503.04369](https://arxiv.org/html/2503.04369v1)). Prompt "hãy sáng
  tạo" chỉ nhích nhẹ và có model thêm thắt ([alphaxiv 2604.18169](https://www.alphaxiv.org/abs/2604.18169.md)).
  Kết quả B2a của Lab cùng chiều. Hệ quả: giá trị nằm ở dữ liệu tác phẩm và **một** lượt trau chuốt, không ở
  luật dài.
- **Một lượt sửa là đủ.** Một lượt "dịch lại/tự sửa" thắng quy trình bốn bước, vòng thêm lợi ít
  ([arXiv 2506.04521](https://arxiv.org/html/2506.04521v2)). Nhiều vòng làm trôi nghĩa và sót nội dung
  ([TransAgents, arXiv 2405.11804](https://arxiv.org/html/2405.11804v1)).
- **Thước đo:** COMET/BLEU và judge LLM cùng họ không phân biệt được bản dịch văn học tốt. So cặp mù (BWS)
  nhận ra bản người 80–100%; metric tự động khoảng 20% ([arXiv 2410.18697](https://arxiv.org/html/2410.18697v2)).
- **Khôi phục chủ ngữ bị lược là điểm yếu nhất của LLM** khi dịch truyện mạng
  ([DITING, arXiv 2510.09116](https://arxiv.org/html/2510.09116v2)). Ở Mira, việc này dựa vào thẻ nhân vật và
  cặp xưng hô, không dựa vào luật.

## 2. Lỗi đã kiểm trong mã

| Lỗi | Chỗ | Hệ quả |
| --- | --- | --- |
| Chỉ coi là lời thoại khi `src` mở đầu bằng 「, 『 hoặc “ | `translatePrompt.ts` (`<output>`), `polish.ts` (`voice`) | Truyện Hàn và Anh dùng ngoặc thẳng `"`, hoặc đặt lời thoại sau lời kể trong cùng đoạn, nên không được khai người nói, cách tự xưng và cách gọi |
| `CJK_CHARS_RE` không có dải Hangul | `src/shared/translation/translationChecks.ts` | Chữ Hàn sót trong bản dịch không bị cờ |

Hai agent khác cũng báo: `addressingAnalysis` dùng bộ đại từ tiếng Trung cho tiếng Hàn; câu giải thích "ngôi hai"
trong `addressingLines` chỉ có ví dụ Nhật/Trung. Hai điểm này chưa kiểm lại.

## 3. Lỗi văn dịch chung và khả năng đo

Không tìm được nguồn tiếng Việt định lượng về "văn dịch"; danh sách hư từ là giả thuyết.

| Dấu hiệu | Ví dụ | Đo bằng code | Báo nhầm |
| --- | --- | --- | --- |
| Lặp tên/đại từ ngôi ba ở câu liền nhau | "Misaki cười. Misaki nhìn tôi." | đếm tên trong `<characters>` và hắn/nó/anh ta/cô ta | cao: phép lặp là liên kết bình thường của tiếng Việt |
| Đại từ sở hữu, chuỗi "của" | "đặt túi của cô ấy lên bàn của cô ấy" | "của … của", mật độ | trung bình |
| Bị động dịch sát | "được mở bởi một lính gác" | "bởi", "được/bị" | cao ("bị thương") |
| "một cách" + tính từ | "nói một cách nhẹ nhàng" | danh sách | thấp |
| Từ chỉ thời thừa | "đã rời đi khi cô ấy đã đến" | nhiều "đã" trong câu | trung bình |
| Calque Trung (văn convert) | "đem cửa mở ra", "hướng nàng đi tới", "có phải… hay không", "vài phần" | danh sách hẹp | thấp |
| Hán Việt "bạn giả" từ tiếng Nhật | 緊張 → "khẩn trương", 勉強 → "miễn cưỡng" | danh sách | thấp |
| Từ vựng nghèo, câu đơn điệu | — | MTLD theo chương, biến thiên độ dài câu | thấp khi so giữa biến thể |

`checkRepetitions` hiện chỉ bắt vòng lặp suy biến (4-gram lặp 4 lần), chưa đo lặp văn phong. Mọi chỉ số ở đây
chỉ nên là **cờ** cho người duyệt hoặc đầu vào của lượt trau chuốt, không tự sửa, không chặn lưu; precision của
từng cờ phải đo trên đoạn người đã chấm trước khi hiện cho người dùng.

## 4. Theo ngôn ngữ nguồn

### Nhật

- Đại từ ngôi một (僕/俺/私/わたくし) mang bản sắc và giọng, không chỉ mức lịch sự
  ([Tofugu](https://www.tofugu.com/japanese-grammar/first-person-pronouns/)). Tiếng Việt gom về "tôi" nên
  phần khác biệt phải chuyển vào cách chọn từ và tiểu từ.
- Đuôi câu đặc trưng (～のじゃ, ～ですわ, ～っす) là "role language"; bản dịch hay làm phẳng làm nhân vật mất
  nét riêng ([Yakuwarigo](https://en.wikipedia.org/wiki/Yakuwarigo)). Đề xuất: thêm mục "giọng" vào thẻ nhân vật
  (dữ liệu theo tác phẩm, người dịch duyệt).
- Kính ngữ: J-Novel Club không có chính sách chung, mỗi bộ do dịch giả chọn
  ([JNC](https://forums.j-novel.club/post/7704)); Mira đã có `HonorificPolicy`.
- Độc giả docln chê dùng "nó" dày đặc là sượng ([docln](https://docln.net/thao-luan/2316-ve-no)).
- Tượng thanh: có từ tương đương thì dùng (ドキドキ → thình thịch), không phiên âm romaji.
- Đếm trên bản xuất Lab cũ (prompt v2/v5): n4696dd trộn "……"/"..."/"…" và còn sót "――"; n5955en người kể gọi
  nữ chính "cô ta" 44 lần xen "cô ấy".

### Trung

- "Văn convert" (Vietphrase giữ trật tự câu, thay âm Hán Việt) là lời chê chính. Thực hành edit: tên, danh
  xưng, thuật ngữ thế giới giữ Hán Việt; lời kể dùng từ thông dụng (trầm mặc → im lặng, nguyên lai → hóa ra)
  ([finanthony](https://finanthony.wordpress.com/tong-hop/mot-so-dieu-can-luu-y-khi-transedit-truyen/)).
- Thành ngữ: tương đương tiếng Việt → Hán Việt đã quen → dịch nghĩa
  ([Wikipedia](https://vi.wikipedia.org/wiki/Th%C3%A0nh_ng%E1%BB%AF_g%E1%BB%91c_H%C3%A1n_trong_ti%E1%BA%BFng_Vi%E1%BB%87t)).
- 咱们 luôn gồm người nghe ("chúng ta"); 我们 có thể không gồm ("chúng tôi/bọn ta"). Đây là lỗi nghĩa.
- Tự xưng theo thân phận (本座, 本王, 本宫, 老夫, 贫道, 在下, 朕) giữ dạng Hán Việt; chỉ 我/你 trơn mới chọn theo
  quan hệ.
- Model chuyên dụng HachimiMT chuẩn hóa ta/ngươi/hắn/nàng, giảm đổi đại từ ngôi hai giữa các dòng thoại từ
  khoảng 24% xuống 0%, nhưng làm truyện hiện đại ra giọng cổ
  ([HuggingFace](https://huggingface.co/ngocdang83/HachimiMT-60-QT)).

### Hàn

- Lịch sự nằm ở đuôi câu (-요, -습니다); tiếng Việt thể hiện bằng tiểu từ (ạ, dạ, thưa) và lời lẽ. Đuôi lịch sự
  không tự đổi thành một cặp đại từ khác ([Phạm Thị Ngọc 2017](https://journals.hanu.edu.vn/tckhnn/article/download/537/440/815)).
- Cùng một chữ 너 trong hai bản dịch "Người ăn chay" ra con/em/cậu/mày tùy quan hệ
  ([Đỗ Thúy Hằng 2026](https://jfs.ulis.vnu.edu.vn/index.php/fs/article/download/5768/4713/16584)): 너 không
  quyết định "mày".
- Chuyển 존댓말 → 반말 ("말 놓다") là một mốc quan hệ; đổi cặp đúng tại mốc đó
  ([elon.io](https://elon.io/grammar/korean/honorifics/malnota-transition)).
- Profile `korean()` hiện ghi "dùng âm Hán Hàn phổ biến" cho tên, dễ ra Hán Việt ("Kim Độc Giả"); bài tiếng
  Việt viết Latinh ("Sung Jin-woo").
- Cửa sổ hệ thống `[ ]`: giữ khung và số, văn trung tính.

### Anh

- Một nghiên cứu phân tích 75 cặp I – you của *Harry Potter and the Philosopher's Stone* và bản dịch tiếng Việt
  (2016), kết luận dịch giả chọn tương đương từ "hệ thống xưng hô đa dạng" của tiếng Việt
  ([VNU JFS](https://js.vnu.edu.vn/FS/article/view/4390), chỉ đọc được phần tóm tắt). Hai chi tiết từng ghi ở đây,
  "hơn 50 cách xưng gọi" và Draco xưng "tao – mày" với bạn cùng lứa, **không có trong phần tóm tắt và chưa xác
  minh được** (kiểm 2026-10-24); cần đọc bản PDF đầy đủ trước khi dùng làm căn cứ. Với quyết định 2026-10-14,
  kiểu "tao – mày" chỉ giữ được qua cặp đã duyệt.
- Câu dẫn: bỏ "he said" khi đã rõ người nói hoặc chuyển lên trước lời thoại; không đổi động từ cho "đa dạng"
  (dễ thành lỗi "said haughtily").
- "love/darling/mate" kiểu Anh không phải tín hiệu người yêu hay bạn thân.
- `suggestRegister('en')` từng luôn trả `en-western`, kể cả bản tiếng Anh của truyện tiên hiệp; từ 2026-10-24
  tiếng Anh không tín hiệu thì không có bảng (xem [Xưng hô tiếng Việt](vietnamese-addressing.md#7-hai-trục-bối-cảnh-và-văn-hóa-gốc-2026-10-24)).

## 5. Đề xuất (chưa duyệt)

**Luật chung trong prompt** (thay câu "Viết tiếng Việt tự nhiên…", phải A/B; có thể giá trị chính nằm ở lượt
trau chuốt):

1. Dịch theo ý cả mục, viết theo trật tự và nhịp câu tiếng Việt.
2. Lược chủ ngữ, đại từ khi đã rõ; không lặp cùng tên/đại từ ở câu liền nhau, trừ khi bản gốc cố ý lặp.
3. Không dịch từng chữ bị động, danh hóa, trạng từ; chỉ dùng "được/bị", "một cách", "của" khi câu cần.
4. Giữ đúng mức độ bản gốc: không làm nhẹ, không thêm ý.
5. Mỗi nhân vật giữ giọng riêng (từ ngữ, tiểu từ, độ dài câu) như bản gốc.

**Theo ngôn ngữ (profile):** Nhật: dấu ba chấm thống nhất, tượng thanh bằng từ láy, Hán Việt bạn giả. Trung: 我们/咱们,
tự xưng theo thân phận, thứ tự xử lý thành ngữ, vài calque. Hàn: đuôi lịch sự → tiểu từ, tên Latinh. Anh: mật
độ đại từ, câu dẫn.

**Dữ liệu theo tác phẩm:** mục "giọng" của nhân vật; chính sách kính ngữ cho tiếng Hàn; mức Hán Việt (thấp/vừa/cao)
cho truyện Trung; gói glossary khởi đầu cho bản tiếng Anh của truyện Trung (Senior → tiền bối, Fellow Daoist → đạo hữu).

**Kiểm sau dịch (chỉ cờ):** "mày/tao" khi không có cặp tao – mày đã duyệt; lặp tên/đại từ; calque và bạn giả;
dạng lai ("anh X-san", "anh X-ssi"); lệch khung `[ ]` và số; dấu câu CJK sót.

**Không làm:** nhồi hướng dẫn văn phong dài; quá một vòng trau chuốt; tự "khử lặp" bằng thay tên thành mô tả;
ngưỡng hư từ chung cho mọi thể loại; dùng COMET/BLEU hay judge cùng họ làm thước văn học.

**Lab:** thước chính là so cặp mù của người đọc Việt, hai trục *tự nhiên* (chỉ đọc bản dịch) và *nghĩa*
(sót/thêm/sai); phân tầng thoại/lời kể; chỉ số văn dịch báo dạng khoảng cách tới bản người cùng chương.

## 6. Câu hỏi cho chủ sản phẩm

1. Bảng gợi ý còn các dòng "tao – mày" (côn đồ, bạn thân nói thô, anh em cãi nhau) và vài ghi chú thầy trò:
   xóa hẳn, hay giữ làm ngoại lệ?
2. Ưu tiên "đọc giải trí trôi" hay "sát nguyên tác"? Quyết định mức tách/gộp câu và lược đại từ.
3. Truyện cổ trang Trung giữ giọng Hán Việt dày (độc giả quen) hay thuần Việt?
4. Kính ngữ Hàn mặc định giữ hay Việt hóa? Tên Hàn theo phiên âm chuẩn hay cách fan quen?
5. Dấu ba chấm chuẩn "…" hay "..."? Lời thoại dùng ngoặc kép hay gạch đầu dòng?
6. Lượt trau chuốt mặc định hay công tắc; chi phí thêm mỗi chương chấp nhận bao nhiêu?
7. Có đưa được kho bản người dịch (ví dụ Hako) vào Lab không? Không có thì chỉ số văn dịch chỉ so được giữa
   các biến thể.

[Về mục lục](README.md)
