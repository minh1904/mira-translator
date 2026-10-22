## MODIFIED Requirements

### Requirement: Session toàn ứng dụng và lịch sử bền
Mira SHALL cho tạo và tiếp tục session Trợ lý từ Trang chủ, Thư viện hoặc màn chương, đọc từ cùng library DB. Đổi màn, đóng panel hay mở tác phẩm khác SHALL không tạo lịch sử thứ hai. Một session MAY chứa turn liên quan nhiều tác phẩm; mỗi turn SHALL giữ context snapshot riêng. Dữ liệu chat legacy SHALL vẫn đọc được trong luồng legacy.

#### Scenario: Chat trước khi mở truyện
- **WHEN** người dùng tạo chat ở Trang chủ rồi mở một chương và gửi tiếp trong cùng session
- **THEN** session vẫn giữ các turn trước và turn mới nhận context của chương

#### Scenario: Mở lại ứng dụng
- **WHEN** app mở lại sau các turn đã kết thúc
- **THEN** danh sách session và transcript, gồm chuỗi phần tử câu trả lời, tool call, suy nghĩ và operation của từng turn, được đọc từ library DB theo thứ tự ổn định

### Requirement: Mọi cửa sổ thấy turn qua event và snapshot
Main SHALL phát event của turn tới mọi cửa sổ đang mở. Snapshot session SHALL gồm turn, chuỗi phần tử câu trả lời, tool call, activity, operation và pending action. Renderer SHALL upsert turn, phần tử, tool call, activity và operation theo ID, chỉ thay bản có `updatedAt` mới hơn, và SHALL đọc lại snapshot khi nhận event terminal hoặc event của turn chưa có trong store. Answer delta SHALL chỉ là bản trình bày tạm; phần tử đã lưu thắng sau khi đọc lại.

#### Scenario: Mất event sau khi operation commit
- **WHEN** renderer bỏ lỡ event sau khi operation commit nhưng trước terminal
- **THEN** renderer đọc lại snapshot, hiện operation và kết quả từ DB và không gọi lại capability

#### Scenario: Hai cửa sổ
- **WHEN** turn được gửi từ cửa sổ thứ nhất trong khi cửa sổ thứ hai đang mở cùng session
- **THEN** cả hai cửa sổ hiện cùng chuỗi phần tử, dòng tool và câu trả lời cuối

### Requirement: Giao diện chat dùng chung state và truy cập được
Màn Trợ lý SHALL có Chat mới, danh sách session bật/tắt được, transcript, composer và Mở đích. Side panel màn chương SHALL chỉ chứa chat Trợ lý, dùng cùng agent store và cùng component transcript và composer với màn Trợ lý; header có tiêu đề session, lịch sử, Chat mới và Đóng. Draft SHALL được giữ theo session trong renderer. Auto-scroll SHALL không kéo người dùng đang đọc lịch sử. Mọi thao tác SHALL dùng được bằng bàn phím, và trạng thái streaming, chờ người dùng và lỗi SHALL có nhãn cho trình đọc màn hình.

#### Scenario: Đổi bề mặt
- **WHEN** người dùng viết draft ở panel chương rồi mở màn Trợ lý cùng session
- **THEN** draft và transcript vẫn còn và không gì được gửi tự động

#### Scenario: Người dùng đang đọc lịch sử
- **WHEN** token mới đến trong lúc viewport không ở cuối
- **THEN** scroll không bị cưỡng bức và có nút về nội dung mới

#### Scenario: Chỉ dùng bàn phím và trình đọc màn hình
- **WHEN** người dùng chỉ dùng bàn phím để gửi, mở một dòng tool, duyệt một call và bấm Stop
- **THEN** mọi control nhận focus theo thứ tự đọc, dòng tool và lựa chọn được kích hoạt bằng Enter hoặc Space, và vùng live thông báo đang trả lời, đang chờ người dùng hoặc lỗi
