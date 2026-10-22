## Why

Chủ sản phẩm muốn ô nhập của Trợ lý giống VS Code: ngữ cảnh hiện phía trên ô nhập, có nút **+** để thêm, ngữ cảnh
gợi ý chưa thêm thì hiện mờ (quyết định 13, yêu cầu C1–C8 trong `docs/modules/proposals/chat-ui-vscode.md`). Hiện
danh sách chip bị ẩn bằng `className="hidden"` nhưng vẫn được gửi, nên người dùng không thấy và không bỏ được ngữ
cảnh; không có cách thêm ngữ cảnh nào ngoài chương đang mở; ngữ cảnh chỉ gồm một tác phẩm, một chương và vùng chọn.

## What Changes

- Hàng ngữ cảnh trong khung ô nhập, phía trên chỗ gõ; ẩn khi không có chip.
- Chương đang mở là **ngữ cảnh gợi ý**: ở Ask được thêm sẵn; ở Agent hiện mờ (viền nét đứt, chữ nghiêng, nút +),
  bấm vào thì thành chip thường. Chip gợi ý mờ không được gửi. Vùng chọn đoạn luôn được gửi, kèm chương của nó, và có
  nút ghim để giữ thành chip thường.
- Nút **+ Thêm ngữ cảnh** đứng đầu thanh dưới ô nhập (Ctrl+/), mở picker có ô tìm: tác phẩm, chương, mục glossary
  đã duyệt, cặp xưng hô đã duyệt. Tối đa 10 chip.
- Chip thường: X bên trái, icon, nhãn; Backspace/Delete khi focus thì xóa; bấm thì mở đích.
- Thanh dưới ô nhập theo thứ tự VS Code: + · chế độ · model · Gửi/Dừng; mức quyền ở thanh phụ bên dưới khung (từ
  `fix-agent-chat-permissions`). Placeholder theo chế độ. Mũi tên Lên/Xuống duyệt lịch sử lệnh của session, khôi
  phục cả chữ và chip, không mất bản nháp.
- Ngữ cảnh của lượt mở rộng thành danh sách đính kèm; main cấp handle cho mỗi tác phẩm/chương đính kèm và đưa nội
  dung mục glossary/xưng hô đính kèm vào prompt của lượt.
- Bỏ chip con trỏ (VS Code không có); con trỏ vẫn đi kèm chương khi chương được gửi.

## Capabilities

### New Capabilities

- `agent-composer`: ô nhập Trợ lý, chip ngữ cảnh, ngữ cảnh gợi ý, picker thêm ngữ cảnh và lịch sử lệnh.

### Modified Capabilities

- `agent-conversation`: context chụp lúc gửi gồm danh sách đính kèm và tuân theo trạng thái gợi ý/đã thêm.
- `app-agent-session`: context của lượt là thứ người dùng đã thấy trong ô nhập, không tự gồm tác phẩm và chương
  đang mở.

## Impact

- Contract: `AgentContext` thêm `attachments`; `agentContextSchema`; snapshot turn trả đính kèm để hiện trên bong bóng.
- Main: `contextTarget`/`describeTurn` trong `agentService.ts` cấp nhiều handle và chèn nội dung glossary/xưng hô đã
  duyệt; lệnh tìm ngữ cảnh cho picker (tác phẩm, chương, glossary, xưng hô).
- Renderer: `AgentComposer.tsx`, `contextChips.ts`, adapter workspace, component chip, chip gợi ý, picker, store
  (lịch sử lệnh).
- Phụ thuộc `fix-agent-chat-permissions` (chế độ trên turn, control mức quyền) và nên apply sau
  `add-agent-response-parts` (bong bóng lệnh hiện chip của lượt).
