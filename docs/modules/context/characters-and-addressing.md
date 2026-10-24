# Nhân vật, quan hệ và xưng hô Nhật → Việt

Cập nhật: 2026-10-14 · Trạng thái: mặc định hậu tố đã chốt; phân tích xưng hô trong bước trích **đã
triển khai**; phần còn lại của mô hình và cách kiểm là đề xuất.
Chủ trì: người dịch/sản phẩm. Câu hỏi: làm sao hỗ trợ lựa chọn của người dịch mà không đoán sai quan hệ?

> 2026-10-05: các quyết định về xưng hô tiếng Việt (đổi theo mốc, không "tôi – bạn", đổi giữa cảnh,
> bộ mặc định theo bối cảnh) và căn cứ nghiên cứu nằm ở [Xưng hô tiếng Việt](vietnamese-addressing.md).

## Phân tích xưng hô trong bước trích (quyết định 2026-10-14)

**Quyết định của chủ sản phẩm (chấp nhận 2026-10-14):** phân tích xưng hô chạy cùng bước trích, chờ duyệt
cùng thuật ngữ. Task dịch với chiến lược `extract_then_review` không chỉ trích thuật ngữ mà còn đề xuất cặp
xưng hô, và chỉ dịch sau khi người dùng duyệt.

**Đã triển khai** (`ContextExtractionService.analyzeAddressing`):

- Chạy sau các lô quét thuật ngữ của cùng lần trích, đi qua cùng đường gọi model, cổng ngân sách, báo usage
  (đầu và cuối lời gọi) và tín hiệu dừng của task. Một lời gọi cho cả task.
- Danh sách người: nhân vật chưa bị loại cùng mục glossary loại `person` đã duyệt hoặc đang chờ duyệt (kể cả
  vừa trích). Bằng chứng là câu thoại có tên trong **mọi chương của task**
  ([`addressingAnalysis.ts`](../../../src/main/services/ai/addressingAnalysis.ts)). Dưới hai người có câu
  thoại thì không gọi model.
- Code kiểm: chỉ giữ cặp có ít nhất một câu bằng chứng có nguyên văn trong chương (`verifiedQuotes`); bỏ cặp
  có người không nằm trong danh sách; chiều A → B đã có cặp ở bất kỳ trạng thái hay phạm vi nào thì để yên —
  AI không ghi đè hay mở lại cặp đã duyệt/đã loại. Phản hồi không phải JSON thì không đề xuất gì.
- Lưu: cặp `pending`, `origin = ai`, câu bằng chứng vào `context_entry_evidence`. Người chưa có hàng nhân vật
  được tạo nhân vật `pending` (tên dịch lấy từ mục glossary, giới tính và đại từ ngôi ba AI đề xuất); dạng
  viết khác vẫn thuộc mục glossary. Tên nhân vật không còn chặn duyệt mục glossary cùng tên.
- Cặp mới cộng vào số mục chờ duyệt: task vào `waiting_user(context_review)` như với thuật ngữ.
- Duyệt: "Xem và duyệt" mở Ngữ cảnh, cả Thuật ngữ và Xưng hô lọc "Chờ duyệt"; tab Xưng hô hiện số cặp chờ
  duyệt. **Duyệt một cặp thì duyệt luôn hai nhân vật `pending` của nó**, vì prompt dịch chỉ dùng cặp đã duyệt
  có hai nhân vật đã duyệt.

Chưa làm: màn Xưng hô chưa hiện câu bằng chứng của cặp; hộp sửa cặp chưa có ô đại từ ngôi hai (giữ nguyên giá
trị AI đề xuất khi lưu). Task dừng vì ngân sách đúng ở lời gọi phân tích thì lần Tiếp tục không phân tích lại
(chương đã quét xong).

**Xưng hô đổi từ chương N do bước trích (đã triển khai 2026-10-24, change `add-context-progression`):**

- **Gợi ý bằng code (`addressChanges`).** Code đếm theo chương cách mỗi người được gọi trong lời thoại: tên hay
  alias, kèm hậu tố gọi người nào (さん, 様, くん, ちゃん, 先輩, 殿…). Mira sinh gợi ý "có thể đổi từ chương N"
  khi đủ ba điều kiện:
  - cách gọi chiếm quá nửa ở chương N khác ở chương N−1;
  - hai chương liền nhau;
  - mỗi chương có ít nhất 2 lần gọi.

  Gợi ý đi vào prompt phân tích trong phần `<possible_changes>`. Gợi ý một mình không đổi gì.
- **Model trả `fromChapter`** trên một cặp khi cặp đó đổi từ một chương. Nếu cặp đã áp dụng ở chương đó, thay
  đổi đi qua cùng chốt chặn với thuật ngữ: cần câu chứng ở ít nhất 2 chương từ chương N trở đi.
  - Qua chốt thì Mira gọi `changeDyadFrom`: cặp cũ kết thúc ở N−1, cặp mới bắt đầu từ N.
  - Không qua chốt thì cặp giữ nguyên và nhận cờ `revision_suggested`.
  - Cặp chưa có thì vẫn được tạo như trước.
- Mọi lần đổi cặp từ chương N đều ghi vào lịch sử của cặp mới, cả do steering lẫn do bước trích.

## Tách ba lớp

| Lớp | Ghi nhận | Không suy diễn thành |
| --- | --- | --- |
| Sự kiện nguyên tác | danh tính, quan hệ, vai vế, ai biết gì | lựa chọn “anh–em” bắt buộc |
| Lời nói trong cảnh | người nói, người nghe, người được nhắc, cách gọi, bằng chứng | mọi câu A nói đều hướng tới B |
| Quyết định bản Việt | tự xưng, gọi đối phương, hậu tố, giọng và ngoại lệ | sự kiện huyết thống hoặc tuổi tác trong nguồn |

Lời đùa dùng từ thân tộc không đủ xác lập quan hệ gia đình. Kính ngữ nói về người thứ ba không đồng nhất với kính trọng người nghe. Đại từ của lời kể không bắt buộc giống đại từ cùng nhân vật trong hội thoại.

## Các trường hợp theo mong muốn người dịch

**Đã chốt:** cho người dịch chọn, và nếu không có yêu cầu thì **giữ hậu tố Nhật gắn tên**. Bốn nhóm dưới đây là cách tổ chức lựa chọn; chưa khẳng định đã có bốn preset trong UI.

| Lựa chọn | Hướng xử lý | Điều vẫn phải xét |
| --- | --- | --- |
| Giữ hậu tố — mặc định | Giữ `-san`, `-chan`, `-kun`, `-sama` khi chúng gắn tên theo quy ước tác phẩm | vẫn dịch đại từ, chức danh và mức lịch sự theo ngữ cảnh; không tự thêm hậu tố không có trong nguồn |
| Việt hóa | Chuyển chức năng quan hệ sang cách gọi tiếng Việt phù hợp, có thể chỉ dùng tên | `-san` không tự tương đương “chị”; thiếu giới/tuổi/vai không được tự đoán |
| Kết hợp có quy tắc | Nêu rõ nhóm nào giữ, nhóm nào Việt hóa, phạm vi và ngoại lệ | không đổi tùy hứng giữa các lần xuất hiện cùng điều kiện |
| Tùy chỉnh theo tác phẩm | Người dịch khai quy ước riêng cho nhân vật, quan hệ hoặc tình huống | phải nhìn thấy quy tắc nào thắng khi chồng phạm vi |

Giữ hậu tố không đồng nghĩa giữ nguyên mọi kính ngữ trong câu. Chức danh đứng độc lập như cách gọi thầy/cô cần xử lý riêng theo vai và lựa chọn người dịch. Không mặc định ghép cả “chị” và hậu tố trong “chị A-san”; nếu người dịch chủ ý dùng, ghi thành ngoại lệ cụ thể, không biến thành quy tắc chung.

Nguồn đổi từ tên họ + hậu tố sang tên riêng hoặc bỏ hậu tố có thể là diễn biến tình cảm. Không “chuẩn hóa” cho giống chương đầu. Nhất quán là giữ cách biểu đạt chuyển biến đó theo cùng chiến lược dịch.

## Ma trận có chiều và có phạm vi

Mỗi quy ước A→B mô tả A tự xưng gì và gọi B thế nào. B→A là một quy ước riêng; không tự đảo hai từ để tạo chiều ngược. Thêm phạm vi chương/cảnh, hình thức giao tiếp, biến thể được phép và người duyệt.

Đề xuất thứ tự ưu tiên: ngoại lệ cảnh đã duyệt → quy ước cặp tại mốc → hướng dẫn nhân vật/tác phẩm. Hai quy tắc cùng độ ưu tiên mâu thuẫn phải hiện ra, không lấy cái được ghi sau làm đúng. Chưa chốt cấu trúc lưu cảnh.

Không suy tuổi/giới từ tên, không gán cặp từ một điểm “thân mật” hoặc archetype. Các bảng tuổi, giới, thể loại trong tài liệu cũ là gợi ý chưa được kiểm chứng, không phải luật.

## Chưa biết người nói hoặc người nghe

Quét tên trong chương chỉ tìm dàn nhân vật có khả năng liên quan. Chương có A và B không đủ chứng minh có hội thoại A↔B; cảnh ba người càng không được tạo mọi cặp rồi coi là bắt buộc.

Nếu chưa rõ vai, lưu “chưa biết” kèm đoạn nguồn, không dùng confidence model tự cho để biến thành sự thật. Có thể lược đại từ nếu tiếng Việt vẫn tự nhiên; không coi “tôi/bạn/anh/chị” là mặc định hoàn toàn trung tính. Khi bản dịch buộc chọn mà thiếu căn cứ, cần người dịch xem lại.

## Những gì công cụ kiểm được và chưa kiểm được

Đếm đại từ hoặc regex dấu ngoặc chỉ giúp sàng lọc. Ví dụ tự soạn để kiểm bộ phát hiện: “Em chờ anh” có thể là người nói tự xưng em hoặc ra lệnh cho người nghe em; chuỗi từ không đủ xác định chiều quan hệ. Cần phân vai, cảnh và nguồn trước khi kết luận vi phạm.

Ca khó phải có trong đánh giá: đổi người nghe giữa cảnh, nhóm người nghe, độc thoại, lời dẫn, lời trích bên trong thoại, kính ngữ người thứ ba, mỉa mai, giả danh, đổi thân mật có chủ ý, và quan hệ chỉ được tiết lộ sau.

Phản hồi cộng đồng do người dùng cung cấp ủng hộ nhiều lựa chọn và tính nhất quán, nhưng chưa có URL/khung lấy mẫu; đây là quan sát định tính, không đại diện toàn cộng đồng. Mẫu người dịch đã khảo sát và giới hạn nằm ở [bằng chứng](evidence.md).

[Về mục lục](README.md)


> [!IMPORTANT]
> **Cập nhật quyết định sản phẩm (2026-10-23):**
> Chủ sản phẩm đã chốt bãi bỏ hoàn toàn cơ chế duyệt tiền kiểm đối với cả thuật ngữ và xưng hô.
> 1. AI trích xuất thuật ngữ/xưng hô sẽ lưu trực tiếp vào từ điển ở trạng thái có hiệu lực (`approved`). Không còn
>    `pending`: migration 17 của file tác phẩm chuyển mục `pending` cũ thành `approved`. `rejected` vẫn giữ làm trí
>    nhớ "đừng đề xuất lại" (model gọi `not-a-term`, hoặc người dùng từ chối trước đây), bị ẩn khỏi bảng, và bước
>    trích không còn mở lại nó.
> 2. Pipeline dịch tự động chạy xuyên suốt, không ngắt luồng sang `waiting_user(context_review)`.
> 3. Toàn bộ thanh lọc trạng thái `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`, các nút Duyệt/Từ chối trên UI được dọn dẹp. Người dùng kiểm soát chất lượng qua hậu kiểm (sửa, xóa, cấm dùng trực tiếp trong bảng).
