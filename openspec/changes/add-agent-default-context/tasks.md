## 1. Tác phẩm đang mở là ngữ cảnh mặc định (renderer)

- [ ] 1.1 Viết test cho `composeContext`: Agent ở màn chương với chip chương mờ gửi `workId` mà không có `chapterId`;
  tắt chip tác phẩm thì không gửi `workId`; Trang chủ không có chip tác phẩm; đính kèm chính tác phẩm đó chỉ ra một
  chip
- [ ] 1.2 Sửa `composeContext` để luôn đặt `context.workId` khi có tác phẩm đang mở và chip tác phẩm còn bật, và thêm
  chip tác phẩm ở đầu hàng (không mờ, có X) theo D1
- [ ] 1.3 Thêm trạng thái "đã tắt chip tác phẩm" theo (phiên, tác phẩm) trong store agent, chỉ trong bộ nhớ; nối nút X
- [ ] 1.4 Cập nhật component hàng chip để hiện chip tác phẩm và kiểm bằng test component: thứ tự chip, nút X, chip
  chương mờ vẫn mờ

## 2. Snapshot và resolver (main)

- [ ] 2.1 Viết test ở main: `context` chỉ có `workId` cho handle `ctx` loại tác phẩm, và policy cho phép ghi có Undo
  vào chương của tác phẩm đó (D2)
- [ ] 2.2 Đọc `resolver.ts`, viết test cho ba scenario của requirement "Chỉ sang tác phẩm khác khi người dùng nêu rõ"
  (không nêu tác phẩm, nêu rõ tác phẩm khác, mô tả khớp hai tác phẩm có một là tác phẩm đang mở)
- [ ] 2.3 Sửa resolver ở nhánh nào lệch với các test trên (D3)

## 3. Capability đọc

- [ ] 3.1 Thêm phương thức `LibraryStore` đếm số chương có ít nhất một đoạn có bản dịch và chương đầu tiên chưa dịch
  bằng một truy vấn trong work DB, kèm test
- [ ] 3.2 Thêm truy vấn đếm mục glossary theo trạng thái và đếm cặp xưng hô ở cấp tác phẩm, kèm test
- [ ] 3.3 Thêm capability `get_work_overview` (loại đọc, nhận handle tác phẩm hoặc chương) theo D4 và đăng ký vào bộ
  capability của Ask và Agent; test cho scenario tác phẩm mới nhập, handle chương, chế độ Ask
- [ ] 3.4 Cho `list_glossary` nhận handle tác phẩm (mục `term` đã duyệt kèm phạm vi chương) theo D5, kèm test
- [ ] 3.5 Cho `list_addressing` nhận handle tác phẩm (cặp đã duyệt kèm chương hiệu lực) theo D5; thêm hàm liệt kê ở
  storage nếu chưa có; kèm test
- [ ] 3.6 Viết lại lỗi validation của các capability đọc để nêu loại target cần có và cách lấy (`ctx` hoặc
  `resolve_target`), kèm test cho `read_chapter` với handle tác phẩm

## 4. Lượt không có phản hồi

- [ ] 4.1 Thêm hàm thuần trong `src/shared` quyết định lượt rỗng (không có phần tử `text` khác rỗng, không có tool
  call ghi `completed`) theo D6, kèm test các trường hợp: chỉ đọc, có chữ, có ghi, chữ chỉ có khoảng trắng
- [ ] 4.2 Ở main, khi turn kết thúc `completed` và hàm trên trả đúng, thêm phần tử `progress` "Lượt kết thúc mà không có
  phản hồi" trước khi kết thúc turn; test rằng phần tử được lưu và câu trả lời đã lưu của turn không đổi
- [ ] 4.3 Đảm bảo view của turn gửi cho renderer có context snapshot, chế độ và mức quyền của turn (D7); thêm trường
  nếu thiếu
- [ ] 4.4 Ở renderer, hiện nút Tiếp tục dưới turn mới nhất của phiên khi hàm ở 4.1 trả đúng; bấm thì gửi lượt "Tiếp
  tục" với context, chế độ, mức quyền của turn đó; test component cho hiện/ẩn nút và payload gửi đi

## 5. Hướng dẫn model

- [ ] 5.1 Thêm vào `SYSTEM_PROMPT` ba ý của D8 (dùng `ctx`, gọi `get_work_overview` một lần, gọi lệnh đọc độc lập
  song song), bằng tiếng Việt
- [ ] 5.2 Cập nhật mô tả của `list_works` và `resolve_target` để nói rõ không cần gọi khi `ctx` đã là tác phẩm cần
  làm

## 6. Kiểm chứng và tài liệu

- [ ] 6.1 Chạy `node scripts/check.mjs` và sửa đến khi qua
- [ ] 6.2 Chạy app thật với Gemini ở chế độ Agent, mức Cho phép tất cả, đứng ở chương 1 của một tác phẩm 30 chương và
  gửi "dịch toàn bộ truyện"; ghi lại từ `agent_tool_call` số vòng trước khi gọi `create_translation_task` (mục tiêu:
  không quá 2) và kết quả vào `docs/modules/proposals/autonomous-agent.md` mục 2.1
- [ ] 6.3 Cập nhật `docs/modules/proposals/decisions.md` (quyết định 13 chuyển từ "chưa triển khai" sang đã triển
  khai) và `docs/modules/proposals/agent-roadmap.md`; cập nhật `DESIGN.md` nếu chip tác phẩm là kiểu chip mới
