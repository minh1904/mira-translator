## Context

- `AgentContext` = `{ workId?, chapterId?, caret?, selection? }`, schema yêu cầu chương có tác phẩm.
- Nguồn duy nhất là `ChapterWorkspace` đặt `setActiveContextGetter` cho adapter workspace; ngoài màn chương ngữ
  cảnh rỗng. Composer tính chip bằng `contextChips` và bỏ chip bằng `withoutChips`, rồi ẩn danh sách bằng
  `className="hidden"`.
- Main: `contextTarget()` biến context thành một `ResolvedTarget` với handle `ctx`; `describeTurn()` thêm một dòng
  ngữ cảnh và vùng chọn vào message người dùng. Con trỏ không vào prompt.
- Mục glossary và cặp xưng hô nằm trong work DB (`context_entry`), có trạng thái duyệt; quyết định 9 cấm đưa mục
  chờ duyệt vào prompt.

## Goals / Non-Goals

**Goals:**
- Thứ được gửi luôn là thứ người dùng thấy trên hàng chip.
- Giữ tương thích dữ liệu: turn cũ chỉ có `workId/chapterId/selection/caret` vẫn đọc và chạy lại được.

**Non-Goals:**
- Đính kèm ảnh, file ngoài, đoạn văn tự do.
- Gợi ý ngữ cảnh ngoài màn chương (ví dụ tác phẩm đang xem ở trang tác phẩm): có thể thêm sau bằng cùng cơ chế.
- Bong bóng lệnh và vị trí chip của lượt cũ: dùng component chip của change này nhưng bố cục thuộc
  `add-agent-response-parts`.

## Decisions

**D1. Contract: giữ trường chính, thêm `attachments`.** `AgentContext` thêm `attachments?: AgentAttachment[]`
(tối đa 10), với `AgentAttachment = { kind: 'work', workId } | { kind: 'chapter', workId, chapterId, range? } |
{ kind: 'glossary' | 'addressing', workId, entryId }`; `range` là `{ side, from, to }` của vùng chọn đã ghim. Trường
`workId/chapterId/selection/caret` vẫn là ngữ cảnh chính (chip gợi ý đã thêm hoặc chương của vùng chọn). Lý do giữ:
policy (`contextWorkId`, `namedByUser`), resolver và dữ liệu cũ đều dựa vào trường chính; đổi hết thành danh sách
phẳng là thay đổi lớn không cần cho yêu cầu này. Thay thế bị loại: một danh sách phẳng thay mọi trường.

**D2. Trạng thái gợi ý ở renderer.** Adapter workspace tiếp tục cung cấp ngữ cảnh đang mở. Store composer giữ theo
`draftKey`: `implicitAdded: boolean | null` (`null` = theo chế độ: Ask thêm, Agent mờ) và `attachments`. Hàm thuần
`composeContext({ active, mode, implicitAdded, attachments })` trả `{ chips, context }`; mọi quy tắc của spec (vùng chọn
luôn gửi kèm chương, chip mờ không gửi, chương mới đổi chip gợi ý) nằm trong hàm này và được test riêng. Thay
`contextChips`/`withoutChips`; bỏ chip con trỏ.

**D3. Handle cho đính kèm.** `contextTarget` thành `contextTargets` trả danh sách `[handle, ResolvedTarget]`: `ctx` cho
ngữ cảnh chính (chương, hoặc tác phẩm nếu không có chương), rồi `ctx2…` cho đính kèm tác phẩm/chương theo thứ tự chip.
Policy coi mọi handle `ctx*` như `CONTEXT_HANDLE` (người dùng đã nêu đích). Đính kèm trỏ tới tác phẩm/chương đã xóa
bị bỏ kèm dòng ghi chú cho model.

**D4. Nội dung glossary/xưng hô vào prompt.** `describeTurn` thêm khối "Ngữ cảnh người dùng đính kèm" liệt kê mục
glossary (thuật ngữ, bản dịch, ghi chú) và cặp xưng hô (hai nhân vật, cách xưng, phạm vi chương) đọc từ work DB lúc
chấp nhận turn, chỉ mục đã duyệt. Nội dung được chụp vào `context_json` để lượt tiếp tục và lịch sử không đổi theo dữ
liệu sau này.

**D5. Picker qua một lệnh tìm.** IPC `agent.context.search({ query, workId? })` trả tối đa 50 mục theo nhóm, dùng
service library và context sẵn có, lọc mục chờ duyệt ở main. Picker là popover phía trên nút +, điều hướng bằng phím,
dùng component menu/combobox sẵn có trong `components/ui` theo `DESIGN.md`.

**D6. Lịch sử lệnh.** Lấy từ các turn của session trong store (instruction và `attachments` đã lưu), không lưu riêng.
Bản nháp đang gõ được giữ tạm khi bắt đầu duyệt lịch sử và trả lại khi đi hết.

## Risks / Trade-offs

- [Ở Agent, "dịch chương này" mà chưa bấm chip sẽ không có đích] → hành vi VS Code đã được chấp nhận (quyết định 13);
  system prompt đã bảo model gọi `resolve_target` hoặc hỏi lại khi thiếu đích.
- [Prompt dài hơn khi đính kèm nhiều mục glossary] → trần 10 chip; nội dung mỗi mục ngắn.
- [Chụp nội dung glossary vào `context_json` làm snapshot cũ khác dữ liệu mới] → đúng ý: turn giữ những gì đã gửi.
