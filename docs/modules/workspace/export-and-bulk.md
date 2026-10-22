# Xuất chương, xuất hàng loạt và chọn nhiều chương

Cập nhật: 2026-10-08 · Trạng thái: **Đã triển khai trong working tree**. Chủ trì: chủ sản phẩm.

## Câu hỏi chương này trả lời

Khóa bản gốc và xuất chương nằm đâu trên màn Chương, và người dịch xuất nhiều chương hay xử lý nhiều
chương một lúc bằng cách nào?

## Bối cảnh

Trước ngày 2026-10-08: nút "Sửa bản gốc" nằm thường trực ở đầu pane gốc, "Thay bản gốc" ở menu
chương; xuất chương có hai lối (nút ở pane dịch và menu chương); hộp xuất báo đường dẫn rồi tự đóng sau
1,5 giây. Main đã nhận `chapterIds` và hai chế độ gộp/tách, nhưng hộp "Xuất tác phẩm" luôn xuất tất cả,
và chương chưa dịch bị bỏ mà không báo. Chủ sản phẩm chọn làm cả ba mức cải thiện cùng lúc.

## Hành vi đã có

**Bản gốc ở màn Chương**
- Khóa sẵn như các CAT tool. Đầu pane gốc có ổ khóa cạnh tên (mở khóa thì màu cảnh báo) thay cho chữ
  "Đã khóa, chỉ đọc".
- "Sửa bản gốc" và "Thay bản gốc…" gom vào menu ⋯ riêng của pane gốc; menu chương còn Dịch bằng AI,
  Xuất chương, Về tác phẩm. Dải cảnh báo khi đang sửa có nút "Khóa lại".

**Xuất**
- Một lối xuất chương: menu ⋯ của chương. Chương chưa có bản dịch thì nút Xuất bị khóa và hộp nói lý do.
- Hộp xuất tác phẩm có **Phạm vi**: Tất cả chương · Từ chương … đến … · Các chương đang chọn (khi mở từ
  danh sách). Dòng xem trước nói số chương sẽ xuất và liệt kê số chương chưa dịch bị bỏ qua
  (`3, 7, 12–15`). Nút ghi số chương: "Xuất 120 chương".
- Đang xuất có thanh tiến độ theo chương và nút **Dừng**; tệp đã ghi vẫn giữ.
- Xong thì hộp đóng, toast báo số chương, chương bị bỏ qua và nút **Mở thư mục**. Main chỉ mở đường dẫn
  mà chính nó vừa ghi trong phiên.
- Nhãn định dạng rút gọn; định dạng, cách lưu, khổ trang, trình bày đoạn và hai công tắc được nhớ trên máy.
- Xuất mỗi chương một tệp: số đầu tên tệp đệm theo tổng số chương, ít nhất ba chữ số (`0007 - Tên.docx`
  khi truyện có từ 1000 chương), để thư mục xếp đúng thứ tự.

**Chọn nhiều chương ở danh sách**
- Mỗi dòng có ô chọn; Shift-click chọn cả đoạn giữa hai lần bấm theo thứ tự đang lọc; ô ở đầu bảng chọn
  cả trang. Lựa chọn giữ qua trang và bộ lọc.
- Có chọn thì hiện thanh dính dưới danh sách: "Đã chọn N chương" · Bỏ chọn · **Xuất…** · **Xóa…**.
- Xóa nhiều chương hỏi một lần, nói bao nhiêu chương có chữ sẽ mất và cho sao lưu trước; xóa lần lượt,
  dừng ở lỗi đầu tiên.

## Chưa làm

- **Dịch bằng AI cho nhiều chương** chưa có trên thanh chọn: thuộc
  [giai đoạn tác vụ nhiều chương](../proposals/agent-roadmap.md#2-tác-vụ-dịch-nhiều-chương). Thanh chọn
  là một lối tạo task sau khi workflow bền đã có.
- **Chuyển nhiều chương tới vị trí khác** chưa có; vị trí đích của một nhóm không liền nhau cần chốt.

Nguồn triển khai: [`ExportDialog`](../../../src/renderer/src/modules/export/ExportDialog.tsx),
[`exportScope`](../../../src/renderer/src/modules/export/exportScope.ts),
[`ExportService`](../../../src/main/services/export/exportService.ts),
[`ChaptersArea`](../../../src/renderer/src/modules/workspace/work-detail/ChaptersArea.tsx),
[`ChapterPanes`](../../../src/renderer/src/modules/workspace/chapter-screen/ChapterPanes.tsx).

---

[Phiên làm việc theo tác phẩm](README.md) · [Mục lục module](../README.md)
