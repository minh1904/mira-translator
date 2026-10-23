## MODIFIED Requirements

### Requirement: Task chờ duyệt không giữ tài nguyên
Sau bước trích xuất ngữ cảnh, Mira SHALL lưu các mục trích xuất trực tiếp ở trạng thái có hiệu lực và tiếp tục chạy các item dịch của task mà không dừng lại chuyển sang `waiting_user(context_review)`. Hệ thống SHALL không giữ provider request, write intent hay khóa editor giữa các bước. Hủy task SHALL không xóa các mục ngữ cảnh đã trích xuất.

#### Scenario: Đóng app khi chờ duyệt
- **WHEN** app đóng lúc task đang chạy hoặc tạm dừng rồi mở lại
- **THEN** các mục ngữ cảnh đã trích xuất còn nguyên và task phục hồi theo đúng trạng thái bền

#### Scenario: Không có ứng viên mới
- **WHEN** bước trích không tạo mục mới nào
- **THEN** task chạy item đầu tiên mà không dừng chờ duyệt

#### Scenario: Trích xuất không chặn trong pipeline tự động
- **WHEN** task dịch hoàn tất bước trích xuất và có thuật ngữ hoặc cặp xưng hô mới
- **THEN** các mục mới được lưu vào kho tác phẩm ở trạng thái có hiệu lực và task lập tức bắt đầu chạy dịch item đầu tiên mà không chuyển sang `waiting_user`

### Requirement: Chỉ mục đã duyệt và đúng phạm vi vào prompt
Mira SHALL dựng Context của mỗi item bằng resolver hiện có (`getEffectiveGlossary`, `getEffectiveDyadsForChapter`) qua `takeContextSnapshot`, đưa mọi mục ngữ cảnh có hiệu lực (`approved`, tức không bị `rejected`) và có phạm vi chứa chương của item vào prompt. Mục cấm dùng (`forbidden`) vẫn vào prompt nhưng dưới dạng chỉ dẫn "không dùng bản dịch này". Mira SHALL đưa xưng hô trong lời thoại và đại từ người kể vào prompt như hai chỉ dẫn có nhãn riêng và SHALL không áp phép thay chuỗi nào lên bản dịch. Mira SHALL coi Context đã đổi khi hash bản chụp dựng từ kho khác hash bản chụp đã ghim của item.

#### Scenario: Mục model gọi là không phải thuật ngữ
- **WHEN** bước trích lưu 12 ứng viên, trong đó 2 mục model gọi là `not-a-term` (lưu `rejected`)
- **THEN** bản chụp của item chứa 10 mục còn lại cùng các mục có sẵn, không chứa 2 mục `rejected`

#### Scenario: Mục cấm dùng
- **WHEN** một thuật ngữ được đánh dấu cấm dùng
- **THEN** prompt đưa nó vào nhóm chỉ dẫn cấm dùng, không đưa vào nhóm thuật ngữ phải theo

#### Scenario: Mục ngoài phạm vi
- **WHEN** mục chỉ áp dụng chương 1–10 và item là chương 11
- **THEN** mục không có trong bản chụp của chương 11

#### Scenario: Bố trong lời thoại, ông trong lời kể
- **WHEN** cặp A→B có `recipientPronoun = "bố"` và nhân vật B có `thirdPerson = "ông"`
- **THEN** prompt gửi cả hai, mỗi giá trị kèm nhãn lời thoại hoặc lời kể, và không có phép thay chuỗi nào

#### Scenario: Xóa chương làm mốc phạm vi
- **WHEN** mục có phạm vi tới chương 10 và chương 10 bị xóa
- **THEN** mốc cuối thành không giới hạn nên mục áp cho các chương sau, item đã ghim bản chụp không đổi, còn item bắt đầu sau đó nhận mục

### Requirement: Tab Ngữ cảnh chỉ hiện Context đang áp dụng
Trong màn chương, tab Ngữ cảnh của side panel SHALL hiển thị Context đang áp dụng cho chương hiện tại, dựng bằng cùng hàm với bản chụp dịch, và SHALL chỉ đọc. Màn Từ điển và Xưng hô của tác phẩm SHALL là bảng phẳng hiển thị các mục ngữ cảnh có hiệu lực, không có bộ lọc trạng thái duyệt và không có các nút thao tác duyệt/từ chối.

#### Scenario: Mở duyệt từ activity
- **WHEN** activity báo task đã trích xuất thêm các mục ngữ cảnh và người dùng bấm xem
- **THEN** màn Từ điển của đúng tác phẩm mở ra hiển thị toàn bộ danh sách ngữ cảnh

#### Scenario: Mục bị loại không hiện là đang áp dụng
- **WHEN** một mục ngữ cảnh bị `rejected` hoặc nằm ngoài phạm vi chương hiện tại
- **THEN** tab Ngữ cảnh không liệt kê mục đó, và bảng phẳng của màn Từ điển/Xưng hô cũng ẩn mục `rejected`

### Requirement: Dữ liệu cũ chờ duyệt có hiệu lực
Mira SHALL chuyển mọi mục ngữ cảnh còn `pending` của tác phẩm cũ thành `approved` bằng migration của file tác phẩm, và SHALL giữ nguyên các mục `rejected`. Bước trích SHALL không mở lại mục `rejected`, kể cả khi có trích dẫn từ chương mới. Thuật ngữ do trợ lý chat thêm (`propose_glossary_term`) SHALL có hiệu lực ngay.

#### Scenario: Mở tác phẩm có mục chờ duyệt từ trước
- **WHEN** file tác phẩm ở schema 16 có một mục `pending` và một mục `rejected`
- **THEN** sau migration lên 17, mục `pending` thành `approved` còn mục `rejected` giữ nguyên

#### Scenario: Mục bị loại gặp lại ở chương mới
- **WHEN** bước trích gặp lại nguồn của một mục `rejected` với trích dẫn từ chương mới
- **THEN** mục đó vẫn `rejected` và không vào prompt

## REMOVED Requirements

### Requirement: Lệnh duyệt có guard và duyệt hàng loạt trong một loại
**Reason**: Toàn bộ cơ chế duyệt tiền kiểm (Approve / Reject) và duyệt hàng loạt theo loại đã bị bãi bỏ theo quyết định sản phẩm ngày 2026-10-23 để chuyển sang mô hình từ điển phẳng tự động áp dụng.  
**Migration**: Mọi mục ngữ cảnh mới tạo hoặc trích xuất tự động có hiệu lực ngay; người dùng quản lý chất lượng qua việc sửa trực tiếp, xóa hoặc đánh dấu cấm dùng trong bảng.
