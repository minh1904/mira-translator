# Xưng hô cho truyện văn hóa Hàn: nghiên cứu bảng gợi ý

Cập nhật: 2026-10-23 · Trạng thái: nghiên cứu, chưa phải quyết định

Phạm vi: dịch xưng hô sang tiếng Việt cho truyện có văn hóa gốc Hàn (web novel, webtoon: công sở, học đường,
chaebol, thợ săn/Gate/hầm ngục, hồi quy/ám nhập/chuyển sinh, romance fantasy/ác nữ, sageuk Joseon/Goryeo), để
làm đầu vào cho việc đổi `<addressing_defaults>` sang hai trục (bối cảnh × văn hóa gốc). Tài liệu này **không
đổi quyết định nào** ở [xưng hô tiếng Việt](vietnamese-addressing.md); chỗ nào phản biện thì ghi rõ ở mục 1.3 và
mục 4.

Nhãn: **[Nguồn]** có URL ở mục 7, đọc ngày 2026-10-23; **[Repo]** đọc từ mã hoặc tài liệu của Mira;
**[Suy]** suy luận của người soát, chưa có nguồn. Độ tin cậy của dòng bảng: **Cao** (nguồn trực tiếp cho cả
ý nghĩa Hàn lẫn cách đặt tiếng Việt), **Vừa** (ý nghĩa Hàn có nguồn, cách đặt tiếng Việt là lựa chọn biên tập
dựa trên bộ ja/zh đã chốt), **Thấp** ([Suy] hoàn toàn).

## 1. Tóm tắt phát hiện

### 1.1 Đã xác minh

1. **Đuôi lịch sự không đổi cặp đại từ; tiếng Việt bù bằng tiểu từ.** Kính ngữ Hàn nằm ở từ vựng và cú pháp
   (chắp dính); tiếng Việt thể hiện bằng trợ từ, tiểu từ, thán từ, "dạ/vâng/thưa" ([Phạm Thị Ngọc 2017], tóm tắt
   của bài; [Phạm Thị Ngọc 2018] cho danh sách tiểu từ ạ, nhé, nhớ, đi, nào). Khớp dòng `korean()` hiện có.
2. **Tiếng Việt chuyển danh xưng Hàn chủ yếu bằng "nội địa hóa".** Trên 657 câu thoại của *Người ăn chay*,
   có 372 từ xưng hô (đại từ 51,08%, từ thân tộc 25,00%, tên riêng 12,63%, chức danh/nghề 4,03%); hai bản dịch
   Việt đều nội địa hóa là chính, ngoại hóa chỉ hai lần ở bản sau; 형님 thành "anh" ở cả hai bản; 선생님 không
   được giữ mà chuyển theo hệ xưng hô Việt ([Đỗ Thúy Hằng 2026]). Đây là văn học, không phải webtoon, nhưng là
   dữ liệu định lượng duy nhất tìm được.
3. **Chức danh + 님 dịch thành chức danh Việt, không giữ -nim:** 과장님 → "trưởng phòng", 사장님 → "giám đốc",
   선배님 → "tiền bối", 씨 → "anh" + tên ([Phạm Thị Ngọc 2018], đọc qua bản SlideShare nên là nguồn thứ cấp).
4. **당신 có ba chỗ dùng:** giữa vợ chồng (thường trung niên), nghĩa "bạn" chung, và gay gắt giữa người lạ khi
   cãi nhau ([Wikipedia: Korean pronouns], [elon.io]). Nghiên cứu hội thoại cãi nhau của vợ chồng cho thấy đại
   từ chuyển dần từ dạng kính/thân sang dạng không kính, rồi bỏ hẳn đại từ, rồi chỉ còn tiếng gọi "야"
   ([Han & Chae 2015]). Điều này ủng hộ việc thể hiện cãi nhau bằng lời lẽ chứ không bằng đổi sang cặp khác.
5. **말 놓다 là mốc quan hệ thỏa thuận, và bất đối xứng là bình thường:** người trên hay người lớn tuổi đề nghị;
   giai đoạn chuyển tiếp người trên nói 반말 còn người dưới vẫn 존댓말 không bị coi là vô lễ; có thể quay lại
   존댓말 để tạo khoảng cách ([elon.io]). Hệ quả: cặp ngược chiều khác nhau là bình thường, và việc đổi cặp phải
   bám mốc.
6. **오빠 có bốn nghĩa:** anh ruột/họ, người yêu hoặc chồng lớn tuổi hơn, anh thân thiết (bạn, tiền bối), thần
   tượng; nữ nói với nam, nam dùng 형; gọi người mới gặp là suồng sã ([tanvietprime]). Từ chọn phụ thuộc giới
   người nói và người nghe ([lophoctienghan], [tanvietprime]).
7. **선배 xếp bậc theo ngày vào công ty/trường, không theo tuổi hay chức danh;** 선배님 khi không rõ chức vụ,
   chức danh + 님 khi có, 씨 chỉ dùng với người ít tuổi/ngang ([hanguljobs]). Wikipedia nói thêm: gắn 씨 vào họ
   một mình là rất bất lịch sự; -nim cao hơn -ssi ([Wikipedia: Korean honorifics]).
8. **Sageuk:** 전하 dùng cho vua (Joseon) và thế tử là 저하; 폐하 cho hoàng đế (và vua trước Joseon); 마마 cho
   hoàng tộc ngoài vua; 대감 là "đại nhân"; 중전 là hoàng hậu/vương hậu; 신첩 là phi tần tự xưng với vua; 소신 và
   소인 là nam tự xưng với vua; 나리 cho quan; 마님, 도련님, 아가씨 là người hầu gọi vợ, con trai, con gái chủ
   ([Wikipedia: Korean honorifics], [Soompi], [Talking Cupboard]).
9. **`addressingAnalysis` không có bộ đại từ tiếng Hàn:** chỉ có `ja` và `zh` ở dòng 49–50 [Repo]. Điều này
   đã được báo ở [văn phong bản dịch](translation-style-research.md); ở đây đã kiểm trực tiếp mã.

### 1.2 Bị bác hoặc phải sửa so với vòng soát trước

| Ý của vòng soát trước | Kết luận | Lý do |
| --- | --- | --- |
| 짐 = "trẫm" | **Sửa.** Chỉ đúng cho hoàng đế. Vua Joseon tự xưng 과인. | [Talking Cupboard]: 과인 là vua tự xưng với bề tôi, 짐 là hoàng đế. Đại Hàn Đế quốc (1897–1910) mới dùng 짐 trong nước ([namu: 짐], nguồn cộng đồng, độ tin cậy trung bình) |
| 전하/폐하 "chưa kiểm" | **Đã kiểm, có điều kiện theo triều đại.** | Mục 1.1.8; vua Goryeo đầu là 폐하 theo glossary ("pre-Joseon King"), nguồn Hàn cộng đồng nói Goryeo hậu kỳ bị hạ xuống 전하 dưới Nguyên (chưa kiểm bằng nguồn học thuật) |
| 선배 → "anh/chị" làm mặc định | **Sửa.** "anh/chị" mã hóa tuổi, 선배 mã hóa thâm niên. | [hanguljobs]; nếu 선배 trẻ hơn thì "anh/chị" sai |
| Giữ cặp lịch sự khi 반말 từ người lạ | **Làm mềm.** Giữ làm mặc định, không làm luật cứng. | Quyết định 2026-10-14 đã bỏ luật cứng riêng cho "mày – tao"; [Han & Chae 2015] cho thấy cãi nhau đẩy dạng gọi xuống |
| Không giữ "-ssi" | **Giữ ý, đổi cách nói.** Xem mục 4. | Bằng chứng Việt chỉ có thể nói "không thấy ai giữ -ssi", không chứng minh được "không nên giữ" |

### 1.3 Phản biện (ghi rõ)

Quyết định 2026-10-04 ("mặc định giữ hậu tố kính ngữ") được viết cho hậu tố Nhật gắn sau tên (-san, -kun, -chan,
-sama): trong mã nó chỉ chạy qua `honorificLines()` của `japanese()` và `DEFAULT_HONORIFICS = { mode: 'keep' }`,
còn `korean()` không nhận chính sách nào [Repo]. Khi tài liệu viết "mặc định của tác phẩm vẫn là giữ", câu này chưa
nói rõ có áp cho tiếng Hàn hay không. Tài liệu này **không phủ nhận quyết định**, mà đề xuất tách thành ba lớp
(mục 4) và xin chủ sản phẩm xác nhận phạm vi (mục 6, câu 1). Điểm khác nhau cốt lõi: quy chuẩn "giữ" của nhóm
dịch Nhật có chứng cứ trong docs (mục 4 của vietnamese-addressing); với -ssi tôi không tìm được chứng cứ
tương đương cho nhóm dịch Việt.

### 1.4 Còn mở (không tìm thấy nguồn)

- Quy ước của nhóm dịch webtoon/web novel Việt cho 오빠, 형, 선배, -nim (giữ hay đổi). Ba lượt tìm tiếng Việt
  không ra tài liệu nào. Mọi câu "nhóm dịch thường giữ oppa/hyung" trong kết quả tìm kiếm là suy luận của
  công cụ tìm kiếm, **không dùng làm căn cứ**.
- Cách phụ đề phim Hàn tiếng Việt xử lý xưng hô (không tìm thấy hướng dẫn hay nghiên cứu).
- 영애, 아가씨/도련님 theo nghĩa chị/em chồng, 쇤네, 로판 hô ngữ chuẩn (không có glossary tiếng Việt đáng tin).
- Cách phân bổ 자기, 여보, 당신 theo thế hệ (chỉ có bài báo, không có khảo sát).
- Cách bản dịch Anh chính thức của web novel Hàn xử lý -nim, -ssi: Kubera wiki dịch -ssi thành Mr./Ms. nhưng
  hai trang fandom khác trả HTTP 402/403 nên không đọc được.

## 2. Hai trục áp vào Hàn

Ghi nhận cho kiến trúc, không đổi mã. Bảng cuối = dòng chung của bối cảnh + dòng riêng của văn hóa.

| Bối cảnh | Dòng chung (kế thừa) | Dòng riêng văn hóa Hàn |
| --- | --- | --- |
| modern | `ja-modern`/`zh-modern`/`en-western` phần hiện đại | Mục 3.1 |
| fantasy | `ja-fantasy`, `en-western` phần fantasy | Mục 3.2 |
| court | `ja-court`, `zh-ancient` phần cung đình | Mục 3.3 |
| game | chưa có bảng nào trong repo [Repo]; chung = mục 3.4 | Mục 3.4 |
| cultivation | Hàn gần như không có thể loại này; không đề xuất dòng Hàn | — |

Quy ước ô: mỗi ô một cặp. Dấu "/" chỉ chọn theo giới tính (anh/chị) hoặc theo tuổi, không phải lựa chọn tùy
hứng. "Ngược" chỉ ghi khi khác chiều thuận. Dòng nào bật lên tùy chính sách thì nói trong ghi chú.

## 3. Bảng đề xuất

### 3.1 modern (công sở, học đường, chaebol)

13 dòng: 5 chung + 8 Hàn.

| Loại | Quan hệ | Tín hiệu | Thuận | Ngược | Ghi chú và độ tin cậy |
| --- | --- | --- | --- | --- | --- |
| chung | Bạn cùng tuổi, chưa thân | 반말 hoặc 존댓말 giữa bạn cùng tuổi, gọi tên | tôi – cậu | | Kế thừa. Tin cậy: Vừa |
| chung | Người yêu đã xác nhận | 자기, 여보, 오빠 (nữ → bạn trai), tỏ tình | anh – em | em – anh | Kế thừa; chỉ khi đã tỏ tình và gọi trống. Tin cậy: Vừa |
| chung | Cha mẹ ↔ con | 아빠, 엄마, 아버지, 어머니 | bố/mẹ – con | con – bố/mẹ | Kế thừa. Tin cậy: Cao |
| chung | Thầy cô ↔ học trò | 선생님, 이름 + 반말/존댓말 | thầy/cô – em | em – thầy/cô | Kế thừa. 선생님 được nội địa hóa theo hệ Việt ([Đỗ Thúy Hằng 2026]). Tin cậy: Cao |
| chung | Người lạ | 존댓말, không gọi tên | tôi – anh/chị theo tuổi | | Kế thừa; không "bạn". Tin cậy: Vừa |
| Hàn | Em → anh/chị thân hơn tuổi (오빠, 형, 누나, 언니) | 오빠/형/누나/언니 ± tên | em – anh/chị | anh/chị – em | 오빠 chỉ nữ nói, 형 chỉ nam nói: dùng làm tín hiệu giới tính người nói. "Tên + oppa/hyung" → "anh + tên". Không dùng với người lạ. Chỉ dùng cặp này khi kéo theo quan hệ thân; xem mục 4 về chế độ giữ. Tin cậy: Cao (nghĩa), Vừa (cách đặt) |
| Hàn | Hậu bối → tiền bối (선배, 선배님) | 선배(님) ± tên, công ty/trường | em – anh/chị | anh/chị – em | Chỉ khi tiền bối lớn tuổi hơn; nếu trẻ hơn hoặc không rõ tuổi thì gọi trống là "tiền bối". 선배 tính theo thâm niên ([hanguljobs]). Tin cậy: Vừa |
| Hàn | Nhân viên → cấp trên (팀장님, 과장님, 부장님, 사장님, 대표님) | chức danh + 님, 존댓말 | tôi – chức danh | tôi – anh/chị + tên | Chức danh thay đại từ, không giữ -nim ([Phạm Thị Ngọc 2018]). Chưa có nguồn cho "em" thay "tôi"; xem câu hỏi 5. Tin cậy: Vừa |
| Hàn | Cấp trên → nhân viên (이름 + 씨, 반말 nhẹ) | 씨, 반말 từ trên xuống | tôi – cậu/cô + tên | tôi – chức danh | 씨 → "anh/chị/cô/cậu + tên" ([Phạm Thị Ngọc 2018]: 씨 → "anh"). Khi sếp cố ý lạnh: "tôi – anh/chị". Tin cậy: Vừa |
| Hàn | Đồng nghiệp ngang cấp | tên + 씨 hai chiều, 존댓말 | tôi – anh/chị + tên | | 씨 giữa người ngang nhau; có thể lược tên và đại từ. Tin cậy: Vừa |
| Hàn | Chủ tịch, gia đình chaebol (회장님, 도련님, 사모님) | 회장님, 도련님, 사모님 | tôi – chủ tịch | tôi – cậu/cô | Nhân viên giữ danh xưng với 회장님. 도련님 = cậu chủ khi người hầu/nhân viên gọi con trai chủ [Nguồn: Talking Cupboard glossary]; 도련님/아가씨 còn là cách gọi em chồng, chưa kiểm bằng nguồn [Suy]. Tin cậy: Thấp |
| Hàn | Vợ chồng (여보, 당신, 자기) | 여보, 당신 giữa vợ chồng | anh – em | em – anh | 당신 giữa vợ chồng không mang hàm ý xúc phạm. Có thể lược đại từ hoặc dùng "mình". Tin cậy: Vừa |
| Hàn | Cãi nhau, người lạ gắt (당신 gắt, 너, 야) | 당신/너 khi cãi, hoặc bỏ hẳn đại từ | giữ cặp đang có | | Không đổi sang cặp khác chỉ vì 당신 gắt; thể hiện bằng lời lẽ ([Han & Chae 2015]). Nếu bản gốc là 야 hoặc 반말 từ người lạ: "tôi – anh/cô" cộng lời lẽ hỗn; "tao – mày" chỉ khi cặp đã duyệt hoặc quan hệ thật sự thô. Tin cậy: Vừa |

Nên bỏ hoặc gộp khỏi bảng modern:

- Dòng "thầy cô thô" của `ja-modern`: Hàn không có tín hiệu 俺/お前 để tách; gộp vào "thầy cô ↔ học trò".
- Dòng "giới giải trí X哥/X姐" (`zh-modern`): với Hàn đã nằm trong 오빠/형/누나/언니.
- Dòng riêng cho 아저씨/아줌마: gộp vào "Người lạ" (tôi – chú/cô/bác theo tuổi) [Suy], không thêm dòng.

### 3.2 fantasy (romance fantasy, ác nữ, hồi quy, chuyển sinh quý tộc)

13 dòng: 9 chung + 4 Hàn. Thể loại này của Hàn thường kể theo bản dịch Anh (RoFan) và dùng nhiều từ Hán Hàn;
nội tâm nhân vật hồi quy/ám nhập vẫn là giọng hiện đại, chỉ lời thoại mới theo giai cấp.

| Loại | Quan hệ | Tín hiệu | Thuận | Ngược | Ghi chú và độ tin cậy |
| --- | --- | --- | --- | --- | --- |
| chung | Hầu gái, quản gia → chủ | 아가씨, 도련님, 마님 | tôi – tiểu thư/thiếu gia | tôi – tên | Kế thừa `ja-fantasy`. 아가씨 = "Young Lady" người hầu gọi con gái chủ [Talking Cupboard]. Tin cậy: Vừa |
| chung | Vua, hoàng tử → thần dân, nghi lễ | 짐 hoặc 나, 경 | ta – ngươi | | Kế thừa; chỉ nghi lễ. Tin cậy: Vừa |
| chung | Thần dân, quý tộc → hoàng tộc | 폐하, 황태자 전하, 공주 전하 | tôi – ngài, thưa điện hạ/bệ hạ | | Kế thừa; không "thần" trừ cận vệ, quan lại trực thuộc. Tin cậy: Vừa |
| chung | Quý tộc ngang hàng | 공작 각하, 영애 | tôi – ngài/cô | | Kế thừa. Tin cậy: Vừa |
| chung | Hôn phu → hôn thê | 약혼자, 이름 | tôi – cô | em – ngài | Kế thừa; khóa tới mốc. Tin cậy: Vừa |
| chung | Cha mẹ ↔ con | 아버지, 어머니, 아빠 | cha/mẹ – con | con – cha/mẹ | Kế thừa. Tin cậy: Vừa |
| chung | Anh chị em quý tộc | 오라버니, 언니, 오빠 | anh/chị – em | em – anh/chị | Kế thừa; 오라버니 là dạng cổ của 오빠, vẫn đặt "anh". Tin cậy: Vừa |
| chung | Hiệp sĩ → chủ | 경호, 기사, 전하 | tôi – điện hạ/tiểu thư | | Kế thừa. Tin cậy: Vừa |
| chung | Phản diện, kẻ thù | 네놈, 너 | ta – ngươi | | Kế thừa. Tin cậy: Vừa |
| Hàn | Hoàng đế → bề tôi (짐) | 짐 + 경 | trẫm – khanh | thần – bệ hạ | Dùng "trẫm" **chỉ khi** bản gốc có 짐 (hoàng đế: [Talking Cupboard]); nếu hoàng đế dùng 나 thì "ta". Khác `ja-fantasy`/`en-western`, tránh trẫm: khác vì Hàn có 짐 và 폐하. Tin cậy: Vừa |
| Hàn | Người dưới → công tước, đại công (각하, 전하) | 공작 각하, 대공 전하 | tôi – ngài | | 각하 là kính ngữ của đại thần/quan cao ([Seoul Shinmun qua tìm kiếm]); đặt "ngài + tước". Tin cậy: Thấp |
| Hàn | Người hầu → bà chủ (마님) | 마님 | tôi – phu nhân | | 마님 = vợ chủ, "Milady" ([Talking Cupboard]); "phu nhân" là lựa chọn biên tập. Tin cậy: Thấp |
| Hàn | Người hầu → cậu chủ (도련님) | 도련님 | tôi – cậu chủ | | "Young Master" ([Talking Cupboard]); "thiếu gia" là phương án thứ hai. Tin cậy: Thấp |

Nên bỏ: dòng "Hôn phu thô" của `ja-fantasy` (Hàn không có 俺/お前 tương đương rõ); dòng "Giáo viên học viện ↔ học
sinh" nếu truyện không có học viện (gộp vào 선생님).

### 3.3 court (sageuk Joseon, Goryeo)

13 dòng: 6 chung + 7 Hàn. Lưu ý Joseon là vương quốc (vua, điện hạ, thế tử); hoàng đế (trẫm, bệ hạ) chỉ ở
Đại Hàn Đế quốc hoặc Goryeo đầu. Đừng đặt "bệ hạ" mặc định cho mọi vua Hàn.

| Loại | Quan hệ | Tín hiệu | Thuận | Ngược | Ghi chú và độ tin cậy |
| --- | --- | --- | --- | --- | --- |
| chung | Phi tần → vua | 신첩, 전하 | thần thiếp – điện hạ | | Phi tần tự xưng 신첩 ([Talking Cupboard]); khớp quyết định "thần thiếp". Tin cậy: Cao |
| chung | Cung nữ, nô tỳ → chủ | 마마, 소인/저 | nô tỳ – nương nương | ta – ngươi | Kế thừa `ja-court`. 마마 → "nương nương" cho nữ hoàng tộc. Tin cậy: Vừa |
| chung | Phu thê, người yêu đã xác nhận | 부인, 서방님, 낭군 | ta – nàng | ta – chàng | "Thiếp" chỉ khi trang trọng. Tin cậy: Vừa |
| chung | Bậc trên trong nhà → con cháu | 아버지, 어머니 | cha/mẹ – con | con – cha/mẹ | Kế thừa. Tin cậy: Vừa |
| chung | Anh chị em ruột | 형님, 누님, 오라버니 | huynh/tỷ – đệ/muội | | Sageuk dùng Hán Việt. Lưu ý 형님 có thể là chị dâu (người gọi là nữ): bản dịch Việt của *Người ăn chay* đã nhận nhầm vai người nói ở một chỗ ([Đỗ Thúy Hằng 2026]), nên **phải có giới tính người nói**. Tin cậy: Vừa |
| chung | Kẻ thù | 네놈, 이놈 | ta – ngươi | | Thô: "lão tử – tên nhãi" khi bản gốc thô. Tin cậy: Vừa |
| Hàn | Bề tôi → vua Joseon | 신, 소신 + 전하 | thần – điện hạ | | 전하 cho vua; 소신 là khiêm xưng "thần" ([Wikipedia: Korean honorifics], [Talking Cupboard]). "Điện hạ" cho vua là cách đặt Hán Việt sát chữ; "bệ hạ" là phương án nếu độc giả đã quen. Tin cậy: Vừa |
| Hàn | Vua Joseon → bề tôi (과인) | 과인, 경 | ta – khanh | thần – điện hạ | 과인 là tự xưng của vua; mặc định "ta" theo quyết định "我 → ta", "quả nhân" chỉ cho diễn văn trang trọng. Không dùng "trẫm". Tin cậy: Vừa |
| Hàn | Hoàng đế (Đại Hàn Đế quốc, Goryeo đầu) | 짐, 폐하 | trẫm – khanh | thần – bệ hạ | 폐하 cho hoàng đế ([Talking Cupboard]); 짐 → "trẫm". Tin cậy: Vừa |
| Hàn | Bề tôi → thế tử | 저하 | thần – điện hạ | | 저하 chuyên cho thế tử; đặt "thế tử điện hạ" lần đầu, sau đó "điện hạ". Tin cậy: Vừa |
| Hàn | Người dưới → quan (나리, 대감) | 소인 + 나리, 대감 | tiểu nhân – đại nhân | | 나리 cho quan dưới hàng đại giám, dân gọi quý tộc; 대감 = "His Excellency" ([Talking Cupboard], [Wikipedia: Korean honorifics]). "Tiểu nhân" cho nam, chưa có đối ứng nữ đã kiểm (쇤네). Tin cậy: Thấp |
| Hàn | Người hầu → chủ nhà (마님, 도련님, 아가씨) | 마님, 도련님, 아가씨 | tiểu nhân – phu nhân | | Vợ chủ → phu nhân, con trai → cậu chủ, con gái → cô chủ/tiểu thư. Tin cậy: Thấp |
| Hàn | Phi tần, nội quan → vương hậu (중전마마) | 중전, 마마 | thần – nương nương | | 중전 = vương hậu ([Talking Cupboard]); "trung cung" chỉ khi bản gốc nhấn vị trí. Tin cậy: Thấp |

Nên bỏ: dòng "sư phụ → đồ đệ" và "tu sĩ ngang hàng" của `zh-ancient` (không có trong sageuk); dòng "chủ cung → cung
nữ" (đã gộp với "cung nữ, nô tỳ → chủ", chiều ngược).

### 3.4 game (hunter, Gate, hầm ngục, hồi quy trong thế giới hệ thống)

11 dòng: 5 chung + 6 Hàn. Bối cảnh này hiện đại, nên các quan hệ đời thường lấy từ 3.1; bảng này chỉ có dòng
đặc thù. Cửa sổ hệ thống `[...]` giữ khung và số, văn trung tính [Repo, `korean()`].

| Loại | Quan hệ | Tín hiệu | Thuận | Ngược | Ghi chú và độ tin cậy |
| --- | --- | --- | --- | --- | --- |
| chung | Đồng đội cùng tổ đội | tên, 반말 | tôi – cậu | | Lược đại từ nhiều. Tin cậy: Thấp |
| chung | Người chơi/thợ săn ↔ NPC, hệ thống | thông báo hệ thống | (không đại từ) | | Văn trung tính. Tin cậy: Thấp |
| chung | Boss, quái thông minh → thợ săn | 네놈, 인간 | ta – ngươi | | Ngoại lệ có chủ đích. Tin cậy: Thấp |
| chung | Thợ săn mạnh ↔ yếu | rank khác nhau | giữ theo tuổi, không theo rank | | Rank không quyết định cặp. Tin cậy: Thấp |
| chung | Kẻ thù, tội phạm | 네놈 | tôi – anh | | Gắt bằng lời lẽ. Tin cậy: Thấp |
| Hàn | Thợ săn trẻ → thợ săn lớn tuổi thân (형, 누나) | 형, 누나, 이름 + 형 | em – anh/chị | anh/chị – em | Kế thừa mục 3.1. Tin cậy: Vừa |
| Hàn | Thợ săn → hội trưởng, trưởng đội (길드장님, 협회장님, 팀장님) | chức danh + 님 | tôi – hội trưởng | tôi – cậu/cô | Chức danh thay đại từ. Tin cậy: Vừa |
| Hàn | Thợ săn → thợ săn khác cấp cao (헌터님) | 헌터님, 이름 + 님 | tôi – anh/chị + tên | | 님 nối với "Hunter" kiểu dịch vụ; "thợ săn" theo glossary. Tin cậy: Thấp |
| Hàn | Thợ săn trẻ → tiền bối trong hiệp hội (선배) | 선배(님) | em – anh/chị | | Theo mục 3.1. Tin cậy: Vừa |
| Hàn | Người hồi quy ↔ người đã biết trong kiếp trước | 회귀, 전생, tên cũ | giữ cặp của dòng thời gian đang kể | | Chỉ đổi theo mốc nguyên tác. Tin cậy: Thấp |
| Hàn | Người lạ lớn tuổi (아저씨, 아줌마, 어르신) | 아저씨, 아줌마 | tôi – chú/cô/bác | | Theo tuổi [Suy]. Tin cậy: Thấp |

Nên bỏ: dòng "giới giải trí" cho game; tách riêng dòng "cấp trên trong tổ chức" khỏi "hội trưởng" vì cùng cặp.

## 4. Quy ước riêng cho Hàn ở profile ngôn ngữ

### 4.1 Hiện có (`korean()`) và còn thiếu

`korean()` đã có: đuôi lịch sự → tiểu từ, 너/당신 không quyết định cặp, 말 놓다 là mốc, tên Latinh, cửa sổ hệ
thống [Repo]. Tôi xác nhận cả năm dòng đều có nguồn (mục 1.1). Còn thiếu:

1. **Giọng nói (speech level) là tín hiệu, không phải cặp.** Ghi trong dữ liệu 존댓말/반말/해체 (và nửa kính) là
   tín hiệu giọng giống `お前` ở bộ ja. Cột "tín hiệu" của dòng bảng chỉ ghi mức nói, không ghi cặp.
2. **Giới tính người nói và người nghe là đầu vào bắt buộc** cho phân tích xưng hô Hàn: 오빠 (nữ → nam), 형
   (nam → nam), 누나 (nam → nữ), 언니 (nữ → nữ). Thiếu nó thì 형님 bị nhầm chị dâu/anh rể như lỗi đã quan
   sát ở [Đỗ Thúy Hằng 2026]. Nối với lỗi "cô Unya bị gọi thầy" đã ghi ở [xưng hô tiếng Việt](vietnamese-addressing.md).
3. **Tuổi và thâm niên.** Thêm vào thẻ nhân vật năm sinh/tuổi tương đối và gốc của 선배 (trường, công ty, nhóm)
   để chọn "anh/chị" hay "tiền bối". Chỉ có tiền đề ở [hanguljobs], phần dùng là [Suy].
4. **Lược đại từ.** Tiếng Hàn tránh 너/당신 bằng tên, chức danh, thân tộc ([Wikipedia: Korean pronouns]);
   tiếng Việt cũng vậy. Quy tắc "lược khi rõ" của `NAME_ADDRESSING_RULE` đúng với Hàn, không cần thêm.
5. **Cờ chính sách hậu tố riêng cho Hàn** (mục 4.2). Hiện chỉ có `HonorificPolicy` cho Nhật.
6. **Bộ đại từ tiếng Hàn trong `addressingAnalysis`** (thiếu; mục 1.1.9) và **dải Hangul trong `CJK_CHARS_RE`**
   (đã báo ở [văn phong bản dịch](translation-style-research.md) mục 2, chưa kiểm lại ở đây).

### 4.2 Giải mâu thuẫn "anh/chị" và giữ hậu tố

Mâu thuẫn thấy: bảng đề xuất đặt 오빠/형 → "anh" (em – anh), trong khi quyết định 2026-10-04 mặc định **giữ**
hậu tố. Đề xuất tách thành **ba lớp**, mỗi lớp một chế độ; chỉ lớp (a) và (b) liên quan quyết định cũ.

| Lớp | Ví dụ Hàn | Tương đương Nhật trong quy tắc hiện có | Mặc định đề xuất cho Hàn | Lý do |
| --- | --- | --- | --- | --- |
| (a) Hậu tố gắn sau **tên riêng** | -씨, -님 sau tên, -야/-아, -군/-양 | -san, -kun, -chan, -sama | **Việt hóa theo vai** (씨 → anh/chị/cô/cậu + tên hoặc lược; 야/아 → bỏ, gọi trống tên); không ghép lai "anh Min-su-ssi" | Không tìm được nhóm dịch Việt giữ -ssi; nghiên cứu dịch Việt đều nội địa hóa; Wikipedia xếp -ssi ~ Mr./Ms. |
| (b) Từ quan hệ/chức danh **đứng riêng** | 오빠, 형, 누나, 언니, 선배(님), 팀장님, 사장님 | sensei, senpai, onii-chan (dòng 133 của `japanese()`: "dịch theo vai trong cảnh") | **Dịch theo vai** (em – anh/chị; chức danh Việt; "tiền bối" khi tuổi không rõ) | [Phạm Thị Ngọc 2018], [Đỗ Thúy Hằng 2026]: 형님 → anh, 사장님 → giám đốc |
| (c) Danh xưng **cung đình/giai cấp** | 전하, 폐하, 마마, 나리, 대감, 마님 | 殿下, 様 ghép tước | Dịch Hán Việt: điện hạ, bệ hạ, nương nương, đại nhân... | Khớp quyết định cổ trang Trung |

Điểm khớp với quyết định cũ: quy tắc Nhật của Mira **đã** dịch "chức danh hay quan hệ đứng riêng" theo vai
(dòng 133) và chỉ giữ hậu tố sau **tên riêng**. Áp cùng logic cho Hàn thì lớp (b) dịch theo vai là **nhất quán**,
còn lớp (a) là chỗ duy nhất thật sự phân kỳ ("giữ" cho Nhật, "Việt hóa" cho Hàn), nên cần xác nhận.

**Chế độ tùy chọn theo tác phẩm** (đề xuất): ba giá trị, tái dùng khung `HonorificMode`:

- `localize` (mặc định ở lớp a, b, c).
- `keep` bật cho lớp (b): giữ 오빠, 형, 누나, 언니, sunbae nguyên dạng; vẫn không ghép lai ("anh oppa"). Dành cho
  truyện có không khí fandom/idol/học đường kiểu K-drama mà người dịch muốn giữ màu Hàn.
- `custom`: người dịch viết quy tắc, như `hybrid`/`custom` hiện có.

Lý do không đặt `keep` làm mặc định cho (b): (1) không có bằng chứng về thói quen nhóm dịch Việt; (2) nghiên
cứu dịch thuật Việt cho thấy nội địa hóa chiếm ưu thế nhưng cũng nêu rằng nó **mất sắc thái xã hội, ngữ dụng**
([Đỗ Thúy Hằng 2026]) — một cái giá có thật, nên chế độ `keep` phải có sẵn chứ không bỏ.

**Quy tắc đề xuất đưa vào `korean()`** (chỉ nêu ý, không viết mã):

- "Từ thân tộc/chức danh đứng riêng dịch theo vai và tuổi; hậu tố gắn sau tên (-ssi, -nim, -ya) không giữ, bỏ hoặc
  chuyển thành anh/chị/cô/cậu + tên; không ghép lai."
- "존댓말/반말 là giọng; đổi giọng giữa cảnh thể hiện bằng từ ngữ và tiểu từ, đổi cặp chỉ ở mốc (말 놓다, tỏ tình,
  nhập môn...)."
- "Gọi 오빠/형 cần biết giới người nói; không dùng với người lạ."
- "당신 giữa vợ chồng là thân; 당신 gay gắt thể hiện bằng lời lẽ; lược đại từ nếu tên hay danh xưng đã rõ."
- "Sageuk Joseon: vua tự xưng 과인 (ta); trẫm chỉ khi bản gốc là 짐 của hoàng đế."

## 5. Tín hiệu nhận diện văn hóa Hàn

Văn hóa gốc ≠ ngôn ngữ văn bản: truyện Hàn đọc qua bản Anh vẫn giữ nhiều từ phiên âm [Repo: ngữ cảnh dự án].

### 5.1 Trong văn bản gốc (Hangul)

- Từ xưng hô: 오빠, 형(님), 누나, 언니, 선배(님), 후배, 동생, 막내, 아저씨, 아줌마, 어르신.
- Hậu tố: -님, -씨, -야/-아, -군/-양; chức danh + 님: 팀장님, 과장님, 부장님, 사장님, 대표님, 회장님.
- Tín hiệu giọng: đuôi -요, -습니다, -어/-아 (반말), -ㅂ니다.
- Dải Unicode Hangul (U+AC00–U+D7A3, U+1100–U+11FF, U+3130–U+318F); dấu thoại `"` ngoặc thẳng hay `“”`.
- Sageuk: 전하, 폐하, 마마, 대감, 나리, 소인, 신첩, 과인, 짐, 중전, 상감, 저하.

### 5.2 Trong bản dịch Anh/Latin

Từ phiên âm còn sót là dấu hiệu mạnh nhất vì chúng được giữ nguyên trong bản Anh của truyện Hàn:

| Nhóm | Dấu hiệu | Trọng số gợi ý |
| --- | --- | --- |
| Quan hệ | oppa, hyung, hyung-nim, noona, unnie, sunbae, sunbae-nim, hoobae, maknae, ahjussi, ahjumma | Mạnh |
| Hậu tố | -nim, -ssi, -ya/-ah, -gun, -yang | Vừa (-ya, -ah nhiễu với tiếng Anh) |
| Chức danh | sajang-nim, bujang-nim, gwajang-nim, hoejang-nim, daepyo-nim, team leader-nim | Mạnh |
| Bối cảnh | chaebol, hunter + Gate/dungeon, regressor, possessed, "the System", guild master, awakened | Vừa (khái niệm chung của web novel) |
| Sageuk | jeonha, mama, daegam, gwain, sinchop, "Your Highness" + Joseon | Mạnh |
| Địa danh/thể loại | Joseon, Goryeo, Seoul, Gangnam | Vừa |

Từ vựng cụ thể trên là danh sách hợp lý của người soát, **[Suy]**, chưa đo trên kho truyện; chỉ xác nhận
được các thuật ngữ Gates/hunters/rank E–S/guild của *Solo Leveling* từ [Wikipedia: Solo Leveling]. Cách phát hiện
ít sai nhất: đếm số lần xuất hiện của từ ở bảng và cần ít nhất hai nhóm khác nhau cùng xuất hiện; người dùng
ghi thẳng văn hóa thì thắng, đúng cách mã `[ja-fantasy]` hiện nay.

### 5.3 Hợp với kiến trúc mở

Mỗi văn hóa gồm: `id`, danh sách ngôn ngữ nguồn thường gặp, bộ tín hiệu (hai danh sách: Hangul, Latin),
bộ dòng bảng riêng theo bối cảnh, và ba dòng quy ước ngôn ngữ. Thêm văn hóa mới = thêm một bản ghi, không sửa lõi.
Đây là phần kiến trúc, chưa viết thành thiết kế.

## 6. Câu hỏi mở cho chủ sản phẩm

1. **Phạm vi quyết định 2026-10-04:** "giữ hậu tố" áp cho hậu tố gắn sau tên (-ssi, -nim) của tiếng Hàn không,
   hay chỉ cho tiếng Nhật? Đề xuất mục 4.2: Việt hóa -ssi, giữ lớp chọn `keep` cho 오빠/형/선배.
2. **오빠/형 mặc định:** "anh" (em – anh) hay giữ nguyên "oppa/hyung"? Đề xuất mặc định "anh", có công tắc theo
   tác phẩm. Đây là điểm nhạy nhất với độc giả webtoon; tôi không có dữ liệu về thói quen của họ.
3. **선배:** "tiền bối" hay "anh/chị" khi tuổi chưa rõ? Đề xuất "tiền bối" khi gọi trống, "anh/chị" khi đã biết
   tiền bối lớn tuổi hơn.
4. **Vua Joseon:** "điện hạ" (sát chữ 전하) hay "bệ hạ" (độc giả quen cổ trang Trung)? Tìm được một dấu vết
   thị trường: tên phim *Dưới Bóng Điện Hạ* dùng "điện hạ" cho vua Danjong ([elle.vn], chỉ là tiêu đề, không phải
   quy ước).
5. **Nhân viên → sếp:** "tôi" hay "em"? Đây vốn đã là câu hỏi mở ở vietnamese-addressing.md (chưa có nguồn bản
   dịch fan); tôi vẫn không tìm được.
6. **"Trẫm" cho 짐:** có chấp nhận ở fantasy Hàn dù `ja-fantasy`/`en-western` tránh không? Đề xuất: chỉ khi
   bản gốc là 짐.
7. **Thẻ nhân vật:** có thêm năm sinh/thâm niên và giới tính bắt buộc cho truyện Hàn (mục 4.1) không?
8. **Bảng game:** có dựng bảng riêng, hay chỉ dùng bảng modern cộng các dòng 3.4? Hiện chưa có dữ liệu thử.

## 7. Nguồn

Ngày truy cập: 2026-10-23. Ghi chú cách đọc đi kèm từng nguồn.

- **[Phạm Thị Ngọc 2017]** Phạm Thị Ngọc, "Vai giao tiếp của kính ngữ tiếng Hàn trong mối tương quan với tiếng
  Việt", *Tạp chí Khoa học Ngoại ngữ* số 51 (6/2017), HANU.
  https://journals.hanu.edu.vn/tckhnn/article/download/537/440/815 . Tải được bằng curl bỏ kiểm chứng chứng chỉ
  (WebFetch báo lỗi chứng chỉ); chỉ dùng phần tóm tắt tiếng Việt/Anh vì phông bị hỏng khi trích.
- **[Phạm Thị Ngọc 2018]** Phạm Thị Ngọc, "Kính ngữ tiếng Hàn và các phương tiện biểu hiện tương đương trong tiếng
  Việt", luận án tiến sĩ ngôn ngữ học, Học viện Khoa học xã hội, Hà Nội, 2018 (người hướng dẫn GS.TS Nguyễn Văn
  Hiệp). Đọc qua bản đăng SlideShare, nên **nguồn thứ cấp**; chưa kiểm số liệu các bảng 2.3–2.8:
  https://www.slideshare.net/slideshow/luan-an-kinh-ngu-tieng-han-va-bieu-hien-tuong-duong-trong-tieng-viet/234811040
- **[Đỗ Thúy Hằng 2026]** Đỗ Thúy Hằng, "Translation strategies for Korean address terms into Vietnamese (based on
  the Vietnamese translation of *The Vegetarian* by Han Kang)", VNU Journal of Foreign Studies 42(1S), 2026,
  DOI 10.63023/2525-2445/jfs.ulis.5768 . https://jfs.ulis.vnu.edu.vn/index.php/fs/article/download/5768/4713/16584 .
  Đọc bằng `pdftotext`; chữ Hangul và dấu tiếng Việt bị mất nên số liệu (657, 372, tỉ lệ bốn nhóm) kiểm được,
  còn bảng ví dụ từng từ thì không đối chiếu từng chữ.
- **[Han & Chae 2015]** 한승훈, 채서영, "부부 간 대화에 나타난 2인칭 표현의 역동적 사용양상 – 갈등상황과 행동유형을
  중심으로", *언어와언어학* 66, 399–428. Chỉ đọc tóm tắt tiếng Anh:
  https://scholarworks.sogang.ac.kr/item/087d32b6-5889-413f-a2db-40798dc6c832
- **[Wikipedia: Korean honorifics]** https://en.wikipedia.org/wiki/Korean_honorifics (-ssi, -nim, 선배, 형/오빠,
  전하/폐하/저하, 나리, 당신). Nguồn bách khoa mở; bảng kính ngữ có lỗi (xếp 형님 làm kính ngữ của 언니).
- **[Wikipedia: Korean pronouns]** https://en.wikipedia.org/wiki/Korean_pronouns (당신, 너, 자네; lược đại từ).
  Không có 자기 và 여보.
- **[Wikipedia: Solo Leveling]** https://en.wikipedia.org/wiki/Solo_Leveling (Gate, hunter, rank E–S, guild).
  Không bàn kính ngữ.
- **[Talking Cupboard]** Sageuk Glossary, https://thetalkingcupboard.com/resources/sageuk-glossary/ (과인, 짐, 신첩,
  소신, 소인, 나리, 대감, 마마, 전하, 폐하, 저하, 마님, 도련님, 아가씨, 중전). Blog của người hâm mộ, không phải
  nguồn học thuật.
- **[Soompi]** https://www.soompi.com/article/1148307wpp/your-palace-dictionary-20-must-know-sageuk-vocab-words
  (전하, 마마, 대비, 대감, 폐하). Nguồn báo giải trí.
- **[elon.io]** https://elon.io/grammar/korean/honorifics/malnota-transition (말 놓다) và
  https://elon.io/grammar/korean/nouns/pronoun-you-neo-dangsin (당신). Trang học ngôn ngữ.
- **[hanguljobs]** https://hanguljobs.com/blog/van-hoa-sunbae-hubae-cong-ty-han-quoc-huong-dan-vi-s28k8r6
  (선배/후배, chức danh + 님, 씨). Blog tuyển dụng.
- **[tanvietprime]** https://tanvietprime.edu.vn/oppa-tieng-han/ (bốn nghĩa của oppa);
  **[lophoctienghan]** http://lophoctienghan.edu.vn/y-nghia-cua-oppa-hyung-noona-unnie.html (bảng giới tính
  người nói/nghe, chỉ đọc qua kết quả tìm kiếm). Trung tâm dạy tiếng Hàn.
- **[namu: 짐]** https://namu.wiki/w/%EC%A7%90(%EB%8C%80%EB%AA%85%EC%82%AC) , **[Seoul Shinmun]**
  https://www.seoul.co.kr/news/2002/08/19/20020819015004 (각하). Chỉ đọc đoạn tóm tắt trong kết quả tìm kiếm
  (namu.wiki trả 403 khi tải trực tiếp); độ tin cậy trung bình, nên coi là gợi ý.
- **[elle.vn]** https://www.elle.vn/the-gioi-van-hoa/lich-su-vua-danjong-duoi-bong-dien-ha/ (tiêu đề "Dưới Bóng
  Điện Hạ"); chỉ đọc qua tóm tắt tìm kiếm.
- Kubera wiki (https://kubera.fandom.com/wiki/Honorifics) và hardcorelevelingwarrior fandom: trả HTTP 402;
  thông tin "Kubera dịch -ssi thành Mr./Ms." chỉ lấy từ đoạn trích của kết quả tìm kiếm, **không đọc được trang**.
- [Repo]: `src/main/services/ai/translate/languageProfiles.ts` (hàm `korean()`, `honorificLines()`),
  `src/shared/contracts/addressingPresets.ts` (cấu trúc `PresetRow`, `ja-*`/`zh-*`/`en-western`),
  `src/main/services/ai/addressingAnalysis.ts` (dòng 49–50), [xưng hô tiếng Việt](vietnamese-addressing.md),
  [văn phong bản dịch](translation-style-research.md) (mục Hàn). `translation-run-2026-10-22.md` không có nội dung
  nào về tiếng Hàn.

[Về module Ngữ cảnh](README.md)
