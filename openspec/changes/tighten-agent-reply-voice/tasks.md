## 1. System policy

- [x] 1.1 Thêm các dòng văn phong vào `SYSTEM_PROMPT` (`src/main/services/agent/agentService.ts`), viết bằng tiếng
  Việt, đặt sau các dòng về handle và dữ liệu truyện; kiểm bằng test dựng prompt: prompt có các ý độ dài tương xứng,
  không kể lại tool call, báo đã đổi/đã kiểm/còn gì, nói thẳng khi không chắc

## 2. Kiểm tra

- [ ] 2.1 Ghi câu trả lời hiện tại của 3–5 lệnh thật (lấy từ log ở mục 2.1 của
  `docs/modules/proposals/autonomous-agent.md`, cùng một câu hỏi ngắn và một lệnh dịch một chương), áp thay đổi rồi
  chạy lại cùng lệnh với cùng model; so độ dài và đối chiếu ba scenario của spec, ghi kết quả vào tài liệu module agent
- [x] 2.2 Chạy `node scripts/check.mjs` và sửa đến khi qua
