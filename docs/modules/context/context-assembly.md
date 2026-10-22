# Chọn và lắp ngữ cảnh gửi AI

Cập nhật: 2026-10-04 · Trạng thái: phương án thiết kế và kế hoạch kiểm chứng.
Chủ trì: kỹ thuật/đánh giá. Câu hỏi: gửi đủ thông tin hữu ích mà không gửi cả kho ghi chú thế nào?

## Trình tự đề xuất

Chụp phiên bản đầu vào → lọc duyệt/quyền gửi/phạm vi → tìm mục liên quan → giải xung đột → tính ngân sách → lắp khối theo thứ tự ổn định → ghi snapshot và phần bị cắt.

Nội dung truyện, tài liệu nhập, ví dụ và ghi chú là **dữ liệu**, không được tự nâng thành chỉ thị người dùng. Cần phân cách rõ với quy tắc hệ thống và lựa chọn đã duyệt. Trích dẫn một câu mệnh lệnh trong truyện không cấp quyền cho model đổi nhiệm vụ hay tiết lộ dữ liệu khác.

## Ba tầng A/B/C

| Tầng | Nội dung đề xuất | Độ ổn định mong muốn |
| --- | --- | --- |
| A — quy ước chung | hướng dẫn dịch, định dạng, chính sách hậu tố, style đã duyệt | cố định trong một snapshot/lần chạy |
| B — chương/cảnh | dàn nhân vật liên quan, quy ước có chiều, thông tin được phép biết | ổn định trong cùng phạm vi áp dụng |
| C — lô đang dịch | glossary khớp, mẫu được chọn, đoạn lân cận, nguồn | thay đổi theo lô |

Spec cũ đòi B giống từng ký tự cho cả chương. Nếu có ngoại lệ theo cảnh thì cần tách phần B ổn định và phần áp dụng theo cảnh, hoặc thu hẹp phạm vi snapshot. Không vừa cam kết B bất biến cả chương vừa chèn ngoại lệ cảnh mà không sửa hợp đồng.

Vị trí system/user/assistant và số message là biến thiết kế cần kiểm. Các khẳng định cũ “glossary phải ở system” hoặc “memory ở assistant tốt hơn” chưa có bằng chứng Mira. [Chat hiện tại](../../../src/main/services/ai/chatPrompt.ts) đặt khối ngữ cảnh trong user message trước lịch sử; không đổi nó chỉ để khớp sơ đồ nghiên cứu. *(2026-10-05: bản `v2` sau cờ đặt tầng B/C và ngữ cảnh chat trong message user cuối, để system và lịch sử thành tiền tố ổn định; chưa đo, xem [hệ thống prompt](prompt-system.md).)*

## Chọn theo loại thông tin

Glossary khớp văn bản của lô là điểm khởi đầu hợp lý; so sánh với gửi toàn bộ glossary còn là thí nghiệm. Nhân vật/xưng hô cần phạm vi rộng hơn một đoạn vì tiếng Nhật thường không nhắc lại tên. Dàn nhân vật toàn chương chỉ là tập ứng viên, không chứng minh các vai trong từng câu. Code hiện tại lọc cặp xưng hô theo tên có trong chương nên bỏ mất cặp của người kể ngôi thứ nhất; xem [Soát task dịch thật 2026-10-22](translation-run-2026-10-22.md).

Mục không duyệt, bị loại, ngoài hiệu lực hoặc không được phép gửi phải bị loại ở **mọi đường**, kể cả summary, mẫu và ghi chú sao chép nội dung của chúng. Không thể cam kết riêng tư bằng cách chỉ lọc danh sách glossary rồi gửi summary chứa cùng thông tin.

Spec cũ có bốn mức gửi, gồm “không gửi khi khớp”. Ý nghĩa và nhu cầu mức phủ định này chưa rõ; cần chốt trước khi đưa vào UI. “Luôn gửi” cũng chỉ có nghĩa luôn xét sau các ràng buộc quyền/phạm vi, không được vượt qua chúng.

Biến thể bị cấm phục vụ QA. Có đưa chúng vào prompt dưới dạng phủ định hay chỉ giữ ở checker là biến cần thử; lý do “nêu sẽ gây lặp lại” chưa được chứng minh trong dự án.

## Ngân sách

Tính ngân sách cả request: chỉ dẫn + lịch sử + ngữ cảnh + nguồn + dự phòng đầu ra và giới hạn model. Token estimator cần hiệu chỉnh bằng usage; tỷ lệ CJK/Latin, phần trăm dự phòng hoặc trần 40% trong nghiên cứu cũ không phải chuẩn đã đo.

Đề xuất cắt có giải thích, bắt đầu từ ví dụ, đoạn lân cận và chi tiết hồ sơ ít liên quan; thứ tự đầy đủ cần thử theo tác phẩm. Không âm thầm bỏ glossary đã xác định cần thiết hoặc quy ước xưng hô bắt buộc cho cảnh. Nếu phần thiết yếu đã quá lớn, thu nhỏ lô hoặc báo không đủ ngân sách. Giới hạn số mục không được vô tình bỏ mục bắt buộc.

Lấy ranh giới cảnh/xuống dòng làm tín hiệu chia lô nhưng không vượt giới hạn. Nguồn quyết định ranh giới lô, dữ liệu ngữ cảnh quyết định phần có thể gửi; output không tự thay đổi danh tính đoạn nguồn. Các con số số đoạn/token/k đoạn trước ở bản cũ là giá trị thử, chưa chốt.

## Tất định và chạy song song

Với cùng snapshot, cấu hình, phiên bản thuật toán và đầu vào, thứ tự chọn/cắt/serialize phải ổn định. Không đọc trạng thái bản dịch mới nhất giữa các lô một cách tùy thời điểm. Nếu cần output lô trước làm context, phải thiết kế phụ thuộc tuần tự; nếu song song, đóng băng tập context có sẵn.

Provider phải giữ trật tự ý nghĩa của các khối và ánh xạ output bằng ID tạm trong request khi giao thức có ID. Thiếu/thừa ID là lỗi cấu trúc cần xử lý riêng, không tự chứng minh mất nghĩa. Retry lỗi mạng/rate-limit khác với thử lại vì output không đạt kiểm tra nội dung.

## Cache là phép đo, không phải lời hứa

Tiền tố ổn định có thể thuận lợi cho cache, nhưng cache hit, ngưỡng, TTL và chi phí phụ thuộc provider/model/cách gọi. Không kế thừa giá, ngưỡng token hoặc tỷ lệ tiết kiệm cũ thành cam kết hiện tại. “Lô đầu tuần tự để làm nóng, sau đó song song” và explicit cache đều cần thử; không là điều kiện bắt buộc của glossary.

Ghi số token thực, cache usage khi provider có trả, độ trễ, chi phí và chất lượng. Cache tốt không bù được ngữ cảnh sai; gửi toàn bộ glossary để tăng cache cần so với phương án lọc cả về nhiễu lẫn tiền.

Nguồn: [R01–R03, R09–R10](evidence.md). Truy vết payload và tác động thay đổi nằm ở [vòng đời dữ liệu](data-lifecycle.md).

[Về mục lục](README.md)
