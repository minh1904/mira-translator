## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- Vòng lặp lượt nằm trong `AgentService` (`agentService.ts`): mỗi vòng lắp prompt bằng `assembleTurnContext`, stream
  model, lưu tool call vào `agent_tool_call` trước khi chạy, chạy các call rồi sang vòng sau. Dừng lượt đi qua
  `AbortSignal`; khởi động lại app chuyển lượt `running` thành `interrupted`.
- `roundMessages` dựng message assistant/tool của các vòng từ `agent_tool_call`. Change `add-agent-session-memory`
  (chưa archive) chuyển nó sang `sessionHistory.ts` và dùng `pastTurnOf` để gửi lại lượt cũ, đồng thời đưa schema thư
  viện lên v18.
- Phần tử câu trả lời lưu ở `agent_turn_part` với `CHECK (kind IN ('text','reasoning','tool_call','progress'))`.
- Policy (`policy.ts`) xét đích "do người dùng nêu" bằng chuỗi `instruction` của lượt.
- Main từ chối lượt thứ hai bằng `turn_in_progress`; renderer thay Gửi bằng Dừng khi lượt chạy.
- Hermes chèn steer thành message `role: user` riêng ngay sau kết quả tool cuối của lô, có nhãn tự mô tả; nếu lô
  không có kết quả tool thì đưa steer sang lượt sau như tin người dùng thường.

## Goals / Non-Goals

**Goals:**
- Tin chen ngang không bao giờ mất: hoặc được chèn, hoặc thành lượt mới, hoặc được trả lại cho người dùng.
- Request luôn hợp lệ về thứ tự role với mọi transport (`assistant(tool_calls) → tool → user` rồi mới tới model).

**Non-Goals:**
- Không ngắt stream đang chạy để chèn ngay; tin chờ tới điểm chèn kế tiếp.
- Không cho tin chen ngang đổi chế độ, model, mức quyền hay ngữ cảnh.
- Không chen ngang vào subagent (`run_subagent` chạy trong một call của lượt cha).

## Decisions

### D1. Bảng `agent_turn_steer` cho hàng đợi, phần tử `steer` cho transcript

```sql
CREATE TABLE agent_turn_steer (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'withdrawn', 'returned', 'forwarded')),
  delivered_round INTEGER,
  forwarded_turn_id TEXT REFERENCES agent_turn (id) ON DELETE SET NULL,
  client_command_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (turn_id, seq),
  UNIQUE (turn_id, client_command_id)
);
```

Khi chèn, cùng transaction đổi tin sang `delivered` và thêm một phần tử `agent_turn_part` loại `steer` (text là chữ
của tin, `round` là vòng được chèn). Migration dựng lại `agent_turn_part` để mở rộng `CHECK` (SQLite không sửa được
`CHECK` tại chỗ), theo cách các migration trước đã làm. Số phiên bản: bậc kế tiếp sau v18 của
`add-agent-session-memory`.

*Phương án bỏ:* chỉ dùng phần tử `steer` có thêm cột trạng thái. Bị loại vì tin chờ, rút, trả lại chưa phải là phần
của transcript, và `agent_turn_part` không có khái niệm trạng thái. *Phương án bỏ:* chỉ giữ tin chờ trong bộ nhớ Main.
Bị loại vì đóng app làm mất chữ người dùng đã gửi.

### D2. Điểm chèn

Trong vòng lặp, sau khi mọi call của vòng có kết quả cuối (completed/failed/cancelled) và trước `assembleTurnContext`
của vòng sau: đọc tin `pending` theo `seq`, đổi sang `delivered` kèm số vòng và thêm phần tử `steer`. Prompt của lượt
hiện tại dựng message chen ngang từ phần tử `steer` (không từ bảng hàng đợi), nên vòng sau, lượt chạy tiếp sau
`waiting_user` và việc gửi lại làm lịch sử đều dùng cùng một nguồn: `roundMessages` chèn
`{ role: 'user', content: '[Người dùng gửi thêm khi lượt đang chạy]\n' + text }` sau message tool của vòng
`delivered_round`. Nhiều tin cùng vòng nối bằng dòng trống thành một message.

Vòng không có tool call là vòng cuối của lượt, nên không có điểm chèn: tin chờ đi theo D3. Vòng cuối không tool vì
hết budget cũng vậy.

### D3. Kết thúc lượt khi còn tin chờ

Trong cùng transaction chuyển trạng thái cuối của lượt:
- `completed`: các tin chờ thành `forwarded`; Main tạo lượt mới với instruction là chữ các tin nối bằng dòng trống,
  `mode` và `permission_level` của lượt vừa xong, `context_json` của lượt vừa xong, rồi chạy như lượt thường. Lượt mới
  tạo trong cùng transaction nên ràng buộc "một lượt hoạt động" không có khe hở.
- `waiting_user`, `failed`, `cancelled`, `interrupted`, `expired`: các tin chờ thành `returned`. Renderer hiện chúng
  phía trên ô nhập với Gửi/Bỏ. Gửi khi lượt `waiting_user` chỉ đưa chữ vào ô nhập, vì câu trả lời cho call đang chờ
  phải đi qua continuation có digest. Bỏ đổi sang `withdrawn`.

*Phương án bỏ:* luôn trả lại, không tự tạo lượt. Bị loại vì trường hợp phổ biến nhất (model trả lời xong đúng lúc
người dùng gõ thêm) sẽ bắt người dùng gửi lại một lần nữa; Hermes và hàng đợi tin của VS Code đều gửi tiếp. *Phương án
bỏ:* tự gửi cả khi lượt bị dừng hay lỗi. Bị loại vì người dùng vừa bấm Dừng không muốn agent tự chạy tiếp.

### D4. Lệnh IPC và event

- `agent:steer` `{ sessionId, turnId, text, clientCommandId }` → `{ steerId }` hoặc lỗi typed `turn_not_running`,
  `steer_limit`. Kiểm `queued`/`running` và chèn trong một transaction với cập nhật trạng thái lượt, để không lọt khe
  giữa "lượt vừa xong" và "tin vừa thêm".
- `agent:withdraw-steer` `{ steerId }` → lỗi `already_delivered` nếu đã chèn.
- Event `steer` mang tin và trạng thái mới, phát tới mọi cửa sổ; snapshot session thêm `steers` (chờ và `returned`).

Ghi chú khi triển khai: `ErrorCode` của IPC là tập cố định, nên ba lỗi typed ở trên đi bằng mã `conflict` với thông
điệp riêng; renderer chỉ cần hiện thông điệp và giữ chữ trong ô nhập. Event đi trên kênh riêng `agent:steer:changed`
thay vì luồng event của lượt, vì tin được thêm từ ngoài vòng chạy và có thể đổi trạng thái sau event kết thúc.

### D5. Policy và lịch sử

`decide()` truyền vào policy instruction đã nối chữ các tin `delivered` của lượt (tới vòng hiện tại). Bản tóm tắt
session (D4 của `add-agent-session-memory`) nhận message chen ngang như mọi message người dùng, nên không cần đổi
prompt tóm tắt ngoài một dòng nói message có nhãn chen ngang là yêu cầu của người dùng.

### D6. Renderer

Khi lượt chạy: ô nhập vẫn bật, Enter gọi `agent:steer`, nút Gửi hiện trước Dừng khi có chữ, nút +, chế độ, model tắt.
Tin chờ và tin `returned` hiện thành danh sách gọn phía trên hàng ngữ cảnh, theo `DESIGN.md` (viền 1 px
`border-default`, glyph X trơn). Phần tử `steer` trong transcript dùng kiểu lời người dùng cùng nhãn phụ "Gửi thêm khi
đang chạy".

## Risks / Trade-offs

- [Model coi tin chen ngang là dữ liệu từ công cụ vì nó nằm ngay sau kết quả tool] → message riêng role `user`, nhãn
  cố định, và system policy nói nó là chỉ dẫn của người dùng (Hermes từng gặp model từ chối steer khi nhãn trơn).
- [Chèn quá trễ khi một call chạy lâu, như dịch cả chương] → chấp nhận; người dùng vẫn có Dừng. Không ngắt call đang
  ghi vì call ghi đã có side effect.
- [Lượt tự tạo từ tin chờ tiêu thêm tiền mà người dùng không bấm gửi lần nữa] → người dùng đã chủ động gửi tin đó; lượt
  mới hiện ngay trong transcript và Dừng được như mọi lượt.
- [Dựng lại `agent_turn_part` trên DB lớn] → bảng chỉ chứa phần tử chat, migration chạy một lần như v16.

## Migration Plan

Một migration thư viện (sau v18): tạo `agent_turn_steer`, dựng lại `agent_turn_part` với `CHECK` có `steer`, kèm fixture
schema mới. Dữ liệu cũ không đổi. Bản app cũ không mở được DB mới theo luật phiên bản hiện có.
