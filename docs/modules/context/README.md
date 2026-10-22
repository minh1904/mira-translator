# Module Ngữ cảnh dịch

Cập nhật: 2026-10-04 · Trạng thái: bản tổng hợp nghiên cứu và định hướng module, chưa phải spec đã triển khai.
Chủ trì: chủ sản phẩm và người phụ trách nghiên cứu dịch thuật.

## Bộ tài liệu này dùng để làm gì?

Tập hợp những gì đã nghiên cứu về glossary, nhân vật, xưng hô, văn phong và ký ức truyện vào một nơi để thiết kế module Ngữ cảnh. Trọng tâm ngôn ngữ hiện tại là **Nhật → Việt**, học cách xử lý của **người dịch**, không lấy bản dịch AI làm chuẩn văn phong hay đáp án chấm.

Đây là bản chắt lọc theo vấn đề, không phải bản sao handbook. Các tài liệu cũ, bản lưu tháng 6 và OpenSpec vẫn giữ nguyên để truy xuất nguồn. Chưa chuyển tài liệu của toàn bộ ứng dụng, chưa xóa handbook, chưa thay quy trình của các module khác.

## Đọc theo nhu cầu

| Câu hỏi | Tài liệu chịu trách nhiệm |
| --- | --- |
| Module làm gì, điều gì đã chốt? | [Phạm vi và quyết định](scope.md) |
| Quản lý tên riêng, thuật ngữ và biến thể thế nào? | [Glossary](glossary.md) |
| AI tự lập glossary trước khi dịch thế nào, người duyệt ở đâu? | [AI trích xuất glossary](glossary-extraction.md) |
| Ai nói với ai, giữ hậu tố hay Việt hóa? | [Nhân vật và xưng hô](characters-and-addressing.md) |
| Học văn phong từ đâu, nhớ gì và tránh tiết lộ sớm thế nào? | [Văn phong và ký ức](style-and-memory.md) |
| Lưu, duyệt, sửa và truy vết dữ liệu ra sao? | [Dữ liệu và vòng đời](data-lifecycle.md) |
| Chọn gì để gửi AI, cắt gì khi thiếu chỗ? | [Lắp ngữ cảnh](context-assembly.md) |
| Prompt dịch và chat xếp thế nào, các sản phẩm khác làm gì? | [Hệ thống prompt](prompt-system.md) |
| Chưa có cặp xưng hô thì AI xưng hô thế nào, theo bối cảnh nào? | [Xưng hô tiếng Việt](vietnamese-addressing.md) |
| Chứng minh tốt hơn và tránh báo lỗi nhầm thế nào? | [Chất lượng và kiểm chứng](quality-and-evaluation.md) |
| Sau lượt dịch: kiểm, tự sửa, trau chuốt và để người duyệt thế nào? | [Kiểm, tự sửa và trau chuốt](post-editing.md) |
| Thế nào là bản dịch tiểu thuyết tốt, mỗi ngôn ngữ nguồn cần lưu ý gì? | [Văn phong bản dịch theo ngôn ngữ](translation-style-research.md) |
| Model từ chối dịch một phần chương thì sao? | [Đoạn bị nhà cung cấp từ chối](content-refusals.md) |
| Task dịch thật lệch xưng hô, văn phong ở đâu và vì sao? | [Soát task dịch thật 2026-10-22](translation-run-2026-10-22.md) |
| Học gì từ harness của một agent khác, làm theo thứ tự nào? | [Đối chiếu harness Hermes](harness-review.md) |
| Cần dữ liệu gì để đo cách người dịch xử lý xưng hô và độ linh hoạt? | [Kho đối chiếu bản dịch người](human-translation-corpus.md) |
| Làm theo thứ tự nào, còn phải chốt gì? | [Lộ trình và câu hỏi mở](roadmap.md) |
| Kết luận bắt nguồn từ đâu, tài liệu cũ nằm ở đâu? | [Bằng chứng và bản đồ nguồn](evidence.md) |

Người thiết kế sản phẩm đọc `scope` → `glossary` → `characters-and-addressing`. Người triển khai đọc thêm `data-lifecycle` → `context-assembly` → `quality-and-evaluation`; không lấy các đề xuất ở đây làm quyết định schema tự động. Người mở rộng nghiên cứu bắt đầu từ `evidence`.

## Cách hiểu trạng thái

- **Đã chốt:** có quyết định sản phẩm hoặc yêu cầu trực tiếp của người dùng.
- **Quan sát:** điều đã đọc thấy trong nguồn; không mặc nhiên chứng minh hiệu quả cho Mira.
- **Đề xuất:** phương án tổng hợp để thảo luận và kiểm thử, chưa cấp quyền triển khai.
- **Cần kiểm chứng:** còn thiếu đối chiếu, dữ liệu hoặc thực nghiệm.

Trong bộ này, các thiết kế chi tiết là **đề xuất** trừ khi ghi rõ đã chốt. Nhãn `SHALL` hoặc tiêu đề “Decisions” trong change OpenSpec cũ không tự chứng minh tính năng đã có. Đợt này tổ chức lại nghiên cứu có sẵn, không chạy benchmark mới, không kiểm lại toàn bộ nguồn web và không thay mã ứng dụng.

## Những nguyên tắc xuyên suốt

Người dịch quyết định quy ước; không có yêu cầu thì giữ hậu tố Nhật gắn tên. Phân biệt sự kiện trong nguyên tác với lựa chọn diễn đạt tiếng Việt. AI đề xuất không tự thành sự thật đã duyệt. Ngữ cảnh phải có nguồn, phạm vi và khả năng truy vết. Cờ kiểm tra không tự chứng minh lỗi dịch. Sửa glossary không đồng nghĩa cho phép sửa hàng loạt bản dịch đã có.
