## 1. Lưu trữ

- [x] 1.1 Migration 19: dựng lại `context_alias` với `UNIQUE (entry_id, form)`, thêm `supersedes_id`,
      `user_edited_at`, tạo `context_entry_change` và `context_edit_signal`; test migration từ fixture schema 18 có
      alias giữ nguyên dữ liệu
- [x] 1.2 `ownerOf` và mọi đường ghi alias/nguồn kiểm chồng phạm vi chương; test cho từng đường (tạo tay, sửa tay,
      `saveExtraction`, chat): hai mục chồng phạm vi cùng alias bị từ chối, hai mục nối nhau thì được
- [x] 1.3 `changeTermFrom` theo design §2; test đổi từ chương 12, từ chối khi mục cũ bắt đầu sau N, gọi lại cùng id
      không tạo mục thứ hai
- [x] 1.4 `reviseEntry` với chốt chặn và lịch sử (design §3–4); test ba ca chốt chặn của spec (người dùng đã sửa,
      diễn tiến một chương, lật lại) đều chỉ gắn cờ `revision_suggested`, và ca qua chốt ghi đủ lịch sử
- [x] 1.5 Sửa mục ở màn Từ điển ghi lịch sử `by = 'user'` và đặt `user_edited_at`; `changeDyadFrom` ghi lịch sử;
      test xóa mục thì xóa lịch sử
- [x] 1.6 Thêm `revision_suggested` vào `REVIEW_FLAG_CODES`, kèm nhãn; `detail` mang đề xuất dạng JSON

## 2. Bước trích và phân tích xưng hô

- [x] 2.1 Phần `<known_in_chunk>` (≤ 20 mục, kèm câu ngữ cảnh mới) và `revisions[]` trong prompt và parser phân
      loại; cập nhật test snapshot prompt
- [x] 2.2 `ContextExtractionService` kiểm câu chứng của `revisions` và gọi `reviseEntry`; test bằng caller giả với ca
      ミリィ（Milly） sửa "Mili" thành "Milly", và ca câu chứng bịa bị bỏ
- [x] 2.3 Hàm thuần đếm hậu tố gọi tên theo chương và sinh gợi ý (design §6); test 桐谷さん (chương 1–9) → 彰 (chương
      10–12) sinh gợi ý từ chương 10, và cảnh cãi nhau một chương không sinh gợi ý
- [x] 2.4 Phân tích xưng hô nhận `<possible_changes>`, trả `fromChapter`; áp bằng `reviseEntry` → `changeDyadFrom`;
      test cặp mới từ chương 10 khi câu chứng ở chương 10 và 11

## 3. Code tự cập nhật

- [x] 3.1 Alias từ tên đầy đủ của mục người (design §9); test セレナ (12 lần) được gắn, ヴァルトハイム (1 lần) thì không
- [x] 3.2 `saveText` nguồn đổi nội dung thì xóa dấu "đã quét" của chương; test lần trích sau gửi lại chương đó
- [x] 3.3 Tín hiệu sửa tay ở IPC lưu bản dịch (design §8); test sửa một chương thì mục không đổi, sửa hai chương thì
      mục đổi kèm lịch sử `user_edit_signal`, xóa tên (Y rỗng) thì không tính

## 4. Steering thuật ngữ

- [x] 4.1 Thêm `change.kind = 'term'` vào `agentTaskSteerInputSchema` và nhánh trong `taskService.steer`; capability
      chat steering mô tả loại mới; test ca đổi 記憶遡行 từ chương 8 và ca gửi lại sau lỗi
      (Đã làm qua IPC steering. Capability steering của chat vẫn chỉ nhận chỉ dẫn, như với xưng hô; mở rộng nó
      cần đổi luồng duyệt trong `agentService`, nên để lại.)

## 5. Màn Từ điển

- [x] 5.1 Panel lịch sử của mục (mới nhất trước, có câu chứng và chương); test render với dữ liệu hai dòng
- [x] 5.2 Danh sách chương bị ảnh hưởng sau `correction` (design §7) và hành động "Dịch lại các chương này" có hộp
      xác nhận, tạo task đúng các chương đó; test không xác nhận thì không tạo task

## 6. Kiểm tra và tài liệu

- [x] 6.1 Cập nhật `docs/modules/context/glossary-extraction.md` mục 6 (đã triển khai gì, còn đề xuất gì) và
      `characters-and-addressing.md` cho xưng hô đổi từ chương N do bước trích
- [x] 6.2 Chạy `node scripts/check.mjs` và xác nhận typecheck, test, lint đều chạy và qua
