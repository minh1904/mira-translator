## Purpose

Quy định cách lỗi của tác vụ dịch được ghi thành một bản ghi có cấu trúc và được hiển thị: để người dịch hiểu nguyên nhân và biết làm gì, và để Trợ lý AI đọc cùng dữ kiện đó mà trả lời hay đề xuất cách xử lý, thay vì suy đoán từ một chuỗi lỗi thô.

## ADDED Requirements

### Requirement: Bản ghi lỗi có cấu trúc
Mỗi lỗi của một lần chạy tác vụ dịch (bước trích xuất, một chương, một lô) SHALL được lưu thành bản ghi gồm: `code` (mã ổn định, không phụ thuộc ngôn ngữ), `scope` (`task`, `chapter` hoặc `call`), `what` (một câu tiếng Việt nói chuyện gì đã xảy ra, nêu chương nếu có), `cause` (nguyên nhân đọc được), `retryable` (thử lại không đổi gì có ích không), `retryAfterMs` (chỉ khi nhà cung cấp nói), `tried` (những gì app đã tự làm: số lần thử, đã đổi khóa hay chưa), `options` (các lựa chọn xử lý) và `detail` (thông điệp gốc và phần thân phản hồi đã che khóa). `code` SHALL được suy ra từ loại lỗi của nhà cung cấp (giới hạn tốc độ, mạng, hết thời gian, xác thực, hết hạn mức hoặc tín dụng, nội dung bị chặn, yêu cầu không hợp lệ, phản hồi sai định dạng, bị hủy) và từ lỗi nội bộ (chương chưa có bản gốc, xung đột nội dung, chạm trần ngân sách). Hệ thống SHALL NOT gộp các loại đó về một mã chung "provider". Trường `cause` và `retryAfterMs` SHALL chỉ có khi nhà cung cấp cung cấp bằng chứng, không được đoán. Mọi trường văn bản của bản ghi (`what`, `cause`, `detail`) SHALL được che khóa API và giá trị header bí mật trước khi lưu, vì `what` và `cause` được đưa tới Trợ lý AI và tới ô soạn của chat.

#### Scenario: Khóa nằm trong thông điệp nhà cung cấp
- **WHEN** thông điệp lỗi của nhà cung cấp, dùng làm `cause` của lỗi bị từ chối yêu cầu, có chứa một khóa API
- **THEN** `cause`, `what` và `detail` của bản ghi đều không chứa khóa đó

#### Scenario: Hết hạn mức ngày
- **WHEN** nhà cung cấp trả lỗi hạn mức kèm bằng chứng hạn mức theo ngày khi dịch chương 28
- **THEN** bản ghi có `code` hết hạn mức, `scope` chương, `retryable` là false, `what` nêu chương 28 và `cause` nêu hạn mức theo ngày

#### Scenario: Giới hạn tốc độ có thời gian chờ
- **WHEN** nhà cung cấp báo chờ 30 giây
- **THEN** bản ghi có `code` giới hạn tốc độ, `retryable` là true và `retryAfterMs` là 30000

#### Scenario: Không có bằng chứng thì không đoán
- **WHEN** nhà cung cấp trả lỗi giới hạn tốc độ mà không nêu thời gian chờ
- **THEN** bản ghi không có `retryAfterMs`

#### Scenario: Lỗi không phải của nhà cung cấp
- **WHEN** một chương chưa có bản gốc
- **THEN** bản ghi có `code` thiếu bản gốc, không phải mã của nhà cung cấp

### Requirement: Giữ nguyên nhân qua lô và qua chương
Kết quả của một lượt dịch chương SHALL giữ nguyên nhân thất bại theo từng nhóm: mỗi nhóm gồm loại lỗi, thông điệp và các đoạn bị ảnh hưởng. Hệ thống SHALL NOT chỉ ghi danh sách đoạn lỗi mà bỏ loại lỗi. Khi một chương lỗi vì nhiều loại khác nhau, bản ghi của chương SHALL liệt kê từng loại với số đoạn. Lỗi làm dừng cả tác vụ (xác thực, hết hạn mức) SHALL có `scope` là tác vụ.

#### Scenario: Hai nguyên nhân trong một chương
- **WHEN** một chương có 3 đoạn bị chặn bởi bộ lọc nội dung và 2 đoạn lỗi mạng
- **THEN** bản ghi chương liệt kê hai nhóm: nội dung bị chặn (3 đoạn) và mạng (2 đoạn)

#### Scenario: Lỗi xác thực dừng cả tác vụ
- **WHEN** nhà cung cấp trả lỗi xác thực ở chương 3
- **THEN** bản ghi có `scope` tác vụ, và tác vụ dừng chờ người dùng thay vì tiếp tục thử các chương sau

### Requirement: Mỗi loại lỗi có câu, mức và hành động xác định
Giao diện SHALL tra từ `code` ra một câu tiếng Việt, một mức và danh sách hành động; chuỗi tiếng Việt SHALL NOT được dùng làm khóa để rẽ nhánh. Mức SHALL phân theo ai cần hành động: "cảnh báo" khi app đang tự xử lý (giới hạn tốc độ, mạng, hết thời gian, phản hồi sai định dạng đã thử lại), "lỗi" khi cần người dùng. Lỗi làm dừng cả tác vụ (hết hạn mức, xác thực) SHALL hiện đầu thẻ tác vụ; lỗi một chương SHALL hiện ở chương đó và trong khối "Cần xử lý". Hành động tối thiểu: giới hạn tốc độ và mạng có "Thử ngay"/"Thử lại"; hết hạn mức có "Mở Kết nối AI" và chọn model khác; xác thực có "Mở Kết nối AI"; nội dung bị chặn có "Xem lý do", "Bỏ qua đoạn bị từ chối"; yêu cầu không hợp lệ có hướng giảm cỡ lô hoặc kiểm tra cài đặt model; thiếu bản gốc có mở chương. Mọi lỗi SHALL có nhãn chữ nói rõ loại, không chỉ màu.

#### Scenario: Giới hạn tốc độ sau khi app đã thử lại
- **WHEN** chương 9 thất bại vì giới hạn tốc độ sau khi app đã thử lại, và nhà cung cấp báo chờ 30 giây
- **THEN** hiện mức cảnh báo "Chương 9 chờ hạn mức" kèm thời điểm thử lại được và hành động "Thử ngay", không hiện mức lỗi đỏ

#### Scenario: Lần thử lại đang diễn ra bên trong
- **WHEN** tầng nhà cung cấp đang tự thử lại một lời gọi và chương chưa thất bại
- **THEN** màn không hiện lỗi cho chương đó; chỉ khi chương thất bại thì bản ghi lỗi mới xuất hiện

#### Scenario: Hết hạn mức tài khoản
- **WHEN** tác vụ dừng vì hết hạn mức tài khoản
- **THEN** đầu thẻ tác vụ hiện lỗi nói đã dừng cả tác vụ, đã xong bao nhiêu chương, và hành động "Mở Kết nối AI"

#### Scenario: Nội dung bị chặn một chương
- **WHEN** chương 17 có đoạn bị bộ lọc chặn
- **THEN** dòng chương 17 nêu số đoạn và lý do chặn theo nhóm, kèm "Bỏ qua đoạn bị từ chối", không dừng các chương khác

### Requirement: Gom lỗi trùng nguyên nhân
Khi nhiều chương của cùng một tác vụ lỗi vì cùng `code` và cùng nguyên nhân, giao diện SHALL gom thành một dòng nêu số chương và danh sách chương mở rộng được, kèm thời điểm thử lại chung nếu có, thay vì một dòng đỏ cho mỗi chương. Khi chỉ còn một chương, dòng SHALL nêu thẳng chương đó. Gom SHALL chỉ là cách hiển thị: bản ghi từng chương SHALL vẫn tách riêng.

#### Scenario: 12 chương cùng giới hạn tốc độ
- **WHEN** 12 chương cùng lỗi giới hạn tốc độ và sẽ thử lại lúc 14:05
- **THEN** hiện một dòng "12 chương chờ hạn mức, thử lại lúc 14:05" mở rộng được ra 12 chương

#### Scenario: Hai nguyên nhân khác nhau
- **WHEN** 3 chương lỗi mạng và 1 chương bị chặn nội dung
- **THEN** hiện hai dòng riêng, không gom lỗi mạng với lỗi nội dung

### Requirement: Hỏi Trợ lý AI về một lỗi
Mỗi lỗi hiển thị SHALL có hành động "Hỏi trợ lý AI" đưa nội dung bản ghi lỗi (đã che khóa, không gồm `detail`) vào ô soạn của chat dưới dạng văn bản, nối sau bản nháp đang có chứ không ghi đè nó. Hệ thống SHALL NOT tự gửi tin nhắn và SHALL NOT tự chạy hành động nào thay người dùng. Hành động tốn tiền hoặc đổi model SHALL đi qua cơ chế duyệt của Trợ lý như mọi thao tác ghi khác.

#### Scenario: Hỏi về chương lỗi
- **WHEN** người dùng bấm "Hỏi trợ lý AI" trên lỗi của chương 9
- **THEN** panel Trợ lý mở với nội dung bản ghi lỗi của chương 9 trong ô soạn, và chưa có tin nhắn nào được gửi

#### Scenario: Đang có bản nháp
- **WHEN** ô soạn đang có chữ người dùng gõ dở và họ bấm "Hỏi trợ lý AI" trên một lỗi
- **THEN** nội dung lỗi được nối sau chữ đó, chữ cũ không mất

#### Scenario: Đề xuất đổi model
- **WHEN** Trợ lý đề xuất chuyển sang model khác để xử lý lỗi hết hạn mức
- **THEN** đề xuất hiện thành thẻ cần duyệt và không có thay đổi nào được áp dụng trước khi người dùng duyệt

### Requirement: Agent đọc cùng bản ghi lỗi
Capability đọc tác vụ dịch của Trợ lý SHALL trả, cho mỗi tác vụ và mỗi chương lỗi, cùng bản ghi lỗi mà giao diện hiển thị (`code`, `scope`, `what`, `cause`, `retryable`, `retryAfterMs`, `tried`, `options`), ngoài số chương, trạng thái và chỉ dẫn như hiện nay. Capability SHALL NOT trả `detail` thô chứa thân phản hồi, và kết quả SHALL không chứa khóa API. Trợ lý SHALL trả lời câu hỏi về nguyên nhân dựa trên bản ghi này và SHALL nói rõ khi bản ghi không đủ để kết luận, thay vì đoán.

#### Scenario: Người dịch hỏi sao chương 9 lỗi
- **WHEN** người dùng hỏi "sao chương 9 lỗi?" và chương 9 có bản ghi lỗi giới hạn tốc độ
- **THEN** Trợ lý đọc bản ghi và trả lời nguyên nhân, việc app đã thử, và các lựa chọn, đúng với `cause`, `tried` và `options` của bản ghi

#### Scenario: Chương lỗi không có nguyên nhân rõ
- **WHEN** một chương lỗi mà bản ghi chỉ có `code` phản hồi sai định dạng và không có `cause`
- **THEN** Trợ lý nói rõ không biết nguyên nhân sâu hơn và đề xuất thử lại, không bịa nguyên nhân

### Requirement: Lỗi cũ vẫn hiển thị được
Lỗi đã lưu trước thay đổi này chỉ có `code` và `message` thô. Hệ thống SHALL hiển thị chúng với nhãn "Lỗi không rõ loại" kèm thông điệp gốc, SHALL NOT suy ngược loại lỗi từ chuỗi thông điệp, và SHALL NOT ghi lại hay migrate dữ liệu cũ.

#### Scenario: Lỗi lưu từ trước
- **WHEN** một lần chạy cũ có lỗi `{ code: 'provider', message: '...' }`
- **THEN** màn hiện "Lỗi không rõ loại" cùng thông điệp, hành động chỉ gồm "Thử lại" và "Hỏi trợ lý AI"
