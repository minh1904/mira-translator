## Purpose

Giữ cho agent nhớ được các turn trước của một session dài: khi lịch sử vượt ngưỡng, các turn cũ được rút gọn rồi tóm
tắt bằng model phụ thay vì bị cắt mất.

## ADDED Requirements

### Requirement: Ngưỡng rút gọn và vùng giữ nguyên
Ngưỡng rút gọn của một vòng SHALL là 50% giới hạn context của model chạy turn, tính như giới hạn dùng cho context
window. Khi phần lịch sử (bản tóm tắt cùng các turn trước) vượt ngưỡng, runtime SHALL rút gọn; dưới ngưỡng, các turn
trước SHALL được gửi nguyên văn. Ba turn trước gần nhất SHALL luôn được gửi nguyên văn, kể cả khi riêng chúng vượt
ngưỡng.

#### Scenario: Dưới ngưỡng
- **WHEN** lịch sử của session chiếm 30% giới hạn context của model
- **THEN** mọi turn trước được gửi nguyên văn và không có lời gọi tóm tắt

#### Scenario: Ba turn gần nhất
- **WHEN** lịch sử vượt ngưỡng và session có 10 turn trước
- **THEN** ba turn gần nhất được gửi nguyên văn, chỉ bảy turn cũ hơn bị rút gọn

### Requirement: Rút gọn theo thứ tự rẻ đến đắt
Với các turn ngoài vùng giữ nguyên, runtime SHALL lần lượt: (1) thay kết quả công cụ lớn bằng một placeholder nêu kết
quả đã được lược, giữ tên công cụ và tham số; (2) nếu lịch sử vẫn vượt ngưỡng, tóm tắt các turn đó bằng model phụ
thành bản tóm tắt của session và gửi bản tóm tắt thay cho chúng; (3) nếu tóm tắt thất bại, bỏ turn cũ nhất trước như
hành vi cắt trước đây. Mỗi bước SHALL được ghi vào activity của vòng. Việc rút gọn SHALL không hiện phần tử nào trong
transcript.

#### Scenario: Lược kết quả công cụ là đủ
- **WHEN** lịch sử vượt ngưỡng và sau khi thay kết quả đọc chương cũ bằng placeholder thì xuống dưới ngưỡng
- **THEN** không có lời gọi tóm tắt và các tool call cũ vẫn có tên công cụ và tham số

#### Scenario: Cần tóm tắt
- **WHEN** lịch sử vẫn vượt ngưỡng sau khi lược kết quả công cụ
- **THEN** model phụ tóm tắt các turn ngoài vùng giữ nguyên và prompt chứa bản tóm tắt thay cho các turn đó

#### Scenario: Tóm tắt lỗi
- **WHEN** lời gọi tóm tắt thất bại
- **THEN** turn vẫn chạy, các turn cũ nhất bị bỏ khỏi prompt, activity ghi lỗi tóm tắt và số turn đã bỏ

#### Scenario: Chạy ngầm
- **WHEN** một vòng có rút gọn hoặc tóm tắt
- **THEN** transcript của người dùng không có dòng nào về việc đó

### Requirement: Bản tóm tắt của session
Bản tóm tắt SHALL được lưu theo session cùng danh sách turn nó đã tóm tắt, và SHALL được dùng lại ở các vòng và turn
sau cho đến khi cần tóm tắt thêm. Lần tóm tắt sau SHALL gộp bản tóm tắt trước với các turn mới cần tóm tắt thành một
bản duy nhất. Bản tóm tắt SHALL được gửi kèm lời dặn rằng nó chỉ để tham khảo, các yêu cầu trong đó đã được xử lý,
model chỉ làm theo instruction mới nhất, và context hiện tại thắng context trong bản tóm tắt.

#### Scenario: Dùng lại bản tóm tắt
- **WHEN** turn mới bắt đầu và session đã có bản tóm tắt còn hợp lệ
- **THEN** prompt dùng bản tóm tắt đã lưu mà không gọi tóm tắt lại các turn nó đã tóm tắt

#### Scenario: Tóm tắt dồn
- **WHEN** session đã có bản tóm tắt và lịch sử lại vượt ngưỡng
- **THEN** bản tóm tắt mới gộp nội dung bản cũ với các turn vừa ra khỏi vùng giữ nguyên, và chỉ còn một bản được lưu

#### Scenario: Không làm lại việc cũ
- **WHEN** bản tóm tắt ghi người dùng từng yêu cầu dịch chương 3 và instruction mới hỏi về glossary
- **THEN** prompt ghi bản tóm tắt chỉ để tham khảo và chỉ instruction mới là việc cần làm

### Requirement: Bản tóm tắt mất hiệu lực khi revert
Khi một turn nằm trong danh sách đã tóm tắt bị revert, bản tóm tắt của session SHALL không còn được dùng. Vòng kế tiếp
SHALL dựng lịch sử từ các turn còn lại và tóm tắt lại nếu vẫn vượt ngưỡng.

#### Scenario: Revert turn đã được tóm tắt
- **WHEN** người dùng revert về một turn nằm trong bản tóm tắt
- **THEN** turn kế tiếp không gửi bản tóm tắt cũ và không có nội dung của turn đã revert trong prompt

### Requirement: Model dùng để tóm tắt
Lời gọi tóm tắt SHALL dùng Model phụ theo capability `model-defaults`. Khi chưa đặt Model phụ hoặc Model phụ không
dùng được, lời gọi SHALL dùng model của turn. Lời gọi tóm tắt SHALL không gửi tool definitions. Usage và chi phí của
lời gọi tóm tắt SHALL được cộng vào usage và chi phí của turn gây ra nó.

#### Scenario: Có Model phụ
- **WHEN** Model phụ là một model rẻ và turn chạy bằng model chính
- **THEN** lời gọi tóm tắt đi tới Model phụ, còn các vòng của turn vẫn chạy bằng model chính

#### Scenario: Chưa đặt Model phụ
- **WHEN** chưa đặt Model phụ và lịch sử cần tóm tắt
- **THEN** lời gọi tóm tắt dùng model của turn
