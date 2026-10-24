## MODIFIED Requirements

### Requirement: Budget và loop có giới hạn rõ
Mỗi turn SHALL có tối đa 15 vòng model, 40 tool call, 200.000 ký tự đọc và ghi vào tối đa 3 chương khác nhau. Ghi lại
vào một chương đã ghi trong cùng turn SHALL không tính thêm. Vòng model cuối được phép SHALL được gửi không kèm tool
và tính trong 15 vòng, để model phải trả lời bằng chữ.

Khi một call chạm trần tool call, trần đọc hoặc trần ghi, call đó SHALL không chạy và SHALL nhận kết quả lỗi budget;
các call còn lại cùng vòng SHALL bị hủy; runtime SHALL chuyển sang một vòng cuối không tool. Khi cùng
`(tool, tham số chuẩn hóa)` được gọi lần thứ ba trong turn, call đó SHALL không chạy và SHALL nhận kết quả lỗi nói
rằng nó đã được gọi với cùng tham số và model cần dùng kết quả trước; lần thứ tư SHALL được xử lý như chạm trần.

Turn dừng vì chạm trần hoặc vì gọi lặp SHALL kết thúc `completed` với câu trả lời của vòng cuối, kèm một phần tử thông
báo tiến trình "Lượt dừng vì chạm giới hạn" nêu giới hạn đã chạm. Transcript SHALL hiện nút **Tiếp tục** cho thông báo
này theo cùng quy tắc với thông báo lượt không có phản hồi. Chạm trần hay gọi lặp SHALL không làm turn `failed`.

#### Scenario: Hết vòng gọi tool
- **WHEN** model vẫn muốn gọi tool khi đã tới vòng thứ 15
- **THEN** request vòng 15 không kèm tool, turn kết thúc `completed` bằng câu trả lời của model kèm thông báo dừng vì
  chạm giới hạn và nút Tiếp tục

#### Scenario: Model gọi cùng tool lặp lại
- **WHEN** model gọi cùng tool với cùng tham số chuẩn hóa lần thứ ba
- **THEN** call thứ ba không chạy, model nhận lỗi nhắc dùng kết quả trước và turn vẫn tiếp tục

#### Scenario: Gọi lặp lần thứ tư
- **WHEN** model vẫn gọi cùng tool với cùng tham số lần thứ tư
- **THEN** call không chạy, runtime gửi vòng cuối không tool và turn kết thúc `completed` kèm thông báo dừng và nút
  Tiếp tục

#### Scenario: Đọc vượt trần
- **WHEN** một lần đọc sẽ đưa tổng ký tự đọc của turn vượt 200.000
- **THEN** kết quả đọc không được đưa cho model, model nhận lỗi budget trong vòng cuối không tool và turn kết thúc
  `completed` kèm thông báo dừng và nút Tiếp tục

#### Scenario: Ghi nhiều lần vào một chương
- **WHEN** trong một turn model sửa bản dịch chương 5 bốn lần rồi dịch chương 6
- **THEN** cả năm lần ghi đều chạy vì turn mới ghi vào hai chương

#### Scenario: Ghi vào chương thứ tư
- **WHEN** turn đã ghi vào ba chương và model gọi ghi vào chương thứ tư
- **THEN** call đó không chạy, chương thứ tư không đổi và turn dừng kèm thông báo và nút Tiếp tục

#### Scenario: Tiếp tục sau khi chạm giới hạn
- **WHEN** người dùng bấm Tiếp tục ở thông báo dừng vì chạm giới hạn
- **THEN** turn mới được gửi với lệnh "Tiếp tục", cùng chế độ và ngữ cảnh, và prompt của nó có các tool call của turn
  đã dừng
