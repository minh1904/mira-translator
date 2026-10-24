## Purpose

Cho người dùng đổi hướng một lượt agent đang chạy bằng tin chen ngang, được chèn vào prompt sau kết quả công cụ kế
tiếp, mà không phải dừng lượt và mất phần đã làm.

## ADDED Requirements

### Requirement: Gửi tin chen ngang
Khi lượt của session ở `queued` hoặc `running`, gửi từ ô nhập SHALL tạo một tin chen ngang của lượt đó thay vì lượt
mới. Tin chen ngang SHALL chỉ gồm chữ, không kèm ngữ cảnh, chế độ hay model. Main SHALL lưu tin bền trước khi xác nhận
và SHALL từ chối bằng lỗi typed `turn_not_running` khi lượt không còn `queued`/`running`; renderer SHALL giữ nguyên chữ
trong ô nhập khi bị từ chối. Lệnh gửi SHALL có ID lệnh của client để gửi lại không tạo tin trùng. Một lượt SHALL có tối
đa 5 tin đang chờ; tin thứ sáu SHALL bị từ chối bằng lỗi typed.

#### Scenario: Gõ thêm khi agent đang đọc
- **WHEN** lượt đang chạy `read_chapter` và người dùng gửi "chỉ cần chương 3 thôi"
- **THEN** không có lượt mới, tin được lưu ở trạng thái chờ và hiện phía trên ô nhập

#### Scenario: Lượt vừa kết thúc
- **WHEN** người dùng gửi tin chen ngang đúng lúc lượt vừa thành `completed`
- **THEN** main trả `turn_not_running`, chữ vẫn nằm trong ô nhập và người dùng gửi lại thành lượt mới

#### Scenario: Gửi lại cùng lệnh
- **WHEN** renderer gửi lại lệnh chen ngang với cùng ID lệnh sau khi mất phản hồi
- **THEN** chỉ có một tin chen ngang được lưu

### Requirement: Chèn sau kết quả công cụ
Sau khi mọi tool call của một vòng có kết quả và trước lời gọi model kế tiếp của lượt, runtime SHALL chèn mọi tin đang
chờ của lượt, theo thứ tự gửi, thành một message người dùng duy nhất đặt sau kết quả tool, mở đầu bằng nhãn nói đây là
lời người dùng gửi thêm trong lúc lượt chạy. System policy SHALL nói rằng tin chen ngang là chỉ dẫn của người dùng,
thắng instruction ban đầu khi mâu thuẫn. Tin đã chèn SHALL chuyển trạng thái `delivered` cùng số vòng được chèn và
SHALL không bị chèn lại. Tin gửi trong lúc model đang stream SHALL chờ tới điểm chèn kế tiếp.

#### Scenario: Đổi hướng giữa chừng
- **WHEN** vòng 2 gọi `read_chapter` chương 1–5 và người dùng gửi "bỏ qua chương 4" trong lúc tool chạy
- **THEN** request vòng 3 có kết quả đọc rồi tới message chen ngang "bỏ qua chương 4", và tin chuyển `delivered` ở vòng 2

#### Scenario: Nhiều tin chờ
- **WHEN** hai tin chen ngang được gửi trong cùng một vòng
- **THEN** request vòng sau có đúng một message chen ngang chứa cả hai tin theo thứ tự gửi

#### Scenario: Lượt đang chờ duyệt rồi tiếp tục
- **WHEN** lượt `waiting_user`, người dùng duyệt call, lượt chạy lại và người dùng gửi tin chen ngang trong vòng đó
- **THEN** tin được chèn sau kết quả của call vừa duyệt

### Requirement: Rút lại tin chưa chèn
Tin chen ngang ở trạng thái chờ SHALL rút lại được; tin đã rút SHALL không bao giờ được chèn. Rút một tin đã
`delivered` SHALL bị từ chối bằng lỗi typed.

#### Scenario: Rút trước khi chèn
- **WHEN** người dùng bấm X trên tin đang chờ trước khi vòng tool xong
- **THEN** tin biến khỏi danh sách chờ và request vòng sau không có message chen ngang

### Requirement: Tin chưa chèn khi lượt kết thúc
Khi lượt thành `completed` mà còn tin chờ, Main SHALL đánh dấu các tin đó đã chuyển và SHALL tạo ngay lượt kế tiếp của
session với instruction là các tin đó nối theo thứ tự, cùng chế độ và mức quyền của lượt vừa xong, ngữ cảnh là ngữ cảnh
của lượt vừa xong. Khi lượt thành `waiting_user`, `failed`, `cancelled`, `interrupted` hoặc `expired` mà còn tin chờ,
Main SHALL chuyển chúng sang `returned`; tin `returned` SHALL hiện phía trên ô nhập với hành động Gửi (tạo lượt mới hoặc,
nếu lượt đang `waiting_user`, đưa chữ vào ô nhập để trả lời) và Bỏ, và SHALL không tự gửi.

#### Scenario: Model trả lời xong trước khi chèn
- **WHEN** vòng cuối của lượt không gọi tool, model trả lời xong và còn một tin chờ "thêm phần tóm tắt nhân vật"
- **THEN** lượt `completed`, rồi một lượt mới với instruction "thêm phần tóm tắt nhân vật" tự bắt đầu trong cùng session

#### Scenario: Người dùng bấm Dừng
- **WHEN** còn một tin chờ và người dùng bấm Dừng
- **THEN** lượt `cancelled`, tin hiện là chưa gửi với nút Gửi và Bỏ, không có lượt mới nào tự chạy

#### Scenario: Agent hỏi lại
- **WHEN** lượt chuyển `waiting_user` vì call cần duyệt trong khi còn một tin chờ
- **THEN** tin chuyển `returned` và không trở thành câu trả lời cho call đang chờ

### Requirement: Bền qua khởi động lại và đồng bộ giữa cửa sổ
Tin chen ngang và trạng thái của nó SHALL được lưu trong library DB. Khi app mở lại, lượt đang chạy trước đó thành
`interrupted` và tin chờ của nó SHALL thành `returned`. Main SHALL phát event khi tin được thêm, chèn, rút, trả lại hay
chuyển thành lượt mới; snapshot session SHALL gồm tin chờ và tin `returned` của session. Mọi cửa sổ mở cùng session SHALL
thấy cùng danh sách.

#### Scenario: Thoát app khi còn tin chờ
- **WHEN** app đóng lúc lượt đang chạy và có một tin chờ, rồi mở lại
- **THEN** lượt là `interrupted` và tin hiện là chưa gửi với Gửi và Bỏ

#### Scenario: Hai cửa sổ
- **WHEN** tin chen ngang được gửi từ cửa sổ thứ nhất và cửa sổ thứ hai mở cùng session
- **THEN** cửa sổ thứ hai hiện tin chờ, rồi hiện phần tử chen ngang trong transcript khi tin được chèn

### Requirement: Hiển thị trong transcript
Tin đã chèn SHALL là một phần tử của lượt, đặt sau tool call của vòng được chèn và trước chữ của vòng kế tiếp, hiển thị
như lời người dùng có nhãn "Gửi thêm khi đang chạy". Tin chờ SHALL hiện phía trên ô nhập, mỗi tin một dòng có nút X.

#### Scenario: Xem lại lượt
- **WHEN** người dùng mở lại session có lượt được chen ngang ở vòng 2
- **THEN** transcript hiện tool call vòng 2, phần tử chen ngang, rồi chữ và tool của vòng 3 theo đúng thứ tự

### Requirement: Tin chen ngang là lời người dùng
Policy SHALL coi chữ của các tin đã chèn như phần instruction của lượt khi xét đích có do người dùng nêu hay không. Khi
lượt được gửi lại làm lịch sử ở lượt sau, tin chen ngang SHALL xuất hiện đúng vị trí đã chèn (sau kết quả tool của vòng
đó), và bản tóm tắt session SHALL coi nó là yêu cầu của người dùng.

#### Scenario: Nêu đích trong tin chen ngang
- **WHEN** instruction ban đầu là "dịch chương 3" và tin chen ngang đã chèn nói "dịch luôn chương 4"
- **THEN** đích chương 4 được policy coi là do người dùng nêu

#### Scenario: Lịch sử lượt sau
- **WHEN** lượt sau của session gửi lại lượt có tin chen ngang ở vòng 2
- **THEN** message chen ngang nằm sau kết quả tool vòng 2 và trước tool call vòng 3 trong prompt
