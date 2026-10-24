## 1. Contract và capability

- [x] 1.1 Thêm kiểu `AgentTodoItem` (`content`, `status`) và hằng giới hạn 20 bước × 200 ký tự vào
  `src/shared/contracts/agent.ts`; kiểm bằng typecheck
- [x] 1.2 Viết test cho capability `todo_list`: ghi trả đúng danh sách; đọc trả danh sách hiện tại; 21 bước, nội dung
  rỗng, nội dung 201 ký tự, trạng thái lạ đều trả lỗi validation; `todos: []` hợp lệ
- [x] 1.3 Cài capability `todo_list` (`kind: 'read'`, không target) theo D1, D3, D4 và đăng ký trong registry; test 1.2
  qua

## 2. Danh sách hiện tại của session

- [x] 2.1 Viết test service: lượt sau đọc được danh sách lượt trước; revert lượt ghi cuối thì danh sách về lần ghi
  trước; call lỗi không đổi danh sách
- [x] 2.2 Cài hàm tìm danh sách hiện tại từ `listTurns` và `agent_tool_call` (D1) và truyền vào handler; test 2.1 qua
- [x] 2.3 Loại `todo_list` khỏi bộ tool của subagent theo tên; kiểm bằng test: request subagent không có `todo_list`,
  call `todo_list` của subagent bị từ chối và danh sách không đổi
- [x] 2.4 Thêm hướng dẫn dùng `todo_list` vào `SYSTEM_PROMPT` (từ ba bước, một bước `in_progress`, xóa khi đổi chủ đề);
  kiểm bằng test có tool `todo_list` ở chế độ Ask

## 3. Giữ qua tóm tắt

- [x] 3.1 Viết test cho `assembleTurnContext` theo D5: lượt ghi danh sách đã được tóm tắt thì có message danh sách ngay
  sau tóm tắt; lượt đó còn nguyên văn thì không có; danh sách rỗng thì không có; kích thước được tính vào ngưỡng
- [x] 3.2 Cài D5 cho test 3.1 qua và nối từ `AgentService`

## 4. Thẻ checklist

- [x] 4.1 Viết test cho `turnItems()`: hai lần ghi trong một lượt cho một item `todo` ở vị trí lần ghi đầu với nội dung
  lần sau; call đọc bị bỏ; call lỗi còn là item `tool`; lượt không có `todo_list` không đổi
- [x] 4.2 Cài item `todo` trong `turnItems()` theo D6; test 4.1 qua
- [x] 4.3 Thêm `TodoCard` theo D6 và `DESIGN.md` (token sẵn có, không control, nhãn trạng thái cho trình đọc màn hình,
  không chỉ dựa vào màu); kiểm bằng test component cho bốn trạng thái và theme sáng/tối
- [x] 4.4 Hiện `TodoCard` trong `AgentTranscript`; kiểm bằng test transcript: mở lại từ snapshot cho cùng thẻ

## 5. Tài liệu và kiểm tra

- [x] 5.1 Ghi trạng thái triển khai vào module tài liệu của agent trong `docs/modules` và ghi trong
  `docs/modules/proposals/autonomous-agent.md` rằng `todo_list` là bước trước thẻ kế hoạch, không thay nó
- [x] 5.2 Chạy `node scripts/check.mjs` và sửa đến khi qua
- [ ] 5.3 Chạy thử app với lệnh nhiều bước: thẻ checklist cập nhật tại chỗ trong một lượt, lượt sau "làm tiếp" đọc
  được danh sách
