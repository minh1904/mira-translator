# Quyết định hiện hành — Trợ lý AI

Ngày: 2026-10-22 · Trạng thái: **Đã chốt về hướng sản phẩm; triển khai theo roadmap**. Ngày 2026-10-22 chủ
sản phẩm chốt lấy UX/UI chat của VS Code làm chuẩn và cho phép sửa các quyết định cũ mâu thuẫn với chuẩn đó.

## Sản phẩm

1. **Một Trợ lý cho toàn ứng dụng.** Người dùng có thể mở chat từ Trang chủ hoặc khi đang đọc một
   chương. Lịch sử session tập trung trong `library.db`, không chia thành các hộp chat độc lập theo
   tác phẩm.
2. **Ngữ cảnh đi theo từng lượt và do người dùng thấy, sửa được trước khi gửi.** Lượt mang các chip ngữ cảnh
   đang có trong ô nhập và vùng chọn đoạn, cùng tác phẩm đang mở làm mặc định (quyết định 13). Session không
   đổi khi người dùng chuyển màn;
   target resolver xác định đích thao tác và yêu cầu làm rõ khi có nhiều khả năng hợp lệ.
3. **Agent chọn capability, workflow bền chạy việc dài.** Model hiểu ý định và chọn công cụ được đăng
   ký. Việc nhiều chương dùng workflow tất định, có trạng thái lưu bền; không để model tự điều khiển
   vòng lặp hàng chục chương.
4. **Turn và task là hai vòng đời khác nhau.** Turn giữ hội thoại. Task giữ tiến độ, ngân sách,
   pause/cancel/retry và phục hồi sau khi mở lại app. Một task có thể tiếp tục khi người dùng chat ở
   nơi khác.
5. **Mọi thao tác ghi phải kiểm soát được.** Agent chỉ ghi qua capability domain có target đã resolve,
   revision guard, write lease, journal/checkpoint và Undo. Kết quả lỗi phải hiện là lỗi; không được
   trả lời như đã hoàn tất.
6. **Usage lấy từ provider.** Tổng token và chi phí chỉ dựa trên usage provider báo; dữ liệu thiếu
   phải hiện là chưa đầy đủ, không thay bằng số 0 hoặc counter suy đoán.

## Giao diện chương

7. **Side panel màn chương chỉ chứa chat Trợ lý**, giống panel Chat của VS Code (sửa ngày 2026-10-22; trước
   đó panel có hai chế độ Trợ lý và Ngữ cảnh). Trên cửa sổ hẹp, panel trở thành drawer phủ từ bên phải.
8. **Ngữ cảnh dịch được quản lý ở khu Context cấp tác phẩm**: xem mục đang áp dụng, duyệt, import, lọc
   nâng cao và thao tác hàng loạt (sửa ngày 2026-10-22; trước đó có chế độ Ngữ cảnh nhanh trong side panel).
9. **Pending không đi vào prompt; tên riêng đủ bằng chứng được dùng tạm.** Mục context chờ duyệt phải có
   trạng thái nhìn thấy rõ và không được gửi cho model cho tới khi được duyệt. Ngoại lệ (chủ sản phẩm chốt
   2026-10-22, cách A của [Agent toàn diện](autonomous-agent.md) mục 7): tên riêng đủ điều kiện thì thành
   **dùng tạm**, vào prompt kèm đánh dấu và có truy vết theo chương, để task dịch không phải dừng chờ duyệt.
   Cặp xưng hô, mục khái niệm và mục xung đột không bao giờ dùng tạm. **Chưa triển khai**: code hiện vẫn
   chặn mọi mục pending.

## Dữ liệu cũ

10. Proposal, session và turn theo tác phẩm đã có vẫn phải đọc được. Accept/Deny và liên kết
    `legacyRef` chỉ phục vụ dữ liệu hoặc luồng legacy. Lượt agent mới dùng operation trực tiếp có
    checkpoint và Undo; không tạo thêm proposal chỉ để mô phỏng agent.

## Giao diện chat (2026-10-22)

Chi tiết từng yêu cầu, mã `C<n>` và nguồn VS Code nằm ở [Giao diện chat theo VS Code](chat-ui-vscode.md).

11. **VS Code là chuẩn UX/UI của chat.** Cấu trúc, thứ tự, trạng thái và tương tác của panel chat làm theo
    VS Code. Khái niệm VS Code không có trong Mira (file, terminal, git, MCP, custom agent) thì ánh xạ sang
    đối tượng của Mira hoặc bỏ. Khi một quyết định khác mâu thuẫn với chuẩn này, sửa quyết định đó.
12. **Hai chế độ Ask và Agent.** Ask chỉ có tool đọc; Agent có đủ tool. Không làm chế độ Edit của VS Code:
    sửa một chương đã là việc của Agent với đích có Undo. Chế độ áp dụng cho mọi lượt, kể cả lượt tiếp tục
    sau khi duyệt hoặc trả lời câu hỏi.
13. **Ngữ cảnh hiện phía trên ô nhập, thêm bằng nút +.** Chương đang mở là ngữ cảnh gợi ý: ở Ask được thêm
    sẵn; ở Agent hiện mờ (viền nét đứt, chữ nghiêng) và chỉ được gửi khi người dùng bấm vào chip. Vùng
    chọn đoạn luôn được gửi. **Tác phẩm đang mở luôn là ngữ cảnh mặc định của lượt, không cần bấm chip**
    (chủ sản phẩm chốt 2026-10-22): agent chỉ sang tác phẩm khác khi người dùng nêu rõ, và hỏi lại khi lệnh
    mơ hồ. Lý do: log ngày 2026-10-22 cho thấy mọi lượt đều có `context_json` rỗng dù đang mở chương, nên
    agent tốn 3–4 vòng để tự tìm ra tác phẩm. **Đã triển khai trong code** (OpenSpec
    `add-agent-default-context`): chip tác phẩm đứng đầu hàng chip ở cả Ask và Agent, không mờ, tắt được cho
    phiên hiện tại; chip chương vẫn mờ ở Agent. Chưa đo lại số vòng trên app thật với Gemini (task 6.2 của
    change).
14. **Ba mức quyền: Mặc định, Cho phép tất cả, Autopilot.** Mặc định hỏi theo bảng policy. Cho phép tất cả tự
    duyệt mọi lời gọi cần duyệt. Autopilot là Cho phép tất cả cộng tự trả lời câu hỏi bằng đáp án mặc định.
    Hai mức trên Mặc định phải qua hộp xác nhận và chỉ có hiệu lực trong phiên hiện tại. Mọi mức đều không
    vượt qua `deny` của policy.

    *Sửa 2026-10-22 (chủ sản phẩm chốt, chưa triển khai):* Autopilot không còn bỏ qua task dịch nhiều chương
    và ghi vào đích không nêu. Nó tự duyệt thẻ kế hoạch khi chi phí dưới trần, vượt trần thì hỏi, và chỉ bỏ
    qua việc luôn hỏi (xóa, ghi đè đoạn người dùng sửa tay, ghi sang tác phẩm khác, export), kèm lý do gửi lại
    model. "Đích do người dùng nêu" được thay bằng **phạm vi lệnh**: tác phẩm đang mở hoặc tác phẩm được nêu
    tên; ghi vào chương bất kỳ trong phạm vi là hợp lệ. Code hiện vẫn theo bản cũ (bỏ qua task dịch và ghi vào
    đích không nêu).
15. **Duyệt nằm ngay trong luồng trả lời.** Nút chính **Cho phép trong phiên này**, menu kèm **Cho phép một
    lần**; nút phụ **Bỏ qua**.
16. **Có checkpoint và sửa lệnh cũ.** Bấm vào lệnh cũ để sửa và gửi lại; các lượt sau bị xóa và thao tác ghi
    của chúng được hoàn tác sau khi người dùng xác nhận. Làm sau phần transcript và tool.
17. **Màn Trợ lý dùng cùng transcript và ô nhập với panel chương;** cột danh sách phiên tương ứng sidebar
    Sessions của VS Code và bật/tắt được.

Các quyết định trước ngày 2026-10-11 về chat theo tác phẩm hoặc proposal-only cho mọi lượt chat đã bị thay
thế. Quyết định 2026-10-11 bỏ composer có chế độ đã bị quyết định 12 thay thế. Lịch sử Git là nguồn tra
cứu các quyết định đó.

[Roadmap agent](agent-roadmap.md) · [Phiên và tác vụ](sessions-and-jobs.md) · [Về module](README.md)
