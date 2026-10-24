# agent-task-steering Specification

## Purpose
TBD - created by archiving change add-agent-steering. Update Purpose after archive.

## Requirements

### Requirement: Steering là bản ghi bền và idempotent
Hệ thống SHALL lưu mỗi steering được chấp nhận trong library DB với taskId, clientCommandId, digest của payload,
chương yêu cầu, `resolvedFromItem`, kind `instruction` hoặc `context_ref`, instruction text hoặc ref tới Context
entry, trạng thái `accepted`, `applied` hoặc `superseded` và thời điểm tạo. Gửi lại cùng clientCommandId với
cùng digest SHALL trả record đã có; cùng clientCommandId với digest khác SHALL bị từ chối là `conflict`.

#### Scenario: Gửi lại cùng lệnh
- **WHEN** chat gửi lại steering với cùng clientCommandId và cùng nội dung sau khi mất phản hồi
- **THEN** hệ thống trả record cũ và không tạo record thứ hai

#### Scenario: Cùng ID khác nội dung
- **WHEN** một lệnh dùng lại clientCommandId đã có nhưng instruction text khác
- **THEN** hệ thống trả `conflict` và không đổi record cũ

### Requirement: Validate đồng bộ, lệnh bị từ chối không để lại record
Hệ thống SHALL validate steering ngay khi nhận và trả kết quả trong cùng lệnh. Hệ thống SHALL từ chối kèm lý do,
không tạo record, khi task đã ở trạng thái kết thúc hoặc đang `cancelling`, khi chương yêu cầu không thuộc task
hoặc không xác định được đúng một chương, hoặc khi không còn item `queued` ở hoặc sau chương yêu cầu. Khi chấp
nhận, hệ thống SHALL trả item thực sự bắt đầu áp dụng.

#### Scenario: Chương ngoài task
- **WHEN** task gồm chương 1–30 và người dùng yêu cầu áp từ chương 45
- **THEN** hệ thống từ chối với lý do chương không thuộc task và không có record nào được tạo

#### Scenario: Chương mơ hồ
- **WHEN** yêu cầu nêu “chương kế” mà không resolve được đúng một chương
- **THEN** hệ thống từ chối, chat hỏi lại chương cụ thể

#### Scenario: Task đã hủy
- **WHEN** task ở `cancelled`
- **THEN** steering bị từ chối và task không chạy lại

### Requirement: Hiệu lực từ item kế tiếp chưa bắt đầu
Hệ thống SHALL đặt `resolvedFromItem` là item `queued` đầu tiên ở hoặc sau chương yêu cầu theo thứ tự task. Item
đang chạy, đã xong, lỗi hoặc bỏ qua SHALL giữ snapshot đã pin. Việc nhận steering và việc pin snapshot của item
SHALL được thực hiện tuần tự trong task runner để mỗi item hoặc dùng toàn bộ nội dung cũ hoặc toàn bộ nội dung
mới. Câu trả lời cho người dùng SHALL nêu chương thực sự áp dụng.

#### Scenario: Chương yêu cầu đang chạy
- **WHEN** chương 8 đang `running` và người dùng yêu cầu áp từ chương 8
- **THEN** hệ thống chấp nhận với `resolvedFromItem` là chương 9 và trả lời rằng áp dụng từ chương 9

#### Scenario: Chương 7 đang chạy
- **WHEN** chương 7 đang chạy và steering áp từ chương 8 được chấp nhận
- **THEN** chương 7 giữ snapshot cũ, chương 8 pin snapshot có nội dung mới

#### Scenario: Task đang tạm dừng
- **WHEN** task `paused` nhận steering rồi người dùng bấm Continue
- **THEN** item kế tiếp pin snapshot có nội dung mới

### Requirement: Instruction thay thế toàn văn và vào snapshot của item
Mỗi steering `instruction` SHALL chứa toàn văn instruction có hiệu lực từ `resolvedFromItem`. Khi item pin snapshot,
hệ thống SHALL chọn text của record `instruction` không `superseded`, tạo muộn nhất, có `resolvedFromItem` không
sau item đó, và lưu text này vào snapshot của item; không có record thì snapshot không có instruction. Record được
item dùng lần đầu SHALL chuyển `applied` trong cùng transaction pin. Record còn `accepted` SHALL chuyển
`superseded` khi một record tạo sau có điểm hiệu lực không sau điểm của nó.

#### Scenario: Hai instruction liên tiếp
- **WHEN** A áp từ chương 10, rồi B áp từ chương 10 được tạo trước khi chương 10 chạy
- **THEN** A thành `superseded`, chương 10 trở đi dùng text của B

#### Scenario: Instruction đã dùng không bị supersede
- **WHEN** A đã `applied` cho chương 10–12 và B áp từ chương 13
- **THEN** A vẫn `applied`, chương 13 trở đi dùng B

#### Scenario: Retry dùng instruction cũ
- **WHEN** item chương 10 được retry sau khi có instruction mới áp từ chương 10 nhưng chương 10 đã pin trước đó
- **THEN** retry dùng snapshot đã pin với instruction cũ

### Requirement: Đổi xưng hô từ chương N không để cặp chồng nhau
Steering `context_ref` SHALL chỉ được gửi khi người dùng xác nhận. Khi đổi cặp xưng hô người nói → người nghe từ
chương E (chương của `resolvedFromItem`), hệ thống SHALL, trong một transaction work DB, đặt `toChapterId` của cặp
cũ đang có hiệu lực ở E thành chương liền trước E theo vị trí trong tác phẩm và thêm cặp mới đã duyệt với
`fromChapterId` là E; sau đó mới ghi record library. Hệ thống SHALL từ chối khi cặp cũ bắt đầu ở hoặc sau E.
Hủy task SHALL không hoàn tác Context đã ghi.

#### Scenario: Xưng hô mới từ chương 8
- **WHEN** người dùng xác nhận đổi cách A gọi B từ chương 8 và chương 8 chưa chạy
- **THEN** cặp cũ kết thúc ở chương 7, cặp mới bắt đầu ở chương 8, và snapshot chương 8 chỉ có cặp mới

#### Scenario: Hủy task sau khi đổi xưng hô
- **WHEN** task bị hủy sau khi steering đổi cặp xưng hô được chấp nhận
- **THEN** cặp xưng hô mới và khoảng đã đóng của cặp cũ vẫn giữ nguyên

#### Scenario: Gửi lại sau lỗi giữa hai DB
- **WHEN** work DB đã commit nhưng ghi record library lỗi, và lệnh được gửi lại cùng clientCommandId
- **THEN** hệ thống nhận ra cặp đã tạo, không tạo cặp thứ hai và ghi record library

### Requirement: Đại từ ngôi ba theo chương bị từ chối
Hệ thống SHALL từ chối steering đổi đại từ ngôi ba (`thirdPerson`) của nhân vật từ một chương, với lý do trường này
chưa có phạm vi chương và hướng dẫn sửa cho cả tác phẩm ở Ngữ cảnh.

#### Scenario: Đổi “hắn” thành “y” từ chương 12
- **WHEN** người dùng yêu cầu từ chương 12 người kể gọi nhân vật X là “y”
- **THEN** hệ thống từ chối kèm lý do, không tạo record và không sửa nhân vật

### Requirement: Người dùng thấy điểm hiệu lực thật
Màn Tác vụ SHALL liệt kê steering của task với chương yêu cầu, chương thực sự áp dụng, loại và trạng thái, và SHALL
hiển thị instruction mà từng item đã pin. Hệ thống SHALL không nói steering áp cho chương đã chạy trước khi nó
được chấp nhận.

#### Scenario: Task xong qua hai instruction
- **WHEN** chương 1–7 không có instruction và chương 8–30 pin instruction B
- **THEN** màn Tác vụ cho thấy chương 1–7 không có instruction và chương 8–30 dùng B

### Requirement: Đổi thuật ngữ từ chương N trong task
Steering `context_ref` SHALL nhận thêm thay đổi loại `term`: mục thuật ngữ, bản dịch mới, và tùy chọn ghi chú mới.
Lệnh SHALL chỉ được gửi khi người dùng xác nhận. Hệ thống SHALL áp thay đổi như "thuật ngữ đổi từ chương N" của
capability `context-progression`, với N là chương của `resolvedFromItem`. Ghi file tác phẩm SHALL xảy ra trước ghi
record library, và gửi lại cùng `clientCommandId` SHALL tìm thấy mục đã tạo thay vì tạo mục thứ hai. Hệ thống SHALL
từ chối khi mục cũ bắt đầu ở chương của `resolvedFromItem` hoặc sau đó. Hủy task SHALL không hoàn tác Context đã ghi.

#### Scenario: Đổi tên kỹ năng từ chương 8
- **WHEN** người dùng xác nhận đổi 記憶遡行 thành "Truy Hồi Ký Ức" từ chương 8 và chương 8 chưa chạy
- **THEN** mục cũ kết thúc ở chương 7, mục mới bắt đầu ở chương 8, và bản chụp chương 8 chỉ có bản dịch mới

#### Scenario: Gửi lại sau lỗi
- **WHEN** file tác phẩm đã commit nhưng ghi record library lỗi, và lệnh được gửi lại cùng `clientCommandId`
- **THEN** hệ thống nhận ra mục đã tạo, không tạo mục thứ hai, và ghi record library
