## 1. Dữ liệu câu hỏi

- [x] 1.1 Thêm mã cờ `merge_suggested`, `gender_uncertain` và kiểu `detail` của câu hỏi vào
      `src/shared/contracts/glossary.ts`, kèm nhãn tiếng Việt; test parse `detail` hỏng thì coi như không có câu hỏi
- [x] 1.2 Bổ sung `revision_suggested` do `reviseEntry` tạo thành câu hỏi đủ trường (design §2), kèm fingerprint
      không hỏi lại; test đề xuất cùng fingerprint đã trả lời thì không tạo cờ mới
- [x] 1.3 `answerContextQuestion` cho ba loại (design §3); test gộp 翠風 → シルフィア (alias, bằng chứng, xóa mục),
      "Hai mục khác nhau" không hỏi lại, giới tính, nhãn ngoài lựa chọn bị từ chối, câu đã đóng bị từ chối
- [x] 1.4 Hàm liệt kê câu hỏi mở xếp theo mức ảnh hưởng (design §4); test hai câu cùng mức thì xếp theo chương

## 2. Sinh câu hỏi khi trích

- [x] 2.1 Phát hiện đồng vị `X の Y` / `X・Y` bằng code và trường `same_as` trong lô phân loại; gắn câu hỏi "Có thể là
      một"; test ca 翠風のシルフィア bằng caller giả, task không chuyển `waiting_user`
- [x] 2.2 Bằng chứng giới tính mâu thuẫn thì lưu `unknown` và gắn câu hỏi "Giới tính chưa chắc"; test ca 少年
      (chương 2) và 彼女 (chương 9)

## 3. Quy ước tác phẩm

- [x] 3.1 Migration 20 `work_convention`; storage đọc/ghi kèm cờ đã chốt; test file schema 19 mở được và mọi quy
      ước là mặc định, chưa chốt
- [x] 3.2 `namingPolicy` theo kiểu phiên âm, chỉ dẫn kính ngữ theo quy ước trong prompt dịch; test snapshot prompt
      cho từng giá trị, và item đã ghim không đổi
- [x] 3.3 Bảng kana → romaji ba kiểu và phiên lại tên khi đổi quy ước (design §7); test bảng (ゃ, っ, ん, おう, ー),
      ca りょうた "Ryōta" → "Ryota", ca mục người dùng đã sửa bị bỏ qua
- [x] 3.4 `correction_retranslate = 'ask'` tạo câu hỏi dịch lại sau `correction` có chương bị ảnh hưởng; test chọn
      "Chỉ liệt kê" không tạo task
- [x] 3.5 Mục quy ước trong cài đặt tác phẩm (đặt ở màn Từ điển, mục "Quy ước của tác phẩm", vì hộp cài đặt
      tác phẩm đang có thay đổi khác chưa commit) (xem, sửa, hiện trạng thái đã chốt); test render và lưu

## 4. Màn Từ điển và Hoạt động

- [x] 4.1 Tách `QuestionForm` khỏi `QuestionCard` (design §5), chat giữ nguyên hành vi; test hiện có của thẻ chat
      vẫn qua
- [x] 4.2 Bộ lọc "Cần xem" và thẻ câu hỏi trên mục trong `GlossaryScreen`, gọi IPC trả lời; test chọn lựa chọn rồi
      Ctrl+Enter gửi đúng nhãn, và trạng thái trống
- [ ] 4.3 Chi tiết task hiện "N câu hỏi ngữ cảnh" (đếm câu hỏi có `runId` của task) và liên kết mở bộ lọc; test số
      đúng và không hiện khi bằng 0
      (Chưa làm: chi tiết task ở màn Hoạt động `TaskDetail.tsx` là phần việc khác chưa commit; khi nó vào main
      thì đếm câu hỏi có `runId` là id thao tác trích của task.)

## 5. Chat

- [x] 5.1 Dòng câu hỏi mở và quy ước chưa chốt trong ngữ cảnh lượt chat; test `turnContext` có dòng đó khi đích là
      tác phẩm
- [x] 5.2 Capability `read_context_questions` và `answer_context_questions` (kết quả từng câu, mức quyền); test
      bằng provider giả: hỏi 5 câu ảnh hưởng nhất rồi áp đáp án, và một câu đã đóng không chặn câu còn lại
- [x] 5.3 Luật system prompt hỏi quy ước một lần trước task đầu tiên, Autopilot không hỏi; test lượt "dịch chương
      1–30" với tác phẩm chưa chốt sinh `ask_questions` trước `create_translation_task`
      (Test kiểm luật có trong system prompt và luồng công cụ; chưa có test với model thật.)

## 6. Kiểm tra và tài liệu

- [x] 6.1 Cập nhật `docs/modules/context/glossary-extraction.md` (luồng câu hỏi không chặn, quy ước tác phẩm) và
      `docs/modules/proposals` nếu có ghi về `ask_questions`
- [x] 6.2 Chạy `node scripts/check.mjs` và xác nhận typecheck, test, lint đều chạy và qua
