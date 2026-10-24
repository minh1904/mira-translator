## Purpose

Quy định cách bước trích của Mira sinh, lọc, phân loại, kiểm và lưu thuật ngữ từ chương nguồn, sao cho mục
có hiệu lực ngay vẫn đủ chắc và nhất quán khi không còn bước duyệt.

## ADDED Requirements

### Requirement: Tần suất ứng viên đếm trên toàn phạm vi
Mira SHALL đếm số lần xuất hiện của ứng viên do code sinh trên mọi chương nguồn của tác phẩm, từ chương đầu tới
chương cuối của task, không riêng khúc đang quét. Mira SHALL đếm dạng dài trước và SHALL không tính một lần xuất
hiện của dạng ngắn khi vị trí đó đã thuộc một dạng dài hơn đã đếm. Ứng viên code SHALL cần ít nhất 2 lần xuất
hiện. Dạng do model quét tìm được SHALL chỉ cần có nguyên văn ít nhất một lần trong các chương đã quét.

#### Scenario: Tên xuất hiện một lần ở mỗi khúc
- **WHEN** katakana "ミリィ" xuất hiện một lần ở chương 2 (khúc 1) và một lần ở chương 30 (khúc 2)
- **THEN** khi quét khúc 2, "ミリィ" có tần suất 2 và được gửi phân loại

#### Scenario: Dạng ngắn nằm trong dạng dài
- **WHEN** văn bản có "田中太郎" 5 lần và "田中" đứng riêng 1 lần
- **THEN** "田中" có tần suất 1, không phải 6

#### Scenario: Tổ chức model tìm thấy một lần
- **WHEN** lượt quét trả "王立回復術師協会" và dạng này có nguyên văn đúng một lần trong khúc
- **THEN** dạng được gửi phân loại

#### Scenario: Dạng model bịa
- **WHEN** lượt quét trả một dạng không có nguyên văn trong khúc
- **THEN** dạng bị bỏ trước bước phân loại

### Requirement: Lọc ứng viên rác bằng code
Trước khi gửi phân loại, Mira SHALL bỏ các ứng viên code thuộc một trong các loại sau:
- chuỗi katakana mà mọi lần xuất hiện đều nối liền chữ hiragana phía sau như một động từ hay tính từ đang chia
  (バレる, キレた);
- chuỗi tượng thanh, tượng hình: kết thúc bằng ッ, hoặc gồm một cụm 2 ký tự lặp lại (ゴチャゴチャ);
- chuỗi chỉ xuất hiện trong phần lời nhắn của tác giả.

Phần lời nhắn của tác giả là đoạn ở cuối chương, sau một dòng ngăn cách chỉ gồm ký tự gạch hoặc ký hiệu, khi đoạn
đó chứa lời kêu gọi đánh giá, ghi dấu hoặc bình luận. Phần này SHALL không gửi cho lượt quét.

#### Scenario: Mảnh động từ
- **WHEN** "バレ" chỉ xuất hiện trong "バレる", "バレた"
- **THEN** "バレ" không được gửi phân loại

#### Scenario: Từ tượng hình
- **WHEN** "ゴチャゴチャ" xuất hiện 3 lần
- **THEN** "ゴチャゴチャ" không được gửi phân loại

#### Scenario: Lời nhắn cuối chương
- **WHEN** chương kết thúc bằng dòng "――――――――", tiếp theo là 【感謝＆大切なお願い】 và "クリック", "レビュー"
- **THEN** lượt quét không nhận đoạn này và "クリック", "レビュー" không thành ứng viên

#### Scenario: Tên viết katakana được giữ
- **WHEN** "ミリィ" có lúc đứng trước "が", lúc đứng cuối câu
- **THEN** "ミリィ" vẫn là ứng viên

### Requirement: Tín hiệu chú âm
Mira SHALL coi một chuỗi kanji có chú âm là ứng viên mang tín hiệu chú âm, bất kể tần suất. Chú âm gồm katakana
hoặc hiragana trong ngoặc tròn toàn góc đứng ngay sau chuỗi kanji, hoặc ruby. Phần chú âm SHALL được gửi kèm ứng
viên làm cách đọc.

#### Scenario: Tên kỹ năng có chú âm
- **WHEN** văn bản có "診断（スキャン）" một lần
- **THEN** "診断" thành ứng viên với cách đọc "スキャン"

### Requirement: Không phân loại lại mục đã có
Mira SHALL không gửi phân loại các ứng viên trùng nguồn hoặc alias của một mục thuật ngữ đã có trong tác phẩm,
kể cả mục `rejected`. So khớp không phân biệt hoa thường.

#### Scenario: Nhân vật chính ở khúc sau
- **WHEN** "ノエル" đã là alias của mục "ノエル・アーデン" và khúc 3 có "ノエル" 40 lần
- **THEN** lô phân loại của khúc 3 không chứa "ノエル"

### Requirement: Phân loại theo họ thuật ngữ, kèm mục đã có
Mira SHALL xếp vào cùng một lô các ứng viên thuộc một họ thuật ngữ. Họ thuật ngữ gồm các dạng là chuỗi con của
nhau, hoặc có chung một hậu tố hay tiền tố kanji ít nhất 1 ký tự và cùng độ dài ±1 (銀級, 鉄級, 金級). Mỗi lô SHALL
kèm tối đa 30 mục đã có có nguồn hoặc bản dịch liên quan tới ứng viên của lô, đánh dấu là đã chốt. Model SHALL được
trả `alias_of` để gắn một dạng vào mục đã có. Prompt SHALL yêu cầu:
- chỉ nhận một từ làm `term` khi nó là khái niệm riêng của thế giới truyện cần dịch thống nhất;
- trả `not-a-term` cho từ thông dụng có cách dịch tùy ngữ cảnh;
- trả `not-a-term` khi không chắc.

#### Scenario: Họ cấp bậc
- **WHEN** khúc có ứng viên 銀級, 鉄級, 金級 và glossary đã có 銅級 → "Cấp Đồng"
- **THEN** ba ứng viên nằm cùng một lô, và lô kèm mục 銅級 như mục đã chốt

#### Scenario: Biến thể của mục đã có
- **WHEN** model trả "ハルネ村" với `alias_of` là mục đã có "ハルネ"
- **THEN** "ハルネ村" được thêm làm alias của mục "ハルネ", không tạo mục mới

#### Scenario: alias_of trỏ tới mục không có
- **WHEN** model trả `alias_of` không khớp nguồn của mục nào đã có
- **THEN** Mira xử lý dạng đó như một ứng viên mới bình thường

### Requirement: Kiểm khuôn của họ thuật ngữ và alias ngắn
Sau phân loại, Mira SHALL so khuôn bản dịch giữa các thành viên của một họ chung hậu tố hoặc tiền tố (mục mới với
mục mới, và mục mới với mục đã có). Họ chỉ gồm chuỗi con của nhau thì không so. Hai bản dịch cùng khuôn khi có
chung ít nhất một từ (so không phân biệt hoa thường) và mọi từ chung đó viết hoa giống nhau ở cả hai bản. Lệch
khuôn thì Mira SHALL gắn cờ `family_mismatch` lên các mục mới liên quan và SHALL không tự sửa bản dịch.

Một alias dài ≤ 2 ký tự mà có xuất hiện ở vị trí nằm bên trong một chuỗi katakana hay kanji dài hơn không thuộc mục
nào SHALL không được lưu làm alias, và mục SHALL mang cờ `short_alias` nêu dạng đó.

#### Scenario: Hạng và Cấp
- **WHEN** 銀級 → "Hạng Bạc" và 鉄級 → "Cấp Sắt" trong cùng một họ
- **THEN** cả hai mục mang cờ `family_mismatch` và bản dịch giữ nguyên

#### Scenario: Khác hoa thường
- **WHEN** 第二級魔術 → "Ma thuật Cấp Hai" và 第三級魔術 → "Ma thuật cấp Ba"
- **THEN** cả hai mục mang cờ `family_mismatch`

#### Scenario: Alias ngắn đụng từ thường
- **WHEN** mục "セラフィナ" có alias đề xuất "セラ" và văn bản có "セラミック"
- **THEN** "セラ" không được lưu làm alias và mục mang cờ `short_alias` nêu "セラ"

### Requirement: Cách đọc tên người được lưu
Khi model trả cách đọc cho mục loại người, hoặc ứng viên có tín hiệu chú âm, Mira SHALL lưu cách đọc bằng kana
cùng mục. Cách đọc SHALL không vào prompt dịch.

#### Scenario: Tên kanji có cách đọc
- **WHEN** model trả `source: "桐谷彰"`, `reading: "きりたにあきら"`, `target: "Kiritani Akira"`
- **THEN** mục lưu cách đọc "きりたにあきら"

### Requirement: Giới tính cần câu chứng
Khi phân tích xưng hô gán giới tính `male` hoặc `female` cho một nhân vật, Mira SHALL đòi kèm một câu trích
nguyên văn có tên hoặc alias của nhân vật cùng một từ chỉ giới tính (女, 男, 娘, 少女, 少年, 彼女, 彼…). Câu trích
SHALL có thật trong chương đã gửi. Đại từ xưng 僕, 俺, 私 SHALL không được tính là bằng chứng. Thiếu bằng chứng
hợp lệ thì giới tính là `unknown`.

#### Scenario: Nữ xưng 僕
- **WHEN** model trả Morgreid `female`, kèm câu chứng "僕は女の子" từ chương 3
- **THEN** nhân vật được lưu `female`

#### Scenario: Chỉ dựa vào đại từ xưng
- **WHEN** model trả `male` cho nhân vật, câu chứng duy nhất là "僕が行く"
- **THEN** nhân vật được lưu `unknown`
