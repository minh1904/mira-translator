# Xưng hô tiếng Việt: bộ mặc định theo bối cảnh

Cập nhật: 2026-10-24 · Trạng thái: các quyết định ở mục 1 và mục 7.1 **đã chốt**; bảng theo hai trục bối cảnh và
văn hóa gốc, lưu theo tác phẩm, chip thể loại **đã hiện thực** (mục 7.2) nhưng **chưa đo lại chất lượng bằng
model**; ghi đè theo nhân vật hoặc cảnh, nhiều dạng tên cho một nhân vật, bước phân tích trước khi dịch và
AI đề xuất bối cảnh là **đề xuất**. Mục 3 là bảng phẳng cũ, giữ làm lịch sử.

> `v1`–`v4` trong chương này là tên thế hệ prompt **của các thí nghiệm đã chạy**; mã nay chỉ còn một
> prompt và thẻ/khóa đổi sang tiếng Anh (`noi`/`xung`/`goi` → `speaker_to_listener`/`self_ref`/`addr_ref`,
> `<nguon>` → `<source>`…). Xem [bảng đổi tên](prompt-system.md#hợp-nhất-prompt-ngày-2026-10-06).
Chủ trì: chủ sản phẩm (quyết định), kỹ thuật/đánh giá (bộ mặc định, phép đo).
Câu hỏi: khi chưa có cặp xưng hô đã duyệt, AI nên xưng hô thế nào; và làm sao để xưng hô không lộn xộn
giữa các lô, các chương?

## 1. Quyết định đã chốt (chủ sản phẩm, 2026-10-05)

1. **Đổi cặp xưng hô theo mốc trong truyện**, ghi bằng phạm vi chương của cặp; không bắt buộc người yêu
   phải "anh – em", không đổi sớm hơn nguyên tác.
2. **Quan hệ quyết định cặp; đại từ bản gốc là tín hiệu về giọng điệu**, không phải bảng quy đổi từng
   từ. お前/テメェ không bắt buộc thành "mày" trong quan hệ thầy trò.
3. **Không dùng "tôi – bạn" trong lời thoại.**
4. **Giữ thay đổi giọng điệu giữa cảnh** khi bản gốc đổi (giận, mỉa, chuyển kính ngữ), qua từ ngữ,
   tên gọi hoặc kính ngữ trong phạm vi đã duyệt; không tự phá cặp đã chốt chỉ vì nhân vật giận.
5. **Đại từ ngôi ba tùy bối cảnh và ngữ cảnh**, theo nghiên cứu ở mục 4.
6. **Giọng vùng miền theo tính cách nhân vật**, không có mặc định chung.
7. **Phân loại theo bối cảnh, không theo thể loại**: truyện tình cảm và trinh thám cùng đặt ở học đường
   Nhật dùng chung một bộ; thể loại chỉ bật/tắt vài luật. Làm **sau** việc gửi đủ ngữ cảnh.

8. **Không còn luật riêng cho "mày – tao"** (chủ sản phẩm chốt 2026-10-14, thay quyết định cũ dưới đây).
   Cùng ngày có một bản chốt trung gian: vai dưới trong quan hệ cách xa về vai vế (cháu → ông bà, con → bố mẹ,
   trò → thầy cô) không tự xưng tao gọi mày với vai trên. Bản đó đã bỏ vì khi dịch thật có nhân vật xưng "ta"
   gọi "mày" thay vì "tao – mày" dù bản gốc thô (chưa đo lại bằng model). Nay không có luật cứng nào về "mày – tao"; đại từ bản
   gốc là tín hiệu về giọng và mức thô, cặp đã duyệt là bắt buộc. Phần còn đúng của quyết định cũ: giữ độ
   gắt bằng từ ngữ và nhịp câu, không làm nhẹ tình tiết.

   *Lịch sử:* **Giáo viên hạn chế "mày/tao"** (chốt sau khi xem bản dịch, triển khai 2026-10-06). Học đường hiện
   đại mặc định "thầy/cô – em"; giáo viên cộc hoặc xa cách có thể dùng "thầy/cô – cậu". Học trò lễ
   phép dùng "em – thầy/cô". Chỉ dùng mày/tao khi cặp đã duyệt hoặc quy ước người dịch cho phép rõ.
   Giữ độ gắt, lời chửi, đe dọa đúng mức qua từ ngữ và nhịp câu; không làm nhẹ tình tiết hoặc thêm
   xúc phạm. Giữ tên/chức danh theo bản gốc và quy ước tên; lược đại từ khi tiếng Việt đã rõ.

**Cặp riêng đã chốt:** Unya → Akira là **"cô – cậu"**, chiều ngược **"em – cô"**. Thay lựa chọn
"cô – mày" trước đây; không tự đổi sang "em" khi dịu hay "mày" khi giận. Khi gọi 桐谷 vẫn dùng
"Kiritani". Đây là lựa chọn biên tập, không khẳng định mọi bản dịch fan đều dùng như vậy.
"tôi – cậu" vẫn là mặc định cho nam chính xưng 俺/僕 với bạn đồng lứa chưa thân.

### Mặc định chốt tạm theo khảo sát bản dịch fan (2026-10-05)

Chủ sản phẩm cho cập nhật các mặc định dưới đây; lựa chọn thầy trò hiện hành ở mục 1 thay phần còn
cân nhắc về "cô – mày" trong khảo sát ban đầu:

- **Cổ trang Trung:** người yêu "ta – nàng" (nam) và "ta – chàng" (nữ), "thiếp" chỉ khi trang trọng hoặc
  trước người ngoài; xưng hô Hán Việt (huynh, đệ, tỷ, muội), trừ nhân vật xuyên không kể chuyện; sư phụ
  "ta / vi sư – ngươi / đồ nhi", không dùng "con"; vua theo bản gốc (朕 → trẫm, 我 → ta); 臣妾 là
  "thần thiếp".
- **Ngôi ba:** mỗi nhân vật một đại từ cố định cho cả truyện. Cổ trang: nam chính "hắn", nhân vật thanh
  nhã "y", nữ trẻ "nàng", "chàng" chỉ khi nhìn từ người yêu.
- **Fantasy phương Tây (nguồn Nhật):** không dùng "thần" (chỉ cận vệ, quan lại trực thuộc); bề tôi xưng
  "tôi" và gọi "người / ngài", kèm "thưa Điện hạ"; người hầu mặc định "tôi", "em" khi là thiếu nữ nhỏ
  tuổi gắn bó với chủ; hôn phu – hôn thê chọn một cặp và khóa tới mốc.
- **Học đường Nhật:** nhân vật chính "tôi – cậu"; "tao – mày" cho vai phụ ồn ào, côn đồ hoặc cặp thân lâu
  năm cùng nói thô.
- **Bộ mới `ja-court`** cho truyện Nhật đặt trong cung đình kiểu Á Đông: thần, nương nương, nô tỳ, thần
  thiếp.
- **Hậu tố:** mặc định của tác phẩm vẫn là **giữ** (quyết định 2026-10-04). Bộ fantasy chỉ ghi gợi ý: nếu
  người dịch chọn Việt hóa thì -sama → ngài / tiểu thư / công chúa, **không ghép lai** "công chúa-sama".
  Đổi mặc định cho fantasy cần quyết định riêng.

## 2. Thứ tự ưu tiên khi dịch

1. **Cặp đã duyệt** trong ma trận xưng hô (có chiều, có phạm vi chương, có ghi chú) — bắt buộc, kể cả
   khi nhân vật nói gắt.
2. **Bộ mặc định theo bối cảnh** của tác phẩm — bảng cặp chỉ cho cặp chưa có ở trên. Từ 2026-10-14 bộ
   không còn luật riêng (luật thầy trò đã bỏ).
3. **Luật chung** (mục 1) — luôn áp; chỉ giữ nguyên tắc không gắn ngôn ngữ nguồn hay một quan hệ riêng.
   Phân tầng ở [hệ thống prompt](prompt-system.md#luật-theo-bộ-mặc-định-đã-triển-khai-2026-10-06-chưa-đo-lại-bằng-model).

Thẻ nhân vật (giới tính, vai trò, ghi chú) đi kèm, vì thiếu nó model đoán giới tính từ giọng nói: trước
khi có thẻ, cô Unya bị gọi "thầy" 26 lần trong 20 chương.

## 3. Sáu bộ mặc định

> **Đã thay (2026-10-24).** Sáu bộ phẳng dưới đây gắn theo ngôn ngữ nguồn đã được thay bằng bảng hai trục
> bối cảnh và văn hóa gốc (mục 7); mã cũ như `[ja-modern]` vẫn đọc được. Giữ mục này để biết các bộ cũ nói gì.

Dữ liệu và từng dòng nằm ở [`addressingPresets.ts`](../../../src/shared/contracts/addressingPresets.ts).
Mỗi dòng: loại quan hệ (A → B), tín hiệu bản gốc, cặp chiều thuận, cặp chiều ngược khi khác, ghi chú.

| Mã | Bối cảnh | Điểm chính |
| --- | --- | --- |
| `ja-modern` | Nhật hiện đại, học đường, công sở | bạn chưa thân "tôi – cậu"; bạn thân thô "tao – mày"; thầy cô thô "cô/thầy – cậu"; người yêu "anh – em" chỉ khi đã tỏ tình **và** gọi trống tên |
| `ja-court` | Cung đình Á Đông (nguồn Nhật) | thần – bệ hạ, nô tỳ – nương nương, thần thiếp; vua riêng tư "ta – nàng" |
| `ja-fantasy` | Fantasy quý tộc, isekai (nguồn Nhật) | hầu "tôi – tiểu thư"; "ta – ngươi" chỉ ở nghi lễ và phản diện; hôn phu – hôn thê giữ một cặp tới mốc; kính ngữ ngang hàng là màu giai cấp |
| `zh-ancient` | Cổ trang, tiên hiệp, kiếm hiệp, cung đấu | sư môn theo thứ tự nhập môn; tiền bối theo cảnh giới; 臣妾 là "thần thiếp"; không ép mọi thoại thành "ta – ngươi" |
| `zh-modern` | Đô thị, hiện đại Trung | bạn học "tớ – cậu"; 学长 không ngụ ý yêu; 宝贝/亲爱的 có thể chỉ là gọi bạn; không dùng "hắn – nàng" |
| `en-western` | Phương Tây hiện đại và fantasy (nguồn Anh) | I/you chọn theo quan hệ; chưa yêu "tôi – cậu"; vua – bề tôi "ta – khanh", tránh "trẫm" |

Gợi ý bộ cho tác phẩm theo ngôn ngữ và trường thể loại (`suggestRegister`): tiếng Nhật có dấu hiệu dị
giới/quý tộc → `ja-fantasy`, còn lại `ja-modern`; tiếng Trung theo nhóm cổ đại/hiện đại, không chắc thì
không chọn bộ; tiếng Anh → `en-western`. Ghi thẳng mã vào thể loại (ví dụ `[ja-fantasy]`) thì mã đó thắng.
**Lưu lựa chọn riêng theo tác phẩm chưa có** (cần schema); đây là chỗ tạm.

`ja-modern` có ba ví dụ **tự soạn**: giáo viên quát nhưng giữ cặp, giữ nguyên lời đe dọa, học trò
lễ phép và lược đại từ. Chỉ gửi ví dụ của bộ đã chọn trong system prompt `v2`; không gửi thành đoạn
nguồn, không cho phép ví dụ ghi đè cặp đã duyệt. Các bộ khác chưa thêm ví dụ khi chưa có ca lỗi cụ thể.

## 4. Căn cứ nghiên cứu (quan sát, đọc 2026-10-05)

**Ngôn ngữ học.** Tiếng Việt gọi người nghe chủ yếu bằng từ thân tộc, mỗi từ mã hóa tuổi và thế hệ tương
đối, không cặp nào đối xứng ([Lương Văn Hy 1990](https://benjamins.com/catalog/pbns.11)). Người ngang
hàng tránh lộ chênh lệch tuổi bằng đại từ thật, tên, hoặc từ thân tộc lệch
([Sidnell & Shohet 2013](https://rai.onlinelibrary.wiley.com/doi/abs/10.1111/1467-9655.12053)). Đổi xưng
hô là tín hiệu cảm xúc mạnh; "tao – mày" có thể thân hoặc xúc phạm
([Wikipedia](https://en.wikipedia.org/wiki/Vietnamese_pronouns)). Không tìm thấy thang điểm số cho trục
quyền thế/thân hữu trong tiếng Việt.

**Đại từ ngôi ba.** Ngôi ba tiếng Việt ít trung tính: "hắn" lạnh/khinh, "gã" coi thường, "nàng" văn
chương cho nữ trẻ, "nó" cho trẻ con hoặc người bị khinh
([khảo sát Nam Cao](https://nguvandhag.wordpress.com/2012/02/02/kh%E1%BA%A3o-sat-cac-%C4%91%E1%BA%A1i-t%E1%BB%AB-nhan-x%C6%B0ng-va-l%E1%BB%9Bp-t%E1%BB%AB-x%C6%B0ng-ho/)).
Bản dịch Kim Dung cũ dùng "hắn" gần như trung tính cho nam chính
([hồi 59](https://vnexpress.net/tieu-ngao-giang-ho-hoi-59-2754481.html)); bản khác cùng truyện dùng
"chàng" ([hồi 40](https://truyenkimdung.net/tieu-ngao-giang-ho/hoi-40-may-troi-nuoc-chay-theo-y-minh)) —
đây là lựa chọn của từng dịch giả, nên là thiết lập cấp dự án. Lý Lan gọi Harry là "nó".

**Cộng đồng dịch.** Tiến trình "mình – bạn → cậu – tớ → anh – em"
([Feilunhai](https://feilunhai1010.wordpress.com/2012/06/09/tam-nham-ve-cach-xung-ho-trong-tieu-thuyet/));
hạn chế "ta – ngươi" của bản convert, nữ chính xuyên không kể chuyện xưng "tôi"
([Tuyết Trên Tay](https://tuyettrentay.wordpress.com/2013/04/19/mot-vai-kinh-nghiem-nho-nho-khi-edit/));
hệ xưng hô cổ trang ([vandamphongkhuynh](https://vandamphongkhuynh.com/2024/04/02/cach-xung-ho-trong-truyen-co-dai/)).
**Không có bảng quy đổi công khai cho light novel Nhật.** Bản dịch fan Hamefura trên docln gọi hôn thê
lẫn lộn "anh – nàng", "ta – nàng" — đúng loại lỗi bộ mặc định cần chặn.

**Khảo sát thầy trò ngày 2026-10-05 (căn cứ trao đổi trước quyết định mới).** Bản dịch fan Oregairu
đã tham khảo cho cô Hiratsuka dùng "tôi – cậu", lúc gắt có "nhóc"
([Sonako](https://sonako.fandom.com/vi/wiki/Yahari_Ore_no_Seishun_Love_Come_wa_Machigatteiru_T%E1%BA%ADp_1_-_Ch%C6%B0%C6%A1ng_1)).
Các bài về giao tiếp học đường phản ánh sắc thái nặng của mày/tao
([Giáo dục Việt Nam](https://giaoduc.net.vn/thay-co-xung-ho-voi-hoc-tro-pho-thong-nhu-the-nao-cho-phu-hop-post205506.gd),
[Tuổi Trẻ](https://tuoitre.vn/thay-giao-xung-tao-bop-cam-chui-hoc-sinh-tho-tuc-ngay-tren-buc-giang-20231002104733503.htm));
đó là bối cảnh tiếp nhận tiếng Việt, không phải quy tắc bắt buộc cho văn học. Nhận định ban đầu
"cô – mày sát nhất" đã được thay bằng lựa chọn biên tập ở mục 1; không thể kết luận độ trung thành
chỉ từ đối chiếu riêng 私 và お前.

**Công cụ AI cho tiếng Việt.**
[zh-vi-novel-translation](https://github.com/duongmkqn005-ai/zh-vi-novel-translation): bảng có chiều,
phạm vi chương, chứng cứ, trạng thái; không đổi sớm hơn nguyên tác.
[MTLS](https://github.com/thang97-21/MTLS) (Nhật → Việt): bậc cặp theo độ thân, "anh – em" khi đủ hai
tín hiệu; nhưng dùng "tôi – bạn" cho người lạ và bắt buộc "anh – em" cho người yêu — **trái** mục 1.
[Donut4055/truyen](https://github.com/Donut4055/truyen): khóa cặp cả chương — trái mục 1.4.

**Kho gốc trong máy** (đếm thoại 「」): tỉ lệ câu có kính ngữ — n5955en (học đường) 13%, Hamefura 33%,
Goblin 46%. Fantasy romance gần như không dùng xưng hô cổ (拙者, 朕, 汝, そなた đều vắng).

**Bản dịch fan và convert (khảo sát 2026-10-05).** Khoảng 20 light novel trên docln, Sonako và các bản
edit truyện Trung. Hai chuẩn ngầm mạnh nhất: cổ trang khác hiện đại (giữ "ta – ngươi, hắn, nàng" trong
truyện hiện đại bị coi là lỗi convert — *"cái hay của truyện chắc mất đến 70%"*,
[congchuakhangiay](https://congchuakhangiay.wordpress.com/2011/10/01/danh-cho-cho-cac-b%E1%BA%A1n-m%E1%BB%9Bi-edit-truy%E1%BB%87n/));
fantasy phương Tây khác cung đình Á Đông (người dịch Tearmoon từ chối "thần" vì *"theme kiểu phương
Tây"*, [ch.17](https://docln.net/truyen/6624-chuyen-ve-de-quoc-tearmoon/c63346-chuong-17-bien-nien-su-ve-cong-chua-thanh-nu-mia)).
Người yêu cổ trang phổ biến "ta – nàng", "thiếp – chàng" bị chê sáo
([chiase.org](https://chiase.org/threads/kinh-nghiem-edit-truyen-ngon-tinh.1614/)). Nhân vật chính học
đường gần như luôn "tôi – cậu" hoặc "tớ – cậu"; "tao – mày" cho vai phụ côn đồ. Nhóm dịch cũ giữ hậu tố
theo quy chuẩn, nhóm mới dịch thành "Ngài Myne", "tiểu thư Rafina"; ghép lai bị coi là kém. Độc giả ít
bình luận về xưng hô; hai lời chê lặp lại là xưng hô "ngang" (thiếu phân cấp) và **đổi giữa chương không
lý do**. Quy chuẩn tốt ghi rõ mốc đổi, ví dụ DanMachi: *"Lilly (em) – ngài; sau vụ cuối… (em) – anh"*.
Giới hạn: nhiều trang chặn truy cập, một phần chỉ đọc qua tóm tắt; tỉ lệ là ước định tính.

**Dịch máy.** Không tìm thấy bộ dữ liệu hay phân tích lỗi nào riêng về xưng hô khi LLM dịch sang tiếng
Việt — Lab của Mira là nơi đo đầu tiên.

## 5. Kết quả đo (n5955en, chương 1–20, `gemini-3.1-flash-lite`)

Số đo dưới đây thuộc phiên bản **trước** cập nhật thầy trò ngày 2026-10-06, không phải bằng chứng
rằng prompt mới đã cải thiện chất lượng. Cần dịch lại cùng mẫu để đánh giá tác động.

| Bản | Gọi nhầm "thầy" | 「」 sót / ngoặc thẳng | Glossary | Lô mỗi chương | Chi phí |
| --- | --- | --- | --- | --- | --- |
| v2, không thinking | 26 | 96 / 815 | 99% | 2–3 | $0,092 |
| v2, có thinking | 24 | 337 / 337 | 100% | 2–3 | $0,195 |
| v2 + thẻ nhân vật, cặp xưng hô, nguyên chương | 0 | 0 / 0 | 89%* | 1 | $0,087 |
| + bộ mặc định `ja-modern` và luật chung | 0–1 | 0 / 0 | 96% | 1 | $0,090 |

\* Tụt vì lỗi dữ liệu và format: thẻ nhân vật ghi tên không có mũi tên nên model đọc 淑蓮 thành
"Shukuren"; họ 桐谷 bị gắn làm biến thể của Akira nên mất mục "桐谷 → Kiritani" (Mira không cho một tên
vừa là thuật ngữ vừa là nhân vật). Đã sửa format thành `桐谷淑蓮, 淑蓮 → Sumire`.

Thinking không đỡ lỗi xưng hô mà đắt gấp 2 lần. Ngữ cảnh đủ mới là thứ sửa được. Số mẫu câu cô giáo nói
thô còn ít (3), cần đo thêm trước khi kết luận về "tao".

## 5b. Sửa theo loại lỗi, không theo từng lỗi (2026-10-06)

Mỗi lỗi đọc được xếp vào một trong ba loại: thiếu nguyên tắc chung (sửa ở luật chung, hiếm), thiếu dữ
kiện riêng của truyện (sửa ở **dữ liệu**), model không đủ sức (sửa bằng model hoặc lượt soát). Prompt
chung giữ ngắn; kiến thức riêng nằm ở dữ liệu. Đã làm:

- **Cặp xưng hô đủ ô.** Cặp có thêm `secondPerson` — đại từ ngôi hai khi bản gốc lược chủ ngữ hoặc dùng
  あなた/貴方/你 trong lúc cách gọi là tên ("Rion-sama"); nhân vật có thêm `thirdPerson` — đại từ người
  kể dùng. Lưu trong JSON của cột `notes`, không cần migration. Thiếu ô này, hầu gái Milly gọi con trai
  nhà chủ là "em". `addressingGaps` liệt kê ô trống; Lab: `gaps`.
- **Phân tích trước khi dịch** ([`addressingAnalysis.ts`](../../../src/main/services/ai/addressingAnalysis.ts)):
  mã gom câu thoại có tên từng nhân vật kèm câu dẫn, model đề xuất giới tính, đại từ ngôi ba và cặp đủ ô
  kèm câu trích làm chứng. Lab: `analyze`, `--apply` chỉ điền ô trống. Trên n4696dd (30 chương,
  ≈ 0,003 USD): tự đề xuất Milly → Rion "tôi – Rion-sama, ngôi hai: cậu", tìm ra giới tính của Blake và vai
  của Caroline; ô trống 12 → 0. Model tự chấm mọi cặp "cao" và hai lần chạy khác nhau — vẫn phải duyệt.
- **`v3` = `v2` + tự khai người nói.** Lỗi Rion xưng "anh" với Milly đến từ việc model chọn một cách tự
  xưng cho Rion trong cả cảnh (cùng cảnh có Sophia, Rion xưng "anh" với Sophia). `v3` bắt model ghi
  `"noi":"Rion→Milly"` cho từng câu thoại trước khi dịch. Lab: `pairs` chấm câu lệch cặp đã chốt bằng
  nhãn của `v3`. Kết quả sơ bộ (flash-lite, lô cả chương): chị em dị giới 17% → 13%, yandere 31% → 27%,
  chi phí +~10%. Phép chấm còn nhiễu ("mình" phản thân, "chúng ta"); dùng để so, chưa phải tỉ lệ lỗi thật.

- **Lỗi bộ phân tích làm hỏng bản dịch `v3`/`v4` (đã sửa 2026-10-06).** Model đôi khi viết thừa `"dst":` ở
  đầu đối tượng (`{"id":"[29]","dst":"noi":"Milly→Rion",…,"dst":"…"}`). `JSON.parse` hỏng, bộ regex dự
  phòng đọc `"noi"` thành bản dịch và lưu im lặng: 68 đoạn của một lần chạy `v3`, 35 của `v3` nguyên chương,
  43 của `v4` trong n4696dd, tập trung ở chương có nhiều thoại. Các đoạn đó cũng làm `pairs` mất nhãn nên
  chương 3 không được chấm. `lenientParser` nay bỏ `"dst":` thừa và không nhận tên khóa làm bản dịch.
  **Số đo `v3` ở mục trên có thể bị ảnh hưởng và chưa đo lại.**
- **`v4` = `v3` + khai `xung`/`goi` trước `dst`, thử một lần (n4696dd, chương 1–10, flash-lite, không
  thinking).** Chấm 185 câu thoại Milly↔Rion (chương 3–9) bằng nhãn `noi` của `v4`, loại các cờ do danh từ
  ("cô bé", "con gái", "bà ta", "sinh con") và "mình" phản thân; so cùng cặp đã duyệt (Milly: tôi – cậu;
  Rion: tôi – chị). Câu lệch thật: `v3` cũ (nhiều lô) 35, `v3` + dòng cặp mới (T1) 20, `v3` + dòng cặp
  mới nguyên chương (T1-full, đối chứng của `v4`) 25, `v4` 18. Theo chiều: Milly→Rion `v3` cũ 14, T1 0,
  T1-full 19 ("ngài" ở chương 4 và 8), `v4` 1; Rion→Milly `v3` cũ 21, T1 20, T1-full 6, `v4` 17 ("em" ở
  chương 3, "ta/cô" ở chương 9).
  - Cùng điều kiện nguyên chương, `v4` giảm lệch ở Milly→Rion (19 → 1) nhưng không ở Rion→Milly.
  - Ở `v4`, khoảng 20 trong 89 câu Rion→Milly và 7 trong 96 câu Milly→Rion có `xung`/`goi` khai đúng cặp
    mà `dst` vẫn dùng đại từ khác: khai trước chưa ràng buộc được câu dịch.
  - Giới hạn: một lần chạy mỗi điều kiện, nhiễu giữa các lần lớn (dịch lại 5 chương của T1 làm "ngài" ở
    chương 8 biến mất); phân loại bằng bộ lọc cộng đọc tay chưa kiểm hết; chỉ một truyện. Chưa đổi mặc định.

- **Giả thuyết về Rion tự xưng "em" với Milly ở `v4` (2026-10-06, chưa kiểm chứng bằng thí nghiệm).**
  Cặp đã duyệt là tôi – chị, nhưng 13 trong 26 câu Rion→Milly có đại từ ngôi một ra "em". Bằng chứng
  quan sát: khi nguyên tác có 俺/僕 thì "tôi" 13/16 và không có "em"; khi nguyên tác lược đại từ thì
  "em" 13/26. Hai nguồn trong prompt có thể kéo về "em – chị":
  1. Bảng mặc định `ja-fantasy`, dòng "Hầu gái, quản gia → chủ", ghi "chủ nhỏ tuổi: em – chị"; bảng gắn
     nhãn "chỉ dùng cho cặp chưa có" nhưng model vẫn dùng khi phải tự điền đại từ.
  2. Luật chung "đại từ của bản gốc chỉ quyết định mức thô hay lịch sự" làm yếu neo 俺 → "tôi".
  Ngoài ra "ta/cô" ở chương 9 (câu có 俺, giọng ra lệnh) có thể do dòng "Hôn phu thô [俺 + お前]: ta –
  cô"; chưa kiểm. `v4` khai `xung:"tôi"` đúng nhưng `dst` vẫn dùng "em" ở khoảng 20/89 câu Rion→Milly.
  Thí nghiệm dự kiến (T3): bỏ dòng mặc định hầu gái→chủ cho truyện có cặp duyệt, so với `v4`. Nếu
  đúng, sửa bằng mã: không gửi dòng mặc định của quan hệ đã có cặp duyệt, thêm luật "nguyên tác lược
  đại từ mà đã có cặp duyệt thì dùng cách tự xưng của cặp", và gắn cờ câu có `xung` khác đại từ trong `dst`.

Còn đề xuất: gắn nhãn người nói bằng mã cho câu dễ và lượt riêng cho câu khó; bộ kiểm tra theo cặp dùng
nhãn để chỉ sửa câu lệch; so lô cả chương với lô nhỏ kèm bản đã dịch của đoạn trước; thử chỉ dẫn tiếng
Anh với dữ liệu tiếng Việt.

## 6. Còn mở

**Cần chủ sản phẩm chốt.**
- **Hậu tố trong fantasy:** giữ (mặc định hiện tại) hay đổi mặc định sang Việt hóa cho bộ fantasy.
- Nguồn Anh: "mình – bồ" cho mọi nhóm bạn teen hay chỉ kiểu Harry Potter; nhân viên với sếp "tôi" hay
  "em" (chưa có nguồn bản dịch fan).

**Đề xuất kỹ thuật.**
- **Ghi đè bộ theo nhân vật hoặc cảnh** — ví dụ nội tâm người chuyển sinh giữ giọng hiện đại trong truyện
  fantasy. Lưu bộ theo tác phẩm đã làm ở mục 7.2; phần ghi đè chi tiết hơn vẫn là đề xuất.
- **Nhiều dạng tên cho một nhân vật**, mỗi dạng một bản dịch (họ tên, tên, họ, biệt danh). Hiện mỗi nhân
  vật có một tên dịch, và tên đã là nhân vật thì không còn là thuật ngữ — prompt `v1` mất luôn bản dịch
  tên đó.
- **Bước phân tích trước khi dịch**: đếm cách tự xưng và cách gọi trong bản gốc như mục 1 đã làm tay, đề
  xuất cặp kèm câu bằng chứng để người dịch duyệt.
- **Bộ kiểm tra nhất quán**: nhân vật nữ bị gọi "thầy", cặp đổi giữa chương không có mốc, dấu thoại lẫn
  kiểu — các chỉ số của mục 5 thành kiểm tra tự động.
- **Kiểm chứng bằng bản in** (IPM, Amak, Kim Đồng; Lý Lan; Kim Dung bản Vũ Đức Sao Biển) — chưa có trích
  đoạn chính xác.

## 7. Hai trục: bối cảnh và văn hóa gốc (2026-10-24)

Bảng gợi ý gắn theo ngôn ngữ nguồn (mục 3) chọn sai trục: bối cảnh truyện (hiện đại, fantasy, cung đình…) và
văn hóa gốc của câu chuyện (Nhật, Hàn, Trung, phương Tây) khác nhau, và văn hóa gốc không trùng ngôn ngữ văn
bản. Truyện Nhật đọc từ bản tiếng Anh từng bị gán `en-western`; truyện chỉ có tên không có bảng; tiếng Hàn không
có bảng nào. Chi tiết thiết kế ở change `add-multilingual-addressing-presets`; nội dung từng dòng và nguồn ở
[Nhật](addressing-research-ja.md), [Hàn](addressing-research-ko.md), [Trung](addressing-research-zh.md),
[phương Tây](addressing-research-west.md).

### 7.1 Quyết định đã chốt (chủ sản phẩm, 2026-10-23)

- Bảng theo hai trục: bối cảnh `modern`, `fantasy`, `court`, `cultivation`, `game` và văn hóa gốc `ja`, `ko`, `zh`,
  `west`. Bảng trong prompt = dòng chung của bối cảnh + dòng riêng của văn hóa.
- Một tác phẩm có **một bối cảnh chính và nhiều bối cảnh phụ**; dòng của bối cảnh chính thắng khi trùng quan hệ.
  Cung đình và tu chân dùng chung dòng bằng cách chọn cả hai, không có bối cảnh `ancient` trung gian.
- Văn hóa Hàn: Việt hóa `-ssi`, `오빠`/`형` dịch theo vai (em – anh/chị), `선배` gọi trống là "tiền bối"; chế độ giữ
  hậu tố là công tắc riêng.
- Không có tín hiệu thì chỉ gửi luật chung kèm luật suy cặp từ tuổi, quan hệ, trang trọng và chức danh; áp cho
  mọi ngôn ngữ nguồn. Tiếng Anh không còn mặc định `en-western`.
- "Em" của hầu gái và người khế ước **không** là cặp mặc định ở fantasy ("tôi – tiểu thư"); "em" chỉ khi thẻ
  nhân vật cho biết người đó là thiếu nữ nhỏ tuổi gắn bó với chủ. Đây là điều chỉnh cho nghi can lỗi Rion xưng
  "em" với Milly (mục 5b), **chưa kiểm chứng** rằng đó là nguyên nhân.

### 7.2 Đã hiện thực (chưa đo bằng model)

- Dữ liệu và ghép bảng ở `src/shared/contracts/addressing/`: `types.ts`, `compose.ts` (ghép, bí danh mã cũ, đọc mã
  trong thể loại), `genres.ts` (chip và từ khóa), `resolve.ts` (`resolveRegister`), `labels.ts`, `data/`.
  Mỗi dòng có độ tin cậy `high`/`medium`/`low`; ghi chú trong dữ liệu chỉ nói với model, không chứa ngày chốt hay
  nhãn nguồn.
- Thứ tự chọn: mã tổ hợp trong thể loại (`[ko-modern]`, hoặc mã cũ) > lựa chọn đã lưu > suy từ chip khi thể loại
  chỉ cho **một** bối cảnh (chip mâu thuẫn như Đô Thị cùng Fantasy thì không đoán) > không bảng. Văn hóa: mã >
  đã lưu > từ khóa thể loại (tu chân, kiếm hiệp, cung đấu → Trung) > ngôn ngữ nguồn, trừ tiếng Anh. "Không dùng
  bảng" tắt bảng nhưng văn hóa vẫn điều khiển kính ngữ.
- Lưu theo tác phẩm: ba cột `setting`, `settings_extra`, `culture` (schema tác phẩm v18, chỉ mục thư viện v21);
  chưa chọn là `NULL`, `none` là tắt bảng. Form tác phẩm có chip thể loại, ô bối cảnh chính, bối cảnh phụ, văn hóa
  và một câu nói bảng nào sẽ được dùng. Chip Xuyên Không là chế độ kể, không suy thành bối cảnh.
- Bản chụp ngữ cảnh phiên bản 2 ghi `{ setting, extra, culture }` thay cho mã bảng. Bản chụp cũ vẫn đọc và dựng lại
  được qua bảng bí danh; hash đã lưu không bị ghi lại, hash bản chụp mới đổi một lần. `en-western` cũ ánh xạ thành
  `fantasy` + `west` (bảng cũ trộn fantasy với hiện đại, không có ánh xạ đúng); `zh-ancient` cũ thành `court` + `zh`.
- Quy ước kính ngữ theo văn hóa: văn bản tiếng Anh mang văn hóa Nhật, Hàn hoặc Trung dùng quy ước của văn hóa đó
  (Trung: tên Hán Việt thay cho dòng tên Latinh). `korean()` nhận chính sách kính ngữ; mặc định Việt hóa, chỉ `keep`
  nói rõ mới giữ hậu tố. Prompt dịch lên `translate-v11`.
- Sửa các dòng sai đã xác minh: dòng họ hàng và "cậu" thân tộc cho Nhật, hai dòng hôn phu mang "ta" vào fantasy,
  "con" của thầy cô và "thần/khanh" của `en-western`, `Sir` đi với tên riêng và `Lord` theo tước hiệu, vua Joseon
  tự xưng `과인` chứ không `짐`. `genreFamily` không còn xếp "xuyên không" vào cổ đại.

### 7.3 Chưa làm hoặc còn mở

- **Chưa đo bằng model.** Phần lớn dòng mới là suy từ kiến thức ngôn ngữ; nhiều nguồn tiếng Việt chỉ đọc qua tóm
  tắt tìm kiếm, và không có bản in nào được đối chiếu. Cần chạy lại truyện có lỗi xưng hô đã ghi ở
  [soát task dịch thật](translation-run-2026-10-22.md) (gồm Rion và Milly) trước khi coi bảng là mặc định.
- **Chính sách hậu tố chưa lưu theo tác phẩm.** Hiện không nơi nào lưu `HonorificPolicy`: `japanese()` mặc định giữ
  hậu tố, `korean()` mặc định Việt hóa, và chế độ `keep` chỉ có khi nơi gọi truyền vào.
- **Họ hàng cần dữ liệu thẻ nhân vật** (bên nội hay ngoại, hơn hay kém); dòng họ hàng ghi điều kiện đó trong ghi
  chú, còn thiếu thì gọi theo tuổi. Chưa có trường mới trên thẻ nhân vật.
- AI đề xuất bối cảnh và văn hóa để người dịch duyệt, dò tín hiệu từ nội dung chương, ghi đè theo chương hay nhân
  vật, ngôi ba của phương Tây: chưa làm.
- Dòng bị bỏ vì nguồn yếu: yakuza và idol (Nhật), cung đình bản địa Nhật, nhân vật cổ `のじゃ`, tiểu chủ, tên + 老/小
  (Trung), đại công và người hồi quy (Hàn). Có thể thêm lại khi có bằng chứng.
- Các câu hỏi về nội dung từng dòng (hôn phu "tôi – cô" hay "ta – nàng", cấp dưới với sếp "tôi" hay "em", "điện
  hạ" hay "bệ hạ" cho vua Joseon, "huân tước" hay "ngài" cho Lord) nằm ở mục câu hỏi mở của bốn tài liệu khảo sát;
  dữ liệu hiện chọn phương án thận trọng nhất của từng tài liệu.

[Về module Ngữ cảnh](README.md)
