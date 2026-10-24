## Why

`run_subagent` hiện chạy bằng chính model của lượt, thường là model chính và đắt, dù việc của nó chỉ là đọc rồi tóm
tắt. Change `add-agent-session-memory` đã thêm Model phụ cho việc nền; subagent là việc nền đọc nhiều nhất nên dùng
nó sẽ rẻ hơn rõ rệt. Ngoài ra usage của subagent hiện không được cộng vào lượt, nên chi phí lượt hiển thị thấp hơn
thực tế.

## What Changes

- Subagent chạy bằng Model phụ khi đã đặt, dùng được và hỗ trợ gọi tool; nếu không thì dùng model của lượt như hiện
  nay.
- Model phụ lỗi trước khi subagent kịp gọi tool nào thì chạy lại subagent bằng model của lượt; lỗi sau đó thì call
  `run_subagent` thất bại như hiện nay.
- Usage và chi phí của mọi vòng subagent được cộng vào usage và chi phí của lượt.
- Call `run_subagent` ghi nhãn model đã chạy subagent.

Ngoài phạm vi: lựa chọn model riêng cho subagent (khác Model phụ), mức suy luận riêng, đổi trần của subagent.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-response-parts`: requirement "Subagent lưu và giới hạn như lượt chính" thêm model chạy subagent, cách quay
  về model của lượt và việc cộng usage.

Phụ thuộc: requirement Model phụ nằm trong delta `model-defaults` của `add-agent-session-memory`, chưa archive vào
`openspec/specs/model-defaults`. Khi archive change đó, sửa câu "Model phụ SHALL được dùng cho việc nền của agent như
tóm tắt lịch sử chat" thành "… như tóm tắt lịch sử chat và subagent". Change này archive sau `add-agent-session-memory`.

## Impact

- `src/main/services/agent/agentService.ts`: `executeSubagent` chọn model, quay về model của lượt, cộng usage; nhánh
  `RUN_SUBAGENT` truyền `usages` và ghi nhãn model.
- `src/main/services/agent/agentService.test.ts` (hoặc file test subagent hiện có): test chọn model và usage.
- Không đổi schema, IPC hay UI.
