# agent-checkpoints Specification

## Purpose
Quy định checkpoint trước mỗi lệnh và sửa lệnh cũ theo VS Code: quay session và các chương agent đã sửa về trạng thái
trước một lệnh, rồi gửi lại lệnh đó hoặc bản đã sửa.
## Requirements
### Requirement: Khôi phục checkpoint
Phía trên mỗi lệnh của session SHALL có hành động "Khôi phục checkpoint" (lệnh đầu: "Bắt đầu lại"), hiện khi hover hoặc
focus và bị khóa khi session có turn đang chạy. Khôi phục về lệnh K SHALL: kiểm tra trước mọi operation ghi chưa hoàn tác
của K và các lượt sau có hoàn tác được không; nếu có operation không hoàn tác được thì từ chối toàn bộ, không đổi gì và
nêu chương bị xung đột; nếu được thì hủy turn đang chờ (nếu có), hoàn tác các operation đó theo thứ tự ngược, đánh dấu K
và các lượt sau là đã khôi phục, và đặt instruction cùng chip của K vào ô nhập. Lượt đã khôi phục SHALL không hiện trong
transcript và SHALL không vào lịch sử gửi model, nhưng vẫn lưu trong library DB. Task dịch bền do các lượt đó tạo SHALL
không bị hủy; hộp xác nhận SHALL nói rõ điều này. Không có hành động Làm lại.

#### Scenario: Khôi phục về lượt 2
- **WHEN** session có ba lượt, lượt 2 và 3 đều dịch một chương, người dùng xác nhận Khôi phục checkpoint ở lượt 2
- **THEN** hai chương trở về nội dung trước lượt 2, transcript chỉ còn lượt 1, ô nhập chứa lệnh của lượt 2

#### Scenario: Xung đột khi khôi phục
- **WHEN** người dùng đã sửa tay chương mà lượt 3 dịch, rồi khôi phục về lượt 2
- **THEN** không operation nào bị hoàn tác, không lượt nào bị ẩn và thông báo nêu chương xung đột

#### Scenario: Lịch sử model
- **WHEN** người dùng gửi lệnh mới sau khi khôi phục về lượt 2
- **THEN** request tới model chỉ có lượt 1 trong lịch sử

### Requirement: Sửa lệnh cũ
Bấm vào bong bóng lệnh, hoặc Enter/Space khi bong bóng có focus, SHALL thay bong bóng bằng ô nhập tại chỗ chứa
instruction và chip của lệnh đó; Esc SHALL hủy sửa. Gửi SHALL khôi phục checkpoint của lệnh đó theo yêu cầu trên rồi gửi
nội dung đã sửa thành lượt mới. Nếu các lượt bị khôi phục có operation ghi chưa hoàn tác, hộp xác nhận SHALL hỏi "Hoàn tác
thay đổi ở {n} chương?" với Có, Hủy và Không hỏi lại. Sửa lệnh SHALL bị khóa khi session có turn đang chạy.

#### Scenario: Sửa lệnh cuối không có thay đổi
- **WHEN** người dùng sửa lệnh cuối, vốn chỉ hỏi đáp, và gửi
- **THEN** lượt cũ bị ẩn, lượt mới chạy với nội dung đã sửa, không có hộp xác nhận

#### Scenario: Hủy sửa
- **WHEN** người dùng mở sửa tại chỗ rồi nhấn Esc
- **THEN** bong bóng trở lại như cũ và không có gì thay đổi

