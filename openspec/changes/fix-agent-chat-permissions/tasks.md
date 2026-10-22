## 1. Dữ liệu

- [x] 1.1 Thêm migration library kế tiếp: `agent_turn.mode`, `agent_turn.permission_level`, `agent_session.permission_level`, `agent_tool_call.approval`, bảng `agent_session_approval`; thêm fixture schema
- [x] 1.2 Cập nhật test migration và backup library theo mẫu bản trước
- [x] 1.3 Repository: đọc/ghi các cột mới, chèn và liệt kê duyệt trong phiên, đổi mức quyền session

## 2. Contract và IPC

- [x] 2.1 `src/shared/contracts/agent.ts`: bỏ `permissionLevel` khỏi lệnh gửi, thêm `approve_session` vào `pendingReply.choice`, thêm `permissionLevel` và `sessionApprovals` vào snapshot session, thêm lệnh `setPermissionLevel`
- [x] 2.2 IPC handler `agent`: lệnh `setPermissionLevel`, bỏ truyền `permissionLevel` khi gửi lượt
- [x] 2.3 Test contract: lệnh gửi có `permissionLevel` bị từ chối; `approve_session` hợp lệ

## 3. Quyền trong main

- [x] 3.1 `decideToolCall` trả `risk: 'high'` cho tạo task dịch và ghi vào đích không do người dùng nêu; test bảng
- [x] 3.2 Hàm thuần `applyPermission` theo D3 với test cho mọi tổ hợp mức quyền, duyệt trong phiên, `deny` và `risk`
- [x] 3.3 `acceptTurn` lưu `mode` và chụp `permission_level` của session; `runExistingTurn` đọc từ turn
- [x] 3.4 `chatCapabilities` ở `ask` chỉ giữ capability đọc và `resolve_target`
- [x] 3.5 `prepareCall` và lần đánh giá lại trước khi chạy cùng dùng `applyPermission`, ghi `approval`; `autopilot_skip` lưu lỗi `autopilot_skipped` và gửi lại model
- [x] 3.6 Continuation nhận `approve_session`: duyệt call và chèn hàng `agent_session_approval` trong cùng transaction
- [x] 3.7 Xóa nhánh tạo câu hỏi không bao giờ chạy trong `execute()`; giữ trả lời lựa chọn đầu ở Autopilot
- [x] 3.8 Sửa test autopilot hiện có: ghi vào tác phẩm không nêu phải bị `autopilot_skipped`

## 4. Test hành vi của spec

- [x] 4.1 Ask sau khi trả lời câu hỏi vẫn không có tool ghi và call ghi bị từ chối
- [x] 4.2 Hạ mức quyền khi turn đang chờ: turn đó giữ mức đã chụp, turn sau dùng mức mới
- [x] 4.3 `allow_all` tạo task không qua duyệt; `deny` vẫn chặn ở mọi mức
- [x] 4.4 Autopilot: ghi vào chương đang mở chạy; ghi vào tác phẩm khác và tạo task bị bỏ qua
- [x] 4.5 Duyệt trong phiên áp dụng cho call sau của cùng capability, không áp dụng cho session khác
- [x] 4.6 Chat mới bắt đầu ở `default`

## 5. Renderer

- [x] 5.1 Store: bỏ `permissionLevel` khỏi `send`/`reply`, đọc mức quyền và danh sách duyệt từ snapshot, action đổi mức quyền gọi IPC
- [x] 5.2 Control chọn mức quyền ở thanh dưới ô nhập với ba mục và mô tả ngắn
- [x] 5.3 Hộp xác nhận khi nâng lên Cho phép tất cả hoặc Autopilot, có Không hỏi lại lưu `localStorage` bọc try/catch
- [x] 5.4 Thẻ duyệt: nút chính Cho phép trong phiên này, menu Cho phép một lần, nút phụ Bỏ qua; Ctrl+Enter và Ctrl+Alt+Enter
- [x] 5.5 Test component cho control mức quyền, hộp xác nhận và thẻ duyệt (bàn phím, accessible name)

## 6. Hoàn tất

- [x] 6.1 Cập nhật C22 trong `docs/modules/proposals/chat-ui-vscode.md` và trạng thái trong README module
- [x] 6.2 Chạy `node scripts/check.mjs`
