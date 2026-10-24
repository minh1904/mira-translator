# agent-context-workflow Specification

## Purpose
TBD - created by archiving change add-agent-context-workflow. Update Purpose after archive.

## Requirements

### Requirement: Task dịch mặc định trích glossary khi tác phẩm chưa có
Lệnh tạo task dịch MAY mang lựa chọn Context (`contextStrategy`): trích thuật ngữ rồi duyệt, hoặc dịch ngay bằng
Context đã duyệt. Khi lệnh không mang lựa chọn, Mira SHALL trích thuật ngữ trước nếu tác phẩm chưa có mục
thuật ngữ nào đã duyệt hoặc đang chờ duyệt, và SHALL dịch ngay bằng Context đã duyệt nếu đã có. Khi task được
yêu cầu từ chat, model SHALL chỉ chọn dịch ngay khi người dùng nói rõ không trích (quyết định của chủ sản phẩm,
2026-10-14; thay quy tắc "không có mặc định" của change `add-agent-context-workflow`).

#### Scenario: Dịch ngay bằng Context đã duyệt
- **WHEN** người dùng chọn dịch ngay bằng Context đã duyệt
- **THEN** task không gọi model trích thuật ngữ và mỗi item dùng bản chụp Context đã duyệt khi bắt đầu chạy

#### Scenario: Yêu cầu từ chat cho tác phẩm chưa có glossary
- **WHEN** người dùng nhắn "dịch chương 1–30" cho tác phẩm chưa có thuật ngữ nào và không nói gì về Context
- **THEN** task được tạo với lựa chọn trích thuật ngữ rồi duyệt, và bước trích chạy trước item đầu

#### Scenario: Tác phẩm đã có glossary
- **WHEN** lệnh tạo task không mang lựa chọn và tác phẩm đã có mục thuật ngữ đã duyệt hoặc đang chờ duyệt
- **THEN** task dịch ngay bằng Context đã duyệt, không gọi model trích thuật ngữ

#### Scenario: Lựa chọn không hợp lệ
- **WHEN** lệnh tạo task mang `contextStrategy` không thuộc hai giá trị đã định
- **THEN** Mira từ chối lệnh bằng lỗi kiểm tra và không tạo task

### Requirement: Trích thuật ngữ lưu ứng viên có bằng chứng
Khi task chọn trích thuật ngữ, Mira SHALL quét các chương trong phạm vi task chưa từng được quét và lưu mỗi
ứng viên thành mục Context `pending`, `origin = ai`, kèm loại thuật ngữ và ít nhất một bằng chứng gồm định danh
lần chạy, chương, câu trích nguyên văn, model và hash prompt. Mira SHALL ghi nhận chương đã quét để lần sau
không quét lại. Mỗi lời gọi model trích thuật ngữ SHALL được tính vào ngân sách của task và kiểm trước request.
Lỗi trích thuật ngữ SHALL không thay đổi mục Context đã có.

#### Scenario: Thuật ngữ mới từ chương 3
- **WHEN** model đề xuất một tên riêng xuất hiện ở chương 3
- **THEN** Mira lưu mục `pending` với câu trích từ chương 3, định danh lần chạy, model và hash prompt

#### Scenario: Trích tăng dần
- **WHEN** chương 1–10 đã được quét và task mới gồm chương 1–20 chọn trích thuật ngữ
- **THEN** Mira chỉ gửi chương 11–20 cho model

#### Scenario: Chạm trần ngân sách khi đang trích
- **WHEN** lời gọi trích tiếp theo sẽ vượt trần lời gọi của task
- **THEN** task chuyển `paused` với reason `budget` trước request, và các chương chưa quét vẫn được quét khi tiếp tục

#### Scenario: Model lỗi giữa chừng
- **WHEN** provider trả lỗi khi đang trích chương 5
- **THEN** mục đã duyệt không đổi và chương 5 không được ghi là đã quét

### Requirement: Kiểm ứng viên bằng code trước khi lưu
Khi ứng viên trùng nguồn hoặc alias của một mục thuật ngữ đã có, Mira SHALL không tạo mục mới. Các dạng khác của
ứng viên (nguồn hoặc alias), nếu có nguyên văn trong chương đã quét và chưa thuộc mục nào, SHALL được thêm làm
alias của mục đã có. Mục `rejected` SHALL không được mở lại. Khi alias của ứng viên đã thuộc một mục khác, Mira
SHALL vẫn lưu ứng viên, kèm cờ `alias_conflict`, và không báo lỗi ghi. Mira SHALL gắn cờ `script_mismatch` và không
tự sửa khi:
- tên Nhật có bản dịch không phải chữ Latin;
- tên Trung có bản dịch không phải chữ tiếng Việt.

Ứng viên mà model phân loại là không phải thuật ngữ SHALL được lưu `rejected`, để không đề xuất lại.

#### Scenario: Alias trùng với mục khác
- **WHEN** ứng viên "彰" có alias "アキ" trong khi "アキ" đã là alias của một mục khác
- **THEN** ứng viên được lưu không kèm alias đó, mang cờ `alias_conflict` nêu "アキ", và lần trích không lỗi

#### Scenario: Dạng mới của mục đã có
- **WHEN** mục "ノエル・アーデン" đã có và ứng viên "ノエル・アーデン" mang alias "ノエル様" có trong chương 5
- **THEN** không có mục mới, và "ノエル様" thành alias của mục đã có

#### Scenario: Mục đã loại không quay lại
- **WHEN** model đề xuất lại "先生" đã bị loại, với câu trích từ một chương mới
- **THEN** Mira không tạo mục mới và mục cũ vẫn `rejected`

#### Scenario: Tên Trung bị phiên âm Latin
- **WHEN** tác phẩm tiếng Trung có ứng viên loại người với bản dịch "Li Wei"
- **THEN** ứng viên được lưu với cờ `script_mismatch` và bản dịch giữ nguyên

### Requirement: Task chờ duyệt không giữ tài nguyên
Sau bước trích xuất ngữ cảnh, Mira SHALL lưu các mục trích xuất trực tiếp ở trạng thái có hiệu lực và tiếp tục chạy các item dịch của task mà không dừng lại chuyển sang `waiting_user(context_review)`. Hệ thống SHALL không giữ provider request, write intent hay khóa editor giữa các bước. Hủy task SHALL không xóa các mục ngữ cảnh đã trích xuất.

#### Scenario: Đóng app khi chờ duyệt
- **WHEN** app đóng lúc task đang chạy hoặc tạm dừng rồi mở lại
- **THEN** các mục ngữ cảnh đã trích xuất còn nguyên và task phục hồi theo đúng trạng thái bền

#### Scenario: Không có ứng viên mới
- **WHEN** bước trích không tạo mục mới nào
- **THEN** task chạy item đầu tiên mà không dừng chờ duyệt

#### Scenario: Trích xuất không chặn trong pipeline tự động
- **WHEN** task dịch hoàn tất bước trích xuất và có thuật ngữ hoặc cặp xưng hô mới
- **THEN** các mục mới được lưu vào kho tác phẩm ở trạng thái có hiệu lực và task lập tức bắt đầu chạy dịch item đầu tiên mà không chuyển sang `waiting_user`

### Requirement: Chỉ mục đã duyệt và đúng phạm vi vào prompt
Mira SHALL dựng Context của mỗi item bằng resolver hiện có (`getEffectiveGlossary`, `getEffectiveDyadsForChapter`) qua `takeContextSnapshot`, đưa mọi mục ngữ cảnh có hiệu lực (`approved`, tức không bị `rejected`) và có phạm vi chứa chương của item vào prompt. Mục cấm dùng (`forbidden`) vẫn vào prompt nhưng dưới dạng chỉ dẫn "không dùng bản dịch này". Mira SHALL đưa xưng hô trong lời thoại và đại từ người kể vào prompt như hai chỉ dẫn có nhãn riêng và SHALL không áp phép thay chuỗi nào lên bản dịch. Mira SHALL coi Context đã đổi khi hash bản chụp dựng từ kho khác hash bản chụp đã ghim của item.

#### Scenario: Mục model gọi là không phải thuật ngữ
- **WHEN** bước trích lưu 12 ứng viên, trong đó 2 mục model gọi là `not-a-term` (lưu `rejected`)
- **THEN** bản chụp của item chứa 10 mục còn lại cùng các mục có sẵn, không chứa 2 mục `rejected`

#### Scenario: Mục cấm dùng
- **WHEN** một thuật ngữ được đánh dấu cấm dùng
- **THEN** prompt đưa nó vào nhóm chỉ dẫn cấm dùng, không đưa vào nhóm thuật ngữ phải theo

#### Scenario: Mục ngoài phạm vi
- **WHEN** mục chỉ áp dụng chương 1–10 và item là chương 11
- **THEN** mục không có trong bản chụp của chương 11

#### Scenario: Bố trong lời thoại, ông trong lời kể
- **WHEN** cặp A→B có `recipientPronoun = "bố"` và nhân vật B có `thirdPerson = "ông"`
- **THEN** prompt gửi cả hai, mỗi giá trị kèm nhãn lời thoại hoặc lời kể, và không có phép thay chuỗi nào

#### Scenario: Xóa chương làm mốc phạm vi
- **WHEN** mục có phạm vi tới chương 10 và chương 10 bị xóa
- **THEN** mốc cuối thành không giới hạn nên mục áp cho các chương sau, item đã ghim bản chụp không đổi, còn item bắt đầu sau đó nhận mục

### Requirement: Tab Ngữ cảnh chỉ hiện Context đang áp dụng
Trong màn chương, tab Ngữ cảnh của side panel SHALL hiển thị Context đang áp dụng cho chương hiện tại, dựng bằng cùng hàm với bản chụp dịch, và SHALL chỉ đọc. Màn Từ điển và Xưng hô của tác phẩm SHALL là bảng phẳng hiển thị các mục ngữ cảnh có hiệu lực, không có bộ lọc trạng thái duyệt và không có các nút thao tác duyệt/từ chối.

#### Scenario: Mở duyệt từ activity
- **WHEN** activity báo task đã trích xuất thêm các mục ngữ cảnh và người dùng bấm xem
- **THEN** màn Từ điển của đúng tác phẩm mở ra hiển thị toàn bộ danh sách ngữ cảnh

#### Scenario: Mục bị loại không hiện là đang áp dụng
- **WHEN** một mục ngữ cảnh bị `rejected` hoặc nằm ngoài phạm vi chương hiện tại
- **THEN** tab Ngữ cảnh không liệt kê mục đó, và bảng phẳng của màn Từ điển/Xưng hô cũng ẩn mục `rejected`

### Requirement: Dữ liệu cũ chờ duyệt có hiệu lực
Mira SHALL chuyển mọi mục ngữ cảnh còn `pending` của tác phẩm cũ thành `approved` bằng migration của file tác phẩm, và SHALL giữ nguyên các mục `rejected`. Bước trích SHALL không mở lại mục `rejected`, kể cả khi có trích dẫn từ chương mới. Thuật ngữ do trợ lý chat thêm (`propose_glossary_term`) SHALL có hiệu lực ngay.

#### Scenario: Mở tác phẩm có mục chờ duyệt từ trước
- **WHEN** file tác phẩm ở schema 16 có một mục `pending` và một mục `rejected`
- **THEN** sau migration lên 17, mục `pending` thành `approved` còn mục `rejected` giữ nguyên

#### Scenario: Mục bị loại gặp lại ở chương mới
- **WHEN** bước trích gặp lại nguồn của một mục `rejected` với trích dẫn từ chương mới
- **THEN** mục đó vẫn `rejected` và không vào prompt
