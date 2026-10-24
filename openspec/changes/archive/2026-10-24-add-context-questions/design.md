## Context

Xem `proposal.md` và hai spec `context-questions`, `work-conventions`.

Hiện trạng liên quan:
- `ask_questions` (spec `agent-questions`): 1–5 câu, 2–9 lựa chọn, có đáp án mặc định. Autopilot tự trả lời bằng
  mặc định. Thẻ `QuestionCard` nhận một pending action của lượt chat.
- Task dịch lưu `originTurnId` nhưng không báo lại chat khi xong. Bước trích chạy ở đầu task, trên mọi chương.
- Mỗi item ghim bản chụp Context lúc bắt đầu chạy. Đổi Context trước khi chương N chạy thì chương N tự nhận, nên
  "áp mặc định ngay, đáp án đến sau thì đè" không phải dịch lại gì.
- `context_entry.review_flags` (JSON) đã hiện thành badge trong màn Từ điển. Change `add-context-progression` thêm
  cờ `revision_suggested` có `detail` dạng JSON, cùng `reviseEntry`, `changeTermFrom` và lịch sử mục.
- Change `unify-activity-screen` làm màn Hoạt động với khối "Cần xử lý" và chi tiết task.

## Goals / Non-Goals

**Goals:**
- Một nơi lưu câu hỏi mở, không thêm bảng cho câu hỏi.
- Trả lời không gọi model, ở cả màn Từ điển lẫn chat.
- Tận dụng việc chương chỉ ghim ngữ cảnh lúc chạy, thay vì xây cơ chế chờ có hạn.

**Non-Goals:**
- Đẩy thông báo vào chat khi task xong. Lượt chat kế tiếp mới thấy số câu hỏi.
- Câu hỏi nhập chữ tự do cho câu hỏi ngữ cảnh. Muốn trao đổi thì người dùng nói trong chat; model dùng các công cụ
  sửa Context sẵn có.
- Thêm câu hỏi vào khối "Cần xử lý" của màn Hoạt động. Khối đó dành cho lỗi; câu hỏi chỉ là một dòng số liệu trong
  chi tiết task.

## Decisions

### 1. Câu hỏi là cờ trên mục
Một câu hỏi mở là một cờ có `code` thuộc `revision_suggested | merge_suggested | gender_uncertain` trong
`review_flags` của mục, với `detail` là JSON:
```
{ id, kind, title, options[], default, fromChapterId?, otherEntryId?, proposal?, evidence[{chapterId, quote}],
  runId, fingerprint }
```
- `id` là UUID, để chat và màn Từ điển tham chiếu.
- `fingerprint` là hash của (`kind`, id mục, `otherEntryId`, `proposal`) và dùng để không hỏi lại.

Đã trả lời thì cờ bị gỡ, và fingerprint được ghi vào lịch sử mục (`context_entry_change`, `field = 'question'`,
`new_value` = nhãn đã chọn). Trước khi tạo câu hỏi, Mira tra fingerprint trong lịch sử; có rồi thì không tạo.
- *Phương án khác:* bảng `context_question` riêng. Bỏ: cờ đã hiện trong UI, đã đi cùng mục khi xóa, và lịch sử đủ
  để nhớ đáp án. Nếu sau này cần câu hỏi không gắn với mục nào thì mới tách bảng.

### 2. Nguồn sinh từng loại câu hỏi
- **Sửa đổi bị giữ lại:** mọi cờ `revision_suggested` do `reviseEntry` gắn đều được bổ sung `options`, `default =
  "Giữ nguyên"`, và `title` tạo từ đề xuất. Lựa chọn "Áp từ chương N" chỉ có khi đề xuất mang chương bắt đầu.
- **Có thể là một:** sinh từ hai nguồn.
  - Code: mẫu đồng vị `X の Y` hoặc `X・Y`, khi X và Y đều là dạng của hai mục khác nhau, và một trong hai mục là
    mục mới của lần trích.
  - Model: lô phân loại cho phép trường `same_as`, trỏ tới một mục đã có mà model nghĩ là cùng thực thể nhưng không
    chắc. Khi model chắc thì đã dùng `alias_of` của change `improve-glossary-extraction`.

  Câu hỏi gắn lên mục mới; `otherEntryId` là mục đã có.
- **Giới tính chưa chắc:** khi các câu chứng giới tính hợp lệ (luật của change `improve-glossary-extraction`) chứa cả
  từ chỉ nữ lẫn từ chỉ nam cho cùng nhân vật. Mặc định đã áp là `unknown`.

### 3. Áp đáp án: một hàm `answerContextQuestion`
Nhận `(questionId, label)`. Hàm tìm mục theo `id` trong cờ, kiểm `label` thuộc `options`, rồi chạy trong một
transaction:
- **Sửa đổi:** gọi `reviseEntry(by: 'user')` hoặc `changeTermFrom`/`changeDyadFrom`. Hai hàm này thuộc change
  `add-context-progression`. Áp với tư cách người dùng nên bỏ qua chốt chặn của AI.
- **Gộp:**
  1. chuyển nguồn và alias của mục mới thành alias của mục kia, kiểm chồng phạm vi;
  2. chuyển bằng chứng sang mục kia;
  3. chuyển cặp xưng hô nếu cả hai là nhân vật;
  4. xóa mục mới.
- **Giới tính:** cập nhật nhân vật.

Cuối cùng: gỡ cờ, ghi lịch sử kèm fingerprint, đặt `user_edited_at`. Cả IPC của màn Từ điển lẫn capability ghi của
chat đều gọi hàm này.

### 4. Xếp ưu tiên
Mức ảnh hưởng là số lần các dạng của mục xuất hiện trong các chương của tác phẩm chưa có bản dịch, tính bằng hàm đếm
"dài trước, có che". Kết quả được cache trong lần đọc. Bằng nhau thì xếp theo chương bắt đầu tăng dần.

### 5. Thẻ câu hỏi dùng chung
Tách `QuestionCard` thành hai phần:
- `QuestionForm`: phần trình bày, nhận `AgentQuestion[]`, `onAnswer`, `onSkip`, và giữ phím 1–9, Ctrl+Enter;
- vỏ chat hiện có: nối form với pending action.

Màn Từ điển dùng `QuestionForm` với một câu cho mỗi mục, không có "Bỏ qua tất cả". Câu chứng hiện ở `description`.
Dạng câu hỏi ngữ cảnh chuyển được thẳng sang `AgentQuestion` (`type: 'single'`), nên chat dùng lại được.

### 6. Chat
- **Ngữ cảnh lượt chat:** khi đích là một tác phẩm, `turnContext` thêm một dòng "Tác phẩm có N câu hỏi ngữ cảnh đang
  mở; quy ước chưa chốt: …". Đọc từ file tác phẩm, không gọi model.
- **`read_context_questions`:** capability đọc, mức rủi ro thấp. Trả tối đa 20 câu đã xếp.
- **`answer_context_questions`:** capability ghi, rủi ro trung bình. Chạy theo mức quyền hiện có, và trả kết quả từng
  câu. Mô tả của nó yêu cầu model chỉ gọi với đáp án người dùng đã chọn trong `ask_questions` của cùng lượt. Ở
  Autopilot, `ask_questions` tự trả lời bằng mặc định, mà mặc định đã được áp sẵn, nên mô tả bảo model không gọi
  capability ghi trong trường hợp đó.
- **System prompt của chat:** thêm luật "quy ước chưa chốt thì hỏi bằng `ask_questions` trước khi tạo task dịch đầu
  tiên; Autopilot thì không hỏi".

### 7. Quy ước tác phẩm
- **Lưu trữ:** Migration 20 tạo `work_convention(key TEXT PRIMARY KEY, value TEXT NOT NULL, settled INTEGER NOT NULL,
  updated_at)`. Không có dòng nghĩa là dùng mặc định và chưa chốt.
- **Ba khóa:** `ja_romanization` (`hepburn_macron`|`hepburn_plain`|`wapuro`), `honorifics` (`keep`|`vietnamize`),
  `correction_retranslate` (`list`|`ask`).
- **`namingPolicy(sourceLang, conventions)`** đổi câu luật tên người Nhật theo kiểu phiên âm. `languageProfiles`
  nhận `honorifics` để chọn câu chỉ dẫn kính ngữ.
- **`correction_retranslate = 'ask'`:** sau một `correction` có chương bị ảnh hưởng, Mira tạo câu hỏi loại "Sửa đổi
  bị giữ lại" với hai lựa chọn "Dịch lại các chương này" · "Chỉ liệt kê". Mặc định là "Chỉ liệt kê". Chọn dịch lại
  thì chạy hành động dịch lại có xác nhận của change `add-context-progression`.
- **Phiên lại tên:** bảng kana → romaji tất định cho ba kiểu, kèm test bảng (ゃゅょ, っ, ん trước nguyên âm, nguyên âm
  dài おう/えい/ー). Điều kiện "bản dịch hiện tại khớp cách phiên cũ" so không phân biệt hoa thường, sau khi bỏ
  khoảng trắng.

## Risks / Trade-offs

- [Câu hỏi nằm trong cờ JSON nên không truy vấn trực tiếp được bằng SQL] → Số mục có cờ nhỏ (vài chục), đọc
  `readReviewInfo` rồi lọc trong code là đủ. Có test hiệu năng với 2.000 mục.
- [Model không gọi `answer_context_questions` sau khi hỏi] → Câu hỏi vẫn mở và mặc định vẫn đúng, nên không mất dữ
  liệu. Thêm test luồng chat với provider giả.
- [Gộp nhầm khi người dùng chọn vội] → Lịch sử ghi đủ để xem lại. Gộp chỉ chuyển dữ liệu, không xóa bằng chứng.
  Nút hoàn tác gộp để sau.
- [Bảng romaji sai với cách đọc lạ (ゔ, ヴ, tiểu kana ァ)] → Không phiên được thì bỏ qua mục, tính vào số mục bị bỏ qua.

## Migration Plan

Migration 20 chỉ tạo bảng mới. Cờ mới nằm trong cột JSON sẵn có. Rollback bằng bản sao lưu tự động của file tác
phẩm.
