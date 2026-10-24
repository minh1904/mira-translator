## Context

Xem `proposal.md` (Why). Hiện trạng ràng buộc cách làm:

- `AgentTaskService` giữ **một** `RunningItem` (`this.running`). `wake()` bỏ qua khi có item chạy; `idle()`,
  `isChapterBusy`, pause/cancel, đường đóng app và `haltTask` (thêm ở change `unify-activity-screen`) đều đọc biến
  đơn này. `nextQueuedItem()` chọn theo `(task.created_at, task.id, item.ordinal)` trong các task `queued`/`running`.
- Trích thuật ngữ chạy **bên trong** `runItem` của item đầu (`extractTerms`), nên với một item đang chạy thì không
  item khác của task có thể chen vào. Song song phá giả định đó.
- `gateFor(task, operationId)` cộng lượt gọi và usage của các operation **đã có** của task cộng phần "live" của
  lượt hiện tại. Hai lượt chạy song song không thấy phần live của nhau.
- Gateway: mỗi mục model (entry) một `Limiter` (mặc định 4, người dùng đặt được `concurrencyLimit`) và một
  `RatePacer` (`rpmLimit`, mặc định tắt), dùng chung cho chat và tác vụ. `Limiter` là hàng FIFO, `setLimit` đổi
  trần lúc chạy và không ngắt lượt đang chạy. `KeyScheduler` đóng băng khóa theo đợt và đổi khóa ngay khi khóa lỗi
  (requirement "Chọn khóa an toàn khi nhiều lượt chạy cùng lúc" của change `ai-gateway` đã lưu trữ).
- Provider được dựng **mỗi lần mở** qua `ConnectionService` (đọc lại giới hạn của mục mỗi lần), nên có chỗ để truyền
  mức ưu tiên của người gọi.
- Snapshot ngữ cảnh của item chỉ đọc kho ngữ cảnh lúc item bắt đầu, không đọc bản dịch của item khác
  (`takeContextSnapshot`); `<previous>` là ba đoạn bản gốc trong cùng chương.

## Goals / Non-Goals

**Goals:**
- Tác vụ dùng hết suất đồng thời của mục model mà không vượt trần tác vụ và không dồn cục khi bắt đầu.
- Gặp giới hạn tốc độ thì toàn mục model chậm lại, không chỉ đổi khóa.
- Lượt chat không phải chờ sau hàng lời gọi của tác vụ.

**Non-Goals:**
- Song song các batch **trong** một chương (giữ tuần tự để sau này cho lô thấy bản dịch lô trước).
- Giãn theo token/phút, đọc header "còn lại" của nhà cung cấp, cấu hình mới trong giao diện.
- Gửi ngữ cảnh chương trước (nghiên cứu ở `docs/modules/context/cross-chapter-context.md`, change riêng).
- Đổi enum trạng thái, bảng chuyển trạng thái hay IPC. Schema chỉ bỏ một index (D9).

## Decisions

**D1. Scheduler mở tới trần đã cấu hình; gateway quyết định khi nào lời gọi đi.** Số item `running` của một mục
model ≤ trần đồng thời của mục (`concurrencyLimit` hoặc `DEFAULT_CONCURRENCY`). Mức hiện hành do gateway điều chỉnh
(D4) chỉ giới hạn **lời gọi**; item thừa so với mức hiện hành chờ trong hàng của `Limiter` với trạng thái `running`.
*Thay thế đã loại:* scheduler đọc mức hiện hành của gateway và chỉ mở bằng số đó. Chính xác hơn về hiển thị nhưng
cần sự kiện từ gateway về Main service và vòng phản hồi hai chiều; lợi không đáng.

**D2. Chọn item theo vòng giữa các task.** Khi có suất của mục model M, scheduler lấy các task `queued`/`running`
dùng M, không đang trích thuật ngữ, không ở trạng thái dừng; chọn task có **ít item đang chạy nhất**, hòa thì task
tạo trước; trong task lấy item `queued` có `ordinal` nhỏ nhất. Thực hiện trong service trên danh sách item `queued`
đọc một lần (thay `nextQueuedItem()` bằng truy vấn trả mọi item `queued` kèm `task.created_at` và model của task).
*Thay thế đã loại:* FIFO theo task (task sau chờ task trước xong hết, chính là điều người dùng phàn nàn).

**D3. Trạng thái chạy theo tập.** `this.running: RunningItem | null` → `Map<itemId, RunningItem>`. `isChapterBusy`
kiểm mọi phần tử; `idle()` chờ mọi `done`; pause/cancel đặt `stop` cho mọi item của task; đường đóng app đã duyệt
`runningItems()` từ DB. Task chỉ chuyển `pausing → paused` hay `cancelling → cancelled` khi item `running` cuối của
nó kết thúc (kiểm trong `endItem`/`settleItem`). `haltTask` đổi task sang `waiting_user` ngay; item đang chạy kết
thúc theo kết quả thật và `wake()` không chọn item của task không còn `queued`/`running`.

**D4. Gateway tự điều chỉnh mức đồng thời theo mục (AIMD).** Một lớp `AdaptiveLimit` cạnh `Limiter` của entry:
- Bắt đầu 1. Mỗi **2** lời gọi thành công liên tiếp tăng 1, tới trần cấu hình.
- `rate_limited` (từ bất kỳ khóa nào của entry): mức = max(1, floor(mức/2)); đặt `pausedUntil` = now +
  `retryAfterMs` nếu có, nếu không thì `min(60s, 2s × 2^(n−1))` với jitter ±20% (n = số lần liên tiếp). Lỗi đến
  trước `pausedUntil` cũ không giảm thêm (một lần giảm mỗi khoảng chờ, giống cách `KeyScheduler` gộp đợt).
- `acquire` chờ tới `pausedUntil` trước khi lấy suất; lượt đang chạy không bị đụng tới.
- `quota`/`auth` không đổi mức (khóa bị đóng băng hoặc đánh dấu sai như cũ); `network`/`timeout` không đổi mức.
- Đổi khóa ngay cho lượt đang lỗi vẫn giữ (requirement của `ai-gateway`), vì người dùng có thể thêm khóa của project
  khác nhau. Lượt **mới** thì chờ khoảng tạm ngừng.
*Thay thế đã loại:* chỉ giãn theo RPM cố định (người dùng phải biết số, sai thì vẫn 429); đọc header còn lại (Gemini
không có, để change sau).

**D5. Ưu tiên chat bằng hai hàng trong `Limiter`.** `acquire(signal, priority)` với `priority: 'interactive' |
'background'`; `drain` lấy hàng `interactive` trước. Người gọi truyền mức khi dựng provider: mặc định `interactive`;
`AgentTaskService` (runner và trích thuật ngữ) dựng với `background`. Không giữ suất trống riêng cho chat: khi không
có chat, tác vụ dùng hết trần.
*Thay thế đã loại:* giữ cố định một suất cho chat (phí một phần tư thông lượng khi không ai chat).

**D6. Trần tác vụ dùng chung.** `gateFor` lấy bộ đếm live từ một `Map<taskId, TaskLive>` (lượt gọi và usage của mọi
operation đang chạy của task), cộng với phần đã lưu. `allow()` là đồng bộ, Node chạy một luồng, nên kiểm và tăng
trong cùng một lần gọi là đủ để hai item không cùng vượt trần.

**D7. Trích thuật ngữ chặn task, không chặn app.** `extractTerms` vẫn chạy trong item đầu được chọn, nhưng task được
đánh dấu "đang trích" trong một `Set<taskId>`; D2 bỏ qua task đó. Trích xong thì bỏ dấu và `wake()`.

**D8. Giao diện.** `TaskCard` hiện mọi item `running` ("Đang dịch chương 4, 5, 7 · …") với bộ đếm của item bắt đầu
sớm nhất; không thêm thành phần mới.

## Risks / Trade-offs

- [Chạm giới hạn token/phút trước số lời gọi] → D4 vẫn giảm tốc khi gặp 429; giãn theo token để change sau.
- [Điều chỉnh chỉ dẫn và sửa glossary áp muộn hơn vài chương] → kết quả điều chỉnh đã trả chương thực sự áp dụng;
  scenario "Sửa glossary giữa task" nói rõ item chưa bắt đầu mới nhận bản mới.
- [Item `running` nhưng thực ra đang chờ trong hàng gateway] → chấp nhận; thời gian hiển thị tính từ lúc operation tạo
  nên có thể dài hơn thời gian gọi thật. Ghi chú ở thẻ không cần thiết.
- [Lỗi khóa giữa nhiều item: các item đang chạy cũng lỗi] → `haltTask` dừng chương mới; các lỗi gom một dòng nhờ
  `groupErrors` của màn Hoạt động.
- [Chat đến khi tác vụ chiếm đủ suất vẫn chờ lượt đang chạy xong] → D5 chỉ ưu tiên trong hàng; một lượt dịch Gemini
  Flash thường vài giây đến vài chục giây.
- [Khởi động chậm làm lượt chat đầu tiên chỉ có 1 suất] → chat đơn lẻ chỉ cần 1 suất.
- **Phụ thuộc:** change `unify-activity-screen` (chưa commit) thêm `haltTask`, `TaskCard`, `lastRun`; apply change
  này sau khi change đó commit.

**D9. Bỏ index một item `running` (ghi khi triển khai, 2026-10-24).** Library có
`agent_task_item_one_running` (unique trên `(1)` với `state = 'running'`), nên item thứ hai chuyển `running` lỗi UNIQUE.
Migration v20 `DROP INDEX`; scheduler (D1) là chỗ giới hạn số item chạy. Không đổi dữ liệu, file cũ mở được.
*Thay thế đã loại:* giữ index và để item thứ hai ở `queued` khi đang chạy (sai spec "nhiều item `running`", hỏng
đường đóng app và khôi phục). v20 chồng lên v19 của change `add-agent-turn-steering` chưa commit.

**Ghi chú triển khai.** `TaskCard` đã được thay bằng phần đầu của `TaskDetail` (việc 8.5 của `unify-activity-screen`),
nên D8 làm ở đó. "Item cuối" của Pause/Cancel đọc trạng thái item trong library, không đọc tập `running` trong bộ
nhớ: các lượt chạy kết thúc cùng một nhịp vẫn còn trong tập cho tới khi promise của chúng xong.

## Migration Plan

Migration library v20 (D9), không chuyển dữ liệu. Ba lát, mỗi lát merge được riêng:
1. Gateway: `Limiter` hai hàng + `AdaptiveLimit` (D4, D5). Scheduler vẫn tuần tự nên chỉ chat hưởng ưu tiên; đo được
   AIMD bằng test.
2. Scheduler song song (D1–D3, D6, D7) và thẻ tác vụ (D8).
3. Đo trên tác vụ thật và ghi số vào `docs/modules/ai-connections/parallel-requests.md`.

Hoàn tác: đặt trần đồng thời của mục model về 1 cho kết quả như tuần tự mà không cần revert.

## Open Questions

- Ngưỡng tăng (2 lời gọi thành công) và trần chờ 60 giây là giá trị thử; chỉnh sau khi đo ở lát 3, không đổi spec.
