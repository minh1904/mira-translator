## ADDED Requirements

### Requirement: Model phụ
Mục Model › Model phụ SHALL cho chọn kết nối và mục model của kết nối đó, kèm lựa chọn "Dùng model của lượt" để bỏ
chọn. Lựa chọn SHALL tự lưu vào thư viện. Model phụ SHALL được dùng cho việc nền của agent như tóm tắt lịch sử chat,
không dùng cho chat hay dịch. Khi kết nối hoặc mục model đã chọn bị xóa, Model phụ SHALL đọc như chưa đặt.

#### Scenario: Chọn Model phụ
- **WHEN** người dùng chọn OpenRouter › `deepseek/deepseek-v4-flash` ở mục Model phụ
- **THEN** lựa chọn được lưu và lần tóm tắt lịch sử chat sau dùng model đó

#### Scenario: Xóa kết nối của Model phụ
- **WHEN** kết nối đang làm Model phụ bị xóa
- **THEN** mục Model phụ hiện "Dùng model của lượt" và việc tóm tắt dùng model của lượt
