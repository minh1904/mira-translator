# agent-response-parts Specification

## Purpose
Quy định cách main lưu và phát câu trả lời của một lượt Trợ lý thành chuỗi phần tử có thứ tự (chữ, suy nghĩ, tool
call, subagent), để transcript hiện và dựng lại đúng thứ tự như chat của VS Code, kể cả sau khi mở lại app.
## Requirements
### Requirement: Câu trả lời là chuỗi phần tử có thứ tự
Mỗi turn SHALL có một chuỗi phần tử theo thứ tự xảy ra, mỗi phần tử thuộc một loại: chữ trả lời, suy nghĩ, tool
call, hoặc thông báo tiến trình (ví dụ bỏ bớt lịch sử, model không dùng được tool). Chữ và suy nghĩ của mỗi vòng
model SHALL là phần tử riêng đặt trước các tool call của vòng đó. Phần tử SHALL được lưu bền trong library DB trước
khi turn kết thúc và SHALL có thứ tự ổn định. Câu trả lời đã lưu của turn (dùng làm lịch sử cho model) SHALL không
đổi nội dung so với trước change này.

#### Scenario: Chữ, tool, chữ
- **WHEN** model viết "Để tôi đọc chương", gọi `read_chapter`, rồi vòng sau viết bản tóm tắt
- **THEN** chuỗi phần tử của turn là chữ, tool call `read_chapter`, chữ, theo đúng thứ tự đó

#### Scenario: Mở lại app
- **WHEN** app mở lại sau turn ở trên
- **THEN** snapshot session trả cùng chuỗi phần tử theo cùng thứ tự

#### Scenario: Suy nghĩ được lưu
- **WHEN** provider stream suy nghĩ trong vòng đầu
- **THEN** phần tử suy nghĩ được lưu với nội dung provider gửi và thời lượng đo được

### Requirement: Sự kiện stream cho tool call
Main SHALL phát sự kiện tool call khi call được lưu, khi trạng thái đổi và khi kết thúc. Sự kiện SHALL mang ID call,
tên capability, trạng thái (`waiting_user`, `running`, `completed`, `failed`, `cancelled`, `skipped`), câu mô tả thì
hiện tại, câu mô tả thì quá khứ khi kết thúc, và kết quả rút gọn. Call bị policy từ chối, sai tham số, hết ngân sách
hoặc bị Autopilot bỏ qua SHALL phát sự kiện kết thúc với trạng thái và lý do. Sự kiện SHALL tuân theo `eventSeq` của
turn.

#### Scenario: Đọc chương
- **WHEN** model gọi `read_chapter` cho chương 12 và call chạy xong
- **THEN** renderer nhận sự kiện bắt đầu với câu "Đang đọc chương 12" và sự kiện kết thúc với câu "Đã đọc chương 12"

#### Scenario: Call bị từ chối
- **WHEN** model gọi capability với handle không do turn cấp
- **THEN** renderer nhận sự kiện kết thúc trạng thái `failed` kèm lý do của policy, không có sự kiện `running`

### Requirement: Chi tiết tool call đọc khi cần
Snapshot session SHALL trả mỗi tool call với ID, tên, trạng thái, câu mô tả, tham số và kết quả rút gọn. Kết quả đầy
đủ SHALL đọc qua một lệnh riêng theo ID call; lệnh SHALL trả đúng kết quả đã lưu và lỗi `not_found` khi không có
call.

#### Scenario: Mở kết quả đọc chương
- **WHEN** người dùng mở phần Kết quả của một call `read_chapter`
- **THEN** renderer đọc kết quả đã lưu của call đó, không gọi lại capability

### Requirement: Subagent lưu và giới hạn như lượt chính
Tool call của subagent SHALL được lưu như tool call của turn, gắn với call `run_subagent` cha, và phát sự kiện tool
call mang ID cha. Subagent SHALL chỉ được dùng capability đọc và `resolve_target`, SHALL qua phát hiện lặp, và SHALL
có trần riêng: 4 vòng model, 10 tool call, 60.000 ký tự đọc; vượt trần thì subagent kết thúc với phần đã có và call
cha ghi lý do. `resolve_target` mơ hồ SHALL trả danh sách ứng viên cho subagent thay vì báo không tìm thấy. Bản tóm
tắt trả về call cha SHALL là chữ của vòng cuối của subagent. Hủy turn SHALL hủy subagent đang chạy.

#### Scenario: Subagent đọc hai chương
- **WHEN** subagent đọc chương 3 và chương 4 rồi tóm tắt
- **THEN** hai call `read_chapter` được lưu với cha là call `run_subagent`, và kết quả của cha chỉ chứa đoạn tóm tắt cuối

#### Scenario: Subagent chạm trần
- **WHEN** subagent gọi tool thứ 11
- **THEN** call đó không chạy, subagent kết thúc và call cha ghi lý do chạm trần

#### Scenario: Subagent gọi tool ghi
- **WHEN** model của subagent gọi `translate_chapter`
- **THEN** call được lưu với lỗi không được phép và không chạy

