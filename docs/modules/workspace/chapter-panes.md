# Bố cục hai pane ở màn dịch chương

Cập nhật: 2026-10-08 · Trạng thái: **Quan sát** (phần 1), **Đã chốt** (phần 2), **Đã triển khai trong
working tree** (phần 3). Chủ trì: chủ sản phẩm.

## Câu hỏi chương này trả lời

Màn Chương đặt bản gốc và bản dịch cạnh nhau, mỗi bên cuộn riêng, không gì nối hai bên. Mở panel AI
thì thành ba cột và hai editor còn chừng 350–400 px ở cửa sổ 1280 px. Bản gốc nên bật, tắt, co lại ra
sao, và làm sao để người dịch không lạc chỗ giữa hai bên?

## 1. Các sản phẩm khác (quan sát, đọc ngày 2026-10-08)

| Sản phẩm | Cách đặt bản gốc | Nguồn |
| --- | --- | --- |
| Crowdin | Đổi được ba, bốn chế độ: Comfortable (gốc của chuỗi đang dịch ở trên, ô dịch ở dưới), Side-by-side, Multilingual. Panel danh sách ẩn bằng `Ctrl+[`; panel xem trước tệp ở đáy | [Tài liệu](https://support.crowdin.com/online-editor/) |
| Immersive Translate | Mặc định song ngữ xen kẽ (đoạn dịch dưới đoạn gốc); có chế độ chỉ bản dịch, giữ `Shift` khi rê để hiện gốc của đoạn, `Alt+A` đổi gốc/dịch | [Tài liệu](https://immersivetranslate.com/en/docs/usage/) |
| Trados Studio | Chỉ có gốc trái, dịch phải; người dùng xin bố cục trên/dưới nhiều năm chưa được | [Diễn đàn RWS](https://community.rws.com/product-groups/trados-portfolio/trados-studio/f/studio/14403/not-a-query-but-a-suggestion) |
| memoQ | Lưới gốc/dịch cộng panel xem trước; `F11` đổi qua các bố cục, kéo đổi cỡ pane | [ProZ](https://arm.proz.com/forum/memoq_support/242842-how_to_control_the_different_panes_in_the_translation_editor.html) |
| Word, Atlantis | "View Side by Side" với cuộn đồng bộ bật/tắt; người dịch dùng để đặt gốc cạnh bản dịch | [Atlantis](https://www.atlantiswordprocessor.com/en/help/atlantips_simulating_parallel_columns_side_by_side.htm) |
| DeepL | Rê lên một câu thì câu tương ứng bên kia sáng lên | **Theo trí nhớ, chưa kiểm** |

Mẫu lặp lại: không ai khóa người dịch vào một bố cục; bản gốc là thứ tham chiếu nên ẩn hoặc thu được;
khi hai bên cạnh nhau thì có cách giữ chỗ (cuộn cùng hoặc làm sáng đoạn tương ứng).

## 2. Hướng đã chọn

Ba hướng được đưa ra: **A** giữ hai cột và thêm công cụ cho cột gốc; **B** thêm chế độ xem Song song ·
Xen kẽ · Chỉ bản dịch; **C** lấy bản dịch làm chính, gốc thành dải tham chiếu vài đoạn. **Chủ sản phẩm
chọn A ngày 2026-10-08.** B và C chưa làm; B cần logic khớp đoạn vì bản dịch có thể tách hoặc gộp đoạn.

## 3. Hành vi đã có

- **Thu gọn bản gốc:** nút ở đầu pane gốc hoặc `Ctrl+\`. Pane gốc thành dải dọc 32 px ghi "Bản gốc",
  bấm để mở lại. Editor gốc vẫn còn trong cây, nên con trỏ và lịch sử hoàn tác không mất.
- **Thu gọn bản dịch:** nút ở đầu pane dịch hoặc `Ctrl+Shift+\`, thành dải dọc "Bản dịch" ở mép phải; dùng khi
  chỉ đọc bản gốc. Thu được cả hai pane cùng lúc; khi đó vùng giữa ghi rõ và có hai nút Hiện bản gốc, Hiện bản dịch. Khi panel Hỏi AI mở,
  bản dịch luôn hiện (AI đọc và đánh dấu đề xuất trong đó) và nút thu bị khóa.
- **Chia lại bề rộng:** kéo vạch giữa hai pane (20–80 % cho bản gốc), phím mũi tên khi vạch có focus,
  bấm đúp để chia đôi.
- **Cuộn cùng nhau:** nút liên kết ở đầu pane gốc, bật sẵn. Hai pane khớp theo **số đoạn** (ADR-005: mỗi
  dòng không trống là một đoạn) và vị trí trong đoạn. Chỉ pane người dịch vừa cuộn, bấm hoặc gõ mới kéo
  pane kia, để cuộn không dội ngược.
- **Đoạn tương ứng:** con trỏ đứng ở đoạn thứ *n* bên nào thì đoạn thứ *n* bên kia có nền nhạt.
- **Panel AI:** mở panel mà hai editor còn dưới 420 px mỗi bên thì bản gốc tự thu; đóng panel thì mở
  lại. Lần thu này không được nhớ như lựa chọn của người dịch.
- Thu gọn, tỉ lệ và cuộn cùng được nhớ trên máy (`localStorage`), dùng chung mọi chương và tác phẩm.

**Giới hạn:** khớp theo số đoạn nên lệch khi bản dịch tách hoặc gộp đoạn so với bản gốc; lúc đó tắt
cuộn cùng. Chưa có cách khớp tốt hơn vì Mira cố ý không nối hàng giữa hai bên.

Nguồn triển khai: [`ChapterPanes`](../../../src/renderer/src/modules/workspace/chapter-screen/ChapterPanes.tsx),
[`PaneDivider`](../../../src/renderer/src/modules/workspace/chapter-screen/PaneDivider.tsx),
[`paragraphLink`](../../../src/renderer/src/modules/workspace/chapter-editor/paragraphLink.ts),
[`paneLayoutStore`](../../../src/renderer/src/modules/workspace/store/paneLayoutStore.ts).

---

[Phiên làm việc theo tác phẩm](README.md) · [Mục lục module](../README.md)
