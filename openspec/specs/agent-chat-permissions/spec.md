# agent-chat-permissions Specification

## Purpose
Quy định chế độ Ask/Agent, mức quyền của session Trợ lý, cổng rủi ro của Autopilot và duyệt trong phiên, để
người dùng chọn mức tự chủ của agent như trong VS Code mà không vượt được bảng policy.
## Requirements
### Requirement: Chế độ Ask và Agent đi theo turn
Mỗi turn SHALL có chế độ `ask` hoặc `agent`, mặc định `agent`, được lưu khi turn được chấp nhận. Ở `ask`, runtime
SHALL chỉ gửi cho model capability đọc và `resolve_target`, và SHALL từ chối mọi call ghi, tạo task hay điều chỉnh
task dù model vẫn gọi. Mọi vòng của turn, kể cả vòng chạy sau khi người dùng duyệt hoặc trả lời, SHALL dùng chế độ
đã lưu của turn; chế độ trong lệnh tiếp tục SHALL bị bỏ qua.

#### Scenario: Ask không có tool ghi
- **WHEN** người dùng gửi "chương này nói về gì?" ở chế độ Ask
- **THEN** request tới model không chứa capability ghi, tạo task hay điều chỉnh task

#### Scenario: Ask sau khi trả lời câu hỏi
- **WHEN** turn ở chế độ Ask chờ người dùng trả lời `ask_questions`, người dùng trả lời và vòng sau model gọi `translate_chapter`
- **THEN** call bị từ chối, nội dung chương không đổi và request vòng sau vẫn không chứa capability ghi

### Requirement: Mức quyền thuộc session
Mỗi session SHALL có mức quyền `default`, `allow_all` hoặc `autopilot`, lưu trong library DB; session mới SHALL bắt
đầu ở `default`. Đổi mức quyền SHALL là lệnh riêng của session, không đi kèm lệnh gửi lượt. Turn SHALL chụp mức quyền
của session khi được chấp nhận và mọi vòng của turn, kể cả vòng tiếp tục, SHALL dùng mức đã chụp. Snapshot session
SHALL trả mức quyền hiện tại.

#### Scenario: Phiên mới
- **WHEN** người dùng bấm Chat mới sau khi phiên trước ở Autopilot
- **THEN** phiên mới ở mức `default`

#### Scenario: Hạ mức giữa lúc turn đang chờ
- **WHEN** turn được chấp nhận ở `allow_all`, đang chờ câu trả lời, rồi người dùng hạ session về `default` và trả lời
- **THEN** các vòng còn lại của turn đó dùng `allow_all`; turn kế tiếp dùng `default`

### Requirement: Cho phép tất cả tự duyệt
Ở `allow_all`, mọi call mà policy trả `needs_user` SHALL chạy không chờ người dùng; call vẫn được lưu với quyết định
gốc `needs_user` và lý do tự duyệt. Call nhận `deny` SHALL không chạy ở mọi mức quyền.

#### Scenario: Tạo task ở Cho phép tất cả
- **WHEN** model gọi `create_translation_task` trong turn ở `allow_all`
- **THEN** task được tạo không qua thẻ duyệt và tool call ghi đã tự duyệt theo mức quyền

#### Scenario: Deny vẫn là deny
- **WHEN** model gọi `undo_operation` cho operation của session khác ở `allow_all`
- **THEN** call không chạy và model nhận lỗi `denied`

### Requirement: Autopilot bỏ qua call rủi ro cao
Ở `autopilot`, call `needs_user` SHALL được tự duyệt như `allow_all`, trừ call rủi ro cao: tạo task dịch, và ghi có
Undo vào đích không do người dùng nêu theo bảng policy. Call rủi ro cao SHALL không chạy; kết quả SHALL là lỗi có cấu
trúc `autopilot_skipped` kèm lý do và chỉ dẫn không gọi lại nguyên dạng, được lưu và gửi lại model. Call
`ask_questions` SHALL được trả lời bằng đáp án mặc định của từng câu hỏi nếu có, nếu không bằng lựa chọn đầu tiên; kết quả ghi rõ là tự chọn. Phân loại rủi ro SHALL là luật
trong code, không gọi model.

#### Scenario: Ghi vào tác phẩm khác ở Autopilot
- **WHEN** turn ở `autopilot` có ngữ cảnh tác phẩm A và model gọi `translate_chapter` cho chương của tác phẩm B mà instruction không nêu
- **THEN** call không chạy, chương của B không đổi và model nhận lỗi `autopilot_skipped`

#### Scenario: Ghi vào chương đang mở ở Autopilot
- **WHEN** turn ở `autopilot` dịch chương của ngữ cảnh
- **THEN** call chạy như ở `default` vì policy đã `allow`

#### Scenario: Câu hỏi ở Autopilot
- **WHEN** model gọi `ask_questions` với hai lựa chọn trong turn ở `autopilot`
- **THEN** turn không chuyển `waiting_user` và model nhận lựa chọn thứ nhất kèm ghi chú tự chọn

### Requirement: Duyệt trong phiên
Thẻ duyệt SHALL cho ba lựa chọn: cho phép trong phiên này, cho phép một lần, bỏ qua. Cho phép trong phiên này SHALL
duyệt call đang chờ và ghi nhớ capability của nó cho session; call `needs_user` sau đó của cùng capability trong
session SHALL được tự duyệt ở mọi mức quyền và không qua cổng rủi ro Autopilot. Ghi nhớ SHALL không áp dụng cho
session khác và SHALL bị xóa cùng session. Snapshot session SHALL trả danh sách capability đã duyệt trong phiên.

#### Scenario: Duyệt dịch trong phiên
- **WHEN** người dùng chọn Cho phép trong phiên này cho `translate_chapter` vào chương không nêu tên, rồi ở turn sau model lại dịch một chương không nêu tên
- **THEN** call sau chạy không cần duyệt

#### Scenario: Session khác
- **WHEN** người dùng mở Chat mới và model gọi cùng capability vào đích không nêu tên
- **THEN** turn chuyển `waiting_user` với thẻ duyệt

### Requirement: Giao diện chọn chế độ và mức quyền
Thanh dưới ô nhập SHALL có control chọn chế độ (Ask, Agent) và control chọn mức quyền (Mặc định, Cho phép tất cả,
Autopilot), mỗi mục có mô tả ngắn. Chọn Cho phép tất cả hoặc Autopilot SHALL mở hộp xác nhận nêu rủi ro và chi phí,
với Bật, Hủy và lựa chọn Không hỏi lại; Hủy giữ mức cũ. Thẻ duyệt SHALL có nút chính Cho phép trong phiên này, menu kèm
Cho phép một lần, và nút phụ Bỏ qua; Ctrl+Enter SHALL chọn nút chính và Ctrl+Alt+Enter SHALL chọn Bỏ qua khi thẻ có
focus. Mọi control SHALL dùng được bằng bàn phím và có tên cho trình đọc màn hình.

#### Scenario: Bật Autopilot
- **WHEN** người dùng chọn Autopilot lần đầu
- **THEN** hộp xác nhận hiện; Bật đổi mức quyền của session, Hủy giữ mức cũ

#### Scenario: Không hỏi lại
- **WHEN** người dùng tích Không hỏi lại rồi bấm Bật, và sau đó chọn Autopilot ở một phiên khác
- **THEN** mức quyền đổi ngay không qua hộp xác nhận

#### Scenario: Duyệt bằng bàn phím
- **WHEN** thẻ duyệt có focus và người dùng nhấn Ctrl+Enter
- **THEN** call được duyệt trong phiên và turn tiếp tục

