## 1. Chuẩn bị

- [ ] 1.1 Xác nhận change `unify-activity-screen` đã commit (cần `haltTask`, `TaskCard`, `lastRun`); chưa commit thì dừng và báo. Kiểm bằng `git log -- src/main/services/agent/taskError.ts`.
- [x] 1.2 Đọc lại `ARCHITECTURE.md` mục Main (`infra` thấp, `services` điều phối) để đặt `AdaptiveLimit` trong `infra/providers/gateway/`; ghi vào `design.md` nếu vị trí khác D4.

## 2. Lát 1: gateway tự điều chỉnh và ưu tiên chat

- [x] 2.1 `Limiter.acquire(signal, priority)` với hai hàng `interactive`/`background`, `drain` lấy `interactive` trước; hủy lượt đang chờ vẫn gỡ khỏi đúng hàng. Test: chat chen trước ba lượt nền đang chờ; FIFO trong cùng hàng; hủy không gửi.
- [x] 2.2 `AdaptiveLimit` (start 1, +1 sau 2 lần thành công liên tiếp tới trần, `rate_limited` chia đôi tối thiểu 1, `pausedUntil` theo `retryAfterMs` hoặc backoff 2s·2^(n−1) ±20% trần 60s, một lần giảm mỗi khoảng chờ). Test bằng đồng hồ giả: ba 429 cùng lúc chỉ giảm một lần; báo chờ 20s thì không lượt mới nào bắt đầu trước 20s; `quota`/`auth`/`network`/`timeout` không đổi mức; hồi phục tăng dần tới trần.
- [x] 2.3 Nối `AdaptiveLimit` vào `Gateway.call` và `GatewayRegistry.entryRuntimeFor` (trần cấu hình vẫn từ `concurrencyLimit`, `RatePacer` giữ nguyên); test `gateway.test.ts`: lượt lỗi `rate_limited` vẫn đổi khóa ngay như cũ, lượt mới chờ khoảng tạm ngừng.
- [x] 2.4 Truyền mức ưu tiên khi dựng provider (`ConnectionService` → `OpenAiCompatibleProvider` → `Gateway`), mặc định `interactive`; `AgentTaskService` (runner và trích thuật ngữ) mở với `background`. Test: lời gọi từ task mang `background`, từ chat mang `interactive`.
- [ ] 2.5 Chạy `node scripts/check.mjs`; commit `feat(ai): adapt concurrency per model and let chat go first`.

## 3. Lát 2: scheduler song song

- [x] 3.1 Truy vấn repository trả mọi item `queued` của task `queued`/`running` kèm `task.created_at` và model của task; hàm thuần chọn item theo D2 (ít item đang chạy nhất, hòa thì task cũ hơn, rồi `ordinal`) kèm test với dữ liệu cố định.
- [x] 3.2 `AgentTaskService`: `running` thành `Map<itemId, RunningItem>`; `wake()` mở item tới trần của từng mục model; `idle()`, `isChapterBusy`, đường đóng app dùng tập. Test: hai task cùng mục trần 4 chạy bốn item, hai mỗi task; trần 2 thì đúng hai item `running`.
- [x] 3.3 Pause/Cancel đặt `stop`/abort cho mọi item của task; task chỉ `paused`/`cancelled` khi item `running` cuối kết thúc. Test theo các scenario "Pause giữa item", "Cancel khi provider đang chạy", "Đóng app khi task đang chạy" của spec.
- [x] 3.4 Đánh dấu task đang trích thuật ngữ (D7) và bỏ qua nó khi chọn item; test scenario "Trích thuật ngữ trước khi dịch".
- [x] 3.5 Trần task dùng chung (D6): `gateFor` đọc bộ đếm live theo task. Test scenario "Hai item cùng chạm trần" (đã dùng 39/40, hai item cùng xin: đúng một lời gọi đi).
- [x] 3.6 `haltTask` với nhiều item đang chạy: test scenario "Lỗi khóa dừng cả task" (item 3 lỗi auth, 4 và 5 kết thúc theo kết quả thật, không item mới bắt đầu).
- [x] 3.7 Test snapshot không phụ thuộc thứ tự: item 9 bắt đầu trước khi item 8 xong có snapshot giống khi chạy tuần tự (so `snapshotHash`).
- [x] 3.8 `TaskCard` hiện mọi chương đang dịch và bộ đếm của chương bắt đầu sớm nhất (D8); cập nhật test `TaskList.test.ts`.
- [ ] 3.9 Cập nhật các test `taskService.test.ts` đang giả định một item chạy (ví dụ kiểm `maxConcurrent === 1`) theo spec mới; chạy `node scripts/check.mjs`; commit `feat(agent): run task chapters in parallel up to the model's limit`.

## 4. Đo và tài liệu

- [ ] 4.1 Đo tác vụ 30 chương với Gemini Flash (tier miễn phí và tier 1 nếu có): tuần tự (trần 1), song song cố định (tắt AIMD bằng test hook), AIMD; ghi thời gian xong, số 429, số request lỗi, token vào `docs/modules/ai-connections/parallel-requests.md` (tiếng Việt, phân biệt số đo với đề xuất).
- [ ] 4.2 Chỉnh ngưỡng tăng và trần chờ nếu số đo cho thấy cần (Open Questions của `design.md`); ghi giá trị cuối vào tài liệu.
- [ ] 4.3 Cập nhật trạng thái trong `docs/modules/ai-connections/parallel-requests.md` và `docs/modules/workspace/activity-screen.md` sang "đã triển khai"; đổi `.md` mới sang CRLF; `node scripts/check.mjs --build` trước khi push.
