## 1. Lưu trữ

- [x] 1.1 Thêm migration thư viện (bậc sau v18) tạo `agent_turn_steer` và dựng lại `agent_turn_part` với loại `steer`
  theo D1, sinh fixture schema mới; kiểm bằng test migration từ v18 giữ nguyên phần tử cũ
- [x] 1.2 Thêm vào `agentRepository` thêm tin (idempotent theo `client_command_id`, tối đa 5 tin chờ), rút, đánh dấu
  `delivered` kèm phần tử `steer`, chuyển `returned`/`forwarded`, liệt kê theo session; kiểm bằng test repository cho
  từng chuyển trạng thái và lỗi `already_delivered`

## 2. Runtime

- [x] 2.1 Viết test service: tin gửi trong lúc tool chạy được chèn sau kết quả tool, đúng một message cho nhiều tin,
  không chèn lại ở vòng sau; tin gửi khi lượt không chạy nhận `turn_not_running`
- [x] 2.2 Cài điểm chèn D2 trong vòng lặp `AgentService` và dựng message chen ngang trong `roundMessages` từ phần tử
  `steer`; test 2.1 qua
- [x] 2.3 Viết test và cài D3: `completed` còn tin chờ thì tạo lượt mới cùng chế độ, mức quyền, ngữ cảnh; Dừng, lỗi,
  `waiting_user` và khởi động lại thì tin thành `returned`
- [x] 2.4 Truyền chữ tin đã chèn vào policy (D5); kiểm bằng test: đích nêu trong tin chen ngang được coi là do người dùng nêu
- [x] 2.5 Thêm dòng về tin chen ngang vào system policy và prompt tóm tắt session; kiểm bằng test dựng prompt
- [x] 2.6 Kiểm bằng test lịch sử: lượt có tin chen ngang gửi lại ở lượt sau đặt message chen ngang sau kết quả tool
  đúng vòng, cả ở dạng văn bản cho model không hỗ trợ tool

## 3. IPC và contract

- [x] 3.1 Thêm `agent:steer`, `agent:withdraw-steer`, event `steer` và `steers` trong snapshot vào contract, preload,
  handler (D4); kiểm bằng test handler gồm lỗi typed

## 4. Renderer

- [x] 4.1 Ô nhập khi lượt chạy: Enter gửi tin chen ngang, nút Gửi trước Dừng khi có chữ, tắt +, chế độ, model,
  placeholder mới, giữ chữ khi bị từ chối; kiểm bằng test component
- [x] 4.2 Danh sách tin chờ và tin trả lại phía trên ô nhập (X để rút; Gửi/Bỏ cho tin trả lại; Gửi khi `waiting_user`
  chỉ đưa chữ vào ô); store upsert theo event; kiểm bằng test store và component
- [x] 4.3 Phần tử `steer` trong transcript với nhãn "Gửi thêm khi đang chạy"; kiểm bằng test component thứ tự phần tử

## 5. Tài liệu và kiểm tra

- [x] 5.1 Ghi quyết định và trạng thái triển khai vào module tài liệu chứa agent trong `docs/modules`
- [x] 5.2 Chạy `node scripts/check.mjs` và sửa đến khi qua
- [ ] 5.3 Chạy thử app: chen ngang khi agent đang đọc chương thì vòng sau làm theo; chen ngang đúng lúc model trả lời
  xong thì lượt mới tự chạy; bấm Dừng khi còn tin chờ thì tin hiện để gửi lại; hai cửa sổ thấy cùng danh sách
