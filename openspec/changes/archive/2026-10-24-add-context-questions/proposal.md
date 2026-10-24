## Why

Không còn bước duyệt (2026-10-23), task dịch không được dừng chờ người dùng. Nhưng có những chỗ AI không tự quyết
chắc được, vì người đọc mới biết hoặc vì đó là sở thích của người dịch:
- hai mục có phải một người không (biệt danh 翠風 có phải Sylphia không);
- giới tính khi bằng chứng mâu thuẫn;
- lộ thân phận thì sửa các chương trước hay giữ nguyên;
- một đề xuất sửa bị chốt chặn giữ lại (cờ `revision_suggested` của change `add-context-progression`);
- quy ước chung của tác phẩm: phiên âm có dấu hay không, giữ hậu tố -san hay Việt hóa.

Mira đã có `ask_questions` trong chat: 1–5 câu, 2–9 lựa chọn, có đáp án mặc định, Autopilot tự trả lời bằng mặc
định. Nhưng chỉ model trong lượt chat gọi được nó; bước trích chạy trong task nền, lúc lượt chat đã kết thúc. Hiện
không có đường nào để một chỗ chưa chắc trong lúc trích tới được người dùng.

## What Changes

- **Câu hỏi ngữ cảnh không chặn task.**
  - Gặp chỗ chưa chắc, bước trích áp ngay phương án mặc định an toàn và gắn cờ câu hỏi lên mục, kèm các lựa chọn,
    đáp án mặc định, chương bắt đầu ảnh hưởng và câu chứng. Task chạy tiếp.
  - Có ba loại câu hỏi:
    - **sửa đổi bị giữ lại** (từ `revision_suggested`): áp cho cả truyện, áp từ chương N, hoặc giữ nguyên;
    - **có thể là một**: gộp vào mục kia, hoặc là hai mục khác nhau;
    - **giới tính chưa chắc**: nam, nữ, hoặc không rõ.
- **Mỗi lựa chọn là một hành động code**, nên trả lời xong là áp, không gọi model. Áp đi qua `reviseEntry` /
  `changeTermFrom` / `changeDyadFrom` của change `add-context-progression`. Đã trả lời thì không hỏi lại câu đó.
- **Trả lời ngay trong màn Từ điển:**
  - thêm bộ lọc "Cần xem";
  - mỗi mục có câu hỏi hiện thẻ câu hỏi dùng chung giao diện với thẻ `ask_questions` của chat;
  - chi tiết task và màn Hoạt động hiện "N câu hỏi ngữ cảnh", dẫn tới bộ lọc đó.
- **Trả lời qua chat:**
  - ngữ cảnh mỗi lượt chat có số câu hỏi đang mở của tác phẩm;
  - capability đọc `read_context_questions` cho model xem chi tiết;
  - model hỏi bằng `ask_questions` (tối đa 5 câu, xếp theo mức ảnh hưởng);
  - capability ghi `answer_context_questions` áp đáp án.
- **Quy ước của tác phẩm.**
  - Gồm ba quy ước:
    - kiểu phiên âm tên Nhật: Hepburn có dấu, không dấu, hoặc kiểu `ou`;
    - kính ngữ: giữ hậu tố Nhật hoặc Việt hóa;
    - khi sửa sai đụng chương đã dịch: chỉ liệt kê, hoặc hỏi có dịch lại không.
  - Chưa chốt thì trước task dịch đầu tiên, chat hỏi một lần bằng `ask_questions`; Autopilot lấy mặc định.
  - Sửa được ở cài đặt tác phẩm.
  - Đổi kiểu phiên âm thì code phiên lại các mục tên người có cách đọc mà người dùng chưa sửa tay, kèm lịch sử.
- Quy ước đi vào prompt trích (chính sách đặt tên) và prompt dịch (kính ngữ), thay cho mặc định của profile ngôn ngữ.

## Capabilities

### New Capabilities
- `context-questions`: câu hỏi ngữ cảnh không chặn — loại câu hỏi, mặc định, cách trả lời trong màn Từ điển và qua
  chat, xếp ưu tiên, không hỏi lại.
- `work-conventions`: quy ước dịch của tác phẩm — lưu, hỏi một lần, áp vào prompt, phiên lại tên khi đổi kiểu phiên âm.

### Modified Capabilities
(không có; `ask_questions` dùng nguyên như spec `agent-questions`)

## Impact

- `src/main/infra/storage/workSchema.ts`: Migration 20 tạo bảng `work_convention` (khóa → giá trị); câu hỏi nằm
  trong `review_flags` sẵn có.
- `src/shared/contracts/glossary.ts`: mã cờ `merge_suggested`, `gender_uncertain`; dạng `detail` của cờ câu hỏi.
- `src/main/services/context/`: service câu hỏi — liệt kê, xếp ưu tiên, áp đáp án; phiên lại tên.
- `src/main/services/context/contextExtractionService.ts`: gắn cờ câu hỏi; đọc quy ước khi dựng prompt.
- `src/main/services/ai/glossaryExtraction.ts`, `translate/languageProfiles.ts`, `translatePrompt.ts`: dùng quy ước.
- `src/main/services/agent/capabilities/`: `read_context_questions`, `answer_context_questions`; dòng câu hỏi đang
  mở và quy ước chưa chốt trong ngữ cảnh lượt chat.
- Renderer: tách phần trình bày của `QuestionCard` khỏi pending action của chat; bộ lọc "Cần xem" trong
  `GlossaryScreen`; số câu hỏi trong chi tiết task; mục quy ước trong cài đặt tác phẩm.
- Phụ thuộc: `add-context-progression` (hàm áp và cờ `revision_suggested`), `improve-glossary-extraction` (trường
  `reading`).
