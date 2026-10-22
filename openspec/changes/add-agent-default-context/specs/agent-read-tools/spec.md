## Purpose

Quy định các capability đọc giúp agent nắm trạng thái một tác phẩm trong ít vòng model: tổng quan tác phẩm trong một
lần gọi, glossary và xưng hô ở cấp tác phẩm, và lỗi validation chỉ rõ cách sửa để model không mất vòng.

## ADDED Requirements

### Requirement: Tổng quan tác phẩm trong một lần gọi
Agent SHALL có capability đọc `get_work_overview` nhận handle tác phẩm hoặc chương và trả về cho tác phẩm đó: tên,
ngôn ngữ nguồn, tổng số chương, số chương đã có bản dịch, số chương chưa có bản dịch, số chương đầu tiên chưa dịch,
số mục glossary theo từng trạng thái (đã duyệt, chờ duyệt, đã loại), số cặp xưng hô, và danh sách task dịch của tác
phẩm với trạng thái và dải chương. Capability SHALL thuộc loại đọc, được policy cho phép ở mọi mức quyền và mọi chế
độ, và SHALL không trả nội dung chương. Chương "đã có bản dịch" SHALL là chương có ít nhất một đoạn có bản dịch.

#### Scenario: Tác phẩm mới nhập
- **WHEN** model gọi `get_work_overview` với handle của "New" có 30 chương chưa dịch, glossary rỗng, chưa có task
- **THEN** kết quả có 30 chương, 0 đã dịch, chương đầu chưa dịch là 1, mọi số mục glossary bằng 0 và danh sách task
  rỗng

#### Scenario: Handle chương
- **WHEN** model gọi `get_work_overview` với handle của chương 5
- **THEN** kết quả là tổng quan của tác phẩm chứa chương 5

#### Scenario: Ở chế độ Ask
- **WHEN** lượt ở chế độ Ask và model gọi `get_work_overview`
- **THEN** call chạy và không tạo operation nào

### Requirement: Glossary và xưng hô đọc được ở cấp tác phẩm
`list_glossary` và `list_addressing` SHALL nhận handle tác phẩm hoặc chương. Với handle chương, kết quả SHALL như
hiện tại: mục hiệu lực cho chương đó. Với handle tác phẩm, kết quả SHALL là các mục đã duyệt áp dụng cho toàn tác
phẩm, kèm phạm vi chương của từng mục nếu mục đó chỉ áp dụng cho một dải chương.

#### Scenario: Đọc glossary cấp tác phẩm
- **WHEN** model gọi `list_glossary` với handle tác phẩm "New" có 3 mục đã duyệt
- **THEN** call thành công và trả 3 mục kèm phạm vi chương

#### Scenario: Đọc glossary cấp chương
- **WHEN** model gọi `list_glossary` với handle chương 12
- **THEN** kết quả là các mục hiệu lực cho chương 12

### Requirement: Lỗi validation của capability đọc chỉ cách sửa
Khi một capability đọc từ chối tham số hoặc loại target, lỗi trả cho model SHALL nêu loại target hoặc tham số cần
có và cách lấy (ví dụ dùng handle `ctx` hoặc gọi `resolve_target` với mô tả chương), để model sửa được ở vòng kế
tiếp mà không phải đoán.

#### Scenario: Thiếu chương
- **WHEN** model gọi `read_chapter` với handle tác phẩm
- **THEN** lỗi trả về nói capability cần handle chương và gợi ý gọi `resolve_target` với mô tả chương
