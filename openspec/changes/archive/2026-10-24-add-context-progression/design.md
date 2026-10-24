## Context

Xem `proposal.md` và spec `context-progression`.

Hiện trạng liên quan:
- `context_entry` có `from_chapter_id`/`to_chapter_id`. `listContextEntries({ chapterId })` đã lọc theo cả hai mốc,
  nên bản chụp của chương đã đúng phạm vi.
- `context_alias` có `UNIQUE (form)` trên toàn tác phẩm. `ownerOf` tìm theo nguồn hoặc alias, không xét phạm vi.
- `changeDyadFrom` đóng cặp cũ ở chương N−1 và mở cặp mới từ N. Steering dùng nó, idempotent nhờ id suy từ lệnh.
- Mỗi item ghim bản chụp Context lúc bắt đầu chạy. Đổi Context trước khi chương N chạy thì chương N tự nhận.
- Bước trích chạy một lần ở đầu task trên mọi chương của task. Vì vậy diễn tiến trong phạm vi task được thấy trước
  khi dịch; chỉ sửa sai mới đụng các chương đã dịch ở task trước.
- Văn bản được ghi qua `library.saveText(workId, chapterId, side, text, rev, segments)`. IPC `textHandlers` là đường
  người dùng sửa; task dịch ghi qua đường riêng.

## Goals / Non-Goals

**Goals:**
- Một cơ chế "đổi từ chương N" chung cho thuật ngữ, giống xưng hô.
- Mọi thay đổi do AI hay tín hiệu đề xuất đều qua một hàm áp có chốt chặn và ghi lịch sử.
- Không thêm lời gọi model nào. Thay đổi đi kèm lô phân loại và phân tích xưng hô sẵn có.

**Non-Goals:**
- Tự sửa bản dịch đã có. Chỉ liệt kê chương, kèm hành động dịch lại có xác nhận.
- Diễn tiến cho đại từ ngôi ba (`thirdPerson`), vì trường này chưa có phạm vi chương.
- Phạm vi theo cảnh, hồi tưởng hay góc nhìn. Model xử lý lúc dịch dựa vào ghi chú; glossary không đổi.
- Hỏi người dùng khi thay đổi không qua chốt chặn. Change `add-context-questions` biến cờ `revision_suggested`
  thành câu hỏi.

## Decisions

### 1. Dạng viết duy nhất theo phạm vi, không duy nhất toàn tác phẩm
Migration 19 dựng lại `context_alias` với `UNIQUE (entry_id, form)`. SQLite không bỏ được ràng buộc bằng
`ALTER TABLE`, nên tạo bảng mới, chép dữ liệu, rồi đổi tên. Code kiểm chồng phạm vi khi ghi alias hoặc nguồn.
`ownerOf(db, form, range?)` trả mục có phạm vi chồng với `range`; mặc định là toàn tác phẩm, tức giữ hành vi cũ. Hàm
khớp glossary cho một chương (bước dựng bản chụp) đã lọc theo chương trước khi khớp nên không đổi.
- *Phương án khác:* một mục có nhiều "biến thể theo phạm vi" trong bảng con. Bỏ: phải sửa mọi chỗ đọc mục.
  Hai mục nối nhau dùng được nguyên resolver, màn Từ điển và luồng xóa sẵn có.

### 2. `changeTermFrom` theo mẫu `changeDyadFrom`
Tham số: `newEntryId` (suy từ lệnh hoặc lần chạy, để idempotent), mục, chương N, các trường mới. Các bước:
1. Đóng mục cũ ở chương liền trước N.
2. Chèn mục mới, chép nguồn, alias, loại và `forbidden`; `supersedes_id` trỏ về mục cũ.
3. Ghi lịch sử.

Từ chối khi mục cũ bắt đầu ở N hoặc sau N. Steering thêm `change.kind = 'term'` vào `agentTaskSteerInputSchema` và
gọi hàm này, giống nhánh `addressing`.

### 3. Một hàm áp thay đổi: `reviseEntry`
Mọi nguồn thay đổi (AI, tín hiệu sửa tay, code tự làm) gọi `reviseEntry(db, { entryId, by, kind, fromChapterId?,
fields, evidence, runId })`. Hàm chạy các bước sau trong một transaction:
1. Kiểm chốt chặn:
   - `user_edited_at` khác null và `by !== 'user'` → không áp;
   - `progression` cần bằng chứng ở ≥ 2 chương ≥ N;
   - giá trị mới bằng một `old_value` mà AI đã thay đi cho cùng trường → không áp.
2. Không qua chốt thì gắn cờ `revision_suggested`. Chi tiết đề xuất nằm trong `detail` của cờ, dạng JSON, để
   change `add-context-questions` đọc được.
3. Qua chốt thì:
   - `correction`: cập nhật tại chỗ;
   - `progression`: gọi `changeTermFrom`, hoặc `changeDyadFrom` với cặp xưng hô.
4. Ghi một dòng `context_entry_change` cho mỗi trường đổi.

Người dùng sửa mục ở màn Từ điển cũng đi qua bước 4 và đặt `user_edited_at`. Hàm `update` hiện có gọi phần ghi
lịch sử, không gọi chốt chặn.

### 4. Bảng `context_entry_change`
```
id, entry_id → context_entry ON DELETE CASCADE, by ('ai'|'user'|'user_edit_signal'|'code'),
kind ('correction'|'progression'|'create'), field, old_value, new_value,
from_chapter_id NULL, quote NULL, quote_chapter_id NULL, run_id NULL, created_at
```
Bảng không chứa giá trị gì quyết định hành vi ngoài phép kiểm "lật lại", và phép kiểm đó chỉ đọc các dòng `by = 'ai'`.

### 5. Thay đổi từ bước trích
`buildClassifyMessages` có thêm phần `<known_in_chunk>`: tối đa 20 mục có dạng xuất hiện trong khúc, xếp theo số lần
xuất hiện. Mỗi mục kèm giá trị hiện tại và một câu ngữ cảnh mới. Câu được chọn từ chương chưa có trong bằng chứng
của mục; nếu không có thì lấy câu dài nhất. Đầu ra có thêm `revisions[]`. `ContextExtractionService` kiểm câu chứng
như `verifyTerms`, rồi gọi `reviseEntry`.

Phần này dùng chung chỗ với phần `<known>` của change `improve-glossary-extraction`. Ở đó là mục liên quan tới
ứng viên (để giữ khuôn); ở đây là mục xuất hiện trong khúc (để sửa). Một mục thuộc cả hai thì chỉ in một lần.
- *Đánh đổi:* thêm khoảng 20 × 150 ký tự mỗi lô. Chấp nhận, vì tránh được một lời gọi "rà soát" riêng.

### 6. Gợi ý xưng hô đổi
Hàm thuần đếm theo chương các lần khớp `(tên|alias)(さん|様|さま|くん|君|ちゃん|先輩|殿|先生)?` trong dòng thoại (bên
trong 「」 hoặc 『』). Với mỗi nhân vật, dạng chiếm đa số của chương N khác chương N−1, mỗi chương ≥ 2 lần gọi, thì
sinh gợi ý `{character, from: N, before, after}`. `buildAnalysisMessages` thêm phần `<possible_changes>`, và đầu ra
cho phép `fromChapter` trên cặp. Không xác định người nói, nên gợi ý chỉ là gợi ý; model gán cặp người nói → người
nghe.
- *Phương án khác:* xác định người nói bằng code. Bỏ: tiếng Nhật hay lược chủ ngữ, nên độ chính xác thấp.

### 7. Chương bị ảnh hưởng: tính khi đọc, không lưu
Khi màn Từ điển mở mục có lịch sử `correction` mới hơn lần dịch của chương, service quét các chương có bản dịch
(`side = 'target'` khác rỗng) mà nguồn chứa dạng của mục. Không lưu danh sách, vì nó đổi theo dữ liệu. "Dịch lại các
chương này" gọi luồng tạo task hiện có với các chương đó và `contextStrategy = approved_only`, sau một hộp xác nhận.

### 8. Tín hiệu sửa tay
Ở IPC lưu văn bản do người dùng sửa (`side = 'target'`), so segment cũ và mới theo id segment. Với mỗi segment đổi:
1. Lấy các mục có dạng xuất hiện trong nguồn của segment.
2. Bản cũ chứa target X của mục mà bản mới không chứa, thì lấy Y là chuỗi được thêm vào đúng chỗ X: phần khác nhau
   sau khi cắt tiền tố và hậu tố chung.
3. Ghi `{entryId, X, Y, chapterId}` vào bảng nhỏ `context_edit_signal`.
4. Đủ 2 chương cho cùng `(entryId, Y)` thì gọi `reviseEntry(by: 'user_edit_signal', kind: 'correction')`.

Chốt `user_edited_at` không chặn nguồn này, vì nó đến từ người dùng. Y rỗng (người dùng xóa tên) thì không tính.
- *Đánh đổi:* đổi cả câu thì Y có thể dài và vô nghĩa. Giới hạn Y ≤ 40 ký tự và không chứa dấu câu kết thúc câu.

### 9. Alias tách từ tên đầy đủ, và quét lại khi nguồn đổi
- **Alias:** chạy cuối mỗi lần trích, trên mục loại người, với văn bản các chương đã quét. Dùng lại hàm đếm "dài trước,
  có che" của change `improve-glossary-extraction`.
- **Quét lại:** `saveText` với `side = 'source'` xóa dòng `context_extraction_scan` của chương khi hash nội dung đổi,
  trong cùng transaction.

## Risks / Trade-offs

- [Bỏ `UNIQUE (form)` làm lộ lỗi trùng dạng mà trước đây ràng buộc DB chặn] → Mọi đường ghi alias đi qua một hàm
  kiểm chồng phạm vi. Thêm test "hai mục chồng phạm vi cùng alias bị từ chối" cho từng đường: tạo tay, sửa tay, trích,
  chat.
- [Model đề xuất `correction` sai và áp ngay vì không còn duyệt] → Bắt buộc câu chứng, không đụng mục người dùng đã
  sửa, có lịch sử để thấy và hoàn tác tay. Thay đổi không xóa dữ liệu nào.
- [Gợi ý xưng hô nhiễu ở truyện ít thoại] → Ngưỡng ≥ 2 lần gọi mỗi chương, và cần câu chứng ở ≥ 2 chương mới áp.
- [Tín hiệu sửa tay nhận nhầm chỗ người dùng viết lại cả câu] → Giới hạn độ dài Y và cần lặp lại ở 2 chương.
- [Migration 19 dựng lại bảng alias] → Chạy với `foreignKeysOff` như các migration dựng lại bảng trước đó; có test
  migration từ fixture schema 18 có alias.

## Migration Plan

Migration 19 của file tác phẩm:
1. Dựng lại `context_alias` với `UNIQUE (entry_id, form)`.
2. Thêm `context_entry.supersedes_id`, `context_entry.user_edited_at`.
3. Tạo `context_entry_change` và `context_edit_signal`.

Dữ liệu cũ không đổi nghĩa: mọi dạng vẫn duy nhất vì chưa có mục nối nào. Rollback bằng bản sao lưu tự động của file
tác phẩm.

## Open Questions

- Lịch sử có cần nút "hoàn tác thay đổi này" hay chỉ hiển thị? Spec chỉ đòi hiển thị. Thêm nút sau không đổi dữ liệu.
