## 1. Hàm thuần

- [x] 1.1 Viết test cho `isEmptyRound` theo D2: không chữ và không call là rỗng; chỉ có suy luận vẫn rỗng; có call
  không rỗng; `finishReason: 'filter'` không rỗng; và luật rỗng tất định (hai lần `outputTokens === 0`, thiếu usage
  thì không tất định)
- [x] 1.2 Cài `isEmptyRound` và hàm quyết định thử lại (đếm theo vòng và theo lượt) cho test 1.1 qua
- [x] 1.3 Viết test cho `detectRepetition` theo D3: câu 80 ký tự lặp phủ quá nửa văn bản 3.000 ký tự thì bắt và trả
  vị trí lần lặp thứ hai; văn bản dưới 2.000 ký tự, điệp ngữ dưới 60 ký tự, bảng hoặc danh sách có dòng giống nhau,
  phần lặp dưới một nửa thì không bắt
- [x] 1.4 Cài `detectRepetition` cho test 1.3 qua

## 2. Lượt chính

- [x] 2.1 Viết test service với model giả: vòng rỗng được gửi lại tới cùng model, transcript chỉ có câu trả lời của
  lần sau, usage gồm cả lần rỗng, activity có dòng thử lại, budget vòng không tăng
- [x] 2.2 Viết test service: rỗng tất định dừng sau hai lần; vòng bị lọc không thử lại; quá 3 lần mỗi lượt thì không
  thử nữa và lượt hiện thông báo lượt rỗng
- [x] 2.3 Nối thử lại vào vòng model của `AgentService` theo D2 (đọc `finishReason` của sự kiện `done`, không lưu
  phần tử của lần rỗng) cho test 2.1–2.2 qua
- [x] 2.4 Viết test service: model giả stream đoạn lặp thì request bị hủy, phần trước lần lặp thứ hai được lưu, tool
  call của vòng không chạy, không có vòng model nào nữa và lượt `completed` kèm thông báo dừng vì lặp văn bản;
  suy luận lặp cũng vậy
- [x] 2.5 Nối `detectRepetition` vào stream với `AbortController` của vòng theo D3 cho test 2.4 qua

## 3. Subagent

- [x] 3.1 Viết test và nối cùng luật thử lại và dò lặp vào vòng subagent theo D4: subagent rỗng được thử lại; subagent
  lặp trả lỗi cho `run_subagent` của lượt chính

## 4. Tài liệu và kiểm tra

- [x] 4.1 Ghi trạng thái triển khai và nguồn Hermes (`empty_response_guard.py`, `repetition_guard.py`) vào module tài
  liệu chứa agent trong `docs/modules`
- [x] 4.2 Chạy `node scripts/check.mjs` và sửa đến khi qua
