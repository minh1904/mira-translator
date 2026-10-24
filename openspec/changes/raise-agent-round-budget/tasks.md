## 1. Budget tracker

- [x] 1.1 Viết test cho `TurnBudgetTracker`: mặc định 15 vòng, 40 call, 200.000 ký tự; `recordWrite(chapterKey)` cho
  qua chương đã ghi, chặn chương thứ tư (D4)
- [x] 1.2 Đổi `TurnBudgetTracker` và `MAX_MODEL_ROUNDS` cho test 1.1 qua; sửa test cũ dùng con số cũ

## 2. Dừng mềm trong `AgentService`

- [x] 2.1 Viết test service: vượt trần đọc, vượt trần ghi, vượt trần call đều cho turn `completed` với vòng cuối
  không tool, call vượt trần `failed`, call `pending` còn lại `cancelled`, có phần tử "Lượt dừng vì chạm giới hạn"
- [x] 2.2 Viết test service cho lặp: lần ba nhận lỗi `repeat` và turn chạy tiếp; lần bốn dừng mềm (D5)
- [x] 2.3 Thay `stopRest`/`TurnStop` cho budget và lặp bằng dừng mềm theo D2 cho các test 2.1, 2.2 qua; lỗi lưu trữ,
  hủy và provider vẫn `failed`
- [x] 2.4 Đổi ghi theo chương (D4) ở chỗ gọi `recordWriteOperation`; kiểm bằng test "ghi nhiều lần vào một chương"

## 3. Tiếp tục dùng chung

- [x] 3.1 Thêm tiền tố thông báo dừng và `offersContinue` vào `shared/contracts/agentEmptyTurn.ts`, kèm test (D3)
- [x] 3.2 Cho `AgentTranscript`/`TurnFooter` dùng `offersContinue`; kiểm bằng test component: turn dừng vì giới hạn
  có nút Tiếp tục, turn bình thường không có

## 4. Mô tả tool và tài liệu

- [x] 4.1 Đổi mô tả `list_glossary`, `list_addressing` từ "đã duyệt" sang "đang có hiệu lực"; cập nhật test chụp mô
  tả nếu có
- [x] 4.2 Ghi vào mục 9 của `docs/modules/proposals/autonomous-agent.md`: trần mới đã triển khai, và quyết định D1
  dùng `completed` + Tiếp tục thay `waiting_user`
- [x] 4.3 Chạy `node scripts/check.mjs` và sửa đến khi qua
- [ ] 4.4 Chạy thử app với một lệnh nhiều bước (rà xưng hô vài chương): turn không `failed`, chạm trần thì có Tiếp
  tục và turn sau làm tiếp từ chỗ dừng
