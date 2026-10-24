# Xưng hô cho truyện văn hóa phương Tây (nguồn tiếng Anh): nghiên cứu

Cập nhật: 2026-10-23 · Trạng thái: nghiên cứu, chưa phải quyết định

Phạm vi: văn hóa gốc **west** (truyện viết gốc kiểu Anh–Mỹ–Âu) trong các bối cảnh `modern`, `fantasy`, `game`;
cách nhận ra văn hóa gốc trong văn bản tiếng Anh; phần việc còn lại của profile `english()`. Đọc cùng
[xưng hô tiếng Việt](vietnamese-addressing.md) (quyết định đã chốt) và
[nghiên cứu văn phong](translation-style-research.md). Hai bối cảnh `court` và `cultivation` thuộc văn hóa
Trung/Nhật/Hàn, chỉ nhắc ở mục 3 (nhận diện).

Nhãn: **[Nguồn]** có URL ở cuối và đã đọc ngày 2026-10-23; **[Repo]** đọc từ mã hoặc tài liệu repo;
**[Suy]** suy luận của người soạn, chưa có nguồn công khai xác nhận. Công cụ tìm kiếm trả về ít nguồn
tiếng Việt về chủ đề này; chỗ nào không tìm được thì ghi rõ ở mục 1.3, không điền bằng trí nhớ.

## 1. Tóm tắt phát hiện

### 1.1 Đã xác minh

1. **Tiếng Anh không có T–V, độ trang trọng nằm ở tên và danh xưng.** Wikipedia: "thou" rời tiếng Anh chuẩn
   đầu thế kỷ 17; người Anh nay thể hiện trang trọng bằng tên riêng/họ, "sir", "madam" [Nguồn 1]. Hệ quả:
   bảng không thể dựa vào "you", phải suy từ tên + danh xưng + tuổi + quan hệ. Đúng với thiết kế "cách suy".
2. **Tiếng Việt chọn cặp từ tuổi, thế hệ, quan hệ; cặp đi đôi** (chọn "you" là chọn luôn cách tự xưng);
   "tôi" là đại từ duy nhất dùng được ở ngữ cảnh lịch sự; "bạn" chỉ hợp người trạc đôi mươi, không phải
   "you" vạn năng [Nguồn 2]. Khớp quyết định 3 ("không dùng tôi – bạn") và phản đối gán cứng.
3. **Cách nói địa vị Anh có quy tắc ngôn ngữ cụ thể** [Nguồn 3]: vua/hoàng hậu "Your Majesty", sau đó "Sir"/
   "Ma'am"; công tước/nữ công tước "Your Grace"; quý tộc dưới công tước "My Lord"/"Lord + tước hiệu" (Lord
   London); con trai thứ của công tước, hầu tước "Lord + tên riêng" (Lord John); hiệp sĩ/nam tước-baronet
   "Sir + **tên riêng**" (Sir John), không bao giờ "Sir + họ"; "Mr/Mrs/Miss + họ" cho người không tước.
   Bảng cần chỉ ra điều này vì nó đổi cách dịch: "Sir John" là "ngài John", không phải "ngài [họ]".
4. **Fantasy phương Tây không dùng "thần" là có căn cứ trong cộng đồng dịch**: người dịch Tearmoon từ chối
   lối xưng hô phong kiến Á Đông vì "đây là một bộ theme kiểu phương Tây"; một độc giả vẫn đề nghị
   "thần/hạ thần – người", nên đây là lựa chọn biên tập, không phải chuẩn tuyệt đối [Nguồn 4].
5. **Tên-gọi-thân mật tiếng Anh không có đối ứng một-một**: honey/darling/babe dịch được thành "cưng",
   "em yêu/anh yêu", "con yêu" tùy quan hệ; honey còn là cách người lạ lớn tuổi gọi trẻ hoặc phục vụ gọi
   khách [Nguồn 5, 6]. Khớp ghi chú sẵn có của `english()` ([Repo]).
6. **Hiện trạng repo đúng như vòng soát trước nói** [Repo]: `suggestRegister('en')` luôn trả `en-western`
   (kể cả bản Anh của tiên hiệp); hàng "Thầy cô ấm áp → học trò" dùng "con"; hàng "Bề tôi, hiệp sĩ → vua"
   dùng "thần / tôi – bệ hạ", "ta – khanh"; một bảng trộn fantasy với hiện đại (hàng "Kẻ thù": "ta – ngươi
   (fantasy) / tao – mày (hiện đại)"). Hai điểm đầu **lệch quyết định đã chốt** (thầy cô "thầy/cô – em",
   fantasy không "thần") nên bị bác theo quyết định, không cần thêm nguồn.

### 1.2 Bị bác hoặc phải sửa

- **"con" cho học trò – thầy cô** (hàng 3 của `en-western`): bác. Không tìm được nguồn nào ủng hộ; quyết định
  chốt "thầy/cô – em". Chỉ giữ "con" cho bối cảnh tôn giáo (mục 2.1, hàng linh mục) [Suy].
- **"thần/khanh" cho bề tôi phương Tây**: bác theo quyết định và theo [Nguồn 4]. "khanh" cũng bỏ (nó là
  ngôn ngữ triều đình Á Đông [Suy]); vua nói với bề tôi ở nghi lễ dùng "ta – ngươi", thường ngày theo tên.
- **"Sir X → ngài X" như một quy tắc phẳng**: sửa. Phải tách "Sir + tên riêng" (hiệp sĩ) khỏi "Mr + họ"
  (người thường) và khỏi "Lord X" (quý tộc); ba loại dịch khác nhau (mục 2.1).
- **Khẳng định của vòng soát trước "mặc định `en` nên là không bảng"**: giữ nhưng sửa chỗ hiểu: nên là
  "không bảng cặp, chỉ có hàng *cách suy*" (mục 4.3), vì nhiều truyện tiếng Anh chắc chắn là phương Tây
  (tên Tây, Mr/Ms) và vẫn cần gợi ý chung.
- **Hai chi tiết repo ghi về Harry Potter chưa kiểm được** ([Repo] `translation-style-research.md`: "hơn 50
  cách xưng gọi", "Draco xưng tao – mày suốt truyện"): trang bài VNU JFS chỉ cho thấy tóm tắt, 75 cặp
  I–you trong *Harry Potter và Hòn đá phù thủy* (Triệu Thu Hằng, 2019), không có số 50 hay ví dụ Draco
  [Nguồn 7]. Cần đọc toàn văn mới giữ câu đó.

### 1.3 Còn mở (không tìm được nguồn)

- Cách bản in Việt dịch **Game of Thrones, Chúa tể những chiếc nhẫn, Kiêu hãnh và định kiến**: tìm kiếm
  chỉ trả về thông tin thư mục, không có đoạn trích xưng hô. Không kết luận được "my lord/Your Grace/ser" →
  gì trong bản in. Mọi ánh xạ ở mục 2.2 là [Suy] cộng quy tắc ngôn ngữ [Nguồn 3].
- **Harry Potter thầy–trò**: không kiểm được Snape/McGonagall gọi học trò thế nào, học trò gọi thầy cô thế
  nào. Chỉ kiểm được rằng Ron – Harry dùng "mình – bồ" (Lý Lan chọn giọng Nam Bộ) [Nguồn 8]. Câu hỏi mở
  ở `vietnamese-addressing.md` ("mình – bồ" cho mọi nhóm bạn teen hay chỉ kiểu Harry Potter): **chỉ có bằng
  chứng cho kiểu Harry Potter**, và đó là giọng vùng miền theo dịch giả/nhân vật (quyết định 6 đã nói giọng vùng
  miền không thành mặc định chung). Đề nghị: không đưa "mình – bồ" vào bảng.
- **Sếp – nhân viên và quân đội/cảnh sát**: không có nguồn về dịch "sir/boss/rank + họ" sang Việt; xem hàng
  tương ứng với độ tin cậy thấp.
- **litRPG/progression**: không tìm được tài liệu về quy ước xưng hô trong thể loại này; chỉ có định nghĩa
  thể loại và cửa sổ trạng thái [Nguồn 9]. Bảng game phần lớn là [Suy].
- Người dịch Anh→Việt có thực sự gọi "Lord X" là "huân tước X" hay "ngài X" trong bản in: không xác minh.

## 2. Đề xuất bảng cho văn hóa west

Cấu trúc dòng giữ nguyên `PresetRow` ({relation, signals, forward, backward, notes}); hai cột thêm **chỉ cho
tài liệu này**: *Thuộc* (C = dòng chung của bối cảnh, W = dòng riêng văn hóa phương Tây) và *Tin cậy*
(cao = có quyết định chốt hoặc nguồn; trung = suy từ quy tắc đã xác minh; thấp = chỉ [Suy]). Mỗi ô một cặp
(ô "forward" ghi cặp *A tự xưng – A gọi B*). Chỗ viết "hoặc" ở ô tín hiệu chỉ là tín hiệu, không phải hai cặp.

Khi ghép (dòng chung bối cảnh + dòng văn hóa), nếu hai dòng cùng quan hệ thì dòng văn hóa **thay** dòng chung,
không cộng dồn. Dòng W ghi bên dưới là phần ghi đè.

### 2.1 `modern` + `west` (đô thị, học đường, công sở Mỹ–Anh): 13 dòng

| # | Quan hệ | Tín hiệu | forward | backward | Ghi chú | Thuộc | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | **Cách suy** | `you`, tên riêng | Bước 1: tuổi hai người, cùng thế hệ hay lệch ≥ 10 tuổi. Bước 2: quan hệ (họ hàng, thầy–trò, sếp, người lạ, tình cảm). Bước 3: gọi tên hay danh xưng (Mr/Ms/Dr/Professor + họ) = độ trang trọng. Bước 4: chọn **một cặp**, giữ cho tới mốc truyện | | | Người Anh–Mỹ gọi tên với sếp/thầy là bình thường, không hạ trang trọng; đừng ép "sếp/thầy" khi bản gốc gọi tên | C | cao |
| 1 | Bạn đồng lứa, thân (teen đến ~25) | tên riêng, nói suồng sã, dude/mate | tớ – cậu | | Nam chính nói "tôi" ngoài lời thoại thì giữ "tôi – cậu"; không "mình – bồ" làm mặc định | C | trung |
| 2 | Người lớn ngang hàng, đồng nghiệp | tên riêng, Mr/Ms + họ | tôi – anh | tôi – chị | Cặp theo tuổi/giới người nghe; bản gốc gọi tên thì lược đại từ | C | cao |
| 3 | Nam ↔ nữ cùng tuổi, chưa yêu | tên riêng | tôi – cậu | | Người lớn đi làm: tôi – anh / tôi – cô. Giữ tới mốc xác nhận (quyết định 1) | W | trung |
| 4 | Người yêu, vợ chồng, đã xác nhận | honey, babe, darling, tên riêng sau tỏ tình | anh – em | em – anh | honey/darling/babe/sweetheart không chứng minh quan hệ: kiểm tra trước; dịch thành "em yêu / anh yêu / cưng" tùy cảnh, hoặc lược | W | cao |
| 5 | Thầy cô → học trò | Mr/Ms/Professor + họ, sir/ma'am | thầy – em | cô – em | Lạnh hoặc xa cách: "thầy/cô – cậu / cô + tên" hoặc gọi họ ("cậu Malfoy"); đại học: "thầy/cô – em" nếu trẻ, "tôi – anh/chị" nếu học viên đã đi làm | W | cao |
| 6 | Học trò → thầy cô | sir, ma'am, Professor X | em – thầy | em – cô | "Professor X" → "thầy X / cô X"; "Yes, sir" → "Dạ, thầy" | W | cao |
| 7 | Cha mẹ ↔ con | Mom, Dad, Mum, tên riêng | bố – con | mẹ – con | Chiều ngược: con – bố / con – mẹ. Bố mẹ Mỹ–Anh gọi con bằng tên; "ba/má" chỉ khi nhân vật là người Việt hoặc đã duyệt | C | cao |
| 8 | Anh chị em ruột | tên riêng, bro, sis | em – anh | em – chị | Chiều ngược anh / chị – em. Sinh đôi hoặc gần tuổi gọi tên: tớ – cậu | C | trung |
| 9 | Sếp ↔ nhân viên | Mr/Ms + họ, tên riêng, boss | tôi – anh / chị | tôi – cậu / cô / tên | Sếp gọi tên + nhân viên gọi tên là chuẩn Anh–Mỹ: không đổi thành "sếp" nếu bản gốc không có "boss" / "sir" | W | thấp |
| 10 | Người lạ, người phục vụ, khách | sir, ma'am, miss, excuse me | tôi – anh / chị / ông / bà / cô / bác (theo tuổi) | | "Sir/ma'am" → "thưa ông/bà/anh/chị" hoặc lược; không "bạn". "Honey/dear" của người lớn lạ với trẻ: "con", "cháu", "cưng" | C | trung |
| 11 | Người thiên chức (linh mục, nữ tu, bác sĩ, cảnh sát, quân nhân) | Father X, Sister X, Dr. X, Officer X, rank + họ | tôi – cha | tôi – sơ / bác sĩ | Công giáo: "con – cha / sơ" khi giáo dân tự xưng; Dr. → "bác sĩ + tên"; chức danh + họ giữ nguyên dạng Việt ("Đại úy Smith"). Không có nguồn bản dịch Việt | W | thấp |
| 12 | Quý tộc hiện đại Anh | Lord X, Lady X, Sir + tên riêng, Your Grace | tôi – ngài | | Quy tắc ngôn ngữ [Nguồn 3]: Sir + tên riêng; Lord + tước hiệu hoặc tên riêng (con thứ); Duke "Your Grace". Việt: "ngài X", "huân tước X", "công tước" theo chính sách tên; chưa có nguồn bản in | W | trung |
| 13 | Đối đầu | you lạnh, gọi cả tên, chửi | tôi – anh | tôi – cô | Mức thô qua từ ngữ; "tao – mày" chỉ khi cặp đã duyệt (quyết định 8) | C | cao |

Dòng nên **bỏ** khỏi bảng hiện tại: "Thầy cô ấm áp → học trò: thầy/cô – con" (mâu thuẫn quyết định);
"Thầy cô lạnh lùng: ta – trò" ("ta" không hợp thầy cô hiện đại; gộp vào hàng 5); "Người hầu → chủ (fantasy)" và
"Bề tôi, hiệp sĩ → vua" (chuyển sang bảng fantasy); "Kẻ thù: ta – ngươi (fantasy) / tao – mày (hiện đại)" (một
dòng hai cặp, trái quy ước "một cặp mỗi ô", chuyển nửa fantasy sang 2.2 và nửa hiện đại thành hàng 13).

### 2.2 `fantasy` + `west` (châu Âu trung cổ, quý tộc, học viện phép thuật): 14 dòng

Dòng chung bối cảnh `fantasy` đã có ở `ja-fantasy` (hầu → chủ, hôn phu, cha mẹ quý tộc, hiệp sĩ); khi ghép
chỉ cần dòng W bên dưới thay các dòng cùng quan hệ.

| # | Quan hệ | Tín hiệu | forward | backward | Ghi chú | Thuộc | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | **Cách suy** | `my lord`, `you`, tên + tước | Bước 1: bậc (hoàng tộc > công tước > hầu tước/bá tước > nam tước > hiệp sĩ > thường dân). Bước 2: nghi lễ hay thường ngày. Bước 3: tên + tước = trang trọng, tên trống = thân. Bước 4: một cặp cho mỗi chiều, giữ tới mốc | | | Không dùng từ triều đình Á Đông (thần, nô tỳ, khanh, bổn cung, trẫm). "ta – ngươi" chỉ ở nghi lễ, phản diện, ngôn ngữ cổ có chủ ý | C | cao |
| 1 | Thần dân, quý tộc → vua, hoàng tộc | Your Majesty, Your Highness, Your Royal Highness, sire | tôi – bệ hạ | tôi – điện hạ | "Your Majesty" → "bệ hạ"; "Your Highness" → "điện hạ"; kèm "thưa". Không "thần" (quyết định) | C | cao |
| 2 | Vua, hoàng tử → người dưới, nghi lễ | We/I + thou/you, sinh trọng thể | ta – ngươi | | Chỉ tuyên bố, phong tước. Thường ngày: bảng hàng 3 | C | cao |
| 3 | Vua, hoàng tử → người dưới, thường ngày | tên riêng, you | tôi – cậu | tôi – cô | Hoặc "ta – cậu / cô" nếu giọng người kể trang nghiêm; giữ một lựa chọn | C | trung |
| 4 | Công tước, quý tộc cao → gọi nhau | Your Grace, My Lord Duke | tôi – ngài | | "Your Grace" → "công tước" (+ "thưa") hoặc "ngài"; không dịch "Ân điển". Công tước nữ: "công tước phu nhân" khi là vợ, "nữ công tước" khi tự mang tước | W | trung |
| 5 | Hầu → chủ | my lord, my lady, milady, master, mistress | tôi – ngài | tôi – cô | "my lady/milady" → "tiểu thư / phu nhân / thưa tiểu thư"; "master" (người hầu) → "chủ nhân / thiếu gia / ngài". Thiếu nữ nhỏ tuổi gắn bó với chủ: em – tiểu thư | C | trung |
| 6 | Chủ → hầu | tên riêng, you | tôi – cô | tôi – cậu | Chủ lạnh: ta – ngươi chỉ khi cố ý kẻ cả. Quản gia lớn tuổi: tôi – ông | C | trung |
| 7 | Hiệp sĩ (Sir / Ser) | Sir + tên riêng, Ser X | tôi – ngài | | "Sir Lancelot" → "ngài Lancelot" / "hiệp sĩ Lancelot". Lưu ý "Ser" trong A Song of Ice and Fire là tước hiệu riêng của thế giới; "Lord" có thể gọi cả hiệp sĩ đứng đầu gia tộc [Nguồn 10] | W | trung |
| 8 | Quý tộc ngang hàng, lịch sự | Lord X, Lady X, tên + tước | tôi – ngài | tôi – cô | Nam gọi nữ: "tiểu thư / phu nhân". Chưa quen không dùng "cậu" | W | trung |
| 9 | Hôn phu ↔ hôn thê, người yêu quý tộc | milady, my love, tên trống | tôi – nàng | em – ngài | Chưa yêu: "tôi – cô / em – ngài"; đã yêu: "anh – em". Chọn một cặp, không trộn "anh … nàng" | W | trung |
| 10 | Cha mẹ ↔ con quý tộc | Father, Mother, Papa, Lord Father | cha – con | con – cha | Không "ta" với con trừ khi cha nghiêm khắc có chủ ý; "Lord Father / Lady Mother" → "phụ thân / mẫu thân" nếu truyện đã chọn lối trang trọng | C | trung |
| 11 | Thầy phép, pháp sư ↔ học trò (học viện) | Master X, Professor X, Headmaster | thầy – em | em – thầy | Học viện: "thầy/cô – em" (đã chốt). Master–apprentice riêng lẻ: "sư phụ" chỉ khi bản gốc có quan hệ thầy tu bái sư; mặc định "thầy – em / ta – con" nếu như cha | W | trung |
| 12 | Giáo sĩ, tu sĩ, thánh nữ | Father, High Septon, Your Holiness, Sister | con – cha | cha – con | Giáo hội phương Tây: "con – cha / giáo chủ"; "Your Holiness" → "thánh thượng / đức thánh cha" theo thế giới truyện. Cặp riêng của thế giới | W | thấp |
| 13 | Phản diện, kẻ thù | thou, thee, you khinh, villain monologue | ta – ngươi | | Thô: tao – mày chỉ khi cặp đã duyệt (côn đồ dân thường) | C | cao |

Bỏ hẳn: "Người hầu → chủ" gộp kèm hàng "master" kiểu "cậu chủ" (đã chuyển hàng 5); "ta – khanh" của vua.
**Cách xưng thần – bệ hạ** chuyển sang bối cảnh `court` (văn hóa Á Đông), không còn ở west.

### 2.3 `game` (litRPG, progression, hầm ngục, hệ thống) + `west`: 12 dòng

Không có nguồn về quy ước xưng hô trong thể loại này [Nguồn 9, chỉ định nghĩa]. Toàn bộ là [Suy]. Phần "chung"
của bối cảnh `game` dùng cho cả Hàn (hunter, gate) và Trung (võng du); phần W là cách người Mỹ–Anh nói.

| # | Quan hệ | Tín hiệu | forward | backward | Ghi chú | Thuộc | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | **Cách suy** | `you`, tên nhân vật, tên người chơi | Bước 1: ngoài đời hay trong game (cùng một người có thể khác). Bước 2: tuổi, cấp bậc/vai trò (tank, leader, guildmaster). Bước 3: thân hay mới gặp, đang giao chiến hay nghỉ. Bước 4: một cặp, không đổi chỉ vì đổi nhịp câu | | | Nhịp câu ngắn khi chiến đấu không phải lý do đổi cặp | C | cao |
| 1 | Đồng đội trong party, mới | tên, nickname, class | tôi – cậu | tôi – anh / chị | Người lớn hơn rõ rệt: anh / chị. Gọi nickname nhân vật khi bản gốc gọi | C | thấp |
| 2 | Đồng đội thân, lâu năm | nickname, tên trống | tớ – cậu | | Thô hơn: tao – mày chỉ khi đã duyệt | C | thấp |
| 3 | Tuyển thủ / người chơi ↔ guildmaster, trưởng nhóm | Guildmaster, leader, boss, Commander | tôi – anh / chị | tôi – cậu / em / tên | Chức danh giữ dạng Việt ("hội trưởng", "đội trưởng"); nếu bản gốc gọi tên thì gọi tên | C | thấp |
| 4 | Tân thủ ↔ cao thủ, mentor | newbie, vet, "kid" | tôi – anh | anh – em | Khoảng cách cấp độ ≠ khoảng cách tuổi: dùng tuổi, trừ khi bản gốc đề cao cấp | C | thấp |
| 5 | Người chơi ↔ NPC dân làng, thương nhân | traveler, adventurer, stranger | tôi – ngài | tôi – cậu / cô | NPC kính trọng người chơi: "ngài / quý khách" nếu hệ thống đã định; thương nhân thân: "tôi – cậu" | C | thấp |
| 6 | Hệ thống, thông báo | [Quest], [System], You have gained | không đại từ | | Văn trung tính, giữ khung ngoặc và số; "Player / Host" → "người chơi" | C | cao |
| 7 | Thú cưng, triệu hồi, đồng hành | familiar, companion, pet, master | em / tôi – chủ nhân | ta – ngươi | Quái triệu hồi thông minh gọi chủ là "chủ nhân"; chủ gọi tên; con vật nhỏ: "nó" | C | thấp |
| 8 | Boss, quái thông minh | boss, demon lord, "mortal" | ta – ngươi | | Nói chuyện kiểu kẻ cả; trò chơi hài (AI quản lý hầm ngục) không áp | C | thấp |
| 9 | Chỉ huy ↔ binh sĩ (mạt thế, quân sự) | Commander, Sergeant, sir | tôi – thủ trưởng | tôi – cậu / tên | "Yes, sir" → "rõ, thưa chỉ huy / thưa sếp"; quân đội phương Tây: cấp bậc + họ | W | thấp |
| 10 | Người sống sót mới gặp (mạt thế) | stranger, tên | tôi – anh / chị | | Giống hàng 10 của `modern`; không "bạn" | C | trung |
| 11 | Đối thủ, tổ đội đối nghịch | rival, "newbie" khinh | tôi – cậu | | Giữ độ gắt bằng từ ngữ, không tự sang "mày" | C | trung |
| 12 | Gamer ngoài đời (hiện đại, chat) | dude, bro, noob, GG | tớ – cậu | | Văn chat: lược đại từ, giữ tiếng lóng ngắn; "bro" không tự thành "anh em" | W | thấp |

Dòng nên bỏ: `en-western` hiện chưa có dòng game nào, nên không có gì để bỏ. Khi dựng khung `game` chung, không
đưa vào các hàng gắn với thế giới Á Đông (đạo hữu, sư huynh, tông môn); chúng thuộc `cultivation`.

## 3. Nhận diện văn hóa gốc trong văn bản tiếng Anh

Mục tiêu: để AI tự suy văn hóa gốc `ja | ko | zh | west | unknown` kèm độ tin. Tín hiệu liệt kê là [Suy]
trừ chỗ có URL; chưa đo trên kho thật.

### 3.1 Tín hiệu mạnh cho truyện Á dịch sang Anh

| Văn hóa | Tín hiệu mạnh | Ghi chú |
| --- | --- | --- |
| ja | -san, -kun, -chan, -sama, -senpai, -sensei, onii-chan/onee-san, yoroshiku, itadakimasu; tên theo thứ tự họ–tên (Tanaka Yuki) | Các hậu tố là dạng gốc trong bản Anh khi người dịch giữ [Nguồn 11, 12] |
| ko | oppa, hyung, noona, unnie, sunbae/hoobae, -ssi, -nim, ajusshi, ajumma; Hunter, Gate, Awakened cùng cửa sổ hệ thống | Các từ này mã hóa giới + tuổi người nói [Nguồn 13]; "Manager Kim", "Team Leader Park" |
| zh | shixiong, shidi, shijie, shimei, shifu, shizun, Fellow Daoist, Senior/Junior (Brother/Sister), Qi Condensation / Foundation Establishment / Golden Core / Nascent Soul, sect, cultivation base; "this seat / this one / this lord" | Thuật ngữ sư môn theo thứ tự nhập môn, không theo tuổi [Nguồn 14] |
| zh/ko/ja | "Young Master", "Young Miss", Empress Dowager, Consort, Concubine, Eunuch, Prince Consort, harem | Có thể lẫn với truyện Tây; chỉ mạnh khi đi cùng cung đình/tông môn |

### 3.2 Tín hiệu mạnh cho truyện viết gốc phương Tây

- Mr/Mrs/Miss/Ms/Dr + **họ** là cách gọi thông thường; gọi tên riêng với sếp, thầy, người lạ vừa quen.
- Mom/Mum/Dad; slang dude, mate, bro; honey/darling/love/sweetie như lời gọi hằng ngày [Nguồn 6].
- Sir/ma'am đáp lời; Father X (linh mục), Sister X, Reverend, Officer X, Detective X.
- Quy ước tước hiệu Anh [Nguồn 3, 10]: Lord/Lady + tước hoặc tên, Sir + tên riêng, Your Grace (công tước), Your Majesty.
- Thế giới: elves, dwarves, orcs, wizards, knights, kingdoms kiểu châu Âu, "thou/thee" khi cố ý cổ.
- Văn hóa Tây: Christmas, Thanksgiving, college, fraternity, Congress, thị trấn Mỹ/Anh, đơn vị miles/pounds/feet.
- Tên Tây (và họ thông thường) là tín hiệu **yếu** riêng lẻ (xem 3.3).

### 3.3 Tín hiệu yếu hoặc nhập nhằng

- **Setting "phương Tây" ≠ văn hóa "phương Tây".** Otome game, villainess, isekai, "reincarnated as…" trong bản Anh
  thường là truyện Nhật hoặc Hàn dựng bối cảnh châu Âu: giữ văn hóa ja/ko, bối cảnh `fantasy`. Tín hiệu: nữ chính
  chuyển sinh vào "game" mình từng chơi, chiều dài tiêu đề dạng câu, "I reincarnated…", tên tiếng Anh mà tác giả
  Á (xem metadata nếu có).
- Tên Tây xuất hiện trong truyện Hàn/Nhật hiện đại (nhân vật nước ngoài); Hunter/Gate/System thuộc Hàn dù
  tên nhân vật là tiếng Anh.
- "Master", "Young Lady", "Sir": cả hai bên dùng; không dùng một mình.
- Văn xuôi "dịch": lặp tên thay đại từ, "this one", "please take care of me", "It's an honor" cứng nhắc
  [Suy]: gợi bản dịch từ Á, nhưng cũng là lỗi dịch máy.
- Nền tảng và nhãn thể loại (Royal Road thiên về LitRPG viết gốc, Webnovel/Wuxiaworld thiên về Trung, Syosetu/
  Kakuyomu → Nhật) là tín hiệu gián tiếp; tên nền tảng có trong siêu dữ liệu của tác phẩm thì dùng được.

### 3.4 Cách kết hợp và mặc định khi không có tín hiệu

1. Đếm tín hiệu mạnh theo từng văn hóa. Một văn hóa có ≥ 2 tín hiệu mạnh khác loại, hoặc 1 mạnh + đa số tín hiệu
   yếu cùng hướng → chọn, độ tin trung; thêm tín hiệu khẳng định (nhãn người dùng) → cao.
2. **Văn hóa `west` đòi tín hiệu dương** (mục 3.2), không suy từ việc "không thấy tín hiệu Á". Văn bản chỉ có
   tên Tây + `you`/tên riêng là chưa đủ.
3. Có xung đột (Hunter + Mr Smith) → hỏi người dùng hoặc `unknown`.
4. **Mặc định khi không có tín hiệu: `unknown` = không bảng cặp**, chỉ phát hàng *cách suy* chung (cùng nội dung
   hàng 0 của 2.1) cùng luật chung. Lý do: (a) `you` không cho biết quan hệ nên mọi cặp là đoán; (b) gán nhầm
   `west` cho truyện Á sinh lỗi kiểu "gọi sư phụ là thầy – con", gán nhầm `ja/zh` sinh "senpai/đạo hữu"; (c) trước
   đây `en` → `en-western` luôn, kể cả tiên hiệp [Repo]; (d) mô hình tiếng Anh đã khá tốt ở bảng chung, thiệt
   hại khi không bảng nhỏ hơn khi bảng sai [Suy]. Ngoại lệ: nếu bối cảnh đã rõ (ví dụ `modern`) nhưng văn hóa thì chưa, chỉ phát dòng chung của bối cảnh.

## 4. Quy ước ở profile `english()` cần thêm hoặc sửa

Hiện `english()` ([Repo] `languageProfiles.ts`) có 5 dòng: chọn cặp theo tuổi/vai vế/độ thân; tên giữ Latinh;
he/she dày đặc; bị động và câu dẫn; love/darling/mate. Đề xuất:

**Sửa**

1. **Tên riêng giữ dạng Latinh** — phải đặt điều kiện: đúng với tên phương Tây và Hàn/Nhật, nhưng bản Anh của
   truyện Trung nên dùng Hán Việt (profile `chinese()` đã vậy). Khi văn hóa gốc là `zh`, dòng này nhường cho profile
   Trung. [Repo], [Suy].
2. **Dòng "love/darling/mate"** hiện nằm ở đây. Giữ ở profile (đúng ngôn ngữ), bảng chỉ ghi "không chứng minh quan hệ",
   không lặp ví dụ.

**Thêm** (không có trong bảng, vì là quy ước ngôn ngữ):

3. Mr/Mrs/Miss/Ms/Dr + họ: dịch theo tuổi và độ trang trọng (ông/bà/anh/chị/cô/bác sĩ + tên), không dịch cứng thành
   "ngài" cho mọi Mr; "Ms" → "cô"/"chị" theo tuổi [Suy; Nguồn 3 cho dạng gọi].
4. Sir/ma'am là *danh xưng lịch sự theo vai người nói*, không phải tước: "yes, sir" → "dạ", "vâng, thưa ngài/thầy/sếp"
   tùy người; lược khi tiếng Việt đã rõ.
5. Sir + tên riêng (hiệp sĩ), Lord + tước hoặc tên riêng, Your Grace/Majesty/Highness: giữ nguyên *cấp bậc* và
   *dạng* (tên riêng hay tước), không đổi "Sir John" thành "ngài [họ]" [Nguồn 3].
6. `thou/thee/thy`: chỉ dịch "ta – ngươi" khi cố ý cổ, nghi lễ, phản diện; không dịch mọi "thou" thành "ngươi" [Nguồn 1: "thou" đã bỏ từ thế kỷ 17].
7. `you` số nhiều ("you guys", "y'all", "you all"): "các cậu / mọi người / các bạn" theo tuổi (ở đây "các bạn" chấp nhận
   được cho người lớn nói với nhóm lạ lịch sự), không "mày/tụi bây" trừ khi cặp đã duyệt.
8. Gọi người lạ lớn tuổi hơn bằng tên riêng ("Margaret"): chuyển theo tuổi ("bà Margaret", "cô Margaret"), không bỏ danh xưng
   khiến tiếng Việt cộc.
9. Nickname: giữ tên gọi tắt/biệt danh (Jamie, Lizzy) nếu glossary ghi; không tự dịch nghĩa biệt danh.
10. Gọi theo vai (Mom, Dad, Coach, Doc, Captain): giữ vai ở dạng Việt ("mẹ", "huấn luyện viên", "bác sĩ", "thuyền trưởng").
11. Nếu văn hóa đã suy là Á (mục 3), chuyển sang quy ước của văn hóa đó; không áp 1–10.

Đặt vị trí: 1, 2 sửa trong `english()`; 3–10 thêm vào `english()`; 11 là điều kiện chọn profile (tầng chọn văn hóa), không phải dòng.

## 5. Câu hỏi mở cho chủ sản phẩm

1. **Mặc định `unknown`**: chỉ phát hàng *cách suy* (đề xuất ở 3.4) hay vẫn ngầm `west` như trước? Chấp nhận để người
   dùng chọn bằng tay trong trường hợp nhập nhằng?
2. **Setting châu Âu từ tác giả Á**: truyện otome/villainess/isekai bản Anh coi là văn hóa gốc ja/ko và bối cảnh `fantasy`
   (đề xuất), hay có lựa chọn "west" riêng?
3. **"Lord X"**: "huân tước X" hay "ngài X"? "Your Grace" → "công tước" hay "ngài"? Chính sách mặc định cho cả truyện.
4. **Sir + tên riêng**: "ngài John" hay "hiệp sĩ John"? (Ser trong GoT có thể giữ nguyên "Ser".)
5. **Hậu tố giữ hay Việt hóa** với văn hóa Á trong bản Anh: giữ senpai/oppa/shixiong như quyết định hậu tố 2026-10-04
   hay đổi mặc định theo bối cảnh?
6. **Giọng teen "mình – bồ"**: không vào bảng (đề xuất), chỉ đặt qua cặp đã duyệt?
7. **Sếp – nhân viên Mỹ–Anh**: gọi tên hai chiều là chuẩn; có cần ép "sếp / anh – em" cho người đọc Việt không (hiện không nguồn)?
8. **Linh mục, quân đội**: cặp "con – cha", "tôi – thủ trưởng" có đưa vào bảng hay chỉ đặt qua cặp duyệt?
9. **Game west**: cần bối cảnh riêng "game-Âu Mỹ" hay một `game` chung cho cả Hàn lẫn Anh (đề xuất: chung + vài dòng W)?
10. **Ngôi ba** (chưa nghiên cứu ở đây): fantasy phương Tây "nàng/chàng" khi trang trọng hay chỉ "cô ấy/anh ấy"? Cần thêm khảo sát.

## Nguồn (truy cập 2026-10-23)

Đã đọc nội dung:

1. T–V distinction, Wikipedia — https://en.wikipedia.org/wiki/T%E2%80%93V_distinction
2. Vietnamese pronouns, Wikipedia — https://en.wikipedia.org/wiki/Vietnamese_pronouns
3. Forms of address in the United Kingdom, Wikipedia — https://en.wikipedia.org/wiki/Forms_of_address_in_the_United_Kingdom
4. Dịch giả Tearmoon, bình luận chương 17 (docln) — https://docln.net/truyen/6624-chuyen-ve-de-quoc-tearmoon/c63346-chuong-17-bien-nien-su-ve-cong-chua-thanh-nu-mia
7. Triệu Thu Hằng 2019, VNU Journal of Foreign Studies 35(4), tóm tắt — https://js.vnu.edu.vn/FS/article/view/4390
8. "Harry Potter và sự xuất sắc trong văn phong dịch của Lý Lan" (Tia Chops) — https://www.tiachops.com/blogs/thong-tin-cap-nhat-moi-nhat/harry-potter-su-xuat-sac-trong-van-phong-dich-cua-ly-lan
11. Japanese honorifics, Wikipedia — https://en.wikipedia.org/wiki/Japanese_honorifics
13. Korean honorifics, Wikipedia — https://en.wikipedia.org/wiki/Korean_honorifics
14. Wuxiaworld, terms of address — https://www.wuxiaworld.com/page/wuxia-xianxia-terms-of-address

Chỉ đọc kết quả tìm kiếm (không mở trang, nội dung là tóm tắt của công cụ):

5. Babe là gì (FPT Shop) — https://fptshop.com.vn/tin-tuc/for-gamers/babe-la-gi-209007; Darling (CellphoneS) — https://cellphones.com.vn/sforum/darling-nghia-la-gi
6. Pet names in English (Duolingo) — https://blog.duolingo.com/pet-names-in-english/; Từ điển Lạc Việt "honey" — https://tratu.coviet.vn/hoc-tieng-anh/tu-dien/lac-viet/ALL/honey.html
9. LitRPG, Wikipedia — https://en.wikipedia.org/wiki/LitRPG; N.I.N.C. genre spotlight — https://ninc.com/litrpg-a-genre-spotlight/
10. A Wiki of Ice and Fire, mục Lord/Ser — https://awoiaf.westeros.org/index.php/Lord (chỉ thấy đoạn trích trong kết quả tìm kiếm)
12. Diễn đàn J-Novel Club, tranh luận giữ hay dịch hậu tố — https://forums.j-novel.club/post/130440
Khác trong kết quả tìm kiếm: bài Publang về Hàn BL (kcomicsbeat) — https://kcomicsbeat.com/2026/07/31/hyung-he-said-and-the-nuances-of-localization-for-korean-bl/

Repo: `docs/modules/context/vietnamese-addressing.md`, `docs/modules/context/translation-style-research.md`,
`src/shared/contracts/addressingPresets.ts`, `src/main/services/ai/translate/languageProfiles.ts` (hàm `english()`).

[Về module Ngữ cảnh](README.md)
