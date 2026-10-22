## Purpose

Quy định thanh tổng hợp các chương agent đã sửa trong một phiên, tương đương danh sách tệp đã đổi của VS Code, để người
dùng xem, giữ hoặc hoàn tác từng chương hay tất cả ở một chỗ.

## ADDED Requirements

### Requirement: Thanh chương đã sửa
Khi session đang mở có operation ghi đã hoàn tất hoặc hoàn tất một phần mà chưa được giữ và chưa bị hoàn tác, phía
trên ô nhập SHALL có thanh "Đã sửa 1 chương" hoặc "Đã sửa {n} chương", bấm để mở danh sách. Mỗi chương SHALL hiện một
dòng với tên chương, tác phẩm, số đơn vị đã đổi, và các nút Xem, Giữ, Hoàn tác; nhiều operation trên cùng chương SHALL
gộp một dòng. Đầu thanh SHALL có Giữ tất cả và Hoàn tác tất cả. Thanh SHALL ẩn khi không còn chương nào. Thanh SHALL
tồn tại qua các lượt và khi mở lại app cho tới khi mọi chương được giữ hoặc hoàn tác.

#### Scenario: Hai lượt sửa hai chương
- **WHEN** lượt 1 dịch chương 3 và lượt 2 sửa chương 4 trong cùng session
- **THEN** thanh hiện "Đã sửa 2 chương" với hai dòng

#### Scenario: Mở lại app
- **WHEN** app mở lại sau lượt sửa chương 3 chưa được giữ
- **THEN** thanh vẫn hiện chương 3

### Requirement: Giữ và hoàn tác
Giữ SHALL đánh dấu các operation của chương đó là đã giữ, lưu bền, và xóa dòng khỏi thanh mà không đổi nội dung chương;
Hoàn tác trong luồng trả lời vẫn dùng được sau khi giữ. Hoàn tác SHALL hoàn tác các operation chưa hoàn tác của chương
đó theo thứ tự ngược; nếu một operation không hoàn tác được vì chương đã đổi sau đó, dòng SHALL ở lại kèm lý do và các
operation chưa chạm tới SHALL giữ nguyên. Xem SHALL mở chương đó. Giữ tất cả và Hoàn tác tất cả SHALL áp dụng cho mọi
dòng.

#### Scenario: Hoàn tác bị xung đột
- **WHEN** người dùng sửa tay chương 3 sau khi agent dịch, rồi bấm Hoàn tác ở dòng chương 3
- **THEN** nội dung chương 3 không đổi, dòng ở lại và hiện lý do xung đột

#### Scenario: Giữ tất cả
- **WHEN** người dùng bấm Giữ tất cả
- **THEN** thanh biến mất và nội dung các chương không đổi
