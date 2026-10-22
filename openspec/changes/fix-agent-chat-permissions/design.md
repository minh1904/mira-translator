## Context

Đợt 2026-10-22 thêm `mode` và `permissionLevel` vào lệnh gửi lượt (`agentSendInputSchema`) và truyền thẳng vào
vòng chạy. Hệ quả (xem `docs/modules/proposals/chat-ui-vscode.md`, mục Đánh giá code):

- `agentStore.reply` không gửi hai trường này, nên vòng tiếp tục chạy với `mode` và `permissionLevel` rỗng.
- `prepareCall` đổi mọi `needs_user` thành `allow` khi `autopilot`; vòng thực thi đánh giá lại policy nhưng chỉ
  chặn `deny`, nên call rủi ro cao vẫn chạy.
- Câu hỏi `ask_questions` ở Autopilot được trả lời trong `execute()`; nhánh tạo câu hỏi ở chế độ thường trong
  `execute()` không bao giờ chạy vì `prepareCall` đã giữ call ở `pending`.

`decideToolCall` (`policy.ts`) là hàm thuần trả `allow | deny | needs_user`. `agent_tool_call.extra_json` (v14)
đang chứa dữ liệu provider kèm call, không dùng cho quyền.

## Goals / Non-Goals

**Goals:**
- Main là nguồn sự thật của chế độ và mức quyền; client không đổi được quyền của một turn đã chấp nhận.
- Quyết định quyền là hàm thuần kiểm thử được, tách khỏi bảng policy.
- Lưu đủ để xem lại vì sao một call chạy không qua thẻ duyệt.

**Non-Goals:**
- Mức "Assisted" (LLM chấm rủi ro) của VS Code.
- Duyệt theo workspace hoặc "luôn cho phép" vượt phiên.
- Vị trí thẻ duyệt trong luồng trả lời: thuộc `add-agent-response-parts`.
- Câu hỏi có đáp án mặc định, nhập tự do, bỏ qua: thuộc `add-agent-questions-and-checkpoints`.

## Decisions

**D1. Chế độ lưu trên turn, mức quyền lưu trên session và chụp vào turn.** Migration thêm
`agent_turn.mode TEXT NOT NULL DEFAULT 'agent'`, `agent_turn.permission_level TEXT NOT NULL DEFAULT 'default'`,
`agent_session.permission_level TEXT NOT NULL DEFAULT 'default'`. `acceptTurn` ghi `mode` từ lệnh gửi và
`permission_level` từ session; `runExistingTurn` đọc cả hai từ turn. `AgentSendInput` bỏ `permissionLevel`;
`mode` chỉ được đọc khi tạo turn mới. Thay thế: giữ hai trường trong mọi lệnh và bắt client gửi lại — bị loại vì
chính lỗi hiện tại đến từ việc client quên gửi.

**D2. Mức quyền là lệnh của session.** Thêm `sessions.setPermissionLevel({ sessionId, level })` trong area IPC
`agent`; renderer gọi khi người dùng xác nhận. Lượt đầu của Chat mới chưa có session: session được tạo ở
`default`, nên renderer gửi lệnh đổi mức sau khi có `sessionId` (store đã có `createSession`). VS Code cũng giới
hạn mức nâng trong phiên hiện tại.

**D3. Hàm quyền thuần tách khỏi policy.** `decideToolCall` trả thêm `risk: 'high'` cho hai nhánh `needs_user`:
tạo task dịch và ghi có Undo vào đích không do người dùng nêu. Hàm mới
`applyPermission({ decision, level, sessionApproved, name })` trả `allow | needs_user | autopilot_skip`, với nguồn
tự duyệt `level | session`. Thứ tự: `deny` giữ nguyên; `sessionApproved` → `allow`; `allow_all` → `allow`;
`autopilot` và `risk === 'high'` → `autopilot_skip`; `autopilot` → `allow`; còn lại giữ nguyên. Hàm được gọi ở
`prepareCall` và lần đánh giá lại trước khi chạy, nên hai chỗ không lệch nhau.

**D4. Lưu nguồn tự duyệt bằng cột riêng.** Migration thêm `agent_tool_call.approval TEXT` với giá trị
`user_once | user_session | level_allow_all | level_autopilot | autopilot_skip`. `decision` giữ kết quả policy gốc
(`needs_user`) để audit. Vòng thực thi coi call `needs_user` là được chạy khi có `approval` thuộc nhóm duyệt hoặc
có `reply` duyệt. Không dùng `extra_json` vì cột đó là dữ liệu provider.

**D5. Bảng duyệt trong phiên.** `agent_session_approval(session_id REFERENCES agent_session ON DELETE CASCADE,
capability TEXT, created_at, PRIMARY KEY (session_id, capability))`. Lệnh trả lời nhận `choice: 'approve_session'`;
trong cùng transaction với cập nhật call, runtime chèn hàng. `getSessionDetail` trả `permissionLevel` và
`sessionApprovals: string[]`.

**D6. Ask lọc ở hai lớp.** `chatCapabilities(mode)` chỉ giữ capability `kind === 'read'` và `resolve_target` khi
`ask` (thay danh sách loại trừ tên hiện tại, để capability ghi mới không lọt). Policy nhận `kind` từ bản đồ đã
lọc nên call ghi bị `deny` vì không có trong danh sách của turn.

**D7. Câu hỏi ở Autopilot đi qua `applyPermission`.** `ask_questions` trả `needs_user` từ policy; `autopilot` cho
`allow`, rồi `execute()` trả đáp án mặc định (khi `add-agent-questions-and-checkpoints` đã thêm trường này) hoặc
lựa chọn đầu, kèm ghi chú. Nhánh tạo câu hỏi trong `execute()` bị xóa vì không bao giờ
chạy. `allow_all` không tự trả lời câu hỏi (VS Code chỉ tự trả lời ở Autopilot).

**D8. Hộp xác nhận và "Không hỏi lại" ở renderer.** Lựa chọn Không hỏi lại là tiện ích theo máy, lưu bằng
`localStorage` như `themeStore`, bọc try/catch; mất giá trị chỉ làm hộp hiện lại.

## Risks / Trade-offs

- [Turn cũ trước migration không có chế độ] → giá trị mặc định `agent` và `default` đúng với hành vi trước 2026-10-22.
- [Duyệt trong phiên theo capability rộng hơn VS Code, nơi có thể duyệt theo tổ hợp tham số] → giới hạn ở session,
  hiện danh sách trong snapshot để giao diện sau này cho thu hồi.
- [Autopilot bỏ qua cả việc ghi vào đích người dùng chọn qua `resolve_target` mơ hồ] → không xảy ra: chọn ứng viên
  làm policy trả `allow` (`chosenByUser`), nên không có `risk`.
- [Đổi contract IPC] → renderer và main cùng repo, cập nhật trong cùng change; test contract bắt trường thừa vì
  schema là `strictObject`.

## Migration Plan

Một migration library (dự kiến v15, lấy số kế tiếp lúc apply) gồm ba `ALTER TABLE ... ADD COLUMN`, một
`ALTER TABLE agent_tool_call ADD COLUMN approval TEXT` và bảng `agent_session_approval`; thêm fixture
`library-v15.schema.sql` và cập nhật test backup/migration theo mẫu các bản trước. Rollback bằng backup trước
migration như các bản trước.
