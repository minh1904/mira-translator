# context-progression Specification

## Purpose
Quy định cách mục Context (thuật ngữ, nhân vật, cặp xưng hô) thay đổi khi truyện tiến triển hoặc khi có bằng chứng
mới. Phân biệt sửa sai áp cho cả truyện, diễn tiến áp từ một chương, và thay đổi chỉ trong một cảnh không được làm
đổi glossary. Mọi thay đổi có bằng chứng, lịch sử và chốt chặn.

## Requirements

### Requirement: Thuật ngữ đổi từ chương N
Mira SHALL hỗ trợ đổi một mục thuật ngữ từ chương N trong một transaction của file tác phẩm:
- mục đang có hiệu lực ở N kết thúc ở chương liền trước N;
- một mục mới bắt đầu từ N và kết thúc ở nơi mục cũ từng kết thúc;
- mục mới nối với mục cũ.

Mục mới SHALL mang nguồn, alias, loại và cờ cấm dùng của mục cũ, trừ trường được đổi. Mira SHALL từ chối khi mục
cũ bắt đầu ở N hoặc sau N.

Một dạng viết (nguồn hoặc alias) SHALL được thuộc nhiều mục thuật ngữ chỉ khi phạm vi chương của các mục đó không
chồng nhau. Khi khớp thuật ngữ cho một chương, Mira SHALL chọn mục có phạm vi chứa chương đó.

#### Scenario: Tổ đội đổi bản dịch từ chương 12
- **WHEN** mục 蒼穹の剣 → "Kiếm Thương Khung" không giới hạn phạm vi và nó được đổi thành "Thương Khung Kiếm" từ
  chương 12
- **THEN** mục cũ kết thúc ở chương 11, mục mới bắt đầu ở chương 12, bản chụp chương 11 có bản dịch cũ, bản chụp
  chương 12 có bản dịch mới

#### Scenario: Mục cũ bắt đầu sau N
- **WHEN** mục đang có phạm vi từ chương 15 và yêu cầu đổi từ chương 12
- **THEN** Mira từ chối và không đổi gì

#### Scenario: Alias trùng giữa hai phạm vi
- **WHEN** mục cũ (tới chương 11) và mục mới (từ chương 12) cùng có alias "蒼穹"
- **THEN** cả hai lưu được, và việc khớp ở chương 12 chỉ chọn mục mới

#### Scenario: Alias trùng giữa hai phạm vi chồng nhau
- **WHEN** ghi alias "アキ" cho một mục trong khi "アキ" đã thuộc một mục khác có phạm vi chồng nhau
- **THEN** ghi bị từ chối bằng lỗi xung đột, hoặc ứng viên được lưu với cờ `alias_conflict` khi đó là bước trích

### Requirement: Bước trích đề xuất thay đổi cho mục đã có
Mỗi lô phân loại SHALL kèm tối đa 20 mục đã có, chọn trong các mục có dạng xuất hiện trong khúc theo số lần xuất
hiện giảm dần. Mỗi mục kèm giá trị hiện tại và một câu ngữ cảnh từ khúc. Model MAY trả `revisions`; mỗi thay đổi
SHALL gồm:
- mục được đổi;
- loại `correction` hoặc `progression`;
- các trường mới: bản dịch, ghi chú, alias thêm, hoặc giới tính của nhân vật;
- chương bắt đầu, với `progression`;
- ít nhất một câu chứng nguyên văn kèm số chương.

Thay đổi không thuộc hai loại trên, hoặc thiếu câu chứng có thật trong khúc, SHALL bị bỏ.

#### Scenario: Cách đọc lộ ở chương sau
- **WHEN** mục ミリィ → "Mili" có sẵn và chương 20 có "ミリィ（Milly）", model trả `correction` bản dịch "Milly"
  kèm câu chứng đó
- **THEN** mục được đổi thành "Milly" cho cả tác phẩm và lịch sử ghi giá trị cũ "Mili"

#### Scenario: Thay đổi không có câu chứng
- **WHEN** model trả `correction` mà câu chứng không có trong khúc
- **THEN** mục không đổi và không có lịch sử nào được ghi

### Requirement: Chốt chặn của thay đổi do AI đề xuất
Mira SHALL áp thay đổi do AI đề xuất chỉ khi qua đủ mọi chốt:
- mục chưa được người dùng sửa tay, kể từ khi tạo hoặc kể từ lần sửa tay gần nhất;
- với `progression`, câu chứng thuộc ít nhất 2 chương khác nhau, đều từ chương bắt đầu trở về sau;
- giá trị mới không phải giá trị mà một thay đổi trước đó của AI đã thay đi cho cùng trường đó.

Thay đổi không qua chốt SHALL không đổi mục. Thay vào đó mục SHALL nhận cờ `revision_suggested` mang loại, trường,
giá trị đề xuất, chương bắt đầu và câu chứng. Thay đổi chỉ có bằng chứng trong một cảnh SHALL không đổi glossary.

#### Scenario: Người dùng đã sửa mục
- **WHEN** người dùng đã sửa bản dịch của mục ガイゼル thành "Gaizel", rồi model đề xuất `correction` "Geizel"
- **THEN** mục giữ "Gaizel" và nhận cờ `revision_suggested` với giá trị "Geizel"

#### Scenario: Diễn tiến chỉ thấy ở một chương
- **WHEN** model đề xuất xưng hô A→B đổi từ chương 15, câu chứng chỉ thuộc chương 15
- **THEN** cặp hiện có không đổi và nhận cờ `revision_suggested`

#### Scenario: Lật lại giá trị cũ
- **WHEN** AI đã đổi bản dịch của một mục từ "Lili" sang "Lily", và một lần trích sau đề xuất lại "Lili"
- **THEN** mục giữ "Lily" và nhận cờ `revision_suggested`

### Requirement: Phát hiện xưng hô đổi
Mira SHALL đếm, theo từng chương của task, cách mỗi nhân vật được gọi tên trong lời thoại: tên đi với hậu tố nào
(さん, 様, くん, ちゃん, 先輩, 殿…) hay không có hậu tố. Khi cách gọi chiếm đa số của một nhân vật đổi giữa hai
chương liên tiếp có ít nhất 2 lần gọi mỗi chương, Mira SHALL gửi gợi ý "có thể đổi từ chương N" cho phân tích xưng
hô. Phân tích MAY trả một cặp kèm chương bắt đầu. Cặp đó SHALL được áp như đổi xưng hô từ chương N, chịu cùng chốt
chặn ≥ 2 chương. Gợi ý một mình SHALL không đổi cặp nào.

#### Scenario: Từ họ kèm さん sang gọi tên
- **WHEN** chương 1–9 gọi "桐谷さん" và chương 10–12 gọi "彰", rồi phân tích trả cặp mới từ chương 10 với câu chứng ở
  chương 10 và 11
- **THEN** cặp cũ kết thúc ở chương 9 và cặp mới bắt đầu ở chương 10

#### Scenario: Đổi trong một cảnh
- **WHEN** chỉ chương 7 có một cảnh gọi trống tên khi cãi nhau, chương 8 quay lại "桐谷さん"
- **THEN** không có gợi ý đổi và cặp không đổi

### Requirement: Lịch sử thay đổi của mục
Mỗi lần mục Context bị đổi, Mira SHALL ghi một bản lịch sử gồm:
- nguồn thay đổi: AI, người dùng, hoặc tín hiệu sửa tay;
- trường, giá trị cũ và giá trị mới;
- loại thay đổi và chương bắt đầu, nếu có;
- câu chứng và định danh lần chạy, nếu có;
- thời điểm.

Mỗi lần người dùng sửa mục SHALL cập nhật mốc "người dùng sửa". Màn Từ điển SHALL hiện lịch sử của mục, mới nhất
trước. Xóa mục SHALL xóa lịch sử của nó.

#### Scenario: Xem lịch sử
- **WHEN** mục ミリィ do AI tạo là "Mili", sau đó AI sửa thành "Milly"
- **THEN** lịch sử của mục có hai dòng theo thứ tự mới nhất trước, dòng sửa có câu chứng từ chương 20

### Requirement: Chương bị ảnh hưởng bởi sửa sai
Sau khi một mục thuật ngữ hay nhân vật bị đổi theo kiểu `correction`, Mira SHALL tính các chương đã có bản dịch mà
văn bản nguồn chứa nguồn hoặc alias của mục, và hiện danh sách đó cùng mục. Mira SHALL không tự sửa bản dịch nào.
Hành động "Dịch lại các chương này" SHALL tạo task dịch cho đúng các chương đó, dùng Context hiện tại, và SHALL đòi
xác nhận vì ghi đè bản dịch có sẵn. Thay đổi `progression` SHALL không tạo danh sách chương bị ảnh hưởng.

#### Scenario: Sửa tên sau khi đã dịch 20 chương
- **WHEN** mục ミリィ được sửa thành "Milly" và "ミリィ" có trong nguồn của chương 3, 8, 15 đã dịch
- **THEN** mục hiện danh sách 3 chương, và không bản dịch nào đổi khi người dùng chưa xác nhận dịch lại

#### Scenario: Xác nhận dịch lại
- **WHEN** người dùng xác nhận "Dịch lại các chương này"
- **THEN** một task dịch gồm chương 3, 8, 15 được tạo, không thêm chương nào khác

### Requirement: Cập nhật code tự làm
Mira SHALL tự thực hiện các cập nhật sau, không gọi model, và ghi lịch sử cho mỗi cập nhật:
- **Alias từ tên đầy đủ.** Với mục loại người có nguồn chứa ・ hoặc ＝, mỗi phần tên dài ≥ 2 ký tự có ít nhất 2 lần
  xuất hiện riêng trong chương đã quét SHALL thành alias. Các dạng "tên + hậu tố gọi người" có thật cũng SHALL thành
  alias. Phần tên đã thuộc một mục khác có phạm vi chồng nhau SHALL không được gắn, và mục nhận cờ `alias_conflict`.
- **Quét lại khi nguồn đổi.** Khi văn bản nguồn của một chương được ghi với nội dung khác trước, chương đó SHALL mất
  dấu "đã quét".
- **Học từ sửa tay.** Khi người dùng lưu bản dịch, Mira SHALL tìm các đoạn mà nguồn chứa dạng của một mục và bản
  dịch trước đó chứa bản dịch X của mục, nhưng bản mới bỏ X và thêm một chuỗi Y ở cùng chỗ. Khi cùng cặp X → Y của
  một mục xuất hiện ở ít nhất 2 chương khác nhau, Mira SHALL đổi bản dịch của mục thành Y theo kiểu `correction`,
  với nguồn thay đổi là tín hiệu sửa tay. Thay đổi này SHALL không tạo hành động dịch lại tự động.

#### Scenario: Tách họ và tên
- **WHEN** mục セレナ・ヴァルトハイム có trong tác phẩm, "セレナ" xuất hiện riêng 12 lần, "ヴァルトハイム" riêng 1 lần
- **THEN** "セレナ" thành alias, "ヴァルトハイム" thì không

#### Scenario: Tác giả sửa chương 5
- **WHEN** module Nguồn ghi văn bản mới khác bản cũ cho chương 5 đã quét
- **THEN** lần trích sau gửi chương 5 cho model

#### Scenario: Sửa tay một chương
- **WHEN** người dùng đổi "Sylphia" thành "Sylphie" trong bản dịch chương 4
- **THEN** mục không đổi

#### Scenario: Sửa tay hai chương
- **WHEN** người dùng đổi "Sylphia" thành "Sylphie" ở chương 4 rồi ở chương 6
- **THEN** mục シルフィア có bản dịch "Sylphie", lịch sử ghi nguồn sửa tay, và danh sách chương bị ảnh hưởng được
  tính
