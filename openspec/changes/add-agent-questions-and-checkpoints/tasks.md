## 1. Dữ liệu và contract

- [ ] 1.1 Migration library kế tiếp: `agent_operation.kept_at`, `agent_turn.reverted_at`; fixture schema; test migration/backup
- [ ] 1.2 Contract: `AgentQuestion`, `questions`/`allowSkip` trên pending action, `AgentPendingReply` dạng union có `answers`/`skipped`; bỏ ép kiểu `target` của candidate
- [ ] 1.3 Lệnh IPC: giữ operation theo chương/tất cả, hoàn tác theo chương/tất cả, khôi phục checkpoint, khôi phục và gửi lại

## 2. Câu hỏi trong main

- [ ] 2.1 Schema và tham số mới của `ask_questions` (1–5 câu, kiểu, 2–9 lựa chọn, mặc định, tự do, bắt buộc, `allowSkip`)
- [ ] 2.2 Continuation validate đáp án theo spec, lưu kết quả gửi model với nhãn lựa chọn hoặc `skipped`
- [ ] 2.3 Autopilot trả lời bằng đáp án mặc định, nếu không có thì lựa chọn đầu, đánh dấu `autoAnswered`
- [ ] 2.4 Đọc pending action dạng cũ thành một câu `single`
- [ ] 2.5 Test: hai câu; quá 9 lựa chọn bị từ chối; nhập tự do; bỏ qua; thiếu câu bắt buộc bị từ chối; Autopilot dùng mặc định

## 3. Chương đã sửa và checkpoint trong main

- [ ] 3.1 Truy vấn operation chưa giữ của session gộp theo chương; đưa vào snapshot session
- [ ] 3.2 Giữ: ghi `kept_at`; Hoàn tác theo chương tuần tự dừng ở xung đột đầu tiên
- [ ] 3.3 `checkUndo` không ghi, dùng cùng revision guard với `undoOperation`
- [ ] 3.4 Khôi phục checkpoint: từ chối khi có turn đang chạy, kiểm tra trước mọi operation, hủy turn chờ, hoàn tác ngược, ghi `reverted_at`
- [ ] 3.5 Lịch sử model và snapshot bỏ turn có `reverted_at`
- [ ] 3.6 `revertAndResend` khôi phục rồi tạo turn mới; không gửi khi khôi phục bị từ chối
- [ ] 3.7 Test: thanh qua hai lượt và mở lại app; hoàn tác xung đột; giữ tất cả; khôi phục về lượt 2; xung đột khi khôi phục không đổi gì; lịch sử model sau khôi phục; task bền không bị hủy

## 4. Renderer

- [ ] 4.1 Vùng phía trên ô nhập theo thứ tự: thẻ câu hỏi, thanh chương đã sửa
- [ ] 4.2 Thẻ câu hỏi: bước i/n, Trước/Tiếp/Gửi, phím số, mặc định chọn sẵn, ô nhập tự do/ô chữ, khóa khi thiếu câu bắt buộc, Ctrl+Enter, Bỏ qua tất cả, thu gọn
- [ ] 4.3 Dòng tóm tắt H/Đ hoặc "Đã bỏ qua câu hỏi" tại vị trí call trong luồng trả lời
- [ ] 4.4 Thanh "Đã sửa N chương": mở danh sách, dòng theo chương có Xem/Giữ/Hoàn tác và lý do xung đột, Giữ tất cả/Hoàn tác tất cả
- [ ] 4.5 Checkpoint phía trên mỗi lệnh (hover/focus), "Bắt đầu lại" cho lệnh đầu, hộp xác nhận nêu số chương và task bền, đặt lệnh về ô nhập
- [ ] 4.6 Sửa tại chỗ trên bong bóng lệnh (bấm/Enter/Space, Esc hủy), xác nhận khi có thay đổi, Không hỏi lại lưu `localStorage` bọc try/catch
- [ ] 4.7 Test component: bàn phím của thẻ câu hỏi, thanh chương đã sửa, checkpoint và sửa tại chỗ

## 5. Hoàn tất

- [ ] 5.1 Cập nhật C18, C20, C24 trong `docs/modules/proposals/chat-ui-vscode.md` (C24 không có Làm lại)
- [ ] 5.2 Chạy `node scripts/check.mjs`
