## ADDED Requirements

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
