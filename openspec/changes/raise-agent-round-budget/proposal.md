## Why

Một turn agent chỉ có 6 vòng model và 20 tool call, nên lệnh cần nhiều bước (rà nhiều chương, đọc rồi sửa) hết vòng
trước khi xong; log chat 2026-10-22 (`docs/modules/proposals/autonomous-agent.md` mục 2.1) cho thấy lượt cuối hết
vòng mà chưa làm được việc chính. Ngoài ra chạm trần đọc, trần ghi hoặc gọi lặp đều làm turn `failed`, người dùng
mất phần đã làm và không có đường đi tiếp. Mục 9 của cùng tài liệu đã đề xuất nâng trần và "chạm trần thì hỏi tiếp,
không báo `failed`". Từ khi có `add-agent-session-memory`, turn mới thấy được tool call của turn trước, nên đi tiếp
bằng một turn mới không còn mất ngữ cảnh.

## What Changes

- Trần mỗi turn: 15 vòng model (từ 6), 40 tool call (từ 20), 200.000 ký tự đọc (từ 100.000). Trần ghi đếm theo số
  chương bị đổi trong turn (tối đa 3), không theo số operation.
- Chạm bất kỳ trần nào (vòng, call, đọc, ghi) SHALL không làm turn `failed`: call vượt trần không chạy, runtime gửi
  một vòng cuối không tool để model báo đã làm gì và còn gì, turn kết thúc `completed` kèm thông báo "Lượt dừng vì
  chạm giới hạn" và nút **Tiếp tục** (dùng lại cơ chế của lượt không có phản hồi).
- Gọi lặp: lần thứ ba cùng `(tool, tham số chuẩn hóa)` không chạy mà nhận kết quả lỗi nhắc model dùng kết quả trước;
  lần thứ tư mới dừng turn như chạm trần. Không còn `failed` vì lặp.
- Mô tả `list_glossary` và `list_addressing` đổi "đã duyệt" thành "đang có hiệu lực" cho khớp từ điển phẳng
  (quyết định 9 sửa ngày 2026-10-23).

Ngoài phạm vi: trần chi phí theo tiền/token (còn mở ở mục 10.3, cần đo trước), thẻ kế hoạch và mô hình quyền A–E
(`add-agent-plan-and-budget`), cầu dao của task dịch, trần của subagent.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-conversation`: requirement "Budget và loop có giới hạn rõ" đổi con số, đổi cách đếm ghi, và đổi kết cục
  chạm trần/lặp từ `failed` sang dừng có Tiếp tục.

## Impact

- `src/main/services/agent/registry.ts` (`TurnBudgetTracker`), `agentService.ts` (vòng lặp, `runRound`,
  `MAX_MODEL_ROUNDS`, `LOOP_REPEATS`).
- `src/shared/contracts/agentEmptyTurn.ts` và transcript (`AgentTranscript.tsx`, `TurnFooter.tsx`): thông báo dừng
  vì giới hạn dùng chung nút Tiếp tục.
- `capabilities/readCapabilities.ts`: mô tả hai tool.
- Chi phí: một turn có thể tốn tới khoảng 2,5 lần số vòng cũ; mỗi lần chạm trần thêm một vòng cuối không tool.
