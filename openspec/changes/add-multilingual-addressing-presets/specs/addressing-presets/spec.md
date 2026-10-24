## Purpose

Định nghĩa bảng gợi ý xưng hô theo hai trục bối cảnh và văn hóa gốc, cách ghép và chọn bảng cho một tác phẩm, để
một truyện dùng đúng bảng bất kể ngôn ngữ văn bản và để thêm ngôn ngữ hay văn hóa mới chỉ cần thêm dữ liệu.

## ADDED Requirements

### Requirement: Bảng gợi ý theo hai trục
Bảng gợi ý xưng hô SHALL được định nghĩa theo hai trục độc lập: bối cảnh (`modern`, `fantasy`, `court`,
`cultivation`, `game`) và văn hóa gốc (`ja`, `ko`, `zh`, `west`). Văn hóa gốc là văn hóa của câu chuyện, SHALL
không bị suy mặc định từ ngôn ngữ văn bản khi người dùng hoặc thể loại đã cho biết khác. Một tác phẩm SHALL có
một bối cảnh chính và có thể có thêm các bối cảnh phụ. Bảng đưa vào prompt SHALL gồm các dòng chung của từng bối
cảnh, ghép theo thứ tự bối cảnh chính rồi các bối cảnh phụ, cùng các dòng riêng của văn hóa đã chọn cho từng bối
cảnh đó. Khi hai dòng có cùng quan hệ, dòng riêng của văn hóa SHALL thắng dòng chung, và dòng của bối cảnh chính
SHALL thắng dòng của bối cảnh phụ. Mỗi dòng SHALL có quan hệ, tín hiệu nhận biết, cặp xưng hô chiều đi, chiều về
khi khác và ghi chú; mỗi ô cặp xưng hô SHALL chứa một cặp, không chứa hai lựa chọn.

#### Scenario: Truyện Nhật đọc từ bản tiếng Anh
- **WHEN** tác phẩm có ngôn ngữ nguồn tiếng Anh, bối cảnh `modern` và văn hóa `ja`
- **THEN** bảng trong prompt gồm các dòng chung của `modern` và các dòng riêng của văn hóa Nhật, không có dòng riêng của phương Tây

#### Scenario: Tổ hợp mới không cần bảng riêng
- **WHEN** tác phẩm chọn bối cảnh `modern` và văn hóa `ko` mà trước đó không có bảng nào đặt tên cho tổ hợp này
- **THEN** hệ thống ghép được bảng từ dòng chung và dòng riêng, không báo lỗi

#### Scenario: Văn hóa không có dòng riêng cho bối cảnh
- **WHEN** tác phẩm chọn bối cảnh `cultivation` và văn hóa `west`, văn hóa này không có dòng riêng cho bối cảnh đó
- **THEN** bảng chỉ gồm các dòng chung của `cultivation`, và hệ thống không dựng thêm dòng nào khác

#### Scenario: Truyện có hai bối cảnh
- **WHEN** tác phẩm có bối cảnh chính `court` và bối cảnh phụ `cultivation`, cả hai đều có dòng cho quan hệ "phu thê"
- **THEN** bảng ghép có một dòng "phu thê" lấy từ `court`, và các dòng chỉ có ở `cultivation` (như sư môn) vẫn có mặt

### Requirement: Mở rộng thêm ngôn ngữ và văn hóa
Thêm một văn hóa gốc hoặc một bối cảnh mới SHALL chỉ cần thêm dữ liệu bảng và tín hiệu nhận diện, không đổi
cách chọn và ghép bảng. Dòng chung SHALL được viết một lần cho một bối cảnh và dùng cho mọi văn hóa; hệ thống
SHALL không yêu cầu chép lại dòng chung cho từng văn hóa.

#### Scenario: Thêm văn hóa mới
- **WHEN** một văn hóa mới được thêm với dòng riêng cho bối cảnh `modern`
- **THEN** tác phẩm chọn văn hóa đó nhận bảng gồm dòng chung `modern` và dòng riêng mới mà không phải sửa chỗ khác

### Requirement: Thứ tự chọn bảng cho tác phẩm
Với mỗi tác phẩm, hệ thống SHALL quyết định bối cảnh và văn hóa theo thứ tự ưu tiên: mã tổ hợp viết trực tiếp
trong thể loại (ví dụ `[ja-modern]`), lựa chọn đã lưu của người dùng, suy từ chip thể loại bối cảnh và ngôn ngữ
nguồn, cuối cùng là không có bảng. Mã tổ hợp cũ trong thể loại SHALL vẫn được đọc và hiểu là một cặp bối cảnh
và văn hóa. Khi không có tín hiệu nào, hệ thống SHALL không gửi bảng cặp xưng hô nhưng vẫn gửi dòng hướng dẫn cách
suy xưng hô (từ tuổi, quan hệ, mức trang trọng, tước vị); điều này SHALL áp dụng cho mọi ngôn ngữ nguồn, kể cả
tiếng Anh. Người dùng SHALL có thể chọn rõ "không dùng bảng", và lựa chọn đó SHALL thắng việc suy.

#### Scenario: Tác phẩm chỉ có tên
- **WHEN** tác phẩm không có chip thể loại bối cảnh, không có lựa chọn của người dùng và ngôn ngữ nguồn là tiếng Anh
- **THEN** prompt dịch không chứa bảng cặp xưng hô, vẫn chứa dòng hướng dẫn cách suy, và quy ước ngôn ngữ chung vẫn được gửi

#### Scenario: Lựa chọn của người dùng thắng suy
- **WHEN** thể loại có chip `Fantasy` nhưng người dùng đã chọn bối cảnh `court`
- **THEN** bảng dùng bối cảnh `court`

#### Scenario: Mã cũ trong thể loại
- **WHEN** thể loại ghi `[ja-fantasy]`
- **THEN** hệ thống hiểu đó là bối cảnh `fantasy` với văn hóa `ja`, và mã này thắng cả lựa chọn đã lưu

#### Scenario: Tắt bảng
- **WHEN** người dùng chọn "không dùng bảng" cho tác phẩm có chip bối cảnh
- **THEN** prompt dịch không chứa bảng cặp xưng hô và vẫn chứa dòng hướng dẫn cách suy

### Requirement: Cặp đã duyệt thắng bảng
Cặp xưng hô đã duyệt của tác phẩm SHALL luôn thắng bảng gợi ý; prompt SHALL ghi rõ bảng chỉ dùng cho các cặp
nhân vật chưa có cặp đã duyệt. Cặp chưa duyệt SHALL không vào prompt.

#### Scenario: Có cặp đã duyệt
- **WHEN** hai nhân vật có cặp xưng hô đã duyệt khác với dòng của bảng cho cùng quan hệ
- **THEN** model được dặn dùng cặp đã duyệt và chỉ dùng bảng cho cặp chưa có

### Requirement: Cặp chỉ áp khi thẻ nhân vật cho phép
Một dòng của bảng có điều kiện dựa vào thẻ nhân vật (như tuổi, vai, giới tính của người nói) SHALL ghi rõ điều
kiện đó trong ghi chú, và model SHALL không được dặn dùng cặp của dòng đó khi thẻ nhân vật không cho biết điều
kiện. Cặp mặc định của quan hệ hầu hoặc người khế ước với chủ trong bối cảnh `fantasy` SHALL không đặt "em" làm
cặp mặc định; "em" chỉ áp khi thẻ nhân vật cho biết người nói là thiếu nữ nhỏ tuổi gắn bó với chủ.

#### Scenario: Hầu gái không có thông tin trên thẻ
- **WHEN** chương có hầu gái nói với tiểu thư và thẻ nhân vật của hầu gái không ghi tuổi hay mức gắn bó
- **THEN** cặp gợi ý trong prompt là "tôi – tiểu thư", không có "em"

#### Scenario: Thẻ cho biết điều kiện
- **WHEN** thẻ nhân vật ghi hầu gái là thiếu nữ nhỏ tuổi rất gắn bó với tiểu thư
- **THEN** ghi chú của dòng cho phép "em – tiểu thư" cho nhân vật đó

### Requirement: Quy ước kính ngữ theo văn hóa gốc
Quy ước kính ngữ và xưng hô trong profile ngôn ngữ của prompt SHALL theo văn hóa gốc của tác phẩm, không theo
ngôn ngữ văn bản. Chính sách hậu tố và kính ngữ của tác phẩm SHALL áp cho mọi văn hóa có hậu tố hay danh xưng
kính ngữ, gồm cả văn hóa Hàn, chứ không chỉ văn hóa Nhật. Với văn hóa Hàn, hậu tố gắn sau tên (`-ssi`) SHALL được
Việt hóa theo mặc định, và `오빠`, `형`, `선배` SHALL dịch theo vai (em – anh/chị, tiền bối khi gọi trống) trừ khi
chính sách giữ hậu tố của tác phẩm yêu cầu giữ nguyên. Hậu tố và danh xưng của văn hóa gốc còn lại trong bản dịch
tiếng Anh (như `-san`, `senpai`, `oppa`, `shixiong`) SHALL được xử lý theo cùng chính sách đó.

#### Scenario: Bản Anh của truyện Nhật
- **WHEN** văn bản tiếng Anh giữ `-san` và `-sama` và tác phẩm có văn hóa `ja`
- **THEN** prompt dùng quy ước kính ngữ của văn hóa Nhật thay cho quy ước của tiếng Anh

#### Scenario: Truyện Hàn mặc định
- **WHEN** tác phẩm có văn hóa `ko` và chính sách giữ hậu tố chưa được bật
- **THEN** `-ssi` được Việt hóa và `오빠` của nữ gọi nam hơn tuổi được dịch thành cặp "em – anh"

#### Scenario: Truyện Hàn giữ hậu tố
- **WHEN** tác phẩm có văn hóa `ko` và chính sách giữ hậu tố được bật
- **THEN** prompt dặn giữ nguyên `oppa`, `hyung`, `sunbae` theo chính sách đó

### Requirement: Bảng đưa vào system prompt giữ nguyên giữa các lô
Với cùng một tác phẩm và cùng một lựa chọn, bảng ghép SHALL cho ra cùng một văn bản ở mọi lô để system prompt
giữ nguyên và dùng lại được; đổi bối cảnh hoặc văn hóa SHALL đổi văn bản này.

#### Scenario: Hai lô cùng tác phẩm
- **WHEN** hai lô của cùng một lượt dịch dựng system prompt
- **THEN** phần bảng trong hai system prompt giống hệt nhau
