## 1. Lưu trữ

- [x] 1.1 Thêm migration thư viện v18 tạo bảng `agent_session_summary` theo D3, sinh fixture
  `library-v18.schema.sql` và kiểm bằng test migration từ v17
- [x] 1.2 Thêm vào `agentRepository` đọc/ghi/xóa bản tóm tắt; đọc tự xóa bản có turn đã revert; kiểm bằng test
  repository (ghi, đọc lại, revert một turn đã tóm tắt thì đọc ra `null`, xóa session thì bản tóm tắt mất theo)
- [x] 1.3 Thêm `auxiliary` vào `AiPreferences` (key `meta` `ai.auxiliary`) theo D5, kèm test: ghi rồi đọc lại, entry
  bị xóa thì đọc `null`

## 2. Dựng lịch sử đầy đủ

- [x] 2.1 Viết test cho hàm dựng lịch sử một turn cũ (D1): có dòng ngữ cảnh lượt cũ, các vòng tool, handle `ctx`/`t…`
  thay bằng nhãn, không có `extra_content`, handle không tra được ghi "đích của lượt cũ"
- [x] 2.2 Cài hàm đó dùng lại `roundMessages` và bản đồ handle dựng từ `context_json` và kết quả `resolve_target`; test
  2.1 qua
- [x] 2.3 Viết test và cài dạng văn bản của vòng tool cũ khi model không hỗ trợ tool; request không có message tool
- [x] 2.4 Thêm dòng vào `SYSTEM_PROMPT` nói handle của lượt cũ không dùng được; kiểm bằng test snapshot prompt nếu có,
  hoặc test dựng prompt

## 3. Rút gọn trong `assembleTurnContext`

- [x] 3.1 Viết test cho D2: dưới ngưỡng gửi nguyên văn; ba turn gần nhất không bị đụng; lược kết quả tool > 2.000 ký tự
  từ turn cũ nhất và dừng khi đủ; vẫn vượt thì trả `needsSummary`; có bản tóm tắt thì thay các turn đã tóm tắt;
  `noSummary` thì cắt turn cũ nhất; giới hạn cứng vẫn giữ
- [x] 3.2 Đổi `assembleTurnContext` theo D2 cho test 3.1 qua, và sửa các test cũ của hàm theo input mới

## 4. Tóm tắt trong `AgentService`

- [x] 4.1 Viết prompt tóm tắt và lời dặn chèn bản tóm tắt theo D4; kiểm bằng test: lời dặn có ý "chỉ tham khảo",
  "chỉ làm theo instruction mới nhất", "context hiện tại thắng"
- [x] 4.2 Nối vòng model: khi `needsSummary` thì gọi Model phụ (không tools), lỗi thì thử model của turn, lỗi nữa thì
  lắp lại với `noSummary`; lưu bản tóm tắt dồn; cộng usage vào turn. Kiểm bằng test service với `openChatModel` giả:
  gọi đúng model phụ, không gọi lại khi bản tóm tắt còn hợp lệ, tóm tắt lỗi thì turn vẫn chạy
- [x] 4.3 Bỏ phần tử `progress` "Bỏ N lượt cũ…", ghi activity `compaction` theo D6; kiểm bằng test: không có phần tử
  transcript, có activity với số liệu đúng
- [x] 4.4 Kiểm bằng test service: revert turn đã tóm tắt thì turn sau không gửi bản tóm tắt cũ

## 5. Cài đặt Model phụ

- [x] 5.1 Thêm IPC đọc/ghi Model phụ cạnh Model chính/Dự phòng; kiểm bằng test handler
- [x] 5.2 Thêm `SettingsSection` "Model phụ" trong `modelPages.tsx` (picker như Dự phòng, lựa chọn "Dùng model của
  lượt", tự lưu); kiểm bằng test component: chọn rồi lưu, entry bị xóa hiện "Dùng model của lượt"

## 6. Tài liệu và kiểm tra

- [x] 6.1 Ghi nghiên cứu Hermes Agent (quan sát) và trạng thái triển khai vào module tài liệu chứa agent trong
  `docs/modules`
- [x] 6.2 Chạy `node scripts/check.mjs` và sửa đến khi qua
- [ ] 6.3 Chạy thử app: session nhiều lượt có đọc chương, hỏi tiếp điều vừa đọc thì agent trả lời không đọc lại; ép
  ngưỡng nhỏ để thấy activity `compaction` và bản tóm tắt được dùng ở turn sau
