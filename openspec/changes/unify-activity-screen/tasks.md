> Ghi chú 2026-10-23: phần lớn các mục 2–5 đã có trong working tree (`TaskCard`, `TaskSummaryRow`,
> `ChapterTable`, `ErrorBlock`, `RunLog`, `model/activity.ts`, `model/taskErrorView.ts`,
> `services/agent/taskError.ts`) do phiên khác làm và tự đánh dấu. Tôi chỉ đọc code đối chiếu spec, **chưa
> chạy test hay `check.mjs`**, nên các dấu xong ở mục 1–6 chưa được tôi kiểm lại; mục 7 là các chỗ lệch
> tìm thấy khi đọc.

## 1. Chuẩn bị

- [x] 1.1 Đọc `ARCHITECTURE.md` (vị trí component trong module `agent`, hook/store, ranh giới Main–renderer) và xác nhận `unblock-auto-translate-context` đã commit trước khi sửa `taskService.ts`, `TaskList.tsx`.
- [x] 1.2 Xác nhận bằng code: operation của item lưu `createdAt`/`updatedAt`/`usage`; `agent.operations.list` trả được theo `taskItemId`; bằng chứng lô (`readAgentOperationEvidence`) có thời gian/usage theo lô hay không. Ghi kết quả vào `design.md` nếu khác giả định D1/D6.

## 2. Lát 1: màn Hoạt động chỉ giao diện

- [x] 2.1 Viết hàm thuần `partitionActivities` (cần xử lý / đang chạy / gần đây, nhóm theo ngày "Hôm nay", "Hôm qua", ngày đầy đủ) kèm test với dữ liệu cố định, gồm ca một task nằm đúng một khối.
- [x] 2.2 Tách `TaskList.tsx` thành `TaskCard` (đang chạy), `TaskSummaryRow` (một dòng cho task xong), `TaskDetail`, `ChapterTable`; giữ `SteeringPanel` và `QualityPanel` trong chi tiết.
- [x] 2.3 `ChapterTable`: một dòng mỗi chương, cột số căn phải dùng chữ số đều nhau, bỏ dòng "Không có chỉ dẫn", chỉ hiện dấu chỉ dẫn khi có; "Mở đích" và "Bỏ qua" thành hành động của dòng.
- [x] 2.4 "Chạy lại tất cả" có hộp xác nhận nói ghi đè bản dịch; "Chạy lại chương lỗi" không cần xác nhận. Dùng `Dialog` và `Button` (`tone="danger"` khi ghi đè), không viết control mới.
- [x] 2.5 Bỏ hai tab ở `JobsScreen`; thêm dải tổng quan và bộ chọn tác phẩm; `JobsArea` dùng cùng thẻ với `workId` cứng và không có bộ chọn.
- [x] 2.6 Đưa lượt chat vào "Gần đây" thành dòng nhãn "Chat", không badge "Hoàn tất"; chuyển `OperationLog` thành nguồn dữ liệu cho các dòng này.
- [x] 2.7 Đổi tên mục điều hướng và tiêu đề "Tác vụ" → "Hoạt động"; cập nhật chỗ nào test hay palette tìm theo tên cũ.
- [ ] 2.8 Kiểm giao diện theo `DESIGN.md`: chỉ token có sẵn, không card lồng card, focus nhìn thấy, `aria-live`, giảm chuyển động, tên chương CJK dài ở cửa sổ hẹp, theme sáng/tối.

## 3. Lát 2: bản ghi lỗi có cấu trúc

- [x] 3.1 Thêm kiểu `TaskError` và bảng mã `TASK_ERROR_CODES` vào `shared/contracts/agentTask.ts`; kiểu hóa `AgentOperation.error` bằng schema valibot chấp nhận cả dạng cũ `{ code, message }`.
- [x] 3.2 Viết `toTaskError` ở Main từ `ClassifiedError` / `StorageError` / `MissingSourceError` / trần ngân sách: sinh `what`, `cause`, `retryable`, `retryAfterMs`, `tried`, `options`, `detail` đã che khóa; `cause` và `retryAfterMs` chỉ khi có bằng chứng. Test từng `kind`, gồm ca không có bằng chứng và thân phản hồi chứa khóa giả.
- [x] 3.3 `ChapterTranslationRunResult.failures` gộp theo `code` (giới hạn `segmentIds`), giữ `failedIds`/`refusedIds`/`budgetIds`; test chương có hai nguyên nhân.
- [x] 3.4 `taskService.settleOperation`, `settleItem` và bước trích xuất ghi `TaskError` thay cho `{ code: 'provider', message }`; `AgentTaskReason` và bảng chuyển trạng thái không đổi.
- [x] 3.5 View chi tiết task trả `TaskError` của lần chạy gần nhất cho item lỗi; lỗi dạng cũ trả nguyên để UI hiện "Lỗi không rõ loại".
- [x] 3.6 `read_translation_tasks` trả `TaskError` (không có `detail`) cho mỗi tác vụ và chương lỗi; mô tả capability nói rõ agent trả lời dựa trên bản ghi và nói khi không đủ dữ kiện. Test: khóa không lọt vào kết quả.
- [x] 3.7 Bảng tra `code` → câu tiếng Việt, mức (cảnh báo/lỗi) và nút hành động ở renderer, cạnh `stateInfo`; test mọi `code` đều có mục.
- [x] 3.8 Hàm thuần `groupErrors` (gom theo `code` và nguyên nhân, giữ bản ghi từng chương) kèm test; `ErrorBlock` hiện bốn phần chuyện gì · vì sao · đã làm gì · bạn làm gì, và khối "Cần xử lý" dùng nó.

## 4. Lát 3: lần chạy gần nhất và tầng lần chạy

- [x] 4.1 Thêm `lastRun` (`startedAt`, `endedAt`, `usage`, `error`) vào item trong `AgentTaskDetailView`; dựng ở Main bằng một truy vấn gộp, không gọi lặp theo từng operation.
- [x] 4.2 `ChapterTable` hiện thời gian và token từ `lastRun`; usage không báo hiện "không rõ", không hiện 0.
- [x] 4.3 Tầng lần chạy: bấm chương mở danh sách các lần chạy (giờ, model, token, thời gian, kết quả, số lô), lọc theo mức, mở rộng lỗi để thấy `detail`, nút Sao chép, tự cuộn theo dòng mới và chỉ báo "có dòng mới" khi người dùng cuộn lên; chữ đơn cách cho giờ và số.
- [x] 4.4 Dòng "Đang dịch chương N · n giây" bằng bộ đếm cục bộ chỉ chạy khi thẻ hiện và tác vụ đang chạy.

## 5. Lát 4: Hỏi trợ lý và chi phí

- [x] 5.1 Hành động "Hỏi trợ lý AI": mở panel Trợ lý và đính `TaskError` đã che khóa vào ô soạn, không tự gửi; nếu composer chưa nhận chip dạng văn bản thì thêm loại chip "lỗi tác vụ" trong module `agent`.
- [x] 5.2 Chi phí ước tính theo task và chương khi model có bảng giá; không có giá thì chỉ hiện token.
- [ ] 5.3 Kiểm tra thủ công luồng đề xuất đổi model của Trợ lý vẫn đi qua thẻ duyệt và không áp dụng khi chưa duyệt.

## 6. Tài liệu và kiểm tra

- [x] 6.1 Ghi quyết định màn Hoạt động vào `docs/modules/workspace` và mẫu hiển thị lỗi vào `docs/modules/design-system` (tiếng Việt, phân biệt quyết định đã chốt với đề xuất và hành vi đã triển khai); cập nhật `DESIGN.md` chỉ nếu thêm quy tắc chung.
- [x] 6.2 Đổi `.md` mới sang CRLF bằng script Node; chạy `node_modules/.bin/biome format --write` cho file `.ts`/`.tsx` mới.
- [ ] 6.3 Chạy `node scripts/check.mjs` trước mỗi commit và `node scripts/check.mjs --build` trước khi push; mỗi lát một commit (`feat(ui)`, `feat(alignment)` hoặc scope phù hợp), một thay đổi logic mỗi commit.

## 7. Sửa sau khi đọc code hiện có (2026-10-23)

- [ ] 7.1 Đổi nhãn khu "Tác vụ" thành "Hoạt động" trong trang tác phẩm (`workAreas.tsx`), thêm dấu đang chạy kèm chữ cho trình đọc màn hình và số việc cần xử lý trên nhãn; dùng cùng dữ liệu `partitionActivities` lọc theo tác phẩm.
- [ ] 7.2 Trạng thái trống của khu Hoạt động trong tác phẩm: thêm nút "Dịch các chương…" mở Trợ lý với câu lệnh điền sẵn (nối vào bản nháp, không tự gửi), tái dùng đường `onAskAssistant` của `JobsArea`.
- [ ] 7.3 `onAskAssistant` ở `JobsArea` và `JobsScreen` đang gọi `setDraft(text)` ghi đè bản nháp: nối sau bản nháp như đường `steer` trong `agentStore`; thêm test.
- [ ] 7.4 Che khóa `cause` và `what` trong `taskErrorFromFailures`/`toTaskError` (hiện chỉ `detail` qua `redactSecrets`); test với khóa giả trong thông điệp nhà cung cấp của lỗi `refused`/`invalid_request`. Cân nhắc che cả `message` của lỗi dạng cũ khi `runs()` trả cho `RunLog`.
- [ ] 7.5 Giảm tải `refresh()` ở `taskStore`: gộp sự kiện `agentTaskChanged` (trailing ~500 ms), chỉ đọc `quality` cho tác vụ mà người dùng đang mở chi tiết (thẻ chạy tự giữ chi tiết thì không tính cảnh báo), và đọc `operations.list` khi mount hoặc khi lượt chat đổi thay vì theo mỗi sự kiện tác vụ. Đo trước và sau với một tác vụ 12 chương.
- [ ] 7.6 `ChapterRow`: thay hàng nút thường trực (Chỉ dẫn, Bỏ qua chương, Lần chạy, Mở đích, Bỏ qua đoạn bị từ chối) bằng một điểm bấm mở menu hành động của dòng; bỏ nút "Bỏ qua đoạn bị từ chối" và dòng nhãn lỗi lặp khi khối lỗi của chương đã có; giữ cột thời gian và token. Kiểm bàn phím và cửa sổ hẹp.
- [ ] 7.7 `RunLog`: đổi bộ lọc không được tính là "lần chạy mới" và không tự cuộn (đặt lại `seen` khi đổi `filter`); thêm test.
- [ ] 7.8 Ghi trong tài liệu module rằng lần thử lại bên trong tầng provider chưa hiện ở màn (item vẫn `running`), và lỗi chỉ hiện khi chương thất bại.
- [ ] 7.9 Chạy `node scripts/check.mjs` trên working tree sau khi các thay đổi chưa commit của change khác ổn định; đối chiếu từng mục 2–5 với code đã có rồi mới đánh dấu xong.

## 8. Bố cục hai khung, độ rộng và chi tiết chia mục (chốt 2026-10-23)

- [ ] 8.1 `PageFrame`: thêm `width: 'default' | 'wide' | 'full'` (1080/1240/1600px), giữ `wide` chạy được, thêm `fill` cho trang tự quản cuộn bên trong; cập nhật test primitive, mục Layout của `DESIGN.md` và `docs/modules/design-system` trong cùng commit.
- [ ] 8.2 `WorkDetailScreen` nâng 960 → 1240px; kiểm các khu Chương, Ngữ cảnh, Bản raw, Hoạt động ở 1366 và 1920px, theme sáng/tối.
- [ ] 8.3 Hàm thuần `pickSelection` (tự chọn: đầu "Cần xử lý" → đầu "Đang chạy" → mới nhất "Gần đây"; giữ mục hiện tại nếu còn) kèm test, gồm ca mục đang chọn biến mất.
- [ ] 8.4 `ActivitySplit`: `@container` gốc, từ 960px chia `[minmax(320px,380px)_1fr]`, mỗi khung `overflow-auto`; dưới 960px chỉ danh sách rồi chi tiết thay thế với nút quay lại "Hoạt động" và nhớ mục đã chọn; `aria-current` cho mục chọn, quản lý focus khi quay lại.
- [ ] 8.5 Khung danh sách: dòng gọn cho mọi tác vụ (tên, tiến độ chữ, trạng thái chữ, thời gian), thay `TaskCard`/`TaskSummaryRow` trong danh sách; chuyển thanh tiến độ, chương đang dịch, lượng dùng và điều khiển lên đầu dính của khung chi tiết (`TaskHeader`).
- [ ] 8.6 `TaskDetail` chia bốn mục Chương / Cảnh báo (kèm số) / Cách dịch / Lần chạy; tác vụ lỗi hoặc chờ người dùng mở sẵn bộ lọc "Lỗi"; hành động nhảy tới chương lỗi đầu tiên.
- [ ] 8.7 Mục Chương: bộ lọc "Tất cả / Lỗi / Đang chạy / Chưa dịch"; hàm thuần `collapseCompleted` gom chương xong liên tiếp thành một dòng mở rộng được, kèm test; danh sách chương cuộn trong khung cao cố định.
- [ ] 8.8 Mục Cảnh báo: gộp các chương chưa có bản dịch thành một dòng "{n} chương chưa dịch nên chưa kiểm"; test ca 18 chương chưa dịch và 2 chương có cảnh báo.
- [ ] 8.9 Mục Cách dịch: viết lại form điều chỉnh (câu giải thích, chỉ dẫn hiện tại hoặc "Chưa có chỉ dẫn", gập sau nút "Đổi chỉ dẫn dịch…", ô chọn chỉ liệt kê chương chưa ghim lần chạy và mặc định chương kế tiếp, ô chỉ dẫn điền sẵn, nút "Áp dụng từ chương N", dòng nói còn thiếu gì, xác nhận sau khi áp dụng, đường nhờ Trợ lý); tác vụ xong hoặc hủy chỉ đọc. Không đổi hợp đồng `steer`.
- [ ] 8.10 Mục Lần chạy: `RunLog` chọn chương bằng bộ chọn, bỏ `RunLog` lồng trong từng `ChapterRow`; giữ lọc, Sao chép và tự cuộn theo mục 7.7.
- [ ] 8.11 Kiểm giao diện ở cửa sổ 1280, 1366, 1536, 1920 và 2560px (CSS), theme sáng/tối, bàn phím qua cả hai khung, giảm chuyển động, tên chương CJK dài; không thanh cuộn ngang.

## 9. Bảng kiểu pipeline (chốt 2026-10-23, thay khung đôi ở mục 8)

- [x] 9.1 Hàm thuần `activityRows`, `rowsOfTab`, `countsOfTabs`, `matchesText`, `whenLabel` kèm test.
- [x] 9.2 `ActivityTable` (bảng đủ cột, cột ẩn theo container query), `ChapterStrip` (dải chương từ `counts`), `TaskRowActions` (thao tác chính dạng icon và menu), thay `ActivitySplit`/`TaskListRow`.
- [x] 9.3 `TaskList`: tab có số lượng, ô lọc, "Xem thêm" mỗi 25 dòng, trang chi tiết với đường dẫn quay lại và đưa tiêu điểm về tên tác vụ vừa mở; `PageFrame` bỏ `fill`.
- [ ] 9.4 Mở app kiểm bảng ở cửa sổ 1280, 1366, 1536, 1920 và 2560px, theme sáng/tối, bàn phím qua hàng và menu; gửi ảnh nếu vỡ.
