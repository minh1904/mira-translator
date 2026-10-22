## ADDED Requirements

### Requirement: Chỉ sang tác phẩm khác khi người dùng nêu rõ
Khi snapshot của turn có tác phẩm đang mở, runtime SHALL coi đó là tác phẩm của lệnh. `resolve_target` với mô tả khớp
tác phẩm đang mở SHALL trả handle của nó mà không hỏi. Khi mô tả khớp cả tác phẩm đang mở và tác phẩm khác, kết quả
SHALL là `ambiguous` để người dùng chọn, không tự chọn tác phẩm khác. Tác phẩm khác chỉ được resolve thẳng khi mô tả
khớp duy nhất tác phẩm đó.

#### Scenario: Lệnh không nêu tác phẩm
- **WHEN** người dùng đang mở "New" và gửi "dịch toàn bộ truyện"
- **THEN** model nhận handle `ctx` của "New" trong snapshot và không cần gọi `list_works` hay `resolve_target` để biết
  tác phẩm

#### Scenario: Nêu rõ tác phẩm khác
- **WHEN** người dùng đang mở "New" và gửi "dịch chương 1 của ádasd"
- **THEN** `resolve_target("ádasd")` trả `resolved` với handle của "ádasd"

#### Scenario: Mô tả khớp hai tác phẩm
- **WHEN** người dùng đang mở "Kiếm Đạo" và mô tả "Kiếm" khớp cả "Kiếm Đạo" và "Kiếm Thần"
- **THEN** `resolve_target` trả `ambiguous` với hai ứng viên và turn chờ người dùng chọn

### Requirement: Lượt không có phản hồi được báo rõ
Khi turn kết thúc mà không có phần tử chữ trả lời khác rỗng và không có thao tác ghi nào thành công, runtime SHALL
thêm một phần tử thông báo tiến trình "Lượt kết thúc mà không có phản hồi" vào cuối chuỗi phần tử của turn trước khi
turn kết thúc. Transcript SHALL hiện thông báo đó kèm nút **Tiếp tục** ở turn mới nhất của phiên; bấm Tiếp tục SHALL
gửi một lượt mới trong cùng phiên với lệnh "Tiếp tục" và cùng chế độ, mức quyền, ngữ cảnh của turn đó. Trạng thái
turn và câu trả lời đã lưu dùng làm lịch sử SHALL không đổi.

#### Scenario: Hết vòng không có chữ
- **WHEN** vòng cuối không tool trả về chuỗi rỗng sau năm vòng chỉ đọc
- **THEN** transcript hiện "Lượt kết thúc mà không có phản hồi" và nút Tiếp tục

#### Scenario: Có thao tác ghi
- **WHEN** turn đã dịch xong một chương nhưng vòng cuối không có chữ
- **THEN** không có thông báo lượt rỗng

#### Scenario: Bấm Tiếp tục
- **WHEN** người dùng bấm Tiếp tục ở thông báo lượt rỗng
- **THEN** một turn mới với lệnh "Tiếp tục" được gửi trong cùng phiên với cùng chế độ và mức quyền

#### Scenario: Mở lại app
- **WHEN** app mở lại sau một lượt rỗng
- **THEN** thông báo vẫn hiện ở đúng vị trí trong transcript

## MODIFIED Requirements

### Requirement: Context được chụp tại lúc gửi
Composer SHALL hiện chip cho mọi ngữ cảnh sẽ gửi theo capability `agent-composer`: tác phẩm đang mở khi chip còn bật, chương đang mở khi đã thêm, vùng chọn, và các đính kèm người dùng thêm bằng nút +; chip gợi ý mờ không được gửi. Main SHALL lưu snapshot context gồm đúng các chip được gửi khi chấp nhận turn; navigation sau đó SHALL không đổi context của turn. Main SHALL cấp một handle cho mỗi tác phẩm hoặc chương trong snapshot (`ctx` cho chương chính nếu có, nếu không thì cho tác phẩm đang mở; `ctx2`, `ctx3`… cho đính kèm khác) và SHALL đưa nội dung của mục glossary và cặp xưng hô đính kèm vào prompt của turn; mục không còn ở trạng thái đã duyệt SHALL bị bỏ kèm ghi chú cho model.

#### Scenario: Đổi chương sau khi gửi
- **WHEN** người dùng gửi yêu cầu với chip chương A rồi chuyển UI sang chương B
- **THEN** tool call của turn vẫn dùng chương A và Mở đích quay về A

#### Scenario: Bỏ context chip
- **WHEN** người dùng bỏ chip chương rồi gửi câu hỏi, chip tác phẩm còn bật
- **THEN** snapshot của turn chứa tác phẩm nhưng không chứa chương đó, model không nhận handle của chương đó và mọi
  tool cần chương phải qua `resolve_target`

#### Scenario: Hai chương đính kèm
- **WHEN** người dùng gửi "so sánh xưng hô hai chương" với chip chương 3 và chương 5
- **THEN** model nhận hai handle `ctx` và `ctx2` ứng với chương 3 và chương 5

#### Scenario: Chỉ có tác phẩm
- **WHEN** người dùng ở chế độ Agent, chip chương mờ, gửi "dịch toàn bộ truyện"
- **THEN** model nhận handle `ctx` trỏ tới tác phẩm đang mở
