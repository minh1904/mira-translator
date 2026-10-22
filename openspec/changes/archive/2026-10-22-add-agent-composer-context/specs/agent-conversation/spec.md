## MODIFIED Requirements

### Requirement: Context được chụp tại lúc gửi
Composer SHALL hiện chip cho mọi ngữ cảnh sẽ gửi theo capability `agent-composer`: chương đang mở khi đã thêm, vùng chọn, và các đính kèm người dùng thêm bằng nút +; chip gợi ý mờ không được gửi. Main SHALL lưu snapshot context gồm đúng các chip được gửi khi chấp nhận turn; navigation sau đó SHALL không đổi context của turn. Main SHALL cấp một handle cho mỗi tác phẩm hoặc chương trong snapshot (`ctx` cho chương hoặc tác phẩm chính, `ctx2`, `ctx3`… cho đính kèm khác) và SHALL đưa nội dung của mục glossary và cặp xưng hô đính kèm vào prompt của turn; mục không còn ở trạng thái đã duyệt SHALL bị bỏ kèm ghi chú cho model.

#### Scenario: Đổi chương sau khi gửi
- **WHEN** người dùng gửi yêu cầu với chip chương A rồi chuyển UI sang chương B
- **THEN** tool call của turn vẫn dùng chương A và Mở đích quay về A

#### Scenario: Bỏ context chip
- **WHEN** người dùng bỏ chip chương rồi gửi câu hỏi
- **THEN** snapshot của turn không chứa chương đó, model không nhận handle của chương đó và mọi tool cần chương phải qua `resolve_target`

#### Scenario: Hai chương đính kèm
- **WHEN** người dùng gửi "so sánh xưng hô hai chương" với chip chương 3 và chương 5
- **THEN** model nhận hai handle `ctx` và `ctx2` ứng với chương 3 và chương 5
