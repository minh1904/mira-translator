## ADDED Requirements

### Requirement: Tác phẩm đang mở luôn là ngữ cảnh
Khi đang ở màn tác phẩm hoặc màn chương, hàng chip SHALL có một chip tác phẩm đang mở ở trạng thái đã thêm, ở cả chế
độ Ask và Agent, đứng trước mọi chip khác. Chip tác phẩm SHALL không bao giờ mờ và SHALL có nút X để tắt cho lượt kế
tiếp. Lượt gửi đi SHALL chứa tác phẩm đang mở khi chip này còn bật, kể cả khi chip chương đang mờ. Tắt chip tác phẩm
SHALL chỉ áp dụng cho tác phẩm đó trong phiên hiện tại; mở tác phẩm khác SHALL hiện chip của tác phẩm mới ở trạng
thái đã thêm. Khi người dùng đã đính kèm chính tác phẩm đó bằng nút +, SHALL chỉ có một chip cho nó.

#### Scenario: Agent ở màn chương, chưa bấm chip chương
- **WHEN** ở chế độ Agent, người dùng đang mở chương 1 của "New", chip chương còn mờ, và gửi "dịch toàn bộ truyện"
- **THEN** ngữ cảnh của lượt chứa tác phẩm "New" và không chứa chương 1

#### Scenario: Tắt chip tác phẩm
- **WHEN** người dùng bấm X trên chip "New" rồi gửi câu hỏi
- **THEN** ngữ cảnh của lượt không chứa tác phẩm nào và chip "New" vẫn tắt ở lượt sau trong cùng phiên

#### Scenario: Chuyển sang tác phẩm khác
- **WHEN** người dùng đã tắt chip "New" rồi mở tác phẩm "B"
- **THEN** hàng chip có chip "B" ở trạng thái đã thêm

#### Scenario: Trang chủ
- **WHEN** người dùng mở Trợ lý từ Trang chủ, không có tác phẩm nào đang mở
- **THEN** không có chip tác phẩm và ngữ cảnh của lượt không có tác phẩm

## MODIFIED Requirements

### Requirement: Hàng ngữ cảnh phía trên chỗ gõ
Khung ô nhập SHALL có hàng chip ngữ cảnh nằm trên chỗ gõ, xuống dòng khi chật, và SHALL ẩn khi không có chip nào.
Chip tác phẩm đang mở SHALL đứng đầu, chip gợi ý SHALL đứng trước chip thường. Mọi chip trong hàng SHALL phản ánh
đúng thứ sẽ được gửi: chip tác phẩm đang mở khi còn bật, chip thường và chip vùng chọn được gửi; chip gợi ý mờ không
được gửi.

#### Scenario: Không có ngữ cảnh
- **WHEN** người dùng mở Trợ lý từ Trang chủ và chưa thêm gì
- **THEN** không có hàng chip và lượt gửi đi có ngữ cảnh rỗng

#### Scenario: Chip hiện đúng thứ được gửi
- **WHEN** hàng chip có chip tác phẩm "New" và một chip thường "Chương 12" và người dùng gửi
- **THEN** ngữ cảnh của lượt chứa đúng tác phẩm "New" và chương 12

### Requirement: Chương đang mở là ngữ cảnh gợi ý
Khi đang ở màn chương, chương đang mở SHALL hiện thành chip gợi ý. Ở chế độ Ask, chip gợi ý SHALL ở trạng thái đã
thêm. Ở chế độ Agent, chip gợi ý SHALL hiện mờ: viền nét đứt, nhãn nghiêng, nút + bên trái với tên "Thêm {chương} vào
ngữ cảnh"; hover SHALL làm viền liền. Bấm vào bất kỳ đâu trên chip mờ, hoặc Enter/Space khi chip có focus, SHALL biến
nó thành chip thường và đưa focus về ô nhập. Chip gợi ý đã thêm SHALL có nút X để tắt. Chuyển sang chương khác SHALL
đổi chip gợi ý theo chương mới mà không xóa các chip thường đã thêm. Chip chương mờ SHALL không ảnh hưởng tới chip
tác phẩm đang mở: tác phẩm vẫn được gửi.

#### Scenario: Agent không gửi chương mờ
- **WHEN** ở chế độ Agent, chip chương đang mở còn mờ, chip tác phẩm còn bật, không có vùng chọn, người dùng gửi "dịch
  chương này"
- **THEN** ngữ cảnh của lượt có tác phẩm nhưng không có chương, và handle `ctx` trỏ tới tác phẩm

#### Scenario: Bấm chip mờ
- **WHEN** người dùng bấm chip mờ "Chương 12" rồi gửi
- **THEN** chip thành chip thường và ngữ cảnh của lượt chứa chương 12

#### Scenario: Ask thêm sẵn
- **WHEN** người dùng chuyển sang Ask ở màn chương 12
- **THEN** chip chương 12 ở trạng thái đã thêm, không mờ
