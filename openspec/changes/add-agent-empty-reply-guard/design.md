## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- Vòng model của lượt chính nằm trong `AgentService` (`for await (const event of chatModel.chat(...))`). Sự kiện
  `done` mang `usage`, `finishReason` (`stop` | `length` | `tool_calls` | `filter` | `unknown`) và `filter`, nhưng
  vòng lặp hiện chỉ đọc `usage`. Vòng không có tool call được coi là câu trả lời cuối (`break`).
- Cuối lượt, `isEmptyTurn` (`shared/contracts/agentEmptyTurn.ts`, commit `046409a`) lưu phần tử `progress`
  "Lượt kết thúc mà không có phản hồi" và transcript hiện **Tiếp tục**.
- Subagent có vòng lặp riêng (`runSubagent`, cùng file) với `stopped` làm lý do dừng.
- Agent chat **không** dùng chuỗi dự phòng: không có lời gọi `shouldFallback`/`fallbackChain` trong `agentService.ts`,
  và requirement "Model và khả năng gọi tool" của `agent-conversation` cấm runtime tự đổi provider, model hay
  connection. Chuỗi dự phòng (`services/ai/fallback.ts`, requirement "Chuyển sang dự phòng" của `model-defaults`)
  chỉ chạy ở chat cũ và dịch.

## Goals / Non-Goals

**Goals:**
- Hai hàm thuần, kiểm thử không cần provider: `isEmptyRound(result)` và `detectRepetition(text)`.
- Vòng lặp chính và subagent dùng chung hai hàm và cùng giới hạn.

**Non-Goals:**
- Không thêm chuỗi dự phòng cho agent chat.
- Không đổi định nghĩa lượt rỗng của `isEmptyTurn` hay UI Tiếp tục.
- Không thử lại khi provider trả lỗi (đã có chính sách retry của transport).

## Decisions

### D1. Thử lại trên cùng model, không chuyển dự phòng

Hermes thử lại 3 lần rồi đi chuỗi dự phòng. Mira chỉ lấy nửa đầu. Chuyển dự phòng giữa lượt agent đụng ba thứ đã
chốt: model của lượt được ghi trên turn và trong lời duyệt; thought signature của các vòng trước chỉ hợp lệ với đúng
model; và scenario "Provider lỗi giữa turn" cấm request tới model khác. Nếu sau này cần dự phòng cho agent thì làm
một change riêng sửa requirement "Model và khả năng gọi tool".

*Phương án bỏ:* đi chuỗi dự phòng sau khi hết lượt thử. Bị loại vì trái spec hiện hành và vì đổi model giữa lượt
làm vô hiệu `extra_content` của các vòng tool đã chạy.

### D2. Định nghĩa và giới hạn của vòng rỗng

Rỗng = `text.trim() === ''`, `calls.length === 0`, `finishReason !== 'filter'`. Suy luận không tính là trả lời: vòng
chỉ có suy luận vẫn rỗng. Giới hạn: 2 lần thử mỗi vòng, 3 lần mỗi lượt (đếm trong một biến của lượt, không qua
`TurnBudgetTracker`, vì lần thử không phải vòng mới). Dừng sớm khi hai lần liên tiếp đều có `usage` và
`outputTokens === 0` (rỗng tất định, như Hermes). Thiếu `usage` thì không kết luận tất định, vẫn thử theo giới hạn.

Lần rỗng không gọi `saveParts`; phần suy luận đã stream của nó bị bỏ, renderer đọc lại snapshot nên delta tạm biến
mất. `usages` vẫn nhận usage của lần rỗng để chi phí đúng. Activity loại `retry` ghi số lần thử và `finishReason`.

*Phương án bỏ:* thêm một chỉ dẫn "Hãy trả lời" vào request thử lại. Bị loại vì đổi prompt làm mất prompt cache và
khó phân biệt lỗi provider với lỗi prompt; gửi lại nguyên request là đủ cho trường hợp phổ biến.

### D3. Dò lặp văn bản khi stream

`detectRepetition(text)` chạy trên văn bản tích lũy của vòng (chữ và suy luận riêng), chỉ khi văn bản ≥ 2.000 ký
tự, và cách mỗi 500 ký tự mới để không tốn CPU. Thuật toán: lấy đoạn 60 ký tự cuối, tìm lần xuất hiện trước đó gần
nhất để suy ra chu kỳ `p`; nếu văn bản kết thúc bằng một chuỗi lặp liên tiếp chu kỳ `p` (chu kỳ ≥ 60 ký tự) phủ hơn
nửa văn bản thì báo lặp kèm vị trí bắt đầu lần lặp thứ hai. Chỉ bắt lặp **liên tiếp nguyên văn**, giống ngưỡng bảo
thủ của Hermes; điệp ngữ ngắn hay đoạn trích lặp rải rác không bị bắt.

Khi bắt được: hủy request bằng `AbortController` riêng của vòng (gắn với `signal` của lượt), cắt văn bản tại vị trí
lặp thứ hai, lưu phần đã cắt như phần tử văn bản/suy luận của vòng, rồi kết thúc lượt bằng dừng mềm của
`raise-agent-round-budget`: không vòng nào nữa, lượt `completed`, phần tử `progress` "Lượt dừng vì chạm giới hạn:
Model lặp văn bản…" và **Tiếp tục**. Không gửi vòng cuối không tool như khi chạm trần, vì model đang lặp thì vòng đó
thường lặp tiếp. Change này vì vậy cài sau `raise-agent-round-budget`. Stream bị hủy nên thường không có `usage`; khi đó ghi `null` như vòng
không báo usage hiện nay.

### D4. Subagent

Vòng subagent dùng cùng hai hàm và cùng giới hạn thử lại (đếm riêng cho subagent). Lặp văn bản đặt `stopped` với lý
do lặp, để lượt chính nhận kết quả lỗi của `run_subagent` như các lý do dừng khác.

## Risks / Trade-offs

- [Mỗi lần thử lại tính lại toàn bộ input của vòng, có thể đắt ở vòng có lịch sử dài] → tối đa 3 lần mỗi lượt và dừng
  ngay khi rỗng tất định; chi phí được cộng và hiện trong usage của lượt.
- [Model rỗng vì input quá dài hoặc lỗi prompt, thử lại vô ích] → luật rỗng tất định chặn sau lần thử đầu khi provider
  báo 0 token output.
- [Dò lặp bắt nhầm văn bản hợp lệ, ví dụ bảng hay danh sách có dòng giống nhau] → đòi chu kỳ ≥ 60 ký tự, lặp liên tiếp
  nguyên văn và phủ hơn nửa văn bản ≥ 2.000 ký tự; test có ca bảng và danh sách.
- [Hủy stream làm mất usage của vòng lặp] → chấp nhận; chi phí của vòng đó có thể thiếu trong tổng của lượt.
