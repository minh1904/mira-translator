## MODIFIED Requirements

### Requirement: Mỗi lượt chụp context giao diện

Mỗi lượt gửi SHALL lưu context tại thời điểm gửi gồm đúng những gì ô nhập sẽ gửi theo capability `agent-composer`: chương đang mở khi chip gợi ý đã được thêm, vùng chọn kèm chương của nó, vị trí con trỏ của chương được gửi, và các đính kèm. Context SHALL là dữ liệu gợi ý để hiểu các từ như “truyện này”, “chương này” và “đoạn này”; context SHALL NOT giới hạn agent chỉ được thao tác các resource đó.

#### Scenario: Gửi rồi đổi chương
- **WHEN** người dùng gửi với chip chương 1 rồi chuyển sang chương 3 trước khi lượt kết thúc
- **THEN** lượt đã gửi vẫn giữ context chương 1 và operation của nó không đổi đích theo giao diện mới

#### Scenario: Gửi từ màn không có tác phẩm
- **WHEN** người dùng gửi từ màn toàn ứng dụng không có tác phẩm đang mở và không thêm chip
- **THEN** lượt được lưu với context rỗng, và yêu cầu cần resource phải tự resolve hoặc hỏi lại

#### Scenario: Chip chương còn mờ
- **WHEN** người dùng ở chương 1, chế độ Agent, không chọn đoạn và chưa bấm chip gợi ý
- **THEN** lượt được lưu với context rỗng dù chương 1 đang mở
