## 1. Backend & Pipeline Logic

- [x] 1.1 Gỡ bỏ logic ngắt task sang `waiting_user(context_review)` trong `extractTerms` tại `src/main/services/agent/taskService.ts`, ghi nhận tiến độ và trả về `true` để task chạy thẳng sang dịch item.
- [x] 1.2 Cập nhật `src/main/services/context/contextExtractionService.ts` để lưu các thuật ngữ, nhân vật và cặp xưng hô mới trích xuất trực tiếp ở trạng thái `approved`.
- [x] 1.3 Cập nhật các chỉ dẫn `contextStrategy` trong `src/main/services/agent/capabilities/taskCapabilities.ts` và `src/shared/contracts/agentTask.ts` để đồng bộ hành vi tự động áp dụng.

## 2. Frontend UI Cleanup

- [x] 2.1 Dọn dẹp màn Thuật ngữ (`src/renderer/src/modules/context/glossary/GlossaryScreen.tsx` và `GlossaryDialogs.tsx`): Bỏ thanh lọc trạng thái `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`, bỏ badge trạng thái, bỏ nút Duyệt/Từ chối trên từng dòng, bỏ trường status trong dialog thêm/sửa.
- [x] 2.2 Dọn dẹp màn Xưng hô (`src/renderer/src/modules/context/addressing/AddressingScreen.tsx` và `AddressingDialogs.tsx`): Bỏ thanh lọc trạng thái, bỏ badge trạng thái, bỏ các nút Duyệt/Từ chối cặp và nhân vật, bỏ trường status trong dialog thêm/sửa.

## 3. Tests & Verification

- [x] 3.1 Cập nhật các ca kiểm thử backend (`taskService.context.test.ts`, `contextExtractionService.test.ts`) để phản ánh việc lưu `approved` trực tiếp và pipeline không bị ngắt.
- [x] 3.2 Cập nhật các bài test frontend liên quan đến bộ lọc trạng thái và chạy `node scripts/check.mjs` để xác nhận toàn bộ test, lint và typecheck đều pass.

## 4. Sửa sau review (2026-10-23)

- [x] 4.1 Migration 17 của file tác phẩm chuyển mục `pending` cũ thành `approved`, giữ `rejected`.
- [x] 4.2 `saveExtraction` không mở lại mục `rejected` về `pending`; kiểu ứng viên chỉ còn `approved | rejected`.
- [x] 4.3 Thuật ngữ trợ lý chat thêm (`propose_glossary_term`, `createTerm`) lưu `approved`.
- [x] 4.4 Bỏ `statusFilter` và `requestGlossaryFilter`/`requestAddressingFilter` khỏi hook; "Xem và duyệt" thành "Xem ngữ cảnh" và không còn mở bảng lọc theo `pending` mà người dùng không thoát ra được.
- [x] 4.5 Bảng phẳng chỉ liệt kê mục `approved`; bỏ badge "chờ duyệt" trên tab Xưng hô.

## 5. Phần còn lại

- [x] 5.1 Gỡ API duyệt: kênh `glossary:review`/`glossary:bulkApprove`, preload, `desktopApi`, `GlossaryService.review/bulkApprove`, storage `reviewContextEntry`/`bulkApproveContextEntries`, schema và kiểu lệnh duyệt, `pendingByType`.
- [x] 5.2 Sửa spec: mục cấm dùng vẫn vào prompt như chỉ dẫn cấm; thêm yêu cầu cho dữ liệu cũ và mục bị loại.
