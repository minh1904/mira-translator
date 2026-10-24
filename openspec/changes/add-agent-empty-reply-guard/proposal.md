## Why

Một vòng model của agent có thể trả về rỗng: không chữ, không tool call, cũng không báo bị bộ lọc chặn. Hiện runtime
coi đó là câu trả lời cuối, nên lượt kết thúc với thông báo "Lượt kết thúc mà không có phản hồi" dù một lần gọi
lại thường đủ. Ở chiều ngược lại, model đôi khi rơi vào vòng lặp, lặp một đoạn văn đến hết hạn mức output; người
dùng phải tự bấm Dừng và vẫn trả tiền cho toàn bộ đoạn lặp. Hermes Agent (`empty_response_guard.py`,
`repetition_guard.py`) chặn cả hai trường hợp này ngay trong vòng lặp; Mira chưa có.

## What Changes

- Vòng model rỗng không do bộ lọc được thử lại trên **cùng model**, tối đa 2 lần mỗi vòng và 3 lần mỗi lượt. Hai
  lần rỗng liên tiếp mà provider báo 0 token output thì dừng thử ngay. Hết lượt thử thì lượt kết thúc như hiện nay
  (thông báo lượt rỗng kèm **Tiếp tục**).
- Mỗi lần thử lại tính lại toàn bộ input; usage và chi phí của mọi lần thử được cộng vào lượt. Thử lại chạy ngầm,
  chỉ ghi activity.
- Khi chữ hoặc suy luận đang stream bị lặp nguyên văn (đoạn ≥ 60 ký tự, phần lặp chiếm quá nửa và văn bản đã dài
  ≥ 2.000 ký tự), runtime hủy request, giữ phần văn bản trước đoạn lặp và kết thúc lượt `failed` với lý do lặp.
- Áp dụng cho cả lượt chính và subagent.

Ngoài phạm vi: chuyển sang chuỗi model dự phòng cho agent chat (spec `agent-conversation` cấm agent tự đổi model;
xem design D1), và mọi thay đổi trần vòng hay trần chi phí.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-conversation`: thêm requirement thử lại vòng model rỗng và requirement dừng sớm khi model lặp văn bản.

## Impact

- `src/main/services/agent/agentService.ts`: vòng model của lượt chính và của subagent.
- File mới cạnh `agentService.ts` cho hai hàm thuần: nhận diện vòng rỗng và dò lặp văn bản.
- `src/main/infra/providers/transports/openAiChatTransport.ts`: chỉ đọc `finishReason`/`filter` của sự kiện `done`
  đã có, không đổi transport.
- Chi phí: tối đa 3 lần gọi lại mỗi lượt, mỗi lần tính lại input của vòng đó.
