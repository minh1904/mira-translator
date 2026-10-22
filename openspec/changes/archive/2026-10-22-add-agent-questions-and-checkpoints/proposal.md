## Why

Ba phần còn lại của chuẩn VS Code (quyết định 11, 16; yêu cầu C18, C20, C24 trong
`docs/modules/proposals/chat-ui-vscode.md`): câu hỏi của agent hiện chỉ có một câu, chỉ chọn một, không có đáp án mặc
định, không nhập tự do, không bỏ qua được; người dùng không có chỗ nào thấy tổng các chương agent đã sửa trong phiên để
giữ hoặc hoàn tác; và không có cách quay lại một lệnh cũ hoặc sửa lệnh đã gửi như VS Code.

## What Changes

- `ask_questions` nhận tối đa 5 câu, mỗi câu chọn một, chọn nhiều hoặc nhập chữ; có đáp án mặc định, cho nhập câu trả
  lời khác, bắt buộc hay không; cả lượt hỏi có thể bỏ qua.
- Thẻ câu hỏi nằm phía trên ô nhập khi đang chờ: từng câu một, bước `i/n`, Trước/Tiếp, Gửi ở câu cuối (Ctrl+Enter),
  lựa chọn đánh số chọn bằng phím số, Bỏ qua tất cả. Sau khi trả lời, luồng trả lời giữ dòng tóm tắt "H: … / Đ: …".
- Thanh **Đã sửa N chương** phía trên ô nhập: liệt kê chương có operation ghi của session chưa được giữ; mỗi chương
  có Xem, Giữ, Hoàn tác; đầu thanh có Giữ tất cả, Hoàn tác tất cả.
- Checkpoint trước mỗi lệnh: **Khôi phục checkpoint** (lệnh đầu: **Bắt đầu lại**) hoàn tác thao tác ghi của lệnh đó và
  các lệnh sau, ẩn các lượt đó khỏi transcript và khỏi lịch sử model, đưa lệnh về ô nhập. Không có Làm lại vì
  operation journal chưa hỗ trợ redo.
- Sửa lệnh cũ: bấm vào bong bóng lệnh để sửa tại chỗ; gửi lại là khôi phục checkpoint của lệnh đó rồi gửi lệnh mới;
  có xác nhận khi phải hoàn tác thay đổi.
- **BREAKING (nội bộ IPC):** tham số `ask_questions` đổi từ `{ question, options }` sang `{ questions, allowSkip }`;
  câu trả lời câu hỏi gửi `answers` thay cho `choice`.

## Capabilities

### New Capabilities

- `agent-questions`: câu hỏi nhiều bước của agent, cách trả lời, bỏ qua và tóm tắt.
- `agent-edited-chapters`: thanh tổng hợp chương đã sửa trong phiên với Giữ và Hoàn tác.
- `agent-checkpoints`: khôi phục về trước một lệnh và sửa lệnh cũ.

### Modified Capabilities

(không có; các yêu cầu hiện có của `agent-conversation` vẫn đúng)

## Impact

- Library DB: migration kế tiếp thêm `agent_operation.kept_at` và `agent_turn.reverted_at`.
- Main: capability `ask_questions`, continuation nhận `answers`, `undoOperation` theo lô có kiểm tra trước, lịch sử
  model bỏ lượt đã khôi phục, lệnh IPC giữ/hoàn tác/khôi phục.
- Renderer: thẻ câu hỏi, thanh chương đã sửa, checkpoint và sửa tại chỗ trên bong bóng lệnh.
- Phụ thuộc `fix-agent-chat-permissions` (Autopilot trả lời bằng đáp án mặc định), `add-agent-response-parts` (bong
  bóng lệnh, dòng tool để đặt tóm tắt câu hỏi) và `add-agent-composer-context` (sửa tại chỗ dùng lại ô nhập và chip).
