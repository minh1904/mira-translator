## Why

Với lệnh nhiều bước ("rà xưng hô 30 chương rồi dịch tiếp"), agent không có chỗ ghi mình đang ở bước nào: người
dùng phải đoán tiến độ từ chuỗi dòng tool, còn model dễ bỏ sót bước khi lượt dài hoặc khi lịch sử cũ bị tóm tắt
(change `add-agent-session-memory`). Hermes Agent giải quyết bằng tool `todo_list` do model tự viết, được chèn lại sau
mỗi lần nén ngữ cảnh. Đây là bước nhỏ nhất trước thẻ kế hoạch của `add-agent-plan-and-budget`
(`docs/modules/proposals/autonomous-agent.md` mục 5.1).

## What Changes

- Thêm capability `todo_list`: model gửi toàn bộ danh sách bước, mỗi bước có nội dung và trạng thái `pending`,
  `in_progress`, `completed` hoặc `cancelled`; gọi không có danh sách thì đọc danh sách hiện tại. Mỗi lần gọi trả về
  toàn bộ danh sách. Tối đa 20 bước, mỗi bước tối đa 200 ký tự.
- Danh sách thuộc session: lượt sau đọc tiếp được danh sách của lượt trước. Danh sách hiện tại là danh sách của lần
  gọi `todo_list` ghi gần nhất trong các lượt chưa bị revert.
- Transcript hiện mỗi lượt có `todo_list` một thẻ checklist duy nhất, cập nhật tại chỗ theo lần ghi mới nhất của lượt
  đó, thay cho các dòng tool call `todo_list`.
- Khi lượt chứa danh sách hiện tại không còn được gửi nguyên văn cho model (bị tóm tắt hoặc cắt), runtime chèn danh
  sách vào prompt ngay sau bản tóm tắt.
- Dùng được ở cả Ask và Agent vì không đổi dữ liệu truyện; không dùng được trong subagent.
- `todo_list` **không** phải thẻ kế hoạch: không có nút duyệt, không cấp quyền cho call nào, không ước tính chi phí.
  Thẻ kế hoạch của `add-agent-plan-and-budget` có thể dùng lại giao diện checklist này.

Ngoài phạm vi: người dùng sửa hay tick danh sách bằng tay, thẻ kế hoạch có duyệt, thẻ task dịch, nhắc model cập nhật
danh sách khi nó quên.

## Capabilities

### New Capabilities
- `agent-todo-list`: capability `todo_list`, phạm vi session, giới hạn, thẻ checklist trong transcript và việc giữ
  danh sách qua tóm tắt lịch sử.

### Modified Capabilities
- `agent-response-parts`: tool call `todo_list` hiện thành thẻ checklist thay cho dòng tool call; subagent không được
  dùng `todo_list`.

## Impact

- `src/main/services/agent/capabilities/`: capability mới `todo_list`, đăng ký trong registry; `SYSTEM_PROMPT` thêm
  hướng dẫn dùng.
- `src/main/services/agent/agentService.ts`, `turnContext.ts`: tìm danh sách hiện tại của session, chèn lại sau bản
  tóm tắt; loại `todo_list` khỏi subagent.
- `src/shared/contracts/agent.ts`: kiểu bước và trạng thái của danh sách.
- `src/renderer/src/modules/agent/components/`: `turnItems.ts` gộp các call `todo_list` của lượt, component thẻ
  checklist mới.
- Không đổi schema DB: danh sách nằm trong tham số của tool call đã lưu.
