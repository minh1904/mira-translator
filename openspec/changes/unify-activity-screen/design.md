## Context

Xem `proposal.md` (Why) cho động cơ. Hiện trạng cần biết để chọn cách làm:

- **Dữ liệu đã có đủ cho phần lớn màn mới.** `agent_task`, `agent_task_item`, `agent_operation` (mỗi lần chạy một item là một operation, có `createdAt`, `updatedAt`, `usage`, `result`, `error`), cộng bằng chứng theo lô trong work DB. `AgentTaskSummary` đã có `counts`, `usage`, `extracting`. `agentTaskChanged` đã đẩy tới mọi cửa sổ.
- **Nơi mất thông tin lỗi.** `taskService.settleOperation` và bước trích xuất ghi `{ code: 'provider' | StorageError.code, message }`; `settleItem` ép lỗi provider về `reason: 'provider'` (và `budget`/`refused` khi đoán được từ `failedIds`). `ChapterTranslationRunResult` chỉ có `failedIds`, `refusedIds`, `budgetIds`, không có loại lỗi. `AgentOperation.error` và `.result` là `unknown`.
- **`AgentTaskReason`** là enum 9 giá trị nằm trong CHECK của schema (`librarySchema.ts`). Đổi nó cần migration và cập nhật fixtures `library-vN.schema.sql`.
- **Dữ liệu từng lời gọi model** chỉ có ở file JSONL (`aiCallLog.ts`, theo tác phẩm, giữ 30 ngày, chứa prompt/phản hồi thô). Không phải bảng, không phải nguồn cho UI.
- **Cùng một `TaskList` được dùng ở hai nơi:** `JobsScreen` (toàn app) và `JobsArea` (tác phẩm, prop `workId`). `OperationLog` chỉ dùng ở `JobsScreen`, lấy tối đa 200 operation qua `agent.operations.list` và không tự cập nhật với lượt chat.
- **DESIGN.md:** chỉ cỡ chữ 12/13/15/20, control 28px, không card lồng card, màu chỉ cho trạng thái, một mặt phẳng chia bằng đường kẻ mảnh.
- **Working tree** đang có thay đổi chưa commit của `unblock-auto-translate-context` ở `taskService.ts`, `TaskList.tsx`, `agentRepository.ts`.

## Goals / Non-Goals

**Goals:**
- Người dùng trả lời được "đang làm gì" và "có vấn đề gì" trong một cái nhìn; việc thành công không chiếm chỗ.
- Một bản ghi lỗi duy nhất mà UI và agent cùng đọc, đủ để agent trả lời và đề xuất mà không phân tích chuỗi thô.
- Không thêm bảng, không đổi enum, không migration.

**Non-Goals:**
- Cây tác vụ hay sơ đồ nút. Nhóm theo phiên chat (cần `session_id` trên task, để sau khi có lệnh nhiều truyện).
- Terminal trong app; hiển thị prompt/phản hồi thô.
- Tự động hóa việc agent xử lý lỗi (agent chỉ đọc và đề xuất; mọi hành động tốn tiền hoặc đổi model đi qua thẻ duyệt hiện có).
- Đổi `AgentTaskReason` hay chính sách thử lại/đóng băng khóa của tầng provider.

## Decisions

**D1. `TaskError` đi qua cột JSON sẵn có, không thêm bảng.** Lỗi của một lần chạy nằm trong `operation.error` (khi lần chạy ném lỗi) hoặc `operation.result.failures` (khi lần chạy kết thúc có lô lỗi). View chi tiết task dựng `lastRun` của item bằng cách đọc operation gần nhất của item.
*Thay thế đã loại:* bảng `task_error` riêng (đúng hơn về truy vấn nhưng cần migration cho library DB + fixture, và chưa có truy vấn nào cần nó); thêm cột lỗi vào `agent_task_item` (cũng cần migration, và mất lịch sử các lần chạy).

**D2. Giữ `AgentTaskReason` thô, `TaskError.code` mịn.** `reason` vẫn là phân loại chuyển trạng thái (transition table, điều khiển nào hợp lệ). `code` là nguyên nhân hiển thị và cho agent. Hai thứ trả lời hai câu hỏi khác nhau; trộn chúng buộc migration và làm vỡ bảng chuyển trạng thái.

**D3. Bảng mã lỗi lấy từ `ProviderErrorKind` cộng lỗi nội bộ.** `rate_limited`, `network`, `timeout`, `invalid_response`, `auth`, `quota`, `refused`, `invalid_request`, `cancelled` đi thẳng sang `code`; thêm `missing_raw`, `conflict`, `budget`. Một hàm thuần ở Main, `toTaskError(error, context)`, là nơi duy nhất sinh bản ghi; nó dùng `ClassifiedError.retryAfterMs`, `quotaScope`, `requestProblem`, `filter` và `bodySnippet` (đã che khóa bởi `redactSecrets`). `tried` lấy từ bộ đếm thử lại và đổi khóa mà tầng provider đã có; nếu không đọc được thì để trống, không bịa. `options` là danh sách mã hành động (`retry_now`, `open_connections`, `switch_model`, `skip_refused`, `reduce_batch`, `open_chapter`, `ask_assistant`), UI tra ra nhãn và nút; agent chỉ thấy mã.
*Thay thế đã loại:* suy `code` từ chuỗi `message` (mong manh, đúng thứ mà `provider-error-reasons` đã chủ ý thoát khỏi).

**D4. Runner trả nguyên nhân theo nhóm.** `ChapterTranslationRunResult` thêm `failures: Array<{ code, message, segmentIds }>` gộp theo `code`; `failedIds`, `refusedIds`, `budgetIds` giữ nguyên để không phá `settleItem`. `settleOperation` ghi `failures` vào `result`.

**D5. Màn dựng ở renderer từ dữ liệu sẵn có, logic gom/nhóm là hàm thuần.** Các hàm `partitionActivities` (cần xử lý / đang chạy / gần đây, nhóm theo ngày), `groupErrors` (gom lỗi trùng), `elapsedLabel` đặt cạnh store, test bằng dữ liệu cố định không cần DOM. Component tách từ `TaskList.tsx` (510 dòng): `TaskCard`, `TaskDetail`, `ChapterTable`, `ErrorBlock`, và `OperationLog` thành `RunLog`. Chúng vẫn thuộc module `agent` theo `ARCHITECTURE.md`; `JobsScreen`/`JobsArea` chỉ ghép.

**D6. "Đang dịch chương 9 · 6 giây" dùng đồng hồ cục bộ, không thêm sự kiện.** Item `running` có operation `createdAt`; giây hiển thị tính ở renderer bằng một bộ đếm 1 giây chỉ chạy khi thẻ đang hiện và tác vụ đang chạy, tắt khi giảm chuyển động bật hoặc cửa sổ ẩn (chữ số đổi không phải animation, nhưng bộ đếm vẫn nên dừng khi ẩn). Trạng thái thật vẫn đến từ `agentTaskChanged`.
*Thay thế đã loại:* sự kiện tiến độ mới từ Main mỗi giây (tốn IPC, không thêm thông tin).

**D7. Chi phí ước tính chỉ hiện khi có bảng giá.** Dùng bảng giá model sẵn có của tầng provider (`ModelCost`); không có giá thì chỉ hiện token, đúng với `UsageDisplay` (`costUsd` tùy chọn). Không bao giờ hiện "$0".

**D8. "Hỏi trợ lý AI" điền văn bản vào ô soạn, không dùng chip.** Bản triển khai hiện có dựng một đoạn văn từ bản ghi lỗi đã che khóa (không gồm `detail`) rồi đặt vào bản nháp của composer qua `setDraft`, và không tự gửi. Đơn giản hơn chip và đủ cho agent đọc; quyết định này thay cho phương án chip ban đầu. Phải **nối** sau bản nháp đang có, như đường `steer` đã làm, không ghi đè.

**D9. Lỗi cũ không migrate.** Operation cũ chỉ có `{ code, message }`; giao diện nhận ra dạng cũ (thiếu `scope`) và hiện "Lỗi không rõ loại" kèm thông điệp. Không suy ngược loại từ chuỗi.

**D10. Đổi tên mục điều hướng "Tác vụ" → "Hoạt động" ở một chỗ.** Các spec khác nói "màn Tác vụ" (`agent-task-steering`, `translation-task-quality`) được hiểu là màn Hoạt động; hành vi của chúng không đổi, nên không cần delta cho chúng.

**D11 (đã thay, 2026-10-23). Bảng như trang pipeline và trang chi tiết riêng.** Sau khi thử khung đôi, chủ sản phẩm chọn giao diện giống danh sách pipeline của GitLab: bảng đủ cột (trạng thái, hoạt động, tạo bởi, dải chương, thao tác), bấm tên để mở trang chi tiết có đường dẫn quay lại. Cột "Tạo bởi" và "Chương" ẩn theo container query (880px và 760px) trên khung chứa của màn. Dải chương vẽ từ `counts` của tác vụ (không cần dữ liệu từng chương), nên không thêm gì vào IPC. `ActivitySplit`, `TaskListRow` và `pickSelection` đã bỏ. Đoạn dưới đây chỉ còn là lịch sử của phương án khung đôi.

**D11 cũ. Hai khung đo bằng container query, trên khung chứa của màn.** Gốc màn là một `@container`; từ 960px trở lên dùng lưới `[minmax(320px,380px)_1fr]`, mỗi khung `overflow-auto` riêng và trang không cuộn tổng thể, dưới 960px chỉ hiện danh sách và chi tiết thay thế nó kèm nút quay lại. Mục đang chọn nằm trong state của màn (không trong URL) và được giữ khi quay lại. Việc chọn mặc định là hàm thuần `pickSelection(parts, current)` để test. Đây là cùng kiểu `@min-[760px]` mà `ChaptersArea` đã dùng, và khớp hướng dẫn chia khung của Windows/nqui (đo khung chứa, xếp chồng khi hẹp, giữ lựa chọn).
*Thay thế đã loại:* thẻ xếp dọc có mở rộng tại chỗ (đó là cái đang làm người dùng cuộn mỏi và lạc); cây tác vụ (đã loại ở proposal).

**D12. Độ rộng là thuộc tính của `PageFrame`.** Thêm `width: 'default' | 'wide' | 'full'` = 1080 / 1240 / 1600px, giữ `wide` hiện có chạy được; thêm `fill` cho trang tự quản cuộn bên trong. Màn Hoạt động dùng `full` + `fill`; `WorkDetailScreen` nâng 960 → 1240. 1600 chọn vì ở cửa sổ phóng to 1920px (vùng dùng được ~1636px) nội dung gần kín; trên 2560px nội dung dừng ở 1600 và căn giữa. Văn xuôi tự khống chế ~68 ký tự (`max-w-[68ch]`), không theo độ rộng khung. Số liệu: 1920×1080 ~20–22% desktop toàn cầu theo StatCounter 2026, 1536×864 ~7%, 1366×768 ~5,5%, 1280×720 ~6%; Steam 1080p ~51%, 1440p ~21% (thiên lệch về người chơi game, không riêng người dùng Việt).

**D13. Chi tiết chia mục, gom chương xong, lọc theo trạng thái.** Bốn mục Chương/Cảnh báo/Cách dịch/Lần chạy, mỗi lần một mục (học Temporal: hàng gom cho tổng quan, xem đầy đủ chỉ để gỡ lỗi; GitHub Actions: danh sách một bên, log một bên, tự mở bước lỗi; Vercel: build lỗi mở sẵn ở bộ lọc lỗi). `collapseCompleted(items)` là hàm thuần gom các chương `completed` liền nhau thành một dòng; danh sách chương cuộn trong khung cao cố định, chưa ảo hóa cho tới khi một tác vụ vượt ~200 chương.

**D14. Form điều chỉnh dựng lại, không đổi hợp đồng.** `steer` vẫn nhận số chương và toàn văn chỉ dẫn; giao diện chỉ liệt kê chương chưa ghim lần chạy (`item.instruction === undefined`) và điền sẵn `currentInstruction`. Chương bắt đầu thực tế vẫn do Main tính (`effectiveFrom`).

## Risks / Trade-offs

- **Chồng lên change `unblock-auto-translate-context` chưa commit** (cùng `taskService.ts`, `TaskList.tsx`) → bắt đầu apply sau khi change đó commit; nếu phải song song, tách commit theo file.
- **`failures` làm kết quả operation to hơn** → mỗi nhóm chỉ giữ tối đa 20 `segmentIds` kèm số tổng; `message` cắt theo giới hạn của `bodyExcerpt`.
- **Lộ dữ liệu nhạy cảm trong `detail` và trong chip gửi cho agent** → chỉ dùng chuỗi đã qua `redactSecrets`; capability của agent không bao giờ trả `detail`; test có khóa giả trong thân phản hồi.
- **Tầng lần chạy ít chi tiết hơn "từng lời gọi"** → chấp nhận cho lần này; nếu cần từng lời gọi thì cần bảng mới, là change riêng.
- **`tried` có thể không đọc được từ tầng provider** → để trống và UI bỏ phần "app đã làm gì"; không bịa số lần thử.
- **Gom lỗi chỉ ở hiển thị** → bản ghi từng chương giữ nguyên, agent vẫn đọc được từng chương.
- **Làm mới dồn dập khi tác vụ chạy** (đã thấy trong code, chưa đo): mỗi `agentTaskChanged` gọi `refresh()`, mà `refresh()` đọc 200 operation, rồi lần lượt `get` và `quality` cho mọi tác vụ đang giữ chi tiết; thẻ tác vụ đang chạy tự giữ chi tiết nên cảnh báo chất lượng bị tính lại theo từng sự kiện → gộp sự kiện (trailing ~500 ms), chỉ đọc `quality` khi chi tiết do người dùng mở, đọc danh sách lượt chat khi mount và khi lượt chat đổi chứ không theo sự kiện tác vụ.
- **`cause` và `what` chưa che khóa trong bản triển khai hiện có** (chỉ `detail` qua `redactSecrets`), trong khi `cause` đi tới agent và ô soạn → che toàn bộ trường văn bản ở `toTaskError`/`taskErrorFromFailures`.
- **Lỗi đang tự thử lại bên trong tầng provider không thấy được** (item vẫn `running`, `chapterErrorsOf` chỉ đọc item `failed`/`waiting_user`) → chấp nhận, spec chỉ hứa hiện lỗi sau khi chương thất bại; hiện lần thử lại cần sự kiện mới, ngoài phạm vi.
- **Hai khung cuộn riêng cần xử lý focus và trình đọc màn hình** (cuộn bàn phím, `aria-current` cho mục chọn, đưa focus về dòng đã chọn khi quay lại ở chế độ xếp chồng) → kiểm tay ở cả hai chế độ; thêm test cho `pickSelection`.
- **Cửa sổ 1280px (vùng ~996px) chỉ vừa dưới ngưỡng 960px hai khung nếu thanh bên mở rộng** → chấp nhận xếp chồng ở đó; người dùng thu thanh bên thì được hai khung.
- **Nâng 960 → 1240 cho trang tác phẩm có thể làm các khu khác (Chương, Bản raw) dãn lạ** → kiểm từng khu ở 1366 và 1920 trước khi gộp.
- **Hai nơi dùng chung thẻ (toàn app và tác phẩm)** → thẻ nhận `workId` như hiện nay; test cả hai chế độ.

## Migration Plan

Không có migration dữ liệu. Thay đổi hợp đồng IPC (`TaskError`, `lastRun`) là cộng thêm, trường tùy chọn, nên cửa sổ cũ vẫn chạy. Triển khai theo bốn lát, mỗi lát merge được riêng:

1. Màn Hoạt động chỉ giao diện (nhóm, task xong một dòng, bảng chương gọn, bỏ hai tab), chưa đụng Main.
2. `TaskError` ở Main + `failures` ở runner + khối "Cần xử lý" và `ErrorBlock` + `read_translation_tasks`.
3. `lastRun` (thời gian/token theo chương) + tầng lần chạy + bộ đếm "đang dịch".
4. "Hỏi trợ lý AI" + chi phí ước tính.

Hoàn tác: mỗi lát độc lập; lát 1 chỉ là renderer nên revert commit là đủ. Cột JSON giữ nguyên dạng cũ đọc được.

## Open Questions

- Giá trị mặc định cho số `segmentIds` giữ trong `failures` (đề xuất 20) có đủ để agent lập luận không? Quyết khi viết `toTaskError`.
- Khi có lệnh nhiều truyện, nhóm theo phiên chat cần `session_id` trên task; để change sau.

## Ghi chú khi triển khai (2026-10-23)

Kết quả kiểm tra 1.2 khác giả định ở ba điểm:

- `agent.operations.list` chỉ nhận `limit`, không lọc theo item. Thêm `AgentRepository.listTaskOperations(taskId)`
  (một truy vấn gộp) cho `lastRun` trong chi tiết task, và kênh `agent:task:runs` cho tầng lần chạy của một
  chương. `lastRun` không mang `detail` (thân phản hồi); chỉ danh sách lần chạy mang.
- Bằng chứng lô (`readAgentOperationEvidence`) cho số lô đã ghi, không cho tổng lô dự kiến và không có thời gian
  hay usage theo lô. Lần chạy hiện "N lô", thời gian và token lấy từ operation.
- `ProviderError` không mang số lần thử hay việc đổi khóa, nên `TaskError.tried` để trống (D3). `AgentOperation.error`
  vẫn là `unknown` ở tầng lưu; phía đọc đi qua `parseOperationError` (schema valibot, chấp nhận dạng cũ).

D8: "Hỏi trợ lý AI" điền văn bản lỗi đã che khóa vào ô soạn (`setDraft`) và mở màn Trợ lý, thay vì thêm loại chip;
chip phải qua schema đính kèm và Main, để sau nếu cần.

Spec `task-error-record` yêu cầu lỗi xác thực và hết hạn mức dừng cả tác vụ: `taskService.haltTask` chuyển tác vụ
sang `waiting_user` (reason `provider`, đã nằm trong bảng chuyển trạng thái), các chương còn lại giữ `queued`.
