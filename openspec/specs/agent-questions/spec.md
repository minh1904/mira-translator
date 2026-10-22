# agent-questions Specification

## Purpose
Quy định cách agent hỏi người dùng nhiều câu trong một lần, cách người dùng trả lời, nhập tự do hoặc bỏ qua, và cách
câu trả lời quay về model, theo thẻ câu hỏi của VS Code.
## Requirements
### Requirement: Một lần hỏi gồm nhiều câu có kiểu
Capability `ask_questions` SHALL nhận 1–5 câu hỏi và cờ `allowSkip` (mặc định có). Mỗi câu SHALL có ID, tiêu đề, mô tả
tùy chọn, kiểu `single`, `multi` hoặc `text`; câu `single`/`multi` SHALL có 2–9 lựa chọn; mỗi câu MAY có đáp án mặc
định, cho phép nhập câu trả lời khác, và cờ bắt buộc (mặc định bắt buộc). Tham số sai SHALL bị từ chối với lỗi có cấu
trúc cho model. Ở mức quyền `default` và `allow_all`, call SHALL chuyển turn sang `waiting_user`.

#### Scenario: Hai câu hỏi
- **WHEN** model hỏi phong cách dịch (chọn một) và các nhân vật cần giữ tên Hán Việt (chọn nhiều)
- **THEN** turn chờ người dùng với một pending action chứa hai câu theo đúng thứ tự

#### Scenario: Câu chọn một có 12 lựa chọn
- **WHEN** model gửi câu `single` với 12 lựa chọn
- **THEN** call không chuyển turn sang chờ và model nhận lỗi tham số

### Requirement: Trả lời và bỏ qua
Câu trả lời SHALL gửi kèm ID turn, ID call, digest tham số và bảng đáp án theo ID câu (chuỗi cho `single`/`text`, danh
sách cho `multi`), hoặc cờ bỏ qua. Runtime SHALL từ chối câu trả lời thiếu câu bắt buộc, hoặc có lựa chọn không thuộc
danh sách khi câu không cho nhập tự do, hoặc bỏ qua khi `allowSkip` tắt. Model SHALL nhận cho mỗi câu tiêu đề và đáp án
(nhãn của lựa chọn, không phải ID), hoặc ghi rõ người dùng bỏ qua. Gửi lệnh mới khi câu hỏi đang chờ SHALL làm turn đó
hết hạn như hành vi chờ hiện có.

#### Scenario: Nhập câu trả lời khác
- **WHEN** câu phong cách cho nhập tự do và người dùng gõ "Thuần Việt nhưng giữ tên riêng"
- **THEN** model nhận đúng chuỗi đó làm đáp án của câu

#### Scenario: Bỏ qua
- **WHEN** người dùng bấm Bỏ qua tất cả
- **THEN** turn tiếp tục và model nhận kết quả người dùng bỏ qua, không có đáp án nào

#### Scenario: Thiếu câu bắt buộc
- **WHEN** client gửi đáp án thiếu một câu bắt buộc
- **THEN** runtime từ chối, call vẫn chờ và turn vẫn `waiting_user`

### Requirement: Thẻ câu hỏi phía trên ô nhập
Khi session có câu hỏi đang chờ, thẻ câu hỏi SHALL nằm phía trên ô nhập, hiện từng câu một với bước "{i}/{n}", Trước,
Tiếp và Gửi ở câu cuối. Lựa chọn SHALL đánh số và chọn được bằng phím số 1–9; đáp án mặc định SHALL được chọn sẵn; câu
cho nhập tự do SHALL có ô "Nhập câu trả lời khác"; câu `text` SHALL có ô "Nhập câu trả lời". Tiếp và Gửi SHALL bị khóa
khi câu bắt buộc chưa có đáp án, kèm "Câu này cần trả lời". Ctrl+Enter SHALL gửi khi đã đủ. Thẻ SHALL có Bỏ qua tất cả
khi được phép, và thu gọn/mở rộng được. Sau khi trả lời hoặc bỏ qua, thẻ SHALL biến mất và luồng trả lời SHALL có dòng
tóm tắt tại vị trí của call: "H: {tiêu đề}" / "Đ: {đáp án}" cho từng câu, hoặc "Đã bỏ qua câu hỏi".

#### Scenario: Trả lời bằng bàn phím
- **WHEN** thẻ có focus ở câu 1/2, người dùng nhấn 2, nhấn Tiếp, chọn lựa chọn ở câu 2 rồi nhấn Ctrl+Enter
- **THEN** đáp án được gửi và luồng trả lời hiện tóm tắt hai cặp H/Đ

#### Scenario: Mở lại app khi đang chờ
- **WHEN** app mở lại khi một câu hỏi vẫn chờ
- **THEN** thẻ câu hỏi hiện lại phía trên ô nhập với đáp án mặc định

