## Purpose

Quy định màn Hoạt động của Mira: một nơi duy nhất để biết app đang làm gì, việc nào cần người dùng xử lý và việc nào đã xong, thay cho hai tab Tác vụ và Nhật ký AI. Màn đọc theo mức khẩn cấp, để việc thành công im lặng và lỗi nổi lên cùng cách xử lý.

## ADDED Requirements

### Requirement: Một màn Hoạt động thay cho hai tab
Mira SHALL có một màn Hoạt động toàn ứng dụng thay màn Tác vụ và tab Nhật ký AI, và mục điều hướng tương ứng SHALL tên là "Hoạt động". Màn SHALL liệt kê các tác vụ dịch bền và các lượt AI của chat, và SHALL NOT có hai tab liệt kê cùng một công việc theo hai cách. Mọi lần chạy AI trước đây chỉ xem được ở tab Nhật ký AI SHALL xem được ở tầng lần chạy AI của màn này.

#### Scenario: Mở màn
- **WHEN** người dùng mở mục Hoạt động
- **THEN** màn hiện bảng các hoạt động theo mức khẩn cấp và không có tab "Nhật ký AI"

#### Scenario: Chưa có hoạt động nào
- **WHEN** chưa có tác vụ hay lượt AI nào
- **THEN** màn hiện trạng thái trống nói rằng nhờ Trợ lý dịch một dải chương thì tác vụ sẽ hiện ở đây

### Requirement: Bảng hoạt động theo mức khẩn cấp
Màn SHALL hiện hoạt động trong một bảng như trang danh sách pipeline, mỗi tác vụ hoặc lượt chat một dòng, với các cột: "Trạng thái" (nhãn chữ kèm thời gian đã chạy và thời điểm xảy ra, ví dụ "5 phút trước", "Hôm qua 21:56"), "Hoạt động" (tên việc, tác phẩm, model), "Tạo bởi" (Trợ lý hoặc Bạn), "Chương" (dải các chương) và cột thao tác. Các dòng SHALL được sắp theo mức khẩn cấp: trước hết các mục cần xử lý (tác vụ lỗi, tác vụ chờ người dùng, tác vụ tạm dừng vì ngân sách hoặc hạn mức, tác vụ xong một phần còn chương lỗi hay chờ, lượt chat lỗi), rồi các mục đang chạy, đang chờ hoặc đang tạm dừng theo yêu cầu người dùng, rồi phần còn lại mới nhất trước. Bảng SHALL có các tab "Tất cả", "Đang chạy", "Cần xử lý", "Đã xong" kèm số lượng của từng tab, và một ô lọc theo tên tác phẩm hoặc model. Bảng SHALL hiện tối đa 25 dòng và có nút "Xem thêm" cho phần còn lại. Một tác vụ SHALL chỉ nằm ở một tab ngoài tab "Tất cả". Khi hẹp, các cột "Tạo bởi" và "Chương" SHALL ẩn trước, theo bề rộng của khung chứa chứ không theo cửa sổ.

#### Scenario: Có việc cần xử lý
- **WHEN** một tác vụ dịch dừng vì hết hạn mức và một tác vụ khác đang chạy
- **THEN** dòng tác vụ dừng đứng trên dòng tác vụ đang chạy, và tab "Cần xử lý" mang số 1

#### Scenario: Chọn tab
- **WHEN** người dùng chọn tab "Đang chạy"
- **THEN** bảng chỉ còn các tác vụ đang chạy, đang chờ hoặc đang tạm dừng theo yêu cầu người dùng

#### Scenario: Lọc theo chữ
- **WHEN** người dùng gõ tên một tác phẩm vào ô lọc
- **THEN** bảng chỉ còn các dòng của tác phẩm đó, không phân biệt hoa thường

#### Scenario: Lịch sử dài
- **WHEN** có 60 hoạt động
- **THEN** bảng hiện 25 dòng đầu và nút "Xem thêm (35)"

#### Scenario: Cửa sổ hẹp
- **WHEN** khung chứa của màn hẹp hơn 760px
- **THEN** cột "Tạo bởi" và "Chương" ẩn, còn trạng thái, tên và thao tác vẫn thấy

### Requirement: Tác vụ hoàn tất không lỗi là một dòng
Một tác vụ `completed` không có chương lỗi, chờ hay bỏ qua SHALL hiện trong bảng bằng đúng một dòng gồm tên việc, tên tác phẩm, trạng thái "Xong" dạng chữ nhạt (không phải nhãn màu xanh), thời gian chạy, thời điểm hoàn tất và dải chương. Dòng SHALL NOT hiện danh sách chương hay lượng token; những thứ đó nằm ở trang chi tiết. Tác vụ có chương lỗi, chờ hoặc bỏ qua SHALL không thu về một dòng như vậy mà hiện số lượng từng loại.

#### Scenario: Task 12 chương hoàn tất
- **WHEN** một tác vụ dịch 12 chương hoàn tất, cả 12 chương xong
- **THEN** bảng hiện một dòng với trạng thái "Xong", không hiện 12 chương và không có nhãn trạng thái màu

#### Scenario: Hoàn tất một phần
- **WHEN** một tác vụ có 11 chương xong và 1 chương lỗi
- **THEN** dòng của nó nói "11/12 chương · 1 lỗi" và thuộc tab "Cần xử lý" chừng nào lỗi chưa được xử lý

### Requirement: Tác vụ đang chạy nói đang làm gì
Mỗi tác vụ đang chạy SHALL hiện trong bảng bằng một dòng có tên, trạng thái bằng chữ, dải chương kèm nhãn chữ "đã xong/tổng chương" và nút thao tác chính. Đầu trang chi tiết của tác vụ đó SHALL hiện thanh tiến độ có nhãn chữ, chương đang dịch cùng thời gian nó đã chạy, thời gian chạy của tác vụ, lượng dùng và các điều khiển hợp lệ với trạng thái (Tạm dừng, Dừng, Tiếp tục, Thử lại). Khi tác vụ đang trích thuật ngữ trước khi dịch, thẻ SHALL nói vậy kèm số lượt gọi. Thẻ SHALL cập nhật khi Main báo đổi mà không cần tải lại. Trạng thái SHALL có nhãn chữ, không chỉ màu.

#### Scenario: Đang dịch chương 9
- **WHEN** tác vụ đang dịch chương thứ 9 trong 12 và trang chi tiết đang mở
- **THEN** đầu trang hiện "8/12 chương" và "Đang dịch chương 9" cùng số giây chương đó đã chạy, còn dòng ở bảng hiện "8/12 chương" và trạng thái

#### Scenario: Cập nhật khi đang mở
- **WHEN** màn đang mở và một chương chuyển sang xong
- **THEN** thanh tiến độ, dòng "đang làm" và dòng ở bảng đổi mà không rời màn, và trình đọc màn hình nghe thông báo đổi trạng thái

### Requirement: Chi tiết tác vụ có bảng chương một dòng
Chi tiết tác vụ SHALL gồm phần tóm tắt (model, thời gian chạy, lượng dùng, chi phí ước tính khi nhà cung cấp có bảng giá, số chương xong, lỗi, bỏ qua) và bảng chương trong đó mỗi chương đúng một dòng với tên chương, số câu đã dịch trên tổng, thời gian chạy lần gần nhất, token và trạng thái. Dòng SHALL chỉ hiện chỉ dẫn khi chương có chỉ dẫn, bằng một dấu nhận biết kèm nội dung khi mở. Dòng SHALL NOT hiện chữ "Không có chỉ dẫn". Hành động của chương (Mở đích, Bỏ qua chương, Bỏ qua đoạn bị từ chối, Xem các lần chạy) SHALL dùng được cho từng dòng khi hợp lệ nhưng SHALL NOT chiếm chỗ thường trực: một dòng chương không có việc cần làm chỉ có tối đa một điểm bấm để mở menu hành động của dòng, các hành động còn lại nằm trong menu đó. Hành động xử lý lỗi của một chương SHALL nằm trong khối lỗi của nó và SHALL NOT lặp lại ở dòng chương. Chương lỗi SHALL hiện lỗi theo yêu cầu `task-error-record`. Cảnh báo chất lượng và điều chỉnh chỉ dẫn SHALL vẫn dùng được từ chi tiết.

#### Scenario: Chương không có chỉ dẫn
- **WHEN** 12 chương của tác vụ đều không có chỉ dẫn
- **THEN** bảng có đúng 12 dòng, không dòng nào mang chữ "Không có chỉ dẫn"

#### Scenario: Mười hai chương hoàn tất
- **WHEN** chi tiết của một tác vụ có 12 chương đã xong
- **THEN** mỗi dòng chương có đúng một điểm bấm hành động, không có hàng nút lặp lại 12 lần

#### Scenario: Chương lỗi không lặp hành động
- **WHEN** chương 17 lỗi và khối lỗi của nó đã có nút "Bỏ qua đoạn bị từ chối"
- **THEN** dòng chương 17 không hiện thêm nút đó lần nữa

#### Scenario: Chương có chỉ dẫn
- **WHEN** chương 5 bị ghim một chỉ dẫn
- **THEN** dòng chương 5 hiện dấu chỉ dẫn và bấm vào thấy nội dung chỉ dẫn

#### Scenario: Provider không báo usage
- **WHEN** nhà cung cấp không báo usage cho một chương
- **THEN** ô token của chương đó hiện "không rõ", không hiện 0

#### Scenario: Chạy lại tất cả
- **WHEN** người dùng chọn chạy lại tất cả chương của một tác vụ đã hoàn tất
- **THEN** app nói chạy lại sẽ ghi đè bản dịch hiện có và chỉ chạy sau khi người dùng xác nhận; chạy lại riêng chương lỗi không cần xác nhận đó

### Requirement: Tầng lần chạy AI dạng danh sách sự kiện
Bấm một chương trong chi tiết SHALL mở danh sách các lần chạy AI của chương đó (mỗi lần chạy là một lượt dịch chương gồm một hoặc nhiều lô), mỗi lần một dòng gồm giờ, model, token vào và ra, thời gian, kết quả và số lô đã xong trên tổng. Lần chạy lỗi SHALL mở rộng được để xem chi tiết kỹ thuật: thông điệp gốc của nhà cung cấp và phần thân phản hồi đã che khóa. Tầng này SHALL chỉ dùng dữ liệu có cấu trúc đã lưu cho lần chạy; nội dung thô của từng lời gọi model (prompt, phản hồi) SHALL NOT hiện ở màn này. Danh sách SHALL lọc được theo mức (tất cả, cảnh báo, lỗi), dùng chữ đơn cách cho giờ và số để các cột thẳng hàng, và chỉ tô màu mức lỗi và cảnh báo, không tô màu kết quả thành công. Mỗi lỗi SHALL có hành động Sao chép chi tiết. Khi đang chạy, danh sách SHALL tự cuộn theo dòng mới nếu người dùng đang ở cuối; khi người dùng cuộn lên SHALL dừng cuộn và hiện chỉ báo có dòng mới. Mọi chi tiết hiển thị SHALL không chứa khóa API hay giá trị header bí mật.

#### Scenario: Xem các lần chạy của chương 9
- **WHEN** người dùng bấm chương 9 có một lần chạy lỗi giới hạn tốc độ rồi chạy lại thành công
- **THEN** danh sách có hai dòng: lần lỗi giới hạn tốc độ và lần thành công, mỗi dòng có giờ, model và token

#### Scenario: Không hiện nội dung thô
- **WHEN** người dùng xem một lần chạy bất kỳ
- **THEN** màn không hiện prompt hay phản hồi gốc của model, chỉ hiện số liệu và lỗi đã che khóa

#### Scenario: Xem chi tiết kỹ thuật
- **WHEN** người dùng mở rộng dòng lỗi
- **THEN** thấy thông điệp gốc và thân phản hồi đã che khóa, và Sao chép chép đúng nội dung đó

#### Scenario: Đang chạy và người dùng cuộn lên
- **WHEN** danh sách đang nhận dòng mới và người dùng cuộn lên đọc
- **THEN** vị trí đọc giữ nguyên và hiện chỉ báo số dòng mới

### Requirement: Lượt chat nằm trong Gần đây, không lẫn với tác vụ
Các lượt AI của chat (ví dụ sửa bản dịch) SHALL hiện trong "Gần đây" thành các dòng riêng được nhãn "Chat", tách khỏi dòng tác vụ, và SHALL chỉ hiện lỗi hoặc kết quả đáng nói, không lặp lại "Hoàn tất" cho mỗi lượt. Lượt chat lỗi SHALL xuất hiện ở khối "Cần xử lý" như tác vụ lỗi.

#### Scenario: Sửa bản dịch bằng chat
- **WHEN** Trợ lý sửa bản dịch chương 1 và xong
- **THEN** "Gần đây" có một dòng nhãn "Chat" với chương và giờ, không có badge "Hoàn tất" xanh

### Requirement: Lọc theo tác phẩm
Ô lọc chữ của bảng SHALL khớp theo tên tác phẩm và tên model (và với lượt chat, theo tên chương). Khu Hoạt động của một tác phẩm SHALL dùng cùng bảng và trang chi tiết nhưng chỉ hiện hoạt động của tác phẩm đó.

#### Scenario: Khu Hoạt động trong tác phẩm
- **WHEN** người dùng mở khu Hoạt động của tác phẩm "Hehe"
- **THEN** bảng chỉ có hoạt động của "Hehe"

#### Scenario: Gõ tên model
- **WHEN** người dùng gõ "flash" vào ô lọc
- **THEN** bảng giữ các dòng có model chứa "flash"

### Requirement: Không dùng màu làm dấu hiệu duy nhất và đúng quy tắc giao diện
Màn SHALL theo `DESIGN.md`: màu semantic chỉ truyền đạt trạng thái và luôn đi kèm nhãn chữ hoặc icon; chỉ dùng thang cỡ chữ, khoảng cách, radius và control đã quy định; không lồng card trong card; ưu tiên một mặt phẳng chia bằng đường kẻ mảnh. Mọi control SHALL dùng được bằng bàn phím với dấu focus nhìn thấy, vùng cập nhật trạng thái SHALL được công bố qua `aria-live`, và animation SHALL dừng khi bật giảm chuyển động. Chuỗi tiếng Việt dài và tên chương CJK SHALL bị cắt có chủ ý, không làm vỡ bố cục, và bố cục SHALL dùng được ở cửa sổ hẹp.

#### Scenario: Giảm chuyển động
- **WHEN** hệ điều hành yêu cầu giảm chuyển động
- **THEN** tác vụ đang chạy vẫn phân biệt được với tác vụ xong bằng chữ và icon tĩnh, không có hiệu ứng lặp

#### Scenario: Tên chương CJK dài ở cửa sổ hẹp
- **WHEN** tên chương dài vượt chiều rộng một dòng
- **THEN** tên bị cắt kèm dấu lược, các cột số và nút hành động không bị đẩy ra ngoài

### Requirement: Khu Hoạt động trong trang tác phẩm
Trang tác phẩm SHALL có khu tên "Hoạt động" (thay tên "Tác vụ"), dùng cùng bảng, trang chi tiết và lỗi như màn toàn app nhưng chỉ của tác phẩm đó. Nhãn của khu SHALL hiện dấu có kèm chữ cho trình đọc màn hình khi tác phẩm có tác vụ đang chạy, và hiện số việc cần xử lý khi có, để người dùng biết mà không phải mở khu. Khi tác phẩm chưa có hoạt động nào, trạng thái trống SHALL có một hành động chính (Dịch các chương…) mở panel Trợ lý với câu lệnh dịch điền sẵn cho tác phẩm đó và SHALL NOT tự gửi. Câu lệnh điền sẵn SHALL được nối sau bản nháp đang có, không ghi đè nó.

#### Scenario: Tác phẩm đang có tác vụ chạy
- **WHEN** tác phẩm có một tác vụ đang chạy và người dùng đang ở khu Chương
- **THEN** nhãn khu Hoạt động có dấu đang chạy, và trình đọc màn hình đọc được "đang chạy"

#### Scenario: Có việc cần xử lý
- **WHEN** tác phẩm có hai chương lỗi chờ người dùng
- **THEN** nhãn khu Hoạt động hiện số 1 hoặc số việc tương ứng, theo đơn vị của khối "Cần xử lý"

#### Scenario: Tác phẩm chưa dịch lần nào
- **WHEN** người dùng mở khu Hoạt động của tác phẩm chưa có tác vụ nào
- **THEN** thấy trạng thái trống có nút "Dịch các chương…"; bấm nút mở panel Trợ lý với câu lệnh dịch tác phẩm đó trong ô soạn và chưa gửi gì

#### Scenario: Đang có bản nháp trong ô soạn
- **WHEN** ô soạn của Trợ lý đang có chữ người dùng đang gõ và họ bấm "Dịch các chương…"
- **THEN** câu lệnh điền sẵn được nối sau chữ đó, chữ cũ không mất

### Requirement: Làm mới màn không làm nặng lúc tác vụ đang chạy
Màn SHALL gộp các sự kiện đổi trạng thái đến liên tiếp thành một lần làm mới trong khoảng ngắn, và SHALL NOT tính lại cảnh báo chất lượng hay đọc lại danh sách lượt chat cho mỗi sự kiện tiến độ. Cảnh báo chất lượng SHALL chỉ được đọc cho tác vụ mà chi tiết đang mở. Mở chi tiết SHALL không chặn các thẻ khác cập nhật.

#### Scenario: Tác vụ báo tiến độ dồn dập
- **WHEN** tác vụ đang chạy phát nhiều sự kiện tiến độ trong một giây
- **THEN** màn làm mới tối đa vài lần trong giây đó, không đọc lại cảnh báo chất lượng của tác vụ có chi tiết đang đóng

#### Scenario: Chi tiết đang mở
- **WHEN** người dùng đang mở chi tiết của một tác vụ đang chạy
- **THEN** bảng chương của tác vụ đó vẫn cập nhật khi chương xong, còn các tác vụ khác không bị tải lại chi tiết

### Requirement: Trang riêng cho từng tác vụ
Bấm tên một tác vụ trong bảng SHALL mở trang chi tiết của tác vụ đó thay cho bảng, với thanh đường dẫn "Hoạt động › Dịch {tác phẩm}"; bấm "Hoạt động" SHALL quay về bảng giữ nguyên tab, ô lọc và đưa tiêu điểm bàn phím về tên tác vụ vừa mở. Trang chi tiết SHALL theo yêu cầu "Chi tiết tác vụ chia mục". Lượt chat không có trang chi tiết.

#### Scenario: Mở một tác vụ
- **WHEN** người dùng bấm tên tác vụ "Dịch 30 chương · Truyện test"
- **THEN** bảng được thay bằng trang chi tiết có đường dẫn "Hoạt động › Dịch Truyện test"

#### Scenario: Quay lại danh sách
- **WHEN** người dùng bấm "Hoạt động" trên đường dẫn
- **THEN** bảng hiện lại ở tab và ô lọc cũ, và tiêu điểm nằm trên tên tác vụ vừa mở

#### Scenario: Tác vụ biến mất khi đang xem
- **WHEN** tác vụ đang mở không còn trong dữ liệu
- **THEN** màn trở về bảng thay vì để trang trống

### Requirement: Độ rộng nội dung theo màn hình phổ biến
Màn Hoạt động toàn ứng dụng SHALL dùng nội dung rộng tối đa 1600px, căn giữa, để bảng có đủ chỗ cho các cột; trang của một tác phẩm SHALL rộng tối đa 1240px. Các màn khác giữ độ rộng hiện có. Đoạn văn xuôi (lý do lỗi, chỉ dẫn, mô tả) SHALL bị khống chế khoảng 68 ký tự một dòng bất kể độ rộng khung, còn bảng và danh sách SHALL dùng hết bề rộng khung của chúng. Bố cục SHALL dùng được ở các độ rộng cửa sổ phổ biến (1280, 1366, 1536, 1920 và 2560px CSS) mà không có thanh cuộn ngang.

#### Scenario: Màn 1920px
- **WHEN** màn Hoạt động mở ở cửa sổ phóng to 1920px
- **THEN** nội dung rộng gần hết vùng còn lại sau thanh bên (tối đa 1600px) và không để khoảng trống lớn hai bên

#### Scenario: Màn 2560px
- **WHEN** màn mở ở cửa sổ 2560px
- **THEN** nội dung dừng ở 1600px và căn giữa

#### Scenario: Văn xuôi dài ở khung rộng
- **WHEN** một lý do lỗi dài hiện trong khung chi tiết rộng 1200px
- **THEN** đoạn chữ ngắt ở khoảng 68 ký tự một dòng chứ không chạy hết 1200px

### Requirement: Chi tiết tác vụ chia mục
Khung chi tiết của một tác vụ SHALL có đầu dính (tên, trạng thái, tiến độ, điều khiển) luôn thấy khi cuộn, và bốn mục chuyển, mỗi lần chỉ hiện một: "Chương", "Cảnh báo", "Cách dịch", "Lần chạy". Nhãn "Cảnh báo" SHALL kèm số cảnh báo đang mở. Mục "Chương" SHALL có bộ lọc nhanh "Tất cả", "Lỗi", "Đang chạy", "Chưa dịch" và SHALL gom các chương xong liên tiếp thành một dòng dạng "Chương 1–7 · xong" mở rộng được. Tác vụ đã lỗi hoặc chờ người dùng SHALL mở sẵn bộ lọc "Lỗi", và chi tiết SHALL có hành động nhảy tới chương lỗi đầu tiên. Danh sách chương dài SHALL cuộn trong khung có chiều cao cố định thay vì kéo dài trang. Mục "Lần chạy" SHALL liệt kê các lần chạy theo yêu cầu "Tầng lần chạy AI", chọn chương bằng bộ chọn thay vì lồng dưới từng dòng chương.

#### Scenario: Tác vụ 30 chương đang chạy
- **WHEN** tác vụ có 7 chương xong, chương 8 đang dịch và 22 chương chưa dịch
- **THEN** mục "Chương" hiện "Chương 1–7 · xong", dòng chương 8 đang dịch và "Chương 9–30 · chưa dịch", không phải 30 dòng riêng

#### Scenario: Tác vụ lỗi
- **WHEN** người dùng chọn một tác vụ có chương lỗi
- **THEN** mục "Chương" mở sẵn bộ lọc "Lỗi", và hành động nhảy tới chương lỗi đầu tiên dùng được

#### Scenario: Cuộn danh sách chương
- **WHEN** người dùng cuộn danh sách chương dài trong khung chi tiết
- **THEN** đầu chi tiết với tên, tiến độ và điều khiển vẫn thấy được

### Requirement: Cảnh báo chất lượng gọn
Mục "Cảnh báo" SHALL chỉ liệt kê chương có cảnh báo đang mở. Các chương chưa có bản dịch để kiểm SHALL được gộp thành đúng một dòng dạng "{n} chương chưa dịch nên chưa kiểm", không mỗi chương một dòng "N/A". Khi không có cảnh báo, mục SHALL nói không có cảnh báo đang mở và SHALL NOT nói bản dịch đúng hoàn toàn.

#### Scenario: 18 chương chưa dịch
- **WHEN** tác vụ có 18 chương chưa có bản dịch và 2 chương có cảnh báo
- **THEN** mục "Cảnh báo" hiện 2 chương có cảnh báo và một dòng "18 chương chưa dịch nên chưa kiểm"

### Requirement: Form điều chỉnh cách dịch dễ hiểu
Mục "Cách dịch" SHALL nói bằng một câu việc này làm gì: đổi chỉ dẫn dịch cho các chương chưa dịch, chương đã dịch giữ nguyên. Mục SHALL hiện chỉ dẫn đang áp dụng, hoặc "Chưa có chỉ dẫn", và form đổi chỉ dẫn SHALL gập mặc định sau một nút "Đổi chỉ dẫn dịch…". Khi mở, form SHALL có ô chọn chương bắt đầu chỉ liệt kê các chương chưa dịch và mặc định là chương kế tiếp, không cho nhập số tay; ô chỉ dẫn SHALL điền sẵn chỉ dẫn hiện tại và nói rõ nội dung này thay hẳn chỉ dẫn cũ, kèm một ví dụ. Nút xác nhận SHALL nêu kết quả ("Áp dụng từ chương 13"); khi chưa dùng được SHALL có dòng nói còn thiếu gì. Sau khi áp dụng, màn SHALL hiện xác nhận chương bắt đầu thực tế và thêm dòng vào lịch sử điều chỉnh. Form SHALL có đường nhờ Trợ lý viết chỉ dẫn. Với tác vụ đã xong hoặc đã hủy, mục SHALL chỉ hiện chỉ dẫn và lịch sử, không có form.

#### Scenario: Mở form
- **WHEN** người dùng bấm "Đổi chỉ dẫn dịch…" ở tác vụ đang chạy dịch chương 8 trong 30
- **THEN** ô chọn chương mặc định là chương 9 và chỉ liệt kê chương 9–30, ô chỉ dẫn có sẵn chỉ dẫn hiện tại

#### Scenario: Chưa nhập gì
- **WHEN** ô chỉ dẫn trống
- **THEN** nút xác nhận mờ và có dòng nói cần nhập chỉ dẫn

#### Scenario: Áp dụng
- **WHEN** người dùng nhập chỉ dẫn mới và bấm "Áp dụng từ chương 9"
- **THEN** màn xác nhận chỉ dẫn áp dụng từ chương 9 và lịch sử điều chỉnh có thêm một dòng

#### Scenario: Tác vụ đã xong
- **WHEN** tác vụ đã hoàn tất
- **THEN** mục "Cách dịch" hiện chỉ dẫn cuối cùng và lịch sử điều chỉnh, không có nút đổi chỉ dẫn
