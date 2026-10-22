## 1. Contract và main

- [x] 1.1 `AgentContext.attachments` và schema (tối đa 10, các loại work/chapter có `range`/glossary/addressing); test schema
- [x] 1.2 `contextTargets` cấp `ctx`, `ctx2…`; policy coi mọi `ctx*` là đích người dùng nêu; bỏ đính kèm trỏ tới đích đã xóa kèm ghi chú
- [x] 1.3 `describeTurn` chèn nội dung glossary và xưng hô đã duyệt, chụp vào `context_json`; mục không còn duyệt bị bỏ kèm ghi chú
- [x] 1.4 IPC `agent.context.search` trả tác phẩm, chương, glossary, xưng hô đã duyệt theo nhóm
- [x] 1.5 Test: hai chương đính kèm nhận `ctx`/`ctx2`; glossary đính kèm vào prompt; mục chờ duyệt không vào prompt và không có trong kết quả tìm; turn cũ không có `attachments` vẫn chạy

## 2. Quy tắc ngữ cảnh ở renderer

- [x] 2.1 Hàm thuần `composeContext` theo D2, thay `contextChips`/`withoutChips`, bỏ chip con trỏ
- [x] 2.2 Test: Agent chip mờ không gửi; Ask thêm sẵn; vùng chọn luôn gửi kèm chương; ghim vùng chọn; đổi chương giữ chip thường; trần 10 chip; không thêm trùng
- [x] 2.3 Store composer giữ `implicitAdded` và `attachments` theo `draftKey`, xóa sau khi gửi thành công

## 3. Component

- [x] 3.1 Hàng chip trong khung ô nhập phía trên chỗ gõ, ẩn khi rỗng; gỡ `className="hidden"`
- [x] 3.2 Chip gợi ý: mờ (viền nét đứt, chữ nghiêng, nút +), hover viền liền, bấm/Enter/Space thêm và focus ô nhập; khi đã thêm có X
- [x] 3.3 Chip thường: X bên trái, icon, nhãn, Backspace/Delete xóa, bấm mở đích
- [x] 3.4 Chip vùng chọn không mờ, có nút ghim
- [x] 3.5 Nút + đầu thanh (Ctrl+/) và picker có ô tìm, nhóm, điều hướng phím, Esc/bấm lại để đóng, báo khi đủ 10 chip
- [x] 3.6 Thanh công cụ theo thứ tự + · chế độ · model · Gửi/Dừng, co giãn giữ nút Gửi; placeholder theo chế độ
- [x] 3.7 Lịch sử lệnh bằng Lên/Xuống ở đầu/cuối ô, khôi phục chữ và chip, trả lại bản nháp
- [x] 3.8 Test component: bàn phím, accessible name, trạng thái mờ, picker; cập nhật `AgentSurfaces.test.ts`

## 4. Hoàn tất

- [x] 4.1 Cập nhật trạng thái C1–C8 trong `docs/modules/proposals/chat-ui-vscode.md`
- [x] 4.2 Chạy `node scripts/check.mjs`
