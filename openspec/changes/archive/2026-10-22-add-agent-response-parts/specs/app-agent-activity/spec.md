## MODIFIED Requirements

### Requirement: Một activity timeline thống nhất cho mỗi lượt

Câu trả lời của mỗi lượt SHALL hiển thị như chuỗi phần tử theo đúng thứ tự xảy ra, theo capability `agent-response-parts`: chữ, khối suy nghĩ, dòng tool call, dòng subagent, thẻ duyệt và operation xen kẽ nhau, không gom chữ xuống cuối hay gom tool vào một khối riêng. Mỗi dòng tool call SHALL có icon trạng thái (đang chạy, xong, lỗi, bị bỏ qua) kèm nhãn chữ, câu mô tả thì hiện tại khi đang chạy và thì quá khứ khi xong, và SHALL mở được để xem Đầu vào và Kết quả; nội dung chỉ được tải khi mở lần đầu. Thẻ duyệt và operation của một tool call SHALL nằm ngay sau dòng của call đó. Dòng subagent SHALL hiện "Đang chạy subagent: {mô tả}" rồi "Đã chạy subagent: {mô tả}" với thời gian chạy, mở ra thấy tool con, và tự thu gọn khi xong. Lệnh của người dùng SHALL là bong bóng căn phải, rộng tối đa 90% panel.

#### Scenario: Đọc rồi dịch
- **WHEN** agent resolve chương 2, đọc glossary rồi dịch chương 2
- **THEN** transcript hiện lần lượt dòng resolve, dòng đọc glossary, dòng dịch kèm operation và tiến độ, rồi chữ trả lời cuối; mỗi dòng đổi từ "Đang …" sang "Đã …" khi xong

#### Scenario: Một bước lỗi
- **WHEN** call đọc glossary lỗi nhưng model vẫn trả lời tiếp
- **THEN** dòng đó hiện trạng thái lỗi cùng lý do khi mở, và các phần sau vẫn hiện bình thường

#### Scenario: Xem kết quả tool
- **WHEN** người dùng bấm vào dòng "Đã đọc chương 12"
- **THEN** dòng mở ra phần Đầu vào với tham số và phần Kết quả với kết quả đã lưu

### Requirement: Thinking có preview và trạng thái kết thúc

Khi provider stream reasoning, transcript SHALL hiện khối suy nghĩ tại vị trí của nó trong chuỗi phần tử, cao tối đa 200px và tự cuộn theo nội dung mới khi đang stream. Tiêu đề SHALL là "Đang suy nghĩ" khi đang chạy, hoặc "Đang suy nghĩ: {tiêu đề}" khi reasoning mở đầu bằng một dòng in đậm; sau khi kết thúc SHALL là "Đã suy nghĩ trong {thời lượng}" nếu đo được, nếu không là "Đã suy nghĩ". Khối SHALL thu gọn khi phần tử khác bắt đầu nếu người dùng chưa tự mở, và mở lại được. Reasoning SHALL được lưu để hiện khi xem lại lịch sử. Panel SHALL không tự tạo hoặc mô phỏng reasoning khi provider không gửi.

#### Scenario: Provider stream reasoning
- **WHEN** provider gửi reasoning trong năm giây trước answer
- **THEN** khối hiện "Đang suy nghĩ" khi đang chạy, rồi thu gọn thành "Đã suy nghĩ trong 5 giây" và vẫn mở xem được sau khi mở lại app

#### Scenario: Provider không gửi reasoning
- **WHEN** provider chỉ stream answer hoặc tool call
- **THEN** transcript không tạo khối suy nghĩ; dòng đang làm hiện cho tới khi có phần tử thực tế đầu tiên

### Requirement: Streaming answer ổn định

Renderer SHALL hiện chữ trả lời theo tốc độ từ thay vì đổ cả cục khi nhận delta: số từ hiển thị tăng theo thời gian với tốc độ ước theo tốc độ chữ đến, trong khoảng 40–2000 từ mỗi giây (8 từ mỗi giây khi chưa đo được), và khi stream đã xong SHALL xả phần còn lại với tối thiểu 80 từ mỗi giây. Markdown đã hoàn tất SHALL giữ ổn định; code fence chưa đóng SHALL được tự đóng khi hiển thị và fence rỗng SHALL chưa hiện. Khi stream kết thúc, toàn bộ answer SHALL được parse và hiển thị nhất quán. Khi reduced motion được bật, chữ SHALL hiện ngay không theo tốc độ từ.

#### Scenario: Stream nhiều delta nhỏ
- **WHEN** provider gửi hàng trăm delta trong một giây
- **THEN** chữ xuất hiện đều theo từ, renderer không commit một lần cho mỗi delta và không nhảy cả đoạn một lúc

#### Scenario: Fence chưa đóng
- **WHEN** answer đang stream một code fence chưa có dấu đóng
- **THEN** phần chưa hoàn tất được hiển thị trong khối code đã tự đóng và các block trước không bị dựng lại; khi fence đóng, kết quả được parse đúng

### Requirement: Auto-scroll tôn trọng người đọc

Panel SHALL tự theo cuối khi người dùng đang ở cuối (cách đáy không quá 2px) và nội dung cao lên vì bất kỳ phần tử nào: chữ, suy nghĩ, dòng tool, thẻ duyệt, operation. Khi người dùng cuộn lên để đọc, stream SHALL không kéo vị trí xuống; panel SHALL hiện nút "Về mới nhất", bấm thì cuộn tới cuối và bám lại. Motion SHALL tôn trọng `prefers-reduced-motion`.

#### Scenario: Người dùng đang ở cuối
- **WHEN** một dòng tool mới xuất hiện và panel đang ở cuối
- **THEN** panel cuộn theo để dòng mới hiện ra

#### Scenario: Người dùng cuộn lên
- **WHEN** người dùng cuộn lên trong lúc stream
- **THEN** vị trí đọc giữ nguyên và nút "Về mới nhất" xuất hiện

### Requirement: Operation dài chỉ stream tiến độ và kết quả tóm tắt

Operation dịch hoặc sửa dài SHALL hiện ngay sau dòng tool call tạo ra nó, với target, đơn vị đã hoàn tất trên tổng, trạng thái và lỗi; transcript SHALL NOT lặp toàn bộ văn bản đã ghi vào editor. Khi đang chạy, operation SHALL có nút Dừng. Khi kết thúc, UI SHALL cung cấp Mở đích, Hoàn tác khi hoàn tác được, và Chi tiết.

#### Scenario: Dịch chương hoàn tất
- **WHEN** operation dịch 86 đoạn kết thúc thành công
- **THEN** transcript hiện số đoạn, thời lượng và hành động Mở chương/Hoàn tác ngay sau dòng tool dịch, không hiện lại 86 đoạn dịch

#### Scenario: Hủy operation
- **WHEN** người dùng bấm Dừng trên operation đang chạy
- **THEN** operation chuyển sang đã hủy, ghi số đơn vị đã hoàn tất và vẫn hiện Hoàn tác nếu đã có thay đổi

## ADDED Requirements

### Requirement: Dòng đang làm và chân lượt
Khi turn đang chạy mà không có chữ đang hiện, khối suy nghĩ đang chạy hay tool đang chạy, cuối câu trả lời SHALL có dòng đang làm với nhãn luân phiên ("Đang suy nghĩ", "Đang phân tích", "Đang làm"…), mỗi nhãn hiện tối thiểu 1,2 giây; quá 90 giây SHALL thêm "Lâu hơn bình thường". Khi turn chờ người dùng, dòng SHALL là "Đang chờ bạn trả lời" hoặc "{n} thao tác cần duyệt". Turn đã kết thúc SHALL có chân lượt với Sao chép (chép chữ trả lời), Thử lại (chỉ turn cuối của session, gửi lại cùng instruction và context thành turn mới), model đã dùng và usage provider báo, ghi rõ khi usage chưa đầy đủ. Turn lỗi SHALL hiện khối lỗi với lý do; turn bị dừng SHALL hiện nhãn "Đã dừng" và không hiện khối lỗi.

#### Scenario: Chờ duyệt
- **WHEN** turn có một call cần duyệt
- **THEN** cuối câu trả lời có dòng "1 thao tác cần duyệt" và thẻ duyệt nằm ngay sau dòng tool của call đó

#### Scenario: Thử lại
- **WHEN** người dùng bấm Thử lại ở turn cuối đã lỗi
- **THEN** một turn mới được gửi với cùng instruction và context của turn đó

#### Scenario: Dừng giữa chừng
- **WHEN** người dùng bấm Dừng khi model đang viết
- **THEN** chữ đã nhận được giữ, chân lượt hiện "Đã dừng" và không có khối lỗi
