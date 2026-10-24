## MODIFIED Requirements

### Requirement: Mỗi session chỉ có một lượt đang hoạt động

Một session SHALL có tối đa một turn ở `queued` hoặc `running`. Trong khi turn đang hoạt động, gửi từ composer SHALL tạo
tin chen ngang của turn đó theo capability `agent-steer-messages`, SHALL không tạo turn thứ hai, và composer SHALL vẫn
hiện Dừng. Main SHALL thực thi ràng buộc này độc lập với trạng thái của renderer: lệnh tạo turn mới vào session đang có
turn hoạt động SHALL bị từ chối. Lượt mới chỉ được bắt đầu khi lượt trước ở `completed`, `cancelled`, `failed`,
`interrupted` hoặc `waiting_user`, trừ lượt do tin chen ngang chưa chèn tự tạo ngay khi lượt trước thành `completed`.

#### Scenario: Gửi lần nữa khi đang dịch
- **WHEN** một turn đang chạy operation dịch và renderer hoặc IPC gửi lệnh tạo turn mới vào cùng session
- **THEN** main từ chối bằng lỗi typed `turn_in_progress`, không tạo turn/operation mới và không tranh chấp target đang ghi

#### Scenario: Soạn draft trong khi chạy
- **WHEN** turn đang chạy và người dùng gõ yêu cầu tiếp theo rồi nhấn Enter
- **THEN** yêu cầu thành tin chen ngang của turn đang chạy, không có turn thứ hai và nút Dừng vẫn hiện

#### Scenario: Tiếp tục sau khi Agent hỏi lại
- **WHEN** turn chuyển `waiting_user` vì target mơ hồ và người dùng gửi câu trả lời làm rõ
- **THEN** cùng turn có thể chuyển lại `running` theo state machine thay vì tạo hai turn chạy đồng thời
