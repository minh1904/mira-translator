## Purpose

Quy định ô nhập của Trợ lý theo VS Code: chip ngữ cảnh phía trên chỗ gõ, ngữ cảnh gợi ý hiện mờ cho tới khi được
thêm, nút + mở picker thêm ngữ cảnh, thanh công cụ và phím tắt, để người dùng luôn thấy và quyết định ngữ cảnh gửi đi.

## ADDED Requirements

### Requirement: Hàng ngữ cảnh phía trên chỗ gõ
Khung ô nhập SHALL có hàng chip ngữ cảnh nằm trên chỗ gõ, xuống dòng khi chật, và SHALL ẩn khi không có chip nào.
Chip gợi ý SHALL đứng trước chip thường. Mọi chip trong hàng SHALL phản ánh đúng thứ sẽ được gửi: chip thường và chip
vùng chọn được gửi, chip gợi ý mờ không được gửi.

#### Scenario: Không có ngữ cảnh
- **WHEN** người dùng mở Trợ lý từ Trang chủ và chưa thêm gì
- **THEN** không có hàng chip và lượt gửi đi có ngữ cảnh rỗng

#### Scenario: Chip hiện đúng thứ được gửi
- **WHEN** hàng chip có một chip thường "Chương 12" và người dùng gửi
- **THEN** ngữ cảnh của lượt chứa đúng chương 12

### Requirement: Chương đang mở là ngữ cảnh gợi ý
Khi đang ở màn chương, chương đang mở SHALL hiện thành chip gợi ý. Ở chế độ Ask, chip gợi ý SHALL ở trạng thái đã
thêm. Ở chế độ Agent, chip gợi ý SHALL hiện mờ: viền nét đứt, nhãn nghiêng, nút + bên trái với tên "Thêm {chương} vào
ngữ cảnh"; hover SHALL làm viền liền. Bấm vào bất kỳ đâu trên chip mờ, hoặc Enter/Space khi chip có focus, SHALL biến
nó thành chip thường và đưa focus về ô nhập. Chip gợi ý đã thêm SHALL có nút X để tắt. Chuyển sang chương khác SHALL
đổi chip gợi ý theo chương mới mà không xóa các chip thường đã thêm.

#### Scenario: Agent không gửi chương mờ
- **WHEN** ở chế độ Agent, chip chương đang mở còn mờ, không có vùng chọn, người dùng gửi "dịch chương này"
- **THEN** ngữ cảnh của lượt không có chương và không có handle `ctx`

#### Scenario: Bấm chip mờ
- **WHEN** người dùng bấm chip mờ "Chương 12" rồi gửi
- **THEN** chip thành chip thường và ngữ cảnh của lượt chứa chương 12

#### Scenario: Ask thêm sẵn
- **WHEN** người dùng chuyển sang Ask ở màn chương 12
- **THEN** chip chương 12 ở trạng thái đã thêm, không mờ

### Requirement: Vùng chọn luôn được gửi
Khi có vùng chọn đoạn, hàng chip SHALL có chip vùng chọn ("Đoạn 3–5 bản gốc") không bao giờ mờ, và lượt SHALL gửi vùng
chọn cùng chương chứa nó dù chip chương đang mờ. Chip vùng chọn SHALL có nút ghim; ghim SHALL thêm một chip thường giữ
chương và khoảng đoạn đó, không đổi khi vùng chọn trên editor đổi.

#### Scenario: Chọn đoạn ở Agent
- **WHEN** chip chương mờ, người dùng chọn đoạn 3–5 bản gốc rồi gửi
- **THEN** ngữ cảnh của lượt chứa chương và vùng chọn đoạn 3–5 bản gốc

#### Scenario: Ghim vùng chọn
- **WHEN** người dùng ghim vùng chọn đoạn 3–5 rồi chọn đoạn 9 và gửi
- **THEN** ngữ cảnh chứa đính kèm đoạn 3–5 và vùng chọn đoạn 9

### Requirement: Thêm ngữ cảnh bằng nút +
Nút + "Thêm ngữ cảnh" SHALL đứng đầu thanh dưới ô nhập và mở được bằng Ctrl+/. Nút SHALL mở picker phía trên nó, có ô
tìm và các nhóm: tác phẩm, chương (ưu tiên tác phẩm đang mở), mục glossary đã duyệt, cặp xưng hô đã duyệt; mục chờ
duyệt SHALL không xuất hiện. Bấm nút lần nữa hoặc Esc SHALL đóng picker. Chọn một mục SHALL thêm chip thường và đưa
focus về ô nhập. Mục đã có chip SHALL không thêm lần hai. Tối đa 10 chip thường; khi đủ, picker SHALL báo và không thêm.

#### Scenario: Thêm chương khác
- **WHEN** người dùng đang ở chương 12, bấm +, gõ "13" và chọn "Chương 13"
- **THEN** hàng chip có chip thường "Chương 13" và focus ở ô nhập

#### Scenario: Thêm mục glossary
- **WHEN** người dùng thêm mục glossary "Lâm Động" đã duyệt rồi gửi
- **THEN** lượt mang đính kèm mục đó và model nhận nội dung mục trong prompt của lượt

#### Scenario: Mục chờ duyệt
- **WHEN** người dùng tìm một thuật ngữ còn chờ duyệt
- **THEN** picker không hiện mục đó

### Requirement: Chip thường
Chip thường SHALL có nút X bên trái tên "Bỏ khỏi ngữ cảnh", icon theo loại và nhãn. Backspace hoặc Delete khi chip có
focus SHALL xóa chip. Bấm vào chip SHALL mở đích: chương mở màn chương, tác phẩm mở trang tác phẩm, mục glossary hoặc
xưng hô mở khu Ngữ cảnh của tác phẩm tại mục đó.

#### Scenario: Xóa bằng bàn phím
- **WHEN** chip "Chương 13" có focus và người dùng nhấn Backspace
- **THEN** chip bị xóa và lượt kế tiếp không chứa chương 13

### Requirement: Thanh công cụ, placeholder và phím
Thanh dưới chỗ gõ SHALL theo thứ tự: + · chọn chế độ · chọn model · Gửi; khi lượt đang chạy, nút Gửi SHALL đổi tại
chỗ thành Dừng. Thanh SHALL co giãn sao cho Gửi/Dừng luôn hiện. Placeholder SHALL theo chế độ: Ask "Hỏi về truyện,
chương hoặc bản dịch", Agent "Mô tả việc cần làm". Enter SHALL gửi, Shift+Enter xuống dòng. Mũi tên Lên khi con trỏ ở
đầu ô SHALL hiện lệnh trước trong session, Mũi tên Xuống khi con trỏ ở cuối ô SHALL hiện lệnh sau; lệnh hiện ra SHALL
khôi phục cả chữ và chip thường của lệnh đó, và bản nháp đang gõ SHALL được trả lại khi đi hết lịch sử.

#### Scenario: Lịch sử lệnh
- **WHEN** ô nhập có bản nháp "abc", người dùng đưa con trỏ về đầu và nhấn Lên
- **THEN** ô hiện lệnh trước cùng chip của nó; nhấn Xuống tới cuối lịch sử thì ô hiện lại "abc"

#### Scenario: Panel hẹp
- **WHEN** side panel thu hẹp tới mức không đủ chỗ cho mọi control
- **THEN** control chọn model co lại trước và nút Gửi vẫn hiện đủ
