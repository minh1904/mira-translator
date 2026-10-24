## Context

Xem `proposal.md` (mục Why) và các spec `glossary-extraction`, `agent-context-workflow`.

Bước trích hiện tại:
- `ContextExtractionService.extract` chia các chương chưa quét thành khúc 40k ký tự.
- Với mỗi khúc:
  1. gọi lượt quét;
  2. sinh ứng viên code bằng `japaneseCandidates`;
  3. hợp hai nguồn bằng `mergeCandidates`, ngưỡng ≥ 2 lần, đếm trong khúc;
  4. phân loại theo lô 60, xếp theo tần suất;
  5. kiểm bằng `verifyTerms`;
  6. lưu bằng `saveExtraction`, hàm này bỏ qua ứng viên có `ownerOf` khác null.
- Sau các khúc là phân tích xưng hô (`analyzeAddressing`).
- Các hàm trong `glossaryExtraction.ts` là hàm thuần, Lab dùng chung.

Ràng buộc:
- Mục lưu `approved` có hiệu lực ngay (change `unblock-auto-translate-context`).
- Một khúc ghi trong một transaction; lời gọi lỗi thì không ghi gì cho khúc đó.
- Ngân sách task kiểm trước mỗi lời gọi (`gate`). Change này không thêm lời gọi model nào.

## Goals / Non-Goals

**Goals:**
- Sửa năm lỗi trong proposal mà không thêm lời gọi model và không thêm phụ thuộc (không NER, không Sudachi).
- Giữ các hàm thuần trong `glossaryExtraction.ts` để Lab chạy được cùng logic.

**Non-Goals:**
- Sửa hay đổi phạm vi mục đã có. Chỉ thêm alias; sửa mục thuộc change `add-context-progression`.
- Hỏi người dùng. Thuộc change `add-context-questions`.
- Quét lại các chương đã quét. Prompt đổi thì hash prompt đổi, nhưng không xóa dòng "đã quét".
- Tiếng Trung: lọc rác và tín hiệu chú âm chỉ áp cho tiếng Nhật. Đếm toàn phạm vi, lọc mục đã có, họ thuật ngữ
  và các phép kiểm áp cho mọi ngôn ngữ.

## Decisions

### 1. Văn bản dùng để đếm: mọi chương tới chương cuối của task, đọc một lần mỗi lần chạy
`extract` đọc nguồn của mọi chương có số thứ tự ≤ chương lớn nhất của task, đã bỏ phần lời nhắn của tác giả, và
giữ trong bộ nhớ suốt lần chạy. Hàm đếm nhận văn bản này thay cho khúc. Không đọc chương sau chương cuối của task,
để tránh lộ trước nội dung.
- *Phương án khác:* lưu bộ đếm theo dạng trong DB, cộng dồn giữa các lần chạy. Bỏ: thêm bảng và phải xử lý khi
  chương bị sửa hoặc xóa. Đếm lại bằng `indexOf` trên vài MB chữ với vài trăm dạng chỉ mất cỡ mili giây tới vài
  trăm mili giây.

### 2. Đếm dạng dài trước, có che (theo KeywordGacha)
Sắp các dạng theo độ dài giảm dần. Trên mỗi dòng, mỗi lần khớp được thay bằng ký tự không xuất hiện trong văn
bản (`\u0000`) với cùng độ dài, nên dạng ngắn hơn không khớp lại vị trí đó. Câu ngữ cảnh lấy trước khi che.

### 3. Lời nhắn của tác giả: cắt bằng heuristic, chỉ cho bước trích
Tìm từ cuối chương lên dòng ngăn cách khớp `^[\s　]*[―─━\-=＝＊*◇◆□■☆★・]{6,}[\s　]*$`. Nếu phần sau dòng đó
chứa `評価|ブックマーク|感想|レビュー|お願い` thì cắt bỏ phần đó. Bản dịch không bị ảnh hưởng.
- *Phương án khác:* tách phần lời tác giả lúc nhập chương. Bỏ: đụng module Nguồn và dữ liệu đã nhập. Nếu sau này
  module Nguồn tách được phần này thì thay heuristic.

### 4. Lọc rác katakana
Một lần xuất hiện được tính là "dính" khi ký tự ngay sau là hiragana, và phần chữ từ đó không bắt đầu bằng trợ từ
hay hậu tố gọi người: `が の は を に と も へ や で ね よ か さん ちゃん くん さま たち`. Ứng viên bị bỏ khi **mọi**
lần xuất hiện đều dính. Từ tượng thanh: kết thúc bằng `ッ`, hoặc khớp `^(.{1,3})\1+$`.
- *Đánh đổi:* tên kết thúc bằng hiragana thật (hiếm) có thể bị bỏ nếu luôn đi liền một hiragana khác. Lượt quét
  của model vẫn bắt được tên đó, vì dạng của model không qua bộ lọc này.

### 5. Tín hiệu chú âm
Regex `([一-龥々]{1,8})[（(]([ァ-ヶーぁ-ゖ・]{2,})[）)]` và ruby kiểu syosetsu `｜?([一-龥々]+)《([^》]+)》`. Ứng viên
mang tín hiệu `ruby`, cách đọc được gửi kèm trong lô phân loại, và được miễn ngưỡng tần suất.

### 6. Họ thuật ngữ và xếp lô
Gom nhóm bằng union-find trên ứng viên của khúc cộng các mục đã có:
- nối hai dạng khi dạng này là chuỗi con của dạng kia (độ dài ≥ 2);
- hoặc khi hai dạng có chung **ký tự kanji** đầu hay cuối và độ dài chênh nhau ≤ 1.

Katakana không dùng luật chung hậu tố, vì rất nhiều tên cùng kết thúc bằng ン. Nhóm được xếp nguyên vào một lô
(lô tối đa 60 ứng viên); nhóm lớn hơn 60 thì cắt. Mục đã có của nhóm, cộng các mục có chung kanji với ứng viên,
được đưa vào phần `<known>` của lô, tối đa 30 mục, ưu tiên mục cùng nhóm. Đây là dữ liệu đã chốt, model không
được đổi.
- *Phương án khác:* một lời gọi "phán quyết" riêng cho mỗi nhóm như AiNiee. Bỏ: thêm lời gọi. Đưa mục đã chốt vào
  lô đạt cùng mục đích mà không tốn thêm lời gọi.

### 7. `alias_of`
`ExtractedTerm` có thêm `alias_of?: string` (nguồn của mục đã có). Code tra mục theo nguồn hoặc alias. Tìm thấy thì
chuyển dạng đó thành alias của mục, theo cùng luật alias trong `saveExtraction`. Không thấy thì xử lý như ứng
viên mới.

### 8. `saveExtraction` gắn alias thay vì bỏ qua
Khi `ownerOf(source)` trả một mục loại `term`:
- các dạng còn lại (nguồn, alias) chưa có chủ và có nguyên văn trong khúc được chèn vào `context_alias` của mục đó;
- mục `rejected` không nhận alias.

Kết quả trả thêm `aliasesAdded`.

### 9. Kiểm khuôn của họ thuật ngữ
Chạy trên các họ chung kanji đầu hoặc cuối, ở bước 6. Tách bản dịch theo khoảng trắng, so tập từ không phân biệt
hoa thường:
- không có từ chung → lệch khuôn;
- có từ chung nhưng viết hoa khác nhau → lệch khuôn.

Cờ chỉ gắn lên mục mới, vì mục đã có có thể do người dùng sửa.
- *Đánh đổi:* "Tiền sắt" và "Đồng bạc" (鉄貨, 銀貨) bị cờ dù cả hai đều tự nhiên. Chấp nhận, vì cờ chỉ là cảnh
  báo.

### 10. Alias ngắn
Alias có độ dài ≤ 2: quét văn bản toàn phạm vi. Nếu có lần xuất hiện mà ký tự trước hoặc sau cùng hệ chữ (katakana
liền katakana, kanji liền kanji), và chuỗi dài hơn đó không phải nguồn hay alias của mục nào, thì không lưu alias đó
và gắn cờ `short_alias`.

### 11. Cách đọc và giới tính
- Migration 19 (số 18 đã thuộc thay đổi hồ sơ truyện) của file tác phẩm: `ALTER TABLE context_entry ADD COLUMN reading TEXT`. `saveExtraction` ghi cột này
  khi có.
- Phân tích xưng hô: prompt thêm trường `genderEvidence` (câu trích). Code giữ `male`/`female` chỉ khi:
  - câu trích qua được `verifiedQuotes`;
  - câu chứa tên hoặc alias của nhân vật;
  - câu khớp `女|男|娘|少女|少年|彼女|彼(?!女)|母|父|姉|兄|妹|弟`.

  Không thì lưu `unknown`. Danh sách từ nằm trong code, kèm test.

### 12. Cờ mới
Thêm `family_mismatch`, `short_alias` vào `REVIEW_FLAG_CODES`, kèm nhãn trong `reviewFlagLabel`:
- `family_mismatch`: "Lệch khuôn với thuật ngữ cùng họ";
- `short_alias`: `Dạng ngắn "X" dễ khớp nhầm`.

## Risks / Trade-offs

- [Bỏ ngưỡng tần suất cho dạng model quét được có thể tăng số mục hiếm] → Prompt phân loại nghiêng về
  `not-a-term`. Lab đo tỉ lệ `term` là từ thông dụng trước và sau.
- [Đếm toàn phạm vi với tác phẩm hàng nghìn chương có thể chậm] → Đọc văn bản một lần mỗi lần chạy; đo trên tác
  phẩm lớn nhất có sẵn. Nếu quá 1 giây thì giới hạn văn bản đếm ở 300 chương gần nhất kèm comment `shortcut:`.
- [Heuristic lời nhắn tác giả cắt nhầm phần truyện có dòng ngăn cách] → Chỉ cắt khi phần sau chứa từ khóa xin đánh
  giá. Phần bị cắt chỉ ảnh hưởng bước trích, không ảnh hưởng bản dịch.
- [Lọc mục `rejected` khiến một từ bị loại nhầm không bao giờ quay lại] → Giữ nguyên hành vi của change
  `unblock-auto-translate-context`. Sửa loại nhầm thuộc `add-context-progression`.
- [Hash prompt đổi nhưng chương đã quét không được quét lại] → Đúng ý đồ. Người dùng muốn trích lại thì xóa dòng
  "đã quét"; việc này nằm ngoài change.

## Migration Plan

Migration 19 (số 18 đã thuộc thay đổi hồ sơ truyện) chỉ thêm một cột nullable. Rollback bằng bản sao lưu tự động của file tác phẩm như các migration
trước. Không có thay đổi IPC.
