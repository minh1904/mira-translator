## Why

Khi lượt agent đang chạy (đọc nhiều chương, dịch, rà xưng hô), người dùng chỉ có nút Dừng: muốn đổi hướng thì phải
dừng, mất phần đang làm, rồi gửi lại từ đầu. Hermes Agent cho gõ thêm trong lúc chạy và chèn câu đó vào ngay sau kết
quả công cụ kế tiếp (`apply_pending_steer_to_tool_results`, commit `cb757fac`), nên lượt đổi hướng mà không mất việc
đã làm. Đây là mục 5 trong danh sách cải thiện agent chat sau nghiên cứu Hermes (2026-10-23).

## What Changes

- Khi lượt đang chạy, ô nhập vẫn gửi được: tin gửi lúc đó là **tin chen ngang** của lượt, không tạo lượt mới. Nút
  Dừng vẫn giữ nguyên.
- Main lưu tin chen ngang bền, rồi chèn mọi tin đang chờ vào prompt ngay sau kết quả tool của vòng hiện tại, trước
  lời gọi model kế tiếp, dưới dạng một message người dùng có nhãn chen ngang.
- Tin chen ngang hiện trong transcript tại đúng chỗ được chèn. Tin chưa chèn hiện phía trên ô nhập, rút lại được.
- Lượt kết thúc bằng câu trả lời mà còn tin chưa chèn: các tin đó tự thành lượt kế tiếp. Lượt kết thúc theo cách
  khác (chờ người dùng, lỗi, dừng, gián đoạn): tin chưa chèn được trả lại để người dùng gửi hoặc bỏ.
- Policy coi tin chen ngang đã chèn là lời của người dùng, như instruction của lượt.
- Lịch sử session gửi lại cho model giữ tin chen ngang đúng vị trí.

Ngoài phạm vi: đính kèm ngữ cảnh hay đổi chế độ/model trong tin chen ngang; chen ngang vào subagent hay task dịch nền
(task đã có `agent-task-steering`).

## Capabilities

### New Capabilities
- `agent-steer-messages`: tin chen ngang của lượt đang chạy: gửi, lưu, chèn vào prompt, rút lại, xử lý khi lượt kết
  thúc trước khi chèn, hiển thị và đồng bộ giữa cửa sổ, vị trí trong lịch sử gửi lại.

### Modified Capabilities
- `app-agent-session`: "Mỗi session chỉ có một lượt đang hoạt động" cho phép gửi tin chen ngang khi lượt chạy, vẫn
  không tạo lượt thứ hai.
- `agent-composer`: "Thanh công cụ, placeholder và phím" có nút Gửi cạnh Dừng khi lượt chạy và ô nhập có chữ.
- `agent-response-parts`: thêm loại phần tử tin chen ngang.

## Impact

- `src/main/services/agent/agentService.ts`: hàng đợi chen ngang, chèn sau vòng tool, kết thúc lượt, policy.
- `src/main/services/agent/sessionHistory.ts` (của change `add-agent-session-memory`): đặt tin chen ngang khi dựng
  lại lượt cũ.
- `src/main/infra/storage/librarySchema.ts`, `agentRepository.ts`: bảng `agent_turn_steer`, thêm loại `steer` cho
  `agent_turn_part`; schema thư viện lên một bậc sau v18 của `add-agent-session-memory`.
- `src/shared/contracts/agent.ts`, `channels.ts`, preload, IPC: lệnh gửi/rút tin chen ngang, event, snapshot.
- Renderer module agent: ô nhập khi đang chạy, danh sách tin chờ, phần tử chen ngang trong transcript.
- Phụ thuộc: làm sau `add-agent-session-memory` (dùng chung bước dựng lịch sử và số schema).
