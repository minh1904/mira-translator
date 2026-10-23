## MODIFIED Requirements

### Requirement: Context window theo thứ tự ưu tiên
Mỗi vòng model SHALL được lắp theo thứ tự: system policy và tool definitions; bản tóm tắt của session nếu có, theo
capability `agent-session-compaction`; các turn trước của session; instruction và context snapshot của turn; pending
action đang trả lời nếu có; tool call và kết quả của turn hiện tại.

Mỗi turn trước được gửi lại SHALL gồm instruction, một dòng mô tả context của turn đó (tác phẩm, chương, vùng đang
chọn, đích đính kèm) được ghi rõ là context của turn cũ, các vòng tool call và kết quả của turn đó theo thứ tự, rồi
câu trả lời cuối. Chỉ turn có câu trả lời cuối và chưa bị revert SHALL được gửi lại. Trong tool call của turn trước,
handle SHALL được thay bằng nhãn của đích mà handle đó trỏ tới lúc chạy, và system policy SHALL nói rằng handle của
turn cũ không dùng được ở turn hiện tại. Dữ liệu riêng của provider gắn với tool call của turn trước (như thought
signature) SHALL không được gửi lại. Khi model của turn hiện tại không hỗ trợ tool, các vòng tool của turn trước SHALL
được gửi dưới dạng văn bản ngắn nêu tên công cụ, đích và kết quả thay vì message tool.

Khi lịch sử vượt ngưỡng, runtime SHALL rút gọn turn cũ theo capability `agent-session-compaction`. Runtime SHALL không
bỏ hay rút gọn system policy, instruction hiện tại, snapshot hay cặp call/result của turn hiện tại.

#### Scenario: Session dài
- **WHEN** lịch sử session vượt ngưỡng rút gọn của model
- **THEN** các turn cũ được rút gọn hoặc tóm tắt, activity ghi việc rút gọn và instruction hiện tại vẫn nguyên văn

#### Scenario: Chương dài
- **WHEN** người dùng hỏi về một chương dài hơn giới hạn đọc của một call
- **THEN** model đọc chương qua tool phân trang thay vì nhận toàn chương trong prompt

#### Scenario: Hỏi tiếp về điều vừa đọc
- **WHEN** turn trước đã đọc chương 5 bằng tool và người dùng hỏi tiếp "đoạn đó nhân vật nào nói?"
- **THEN** prompt của turn mới có tool call đọc chương 5 và kết quả của nó, nên model trả lời mà không phải đọc lại

#### Scenario: Turn cũ nói "chương này"
- **WHEN** turn trước được gửi lúc đang mở chương 5 với câu "chương này dịch sai tên", còn turn hiện tại đang mở chương 8
- **THEN** turn cũ được gửi kèm dòng context ghi chương 5 của turn cũ, và context hiện tại của turn mới ghi chương 8

#### Scenario: Handle của turn cũ
- **WHEN** turn trước gọi tool với `target: "t1"` trỏ tới chương 5 của "Kiếm Đạo"
- **THEN** tool call đó được gửi lại với nhãn chương 5 của "Kiếm Đạo" thay cho `t1`

#### Scenario: Đổi sang model không hỗ trợ tool
- **WHEN** session có turn trước dùng tool và turn hiện tại chạy bằng model không hỗ trợ tool
- **THEN** các vòng tool của turn trước được gửi dưới dạng văn bản và request không chứa message tool
