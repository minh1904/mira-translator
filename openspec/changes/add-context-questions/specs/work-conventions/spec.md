## Purpose

Quy định các quy ước dịch ở mức tác phẩm mà người dịch chốt một lần, cách Mira hỏi khi chưa chốt, và cách quy ước
đi vào prompt trích, prompt dịch và dữ liệu đã có.

## ADDED Requirements

### Requirement: Quy ước của tác phẩm
Mỗi tác phẩm SHALL lưu ba quy ước. Mỗi quy ước có giá trị mặc định khi chưa chốt:

| Quy ước | Giá trị | Mặc định |
| --- | --- | --- |
| Kiểu phiên âm tên Nhật | Hepburn có dấu (Ryōta) · Hepburn không dấu (Ryota) · kiểu `ou` (Ryouta) | Hepburn không dấu |
| Kính ngữ | Giữ hậu tố Nhật (Akira-san) · Việt hóa | Giữ hậu tố Nhật |
| Khi sửa sai đụng chương đã dịch | Chỉ liệt kê · Hỏi có dịch lại không | Chỉ liệt kê |

Mira SHALL phân biệt "đã chốt" với "đang dùng mặc định". Màn cài đặt tác phẩm SHALL cho xem và sửa ba quy ước.

#### Scenario: Tác phẩm mới
- **WHEN** người dùng tạo một tác phẩm tiếng Nhật
- **THEN** ba quy ước dùng mặc định và đều ở trạng thái chưa chốt

### Requirement: Hỏi quy ước một lần trước task đầu tiên
Khi người dùng yêu cầu trong chat dịch một tác phẩm có quy ước chưa chốt, model SHALL hỏi các quy ước chưa chốt bằng
một lần `ask_questions`, với mặc định là giá trị mặc định, trước khi tạo task. Sau đó các quy ước SHALL được lưu là
đã chốt. Quy ước kiểu phiên âm SHALL chỉ được hỏi với tác phẩm tiếng Nhật. Người dùng bỏ qua câu hỏi thì Mira SHALL
lưu mặc định là đã chốt, để không hỏi lại. Ở mức quyền Autopilot, model SHALL không hỏi, và Mira SHALL dùng mặc định
mà không đánh dấu là đã chốt.

#### Scenario: Lần đầu dịch tác phẩm
- **WHEN** người dùng nhắn "dịch chương 1–30" cho tác phẩm tiếng Nhật chưa chốt quy ước nào
- **THEN** model hỏi ba quy ước trong một thẻ câu hỏi, lưu đáp án, rồi tạo task

#### Scenario: Lần thứ hai
- **WHEN** quy ước đã chốt và người dùng yêu cầu dịch tiếp
- **THEN** model tạo task mà không hỏi quy ước

### Requirement: Quy ước đi vào prompt
Prompt phân loại của bước trích SHALL dùng kiểu phiên âm của tác phẩm trong chính sách đặt tên tên người Nhật. Prompt
dịch SHALL dùng quy ước kính ngữ của tác phẩm thay cho mặc định của profile ngôn ngữ. Đổi quy ước SHALL không đổi
bản chụp mà một item đã ghim.

#### Scenario: Việt hóa kính ngữ
- **WHEN** tác phẩm có quy ước kính ngữ "Việt hóa" và chương 3 có "アキラさん"
- **THEN** prompt dịch chương 3 chỉ dẫn Việt hóa hậu tố, không giữ "-san"

### Requirement: Phiên lại tên khi đổi kiểu phiên âm
Khi kiểu phiên âm của tác phẩm tiếng Nhật đổi, Mira SHALL phiên lại bằng bảng kana → romaji bản dịch của mọi mục tên
người thỏa đủ ba điều:
- có cách đọc;
- chưa được người dùng sửa tay;
- bản dịch hiện tại khớp đúng cách phiên cũ từ cùng cách đọc.

Mỗi mục được phiên lại SHALL có lịch sử với nguồn là code. Mục không thỏa các điều kiện trên SHALL giữ nguyên. Sau
khi phiên lại, Mira SHALL trả số mục đã đổi và số mục bị bỏ qua.

#### Scenario: Có dấu sang không dấu
- **WHEN** mục 涼太 có cách đọc "りょうた", bản dịch "Ryōta", và quy ước đổi sang Hepburn không dấu
- **THEN** bản dịch thành "Ryota" và lịch sử ghi nguồn code

#### Scenario: Mục người dùng đã sửa
- **WHEN** người dùng đã sửa mục thành "Ryouta-kun" và quy ước đổi
- **THEN** mục giữ nguyên và được tính vào số mục bị bỏ qua
