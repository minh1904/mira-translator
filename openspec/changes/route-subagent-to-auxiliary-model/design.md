## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- `executeSubagent` (`services/agent/agentService.ts`) nhận `chatModel` của turn và gọi `chatModel.chat` mỗi vòng; vòng
  lặp chỉ đọc sự kiện `delta` và `tool-calls`, nên usage của subagent bị bỏ.
- `summarize` (do `add-agent-session-memory` thêm, chưa commit) đã có mẫu chọn model: Model phụ từ
  `connections.preferences().auxiliary` nếu khác model của turn, rồi tới model của turn; usage đẩy vào `usages` của
  turn.
- Chi phí của turn tính bằng `calculateTurnCost(aggregateTokenUsage(usages), model.info)`, tức mọi usage tính theo giá
  của model turn.

## Goals / Non-Goals

**Goals:**
- Subagent dùng Model phụ khi có, không đổi hành vi khi chưa đặt.
- Chi phí turn phản ánh đúng giá của model đã chạy từng phần.

**Non-Goals:**
- Không thêm lựa chọn model riêng cho subagent, không đổi trần `SUBAGENT_LIMITS`.

## Decisions

### D1. Chọn model một lần ở đầu subagent

Dùng lại cách chọn của `summarize`: Model phụ khi đặt, khác entry của turn và `info.toolCall !== false`; mở bằng
`openChatModel`. Mở lỗi thì dùng model của turn. Tách phần chọn ứng viên thành một hàm dùng chung cho `summarize` và
`executeSubagent`, thêm tham số "cần tool" cho subagent.

*Phương án bỏ:* chọn lại model ở mỗi vòng. Bị loại vì đổi model giữa chừng làm hỏng `extra_content` (thought
signature) của các vòng trước trong cùng subagent.

### D2. Chỉ quay về model của turn khi chưa có tool call nào

Nếu Model phụ lỗi trước khi subagent lưu tool call nào, chạy lại từ đầu bằng model của turn. Sau khi đã có tool call
được lưu, chạy lại sẽ nhân đôi các call con dưới cùng call cha, nên lỗi lúc đó làm call cha `failed` như hiện nay.

### D3. Chi phí cộng theo từng model

`usages` của turn hiện là mảng usage thuần, cộng rồi nhân giá model turn. Đổi thành cộng chi phí theo từng phần: mỗi
phần tử mang usage kèm `info` của model sinh ra nó, chi phí turn là tổng `calculateTurnCost` của từng phần. Token usage
tổng của turn vẫn là tổng thuần. Sửa này cũng làm đúng chi phí của lời gọi tóm tắt trong `add-agent-session-memory`,
vốn đang bị tính theo giá model turn.

*Phương án bỏ:* giữ cách tính cũ. Bị loại vì khi Model phụ rẻ hơn nhiều, chi phí hiển thị bị thổi lên đúng phần mà
change này muốn giảm.

## Risks / Trade-offs

- [Model phụ rẻ tóm tắt kém hơn model chính] → model chính vẫn đọc bản tóm tắt và có thể tự đọc lại bằng tool; người
  dùng bỏ Model phụ thì quay lại hành vi cũ.
- [Model phụ hỗ trợ tool kém dù catalog không ghi `toolCall: false`] → subagent vẫn chạy trong trần riêng và phát hiện
  lặp; lỗi tool rơi vào D2.
