## Why

Glossary hiện chỉ lớn thêm. Từ đầu truyện, bước trích không sửa được mục đã có. Mục thuật ngữ cũng không có cách
đổi từ một chương; cách này hiện chỉ có cho xưng hô, qua steering do người dùng ra lệnh. Truyện dài thì thay đổi
liên tục, theo hai loại khác hẳn nhau:

- **Sửa sai**, áp cho cả truyện. Lúc đầu thiếu thông tin nên dịch sai, về sau mới rõ: cách đọc tên lộ ở chương sau,
  nghĩa thật của một kỹ năng, giới tính, hai mục hóa ra là một người.
- **Diễn tiến**, áp từ chương N. Cách cũ đúng cho các chương trước: quan hệ thân hơn nên đổi xưng hô, tổ đội đổi tên,
  thăng chức, lộ thân phận.

Thêm một loại không được làm đổi glossary: thay đổi chỉ trong một cảnh (giận nhau, hồi tưởng, góc nhìn khác).

Từ 2026-10-23 không còn bước duyệt nên mọi thay đổi có hiệu lực ngay. Vì thế mỗi thay đổi cần ba thứ: bằng chứng,
lịch sử, và chốt chặn chống lật qua lật lại. Change này nối tiếp `improve-glossary-extraction`, đã nghiên cứu ở
`docs/modules/context/glossary-extraction.md` mục 6.

## What Changes

- **Đổi thuật ngữ từ chương N.** Đóng mục cũ ở chương N−1 và tạo mục mới từ chương N, nối với mục cũ. Làm giống
  `changeDyadFrom` của xưng hô. Hai mục có phạm vi không chồng nhau được dùng chung nguồn và alias.
- **Bước trích đề xuất thay đổi cho mục đã có.**
  - Lô phân loại kèm các mục đã có xuất hiện trong khúc, mỗi mục một câu ngữ cảnh mới.
  - Model trả `revisions`, mỗi thay đổi có loại `correction` hoặc `progression`, chương bắt đầu và câu chứng.
  - Code áp thay đổi kèm chốt chặn:
    - câu chứng phải có nguyên văn;
    - diễn tiến cần bằng chứng ở ≥ 2 chương;
    - không ghi đè mục người dùng đã sửa;
    - không đổi một trường quay lại giá trị cũ mà AI đã bỏ.
  - Thay đổi không qua chốt chặn thành cờ `revision_suggested` kèm nội dung đề xuất.
- **Phát hiện xưng hô đổi.**
  - Code đếm theo chương các hậu tố đi kèm tên mỗi nhân vật trong lời thoại; dạng chiếm đa số đổi thì đó là gợi ý.
  - Phân tích xưng hô nhận gợi ý đó và có thể trả cặp mới kèm chương bắt đầu.
  - Áp bằng `changeDyadFrom` khi có bằng chứng ở ≥ 2 chương.
- **Lịch sử thay đổi của mục.** Mỗi thay đổi ghi: ai đổi (AI, người dùng, hay tín hiệu sửa tay), trường, giá trị cũ
  và mới, loại, chương bắt đầu, câu chứng, lần chạy. Màn Từ điển hiện lịch sử này trên từng mục.
- **Chương bị ảnh hưởng.**
  - Sau một sửa sai, Mira liệt kê các chương đã dịch có chứa dạng nguồn của mục.
  - Mira không tự sửa bản dịch.
  - Có hành động "Dịch lại các chương này". Hành động này tạo task dịch và phải xác nhận vì ghi đè bản dịch.
- **Code tự cập nhật, không cần model:**
  - alias của mục tên người từ tên đầy đủ (tách theo ・, bỏ hậu tố gọi người), khi dạng có thật ≥ 2 lần;
  - chương có văn bản nguồn đổi thì mất dấu "đã quét", để lần trích sau quét lại;
  - người dùng sửa tay cùng một kiểu X → Y cho một mục ở ≥ 2 chương thì đổi bản dịch của mục thành Y, ghi lịch
    sử nguồn "sửa tay".
- **BREAKING (dữ liệu):** một dạng viết không còn duy nhất trên toàn tác phẩm. Dạng được trùng giữa các mục có
  phạm vi chương không chồng nhau. Migration file tác phẩm đổi ràng buộc của bảng alias.

## Capabilities

### New Capabilities
- `context-progression`: loại thay đổi (sửa sai, diễn tiến, chỉ trong cảnh), chốt chặn, lịch sử mục, chương bị
  ảnh hưởng, các cập nhật code tự làm.

### Modified Capabilities
- `agent-task-steering`: thêm yêu cầu đổi bản dịch của một thuật ngữ từ chương N, cùng luật không chồng phạm vi
  như đổi xưng hô. Đại từ ngôi ba vẫn bị từ chối.

## Impact

- `src/main/infra/storage/workSchema.ts`: migration 19.
  - Bảng `context_alias` bỏ `UNIQUE (form)`, thay bằng `UNIQUE (entry_id, form)`.
  - Thêm bảng `context_entry_change`.
  - Thêm cột `context_entry.supersedes_id` và `context_entry.user_edited_at`.
- `src/main/infra/storage/contextEntries.ts`: `ownerOf` tính phạm vi chương; thêm `changeTermFrom`,
  `reviseEntry`, `listEntryChanges`; kiểm chồng phạm vi khi ghi alias.
- `src/main/infra/storage/addressingEntries.ts`: ghi lịch sử khi `changeDyadFrom` chạy.
- `src/main/services/ai/glossaryExtraction.ts`, `addressingAnalysis.ts`: phần `<known>` kèm ngữ cảnh mới,
  `revisions`, gợi ý đổi hậu tố gọi tên.
- `src/main/services/context/contextExtractionService.ts`: áp thay đổi qua chốt chặn.
- `src/main/services/library` hoặc đường lưu văn bản: xóa dấu "đã quét" khi nguồn đổi; ghi tín hiệu sửa tay khi
  người dùng lưu bản dịch.
- `src/main/services/agent/taskService.ts`: steering thuật ngữ từ chương N.
- Màn Từ điển: lịch sử mục, danh sách chương bị ảnh hưởng, hành động dịch lại.
- Phụ thuộc: change `improve-glossary-extraction` (họ thuật ngữ, phần `<known>`, cờ mới).
