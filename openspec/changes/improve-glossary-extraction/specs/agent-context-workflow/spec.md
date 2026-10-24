## MODIFIED Requirements

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
