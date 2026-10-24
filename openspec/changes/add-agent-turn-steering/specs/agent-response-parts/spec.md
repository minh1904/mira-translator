## MODIFIED Requirements

### Requirement: Câu trả lời là chuỗi phần tử có thứ tự
Mỗi turn SHALL có một chuỗi phần tử theo thứ tự xảy ra, mỗi phần tử thuộc một loại: chữ trả lời, suy nghĩ, tool
call, thông báo tiến trình (ví dụ model không dùng được tool), hoặc tin chen ngang của người dùng theo capability
`agent-steer-messages`. Chữ và suy nghĩ của mỗi vòng model SHALL là phần tử riêng đặt trước các tool call của vòng đó;
tin chen ngang được chèn sau một vòng SHALL đặt sau tool call của vòng đó. Phần tử SHALL được lưu bền trong library DB
trước khi turn kết thúc và SHALL có thứ tự ổn định. Câu trả lời đã lưu của turn SHALL chỉ gồm chữ trả lời của model,
không gồm tin chen ngang.

#### Scenario: Chữ, tool, chữ
- **WHEN** model viết "Để tôi đọc chương", gọi `read_chapter`, rồi vòng sau viết bản tóm tắt
- **THEN** chuỗi phần tử của turn là chữ, tool call `read_chapter`, chữ, theo đúng thứ tự đó

#### Scenario: Mở lại app
- **WHEN** app mở lại sau turn ở trên
- **THEN** snapshot session trả cùng chuỗi phần tử theo cùng thứ tự

#### Scenario: Suy nghĩ được lưu
- **WHEN** provider stream suy nghĩ trong vòng đầu
- **THEN** phần tử suy nghĩ được lưu với nội dung provider gửi và thời lượng đo được

#### Scenario: Tin chen ngang giữa hai vòng
- **WHEN** model gọi `read_chapter`, người dùng chen ngang "chỉ chương 3", rồi vòng sau model trả lời
- **THEN** chuỗi phần tử là tool call `read_chapter`, tin chen ngang, chữ trả lời; câu trả lời đã lưu không chứa "chỉ chương 3"
