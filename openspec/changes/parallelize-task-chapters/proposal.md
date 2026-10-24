## Why

Tác vụ dịch chạy **một chương trên toàn ứng dụng** (requirement "Scheduler tuần tự" của `durable-translation-task`), và trong chương thì từng lô một. Gateway cho phép 4 lời gọi cùng lúc mỗi mục model nhưng gần như luôn chỉ dùng một suất; bốn tác vụ trên màn Hoạt động phải xếp hàng sau tác vụ đầu. Chạy tuần tự cũng không đổi lấy chất lượng: snapshot ngữ cảnh của mỗi chương chỉ gồm glossary, xưng hô, nhân vật, giọng văn, chỉ dẫn và ba đoạn **bản gốc** trong cùng chương, không chương nào đọc bản dịch của chương khác (`docs/modules/context/cross-chapter-context.md`).

Mở song song mà không đổi cách gửi request thì dễ bị chặn: Gemini tính giới hạn theo project chứ không theo khóa, request lỗi vẫn bị tính vào giới hạn (OpenAI), và dồn cục hay tăng tải đột ngột cũng dính 429 (Anthropic). Gateway hiện đổi khóa khi gặp 429 nhưng không chậm lại, số đồng thời cố định, và chat dùng chung suất với tác vụ (`docs/modules/ai-connections/parallel-requests.md`).

## What Changes

- **Scheduler song song có giới hạn.** Nhiều chương (của một hay nhiều tác vụ) chạy cùng lúc; trong một chương các lô vẫn tuần tự. Số chương đồng thời của một mục model lấy theo trần đồng thời của mục đó. Chọn chương xoay vòng giữa các tác vụ để tác vụ tạo sau không phải chờ tác vụ trước xong hết. **BREAKING** (hành vi): thay requirement "Scheduler tuần tự".
- **Trần tác vụ dùng chung giữa các chương đang chạy.** Trần lời gọi, token, chi phí được kiểm trên tổng của mọi lượt chạy đang diễn ra của cùng tác vụ, không chỉ lượt hiện tại.
- **Pause, Cancel, đóng app và dừng cả tác vụ** áp cho mọi chương đang chạy của tác vụ. Lỗi xác thực hoặc hết hạn mức chặn chương mới của tác vụ bắt đầu.
- **Gateway tự điều chỉnh tốc độ theo mục model:** khởi động với 1 lời gọi đồng thời rồi tăng dần tới trần khi chạy êm; gặp giới hạn tốc độ thì giảm một nửa và tạm ngừng gửi mới theo thời gian chờ nhà cung cấp báo (hoặc vài giây có jitter khi không báo). Đổi khóa khi một khóa bị đóng băng vẫn giữ như cũ.
- **Ưu tiên lượt chat:** lượt chat đi trước lượt dịch của tác vụ trong hàng đợi của cùng mục model.
- **Không làm** trong change này: giới hạn token/phút do người dùng đặt, đọc header "còn lại" của nhà cung cấp, gửi ngữ cảnh chương trước. Ghi là việc tiếp theo.

## Capabilities

### New Capabilities
- `provider-adaptive-pacing`: cách gateway tự điều chỉnh số lời gọi đồng thời của một mục model (khởi động chậm, tăng dần, giảm khi bị giới hạn tốc độ, tạm ngừng chung theo thời gian chờ) và thứ tự ưu tiên chat trước tác vụ.

### Modified Capabilities
- `durable-translation-task`: thay "Scheduler tuần tự" bằng scheduler song song có giới hạn và xoay vòng giữa tác vụ; "Ngân sách một lượt và trần task" kiểm trần trên mọi lượt đang chạy của tác vụ; "Pause, Cancel và đóng app có điểm an toàn" áp cho mọi chương đang chạy.

## Impact

- **Main:** `services/agent/taskService.ts` (một item đang chạy → tập item đang chạy; `wake`, `idle`, `isChapterBusy`, pause/cancel/close, `haltTask`, `gateFor` dùng chung bộ đếm theo task), `infra/storage/agentTaskRepository.ts` (`nextQueuedItem` chọn xoay vòng và bỏ qua mục model đã đủ suất), `infra/providers/gateway/{gateway,limiter}.ts` (trần động, tạm ngừng chung, hàng ưu tiên).
- **Renderer:** thẻ tác vụ hiện được nhiều chương đang dịch cùng lúc (`TaskCard`).
- **Schema:** migration library v20 bỏ index `agent_task_item_one_running` (chỉ cho một item `running` toàn app), phát hiện khi triển khai; không đổi cột hay dữ liệu.
- **Không đổi:** enum trạng thái, bảng chuyển trạng thái, IPC, cách chụp snapshot.
- **Rủi ro chính:** chạm giới hạn của nhà cung cấp nhiều hơn khi chưa có giãn theo token; điều chỉnh chỉ dẫn và sửa glossary giữa chừng áp muộn hơn vài chương vì nhiều chương đã ghim snapshot.
