## Why

Đợt code 2026-10-22 thêm chế độ Ask/Agent và Autopilot nhưng có hai lỗi an toàn: lượt tiếp tục sau khi duyệt
hoặc trả lời câu hỏi mất chế độ và mức quyền (Ask lấy lại đủ tool ghi), và Autopilot đổi mọi `needs_user`
thành `allow`, kể cả tạo task dịch tốn tiền và ghi vào tác phẩm người dùng không nêu. Quyết định 12, 14 và 15
(`docs/modules/proposals/decisions.md`) đã chốt chế độ, ba mức quyền và duyệt trong phiên theo VS Code; change
này đưa phần đó thành hành vi có kiểm chứng trước khi làm giao diện mới.

## What Changes

- Chế độ `ask | agent` được lưu trên turn khi chấp nhận; lượt tiếp tục dùng chế độ đã lưu của turn, không dùng
  giá trị client gửi lại. Ask chỉ gửi và chỉ cho chạy capability đọc.
- Mức quyền `default | allow_all | autopilot` thuộc **session**, lưu trong library DB, phiên mới luôn bắt đầu ở
  `default`. Turn chụp mức quyền lúc chấp nhận; lượt tiếp tục dùng mức đã chụp.
- `allow_all` tự duyệt mọi call `needs_user`. `autopilot` như `allow_all`, nhưng bỏ qua call rủi ro cao (tạo
  task dịch; ghi vào đích không do người dùng nêu) với kết quả lỗi `autopilot_skipped` gửi lại model, và tự trả
  lời `ask_questions` bằng đáp án mặc định, nếu không có thì lựa chọn đầu tiên. Không mức nào vượt `deny`.
- Duyệt trong phiên: trả lời `approve_session` cho một call `needs_user` duyệt call đó và ghi nhớ capability
  cho session; các call sau cùng capability trong session được tự duyệt. Mức quyền và danh sách đã duyệt hiện
  trong snapshot session.
- Giao diện: chọn mức quyền ở thanh dưới ô nhập; nâng lên `allow_all` hoặc `autopilot` cần hộp xác nhận (có "Không
  hỏi lại"); thẻ duyệt có nút chính **Cho phép trong phiên này**, menu **Cho phép một lần**, nút phụ **Bỏ qua**.
- **BREAKING (nội bộ IPC):** `permissionLevel: 'normal' | 'autopilot'` trên lệnh gửi lượt bị bỏ; mức quyền đổi
  bằng lệnh riêng của session. `pendingReply.choice` nhận thêm `approve_session`.

## Capabilities

### New Capabilities

- `agent-chat-permissions`: chế độ Ask/Agent, mức quyền của session, cổng rủi ro Autopilot và duyệt trong phiên.

### Modified Capabilities

- `agent-conversation`: continuation không còn chỉ duyệt đúng một call khi người dùng chọn duyệt trong phiên;
  chế độ và mức quyền đi theo turn chứ không theo lệnh tiếp tục.

## Impact

- Library DB: migration kế tiếp (dự kiến v15) thêm `agent_turn.mode`, `agent_turn.permission_level`,
  `agent_session.permission_level` và bảng `agent_session_approval`; fixture schema và backup test.
- Main: `agentService.ts` (accept, continuation, `prepareCall`, `chatCapabilities`), `policy.ts`, repository,
  IPC handler `agent` và contract `src/shared/contracts/agent.ts`.
- Renderer: `agentStore.ts`, `AgentComposer.tsx`, `PendingActionCard.tsx`, hộp xác nhận mới.
- Tài liệu: trạng thái C22 trong `docs/modules/proposals/chat-ui-vscode.md`.
