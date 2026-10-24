## Why

Cơ chế duyệt tiền kiểm (`Approved` / `Pending` / `Rejected`) hiện áp dụng cho cả Thuật ngữ (Glossary) lẫn Xưng hô (Addressing/Characters) đang gây ra 3 vấn đề lớn cho trải nghiệm:
1. **Phá vỡ tính tự động hóa (Unattended Automation):** Khi chạy tác vụ dịch tự động, chỉ cần trích xuất ra một thuật ngữ hoặc cặp xưng hô mới (`pending.length > 0`), pipeline lập tức bị dừng lại ở trạng thái `waiting_user(context_review)`.
2. **Nghịch lý trải nghiệm:** Người dùng dịch truyện để đọc. Bắt họ phải duyệt trước danh sách nhân vật, xưng hô và địa danh đồng nghĩa với việc bắt họ phải biết trước nội dung truyện thì mới duyệt được.
3. **Giao diện rườm rà, thừa thãi:** Cả 2 màn hình Thuật ngữ và Xưng hô đều mang thanh lọc trạng thái `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`, các nút Duyệt/Từ chối trên từng dòng, badge trạng thái và hàng loạt modal phức tạp. Thực tế người dùng thường bấm "Duyệt tất cả" cho xong việc để tool chạy tiếp.

Chủ sản phẩm đã quyết định (2026-10-23): Bãi bỏ hoàn toàn cơ chế duyệt tiền kiểm cho cả thuật ngữ và xưng hô. Chuyển sang mô hình **Từ điển phẳng tự động áp dụng (Flat active dictionary)** và kiểm soát chất lượng qua **hậu kiểm (post-edit)**.

## What Changes

- **Loại bỏ hard-gate trong pipeline dịch:**
  - `extractTerms` trong `AgentTaskService` không còn chuyển task sang `waiting_user(context_review)`. Khi trích xuất xong, task dịch tự động tiếp tục chạy thẳng sang các item dịch chương.
  - Các thuật ngữ, nhân vật và cặp xưng hô do AI trích xuất sẽ được lưu trực tiếp ở trạng thái có hiệu lực (`approved` / active) để đi thẳng vào bản chụp ngữ cảnh (`ContextSnapshot`) của các chương dịch tiếp theo.
- **Dọn dẹp giao diện Thuật ngữ (`GlossaryScreen`) và Xưng hô (`AddressingScreen`):**
  - Bỏ thanh lọc trạng thái `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`.
  - Bỏ các nút thao tác "Duyệt" (Approve), "Từ chối" (Reject) và "Duyệt theo loại" (Approve by type).
  - Bỏ badge trạng thái `Chờ duyệt` / `Đã duyệt` / `Từ chối`.
  - Đơn giản hóa bảng: Mỗi dòng chỉ còn thông tin ngữ cảnh và các thao tác thực sự cần thiết (Sửa, Xóa, Cấm dùng).
  - Bỏ dropdown chọn trạng thái trong các dialog thêm/sửa thuật ngữ, nhân vật, xưng hô.
- **Đơn giản hóa mô hình dữ liệu runtime:**
  - Mọi mục ngữ cảnh trong kho mặc định có hiệu lực.
  - Resolver `takeContextSnapshot` nạp toàn bộ các mục ngữ cảnh đang hoạt động (không bị cấm dùng) mà không cần lọc trạng thái `status === 'approved'`.

## Capabilities

### Modified Capabilities
- `agent-context-workflow`: Bãi bỏ trạng thái `pending` và `rejected` trong luồng ngữ cảnh; bỏ yêu cầu dừng task chờ duyệt `waiting_user(context_review)`; bỏ các lệnh duyệt thủ công/duyệt hàng loạt; chuyển toàn bộ thuật ngữ và xưng hô sang mô hình từ điển phẳng tự động áp dụng.

## Impact

- **Frontend:**
  - `src/renderer/src/modules/context/glossary/GlossaryScreen.tsx`: Bỏ `STATUS_FILTER_OPTIONS`, `pendingByType`, nút duyệt/từ chối, badge trạng thái.
  - `src/renderer/src/modules/context/glossary/GlossaryDialogs.tsx`: Bỏ trường chọn status trong form tạo/sửa glossary.
  - `src/renderer/src/modules/context/addressing/AddressingScreen.tsx`: Bỏ thanh lọc status, các nút duyệt cặp/nhân vật, badge trạng thái.
  - `src/renderer/src/modules/context/addressing/AddressingDialogs.tsx`: Bỏ trường chọn status trong form tạo/sửa nhân vật và cặp xưng hô.
- **Backend:**
  - `src/main/services/agent/taskService.ts`: Bỏ ngắt task trong `extractTerms`.
  - `src/main/services/context/contextExtractionService.ts`: Lưu mục trích xuất trực tiếp ở trạng thái có hiệu lực.
  - `src/main/services/ai/translate/translatePrompt.ts` & `contextSnapshot.ts`: Đơn giản hóa việc nạp ngữ cảnh vào snapshot.
  - `src/main/services/createServices.ts`: Dọn dẹp các API duyệt ngữ cảnh không còn dùng.
- **Tests:** Cập nhật các test suite của context, task runner và resolver.
