## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- `TurnBudgetTracker` (`services/agent/registry.ts`) đếm vòng, ký tự đọc, operation ghi, tool call. `AgentService`
  chỉ truyền `maxModelRounds: MAX_MODEL_ROUNDS` (6); các trần khác dùng mặc định trong tracker (20 call, 100.000 ký
  tự, 3 operation).
- `runRound` trong `AgentService`: lặp (`LOOP_REPEATS` = 3) và vượt trần ghi gọi `stopRest`, ném `TurnStop` nên turn
  `failed`; vượt trần call thì đặt `forceFinal` và đi tiếp tới vòng cuối không tool; vượt trần đọc cũng ném `TurnStop`.
- Lượt không có phản hồi (`add-agent-default-context`, commit `046409a`): Main lưu phần tử `progress`
  `EMPTY_TURN_NOTICE`; transcript so `isEmptyTurn` (`shared/contracts/agentEmptyTurn.ts`) để hiện **Tiếp tục**, và
  Tiếp tục gửi turn mới "Tiếp tục" với chế độ và ngữ cảnh của turn đó (`agentStore.continueAfter`).
- `add-agent-session-memory` gửi lại tool call và kết quả của turn trước, nên turn "Tiếp tục" biết turn trước đã
  làm gì.
- Subagent có tracker riêng (`SUBAGENT_LIMITS`), không đổi trong change này.

## Goals / Non-Goals

**Goals:**
- Mọi kiểu chạm trần trong turn chat đi cùng một đường: không chạy call vượt trần, một vòng cuối không tool, turn
  `completed` có Tiếp tục.

**Non-Goals:**
- Không thêm trần chi phí; không đổi trần task dịch hay subagent; không thêm thẻ kế hoạch.

## Decisions

### D1. Dừng bằng turn `completed` + Tiếp tục, không dùng `waiting_user`

Mục 9 của `autonomous-agent.md` viết "chạm trần thì `waiting_user` với Tiếp tục". Change này dùng `completed` kèm
thông báo và Tiếp tục vì:
- `waiting_user` ràng buộc với một call `pending` có digest (requirement "Turn chờ người dùng và continuation ràng
  buộc đúng call"); chạm trần không có call nào để tiếp tục, phải thêm một loại continuation mới.
- Tiếp tục bằng turn mới đã có sẵn và đã có test; nhờ session memory, turn mới thấy đủ tool call của turn trước.
- Turn đóng lại thì session nhận lệnh mới ngay; `waiting_user` giữ session ở trạng thái chờ.

*Phương án bỏ:* thêm continuation `budget` cho `waiting_user`. Bị loại vì cần đổi state machine của turn và IPC
continuation chỉ để làm điều turn mới đã làm được. Cần ghi vào mục 9 của `autonomous-agent.md` rằng quyết định này
thay chữ `waiting_user`.

### D2. Một hàm dừng mềm thay cho `stopRest`

`stopRest` đổi thành dừng mềm: ghi call hiện tại `failed` với lỗi budget/lặp, hủy các call `pending` còn lại của
vòng, đặt `forceFinal` và ghi lý do dừng. `TurnStop` chỉ còn cho lỗi lưu trữ, hủy và lỗi provider. Vòng cuối không
tool chạy như hiện tại. Sau vòng cuối, Main lưu phần tử `progress` "Lượt dừng vì chạm giới hạn: <giới hạn>" thay vì
`EMPTY_TURN_NOTICE` (nếu turn vừa rỗng vừa chạm trần thì chỉ ghi thông báo chạm trần).

### D3. Tiếp tục dùng chung

`shared/contracts/agentEmptyTurn.ts` thêm hằng số tiền tố thông báo dừng và một hàm `offersContinue(turn)` đúng khi
turn rỗng hoặc có thông báo dừng. Transcript và `TurnFooter` dùng hàm này thay cho `isEmptyTurn` khi quyết định hiện
nút. Main và renderer vẫn thống nhất mà không so chuỗi tự do.

### D4. Đếm ghi theo chương

`TurnBudgetTracker.recordWriteOperation()` đổi thành `recordWrite(chapterKey)`: chương đã có trong tập thì cho qua,
chưa có thì kiểm trần 3 rồi thêm. Khóa chương lấy từ handle đích đã resolve (`workId:chapterId`).
`create_translation_task` và `steer_translation_task` không ghi chương trực tiếp nên không tính; `undo_operation`
tính theo chương của operation.

### D5. Lặp

`LOOP_REPEATS` giữ cách đếm digest. Lần thứ ba: call `failed` với `{ code: 'repeat', message: 'Đã gọi <tool> hai lần
với cùng tham số; dùng kết quả trước.' }` và turn đi tiếp. Lần thứ tư: dừng mềm như D2 với lý do lặp.

### D6. Con số

15 vòng và 40 call lấy từ mục 9 của `autonomous-agent.md`. Trần đọc 200.000 ký tự: gấp đôi trần cũ, vì số vòng tăng
2,5 lần nhưng phần lớn lệnh không đọc nhiều. Ghi 3 chương: việc nhiều chương hơn nên đi qua task dịch nền. Các con
số là hằng số trong code, chưa đưa vào Cài đặt.

## Risks / Trade-offs

- [Turn dài tốn tiền hơn] → trần chi phí còn mở; trong lúc chưa có, trần 15 vòng vẫn chặn trên.
- [Model lặp vô ích tới vòng 15] → lỗi lặp ở lần thứ ba nhắc model; lần thứ tư dừng.
- [Prompt dài dần trong turn vì 15 vòng đọc] → giới hạn context của vòng hiện tại vẫn như cũ; trần đọc 200.000 ký tự
  giữ tổng dưới cửa sổ của model nhỏ phổ biến.
- [Tiếp tục lặp lại mãi] → mỗi lần là một turn người dùng tự bấm.

## Migration Plan

Không có migration dữ liệu. Turn `failed` vì budget hay lặp từ trước giữ nguyên trạng thái.
