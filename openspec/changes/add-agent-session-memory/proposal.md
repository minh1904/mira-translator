## Why

Agent chat chỉ gửi lại instruction và câu trả lời cuối của các lượt trước, nên sang lượt sau model quên những gì
nó đã đọc hoặc làm bằng công cụ, không biết "chương này" của lượt cũ là chương nào, và khi session dài thì các lượt
cũ nhất bị cắt mất hẳn. Nghiên cứu Hermes Agent (NousResearch, commit `cb757fac`, 2026-10-23) cho thấy cách làm phổ
biến là gửi lại cả chuỗi tool call/kết quả và nén phần cũ bằng một model phụ thay vì cắt bỏ.

## What Changes

- Lịch sử session gửi cho model gồm cả các vòng tool call và kết quả của lượt trước, không chỉ instruction và câu
  trả lời. Handle của lượt cũ được thay bằng nhãn đích, thought signature của lượt cũ bị bỏ, và với model không hỗ
  trợ tool thì các vòng tool cũ được chuyển thành văn bản ngắn.
- Mỗi lượt cũ kèm một dòng mô tả ngữ cảnh lúc đó (tác phẩm, chương, vùng đang chọn), đánh dấu rõ là của lượt cũ;
  ngữ cảnh hiện tại luôn thắng.
- Khi lịch sử vượt 50% giới hạn context của model, runtime rút gọn các lượt cũ hơn 3 lượt gần nhất: trước hết thay
  kết quả công cụ lớn bằng placeholder; nếu vẫn vượt thì tóm tắt chúng bằng model phụ thành bản tóm tắt của
  session, lưu lại và làm dồn ở lần sau. Tóm tắt lỗi thì quay về cắt lượt cũ như hiện nay. Việc rút gọn chạy ngầm,
  chỉ ghi vào activity.
- Thêm mục Cài đặt › Model › Model phụ. Chưa chọn thì dùng model chat của lượt.
- Bản tóm tắt bị bỏ khi có lượt nó đã tóm tắt bị revert.

Ngoài phạm vi: bộ nhớ giữa các session (kiểu `MEMORY.md`, tìm lại session cũ), ô hướng dẫn cho agent do người dùng
viết, và đếm token thật thay cho ước lượng 2 ký tự/token (change sau).

## Capabilities

### New Capabilities
- `agent-session-compaction`: rút gọn lịch sử session khi vượt ngưỡng, bản tóm tắt của session, lưu trữ, làm dồn,
  vô hiệu khi revert và phương án dự phòng.

### Modified Capabilities
- `agent-conversation`: requirement "Context window theo thứ tự ưu tiên" đổi nội dung lượt cũ được gửi (thêm vòng
  tool, dòng ngữ cảnh, handle thay bằng nhãn) và đổi hành vi khi vượt giới hạn từ cắt sang rút gọn rồi tóm tắt.
- `model-defaults`: thêm requirement Model phụ.

## Impact

- `src/main/services/agent/turnContext.ts`, `agentService.ts`: dựng lịch sử, rút gọn, gọi tóm tắt.
- `src/main/infra/storage/librarySchema.ts`, `agentRepository.ts`: bảng `agent_session_summary`, schema thư viện
  v18 kèm fixture `library-v18.schema.sql`.
- `src/main/infra/storage/aiPreferences.ts`, `src/shared/contracts/aiPreferences.ts`, IPC và
  `src/renderer/src/modules/ai-connections/settings/modelPages.tsx`: Model phụ.
- Chi phí: prompt mỗi vòng dài hơn vì có vòng tool cũ; thêm một lời gọi model phụ mỗi lần tóm tắt.
