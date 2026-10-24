## 1. Dữ liệu bảng hai tầng

- [x] 1.1 Đọc bốn tài liệu `docs/modules/context/addressing-research-{ja,ko,zh,west}.md`, chốt với chủ sản phẩm các câu
  hỏi mở về nội dung dòng (hôn phu, cấp dưới → sếp, vua Joseon, Lord/Sir, game chung hay riêng, yakuza làm gói tùy
  chọn hay bỏ) và danh sách dòng đưa vào dữ liệu (bỏ dòng nhãn [Suy] thấp nếu chưa đo); ghi quyết định vào
  `vietnamese-addressing.md`
- [x] 1.2 Viết test cho D1: `compose` ghép dòng chung và dòng riêng, dòng riêng thắng khi cùng `relation`, bối cảnh chính
  thắng bối cảnh phụ, tổ hợp không có dòng riêng chỉ ra dòng chung, mỗi ô cặp không chứa " hoặc ", mỗi dòng có nhãn
  độ tin cậy, bảng ghép không vượt trần dòng; test hai lần ghép cho cùng văn bản
- [x] 1.3 Chuyển `REGISTER_PRESETS` sang `SETTINGS` và `CULTURES` theo D1 với nội dung đã chốt ở 1.1 (modern, fantasy,
  court, cultivation, game × ja, ko, zh, west), gồm các sửa đã xác minh: dòng họ hàng và "cậu" ngôi hai cho Nhật,
  gộp hai dòng hôn phu bỏ "ta" của fantasy, "em" của hầu gái chuyển sang điều kiện thẻ nhân vật (D8), "thầy/cô – em"
  và bỏ "thần/khanh" cho phương Tây, `Sir` đi với tên riêng và `Lord` theo tước hiệu, vua Joseon tự xưng `과인` chứ
  không `짐`; cho test 1.2 qua
- [x] 1.4 Thêm bảng bí danh mã cũ theo D2 kèm test: sáu mã cũ ánh xạ đúng, mã lạ trả `null`
- [x] 1.5 Đổi `presetSection` nhận bảng ghép, nhãn ghi bối cảnh và văn hóa, giữ câu "chỉ dùng cho cặp chưa có trong
  `<addressing>`"; thêm dòng hướng dẫn cách suy vào quy tắc xưng hô chung khi quy tắc hiện có chưa đủ (D5); cập nhật
  `translatePrompt.test.ts`; tăng phiên bản prompt dịch

## 2. Lưu theo tác phẩm

- [x] 2.1 Viết test migration tác phẩm v17→v18 (D3): ba cột nullable, tác phẩm cũ đọc ra `NULL`, giá trị ngoài danh sách bị
  schema validate từ chối, bối cảnh phụ không hợp lệ khi chưa có bối cảnh chính; sinh `work-v18.schema.sql`
- [x] 2.2 Thêm migration và cột vào `workSchema.ts`, đọc ghi ở `workFile.ts` và `workFiles.ts`, kiểu và schema
  validate ở `src/shared/contracts/library.ts`; cập nhật `schemaSnapshot.test.ts`, `librarySchema.test.ts`,
  `libraryBackup.test.ts` theo phiên bản mới
- [x] 2.3 Kiểm sao lưu, xuất và nhập tác phẩm mang theo các giá trị mới; viết test khứ hồi

## 3. Chọn bảng

- [x] 3.1 Viết test cho `resolveRegister` (D5): mã trong thể loại thắng lựa chọn đã lưu, lựa chọn đã lưu thắng suy, `'none'`
  tắt bảng, chip bối cảnh mâu thuẫn không cho bối cảnh, chip Xuyên Không không cho bối cảnh, tiếng Anh không tín
  hiệu chỉ còn dòng cách suy, văn hóa mặc định theo ngôn ngữ nguồn trừ tiếng Anh, bối cảnh không văn hóa chỉ dùng
  dòng chung
- [x] 3.2 Cài `resolveRegister` và bảng nhãn chip→bối cảnh dùng chung; sửa `genreFamily` để "xuyên không" không còn cho ra
  cổ đại; thay mọi nơi gọi `suggestRegister` (`contextSnapshot.ts`, `chapterTranslation.ts`,
  `contextExtractionService.ts`, đường chat; grep lại toàn bộ trước), rồi xóa `suggestRegister` khi không còn nơi gọi
- [x] 3.3 Viết test chọn profile kính ngữ theo văn hóa (D7) và cài lớp chọn: truyện Nhật có văn bản tiếng Anh dùng quy ước
  văn hóa Nhật, văn bản tiếng Anh không văn hóa vẫn dùng `english()`, dòng "tên Latinh" nhường cho văn hóa Trung
- [x] 3.4 Viết test và cài chính sách hậu tố cho `korean()` (D7): mặc định Việt hóa `-ssi` và dịch `오빠`/`형` theo vai,
  `선배` gọi trống ra "tiền bối", chế độ giữ hậu tố giữ nguyên `oppa`/`hyung`/`sunbae`; kiểm đường nhận chính sách
  của `japanese()` để dùng chung

## 4. Bản chụp ngữ cảnh

- [x] 4.1 Viết test cho D6: bản chụp mới ghi `{ setting, extra, culture }`, đổi giá trị đổi hash, bản chụp cũ có `register`
  chuỗi dựng lại được qua bí danh và hash đã lưu không bị ghi lại, `matches` đúng khi builder không đổi
- [x] 4.2 Đổi `ContextSnapshot`, `takeContextSnapshot`, `promptFromSnapshot` và bộ đọc bản chụp cũ cho test 4.1 qua; kiểm
  `contextChanged` bật khi đổi giá trị giữa hai lô và các lô sau vẫn dùng bản chụp đã khóa
- [x] 4.3 Cập nhật các test đang dùng `register` ở `paragraphTranslation`, `chapterTranslation`, `addressingAnalysis` và
  `contextSnapshot.workflow.test.ts`

## 5. Giao diện

- [x] 5.1 Đọc `DESIGN.md` trước khi dựng; viết test thành phần cho chip thể loại: chọn nhiều, giá trị tự do cũ vẫn hiện và
  được giữ khi không sửa, chip không phải bối cảnh không đổi bối cảnh suy ra, chip mâu thuẫn không tự chọn bối cảnh
- [x] 5.2 Dựng chip và các ô chọn bối cảnh chính, bối cảnh phụ, văn hóa (có "Tự suy" và "Không dùng bảng"; bối cảnh phụ
  khóa khi chưa có chính) trong `WorkForm.tsx`, `workFormValues.ts`, `EditWorkDialog.tsx`, `CreateWorkScreen.tsx`;
  hiện thể loại ở `WorkHeader.tsx`
- [x] 5.3 Hiện gợi ý "chưa chọn bối cảnh" khi tác phẩm không cho ra bảng, kèm thông báo khi đổi lựa chọn giữa lượt dịch

## 6. Kiểm chứng và tài liệu

- [ ] 6.1 Đo bằng một lần dịch thử trên truyện có lỗi xưng hô đã ghi trong `translation-run-2026-10-22.md` (gồm Rion và
  Milly cho dòng hầu gái): so bảng ghép với bảng cũ về xưng hô và về số token system prompt; ghi kết quả vào
  `docs/modules/context/`
- [x] 6.2 Cập nhật `vietnamese-addressing.md` (mục lưu bộ mặc định theo tác phẩm từ đề xuất sang đã hiện thực, thứ tự chọn,
  nguyên tắc không đoán; kiểm lại hai câu về Harry Potter không xác minh được), `prompt-system.md` và `README.md` của
  module context (liên kết bốn tài liệu khảo sát); viết bằng tiếng Việt, tách quyết định, đề xuất và hiện thực
- [ ] 6.3 Chạy `node scripts/check.mjs`, và `node scripts/check.mjs --build` trước khi đẩy
