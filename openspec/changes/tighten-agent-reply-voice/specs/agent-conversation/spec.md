## ADDED Requirements

### Requirement: Văn phong câu trả lời gọn
System policy của agent SHALL yêu cầu câu trả lời: dài tương xứng câu hỏi; không có câu đệm, không nhắc lại yêu cầu
và không tóm tắt lại điều đã nói; không kể lại tool call mà transcript đã hiện; khi đã làm xong một việc thì báo ngắn
đã đổi gì, đã kiểm gì và còn gì; khi không chắc thì nói thẳng là không chắc. Chỉ dẫn văn phong SHALL không ghi đè
chỉ dẫn về handle, dữ liệu truyện hay việc chờ người dùng duyệt.

#### Scenario: Câu hỏi ngắn
- **WHEN** người dùng hỏi "truyện này có bao nhiêu chương?" và agent đã có số chương
- **THEN** câu trả lời là một câu nêu số chương, không có lời chào hay câu nhắc lại câu hỏi

#### Scenario: Báo kết quả sau khi ghi
- **WHEN** agent vừa dịch xong một chương bằng tool và transcript đã hiện dòng tool cùng thanh "Đã sửa"
- **THEN** câu trả lời nêu kết quả và việc còn lại trong vài câu, không liệt kê lại từng tool đã gọi

#### Scenario: Không chắc
- **WHEN** agent không tìm được bằng chứng cho câu trả lời trong dữ liệu đã đọc
- **THEN** câu trả lời nói rõ là chưa chắc và vì sao, thay vì khẳng định
