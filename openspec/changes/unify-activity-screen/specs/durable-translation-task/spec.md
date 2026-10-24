## MODIFIED Requirements

### Requirement: IPC và màn Tác vụ phản ánh trạng thái thật
Hệ thống SHALL cung cấp kênh list, get, create, control task qua preload và phát `agentTaskChanged` tới mọi
cửa sổ sau mỗi chuyển trạng thái hoặc tiến độ. Màn Hoạt động toàn app (thay màn Tác vụ) và khu Tác vụ của tác
phẩm SHALL đọc task thật, refetch khi mount và khi nhận sự kiện, hiển thị model, số item theo trạng thái, item
đang chạy, usage và độ đầy đủ, reason, và chỉ hiện control hợp lệ với trạng thái, theo capability
`activity-screen`. View chi tiết của task SHALL kèm cho mỗi item lần chạy gần nhất: thời điểm bắt đầu và kết thúc,
usage và bản ghi lỗi theo capability `task-error-record`, để màn dựng thời gian và token từng chương mà không
gọi thêm từng operation. Thanh tiến độ SHALL có nhãn chữ và đổi trạng thái SHALL được báo qua vùng `aria-live`.
`Mở đích` SHALL mở đúng chương của item.

#### Scenario: Task 29 trên 30
- **WHEN** 29 item `completed` và một item `failed(provider)`
- **THEN** UI hiện `partially_completed` với chương lỗi, không nói đã dịch xong 30 chương

#### Scenario: Mở đích
- **WHEN** người dùng bấm `Mở đích` trên item chương 12
- **THEN** app mở editor của chương 12 trong tác phẩm của task

#### Scenario: Màn Tác vụ cập nhật khi mở sẵn
- **WHEN** màn Hoạt động đang mở và một item chuyển `completed`
- **THEN** màn hiện tiến độ mới mà không cần rời màn, và trình đọc màn hình nghe thông báo đổi trạng thái

#### Scenario: Chi tiết kèm lần chạy gần nhất
- **WHEN** màn đọc chi tiết của task có item chương 9 đã chạy hai lần
- **THEN** view trả cho item đó thời gian, usage và lỗi (nếu có) của lần chạy gần nhất, không phải của lần đầu
