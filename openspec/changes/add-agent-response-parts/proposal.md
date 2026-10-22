## Why

Quyết định 11 chốt chat Trợ lý theo VS Code: câu trả lời là chuỗi phần tử theo đúng thứ tự xảy ra (suy nghĩ,
tool, chữ, tool, chữ), mỗi tool là một dòng có trạng thái và mở được đầu vào/kết quả. Hiện transcript chỉ hiện
activity có nhãn `Subagent:`, mọi tool khác bị ẩn; chữ của mọi vòng bị nối thành một chuỗi nên không dựng lại được
thứ tự; suy nghĩ của lượt mới không được lưu; subagent chạy tool mà không lưu, không qua ngân sách. Không sửa được
bằng giao diện vì main chưa phát và chưa lưu đủ dữ liệu (yêu cầu C9–C17, C19, C21 trong
`docs/modules/proposals/chat-ui-vscode.md`).

## What Changes

- Main phát sự kiện stream riêng cho tool call: bắt đầu, đổi trạng thái, kết thúc; mang ID call, tên, câu mô tả
  thì hiện tại và thì quá khứ, kết quả rút gọn. Call bị policy từ chối, hết ngân sách hoặc bị Autopilot bỏ qua
  cũng phát sự kiện.
- Lưu các phần của câu trả lời theo thứ tự (chữ theo vòng, suy nghĩ theo vòng kèm thời lượng, tham chiếu tool
  call) trong library DB; snapshot session trả các phần này và danh sách tool call của turn. Kết quả đầy đủ của
  một tool call đọc qua lệnh riêng khi người dùng mở.
- Capability khai báo câu mô tả "đang làm" và "đã làm" từ tham số và đích.
- Subagent chạy tool qua cùng đường lưu, policy chỉ-đọc, phát hiện lặp và một ngân sách riêng có trần; tool con
  gắn với call `run_subagent` cha; bản tóm tắt là chữ của vòng cuối.
- Transcript mới theo VS Code: lệnh là bong bóng căn phải; câu trả lời dựng từ các phần theo thứ tự; chữ chạy theo
  tốc độ từ; dòng "đang làm" ở cuối; khối suy nghĩ cao tối đa có gom tool; dòng tool mở được Đầu vào/Kết quả; thẻ
  duyệt và operation nằm tại vị trí tool của chúng; dòng subagent mở ra thấy tool con; chân lượt có Sao chép, Thử
  lại, model và usage; lỗi và dừng hiện đúng trạng thái.
- Bỏ khỏi transcript cơ chế lọc nhãn `Subagent:`, emoji; xóa `AgentFollowups` (gợi ý gõ cứng, chưa dùng).
- **BREAKING (nội bộ IPC):** snapshot session thêm `parts` và `toolCalls`; thêm sự kiện stream `tool-call`.

## Capabilities

### New Capabilities

- `agent-response-parts`: lưu và phát câu trả lời thành chuỗi phần tử có thứ tự, gồm tool call và subagent.

### Modified Capabilities

- `app-agent-activity`: transcript dựng từ chuỗi phần tử thay vì một timeline activity tách khỏi câu trả lời;
  streaming theo tốc độ từ; suy nghĩ được lưu và có giới hạn chiều cao; tự cuộn theo mọi thay đổi chiều cao.
- `agent-conversation`: snapshot session gồm phần câu trả lời và tool call; giao diện chat theo bố cục VS Code,
  side panel chương chỉ còn Trợ lý.

## Impact

- Library DB: migration kế tiếp thêm bảng `agent_turn_part`, cột `agent_tool_call.parent_call_id`; fixture schema.
- Main: `agentService.ts` (vòng chạy, `execute`, `executeSubagent`), capability registry (câu mô tả), repository,
  IPC `agent` (lệnh đọc chi tiết tool call), contract stream.
- Renderer: `agentStore.ts`, `AgentTranscript.tsx` viết lại thành các phần; component mới cho dòng tool, khối suy
  nghĩ, dòng subagent, dòng đang làm, chân lượt; `DeltaBuffer` thay bằng bộ dựng theo tốc độ từ.
- Phụ thuộc `fix-agent-chat-permissions` (trạng thái `autopilot_skipped`, thẻ duyệt ba lựa chọn).
