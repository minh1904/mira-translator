## Context

Xem `proposal.md - Why` để nắm rõ động lực.

Trước đây, cả hai hệ thống Thuật ngữ (`Glossary`) và Xưng hô (`Addressing`/`Characters`) đều áp dụng mô hình trạng thái: `approved`, `pending`, `rejected`. AI trích xuất ngữ cảnh luôn lưu ở trạng thái `pending`, sau đó:
1. Pipeline dịch tự động bị dừng lại ở `taskService.ts` (`waiting_user(context_review)`).
2. Giao diện `GlossaryScreen` và `AddressingScreen` phải duy trì các thanh lọc `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`, các nút bấm Duyệt / Từ chối trên từng dòng, badge trạng thái và hàng loạt modal/dialog phức tạp.
3. Người dùng khi dịch truyện thực tế đều bấm "Duyệt tất cả" chỉ để tiếp tục công việc.

Quyết định ngày 2026-10-23 của chủ sản phẩm yêu cầu bãi bỏ hoàn toàn mô hình duyệt tiền kiểm này cho cả Thuật ngữ và Xưng hô, chuyển sang mô hình từ điển phẳng tự động áp dụng và hậu kiểm.

## Goals / Non-Goals

**Goals:**
- Dọn sạch toàn bộ UI duyệt ngữ cảnh: Bỏ thanh lọc trạng thái `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`, bỏ các nút Duyệt/Từ chối trên từng dòng, bỏ badge trạng thái ở cả màn Thuật ngữ (`GlossaryScreen`) và Xưng hô (`AddressingScreen`).
- Đơn giản hóa dialog thêm/sửa: Bỏ dropdown chọn trạng thái `pending`/`approved`.
- Pipeline dịch chạy thông suốt: `extractTerms` trong `taskService.ts` không ngắt task; các mục trích xuất tự động đi thẳng vào từ điển ở trạng thái có hiệu lực (`approved`).
- Tương thích ngược: Duy trì giá trị lưu trữ trong DB schema hiện có (dưới dạng `approved`) để không phải sửa đổi schema SQLite hay viết migration phức tạp.

**Non-Goals:**
- Bỏ tính năng trích xuất AI: AI vẫn tiếp tục trích xuất tên, thuật ngữ và xưng hô từ văn bản nguồn, chỉ là kết quả được áp dụng ngay lập tức thay vì bắt người dùng phê duyệt.
- Bỏ tính năng "Cấm dùng" (`forbidden`): Tính năng đánh dấu không sử dụng một từ/cặp xưng hô vẫn được giữ nguyên.

## Decisions

### 1. Dọn dẹp giao diện `GlossaryScreen` và `AddressingScreen`
- **Quyết định:**
  - Xóa `STATUS_FILTER_OPTIONS` và thanh segmented button lọc trạng thái trên header.
  - Xóa hàm `pendingByType` và nút "Duyệt tất cả theo loại".
  - Trên từng hàng của bảng danh sách: Xóa các nút Duyệt (Checkmark), Từ chối (Cross). Chỉ giữ các nút Sửa, Xóa, Cấm dùng.
  - Xóa badge hiển thị `Đã duyệt` / `Chờ duyệt` / `Từ chối`.
- **Lý do:** Bảng trở về đúng bản chất là một Từ điển phẳng (Flat Dictionary) rõ ràng, dễ nhìn, giống trải nghiệm của QuickTranslator hay AiNiee.

### 2. Dọn dẹp form trong `GlossaryDialogs` và `AddressingDialogs`
- **Quyết định:** Loại bỏ trường chọn `Trạng thái` trong form tạo mới hoặc chỉnh sửa mục. Mặc định mọi mục người dùng tạo tay hoặc AI tạo đều được lưu với `status: 'approved'`.
- **Lý do:** Người dùng đã chủ động thêm một từ hoặc cặp xưng hô vào từ điển thì mặc nhiên muốn nó có hiệu lực ngay lập tức.

### 3. Pipeline dịch tự động và trích xuất không chặn
- **Quyết định:**
  - Trong `contextExtractionService.ts`: Khi lưu các mục trích xuất (thuật ngữ, nhân vật, cặp xưng hô), lưu trực tiếp với `status: 'approved'`.
  - Trong `taskService.ts`: `extractTerms` không còn kiểm tra `result.pending.length > 0` để chuyển task sang `waiting_user(context_review)`. Thay vào đó, ghi nhận số lượng mục trích xuất vào tiến độ và trả về `true` để task chuyển ngay sang dịch item đầu tiên.
- **Lý do:** Đảm bảo luồng dịch hàng loạt chạy hoàn toàn tự động từ đầu đến cuối mà không cần can thiệp thủ công.

### 4. Xử lý tương thích dữ liệu hiện có
- **Quyết định:** Bảng `context_entry` (chứa cả thuật ngữ, nhân vật và cặp xưng hô) giữ nguyên CHECK constraint. Migration 17 của file tác phẩm chạy một lần `UPDATE context_entry SET status = 'approved' WHERE status = 'pending'`. Mục `rejected` giữ nguyên: đó là trí nhớ "đừng đề xuất lại" của các mục model gọi là `not-a-term` hoặc người dùng đã từ chối trước đây.
- **Lý do:** Không có migration thì mục `pending` cũ không bao giờ vào prompt nhưng vẫn hiện như mục bình thường trên bảng phẳng, mà không còn nút nào để duyệt chúng. Migration theo cơ chế sẵn có chạy đúng một lần, không đổi schema.

### 5. Không mở lại mục bị loại, ẩn mục bị loại khỏi bảng
- **Quyết định:** `saveExtraction` bỏ nhánh mở lại mục `rejected` khi có trích dẫn từ chương mới (trước đây nhánh này đưa mục về `pending`). Bảng Từ điển và Xưng hô chỉ liệt kê mục `approved`. Lối "Xem ngữ cảnh" (trước là "Xem và duyệt") chỉ mở khu Ngữ cảnh, không đặt bộ lọc.
- **Lý do:** Không còn bước duyệt nên mở lại sẽ tự động đảo quyết định của người dùng. Mục `rejected` không có hiệu lực; hiện nó trong bảng phẳng không kèm badge sẽ khiến người dùng tưởng nó đang được áp dụng.

### 6. Gỡ API duyệt
- **Quyết định:** Gỡ `glossary:review`, `glossary:bulkApprove`, `reviewContextEntry`, `bulkApproveContextEntries` và các kiểu `ContextReviewCommand`/`ContextReviewOutcome`. Giữ `glossary:reviewInfo` vì bảng vẫn hiện loại, cờ và câu trích. Giữ lý do `context_review` trong contract để task cũ đang chờ vẫn đọc được và bấm Tiếp tục.
- **Lý do:** Không còn màn hình nào gọi tới các API này.

## Risks / Trade-offs

- **[Risk] AI trích xuất nhầm từ không mong muốn:** Khi AI trích xuất nhầm một từ vào từ điển phẳng, từ đó sẽ tự động vào prompt dịch.  
  → *Mitigation:* Người dùng dễ dàng hậu kiểm: khi đọc bản dịch thấy cấn, chỉ cần mở màn Ngữ cảnh bấm Xóa hoặc Sửa lại từ đó. Trải nghiệm sửa sau nhanh hơn rất nhiều so với việc bắt duyệt hàng trăm từ trước khi dịch.
- **[Risk] Các bài test cũ kiểm tra trạng thái pending:**  
  → *Mitigation:* Cập nhật các test suite để assert `status: 'approved'` và xác nhận pipeline dịch tiếp tục chạy liền mạch.
