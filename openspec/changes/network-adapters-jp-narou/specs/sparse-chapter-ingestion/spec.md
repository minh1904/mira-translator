## MODIFIED Requirements

### Requirement: Backend-driven multi-chapter and range download
Hệ thống SHALL cung cấp API tải hàng loạt hoặc theo dải (ví dụ `1, 5, 10-25`) xử lý ở Main process, truy vấn trực tiếp cơ sở dữ liệu `source_catalog_item` độc lập với phân trang hiển thị của giao diện và báo cáo tiến độ tuần tự qua sự kiện IPC. Mỗi bản raw SHALL chỉ có một tác vụ tải đang chạy; tải đơn và tải theo dải SHALL dùng chung khóa theo từng mục catalog để một mục không bao giờ tạo hai chương. Tác vụ SHALL hủy được, giữ các chương đã tải xong, tuân thủ nhịp tải của nguồn và kết thúc bằng bản tổng kết số chương đã tải, bỏ qua, rỗng và lỗi kèm tên chương.

#### Scenario: Nhập dải chương hợp lệ và tải tuần tự
- **WHEN** người dùng nhập dải `10-15` trong công cụ chọn nhanh của danh mục
- **THEN** hệ thống truy vấn các mục catalog tương ứng trong database, lần lượt tải từng chương tuân thủ nhịp tải của nguồn, lưu từng chương vào DB và phát sự kiện tiến độ

#### Scenario: Đóng giao diện trong lúc tải
- **WHEN** người dùng bắt đầu tiến trình tải dải chương rồi đóng modal danh mục hoặc chuyển sang tác phẩm khác
- **THEN** tiến trình tải ở Main process vẫn tiếp tục thực thi an toàn mà không bị hủy lỗi do DOM unmount

#### Scenario: Tải đơn trùng với tải theo dải
- **WHEN** người dùng bấm Tải chương cho chương 12 trong lúc tác vụ dải `10-15` đang chạy
- **THEN** yêu cầu tải đơn bị từ chối vì chương đang được tải và chương 12 chỉ có một chương Mira

#### Scenario: Bắt đầu dải thứ hai khi dải đầu chưa xong
- **WHEN** người dùng bắt đầu dải `20-30` trên cùng bản raw khi dải `10-15` đang chạy
- **THEN** hệ thống từ chối tác vụ thứ hai và báo đang có tác vụ tải

#### Scenario: Người dùng hủy tác vụ
- **WHEN** người dùng bấm Hủy khi tác vụ đã tải 3 trên 6 chương
- **THEN** request đang chạy bị hủy, 3 chương đã tải được giữ, không có chương dở dang và tổng kết ghi trạng thái đã hủy

#### Scenario: Một chương lỗi giữa chừng
- **WHEN** chương thứ 4 trả lỗi parser hoặc trả nội dung rỗng
- **THEN** tác vụ ghi chương đó vào tổng kết là lỗi hoặc rỗng và tiếp tục các chương còn lại

#### Scenario: Nguồn không còn khả dụng
- **WHEN** nguồn vẫn trả 429 hoặc 503 sau khi broker đã hết lượt retry
- **THEN** tác vụ dừng ngay, không thử các chương còn lại và tổng kết báo nguồn tạm thời không truy cập được

#### Scenario: Nguồn có nhịp nghỉ theo đợt
- **WHEN** manifest của nguồn khai báo nghỉ 5 giây sau mỗi 10 chương
- **THEN** tác vụ chờ 5 giây sau chương thứ 10, 20, ... trước khi tải tiếp, ngoài khoảng cách tối thiểu của broker
