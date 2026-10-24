## MODIFIED Requirements

### Requirement: Chụp ngữ cảnh một lần khi lập kế hoạch

Khi lập kế hoạch một lượt dịch chương, hệ thống SHALL chụp ngữ cảnh tác phẩm đã duyệt áp cho chương đó:
glossary hiệu lực (gồm alias, ghi chú, mục cấm), cặp xưng hô hiệu lực, nhân vật đã duyệt và bối cảnh cùng văn hóa
gốc đã quyết cho tác phẩm (hoặc không có khi không quyết được). Khi lượt dịch thuộc một item của task dịch bền và
item có instruction từ steering, bản chụp SHALL chứa toàn văn instruction đã vật chất hóa cho item đó; lượt dịch
không có instruction SHALL cho bản chụp giống hệt trước khi có trường này. Bản chụp SHALL được lưu bền trong dữ
liệu của tác phẩm, gắn với định danh lượt dịch, và SHALL không đổi sau khi tạo. Mọi lời gọi model của lượt SHALL
đưa instruction trong bản chụp vào prompt; thay đổi bộ dựng prompt để làm việc này SHALL đi kèm phiên bản prompt
mới. Kế hoạch trả về SHALL cho biết bản chụp gồm bao nhiêu mục mỗi loại. Bản chụp lưu trước khi bối cảnh và văn
hóa được tách SHALL vẫn đọc được và dựng lại đúng request đã gửi, mà không cần ghi đè hay đổi hash đã lưu.
Item của task dịch bền là một lượt dịch: bản chụp SHALL được tạo khi item bắt đầu chạy lần đầu và mọi lần
chạy sau của item SHALL dùng lại bản chụp đó. Việc dọn bản chụp mồ côi SHALL không xóa bản chụp còn được
một đề xuất hoặc một item của task tham chiếu.

#### Scenario: Lập kế hoạch tạo bản chụp
- **WHEN** người dùng lập kế hoạch dịch một chương có glossary, cặp xưng hô và nhân vật đã duyệt
- **THEN** hệ thống lưu một bản chụp gắn với lượt dịch, và kế hoạch hiện số mục glossary, cặp xưng hô và nhân vật trong bản chụp

#### Scenario: Mục chưa duyệt không vào bản chụp
- **WHEN** chương có mục glossary đang chờ duyệt
- **THEN** bản chụp không chứa mục đó

#### Scenario: Bản chụp của item task không bị dọn
- **WHEN** bản chụp của một item task đã cũ hơn hạn dọn bản chụp mồ côi và không có đề xuất nào trỏ tới
- **THEN** lần dọn bản chụp mồ côi kế tiếp giữ nguyên bản chụp đó, và Retry item vẫn dùng được nó

#### Scenario: Item của task có instruction
- **WHEN** item chương 8 của task pin bản chụp trong lúc có steering instruction áp từ chương 8
- **THEN** bản chụp chứa toàn văn instruction đó, request gửi model chứa instruction, và trace ghi phiên bản prompt mới

#### Scenario: Lượt dịch không có instruction
- **WHEN** người dùng lập kế hoạch dịch chương ngoài task
- **THEN** bản chụp không có instruction và hash bản chụp bằng hash của cùng ngữ cảnh trước khi có trường này

#### Scenario: Bản chụp ghi bối cảnh và văn hóa
- **WHEN** tác phẩm có bối cảnh chính `fantasy`, bối cảnh phụ `game` và văn hóa `ja` khi lập kế hoạch
- **THEN** bản chụp ghi bối cảnh chính, bối cảnh phụ và văn hóa đó, và mọi lô của lượt dùng bảng ghép từ chính các giá trị này

#### Scenario: Bản chụp trước thay đổi này
- **WHEN** người dùng dựng lại request của một lô từ bản chụp lưu trước khi bối cảnh và văn hóa được tách
- **THEN** hệ thống dựng được request từ bản chụp đó, và hash đã lưu của bản chụp không bị ghi lại
