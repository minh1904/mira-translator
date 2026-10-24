# Ngữ cảnh chương trước khi dịch

Cập nhật: 2026-10-23 · Trạng thái: **Nghiên cứu**, chưa chốt, chưa đo trên Mira. Chủ trì: kỹ thuật (đo), sản
phẩm (chọn phương án).

## Câu hỏi

Gửi thêm ngữ cảnh của chương trước (vài đoạn cuối, tóm tắt, hoặc bản dịch) khi dịch một chương có làm bản
dịch tốt hơn không, và có đáng đổi lấy chi phí và việc phải chạy tuần tự không?

## Hiện trạng Mira (đọc code 2026-10-23)

Mỗi chương chụp một snapshot gồm glossary đã duyệt, cặp xưng hô và nhân vật có mặt trong chương, thể loại,
giọng văn và chỉ dẫn (`takeContextSnapshot`). Mỗi lô gửi thêm `<previous>`: 3 đoạn **bản gốc** liền trước,
lấy **trong cùng chương**. Không có gì từ chương trước. Lô mặc định tối đa 4.500 token, nên một chương web
novel thường chỉ cần 1–2 lô.

## Bằng chứng ngoài

| Nguồn | Kết quả | Áp vào Mira |
| --- | --- | --- |
| [Karpinska & Iyyer, WMT 2023](https://aclanthology.org/2023.wmt-1.41) | Dịch cả đoạn văn (GPT-3.5, 18 cặp ngôn ngữ) ít lỗi dịch sai, ngữ pháp và lệch văn phong hơn dịch từng câu; lỗi nghiêm trọng (bỏ sót) vẫn còn. | Ngữ cảnh **trong tài liệu** có ích. Mira đã gửi lô cỡ chương nên đã hưởng phần lớn lợi ích này. |
| [DelTA, ICLR 2025](https://arxiv.org/abs/2410.08143) | Bộ nhớ nhiều tầng (bảng tên riêng, tóm tắt song ngữ, nhớ ngắn và dài hạn): độ nhất quán tăng tới 4,58 điểm %, COMET tăng tới 3,16 điểm trung bình. | Phần tên riêng tương ứng glossary Mira đã có. Chưa đọc ablation nên **chưa biết riêng phần tóm tắt đóng góp bao nhiêu**. |
| [Wu và cộng sự, 2024](https://arxiv.org/abs/2401.06468) | Model dịch tài liệu vẫn sinh output sai ngôn ngữ vì lỗi lan truyền khi giải mã. | Dùng **bản dịch** làm ngữ cảnh có thể mang lỗi sang chương sau. |
| [Zaranis và cộng sự, EMNLP Findings 2024](https://aclanthology.org/2024.findings-emnlp.876.pdf) | Phía nguồn của ngữ cảnh đóng góp nhiều hơn phía đích. | Ủng hộ gửi **bản gốc** trước khi nghĩ tới bản dịch. |
| Bài thực hành ([DEV](https://dev.to/jacob_gong/translating-full-books-with-llms-our-chunking-strategy-for-long-form-context-2o5h), [wenmai](https://github.com/anothersummerofsleep/wenmai)) | Hay dùng hai lượt: tóm tắt và trích từ mới, rồi dịch kèm tóm tắt. Một bài báo tóm tắt làm tăng khoảng 30% token đầu vào. | Không có số đo chất lượng; chỉ là bằng chứng thực hành, chủ yếu Trung–Anh. |

Chưa tìm được nghiên cứu đo riêng Nhật–Việt hay đo riêng tác dụng của tóm tắt chương trước.

## Nhận định cho Nhật–Việt

- Lợi ích lớn nhất có thể nằm ở **đầu chương**. Lô đầu không có `<previous>`, mà tiếng Nhật hay lược chủ ngữ;
  tiếng Việt lại phải chọn xưng hô theo quan hệ. Không biết ai đang nói với ai thì dễ sai ngôi và cặp xưng hô.
- Tên và thuật ngữ đã có glossary nên ngữ cảnh chương trước gần như không thêm gì cho phần này.
- Gửi **bản gốc** chương trước không phụ thuộc kết quả dịch: vẫn chạy song song được và không lan lỗi. Gửi
  **bản dịch** hay tóm tắt sinh từ bản dịch thì phải chạy tuần tự và có thể lan lỗi.
- Tóm tắt phải tôn trọng mốc chương (không tiết lộ điều chương sau mới biết), như
  [Văn phong và ký ức](style-and-memory.md) đã nêu.

## Đề xuất đo (chưa chạy)

Dùng 3–5 chương của một truyện có nhiều hội thoại, cùng model và cùng glossary:

| Biến thể | Thêm gì | Chạy song song được |
| --- | --- | --- |
| A | Như hiện nay | Có |
| B | 5 đoạn bản gốc cuối chương trước, chỉ gửi cho lô đầu của chương | Có |
| C | B + tóm tắt ngắn (≤150 từ) bản gốc chương trước do model phụ viết | Có, nếu tóm tắt từ bản gốc trước khi dịch |

Chấm lỗi ở 20 đoạn đầu mỗi chương: sai người nói hoặc sai ngôi, sai cặp xưng hô, đứt mạch, kèm số token và
chi phí. Chỉ chọn B hay C nếu lỗi giảm rõ hơn độ dao động giữa hai lần chạy A.
