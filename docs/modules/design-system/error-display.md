# Hiển thị lỗi

Cập nhật: 2026-10-23 · Trạng thái: **Quyết định đã chốt**, **đã triển khai** ở màn Hoạt động
(`modules/agent/components/ErrorBlock.tsx`). Chưa là quy tắc chung của `DESIGN.md`: chỉ thêm vào đó khi một
màn khác dùng cùng mẫu.

## Mẫu bốn phần

Một lỗi của tác vụ hiện thành bốn phần, theo thứ tự:

1. **Chuyện gì**: một câu nêu chương nếu có, kèm nhãn chữ cho mức và loại ("Lỗi · bị từ chối khóa API").
2. **Vì sao**: `cause` khi nhà cung cấp có bằng chứng, nếu không thì nghĩa chung của mã lỗi. Không đoán.
3. **App đã làm gì**: từ `tried`. Không có số liệu thì bỏ cả dòng.
4. **Bạn có thể**: nút hành động theo loại lỗi, ví dụ "Mở Kết nối AI", "Bỏ qua đoạn bị từ chối", "Hỏi trợ lý
   AI". Gợi ý không có nút (đổi model, giảm cỡ lô) hiện thành chữ.

## Quy tắc

- Mức theo ai cần hành động: **cảnh báo** khi chờ hoặc thử lại thường đủ (giới hạn tốc độ, mạng, hết thời
  gian, sai định dạng), **lỗi** khi cần người dùng. Màu chỉ nhắc lại nhãn chữ.
- Tra từ `code` ổn định ra câu, mức và hành động; không rẽ nhánh theo chuỗi tiếng Việt.
- Nhiều chương cùng `code` và nguyên nhân gom thành một dòng "12 chương chờ hạn mức, thử lại lúc 14:05" mở rộng
  được; bản ghi từng chương vẫn tách riêng. Lỗi dừng cả tác vụ đứng đầu.
- Lỗi lưu trước thay đổi này chỉ có `{ code, message }`: hiện "Lỗi không rõ loại" kèm thông điệp, không suy loại
  từ chuỗi, chỉ có "Thử lại" và "Hỏi trợ lý AI".
- Chi tiết kỹ thuật (thông điệp gốc, phần thân phản hồi đã che khóa) nằm trong tầng lần chạy, mở rộng được và
  có "Sao chép chi tiết". Trợ lý AI không bao giờ nhận `detail`.
