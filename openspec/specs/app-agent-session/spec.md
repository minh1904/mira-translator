# app-agent-session Specification

## Purpose
Quy định phiên Mira Agent ở phạm vi toàn ứng dụng, đồng thời lưu riêng context lúc người dùng gửi và target thực tế của từng operation để hội thoại có thể làm việc qua nhiều tác phẩm mà không ghi nhầm đích.
## Requirements
### Requirement: Phiên agent thuộc toàn ứng dụng

Phiên agent mới SHALL thuộc phạm vi ứng dụng, không thuộc một tác phẩm hay chương. Chuyển tác phẩm, chuyển chương, ẩn panel hoặc đóng rồi mở lại ứng dụng SHALL không tự tạo phiên khác hoặc xóa lịch sử. Người dùng SHALL có thể tiếp tục cùng phiên sau khi context hiện tại thay đổi.

#### Scenario: Chuyển sang tác phẩm khác
- **WHEN** người dùng đang chat trong một phiên ở tác phẩm A rồi mở tác phẩm B
- **THEN** panel vẫn hiển thị cùng phiên và lượt tiếp theo lấy B làm context hiện tại

#### Scenario: Mở lại ứng dụng
- **WHEN** người dùng đóng ứng dụng sau một lượt đã lưu rồi mở lại
- **THEN** phiên, các lượt, operation và trạng thái hoàn tác đã lưu vẫn đọc được

### Requirement: Panel agent dùng được ngoài workspace

Panel agent SHALL được sở hữu và mount ở phạm vi ứng dụng thay vì phụ thuộc `ChapterWorkspace`. Người dùng SHALL mở và gửi lượt từ màn không có tác phẩm; màn có domain context SHALL chỉ cung cấp snapshot context, không sở hữu session.

#### Scenario: Gửi từ Home
- **WHEN** người dùng mở panel tại Home và hỏi một câu không cần resource
- **THEN** cùng session app-level xử lý câu hỏi với context rỗng mà không yêu cầu mount workspace

#### Scenario: Workspace bị unmount khi operation chạy
- **WHEN** operation đang dịch target A và người dùng rời workspace
- **THEN** runner và panel app-level tiếp tục nhận activity; việc unmount workspace không hủy operation

### Requirement: Mỗi session chỉ có một lượt đang hoạt động

Một session SHALL có tối đa một turn ở `queued` hoặc `running`. Trong khi turn đang hoạt động, composer MAY giữ draft nhưng SHALL thay hành động Gửi bằng Dừng và SHALL không tạo turn thứ hai. Main SHALL thực thi ràng buộc này độc lập với trạng thái disabled của renderer. Lượt mới chỉ được bắt đầu khi lượt trước ở `completed`, `cancelled`, `failed`, `interrupted` hoặc `waiting_user`.

#### Scenario: Gửi lần nữa khi đang dịch
- **WHEN** một turn đang chạy operation dịch và renderer hoặc IPC gửi thêm instruction vào cùng session
- **THEN** main từ chối bằng lỗi typed `turn_in_progress`, không tạo turn/operation mới và không tranh chấp target đang ghi

#### Scenario: Soạn draft trong khi chạy
- **WHEN** turn đang chạy và người dùng nhập yêu cầu tiếp theo
- **THEN** draft được giữ cục bộ nhưng Enter/nút gửi không gửi cho tới khi turn hiện tại terminal

#### Scenario: Tiếp tục sau khi Agent hỏi lại
- **WHEN** turn chuyển `waiting_user` vì target mơ hồ và người dùng gửi câu trả lời làm rõ
- **THEN** cùng turn có thể chuyển lại `running` theo state machine thay vì tạo hai turn chạy đồng thời

### Requirement: Storage phiên không bị coi là projection tái tạo được

Khi đã chứa bảng agent, `library.db` SHALL là dữ liệu bền. Migration SHALL tạo backup cục bộ trước khi đổi schema. Reconcile SHALL chỉ dựng lại projection thư viện và SHALL NOT xóa session/turn/operation. Nếu DB hiện hữu bị hỏng và không phục hồi được, app SHALL báo luồng recovery thay vì âm thầm tạo DB trắng.

#### Scenario: Reconcile lại work index
- **WHEN** `work_index` thiếu nhưng session agent còn nguyên
- **THEN** app dựng lại `work_index` và giữ nguyên mọi session, turn, operation và activity

#### Scenario: Library DB hỏng không có backup hợp lệ
- **WHEN** app không mở được `library.db` hiện hữu và không có backup phục hồi được
- **THEN** app chặn ghi mới, báo lỗi recovery và không thay file bằng một DB trắng

### Requirement: Mỗi lượt chụp context giao diện

Mỗi lượt gửi SHALL lưu context tại thời điểm gửi gồm đúng những gì ô nhập sẽ gửi theo capability `agent-composer`: chương đang mở khi chip gợi ý đã được thêm, vùng chọn kèm chương của nó, vị trí con trỏ của chương được gửi, và các đính kèm. Context SHALL là dữ liệu gợi ý để hiểu các từ như “truyện này”, “chương này” và “đoạn này”; context SHALL NOT giới hạn agent chỉ được thao tác các resource đó.

#### Scenario: Gửi rồi đổi chương
- **WHEN** người dùng gửi với chip chương 1 rồi chuyển sang chương 3 trước khi lượt kết thúc
- **THEN** lượt đã gửi vẫn giữ context chương 1 và operation của nó không đổi đích theo giao diện mới

#### Scenario: Gửi từ màn không có tác phẩm
- **WHEN** người dùng gửi từ màn toàn ứng dụng không có tác phẩm đang mở và không thêm chip
- **THEN** lượt được lưu với context rỗng, và yêu cầu cần resource phải tự resolve hoặc hỏi lại

#### Scenario: Chip chương còn mờ
- **WHEN** người dùng ở chương 1, chế độ Agent, không chọn đoạn và chưa bấm chip gợi ý
- **THEN** lượt được lưu với context rỗng dù chương 1 đang mở

### Requirement: Operation lưu target độc lập với context

Mỗi thao tác đọc hoặc ghi có đích SHALL lưu target đã resolve gồm loại resource, `workId`, `chapterId` khi áp dụng, cùng nhãn tác phẩm/chương tại lúc resolve. Target của operation SHALL bất biến sau khi operation bắt đầu. Các bước retry và undo SHALL dùng target đã lưu, không dùng context giao diện hiện tại.

#### Scenario: Dịch chương khác chương đang mở
- **WHEN** context là tác phẩm A chương 1 và người dùng yêu cầu dịch chương 2
- **THEN** operation lưu target A chương 2 và tiếp tục nhắm chương 2 dù người dùng điều hướng nơi khác

#### Scenario: Resource đích bị xóa
- **WHEN** target đã lưu không còn tồn tại trước khi operation ghi
- **THEN** operation kết thúc với trạng thái không áp dụng, giữ nhãn đích đã chụp và không chuyển sang resource cùng tên khác

### Requirement: Một phiên được tham chiếu nhiều tác phẩm

Một phiên SHALL cho phép các lượt và operation tham chiếu nhiều tác phẩm. Lịch sử gửi model SHALL giữ metadata ranh giới tác phẩm của các operation; dữ liệu đọc từ tác phẩm trước SHALL không được mô tả như dữ liệu của context hiện tại.

#### Scenario: So sánh hai tác phẩm
- **WHEN** người dùng yêu cầu so sánh một cách dịch giữa tác phẩm A và B
- **THEN** agent được đọc cả hai tác phẩm và mỗi activity ghi rõ resource thuộc tác phẩm nào

#### Scenario: Đổi context sau khi nói về tác phẩm cũ
- **WHEN** lượt trước nói về A, context hiện tại là B và người dùng nói “chương này”
- **THEN** “chương này” được resolve theo B, không theo tác phẩm gần nhất xuất hiện trong lịch sử

### Requirement: Lịch sử phiên cũ vẫn truy cập được

Phiên và lượt được lưu theo tác phẩm trước change này SHALL vẫn đọc được. Tiếp tục một phiên cũ SHALL tạo hoặc liên kết tới một phiên agent toàn ứng dụng mà không sửa nội dung lượt cũ, và lượt mới SHALL dùng contract context/target mới. Mỗi lượt legacy được copy SHALL giữ tham chiếu bền tới work/session/turn gốc để panel có thể tải và xử lý proposal cũ từ đúng work DB.

#### Scenario: Tiếp tục phiên cũ
- **WHEN** người dùng mở một phiên cũ có proposal chờ duyệt rồi gửi câu hỏi mới
- **THEN** lượt cũ và proposal cũ vẫn hiển thị như lịch sử, còn lượt mới thuộc phiên toàn ứng dụng và không tạo proposal chờ duyệt

#### Scenario: Duyệt proposal của lượt legacy đã import
- **WHEN** người dùng Accept hoặc Deny proposal dưới một lượt legacy trong phiên toàn ứng dụng
- **THEN** panel định tuyến thao tác về work/session/turn gốc, cập nhật đúng proposal cũ và không tạo proposal bản sao

