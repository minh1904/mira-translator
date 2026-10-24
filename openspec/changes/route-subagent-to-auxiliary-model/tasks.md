## 0. Điều kiện

- [x] 0.1 Xác nhận `add-agent-session-memory` đã commit (Model phụ và `summarize` có trong code) trước khi bắt đầu

## 1. Chi phí theo từng model

- [x] 1.1 Viết test cho D3: turn có usage của model turn và của Model phụ giá khác nhau thì chi phí bằng tổng chi phí
  từng phần, token usage là tổng thuần
- [x] 1.2 Đổi `usages` của turn sang phần tử mang usage và `info` model, sửa `costOf` và chỗ ghi `cost_usd`; `summarize`
  đẩy usage kèm `info` của model đã tóm tắt; test 1.1 và test cũ về chi phí qua

## 2. Subagent chạy bằng Model phụ

- [x] 2.1 Tách hàm chọn model ứng viên dùng chung cho `summarize` và subagent theo D1 (có điều kiện `toolCall !== false`
  cho subagent); test `summarize` hiện có vẫn qua
- [x] 2.2 Viết test service với `openChatModel` giả: có Model phụ thì mọi vòng subagent đi tới nó và call cha ghi nhãn
  Model phụ; chưa đặt hoặc `toolCall: false` thì dùng model turn
- [x] 2.3 Sửa `executeSubagent` theo D1, D2: chọn model, cộng usage mỗi vòng, quay về model turn khi lỗi trước tool call
  đầu; ghi nhãn model vào kết quả call cha; test 2.2 qua
- [x] 2.4 Viết test: Model phụ lỗi ở vòng đầu thì subagent chạy lại bằng model turn; lỗi sau khi đã có tool call thì call
  cha `failed` và không có call con trùng

## 3. Tài liệu và kiểm tra

- [ ] 3.1 Khi archive `add-agent-session-memory`, sửa requirement Model phụ trong `openspec/specs/model-defaults` để nêu
  subagent; ghi trạng thái triển khai vào module tài liệu chứa agent trong `docs/modules`
- [x] 3.2 Chạy `node scripts/check.mjs` và sửa đến khi qua
