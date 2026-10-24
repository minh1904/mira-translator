## MODIFIED Requirements

### Requirement: Subagent lưu và giới hạn như lượt chính
Tool call của subagent SHALL được lưu như tool call của turn, gắn với call `run_subagent` cha, và phát sự kiện tool
call mang ID cha. Subagent SHALL chỉ được dùng capability đọc và `resolve_target`, trừ `todo_list`, SHALL qua phát hiện
lặp, và SHALL có trần riêng: 4 vòng model, 10 tool call, 60.000 ký tự đọc; vượt trần thì subagent kết thúc với phần đã
có và call cha ghi lý do. `resolve_target` mơ hồ SHALL trả danh sách ứng viên cho subagent thay vì báo không tìm thấy.
Bản tóm tắt trả về call cha SHALL là chữ của vòng cuối của subagent. Hủy turn SHALL hủy subagent đang chạy.

#### Scenario: Subagent đọc hai chương
- **WHEN** subagent đọc chương 3 và chương 4 rồi tóm tắt
- **THEN** hai call `read_chapter` được lưu với cha là call `run_subagent`, và kết quả của cha chỉ chứa đoạn tóm tắt cuối

#### Scenario: Subagent chạm trần
- **WHEN** subagent gọi tool thứ 11
- **THEN** call đó không chạy, subagent kết thúc và call cha ghi lý do chạm trần

#### Scenario: Subagent gọi tool ghi
- **WHEN** model của subagent gọi `translate_chapter`
- **THEN** call được lưu với lỗi không được phép và không chạy

#### Scenario: Subagent không có todo_list
- **WHEN** subagent chạy
- **THEN** request của subagent không có tool `todo_list`, và nếu model của nó vẫn gọi `todo_list` thì call được lưu với
  lỗi không được phép và danh sách của session không đổi

## ADDED Requirements

### Requirement: Tool call todo_list hiện thành thẻ checklist
Tool call `todo_list` SHALL vẫn được lưu và phát sự kiện như mọi tool call, nhưng transcript SHALL không hiện chúng
thành dòng tool call; thay vào đó các call `todo_list` ghi thành công của một turn SHALL hiện thành một thẻ checklist
theo capability `agent-todo-list`. Call `todo_list` lỗi SHALL vẫn hiện thành dòng tool call với lý do lỗi.

#### Scenario: Ghi thành công
- **WHEN** model gọi `todo_list` ghi hai bước và call hoàn tất
- **THEN** chuỗi phần tử của turn hiện một thẻ checklist ở vị trí call đó, không có dòng tool call `todo_list`

#### Scenario: Ghi lỗi
- **WHEN** model gọi `todo_list` với 25 bước
- **THEN** transcript hiện dòng tool call `todo_list` trạng thái `failed` kèm lý do validation
