## Purpose

Quy định cách Mira đẩy lời gọi model song song mà không bị nhà cung cấp chặn: số lời gọi đồng thời của một mục
model tự tăng khi chạy êm, tự giảm và tạm ngừng khi bị giới hạn tốc độ, và lượt chat của người dùng không phải
xếp hàng sau tác vụ nền.

## ADDED Requirements

### Requirement: Khởi động chậm và tăng dần
Mỗi mục model SHALL có một mức đồng thời hiện hành, bắt đầu từ một lời gọi khi app khởi động. Sau mỗi chuỗi
lời gọi thành công liên tiếp đủ ngưỡng, mức hiện hành SHALL tăng thêm một, không vượt trần đồng thời của mục
(giá trị người dùng đặt, hoặc mặc định của gateway). Lời gọi vượt mức hiện hành SHALL xếp hàng như vượt trần.
Giới hạn RPM người dùng đặt SHALL vẫn áp dụng độc lập.

#### Scenario: Tác vụ mới bắt đầu
- **WHEN** app vừa mở, trần của mục model là 4, và một tác vụ có 10 chương sẵn sàng chạy
- **THEN** chỉ một lời gọi được gửi trước, và số lời gọi đồng thời tăng từng bước một khi các lời gọi thành công

#### Scenario: Không vượt trần
- **WHEN** mức hiện hành đã bằng trần 4 và các lời gọi tiếp tục thành công
- **THEN** không bao giờ có quá bốn lời gọi của mục đó đang chạy

### Requirement: Giảm tốc khi bị giới hạn tốc độ
Khi một lời gọi của mục model nhận lỗi giới hạn tốc độ, mức hiện hành SHALL giảm một nửa (làm tròn xuống, tối
thiểu một), và mục SHALL ngừng **bắt đầu** lời gọi mới trong khoảng chờ: bằng thời gian nhà cung cấp báo nếu có,
nếu không thì một khoảng ngắn có dao động ngẫu nhiên, tăng dần khi giới hạn lặp lại liên tiếp và có trần. Lời gọi
đang chạy SHALL không bị hủy. Nhiều lỗi giới hạn tốc độ đến trong cùng một khoảng chờ SHALL chỉ giảm mức một lần.
Hệ thống SHALL không tự thử lại vô hạn: lời gọi bị giới hạn vẫn theo quy tắc đổi khóa và thử lại sẵn có. Lỗi hết
hạn mức hoặc tín dụng và lỗi xác thực SHALL không làm giảm mức đồng thời; chúng do quy tắc đóng băng khóa xử lý.

#### Scenario: Ba lời gọi cùng bị 429
- **WHEN** mức hiện hành là 4 và ba lời gọi đang chạy cùng nhận lỗi giới hạn tốc độ không kèm thời gian chờ
- **THEN** mức giảm còn 2 đúng một lần, và không lời gọi mới nào của mục bắt đầu trước khi khoảng chờ kết thúc

#### Scenario: Nhà cung cấp báo thời gian chờ
- **WHEN** lỗi giới hạn tốc độ báo chờ 20 giây
- **THEN** mục không bắt đầu lời gọi mới trong 20 giây

#### Scenario: Hồi phục sau khi chạy êm lại
- **WHEN** sau khoảng chờ các lời gọi lại thành công liên tiếp
- **THEN** mức hiện hành tăng dần trở lại tới trần

#### Scenario: Hết hạn mức tài khoản
- **WHEN** một lời gọi nhận lỗi hết hạn mức
- **THEN** mức đồng thời không đổi và khóa được xử lý theo quy tắc đóng băng hiện có

### Requirement: Lượt chat đi trước tác vụ nền
Khi lượt chat của người dùng và lời gọi của tác vụ dịch cùng chờ suất của một mục model, lượt chat SHALL được
cấp suất kế tiếp. Lời gọi của tác vụ SHALL vẫn theo thứ tự đến giữa chúng với nhau. Hủy một lượt đang chờ SHALL bỏ
nó khỏi hàng mà không gửi.

#### Scenario: Chat khi tác vụ chiếm hết suất
- **WHEN** bốn lời gọi của tác vụ đang chạy, ba lời gọi tác vụ khác đang chờ, và người dùng gửi một lượt chat cùng
  mục model
- **THEN** khi một suất trống, lượt chat được gửi trước ba lời gọi đang chờ của tác vụ
