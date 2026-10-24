# Xuống dòng và trình bày đoạn của bản dịch

Cập nhật: 2026-10-24 · Trạng thái: **Quan sát** (phần 1), **Đã chốt** (phần 2), **Đã triển khai trong
working tree** (phần 3). Chủ trì: chủ sản phẩm.

## Câu hỏi chương này trả lời

Bản dịch nên giữ dòng trống, ngắt cảnh của bản gốc ra sao, và pane chương nên trình bày đoạn theo kiểu
trang đọc truyện (Hako) hay kiểu sách in có bản quyền?

## 1. Quan sát (đọc ngày 2026-10-24)

- **Đã kiểm:** khung chương của docln (Hako) có class `long-text text-justify`, tức căn đều hai bên.
  Thân chương được mã hóa (`chapter-c-protected`, `xor_shuffle`) nên không đọc được; Mira không giải mã.
  Ví dụ: [Tearmoon ch.17](https://docln.net/truyen/6624-chuyen-ve-de-quoc-tearmoon/c63346-chuong-17-bien-nien-su-ve-cong-chua-thanh-nu-mia).
- **Theo trí nhớ, chưa kiểm:** Hako và bản dịch web để mỗi đoạn thành một khối có khoảng cách, không thụt
  đầu dòng, giữ dòng trống ngắt nhịp và ký hiệu ngắt cảnh của bản gốc. Light novel in (IPM, Amak, Thái Hà)
  thụt dòng đầu, không cách đoạn, bỏ gần hết dòng trống, ký hiệu ngắt cảnh đặt giữa trang.
- Không tìm thấy quy định trình bày công khai của Hako hay nhà xuất bản (xem thêm
  [evidence](../context/evidence.md)).
- Dấu thoại đã chốt ở [prompt-system](../context/prompt-system.md): 「」 → “ ”, 『』 → ‘ ’.

## 2. Hướng đã chọn

Chủ sản phẩm chốt ngày 2026-10-24:

- **Dữ liệu** bản dịch giữ cấu trúc bản gốc: dòng trống giữa hai câu được giữ, tối đa một dòng trống.
  Bỏ dòng trống thì không lấy lại được, giữ thì lúc xuất vẫn gộp được.
- **Pane chương** trình bày kiểu đọc trên màn hình như Hako: cách đoạn, căn đều; không theo kiểu sách in.
- **Kiểu sách in** (thụt đầu dòng, gộp dòng trống) để sau, là tùy chọn khi xuất DOCX/PDF. Chưa làm.

## 3. Hành vi đã có

- Ghép câu dịch vào chương: hai câu gốc khác dòng thì xuống dòng; giữa chúng có dòng trống thì bản dịch có
  một dòng trống. Ghi câu vào giữa hai câu đã dịch thì thay khoảng cách cũ bằng khoảng cách của từng cặp.
  Xóa một câu thì giữ khoảng xuống dòng dài hơn ở hai bên, nên dòng trống không mất.
- Áp dụng cho bản dịch AI mới và câu sửa ở mode Từng câu. Bản dịch đã có từ trước không tự đổi; dịch lại
  chương để có dòng trống.
- Hai pane cách đoạn `--mira-space-xs` và căn đều; dòng trống không cộng thêm khoảng cách đoạn.
- Khớp đoạn và cuộn cùng không đổi: dòng trống không phải đoạn (ADR-005).

Nguồn triển khai: [`sentenceRows`](../../../src/main/infra/storage/sentenceRows.ts),
[`TextEditor`](../../../src/renderer/src/modules/workspace/chapter-editor/TextEditor.tsx).

---

[Phiên làm việc theo tác phẩm](README.md) · [Mục lục module](../README.md)
