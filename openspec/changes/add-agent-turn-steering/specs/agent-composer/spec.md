## MODIFIED Requirements

### Requirement: Thanh công cụ, placeholder và phím
Thanh dưới chỗ gõ SHALL theo thứ tự: + · chọn chế độ · chọn model · Gửi; khi lượt đang chạy, nút Gửi SHALL đổi tại
chỗ thành Dừng, và khi ô nhập có chữ SHALL có thêm nút Gửi ngay trước Dừng với tooltip "Gửi thêm vào lượt đang chạy".
Trong lúc lượt chạy, nút +, chọn chế độ và chọn model SHALL bị tắt vì tin chen ngang chỉ gồm chữ. Thanh SHALL co giãn
sao cho Gửi/Dừng luôn hiện. Placeholder SHALL theo chế độ: Ask "Hỏi về truyện, chương hoặc bản dịch", Agent "Mô tả
việc cần làm"; khi lượt đang chạy placeholder SHALL là "Gửi thêm chỉ dẫn cho lượt đang chạy". Enter SHALL gửi (tạo tin
chen ngang khi lượt đang chạy), Shift+Enter xuống dòng. Mũi tên Lên khi con trỏ ở đầu ô SHALL hiện lệnh trước trong
session, Mũi tên Xuống khi con trỏ ở cuối ô SHALL hiện lệnh sau; lệnh hiện ra SHALL khôi phục cả chữ và chip thường
của lệnh đó, và bản nháp đang gõ SHALL được trả lại khi đi hết lịch sử.

#### Scenario: Lịch sử lệnh
- **WHEN** ô nhập có bản nháp "abc", người dùng đưa con trỏ về đầu và nhấn Lên
- **THEN** ô hiện lệnh trước cùng chip của nó; nhấn Xuống tới cuối lịch sử thì ô hiện lại "abc"

#### Scenario: Panel hẹp
- **WHEN** side panel thu hẹp tới mức không đủ chỗ cho mọi control
- **THEN** control chọn model co lại trước và nút Gửi vẫn hiện đủ

#### Scenario: Gõ khi lượt đang chạy
- **WHEN** lượt đang chạy và người dùng gõ chữ vào ô nhập
- **THEN** thanh hiện Gửi rồi Dừng, nút + và các chọn lựa chế độ, model bị tắt, và Enter gửi tin chen ngang
