## Purpose

Cho người dùng khai báo thể loại, bối cảnh và văn hóa gốc của một tác phẩm bằng giao diện có cấu trúc, lưu theo
tác phẩm để bảng gợi ý xưng hô được chọn đúng ngay cả khi truyện chỉ có tên.

## ADDED Requirements

### Requirement: Thể loại bằng chip
Form tạo và sửa tác phẩm SHALL cho chọn thể loại bằng các chip chọn nhiều, mỗi chip một lần, thay cho ô gõ tự do.
Các chip SHALL thuộc các nhóm: bối cảnh (như Tiên Hiệp, Võ Hiệp, Huyền Huyễn, Đô Thị, Lịch Sử, Fantasy, Isekai,
LitRPG, Hệ Thống, Tận Thế), chế độ kể (như Xuyên Không), kiểu quan hệ (như Ngôn Tình, Đam Mỹ, Bách Hợp, Harem)
và nội dung (như 18+). Chỉ chip bối cảnh SHALL tác động tới việc chọn bảng xưng hô; chip chế độ kể như Xuyên
Không SHALL không được suy thành bối cảnh. Tác phẩm đã có thể loại gõ tự do SHALL vẫn hiển thị và sửa được, và
không bị mất khi mở form.

#### Scenario: Chọn chip bối cảnh
- **WHEN** người dùng chọn chip Fantasy và Isekai khi tạo tác phẩm
- **THEN** thể loại của tác phẩm gồm hai chip đó và việc chọn bảng xưng hô thấy bối cảnh `fantasy`

#### Scenario: Chip không phải bối cảnh
- **WHEN** người dùng chọn chip Ngôn Tình và 18+
- **THEN** các chip được lưu vào thể loại nhưng không đổi bảng xưng hô được chọn

#### Scenario: Xuyên Không không phải bối cảnh
- **WHEN** thể loại chỉ có chip Xuyên Không
- **THEN** hệ thống không suy ra bối cảnh nào từ chip này

#### Scenario: Thể loại tự do đã có
- **WHEN** người dùng mở sửa một tác phẩm cũ có thể loại gõ tự do không khớp chip nào
- **THEN** giá trị cũ vẫn hiện trong form và được lưu lại nguyên khi người dùng không sửa

### Requirement: Bối cảnh và văn hóa lưu theo tác phẩm
Mỗi tác phẩm SHALL lưu một bối cảnh chính, danh sách bối cảnh phụ (có thể rỗng) và văn hóa gốc riêng, mỗi giá
trị có thể chưa chọn. Form SHALL cho người dùng chọn bối cảnh chính, chọn thêm bối cảnh phụ và chọn văn hóa,
kèm lựa chọn "Tự suy" (chưa chọn) và "Không dùng bảng"; bối cảnh phụ SHALL không chọn được khi chưa có bối cảnh
chính. Khi chưa chọn văn hóa, hệ thống SHALL lấy văn hóa mặc định theo ngôn ngữ nguồn của tác phẩm trừ tiếng Anh,
vì văn bản tiếng Anh có thể mang văn hóa bất kỳ; khi chưa chọn bối cảnh, SHALL suy từ chip bối cảnh khi chúng
không mâu thuẫn nhau. Các giá trị này SHALL thuộc dữ liệu của tác phẩm và đi theo sao lưu và xuất nhập tác phẩm;
mở tác phẩm lưu trước thay đổi này SHALL cho các giá trị này là chưa chọn mà không mất dữ liệu khác.

#### Scenario: Truyện Nhật dịch từ bản Anh
- **WHEN** người dùng đặt ngôn ngữ nguồn tiếng Anh và chọn văn hóa Nhật cho tác phẩm
- **THEN** văn hóa Nhật được lưu, và lần dịch sau dùng bảng và quy ước kính ngữ của văn hóa Nhật

#### Scenario: Tiếng Anh chưa chọn văn hóa
- **WHEN** tác phẩm có ngôn ngữ nguồn tiếng Anh và người dùng chưa chọn văn hóa
- **THEN** hệ thống không suy ra văn hóa nào và chỉ dùng dòng chung của bối cảnh nếu có bối cảnh

#### Scenario: Tác phẩm cũ
- **WHEN** mở một tác phẩm được lưu trước khi có các giá trị này
- **THEN** bối cảnh chính, bối cảnh phụ và văn hóa là chưa chọn, và hệ thống suy như quy định ở thứ tự chọn bảng

#### Scenario: Chip bối cảnh mâu thuẫn
- **WHEN** thể loại có cả chip Đô Thị và Fantasy và người dùng chưa chọn bối cảnh
- **THEN** hệ thống không suy ra bối cảnh nào từ chip, và form gợi ý người dùng chọn bối cảnh chính

#### Scenario: Thêm bối cảnh phụ
- **WHEN** người dùng chọn bối cảnh chính `court` và thêm bối cảnh phụ `cultivation`
- **THEN** cả hai được lưu và lần dịch sau ghép bảng từ hai bối cảnh theo thứ tự chính rồi phụ

#### Scenario: Bối cảnh phụ khi chưa có chính
- **WHEN** người dùng chưa chọn bối cảnh chính
- **THEN** form không cho chọn bối cảnh phụ

#### Scenario: Đặt ngoài danh sách
- **WHEN** một yêu cầu cập nhật tác phẩm gửi bối cảnh hoặc văn hóa không thuộc danh sách hỗ trợ
- **THEN** yêu cầu bị từ chối và giá trị đã lưu không đổi

### Requirement: Đổi lựa chọn giữa lượt dịch
Đổi bối cảnh hoặc văn hóa của tác phẩm SHALL không làm đổi các lượt dịch đang chạy bằng bản chụp ngữ cảnh đã khóa.
Các lô sau của lượt đó SHALL tiếp tục dùng bảng trong bản chụp, và người dùng SHALL được báo ngữ cảnh đã đổi
kèm gợi ý lập kế hoạch lại.

#### Scenario: Đổi bối cảnh khi đang dịch
- **WHEN** người dùng đổi bối cảnh từ `modern` sang `fantasy` trong lúc một lượt dịch đang chạy
- **THEN** các lô còn lại của lượt đó vẫn dùng bảng `modern`, và giao diện báo ngữ cảnh đã đổi
