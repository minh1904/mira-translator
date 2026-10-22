## Context

- `ask_questions` (thêm 2026-10-22) nhận `{ question, options }`; pending action `kind: 'question'` dùng chung
  `candidates` với `resolve_target`, câu trả lời là `choice` một chuỗi. Candidate được ép kiểu
  `target: undefined as unknown as ResolvedTarget`.
- `undoOperation(operationId)` trong `agentService.ts` hoàn tác một operation qua journal/checkpoint với revision guard;
  không có redo.
- `agent_operation` có `turn_id` và `target_json`; session snapshot đã trả operation của session.
- Lịch sử model lấy từ `listTurns(sessionId)` lọc turn có `answer`.

## Goals / Non-Goals

**Goals:**
- Pending action câu hỏi có contract riêng, không mượn `candidates` của chọn đích.
- Khôi phục checkpoint là thao tác tất cả hoặc không về mặt nội dung chương.
- Giữ dữ liệu lượt đã khôi phục để audit; chỉ ẩn khỏi giao diện và prompt.

**Non-Goals:**
- Làm lại sau khi khôi phục (cần redo trong journal).
- Xem diff chương trong thanh chương đã sửa: Xem mở chương; diff để change sau nếu editor có chế độ so sánh.
- Fork hội thoại (VS Code "Fork Conversation").
- Hủy task dịch bền khi khôi phục: task có vòng đời riêng (quyết định 4).

## Decisions

**D1. Contract câu hỏi riêng.** `AgentPendingAction` thêm `questions?: AgentQuestion[]` và `allowSkip?` cho
`kind: 'question'`; `candidates` chỉ còn cho `choose`. `AgentPendingReply` thành union: `{ choice }` cho duyệt/chọn đích,
`{ answers: Record<string, string | string[]> }` hoặc `{ skipped: true }` cho câu hỏi. Validate ở main theo spec trong
cùng transaction với cập nhật call. Kết quả gửi model: `{ answers: [{ id, title, answer }] }` hoặc `{ skipped: true }`,
có `autoAnswered: true` khi Autopilot trả lời.

**D2. Thẻ câu hỏi đặt trong khu phía trên ô nhập.** Composer có một vùng "trên ô nhập" xếp theo thứ tự VS Code: thẻ câu
hỏi, rồi thanh chương đã sửa. Thẻ đọc pending action của session từ store; dòng tóm tắt trong luồng trả lời dựng từ kết
quả đã lưu của tool call (`add-agent-response-parts`), không cần dữ liệu mới.

**D3. Giữ là cột trên operation.** `agent_operation.kept_at INTEGER`. Thanh chương đã sửa là truy vấn: operation của
session, state `completed | partially_completed`, `kept_at IS NULL`, gộp theo `target` chương. Không thêm bảng
working set: operation đã là nguồn sự thật cho thay đổi.

**D4. Hoàn tác theo lô có kiểm tra trước.** Thêm `checkUndo(operationId)` dùng cùng revision guard với `undoOperation`
nhưng không ghi. Khôi phục checkpoint và Hoàn tác tất cả gọi `checkUndo` cho mọi operation trước, rồi hoàn tác theo thứ tự
ngược trong write lease của từng tác phẩm. Hoàn tác một chương ở thanh thì chạy tuần tự và dừng ở xung đột đầu tiên
(spec cho phép một phần). Rủi ro chương đổi giữa lúc kiểm tra và lúc hoàn tác được revision guard chặn; khi đó dừng và
báo, các operation đã hoàn tác giữ nguyên trạng thái đã hoàn tác và vẫn hoàn tác được thêm lần nữa từ thanh.

**D5. Đánh dấu lượt đã khôi phục bằng cột.** `agent_turn.reverted_at INTEGER` thay vì thêm trạng thái, vì CHECK của
`status` buộc dựng lại bảng. `listTurns` cho prompt và snapshot lọc `reverted_at IS NULL`; lệnh khôi phục kiểm tra không
có turn `queued/running`, hủy turn `waiting_user` trước.

**D6. Sửa tại chỗ dùng lại ô nhập.** Bong bóng lệnh chuyển sang một instance `AgentComposer` ở chế độ sửa, với draft
riêng theo `turnId`. Gửi gọi lệnh IPC `turns.revertAndResend({ turnId, instruction, context })` để khôi phục và tạo turn
mới trong một lần gọi; nếu khôi phục bị từ chối vì xung đột thì không gửi. "Không hỏi lại" lưu `localStorage` bọc
try/catch.

## Risks / Trade-offs

- [Không có Làm lại nên khôi phục nhầm là mất thay đổi] → hộp xác nhận nêu số chương bị hoàn tác; dữ liệu lượt vẫn còn
  trong DB.
- [Task bền vẫn chạy và tiếp tục ghi chương sau khi khôi phục] → hộp xác nhận nói rõ; người dùng dừng task ở màn Tác vụ.
- [Đổi contract `ask_questions` làm turn đang chờ với dạng cũ không trả lời được] → main đọc pending action dạng cũ
  `{ question, options }` thành một câu `single` khi dựng snapshot.

## Migration Plan

Migration library kế tiếp sau `add-agent-response-parts`: `ALTER TABLE agent_operation ADD COLUMN kept_at INTEGER`,
`ALTER TABLE agent_turn ADD COLUMN reverted_at INTEGER`; fixture schema, test migration và backup.
