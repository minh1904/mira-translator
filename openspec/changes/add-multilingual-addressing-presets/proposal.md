## Why

Bảng gợi ý xưng hô (`<addressing_defaults>`) hiện gắn theo ngôn ngữ nguồn (`ja-modern`, `zh-ancient`, `en-western`...)
và chỉ được chọn khi thể loại tự gõ có mã `[id]` hoặc từ khóa. Truyện chỉ có tên thì không có bảng, tiếng Hàn không
có bảng nào, và truyện Nhật đọc từ bản tiếng Anh bị gán `en-western` dù cần cặp của văn hóa Nhật. Gốc của vấn đề là
một giá trị (`sourceLang`) bị dùng để suy hai thứ khác nhau: bối cảnh truyện (hiện đại, fantasy, cung đình...) và
văn hóa gốc (Nhật, Hàn, Trung, phương Tây). Mỗi ngôn ngữ mới lại phải chép cả bảng.

## What Changes

- Tách bảng thành hai trục: **bối cảnh** (`modern`, `fantasy`, `court`, `cultivation`, `game`) và **văn hóa gốc**
  (`ja`, `ko`, `zh`, `west`). Bảng đưa vào prompt = dòng chung của các bối cảnh + dòng riêng của văn hóa. Một tác
  phẩm có một bối cảnh chính và có thể có bối cảnh phụ (ví dụ cung đấu có đạo sĩ); dòng của bối cảnh chính thắng khi
  trùng quan hệ. Mã cũ `[ja-modern]` vẫn đọc được và được hiểu là một tổ hợp. Thêm văn hóa hay bối cảnh mới là thêm
  dữ liệu, không sửa lõi chọn và ghép.
- Mỗi tác phẩm lưu `setting`, danh sách bối cảnh phụ và `culture` riêng (chưa chọn là `NULL`). `resolveRegister`
  quyết định theo thứ tự: mã `[id]` trong thể loại > lựa chọn của người dùng > suy từ thể loại (chip) và ngôn ngữ
  nguồn > không bảng. Không có tín hiệu thì chỉ gửi dòng hướng dẫn cách suy xưng hô, cho mọi ngôn ngữ; tiếng Anh
  không còn mặc định `en-western` và không có văn hóa mặc định. Người dùng có thể chọn "không dùng bảng".
- Thể loại nhập bằng chip có cấu trúc thay cho ô gõ tự do; chỉ nhóm chip bối cảnh tác động tới bảng, và chip Xuyên
  Không không bị coi là bối cảnh.
- Văn hóa gốc điều khiển cả quy ước kính ngữ trong profile ngôn ngữ, không chỉ bảng. Chính sách hậu tố áp cho cả
  văn hóa Hàn: Việt hóa `-ssi` và dịch `오빠`/`형`/`선배` theo vai theo mặc định, có công tắc giữ hậu tố theo tác phẩm.
- Thêm bảng cho văn hóa Hàn và phương Tây, tách cung đình khỏi tu chân, sửa các dòng sai đã xác minh (họ hàng và
  "cậu" của Nhật, hai dòng hôn phu mang "ta" vào fantasy, "em" mặc định của hầu gái chuyển sang điều kiện thẻ nhân
  vật, "con" và "thần/khanh" và `Sir + họ` của phương Tây, "trẫm" cho vua Joseon). Nội dung từng bảng lấy từ các tài
  liệu khảo sát `docs/modules/context/addressing-research-*.md`.
- **BREAKING** (nội bộ): `ContextSnapshot.register` đổi từ một mã bảng sang bối cảnh và văn hóa, nên hash bản chụp
  của mọi tác phẩm đổi một lần; các bản chụp đã lưu vẫn đọc và dựng lại được.

Ngoài phạm vi: AI đề xuất bối cảnh và văn hóa để người dịch duyệt (change sau), dò tín hiệu từ nội dung chương, cờ
nội dung người lớn và kết nối dự phòng, log rõ ràng cho mọi lời gọi model, ghi đè bảng theo chương hay theo nhân
vật, ngôi ba của phương Tây (chưa khảo sát).

## Capabilities

### New Capabilities
- `addressing-presets`: mô hình hai trục bối cảnh và văn hóa, ghép nhiều bối cảnh, thứ tự chọn bảng, điều kiện theo
  thẻ nhân vật, chính sách hậu tố theo văn hóa, và mở rộng thêm ngôn ngữ.
- `work-story-profile`: thể loại bằng chip, bối cảnh chính và phụ, văn hóa lưu theo tác phẩm, giao diện chọn và ghi đè.

### Modified Capabilities
- `translation-context-snapshot`: requirement chụp ngữ cảnh đổi trường "bộ mặc định suy ra từ tác phẩm" thành bối
  cảnh và văn hóa, kèm cách đọc bản chụp cũ.

## Impact

- `src/shared/contracts/addressingPresets.ts`, `src/main/services/ai/translate/languageProfiles.ts`,
  `translatePrompt.ts`, `contextSnapshot.ts`, `chapterTranslation.ts`,
  `src/main/services/context/contextExtractionService.ts`: dữ liệu bảng, `resolveRegister`, ghép khi dựng prompt,
  chính sách hậu tố cho `korean()`.
- `src/main/infra/storage/workSchema.ts`, `workFile.ts`, `workFiles.ts`, `src/shared/contracts/library.ts`: cột
  `setting`, `settings_extra`, `culture` (schema tác phẩm v18, fixture `work-v18.schema.sql`) và các test snapshot schema.
- `src/renderer/src/modules/library/work-form/*`, `catalog/CreateWorkScreen.tsx`, `WorkHeader.tsx`: chip thể loại
  và các ô chọn.
- Phiên bản prompt dịch tăng vì nội dung system prompt đổi; hash `systemHash` đổi một lần.
- Tài liệu: `docs/modules/context/vietnamese-addressing.md`, `prompt-system.md`, `README.md` của module context.
