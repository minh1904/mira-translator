## Why

Màn **Tác vụ** hiện có hai tab, "Tác vụ" và "Nhật ký AI", liệt kê cùng một công việc theo hai cách và lặp lại từng chương. Một task dịch 12 chương đã `Hoàn tất` vẫn xổ cả 12 chương, mỗi chương hai dòng (trong đó dòng "Không có chỉ dẫn" lặp 12 lần); tab Nhật ký AI thêm 12 dòng "Đã dịch hoàn tất N/N câu" kèm 12 badge "Hoàn tất" xanh. Khi mọi dòng đều xanh, một lỗi thật sẽ chìm, và người dùng không trả lời được hai câu họ hỏi: "đang làm gì" và "có vấn đề gì không".

Lỗi còn tệ hơn. Tầng nhà cung cấp phân loại tốt (`ClassifiedError`: `rate_limited`, `quota`, `auth`, `refused`, `invalid_request`, ...) nhưng thông tin đó mất trước khi tới người dùng và tới agent:

- `taskService.settleOperation` và `settleItem` gộp mọi lỗi provider thành `code: 'provider'` / `reason: 'provider'`. Hết hạn mức, khóa sai và mất mạng hiện giống hệt nhau.
- `AgentOperation.error` là `unknown`, chỉ giữ `{ code, message }` với `message` là chuỗi thô của nhà cung cấp.
- `read_translation_tasks` (capability agent dùng để đọc task) chỉ trả `state` và `reason` của từng chương, không có nguyên nhân, nên khi người dịch hỏi "sao chương 9 lỗi?" agent không có dữ kiện để trả lời hay đề xuất cách xử lý.

Chủ sản phẩm đã chốt hướng (2026-10-23): hợp nhất thành một màn **Hoạt động** đọc từ trên xuống theo mức khẩn cấp, task thành công chỉ là một dòng, lỗi là bản ghi có cấu trúc cho cả người và agent cùng đọc, và **không** làm cây tác vụ.

## What Changes

- **Màn Hoạt động** thay hai tab, dạng **bảng như trang pipeline của GitLab**: cột Trạng thái, Hoạt động, Tạo bởi, Chương (dải chương) và Thao tác, các dòng sắp theo mức khẩn cấp, tab Tất cả / Đang chạy / Cần xử lý / Đã xong kèm số lượng và ô lọc; bấm tên một tác vụ để mở trang chi tiết có đường dẫn quay lại. Task xong không lỗi là một dòng.
- **Độ rộng**: màn Hoạt động tối đa 1600px (vùng dùng được ~1636px ở màn 1920), trang tác phẩm 960 → 1240px; văn xuôi khống chế ~68 ký tự.
- **Chi tiết tác vụ chia mục** Chương / Cảnh báo / Cách dịch / Lần chạy với đầu dính, bộ lọc chương, gom chương xong liên tiếp; cảnh báo "N/A" gộp một dòng; form điều chỉnh chỉ dẫn viết lại cho dễ hiểu (gập, chọn chương chưa dịch, điền sẵn chỉ dẫn hiện tại).
- **Chi tiết task**: tóm tắt (thời gian chạy, token, chi phí ước tính khi có giá, số xong/lỗi/bỏ qua) và bảng chương một dòng mỗi chương. Dòng "Không có chỉ dẫn" bỏ hẳn; chỉ hiện dấu khi chương có chỉ dẫn. "Chạy lại" tất cả ghi đè bản dịch nên cần xác nhận.
- **Tầng lần chạy AI**: bấm một chương thì mở các lần chạy của chương đó dưới dạng danh sách sự kiện có cấu trúc (giờ, model, token, kết quả, số lô), mở rộng được để xem lỗi thô đã che khóa. Thay thế tab Nhật ký AI. Không dùng terminal thật. Prompt và phản hồi thô của từng lời gọi model (file JSONL của `aiCallLog`) không hiện ở màn này.
- **Bản ghi lỗi có cấu trúc** (`TaskError`: `code`, `scope`, `what`, `cause`, `retryable`, `retryAfterMs`, `tried`, `options`, `detail`). Main lưu nó vào `operation.error`/`operation.result` thay cho `{ code: 'provider', message }`; UI và `read_translation_tasks` cùng đọc nó.
- **Lỗi hiển thị theo bốn phần**: chuyện gì · vì sao · app đã làm gì · bạn làm gì, kèm nút hành động theo loại lỗi và nút "Hỏi trợ lý AI" đưa bản ghi lỗi vào composer của chat (không tự gửi).
- **Gom lỗi trùng**: nhiều chương cùng nguyên nhân thành một dòng.
- **Màn tác phẩm** (`JobsArea`) dùng cùng thẻ task và chi tiết, lọc theo `workId` như hiện nay; khu đổi tên thành "Hoạt động", nhãn có dấu đang chạy và số việc cần xử lý, trạng thái trống có nút "Dịch các chương…" mở Trợ lý với câu lệnh điền sẵn.
- **Làm mới gọn**: gộp sự kiện, không tính lại cảnh báo chất lượng cho mỗi sự kiện tiến độ.
- **Không làm**: cây tác vụ, sơ đồ nút, terminal trong app, nhóm theo phiên chat (để sau, khi có lệnh nhiều truyện và đã có `session_id` trên task).

Không có thay đổi phá vỡ dữ liệu: không thêm bảng, không đổi enum `AgentTaskReason` hay CHECK trong schema, không migration. Các trường mới đi qua cột JSON sẵn có (`operation.error`, `operation.result`) và qua view IPC.

## Capabilities

### New Capabilities
- `activity-screen`: màn Hoạt động hợp nhất, thứ tự khối theo mức khẩn cấp, task xong là một dòng, chi tiết task, tầng lần chạy AI, lọc theo tác phẩm, hành vi gọn chữ và truy cập.
- `task-error-record`: bản ghi lỗi có cấu trúc từ nhà cung cấp tới UI và agent, bảng tra loại lỗi → câu tiếng Việt, mức và hành động, gom lỗi trùng, và việc agent đọc cùng bản ghi qua `read_translation_tasks`.

### Modified Capabilities
- `durable-translation-task`: requirement "IPC và màn Tác vụ phản ánh trạng thái thật" đổi sang màn Hoạt động và thêm vào view chi tiết lần chạy gần nhất của từng item (thời gian, usage, lỗi).

## Impact

- **Giao diện (renderer):** `app/screens/jobs/JobsScreen.tsx` (bỏ hai tab), `modules/agent/components/TaskList.tsx` (tách thẻ task, chi tiết, bảng chương), `OperationLog.tsx` (thành tầng lần gọi AI), `OperationCard.tsx` (`stateInfo`), `store/taskStore.ts`, `modules/workspace/work-detail/JobsArea.tsx`, tên mục sidebar "Tác vụ" → "Hoạt động". Dùng primitive sẵn có (`Badge`, `Button`, `ProgressBar`, `EmptyState`, `Tabs`) và token trong `DESIGN.md`; không thêm cỡ chữ, màu hay radius.
- **Main:** `services/agent/taskService.ts` (`settleOperation`, `settleItem`, bước trích xuất: ghi `TaskError`), `services/agent/chapterTranslationRunner.ts` (kết quả giữ nguyên nhân theo nhóm thay vì chỉ `failedIds`), `services/agent/capabilities/taskCapabilities.ts` (`read_translation_tasks` trả lỗi), phần dựng `AgentTaskDetailView`.
- **Hợp đồng IPC:** `shared/contracts/agentTask.ts` thêm `TaskError` và `lastRun` trên item; `shared/contracts/agent.ts` kiểu hóa `AgentOperation.error`.
- **Tài liệu:** quyết định ghi vào `docs/modules/workspace` (màn Hoạt động) và `docs/modules/design-system` (mẫu hiển thị lỗi), bằng tiếng Việt.
- **Phụ thuộc thứ tự:** working tree hiện có thay đổi chưa commit của change `unblock-auto-translate-context` ở `taskService.ts`, `TaskList.tsx`, `agentRepository.ts`. Change này nên bắt đầu sau khi change đó được commit để tránh xung đột.
