## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- Capability có `kind` thuộc `read`, `reversible-write`, `destructive`, `external` (`services/agent/types.ts`). Chế độ
  Ask chỉ nhận capability `read` (`agentService.ts`, `chatCapabilities`); policy cho chạy thẳng call `read`
  (`policy.ts`, `decideToolCall`).
- Subagent lọc capability theo `kind === 'read'` cộng `resolve_target` (`agentService.ts`, đoạn dựng tool của
  subagent).
- Mọi tool call được lưu trong `agent_tool_call` kèm `args_json` trước khi chạy; phần tử `tool_call` của
  `agent_turn_part` trỏ tới call. Loại phần tử bị `CHECK` giới hạn ở `text`, `reasoning`, `tool_call`, `progress`.
- Renderer dựng transcript bằng `turnItems()` (`modules/agent/components/turnItems.ts`) từ phần tử và tool call;
  call con của subagent đã được gộp dưới call cha theo cách tương tự.
- Change `add-agent-session-memory` (đang triển khai) gửi lại tool call của lượt cũ và chèn bản tóm tắt qua
  `summaryBlock()` trong `turnContext.ts`; lượt nằm trong bản tóm tắt không được gửi nguyên văn.

## Goals / Non-Goals

**Goals:**
- Không đổi schema DB và không thêm loại phần tử.
- Danh sách hiện tại tính được thuần từ dữ liệu đã lưu, nên revert, mở lại app và nhiều cửa sổ đúng mà không cần đồng
  bộ thêm.

**Non-Goals:**
- Không cho người dùng sửa danh sách; không có nút trên thẻ.
- Không nhắc model cập nhật khi nó quên (Hermes có nudge; để sau nếu đo thấy cần).
- Không hiện danh sách ngoài transcript (thanh dính trên ô nhập, màn Tác vụ).

## Decisions

### D1. Danh sách sống trong tham số của tool call, không có bảng riêng

Danh sách hiện tại = `args.todos` của call `todo_list` mới nhất có `state = completed` và có `todos`, quét các lượt của
session theo `listTurns` (đã bỏ lượt revert) từ mới về cũ. Handler của capability nhận danh sách hiện tại qua input
khi đọc; khi ghi chỉ cần validate rồi trả lại `todos`, vì chính call đã lưu là bản ghi.

*Phương án bỏ:* bảng `agent_session_todo` hoặc cột trên `agent_session`. Bị loại vì phải đồng bộ với revert (giống vấn
đề D3 của `add-agent-session-memory`) và cần migration, trong khi dữ liệu đã có sẵn trong `agent_tool_call`.

*Phương án bỏ:* loại phần tử mới `todo`. Bị loại vì phải đổi `CHECK` của `agent_turn_part` (dựng lại bảng trong
SQLite) mà không thêm thông tin nào ngoài call đã lưu.

### D2. Phạm vi session, không phải lượt

Lệnh dài thường kéo qua nhiều lượt ("làm tiếp", Tiếp tục khi chạm trần ở `add-agent-plan-and-budget`); danh sách theo
lượt sẽ mất đúng lúc cần nhất. Danh sách cũ không còn liên quan thì model xóa bằng `todos: []`; system policy nói rõ
việc này khi người dùng đổi chủ đề.

### D3. `kind: 'read'`, không target, không dùng trong subagent

`todo_list` không đọc hay ghi dữ liệu người dùng; khai báo `read` để policy cho chạy, có ở Ask và không cần thêm loại
mới. Subagent bị loại tường minh theo tên trong bộ lọc tool của nó: subagent có ngữ cảnh riêng và kết quả chỉ là bản
tóm tắt, nên danh sách của nó sẽ không ai thấy và còn có thể ghi đè danh sách của session.

Kết quả của call nhỏ (≤ 20 × 200 ký tự) nên việc tính vào trần ký tự đọc không đáng kể.

### D4. Giới hạn 20 bước × 200 ký tự

Hermes cho 256 bước × 4.000 ký tự vì phục vụ việc lập trình dài. Lệnh của Mira tính theo chương và tác vụ; 20 bước đủ
cho "trích thuật ngữ → dịch 1–10 → rà → sửa", và danh sách nhỏ giữ chi phí khi được chèn lại sau tóm tắt. Schema
valibot của capability chặn vượt giới hạn, nên lỗi đi qua đường `validation` sẵn có.

### D5. Chèn lại sau tóm tắt

`assembleTurnContext` nhận thêm `todo: { items, turnId } | null`. Nếu `turnId` không nằm trong các lượt được gửi
nguyên văn và `items` không rỗng, hàm thêm một message `user` ngay sau khối tóm tắt (hoặc ngay sau system khi không có
tóm tắt) với đầu đề "[Danh sách bước đang theo dõi, giữ lại sau khi lịch sử được tóm tắt]" và các dòng
`[x]`/`[>]`/`[ ]`/`[~]` như Hermes. Kích thước của message này được tính vào ngưỡng lịch sử.

### D6. Thẻ checklist ở renderer

`turnItems()` thêm loại item `todo`: gặp call `todo_list` ghi thành công đầu tiên của lượt thì đặt item `todo` tại đó
với nội dung của call ghi thành công mới nhất trong lượt; các call `todo_list` khác của lượt (ghi hay đọc thành công)
bị bỏ khỏi danh sách item. Call lỗi vẫn là item `tool`. Component `TodoCard` trong `modules/agent/components/` dùng
token và primitive sẵn có (không có control): mỗi bước một dòng gồm icon trạng thái có `aria-label` (Chưa làm, Đang
làm, Đã xong, Đã bỏ) và nội dung; bước xong/bỏ dùng màu chữ phụ cộng icon, bước `cancelled` thêm gạch ngang. Thẻ kế
hoạch sau này có thể dùng lại phần danh sách của component.

## Risks / Trade-offs

- [Model không cập nhật danh sách, thẻ đứng ở trạng thái cũ] → hướng dẫn trong system policy; thẻ chỉ nói điều model
  khai báo, không khẳng định việc thật đã xong. Nudge để change sau nếu log cho thấy cần.
- [Model gọi `todo_list` quá nhiều lần, tốn trần tool call] → mỗi lần gọi tính vào trần như call khác; policy dặn chỉ
  cập nhật khi đổi trạng thái.
- [Danh sách cũ của session làm model quay lại việc đã bỏ] → danh sách chỉ được chèn khi lượt chứa nó đã bị tóm tắt,
  cùng lời dặn "chỉ làm theo instruction mới nhất" của bản tóm tắt; model xóa danh sách khi đổi chủ đề.
- [`relabelHandles` của `add-agent-session-memory` đổi chuỗi trùng mẫu handle trong nội dung bước] → chỉ chuỗi đúng y
  mẫu `ctx`/`t1` mới bị đổi; chấp nhận được.
