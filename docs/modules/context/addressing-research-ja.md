# Xưng hô cho truyện văn hóa Nhật: nghiên cứu

Cập nhật: 2026-10-23 · Trạng thái: nghiên cứu, chưa phải quyết định

Phạm vi: văn hóa gốc **ja** (light novel, web novel, isekai, otome/akuyaku, học đường, công sở,
yakuza, cung đình kiểu Nhật hoặc kiểu Hoa do tác giả Nhật viết) trong các bối cảnh `modern`, `fantasy`,
`court`, `game`; `cultivation` chỉ nhắc ở mục 2.5. Đọc cùng [xưng hô tiếng Việt](vietnamese-addressing.md)
(quyết định đã chốt; tài liệu này **không** mâu thuẫn với chúng, chỗ nào phản biện thì ghi rõ là "phản
biện"), [nghiên cứu văn phong](translation-style-research.md), [soát task 2026-10-22](translation-run-2026-10-22.md)
và [nghiên cứu văn hóa west](addressing-research-west.md).

Nhãn: **[Nguồn n]** có URL ở mục 6, đã đọc ngày 2026-10-23 (nếu chỉ đọc được tóm tắt của công cụ tìm kiếm thì
ghi "yếu"); **[Repo]** đọc từ mã hoặc tài liệu repo; **[Suy]** suy từ kiến thức của người soạn, chưa kiểm
chứng. Công cụ tìm kiếm trả về rất ít nguồn học thuật hay quy chuẩn dịch Nhật–Việt; chỗ nào không tìm được
thì ghi ở mục 1.4, không điền bằng trí nhớ.

Quy ước bảng ở mục 2: dấu `[a | b]` là **ô điền theo thẻ nhân vật** (giới tính, tuổi, bên nội/ngoại),
không phải hai lựa chọn phong cách; mỗi ô chỉ có một cặp. "Lớp": **Chung** = dòng chung của bối cảnh, áp
cho mọi văn hóa; **Nhật** = dòng riêng văn hóa Nhật (phụ thuộc tín hiệu hoặc cơ chế chỉ có ở tiếng Nhật).
"Tin cậy": **Cao** = đã chốt trong repo hoặc có nguồn đọc trực tiếp; **TB** = suy từ nguồn gián tiếp;
**Thấp** = chỉ [Suy]. Phần "Chung" do nghiên cứu Nhật đề xuất, cần đối chiếu với nghiên cứu ko/zh/west
trước khi chốt.

## 1. Tóm tắt phát hiện

### 1.1 Đã xác minh

1. **Tiếng Nhật né đại từ ngôi hai, tiếng Việt thì bắt buộc có từ xưng hô.** Wikipedia: dùng đại từ "bạn" bị
   coi là thô, người Nhật thường gọi bằng họ + -san hoặc chức danh [Nguồn 4]; bài đối chiếu công sở của Cáp
   Thị Ngọc Huyền (2024) kết luận trong tiếng Nhật ở mọi tình huống có thể lược đại từ, còn tiếng Việt
   "luôn luôn phải có từ xưng hô", và cấp dưới Việt Nam tự xưng "em/cháu" kèm "anh/chị + tên" cho đồng
   nghiệp lớn tuổi, còn "tôi" giữ cho người cùng hoặc cao cấp, vì "tôi" tạo khoảng cách [Nguồn 2]. Hệ quả:
   việc lược đại từ và chọn cặp theo quan hệ (quyết định 2 trong `vietnamese-addressing.md`) có căn cứ; nhưng
   bài của Huyền dùng phim truyền hình hai nước, **không phải nghiên cứu dịch**.
2. **Quan hệ họ hàng tiếng Việt phân bên nội/ngoại, tiếng Nhật thì không.** Wikipedia: cậu là anh/em trai của
   mẹ, dì là chị/em gái của mẹ, bác là anh/chị của cha, chú là em trai của cha, cô là chị/em gái của cha, mợ
   là vợ cậu, thím là vợ chú; nghĩa chính xác khác nhau theo phương ngữ Bắc/Nam [Nguồn 1]. おじさん/おばさん
   trong tiếng Nhật không mã hóa bên cha/mẹ và còn dùng cho người lạ trung niên [Nguồn 18, yếu]. Nhận định của
   vòng soát trước ("thiếu dòng họ hàng") **đúng**.
3. **"Cậu" ngôi hai dễ nhầm với "cậu" thân tộc.** Cũng theo [Nguồn 1], "cậu" là từ gọi bạn/đồng nghiệp ngang
   hàng ở miền Bắc, đồng thời là người em trai của mẹ. Bộ `ja-modern` dùng "tôi – cậu" làm mặc định cho cả
   học đường lẫn thầy cô xa cách [Repo]; khi truyện có nhân vật là cậu ruột của người kể thì hai nghĩa va vào
   nhau. Rủi ro **có thật**, nhưng chưa có mẫu lỗi nào trong các lần chạy đã ghi ([Repo], chưa đo).
4. **Hai dòng hôn phu của `ja-fantasy` đưa "ta" vào fantasy phương Tây: đúng như vòng soát nói, và tự mâu thuẫn
   với luật của bộ.** Bộ ghi "ta – ngươi chỉ ở nghi lễ và phản diện" nhưng dòng "Hôn phu → hôn thê" cho "ta –
   nàng nếu giọng trang trọng" và dòng "Hôn phu thô" cho "ta – cô" [Repo]. Người dịch Tearmoon từ chối lối
   xưng hô "phong kiến Á Đông" vì truyện "theme kiểu phương Tây" [Nguồn 10]; bản dịch fan Hamefura trộn "anh –
   nàng" với "ta – nàng" [Repo]. Chưa có nguồn nói "ta – nàng" **sai** ở fantasy; căn cứ chỉ là sự mâu thuẫn
   nội bộ và thiên hướng của người dịch.
5. **Dòng hầu gái mơ hồ về ai xưng "em": đúng, và đã có triệu chứng thật.** Ô "Hầu gái, quản gia → chủ" ghi
   "chủ nhỏ tuổi: em – chị" nằm cạnh "thiếu nữ nhỏ tuổi gắn bó với chủ: em – tiểu thư" [Repo]; giả thuyết T3 trong
   mục 5b của `vietnamese-addressing.md` cho rằng chính dòng này kéo model ra "em" (13/26 câu Rion → Milly),
   **chưa kiểm chứng bằng thí nghiệm**. Bài của Huyền xác nhận "em" là từ của vai dưới/nhỏ tuổi [Nguồn 2],
   nên "em" ở chiều chủ → hầu mà chủ lớn hơn là sai hướng.
6. **Nhiều ô hiện có hai lựa chọn** [Repo]: `ja-modern` ("tôi – cậu hoặc tao – mày", "tôi / em – anh / chị /
   sếp", "cô / thầy – em ... hoặc tôi – cậu"), `ja-fantasy` ("ta – cậu / cô hoặc tôi – cậu", "ngài / cô",
   "ta – ngươi hoặc tôi – cậu" ở `ja-court`). Model phải tự chọn, và theo [Repo] chính chỗ model tự điền là chỗ
   lỗi xưng hô sinh ra. Đề xuất ở mục 2 dồn mọi nhánh về một cặp, nhánh còn lại thành điều kiện kích hoạt.
7. **Thiếu dòng cho vợ chồng, công sở, yakuza, party, khế ước**: đúng với `ja-*` hiện tại [Repo]
   (`ja-modern` có "Sếp ↔ nhân viên" nhưng không có vợ chồng, đồng nghiệp ngang cấp, yakuza). Idol thì không
   cần dòng riêng (xem 2.1).
8. **Đại từ ngôi hai tiếng Nhật không có đối ứng một–một.** Wikipedia: あなた có thể nghe trịch thượng với
   cấp trên và là lời vợ gọi chồng; 君 dành cho cấp dưới hoặc thân mật, có thể bất nhã với cấp trên/người
   lạ; お前 rất thô với người lớn tuổi; 貴様/てめえ là thù địch [Nguồn 4]. Khớp quyết định 2 (đại từ nguồn là
   tín hiệu giọng, không phải bảng đổi chữ) và ghi chú cho lỗi 貴様 → "ngươi" trong task "New" [Repo].
9. **Kính ngữ dịch hay giữ: không có chuẩn.** Nhân viên J-Novel Club đứng về phía dịch/bỏ hậu tố vì khách mới
   dễ bỏ đi hơn người hâm mộ tẩy chay; người dùng diễn đàn chia rẽ: -san dễ bỏ, senpai nên giữ, -sama khó [Nguồn
   7]. Bài blog Việt (Feilunhai 2012) khuyên đổi hậu tố sang cô/cậu/chú/anh và **không ghép chồng** như "Anh
   Ninomiya san" [Nguồn 9]. Khớp mặc định giữ của Mira (2026-10-04) và luật không ghép lai [Repo]. Cuộc thăm dò
   của NovelUpdates (37,2% giữ hết, 27,9% giữ hậu tố còn lại dịch, 34,9% dịch hết) chỉ đọc được tóm tắt tìm
   kiếm [Nguồn 8, yếu].
10. **Giọng "vai nói" (役割語) là cơ chế có thật và ổn định**: Kinsui đặt tên năm 2003; わし…じゃ là giọng ông
    già (gốc Edo), わたくし…ますわ là giọng tiểu thư, ぼく/おれ là nam, わたし/あたし là nữ [Nguồn 11]. Bài
    mới của Kanetani (2026) cho thấy người Nhật đọc lời dịch gượng gạo như một "vai" [Nguồn 12]. Hệ quả: giữ khác
    biệt giọng bằng từ và tiểu từ tiếng Việt nhất quán (đã có trong profile) là đúng hướng.
11. **Chức danh hoàng tộc Nhật có từ Hán Việt đối ứng trực tiếp**: 陛下 heika (Thiên hoàng, hoàng hậu), 殿下
    denka (hoàng tử, công chúa khác), 閣下 kakka (nguyên thủ, quan cao) [Nguồn 3]; đọc sang Hán Việt là bệ hạ,
    điện hạ, các hạ [Suy]. Đây là lý do `ja-fantasy` dùng "thưa Điện hạ / Bệ hạ" mà không cần mượn "thần".

### 1.2 Bị bác hoặc phải thu hẹp

1. **Bác: "thần" cho hoàng tộc trong fantasy** vẫn bị loại, nhưng không phải vì vòng soát mà vì quyết định đã
   chốt; không đổi.
2. **Thu hẹp: "em" trong bảng mặc định của hầu gái.** Quyết định fantasy cho "em khi là thiếu nữ nhỏ tuổi gắn
   bó với chủ". Đề xuất (phản biện hẹp, cần chủ sản phẩm duyệt): giữ nguyên quyết định nhưng **chuyển "em" khỏi
   bảng mặc định, chỉ kích hoạt khi thẻ nhân vật có tuổi/quan hệ phù hợp hoặc cặp đã duyệt**, vì ô mặc định đã
   làm model tự bịa "em" (T3, [Repo]).
3. **Bác: nhu cầu dòng riêng cho idol.** Ở nguồn Nhật, quan hệ idol–fan, idol–producer rơi vào "người lạ",
   "đàn em/đàn anh" hoặc "sếp ↔ nhân viên"; không tìm được nguồn nào cho thấy cần cặp riêng. Giữ tín hiệu
   trong mục 3, không thêm dòng.
4. **Bác: "ta – nàng" cho hôn phu ở fantasy** (xem 1.1 mục 4), nhưng **giữ** "ta – nàng" ở `court`, nơi quyết
   định "Cổ trang Trung" đã chốt cho người yêu.
5. **Bác: "tôi – cậu" làm cặp chung cho mọi thầy cô.** Quyết định 2026-10-14 đã nói rõ thầy cô lịch sự là
   "thầy/cô – em"; ô "tôi – cậu khi quy ước nhân vật đã chốt" trong `ja-modern` chỉ là lối thoát và nên thành
   cặp đã duyệt, không nằm trong bảng.

### 1.3 Còn mở

- Cấp dưới nói với sếp: "tôi" hay "em" (đã là câu hỏi mở trong `vietnamese-addressing.md` mục 6; bài của
  Huyền cho thấy cả hai tồn tại trong công sở Việt, "em" thân hơn). Đề xuất tạm dùng "tôi".
- Nô lệ/khế ước thú → chủ: "tôi" hay "em" (xem 2.4).
- Cung đình Nhật bản địa (Heian, Sengoku, Edo) có cần dòng riêng không (xem 2.3).
- Nhân vật cổ nói のじゃ/我/汝: cho phép "ta – ngươi" ngoài nghi lễ và phản diện hay không (xem 2.2, 2.4).
- Chính sách hậu tố mặc định cho `fantasy` và `court` (giữ hay Việt hóa), đã nằm trong mục 6 của tài liệu chốt.

### 1.4 Không tìm được (không bịa)

- Nghiên cứu học thuật về **dịch** đại từ/xưng hô Nhật → Việt cho tiểu thuyết: không tìm thấy. Tìm thấy bài của
  Vũ Minh Hiền (2024, Tạp chí Khoa học Ngoại ngữ, ĐHQGHN, "Đối chiếu đại từ nhân xưng tiếng Nhật với tiếng Việt
  nhằm mục đích dạy/học dịch") qua kết quả tìm kiếm, nhưng trang tạp chí lỗi chứng chỉ khi tải nên **chưa đọc
   nội dung** [Nguồn 15, yếu]. Đây là nguồn đáng đọc nhất còn lại.
- Hướng dẫn dịch của IPM, Kim Đồng, Thái Hà, Hikari hoặc nhóm dịch lớn về kính ngữ/xưng hô: không tìm thấy.
  Kim Đồng ra bản Dược Sư Tự Sự và Sonako có "quy chuẩn dịch thuật" cho bộ này nhưng trang trả lỗi 402, chỉ
  thấy tiêu đề [Nguồn 17, yếu].
- Quy ước dịch yakuza (組長, 親分, 兄貴) sang tiếng Việt: không tìm thấy; chỉ có nghĩa gốc [Nguồn 14].
- Chính sách ojou-sama / "tiểu thư" của nhóm dịch hay NXB: không tìm thấy.
- Nguồn về cách dịch の じゃ / わたくし sang tiếng Việt: không tìm thấy. Có luận văn Leiden về dịch 役割語 sang
  tiếng Anh nhưng trang không tải được nội dung [Nguồn 13, yếu].
- Dữ liệu về lỗi xưng hô của LLM dịch Nhật → Việt: chỉ có Lab của Mira [Repo].

## 2. Bảng đề xuất theo cặp (bối cảnh × văn hóa Nhật)

Cột: `relation` (A → B), `signals`, `forward` (A tự xưng – A gọi B), `backward` (B tự xưng – B gọi A, khi
khác), `notes`. Đa số giá trị lấy từ bảng `ja-*` hiện có và quyết định đã chốt; chỗ đổi được đánh dấu
**(đổi)** kèm lý do.

### 2.1 `modern` (nên giữ 12 dòng sau khi bỏ dòng 3 và 7)

| # | relation | signals | forward | backward | notes | Lớp | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Bạn đồng lứa, chưa thân | 俺/僕 + 苗字(くん/さん) | tôi – cậu | tôi – cậu | Chốt 2026-10-05 [Repo]. "Cậu" va với cậu ruột: khi cùng truyện có cậu ruột thì chỉ người đó mới là "cậu" thân tộc, bạn đồng lứa dùng tên | Chung | Cao |
| 2 | Bạn thân, nói thô | 俺 + お前, gọi trống tên | tao – mày | tao – mày | Chỉ vai phụ ồn ào, côn đồ hoặc cặp thân lâu năm cùng thô; không gán cho nhân vật chính (đã chốt). **(đổi)** bỏ "tôi – cậu hoặc" khỏi ô, vì chỗ đó đã là dòng 1 | Nhật | TB |
| 3 | Bạn nữ – nữ, nam ↔ nữ là bạn | あたし/私 + 名前, ちゃん | tớ – cậu | tớ – cậu | **Nên bỏ**: gộp vào dòng 1 bằng ghi chú "nữ: tớ – cậu"; zh-modern cũng dùng tớ – cậu [Repo] | Chung | TB |
| 4 | Người yêu đã xác nhận | đã tỏ tình và gọi trống tên | anh – em | em – anh | Cần cả hai tín hiệu; chưa đủ thì giữ cặp bạn bè (đã chốt) | Chung | Cao |
| 5 | Vợ chồng | あなた (vợ gọi chồng), 名前, 旦那/嫁 (ngôi ba) | anh – em | em – anh | 旦那/主人/嫁 ngôi ba dịch "chồng tôi", "vợ tôi", không dịch "ông chủ". あなた giữa vợ chồng là cách gọi phổ biến [Nguồn 5, yếu]; đại từ cặp anh–em là chuẩn vợ chồng Việt [Suy]. **(mới)** | Chung | TB |
| 6 | Đàn em → đàn anh, đàn chị (先輩) | 先輩 + kính ngữ | em – senpai | anh / chị – em | Giữ "senpai" theo chính sách mặc định; chính sách Việt hóa: "anh / chị + tên". 後輩 không bao giờ là cách gọi [Nguồn 3]. **(đổi)** bỏ "hoặc giữ senpai" khỏi ô; công tắc nằm ở chính sách hậu tố; "tao – mày" thành điều kiện cặp thô | Nhật | TB |
| 7 | Thầy cô → học trò, xa cách/thô | 私 + お前/君, 苗字 | cô / thầy – cậu | em – cô / thầy | Cặp Unya → Akira là cặp đã duyệt, không phải mặc định [Repo]. **Nên bỏ** khỏi bảng, giữ làm ví dụ trong quy ước | Nhật | Cao |
| 8 | Thầy cô → học trò, lịch sự (và học trò → thầy cô) | 先生 + kính ngữ | cô / thầy – em | em – cô / thầy | Chốt 2026-10-14. 先生 là chức danh chung cho thầy cô, bác sĩ, luật sư, nghệ nhân [Nguồn 3]: dịch theo nghề trong cảnh (thầy/cô, bác sĩ), không dịch máy móc "tiên sinh". Bùng nổ (あんた): "tôi – cô / thầy" là điều kiện cặp thô | Chung | Cao |
| 9 | Sếp → nhân viên | 君, 苗字くん/さん + 役職 | tôi – cậu \| cô | tôi – [chức danh] | Nhật gọi cấp trên bằng chức danh (±họ) và không dùng さん với chức danh [Nguồn 19, yếu]; Việt gọi bằng kinship [Nguồn 2]. **(đổi)** ô cấp dưới → sếp chọn một cặp "tôi", bỏ "em"; "em" chỉ cho cặp đã duyệt (câu hỏi mở). お前 của sếp là tín hiệu thô, không tự thành "mày" | Nhật | Thấp |
| 10 | Đồng nghiệp ngang cấp, người lạ | あなた + 敬語, 苗字さん | tôi – anh \| chị \| cô \| cậu theo tuổi + tên | tôi – anh \| chị \| cô \| cậu theo tuổi + tên | Không dùng "bạn" (đã chốt). Nhân viên phục vụ → khách (お客様): "tôi – quý khách", nhiều nhất một "ạ" | Chung | Cao |
| 11 | Họ hàng bậc trên ↔ cháu (chú, bác, cậu, dì, cô) | おじさん/おばさん, 叔父/伯父 | cháu – [chú \| bác \| cậu \| dì \| cô] | [chú \| bác \| cậu \| dì \| cô] – cháu | Tiếng Nhật không phân bên; tiếng Việt bắt buộc. Thẻ nhân vật cần trường quan hệ họ hàng (bên nội/ngoại, hơn/kém cha mẹ); thiếu dữ kiện thì gọi bằng tên + "chú/cô" cho nam/nữ và gắn cờ chờ duyệt. **(mới)** | Chung | Thấp |
| 12 | Bố mẹ, ông bà ↔ con cháu | お前/名前, お父さん/おばあちゃん | [bố \| mẹ \| ông \| bà] – con \| cháu | con \| cháu – [bố \| mẹ \| ông \| bà] | Gộp "cha mẹ" với ông bà vì cùng lược đồ. "Ông bà" cần nội/ngoại khi truyện nêu [Nguồn 1] | Chung | Cao |
| 13 | Anh chị em ruột | お兄ちゃん, 姉さん, 名前 | em – anh \| chị | anh \| chị – em | お兄ちゃん dịch "anh" hoặc giữ "Onii-chan" theo chính sách hậu tố; ngoài đời người Nhật còn gọi người lạ lớn hơn một chút là "anh/chị" kiểu này [Nguồn 20, yếu]: đừng suy ra anh em ruột. Anh em trai cãi nhau: "tao – mày" là điều kiện cặp thô, không thuộc ô | Chung | Cao |
| 14 | Kẻ thù, côn đồ | 俺 + てめぇ/貴様 | tao – mày | tao – mày | 貴様 không tự thành "ngươi" ở modern: "ngươi" làm chương 2 của "New" lệch [Repo]; khi nhân vật bề trên giận cấp dưới có quân hàm: "tôi – anh", giọng gằn | Nhật | TB |

Dòng nên bỏ để giữ prompt gọn: **3** (gộp vào 1), **7** (là cặp đã duyệt). Sau khi bỏ còn 12. Dòng có
ngoặc `\|` trong bảng là ô điền theo thẻ nhân vật.

Gói tùy chọn (không nằm trong bảng mặc định, bật khi có tín hiệu): **yakuza/băng đảng**. Tín hiệu:
組長, 親分, 兄貴, 若頭, 舎弟, シマ. Giá trị gợi ý [Suy]: tiểu đệ → thủ lĩnh "em – đại ca" (hoặc giữ
"oyabun"), thủ lĩnh → tiểu đệ "tao – mày" khi có 俺 + お前, ngược lại "tôi – cậu"; 兄貴 = người anh trong nội bộ,
không phải ruột [Nguồn 14]. **Không tìm được** quy ước dịch Việt nào, nên đừng đưa vào bảng mặc định; làm gói
thể loại để người dịch bật.

### 2.2 `fantasy` (quý tộc, isekai, otome/akuyaku; nên giữ 11 dòng sau khi bỏ dòng 3, 12, 14)

| # | relation | signals | forward | backward | notes | Lớp | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Hầu gái, quản gia → chủ | お嬢様/坊ちゃま + kính ngữ, không đại từ | tôi – [tiểu thư \| thiếu gia] | tôi – chị | **(đổi)** bỏ "em" khỏi ô; "em" chỉ khi thẻ nhân vật là thiếu nữ nhỏ tuổi gắn bó (T3, [Repo]). Không dùng "nô tỳ". Kèm "ạ" tối đa một lần mỗi lượt thoại (profile) | Chung | TB |
| 2 | Chủ → hầu gái, quản gia | 私/俺 + 名前/お前 | tôi – chị | tôi – [tiểu thư \| thiếu gia] | Dùng cặp ngược của dòng 1. Chủ lớn tuổi hơn hẳn người hầu: "tôi – cô". Đã dùng trong ca thật: Rion → Milly "tôi – chị" [Repo]. Bỏ dòng này nếu dòng 1 có `backward` | Chung | TB |
| 3 | Vua, hoàng tử → thần dân, nghi lễ | 余/我 + そなた | ta – ngươi | tôi – ngài | Chỉ tầng nghi lễ (phong tước, tuyên bố) [Repo]. **Nên bỏ**: dòng 13 đã bao phủ "ta – ngươi" | Chung | Cao |
| 4 | Vua, hoàng tử → người dưới, thường ngày | 私/僕 + 君/あなた | tôi – cậu \| cô | tôi – ngài | **(đổi)** bỏ "ta – cậu/cô hoặc"; "ta" chỉ ở nghi lễ/phản diện theo luật bộ | Chung | TB |
| 5 | Thần dân, quý tộc → hoàng tộc | 殿下/陛下 + kính ngữ | tôi – ngài, kèm "thưa Điện hạ/Bệ hạ" | tôi – cậu \| cô | Chiều ngược như dòng 4. Không dùng "thần" [Repo, chốt]. 殿下 → "Điện hạ", 陛下 → "Bệ hạ" [Nguồn 3 + Suy] | Chung | Cao |
| 6 | Quý tộc ngang hàng, lịch sự | ～様 + kính ngữ | tôi – ngài \| cô | tôi – ngài \| cô | Hậu tố ～様 phần lớn là màu giai cấp; hai bạn gái: "mình – cậu" (dòng 7). Không ghép lai | Chung | TB |
| 7 | Quý tộc ngang hàng, thân | 俺/僕 + お前/君, nói trống | tôi – cậu | tôi – cậu | Nam rất thân cùng thô: "tao – mày" là điều kiện cặp thô | Chung | TB |
| 8 | Hôn phu → hôn thê, chưa yêu | 僕/私 + 君/あなた | tôi – cô | tôi – ngài | **(đổi)** bỏ "ta – nàng" và "em – ngài": "ta" trái luật bộ và Tearmoon [Nguồn 10]; "em" của hôn thê là nguồn gây lẫn T3. Khóa tới mốc, không trộn "anh … nàng" trong một câu [Repo] | Chung | Thấp |
| 9 | Hôn phu ↔ hôn thê, đã yêu; người yêu | đã tỏ tình, gọi trống tên | anh – em | em – anh | Mốc đổi do truyện, không đổi sớm hơn nguyên tác (chốt). Dòng "Hôn phu thô (俺 + お前)" nhập vào đây: giọng thô thể hiện bằng từ ngữ, không đổi cặp | Chung | Cao |
| 10 | Cha mẹ quý tộc ↔ con; anh chị em | 父上/お父様, お兄様 | cha \| mẹ – con; em – anh \| chị | con – cha \| mẹ; anh \| chị – em | Không dùng "ta" cho cha mẹ với con (Repo, giữ). お兄様 giữ hay dịch theo chính sách hậu tố. Gộp hai dòng cũ thành một | Chung | Cao |
| 11 | Hiệp sĩ, cận vệ → chủ | 私 + 殿下/お嬢様 + kính ngữ | tôi – [điện hạ \| tiểu thư] | tôi – [tên] | Chỉ cận vệ trực thuộc mới có thể "thần" (đã chốt, ngoại lệ). Có thể gộp vào dòng 1 | Chung | TB |
| 12 | Giáo viên học viện ↔ học sinh | 先生 + kính ngữ | thầy \| cô – em | em – thầy \| cô | Dùng lại dòng 8 của `modern`, **nên bỏ** khỏi bảng fantasy | Chung | Cao |
| 13 | Phản diện, kẻ thù có thân phận | 貴様/お前 + 俺/私/我 | ta – ngươi | ta – ngươi | Bề trên giận cấp dưới: "ngươi", giọng gằn. Côn đồ/dân thường: "tao – mày" là điều kiện, không thuộc ô | Nhật | TB |
| 14 | Nhân vật cổ, hiền giả, rồng, thần | のじゃ, 我, 汝, わし | ta – ngươi | tôi – ngài | Giọng vai (役割語) [Nguồn 11]. Chuyển "ta – ngươi" ra ngoài nghi lễ/phản diện cho nhân vật này là **phản biện** quyết định fantasy: cần chủ sản phẩm duyệt. **Nên bỏ** nếu không duyệt | Nhật | Thấp |

Dòng nên bỏ: **3**, **12**, **14** (nếu không duyệt phản biện). Còn 11 dòng. Nội tâm người chuyển sinh: xem mục 4.

### 2.3 `court` (cung đình kiểu Hoa do tác giả Nhật viết; nên giữ 10 dòng)

Phần lớn dòng chạy chung cho mọi văn hóa vì cung đình Đông Á có hệ xưng hô Hán Việt; điểm riêng của tác
giả Nhật là dùng 私 trơn, kính ngữ -sama, hoặc chữ Nhật cho chức danh cung đình, cần nhận ra để chuyển về Hán
Việt. `ja-court` hiện có 6 dòng [Repo].

| # | relation | signals | forward | backward | notes | Lớp | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Quan lại → vua, hoàng tộc | 陛下/殿下/娘娘 + 敬語 | thần – bệ hạ \| điện hạ \| nương nương | trẫm – khanh | Chỉ ở bối cảnh Á Đông (Repo, chốt) | Chung | Cao |
| 2 | Phi tần → vua | 陛下 + 敬語 | thần thiếp – bệ hạ | trẫm – ái phi | 臣妾 = "thần thiếp" (chốt) | Chung | Cao |
| 3 | Vua → người yêu, riêng tư | ngoài người ngoài | ta – nàng | thiếp – chàng | "Thiếp" chỉ trang trọng/ trước người ngoài (chốt) | Chung | Cao |
| 4 | Cung nữ, nô tỳ → chủ | 奴婢, 娘娘, 敬語 | nô tỳ – nương nương | bổn cung – ngươi | Khác `fantasy`: "nô tỳ" **được dùng** ở đây vì bối cảnh Á Đông. 本宮 → "bổn cung" (profile `chinese()`) | Chung | TB |
| 5 | Phi tần cao cấp → cung nữ | 本宮 | bổn cung – ngươi | nô tỳ – nương nương | Dòng đối xứng của 4, **nên bỏ** (cùng cặp) | Chung | TB |
| 6 | Quan lại ngang hàng | 私 + 敬語 | tôi – đại nhân | tôi – đại nhân | **(đổi)** bỏ "tại hạ hoặc": "tại hạ" là giọng giang hồ, không phải triều đình [Suy] | Chung | Thấp |
| 7 | Hoàng tử, công chúa → vua, hoàng hậu | 父上/母上 + 敬語 | nhi thần – phụ hoàng \| mẫu hậu | trẫm \| ta – con | Giữ Hán Việt; Mira chưa có dòng này [Suy] | Chung | Thấp |
| 8 | Ngang hàng, thân (đồng sự, cung nữ cùng ở) | 俺 + お前, タメ口 | đệ \| muội – huynh \| tỷ | huynh \| tỷ – đệ \| muội | **(đổi)** bỏ "ta – ngươi hoặc tôi – cậu": quyết định cổ trang Trung là kinship Hán Việt, "trừ nhân vật xuyên không kể chuyện" [Repo] | Chung | TB |
| 9 | Kẻ thù, phản diện | 貴様/お前 | ta – ngươi | ta – ngươi | Giữ độ gắt bằng từ ngữ | Nhật | TB |
| 10 | Người kể xuyên không trong cung | 私 (ngôi một, kể) | tôi | tôi | Ngoại lệ theo quyết định: nhân vật xuyên không giữ "tôi" trong lời kể | Chung | Cao |

Dòng nên bỏ: **5** (trùng 4). Còn 9–10.

**Cung đình Nhật bản địa (Heian, Sengoku, Edo)**: chưa có dòng nào trong repo, và không tìm được nguồn dịch
nào. Đề xuất dòng riêng văn hóa Nhật, **tất cả Thấp [Suy]**: gia thần → lãnh chúa (殿, お館様): "tại hạ – chúa
công" (拙者/それがし → "tại hạ" vì Wikipedia ghi 拙者 là từ cổ [Nguồn 4]); lãnh chúa → gia thần: "ta – ngươi";
công chúa (姫様): "công chúa"; vua Nhật tự xưng 朕 → "trẫm". Cần chủ sản phẩm chốt có làm không (mục 5).

### 2.4 `game` (võng du, hệ thống, hầm ngục, mạt thế; nên giữ 10 dòng)

Phần lớn nguồn Nhật ở bối cảnh này là isekai/LitRPG: nhân vật chính vốn là người hiện đại, thế giới dùng giọng
fantasy. Kế thừa `modern` (bạn, người yêu, vợ chồng) và `fantasy` (hoàng tộc, quý tộc) khi cảnh nằm trong cấu
trúc đó.

| # | relation | signals | forward | backward | notes | Lớp | Tin cậy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Đồng đội, mới gặp | 僕/俺 + 苗字/名前 | tôi – cậu | tôi – cậu | Chung với `modern` dòng 1 [Suy] | Chung | TB |
| 2 | Đồng đội thân, cùng party | 俺 + お前 | tôi – cậu | tôi – cậu | Không mặc định "tao – mày"; cặp thô theo thẻ nhân vật | Chung | TB |
| 3 | Tân thủ ↔ nhà mạo hiểm giả kỳ cựu | 先輩, 先生 | em – anh \| chị | anh \| chị – em | Giống 先輩 của học đường; chính sách hậu tố quyết định giữ "senpai" | Nhật | Thấp |
| 4 | Nhà mạo hiểm giả ↔ nhân viên hội | 受付嬢, ギルド | tôi – cô | tôi – quý khách \| ngài | Cặp phục vụ ↔ khách; một "ạ" mỗi lượt | Chung | Thấp |
| 5 | Chủ → nô lệ, thú khế ước | ご主人様, 奴隷, 契約 | tôi – em | tôi – chủ nhân | Chiều chủ gọi "em" chỉ khi đối phương rõ ràng nhỏ tuổi; **(đổi)** "tôi" thay cho "em" ở chiều nô lệ, "em" khi thẻ nhân vật là thiếu nữ nhỏ tuổi gắn bó (cùng lý do với `fantasy` dòng 1). ご主人様 dịch "chủ nhân", không dịch "ông chủ" | Nhật | Thấp |
| 6 | Nhân vật chính ↔ nhân vật cổ (のじゃ, 我) | のじゃ, 我, 汝 | tôi – ngài | ta – ngươi | Giọng vai [Nguồn 11]; cần chủ sản phẩm duyệt "ta – ngươi" cho nhân vật cổ (xem `fantasy` dòng 14) | Nhật | Thấp |
| 7 | Thần, nữ thần ↔ người chuyển sinh | 女神, 神 | ta – ngươi | tôi – ngài | Nữ thần nói thân mật (kiểu hài): "tôi – cậu" là điều kiện cặp thô; mặc định trang nghiêm | Nhật | Thấp |
| 8 | Boss, ma vương ↔ anh hùng | 貴様, 我 | ta – ngươi | tôi – ngài | **(đổi)** ô backward chỉ một cặp; "tao – mày" của anh hùng thô là điều kiện cặp thô (giữ độ gắt bằng từ ngữ) | Chung | TB |
| 9 | Thành viên → thủ lĩnh guild, trưởng đoàn | 団長, ギルマス | tôi – ngài \| anh \| chị | tôi – cậu \| cô | Thủ lĩnh hơn tuổi: dùng "anh/chị + tên" thay chức danh khi thân | Chung | Thấp |
| 10 | Dân làng, NPC, người lạ | 村人 | tôi – anh \| chị \| bác \| chú \| cô theo tuổi | tôi – cậu \| cô \| cháu theo tuổi | Không dùng "bạn". Với trẻ nhỏ, người dân lớn tuổi dùng "cháu" | Chung | Cao |

Dòng nên bỏ: **9** (nằm trong `modern` dòng 9). Còn 9. Hệ thống/giao diện (cửa sổ trạng thái) giữ khung và
con số, văn trung tính [Repo, profile Hàn]; nếu cần xưng hô thì không dùng "bạn" ở lời thoại.

### 2.5 `cultivation`

Không tìm được truyện cultivation nguồn Nhật đủ phổ biến để cần dòng riêng văn hóa Nhật [Suy]. Đề xuất không
tạo dòng Nhật cho bối cảnh này; chỉ nhận tín hiệu (師匠, 弟子) → "sư phụ", "đồ nhi" nếu gặp.

## 3. Tín hiệu nhận diện văn hóa Nhật

Dùng cho gợi ý văn hóa (chạy bằng quy tắc hoặc AI) khi ngôn ngữ văn bản khác tiếng Nhật. Các tín hiệu dưới
đây là [Suy] trừ chỗ có nguồn; chưa đo trên bản dịch Anh thật.

**A. Hậu tố gắn sau tên (mạnh nhất, ≥ 1 là đủ gợi ý)**
`-san`, `-sama`, `-kun`, `-chan`, `-dono`, `-shi`, `-tan`, `-senpai`, `-sensei`, `-sama` gắn sau chức danh
("Hero-sama", "Saint-sama"). Tên cộng hậu tố là dấu vết rõ nhất vì bản Anh thường giữ -san/-chan/-kun
[Nguồn 9]; tuy nhiên nhiều bản dịch chính thức bỏ [Nguồn 7].

**B. Danh từ thân tộc/chức danh để nguyên chữ Nhật**
`onii-chan`, `onii-sama`, `onee-san`, `nii-san`, `aniki`, `oyaji`, `ojisan`, `obasan`, `ojou-sama`, `ojousan`,
`bocchan`, `senpai`, `kouhai`, `sensei`, `denka`, `heika`, `danna`, `goshujin-sama`, `kumicho`, `oyabun`,
`kobun`, `wakagashira`. 先輩/後輩 là cặp quan hệ đặc trưng, 後輩 không phải cách gọi [Nguồn 3].

**C. Đại từ nguồn lọt vào bản dịch**
`ore`, `boku`, `watashi`, `watakushi`, `atashi`, `washi`, `omae`, `kisama`, `temee`, `anata`, `kimi`,
`ore-sama`; đuôi `-nodja`, `-desu`, `-dattebayo`, `-nano`, `-nya`.

**D. Tước hiệu tiếng Anh gợi nguyên tác Nhật (yếu, cần tín hiệu khác)**
"Young Miss/Young Lady" (お嬢様), "Young Master" (坊ちゃま), "Milady" dùng liên tục cho tiểu thư, "Your
Highness" đứng một mình, "Master/Mistress" cho ご主人様, "Boss" cho 親分. Từ khóa thể loại: "villainess",
"otome game", "reincarnated as", "capture target" (攻略対象).

**E. Văn hóa vật chất/chế độ trường học và công sở**
Lớp theo khối ("first-year", "class 2-A"), câu lạc bộ ("kendo club", "student council"), "cram school", "senior",
"junior", chức danh công sở (buchō, kachō), "yen", "bento", "konbini", "Obon".

**F. Nếu có chữ Nhật gốc**
Kana, 「」『』, dấu 、。, đại từ 俺/僕/私/あたし/わし/拙者/我/貴様, đuôi です/ます/でございます, のじゃ, ですわ,
っす.

**Phân biệt với văn hóa khác (tránh dương tính giả):**
- Hàn: `-ssi`, `-nim`, `oppa`, `noona`, `hyung`, `sunbae`, `hoobae`, `sajangnim`.
- Trung: `shixiong`, `shijie`, `shifu`, `-ge`, `-jie`, `laoban`, `-gongzi`, `xiaojie`.
- Cảnh báo: truyện fanfic/phương Tây dùng `-san`, `-senpai` theo mốt anime; truyện Hàn/Trung đặt bối cảnh
  Nhật; truyện Nhật đặt bối cảnh Hoa (hậu cung) vẫn mang tín hiệu Nhật ở văn phong nhưng cần bối cảnh `court`.

**Quy tắc kết hợp đề xuất:** tính điểm theo nhóm tín hiệu độc lập; ≥ 2 nhóm hoặc một nhóm A mạnh (≥ 3 lần hậu
tố sau tên trong hai chương đầu) thì gợi ý `ja`; mâu thuẫn với tín hiệu Hàn/Trung thì để trống và hỏi người
dịch. Người dịch luôn ghi đè (cùng nguyên tắc `suggestRegister` hiện có [Repo]).

## 4. Quy ước ngôn ngữ riêng cho văn hóa Nhật (profile `japanese()`)

Chỉ những thứ **không lặp bảng** ở mục 2 và **không lặp** những dòng đã có trong `japanese()` [Repo].

1. **Chính sách hậu tố là công tắc duy nhất**, không đổi trong ô bảng. Mặc định giữ -san/-kun/-chan/senpai
   (2026-10-04); chính sách Việt hóa: -san → cô/cậu/anh/chị/chú theo vai [Nguồn 9]; không ghép lai ("chị A-san")
   (đã có). Với `fantasy`/`court` có thể đặt mặc định Việt hóa nhưng cần quyết định riêng. Căn cứ: không có chuẩn
   cộng đồng [Nguồn 7, 8].
2. **Đổi cách gọi là mốc quan hệ.** Bỏ hậu tố/gọi trống tên (yobisute) hàm ý thân mật hoặc hạ thấp [Nguồn 3]; đổi
   họ ↔ tên, -san ↔ -kun ↔ trống là sự kiện cần thể hiện bằng cách gọi tiếng Việt tương ứng và **không đổi sớm
   hơn nguyên tác** (đã chốt). Profile đã có một câu cho chế độ Việt hóa; nên thêm câu cho chế độ giữ.
3. **Không dịch 貴様/お前/てめえ thành một đại từ cố định.** Đại từ ngôi hai là tín hiệu giọng, cặp xưng hô lấy
   từ quan hệ; 貴様 khoảng cách quân hàm có thể là "anh/cậu" giọng gằn. Căn cứ: lỗi "ngươi" ở task "New" [Repo] và
   Wikipedia [Nguồn 4]. Không nói trong profile hiện tại.
4. **Chức danh đứng một mình là lời gọi.** 先生/部長/課長/社長/殿下/陛下 dịch theo nghề hoặc Hán Việt (thầy/cô,
   bác sĩ, trưởng phòng, giám đốc, điện hạ, bệ hạ), kèm tên khi bản gốc kèm họ [Nguồn 3, 19]. Không biến thành
   đại từ "ngươi/anh".
5. **Ngôi hai đứng với ngôi ba chỉ vợ chồng.** あなた giữa vợ chồng là "anh/em" theo cặp [Nguồn 5]; 主人, 旦那,
   嫁, 家内 ở ngôi ba là "chồng tôi", "vợ tôi", không dịch "ông chủ".
6. **Giọng vai (役割語):** わたくし…ですわ (tiểu thư), わし…じゃ (ông già), のじゃ (nhân vật cổ), 拙者 (võ sĩ)
   [Nguồn 11]. Tiếng Việt không có đối ứng chuẩn; giữ khác biệt bằng lời lẽ (câu đủ thành phần, từ nhã cho
   tiểu thư; từ cổ, tiểu từ "đấy/nhỉ" cho nhân vật cổ) và **một tiểu từ nhất quán cho cả truyện**. Profile đã có
   một dòng chung; nên thêm ví dụ cụ thể.
7. **Nội tâm người chuyển sinh:** trong truyện `fantasy`/`game`, lời nghĩ và lời kể ngôi một của nhân vật
   chuyển sinh giữ giọng hiện đại ("tôi", từ thông dụng), dù thoại với thế giới dùng giọng quý tộc; chỗ lệch giữa
   hai giọng là chất hài của thể loại. Hiện chỉ nằm ở `thirdPerson` của `ja-fantasy` [Repo]; nên chuyển vào profile
   vì không phụ thuộc bảng.
8. **Họ + tên:** gọi nhân vật bằng họ hay tên là tín hiệu thân/xa; giữ nguyên lựa chọn của nguồn (quy ước tên đã
   có). Với truyện giữ hậu tố, "A-san" và "A" là hai cách gọi khác nhau.
9. **Số nhiều:** 私たち, 僕たち, 俺たち đã có trong profile; không thêm.

## 5. Câu hỏi mở cần chủ sản phẩm chốt

1. **Phản biện nhỏ cho quyết định hầu gái "em":** chấp nhận chuyển "em" từ bảng mặc định sang điều kiện thẻ
   nhân vật (mục 1.2, 2.2 dòng 1, 2.4 dòng 5) không? Nếu không thì cần sửa chỗ khác trong prompt để tránh model
   tự bịa "em".
2. **Hôn phu – hôn thê chưa yêu:** "tôi – cô" / "tôi – ngài" (đề xuất) hay giữ "ta – nàng" cho giọng trang
   trọng (hiện tại)? Không nguồn công khai nào quyết được; cần chọn rồi đo bằng Lab.
3. **Cấp dưới → sếp:** "tôi" (đề xuất tạm) hay "em" (thân hơn)?
4. **Nhân vật cổ (のじゃ/我/汝) và thần:** có cho "ta – ngươi" ngoài nghi lễ/phản diện (phản biện quyết định fantasy)?
5. **Cung đình Nhật bản địa:** có làm dòng riêng không, và có chấp nhận "tại hạ" cho 拙者/それがし không?
6. **Yakuza/băng đảng:** làm gói tùy chọn (đề xuất) hay bỏ?
7. **Họ hàng:** thêm trường quan hệ họ hàng (bên nội/ngoại, hơn/kém) vào thẻ nhân vật, hay chấp nhận gọi
   bằng tên + "chú/cô" khi thiếu?
8. **Chính sách hậu tố mặc định** cho `fantasy`/`court`: giữ hay Việt hóa (đã mở ở `vietnamese-addressing.md`).
9. **Có cần đọc thêm** bài Vũ Minh Hiền (2024) và quy chuẩn Sonako/Kim Đồng cho Dược Sư Tự Sự không (mục 1.4)? Nên
   đọc bản in hoặc nhờ người có quyền truy cập, vì công cụ tìm kiếm không mở được.
10. **Đo bằng model:** các dòng đổi ở mục 2 chưa được đo; nên chạy lại cùng mẫu n4696dd và "New" trước khi
    áp.

## 6. Nguồn

Tất cả truy cập ngày 2026-10-23. "Đã đọc" = công cụ tải nội dung trang; "yếu" = chỉ đọc tóm tắt của công cụ
tìm kiếm hoặc tải trang lỗi.

1. Wikipedia, *Vietnamese pronouns* (đã đọc): https://en.wikipedia.org/wiki/Vietnamese_pronouns
2. Cáp Thị Ngọc Huyền (2024), *Đối chiếu về từ xưng hô trong công sở giữa tiếng Nhật và tiếng Việt (khảo sát
   trên ngữ liệu phim "From Five To Nine" và "Những nhân viên gương mẫu")*, Tạp chí Khoa học và Công nghệ Đại
   học Duy Tân 05(66), tr. 94–101 (đã đọc PDF, mã hóa chữ bị lỗi nhưng ví dụ và kết luận đọc được):
   https://files02.duytan.edu.vn/svruploads/dtu-duytan/upload/file/638644936616925414-10(66).-Đối-chiếu-về-từ-xưng-hô-trong-công-sở-giữa-tiếng-Nhật-và-tiếng-Việt-(Cáp-Thị-Ngọc-Huyền).pdf
3. Wikipedia, *Japanese honorifics* (đã đọc): https://en.wikipedia.org/wiki/Japanese_honorifics
4. Wikipedia, *Japanese pronouns* (đã đọc 100.000 ký tự đầu): https://en.wikipedia.org/wiki/Japanese_pronouns
5. Wikipedia, *Anata* (trang định hướng, chỉ có câu về vợ chồng; thêm tóm tắt tìm kiếm về *danna*, *shujin*,
   yếu): https://en.wikipedia.org/wiki/Anata
6. Wikipedia, *Honorific speech in Japanese* (đã đọc):
   https://en.wikipedia.org/wiki/Honorific_speech_in_Japanese
7. J-Novel Club Forums, "An opinion about honorific" (đã đọc, gồm phát biểu của nhân viên):
   https://forums.j-novel.club/topic/642/an-opinion-about-honorific
8. Novel Updates Forum, "Use of honorifics in translated works" (tải trang lỗi 403; số liệu thăm dò lấy từ tóm
   tắt tìm kiếm, yếu): https://www.novelupdatesforum.com/threads/use-of-honorifics-in-translated-works.103248/
9. Feilunhai (2012), "Tám nhảm về cách xưng hô trong tiểu thuyết" (đã đọc):
   https://feilunhai1010.wordpress.com/2012/06/09/tam-nham-ve-cach-xung-ho-trong-tieu-thuyet/
10. Bình luận của người dịch Tearmoon, docln.net (đã đọc, chỉ phần bình luận):
    https://docln.net/truyen/6624-chuyen-ve-de-quoc-tearmoon/c63346-chuong-17-bien-nien-su-ve-cong-chua-thanh-nu-mia
11. Japan Foundation, "「役割語」とは何か" (đã đọc): https://www.jpf.go.jp/j/project/japanese/teach/tsushin/research/201302.html
12. Kanetani, M. (2026), *Yakuwarigo 'Role Language' in Translated Japanese*, Constructions 18(1) (đã đọc phần tóm tắt):
    https://constructions.journals.hhu.de/article/view/756
13. Luận văn Leiden về dịch 役割語 (tải lỗi; chỉ tóm tắt tìm kiếm, yếu):
    https://studenttheses.universiteitleiden.nl/access/item:2604481/view
14. Kodack, "Oyabun Meaning: The Oyabun–Kobun Relationship Explained" (đã đọc): https://www.kodack.net/en/oyabun-meaning/
15. Vũ Minh Hiền (2024), *Đối chiếu đại từ nhân xưng tiếng Nhật với tiếng Việt nhằm mục đích dạy/học dịch*,
    Tạp chí Khoa học Ngoại ngữ (tải trang lỗi chứng chỉ, chưa đọc nội dung; yếu): https://journals.hanu.edu.vn/tckhnn/article/view/721
16. Anime News Network (2021), "Why Seven Seas Altered Its Light Novels" (chỉ tóm tắt tìm kiếm, yếu):
    https://www.animenewsnetwork.com/feature/2021-04-26/why-seven-seas-altered-its-light-novels/.171956
17. Sonako, "Quy chuẩn dịch thuật của Kusuriya no Hitorigoto" (tải lỗi 402; chỉ tiêu đề trong kết quả tìm
    kiếm, yếu): https://sonako.fandom.com/vi/wiki/Quy_chu%E1%BA%A9n_d%E1%BB%8Bch_thu%E1%BA%ADt_c%E1%BB%A7a_Kusuriya_no_Hitorigoto
18. Migaku, "Japanese Family Vocabulary" (chỉ tóm tắt tìm kiếm về おじさん/おばさん, yếu):
    https://migaku.com/blog/japanese/japanese-family-vocabulary
19. Kết quả tìm kiếm về chức danh công sở Nhật (kanpai-japan.com, yakyacker.com, teamjapanese.com; chỉ tóm tắt
    tìm kiếm, yếu): https://www.kanpai-japan.com/learn-japanese/titles-honorifics-san-kun-chan-senpai
20. TV Tropes, *Japanese Sibling Terminology* (tải lỗi 403; chỉ tóm tắt tìm kiếm, yếu):
    https://tvtropes.org/pmwiki/pmwiki.php/UsefulNotes/JapaneseSiblingTerminology
21. Wikipedia, *The Great Ace Attorney Chronicles* (chỉ tóm tắt tìm kiếm, ví dụ giữ -san/-sama có chủ đích, yếu):
    https://en.wikipedia.org/wiki/The_Great_Ace_Attorney_Chronicles

Tài liệu repo: [xưng hô tiếng Việt](vietnamese-addressing.md), [nghiên cứu văn phong](translation-style-research.md),
[soát task 2026-10-22](translation-run-2026-10-22.md), `src/shared/contracts/addressingPresets.ts`
(`ja-modern`, `ja-fantasy`, `ja-court`), `src/main/services/ai/translate/languageProfiles.ts` (`japanese()`).

[Về module Ngữ cảnh](README.md)
