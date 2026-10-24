# Kiểm, tự sửa và trau chuốt sau khi dịch

Cập nhật: 2026-10-06 · Trạng thái: **tổng hợp nghiên cứu (quan sát) và đề xuất**; biến thể B đã chạy thử trong
Lab (mục 5), chưa có trong app, chưa chấm mù.
Chủ trì: kỹ thuật/đánh giá (phương pháp, phép đo), chủ sản phẩm (lựa chọn cho người dùng).
Câu hỏi: sau lượt dịch chính, nên thêm bước nào để ra bản final tốt hơn — code kiểm, AI tự sửa, AI
biên tập, người duyệt — mà không làm hỏng lựa chọn đã chốt và không đội chi phí vô ích?

## 1. Ba việc khác nhau, đừng gộp

| Việc | Ai làm | Phạm vi | Chi phí |
| --- | --- | --- | --- |
| **Kiểm** | code, tất định | từng câu thoại: khai báo xưng hô, glossary, mục cấm, id | không gọi AI |
| **Sửa có chủ đích** | AI, theo lỗi đã chỉ ra | chỉ các câu bị bắt, kèm lý do | chỉ tốn khi có câu sai |
| **Trau chuốt** | AI biên tập | văn phong, mạch, “văn dịch”; có thể cả chương | khoảng thêm một lượt dịch |

Người dịch đứng sau cả ba: mọi chữ AI viết vẫn đi qua hồ sơ đề xuất và Accept/Deny tại editor
([luồng duyệt](../proposals/review-flow.md)). Tài liệu [chất lượng](quality-and-evaluation.md) đã chốt
nguyên tắc: cờ của checker không tự chứng minh lỗi và không được tự chặn lưu hay tự sửa văn bản.

## 2. Nghiên cứu đã đọc (quan sát, đọc 2026-10-06)

| Công trình | Cách làm | Kết quả chính | Bài học cho Mira |
| --- | --- | --- | --- |
| [TEaR](https://aclanthology.org/2025.findings-naacl.218/) (NAACL Findings 2025) | Dịch → LLM tự ước lượng lỗi theo MQM (loại, mức độ) → sửa theo lỗi đó | Cải thiện đều trên 16 hướng dịch; ước lượng few-shot tốt hơn zero-shot rõ; ước lượng yếu thì báo thừa lỗi và sửa ra ảo giác; **vòng thứ hai làm kém đi** | Chất lượng bước chẩn đoán quyết định; chỉ một vòng |
| [Diagnose, Then Repair](https://arxiv.org/html/2609.22793) (arXiv 2026) | Một LLM chẩn đoán lỗi theo span MQM, **LLM khác** sửa tối thiểu theo “hợp đồng sửa”: chỉ đúng span được chỉ | +3,54 Comet-22 ở cấu hình tốt nhất; hai giai đoạn hơn một giai đoạn ở 4/7 model; vòng hai làm giảm điểm ở 6/7 | Tách chẩn đoán khỏi sửa; ràng buộc sửa tối thiểu; một vòng |
| [Ki & Carpuat](https://arxiv.org/abs/2404.07851) (NAACL Findings 2024) | Cho LLM hậu biên tập với ba loại phản hồi: chung chung, điểm số, lỗi chi tiết | Khi chỉ prompt, khác biệt giữa các loại phản hồi **nhỏ**; model sửa thừa cả bản dịch vốn đúng; phản hồi chi tiết ít sửa thừa nhất; hậu biên tập làm câu tự nhiên hơn nhưng ~40/150 nhận xét En–Ru nói **mất sắc thái** | Lý do nên gửi lỗi cụ thể: không phải để sửa giỏi hơn mà để bớt sửa thừa; phải soi mất sắc thái |
| [Lost in Literalism](https://arxiv.org/html/2503.04369v1) (ACL 2025) | Đo “văn dịch” (dịch sát, không tự nhiên) trong bản dịch LLM | >40% bản dịch tài liệu của GPT-4 có văn dịch; yêu cầu model **tự trau chuốt** giảm từ 43% xuống 25% | Trau chuốt có cơ sở để thử, nhắm đúng văn dịch |
| [GEMBA-MQM](https://arxiv.org/abs/2310.13988), [MQM-APE](https://arxiv.org/abs/2409.14335) (COLING 2025) | LLM gắn nhãn lỗi MQM; MQM-APE thử sửa theo từng lỗi rồi chỉ giữ lỗi mà bản sửa thật sự tốt hơn | GEMBA-MQM báo **nhiều lỗi giả**; lọc bằng “sửa thử rồi so” làm nhãn lỗi đáng tin hơn trên 8 LLM | Không tin nhãn lỗi của AI khi chưa lọc; ưu tiên checker bằng code |
| [APE với ngữ cảnh dài](https://arxiv.org/html/2601.19410) (arXiv 2026) | So hậu biên tập theo câu với theo cả tài liệu (Anh–Hàn) | Cả tài liệu **không hơn rõ**; model nhỏ sửa thừa nặng và chép ảo giác từ chỗ khác trong tài liệu; GPT-4o-mini tốn thêm ~4.300% chi phí; COMET không bắt được trôi nghĩa | Không gửi cả chương chỉ để trau chuốt khi chưa đo; không đo bằng một điểm tự động |
| [TransAgents](https://arxiv.org/abs/2405.11804) (EMNLP demo 2024, TACL) | Mô phỏng công ty dịch: soạn hướng dẫn (glossary, tóm tắt, giọng văn) → dịch → bản địa hóa → soát | Người đọc và LLM thích hơn cả bản người dịch, dù d-BLEU thấp hơn | Văn học cần đánh giá bằng sở thích người đọc, không bằng độ trùng chữ |
| [DelTA](https://arxiv.org/abs/2410.08143) | Dịch tài liệu với bộ nhớ nhiều tầng (tên riêng, tóm tắt, ngắn hạn, dài hạn) | Nhất quán hơn khi dịch tài liệu dài | Nhất quán nằm ở ngữ cảnh lúc dịch (Mira đã có glossary, xưng hô), không cần dồn vào bước sửa |

Điểm chung rút ra (tổng hợp, chưa kiểm trên Mira):

1. **Một vòng là đủ, vòng hai làm hỏng.** Hai công trình độc lập cùng thấy.
2. **Tách chẩn đoán khỏi sửa, và ràng buộc sửa tối thiểu.** LLM tự sửa “tự do” hay sửa thừa và trôi nghĩa.
3. **Nhãn lỗi do AI chấm có nhiều lỗi giả.** Cần lọc, hoặc dùng checker tất định khi có thể.
4. **Trau chuốt giảm văn dịch nhưng có thể mất sắc thái** — đúng rủi ro “làm nhẹ lời thô” mà Mira đã
   cấm trong [xưng hô](vietnamese-addressing.md).
5. **Điểm tự động (COMET, BLEU) không đủ** cho văn học và không bắt được trôi nghĩa; cần chấm cặp mù và
   người đọc.

## 3. Luồng đề xuất cho Mira

```text
Dịch (lượt chính)
  → Kiểm bằng code ── câu sai ──→ Sửa có chủ đích (1 lượt, chỉ câu sai, kèm lý do)
  → [tùy chọn] Trau chuốt (1 lượt, khóa lựa chọn đã chốt) → Kiểm lại bằng code
  → Hồ sơ đề xuất, mỗi câu mang cờ: “AI đã sửa …”, “còn nghi sai”
  → Người duyệt tại editor (diff, Accept/Deny, sửa tay) → bản final
  → Gợi ý từ chỗ người sửa (không tự áp)
```

### Kiểm bằng code (đề xuất)

Dựa trên những gì model đã khai trong phản hồi (`speaker_to_listener`, `self_ref`, `addr_ref`, xem
[hệ thống prompt](prompt-system.md)) và [`addressingCompliance.ts`](../../../src/shared/context/addressingCompliance.ts):

| Phép kiểm | Bắt được | Có thể bắt nhầm khi |
| --- | --- | --- |
| Khai báo khớp cặp đã duyệt | model chọn sai cặp | nhãn người nói sai, nhân vật chưa có trong `<characters>` |
| `dst` khớp khai báo | khai “tôi” mà viết “em” (lỗi đã đo ở `v4`: ~20/89 câu Rion→Milly) | “em” là danh từ, lời trích, đại từ chỉ người thứ ba |
| Glossary, mục cấm | dùng sai bản dịch đã chốt | biến thể hợp lệ chưa khai |
| Tên riêng, con số, độ dài | mất ý, thêm ý | minh thị hóa có căn cứ |

Chỉ coi là lỗi để gửi sửa khi hai tín hiệu cùng chỉ ra (ví dụ khai sai cặp **và** `dst` theo cặp sai).
Phần còn lại chỉ thành cờ cho người dịch.

### Sửa có chủ đích (đề xuất)

- Mở rộng lượt hỏi lại id thiếu hiện có: cùng system prompt (trúng cache), user mang đủ ngữ cảnh, chỉ
  gửi câu sai, mỗi câu kèm lý do cụ thể: `[12] Rion→Milly: cặp đã duyệt là tôi – chị, bản dịch dùng "em"`.
- Hợp đồng sửa: chỉ đổi chỗ được chỉ, giữ nguyên phần còn lại của câu.
- **Một lượt.** Vẫn sai thì giữ cờ “còn nghi sai” cho người dịch, không gọi tiếp.
- Thứ tự (chốt 2026-10-07, [đối chiếu harness](harness-review.md)): chỉ lập change cho bước này **sau
  khi** đo tỷ lệ checker báo nhầm trên dữ liệu Lab. Phần chứng minh được bằng code (id thiếu/rỗng) đã
  chạy trong lõi dịch; glossary và xưng hô còn là heuristic.

### Người duyệt (đề xuất)

- Đề xuất mang cờ theo câu để người dịch đọc câu có cờ trước.
- **Áp dụng thẳng không ghi câu còn cờ**: cả lượt vẫn tự Accept, câu nghi sai ở lại hàng chờ. Đây là
  điều kiện để bước tự sửa không biến thành tự ghi lỗi.
- Ghi nguồn gốc từng câu trong bản final: AI dịch / AI tự sửa / AI trau chuốt / người sửa. Tỷ lệ câu
  người phải sửa là thước đo thật nhất, rẻ hơn chấm mù.

### Học từ chỗ người sửa (đề xuất)

Theo [văn phong và ký ức](style-and-memory.md): chấp nhận một lần sửa không tự thành luật. Mira chỉ gợi ý
— người đổi đại từ trái cặp đã duyệt → hỏi cập nhật cặp hay thêm ngoại lệ; thay cùng một thuật ngữ nhiều
chỗ → gợi ý mục glossary; sửa lặp một kiểu câu → hàng chờ ghi chú văn phong.

## 4. Lựa chọn cho người dùng (đề xuất)

“Chọn mode dịch” gộp hai câu hỏi khác nhau:

| Câu hỏi | Lựa chọn | Đề xuất |
| --- | --- | --- |
| Ai chốt bản final? | Duyệt trước / Áp dụng thẳng | **Đã có** ([quyết định module](../proposals/decisions.md)) |
| AI làm kỹ đến đâu? | kiểm, tự sửa, trau chuốt | Kiểm và tự sửa **luôn bật** (rẻ, có lợi khi đo xác nhận checker ít bắt nhầm); trau chuốt là **một công tắc** có ghi chi phí, chỉ thêm khi đo thấy có lợi |

Không làm danh sách mode “Nhanh / Chuẩn / Kỹ / Tự động”: mỗi mode là một nhánh phải đo và bảo trì — đúng
vấn đề khiến Mira gỡ bốn thế hệ prompt chạy song song. Chỉ thêm mode khi có dữ liệu cho thấy hai kiểu
dùng thật sự khác (ví dụ dịch thô hàng trăm chương để đọc trước).

## 5. Trau chuốt: các biến thể để thử (đề xuất, cần kiểm chứng)

Luật chung cho mọi biến thể, rút từ mục 2:

- **Chỉ trả đoạn đổi**, mỗi đoạn có lý do; đoạn không có lý do sửa giữ nguyên.
- **Khóa lựa chọn đã chốt**: thuật ngữ glossary và đại từ của cặp đã duyệt không được đổi.
- **Kiểm lại bằng code**; loại đoạn làm hỏng glossary/xưng hô, mất tên riêng hay con số, hoặc lệch độ dài
  bất thường so với bản nháp (ngưỡng thử ±30%).
- **Một lượt.**

| Biến thể | Đầu vào | Giả thuyết | Rủi ro / căn cứ |
| --- | --- | --- | --- |
| A. Đơn ngữ | chỉ bản dịch | rẻ, tự nhiên nhất | trôi nghĩa vì không thấy bản gốc; làm đối chứng (đánh giá MHP của TransAgents cũng chỉ đọc bản đích) |
| B. Soát rồi sửa | bản gốc + bản nháp; model gắn nhãn lỗi **trước** khi viết lại | ít sửa thừa hơn, nhãn còn cho biết bản nháp hay sai kiểu gì | nhãn của AI có lỗi giả (GEMBA-MQM); **thử trước** |
| C. Mùi văn dịch | code đếm dấu hiệu, chỉ gửi đoạn có dấu hiệu và lý do | rẻ, có chủ đích, đo được trước/sau | danh sách dấu hiệu là giả thuyết, cần người dịch xác nhận |
| D. Giọng nhân vật | lời thoại + ghi chú nhân vật | thoại sống hơn, khác giọng giữa nhân vật | dễ làm dịu lời thô |
| E. Model rẻ dịch, model mạnh sửa | bản nháp flash-lite, sửa bằng model mạnh theo B | ngang chất lượng model mạnh dịch thẳng mà rẻ hơn | lý do thật để có bước trau chuốt nếu đúng |

Nhãn cho biến thể B, ánh xạ về MQM để so được với nghiên cứu: `meaning` (sai, sót, thêm nghĩa),
`literal` (dịch sát trật tự câu nguồn), `awkward` (lủng củng), `repetition` (lặp từ), `voice` (sai giọng
nhân vật), `particle` (thoại thiếu tiểu từ như *nhé, ạ, cơ mà*).

```json
[{"id":"[12]","issue":"literal","note":"giữ trật tự câu Nhật","dst":"…"},
 {"id":"[15]","issue":"meaning","note":"sót 'không nói gì'","dst":"…"}]
```

Dấu hiệu văn dịch cho biến thể C (giả thuyết, chưa đối chiếu với kho bản dịch người): lặp “của”, “một
cách”, “được/bị” thừa; “anh ta/cô ta” dày đặc; đại từ ở câu mà tiếng Việt sẽ lược; câu dài theo trật tự
câu Nhật; “thì/là/mà” thừa. Khi có [kho đối chiếu bản dịch người](human-translation-corpus.md), so tần suất
các dấu hiệu này giữa bản người dịch và bản AI trước khi dùng làm luật.

Trục phụ có thể thử cùng B: **trau chuốt theo lô hay cả chương**. Cả chương bắt được lặp từ xuyên đoạn và
đại từ ngôi ba lệch, nhưng nghiên cứu APE ngữ cảnh dài cho thấy không chắc có lợi mà rất tốn.

### Đã chạy trong Lab: biến thể B (2026-10-06)

Lệnh `polish` của Lab ([`polish.ts`](../../../src/main/services/ai/polish.ts)): prompt soát rồi sửa, code
loại bản sửa không đổi gì, lệch độ dài ±30%, mất thuật ngữ, mất tên, thêm tên mà bản gốc không nhắc, đổi
con số hay mất dấu thoại. Từ 2026-10-24 bước này cũng chạy trong tác vụ dịch của app (mục
[Trau chuốt tự động](#trau-chuốt-tự-động-sau-khi-dịch-đã-triển-khai-2026-10-24)).

Chạy trên `n4696dd` chương 1–5, bản v5 không thinking có glossary AI, `gemini-2.5-flash` không thinking:
khoảng $0.005 mỗi chương (rẻ hơn 4 lần lượt dịch). `polish-v1` sửa 35/461 đoạn nhưng thay "cô hầu gái"
bằng "Milly" ở cảnh người kể chưa biết tên, bỏ "chăng"; `polish-v2` thêm luật và bước kiểm tên, sửa
33/461 đoạn. Quan sát khi đọc (chưa chấm mù):

- **Có ích:** thống nhất người kể "anh" → "tôi", sửa cặp Claire→Leon về đúng "chị–em" theo bảng xưng hô,
  bỏ chữ thừa ("quá là bất tiện" → "bất tiện quá").
- **Có hại:** cùng chương lại đổi Claire→Leon sang "cậu", trái bảng; thêm tiểu từ ra ngoài ngoặc thoại
  ("…thiếu gia” cơ mà"); đổi nghĩa ("không đổi một cách đáng sợ" → "đáng ngạc nhiên"); khoảng 1/3 lần
  model trả đoạn y nguyên.
- Lượt sửa không bị bộ lọc chặn ở cảnh chương 3 bị chặn khi dịch, nhưng cũng không sửa câu "Bên này bé
  tí" ở v2.

Bước tiếp: kiểm xưng hô bằng code so với bảng (không để model tự quyết), luật cấm thêm chữ ngoài ngoặc
thoại, rồi chấm cặp mù A/B với bản nháp như mục 6.

### Trau chuốt tự động sau khi dịch (đã triển khai 2026-10-24)

Quyết định của chủ sản phẩm (2026-10-24): sau khi đọc các lần chạy thử bên dưới, nối trau chuốt vào luồng
tự động sau lượt dịch. Change `add-auto-polish`.

- **Chạy ở đâu:** trong tác vụ dịch chương (`AgentTaskService`, mặc định bật; tùy chọn `polish` của dịch
  vụ để tắt khi test). Dịch qua chat chưa trau chuốt.
- **Cách chạy:** sau khi mọi lô của một chương đã ghi, `runChapterTranslation` gửi các câu **vừa dịch
  trong lượt này** (không gồm câu một lượt trước của cùng mục đã ghi) cho model, rồi ghi các bản sửa nhận
  được trong **cùng operation**. Hoàn tác một lần gỡ cả bản dịch lẫn trau chuốt.
- **Model:** model phụ (Cài đặt › Model › Model phụ) nếu đã chọn, không thì model của tác vụ. Lần thử với
  `gemini-3.8-flash` chỉ sửa 3–4 đoạn mỗi chương nên gần như không đổi gì; các lần thử cho kết quả có ích
  đều dùng `gemini-3.1-pro-preview`. Muốn hiệu quả cần chọn model phụ mạnh hơn model dịch.
- **Prompt `polish-v4`:** biến thể B (soát rồi sửa) cho phép viết lại câu để bớt văn dịch, kèm các luật
  khóa nghĩa: giữ chi tiết, giữ mức lịch sự của lời thoại, giữ kiểu ngoặc của bản nháp, giữ nghĩa thành
  ngữ và từ nối, không đổi đại từ gọi người khác. Mỗi bản sửa có `gain`; chỉ nhận `gain` cao.
- **Kiểm bằng code (`verifyEdits`):** như `polish-v3`, thêm loại bản sửa đưa vào kiểu ngoặc CJK mà bản nháp
  không có, thêm đại từ gọi người khác (ngài, cậu, cô, chàng, nàng, ông, anh, em, hắn...), hoặc bỏ đại từ
  trang trọng (ngài, chàng, nàng, ngươi, trẫm, thần, thiếp). Thêm "tôi/ta" được phép vì đó là cách sửa
  khi bản dịch sát chữ làm mất chủ ngữ.
- **Best effort:** lỗi mạng, bộ lọc nội dung, hết ngân sách, xung đột với bản người sửa giữa chừng đều
  giữ nguyên bản dịch và không làm hỏng lượt. Mỗi lô tính một lượt vào trần số lần gọi, token và chi phí
  của tác vụ (vòng `polish` của `CallBudget`). Nhật ký AI của tác phẩm có mục `polish.main` cho từng lô.

Kết quả thử (truyện 30 chương, chương 1–3, `gemini-3.1-pro-preview`, hai lần mỗi chương, một người đọc,
chưa chấm mù): sửa 8–20 đoạn mỗi chương, hai lần chạy chỉ trùng khoảng 30–55%. Đọc 40 bản sửa của lần
đầu: khoảng 19 tốt, 11 trung tính, 10 sai hoặc rủi ro (khoảng 25%; prompt trước khi thêm luật là khoảng
30%). Luật giữ nghĩa thành ngữ làm lỗi "Đến nước này rồi" bị viết thành "Giờ này rồi" biến mất. Vẫn còn lọt:
mất chi tiết ("lộng lẫy"), mất chữ "chỉ", đảo nghĩa một câu hỏi. Bản sửa nằm ở cả hai lần chạy vẫn sai
khoảng 18%, nên không thể lọc bằng đồng thuận.

Hạn chế đã biết:

- Câu do lượt trước của cùng mục đã ghi (tiếp tục sau tạm dừng) không được trau chuốt.
- Usage của lượt trau chuốt cộng vào operation và tính giá theo model của tác vụ, dù trau chuốt chạy trên
  model phụ; trần chi phí vì thế chỉ gần đúng khi hai model khác giá.
- Chưa có công tắc trong giao diện; chưa chọn riêng model trau chuốt (dùng model phụ).
- Kiểm đại từ có thể chặn nhầm bản sửa đúng (ví dụ "cô" là danh từ), và bỏ sót đại từ ngoài danh sách.
- Chưa đo bằng chấm cặp mù theo mục 6 và chưa thử với truyện không phải tiếng Nhật.

## 6. Kế hoạch đo (đề xuất)

Dữ liệu: `n5955en` chương 1–5 (nhiều thoại, có thầy trò) và `n4696dd` chương 3–5 (cặp Milly↔Rion đã đo
ở `v4`). Mốc là bản nháp của prompt hiện tại, chạy lại vì prompt hợp nhất chưa được đo.

| Chỉ số | Cách đo | Lab đã có? |
| --- | --- | --- |
| Tuân thủ glossary, xưng hô | đếm bằng code (T0) | có |
| Câu checker bắt / câu thật sai | người đọc mẫu câu bị bắt | cần làm — quyết định có bật tự sửa |
| Dấu hiệu văn dịch / 1.000 chữ | bộ đếm của biến thể C | cần viết |
| Mức đổi chữ | tỷ lệ đoạn bị đổi, độ dài diff | cần viết |
| Giữ nghĩa | judge so với bản gốc, chỉ hỏi nghĩa có đổi | gần có (T1) |
| Hay hơn không | so cặp mù A/B, judge khác họ model; người chấm mù 20–30 đoạn bị đổi | có (T1, T3) |
| Làm nhẹ lời thô | đọc riêng các đoạn thoại gắt | cần chọn mẫu |
| Chi phí mỗi chương | usage | có |

Thứ tự: mốc → kiểm bằng code (chỉ cờ) → sửa có chủ đích → B → C → E nếu muốn biết lợi về chi phí. Mỗi
biến thể một lần chạy rồi đọc mù. Trau chuốt chỉ thành công tắc trong sản phẩm khi thắng mốc ở chấm cặp
mù, không giảm tuân thủ glossary/xưng hô và không làm nhẹ lời thô.

## 7. Câu hỏi còn mở

- Ngưỡng nào của tỷ lệ bắt nhầm thì cho tự sửa chạy mặc định?
- Lượt sửa có được dùng model khác lượt dịch (đúng hướng Diagnose-then-Repair) hay giữ cùng model để
  trúng cache?
- Cờ theo câu lưu ở đâu trong hồ sơ đề xuất, và quyết định theo từng khối diff được lưu ra sao (đang mở ở
  [luồng duyệt](../proposals/review-flow.md))?
- Trau chuốt có được đụng lời kể ngôi ba không, khi đại từ người kể đã khóa theo nhân vật?

[Về module Ngữ cảnh](README.md)
