## MODIFIED Requirements

### Requirement: Subagent lưu và giới hạn như lượt chính
Tool call của subagent SHALL được lưu như tool call của turn, gắn với call `run_subagent` cha, và phát sự kiện tool
call mang ID cha. Subagent SHALL chỉ được dùng capability đọc và `resolve_target`, SHALL qua phát hiện lặp, và SHALL
có trần riêng: 4 vòng model, 10 tool call, 60.000 ký tự đọc; vượt trần thì subagent kết thúc với phần đã có và call
cha ghi lý do. `resolve_target` mơ hồ SHALL trả danh sách ứng viên cho subagent thay vì báo không tìm thấy. Bản tóm
tắt trả về call cha SHALL là chữ của vòng cuối của subagent. Hủy turn SHALL hủy subagent đang chạy.

Subagent SHALL chạy bằng Model phụ khi Model phụ đã đặt, mở được và không bị catalog ghi `toolCall: false`; ngược lại
SHALL chạy bằng model của turn. Khi Model phụ lỗi trước khi subagent có tool call nào được lưu, runtime SHALL chạy lại
subagent từ đầu bằng model của turn; lỗi xảy ra sau đó SHALL làm call cha thất bại với lỗi đã phân loại. Usage và chi
phí của mọi vòng subagent SHALL được cộng vào usage và chi phí của turn. Kết quả của call cha SHALL ghi nhãn model đã
chạy subagent.

#### Scenario: Subagent đọc hai chương
- **WHEN** subagent đọc chương 3 và chương 4 rồi tóm tắt
- **THEN** hai call `read_chapter` được lưu với cha là call `run_subagent`, và kết quả của cha chỉ chứa đoạn tóm tắt cuối

#### Scenario: Subagent chạm trần
- **WHEN** subagent gọi tool thứ 11
- **THEN** call đó không chạy, subagent kết thúc và call cha ghi lý do chạm trần

#### Scenario: Subagent gọi tool ghi
- **WHEN** model của subagent gọi `translate_chapter`
- **THEN** call được lưu với lỗi không được phép và không chạy

#### Scenario: Có Model phụ
- **WHEN** Model phụ là một model rẻ hỗ trợ tool và turn chạy bằng model chính
- **THEN** mọi vòng của subagent đi tới Model phụ, các vòng của turn vẫn đi tới model chính, và call cha ghi nhãn
  Model phụ

#### Scenario: Chưa đặt Model phụ
- **WHEN** chưa đặt Model phụ và model gọi `run_subagent`
- **THEN** subagent chạy bằng model của turn như trước

#### Scenario: Model phụ không hỗ trợ tool
- **WHEN** Model phụ có `toolCall: false` trong catalog
- **THEN** subagent chạy bằng model của turn

#### Scenario: Model phụ lỗi ngay vòng đầu
- **WHEN** Model phụ trả lỗi ở vòng đầu của subagent, trước khi có tool call nào
- **THEN** subagent chạy lại bằng model của turn và call cha hoàn tất với nhãn model của turn

#### Scenario: Usage của subagent vào chi phí turn
- **WHEN** subagent chạy ba vòng, mỗi vòng provider báo usage
- **THEN** usage và chi phí của turn gồm cả ba vòng đó
