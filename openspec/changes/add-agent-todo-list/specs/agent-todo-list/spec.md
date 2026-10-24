## Purpose

Cho agent một danh sách bước do chính model viết và cập nhật, để người dùng thấy tiến độ của lệnh nhiều bước và model
không quên bước khi lượt dài hoặc lịch sử cũ bị tóm tắt.

## ADDED Requirements

### Requirement: Capability todo_list ghi và đọc toàn bộ danh sách
Runtime SHALL có capability `todo_list`. Gọi kèm `todos` SHALL thay toàn bộ danh sách hiện tại bằng danh sách gửi lên;
gọi không có `todos` SHALL không đổi gì. Mỗi lần gọi thành công SHALL trả toàn bộ danh sách hiện tại. Mỗi bước SHALL
có `content` (chữ, không rỗng sau khi bỏ khoảng trắng) và `status` thuộc `pending`, `in_progress`, `completed`,
`cancelled`. Danh sách SHALL có tối đa 20 bước và mỗi `content` tối đa 200 ký tự; vượt giới hạn hoặc sai trạng thái
SHALL trả lỗi validation nêu giới hạn và không đổi danh sách. Danh sách rỗng SHALL hợp lệ và xóa danh sách hiện tại.
`todo_list` SHALL không đọc hay ghi dữ liệu truyện, không nhận handle và luôn được policy cho chạy mà không hỏi.

#### Scenario: Ghi danh sách
- **WHEN** model gọi `todo_list` với ba bước, bước đầu `in_progress`, hai bước sau `pending`
- **THEN** call hoàn tất và kết quả là đúng ba bước đó theo thứ tự

#### Scenario: Đọc danh sách
- **WHEN** model gọi `todo_list` không có `todos` sau khi đã ghi ba bước
- **THEN** kết quả là ba bước đã ghi và danh sách không đổi

#### Scenario: Quá 20 bước
- **WHEN** model gọi `todo_list` với 21 bước
- **THEN** call trả lỗi validation nêu tối đa 20 bước và danh sách hiện tại giữ nguyên

#### Scenario: Xóa danh sách
- **WHEN** model gọi `todo_list` với `todos` rỗng
- **THEN** danh sách hiện tại của session rỗng và lượt sau không còn danh sách nào

### Requirement: Danh sách thuộc session
Danh sách hiện tại của session SHALL là `todos` của lần gọi `todo_list` ghi thành công gần nhất trong các lượt chưa bị
revert của session. Lượt mới SHALL đọc được danh sách của lượt trước. Revert một lượt SHALL làm danh sách quay về lần
ghi gần nhất trong các lượt còn lại.

#### Scenario: Tiếp tục ở lượt sau
- **WHEN** lượt trước ghi danh sách có bước 2 `in_progress` và người dùng gửi "làm tiếp"
- **THEN** `todo_list` không có `todos` ở lượt mới trả danh sách đó

#### Scenario: Revert lượt đã ghi danh sách
- **WHEN** lượt 2 và lượt 3 đều ghi danh sách và người dùng revert về lượt 3
- **THEN** danh sách hiện tại là danh sách lượt 2 ghi

### Requirement: Danh sách được giữ qua tóm tắt lịch sử
Khi lượt chứa lần ghi tạo ra danh sách hiện tại không được gửi nguyên văn cho model (đã được tóm tắt hoặc bị cắt theo
capability `agent-session-compaction`) và danh sách không rỗng, runtime SHALL chèn danh sách hiện tại vào prompt ngay
sau bản tóm tắt (hoặc ngay trước các lượt còn lại khi không có bản tóm tắt), với đầu đề cho biết đây là danh sách bước
đang theo dõi. Khi lượt đó còn được gửi nguyên văn, runtime SHALL không chèn thêm bản sao.

#### Scenario: Lượt ghi danh sách đã được tóm tắt
- **WHEN** lượt ghi danh sách nằm trong bản tóm tắt của session và người dùng gửi lượt mới
- **THEN** prompt có danh sách hiện tại ngay sau bản tóm tắt, đúng từng bước và trạng thái

#### Scenario: Lượt ghi danh sách còn nguyên văn
- **WHEN** lượt ghi danh sách là một trong ba lượt gần nhất
- **THEN** prompt không có bản sao thứ hai của danh sách ngoài tool call đã gửi lại

### Requirement: Một thẻ checklist mỗi lượt
Transcript SHALL hiện mỗi lượt có ít nhất một call `todo_list` ghi thành công đúng một thẻ checklist, đặt ở vị trí
call `todo_list` đầu tiên của lượt, nội dung theo lần ghi thành công mới nhất của lượt đó và cập nhật khi có lần ghi
mới. Mỗi bước SHALL hiện nội dung kèm trạng thái bằng cả biểu tượng lẫn chữ đọc được bởi trình đọc màn hình; bước
`completed` và `cancelled` SHALL phân biệt được với bước còn làm mà không chỉ dựa vào màu. Thẻ SHALL không có control
tương tác. Call `todo_list` chỉ đọc hoặc lỗi SHALL không tạo thẻ. Thẻ của lượt cũ SHALL giữ nội dung lần ghi cuối của
lượt đó.

#### Scenario: Cập nhật tại chỗ
- **WHEN** trong một lượt model ghi danh sách ba bước rồi sau hai lần đọc chương ghi lại với bước 1 `completed`
- **THEN** transcript có một thẻ checklist ở vị trí lần ghi đầu, hiện bước 1 đã xong, và không có dòng tool call
  `todo_list` nào

#### Scenario: Hai lượt
- **WHEN** lượt 1 ghi danh sách và lượt 2 cập nhật bước 2 thành `completed`
- **THEN** lượt 1 vẫn hiện thẻ với trạng thái cuối của lượt 1, lượt 2 hiện thẻ với bước 2 đã xong

#### Scenario: Mở lại app
- **WHEN** app mở lại sau một lượt có thẻ checklist
- **THEN** snapshot session dựng lại cùng thẻ với cùng nội dung

### Requirement: Dùng ở Ask và Agent
`todo_list` SHALL có mặt trong bộ tool của cả chế độ Ask và Agent khi model hỗ trợ tool, và SHALL tính vào trần tool
call của lượt như mọi call khác. System policy SHALL hướng dẫn model dùng `todo_list` cho lệnh từ ba bước trở lên, giữ
tối đa một bước `in_progress`, và cập nhật trạng thái khi xong từng bước; không dùng cho câu hỏi một bước.

#### Scenario: Chế độ Ask
- **WHEN** lượt chạy ở chế độ Ask với model hỗ trợ tool
- **THEN** request gửi model có tool `todo_list` và không có tool ghi dữ liệu truyện
