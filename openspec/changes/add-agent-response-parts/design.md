## Context

Hiện trạng tại `d209122` (chi tiết ở `docs/modules/proposals/chat-ui-vscode.md`, mục Nền kỹ thuật):

- Stream có `answer-delta`, `reasoning-delta`, `activity-start/finish`, `operation`, terminal. Tool call đến nguyên
  khối trong sự kiện `tool-calls` cuối mỗi vòng, được lưu bằng `insertToolCalls` nhưng không phát ra renderer.
- `answer += text` mọi vòng, `agent_turn.answer` là chuỗi nối; `roundMessages` dựng lại lịch sử model với
  `content: ''` cho message assistant có tool call. `agent_turn.reasoning` không được ghi cho lượt mới.
- Activity có nhãn tiếng Việt từ `activityAdapter` của capability nhưng không gắn với tool call; call bị từ chối ở
  `prepareCall` hay hết ngân sách không có activity.
- `executeSubagent` chạy tool trực tiếp qua `registry.execute`, không lưu, không qua budget, `turnRound` đánh lại
  từ 0 và `sessionId` dự phòng `'subagent'`.
- Renderer: `DeltaBuffer` commit cả chuỗi mỗi 40ms; transcript có thứ tự cố định và chỉ hiện activity có nhãn
  `Subagent:`.

## Goals / Non-Goals

**Goals:**
- Một nguồn thứ tự duy nhất cho câu trả lời, dùng chung cho stream trực tiếp và snapshot.
- Không đổi nội dung model nhận làm lịch sử (câu trả lời đã lưu), để chất lượng trả lời không đổi theo change này.
- Renderer dựng transcript chỉ từ phần tử và tool call, không suy thứ tự từ nhãn.

**Non-Goals:**
- Stream tham số tool từng phần: provider hiện trả tool call nguyên khối; trạng thái "đang nhận tham số" của VS Code bị bỏ.
- Ô nhập, chip ngữ cảnh (change `add-agent-composer-context`).
- Thẻ câu hỏi mới, thanh chương đã sửa, checkpoint (change `add-agent-questions-and-checkpoints`).
- Gợi ý tiếp theo do model sinh: VS Code lấy từ participant; Mira chưa có nguồn, nên xóa bản gõ cứng và để sau.

## Decisions

**D1. Bảng `agent_turn_part`.** Cột: `id`, `turn_id` (cascade), `seq INTEGER` (unique theo turn, tăng dần),
`round INTEGER`, `kind TEXT CHECK (kind IN ('text','reasoning','tool_call','progress'))`, `text TEXT`,
`tool_call_id TEXT` (tham chiếu `agent_tool_call.id`), `duration_ms INTEGER`, `created_at`, `updated_at`. Mỗi vòng:
một phần `reasoning` nếu có, một phần `text` nếu có, rồi một phần `tool_call` cho mỗi call theo thứ tự model trả.
Thông báo tiến trình hiện đang là activity info (bỏ lịch sử, model không có tool) thành phần `progress`.
Thay thế đã cân nhắc: lưu chữ vào `agent_tool_call` theo vòng — bị loại vì vòng cuối không có call và vì suy nghĩ
cũng cần chỗ.

**D2. Ghi phần chữ theo lô, không theo từng delta.** Chữ và suy nghĩ của vòng được giữ trong bộ nhớ và ghi một lần
khi vòng kết thúc (trước `insertToolCalls`), cùng transaction với các phần `tool_call` của vòng. Khi turn bị hủy hoặc
lỗi giữa vòng, phần chữ đã nhận được ghi trong nhánh kết thúc. Stream trực tiếp vẫn dùng `answer-delta` và
`reasoning-delta`, thêm trường `round` để renderer biết delta thuộc phần nào. `agent_turn.answer` vẫn được ghi như
cũ; `agent_turn.reasoning` được ghi bằng nối các phần suy nghĩ để tương thích dữ liệu cũ.

**D3. Sự kiện `tool-call`.** Một kind mới trong `agentStreamEventSchema`:
`{ kind: 'tool-call', round, toolCallId, parentToolCallId?, name, state, invocationMessage, pastTenseMessage?,
summary?, reason? }`. Phát khi lưu call (trạng thái từ quyết định: `waiting_user`, `running`, hoặc kết thúc ngay khi
bị từ chối), khi bắt đầu chạy, và khi kết thúc. `activity-*` vẫn phát cho operation và tiến trình để không phá
`JobsScreen`/`OperationLog`; transcript không dùng activity nữa.

**D4. Câu mô tả từ capability.** Đổi `activityAdapter` thành `describe({ args, target }) →
{ invocation, pastTense, kind }`; registry có mặc định "Đang chạy {tên}" / "Đã chạy {tên}". Câu mô tả được tính khi
lưu call và lưu vào cột mới `agent_tool_call.messages_json`, nên snapshot không phải tính lại và không phụ thuộc đích
còn tồn tại.

**D5. Kết quả rút gọn và lệnh đọc chi tiết.** `summary` là chuỗi tối đa 200 ký tự do capability trả (mặc định: số
ký tự kết quả hoặc thông báo lỗi). Snapshot trả `toolCalls[]` với tham số và `summary`, không có kết quả đầy đủ. Lệnh
IPC `agent.toolCalls.get({ toolCallId })` trả `result_json` đã lưu. Lý do: kết quả `read_chapter` tới 20.000 ký tự
mỗi call, đưa hết vào snapshot làm mỗi lần `refresh()` nặng.

**D6. Subagent qua cùng đường chạy.** Tách thân vòng chạy thành hàm dùng chung nhận `scope: { parentToolCallId,
budget, capabilities }`. Subagent dùng hàm đó với `CallBudget` riêng (4 vòng, 10 call, 60.000 ký tự, 0 ghi), bản đồ
capability chỉ đọc, `resolve_target` của subagent trả ứng viên khi mơ hồ. Tool call con lưu vào `agent_tool_call`
với `parent_call_id` (cột mới) và `round` của vòng subagent; phần tử của subagent không vào `agent_turn_part` của
turn mà được dựng từ tool call con. Log model dùng `sessionId` của session thật và `turnRound` dạng
`{vòng cha}.{vòng con}` (chuỗi) hoặc số không trùng; chọn theo kiểu của `chatService` khi apply. Bản tóm tắt là chữ
của vòng cuối.

**D7. Renderer dựng theo phần tử.** Store giữ `parts[turnId]` và `toolCalls[id]`; delta trực tiếp cập nhật phần tạm
của vòng hiện tại, snapshot thay thế khi đọc lại (phần đã lưu thắng). Component: `ResponseParts` (lặp phần tử),
`MarkdownPart` (chữ, dựng theo tốc độ từ), `ThinkingPart`, `ToolCallRow`, `SubagentRow`, `WorkingRow`, `TurnFooter`,
bong bóng lệnh. Thẻ duyệt và operation được gắn theo `toolCallId` (operation có `commandId = 'tool-' + toolCallId`).

**D8. Dựng chữ theo tốc độ từ.** Hàm thuần `wordsToRender({ rendered, elapsedMs, rate })` và ước tốc độ từ số từ
đến trên thời gian, kẹp 40–2000, mặc định 8, tối thiểu 80 khi xong (theo `getProgressiveRenderRate` của VS Code).
Một `requestAnimationFrame` cho cả transcript, chỉ chạy khi có phần đang dựng; reduced motion thì hiện hết. Thay
`DeltaBuffer` (giữ `safeTailFence` thành hàm tự đóng fence).

**D9. Tự cuộn theo chiều cao.** Dùng `ResizeObserver` trên khối nội dung thay cho effect theo `streamingAnswer`, ngưỡng
2px, nút "Về mới nhất".

## Risks / Trade-offs

- [Lượt cũ không có phần tử] → snapshot dựng phần tử ảo từ dữ liệu cũ: một phần `reasoning` từ `agent_turn.reasoning`
  nếu có, các tool call theo `round`, rồi một phần `text` từ `answer`. Thứ tự gần đúng; ghi rõ trong code là dữ liệu cũ.
- [Ghi chữ theo vòng: app sập giữa vòng mất chữ đang stream] → chấp nhận; turn đó vốn chuyển `interrupted` khi mở lại.
- [Thêm kind sự kiện làm `validateAgentEventSequence` và test e2e thay đổi] → cập nhật test chuỗi sự kiện cùng change.
- [Subagent có ngân sách riêng cộng thêm vào turn] → tổng chi phí vẫn bị trần token của model chặn; trần riêng nhỏ.

## Migration Plan

Migration library kế tiếp sau `fix-agent-chat-permissions`: tạo `agent_turn_part`, thêm `agent_tool_call.parent_call_id`
và `agent_tool_call.messages_json`; không backfill (dựng phần tử ảo khi đọc). Fixture schema và test migration theo mẫu.
