## MODIFIED Requirements

### Requirement: Turn chờ người dùng và continuation ràng buộc đúng call
Khi một tool call nhận `needs_user` mà mức quyền và danh sách duyệt trong phiên không tự duyệt nó, hoặc `resolve_target` trả `ambiguous`, runtime SHALL giữ call đó ở `pending` và chuyển turn sang `waiting_user`. Turn `waiting_user` SHALL chỉ chuyển sang `running`, `cancelled` hoặc `expired`. Câu trả lời SHALL gửi kèm `continuesTurnId`, ID của tool call và digest tham số của nó; runtime SHALL chỉ chạy hoặc hoàn tất đúng call `pending` có digest khớp, rồi đánh giá lại policy trước khi chạy. Duyệt một lần (`approve`) SHALL không áp dụng cho call khác, kể cả cùng tên tool. Duyệt trong phiên (`approve_session`) SHALL duyệt đúng call đó và ghi nhớ capability cho session theo capability `agent-chat-permissions`. Vòng tiếp tục SHALL dùng chế độ và mức quyền đã lưu của turn, không dùng giá trị trong lệnh tiếp tục. Stop trên turn `waiting_user` SHALL chuyển nó sang `cancelled`. Turn `waiting_user` SHALL vẫn chờ sau khi app mở lại.

#### Scenario: Chọn một trong hai tác phẩm
- **WHEN** người dùng chọn một ứng viên cho turn đang chờ với ID và digest hợp lệ
- **THEN** cùng turn tiếp tục với handle đã chọn, không tạo turn mới hay operation trùng

#### Scenario: Duyệt rồi model đổi tham số
- **WHEN** người dùng duyệt một lần một call ghi và vòng sau model gọi lại cùng tool với tham số khác
- **THEN** call mới được đánh giá policy riêng và không dùng lại lần duyệt trước

#### Scenario: Duyệt trong phiên rồi model gọi lại
- **WHEN** người dùng duyệt trong phiên một call ghi và vòng sau model gọi lại cùng tool vào đích khác không do người dùng nêu
- **THEN** call mới được đánh giá policy, nhận `needs_user` và được tự duyệt theo danh sách duyệt trong phiên

#### Scenario: Câu trả lời cho turn đã hết hạn
- **WHEN** client gửi continuation cho turn không còn `waiting_user` hoặc với digest không khớp
- **THEN** runtime từ chối continuation cũ và không chạy hành động nào

#### Scenario: Dừng turn đang chờ
- **WHEN** người dùng bấm Stop trên turn `waiting_user`
- **THEN** turn thành `cancelled`, pending call không chạy và session nhận lệnh mới
