# AI trích xuất glossary

Cập nhật: 2026-10-14 · Trạng thái: bước 1–4 **đã triển khai trong sản phẩm** qua
`ContextExtractionService` (change `add-agent-context-workflow`: ứng viên `pending` có bằng chứng, trích
tăng dần theo chương đã quét, cờ `alias_conflict`/`script_mismatch`/`reopened`, duyệt có guard); bước
5–6 (hàng duyệt) có dạng tối thiểu trong màn Từ điển; bước 7 **đã triển khai** từ 2026-10-14 (phân tích xưng
hô cùng bước trích, xem [nhân vật và xưng hô](characters-and-addressing.md#phân-tích-xưng-hô-trong-bước-trích-quyết-định-2026-10-14)). Lab vẫn gọi cùng các hàm
thuần của [`glossaryExtraction.ts`](../../../src/main/services/ai/glossaryExtraction.ts). Nguyên tắc ở mục 1 là **quyết định của chủ sản phẩm** (2026-10-06).
Hành vi hiện tại của bước trích sau change `improve-glossary-extraction` (2026-10-24) ở mục 8.
Chủ trì: kỹ thuật (luồng, phép đo), sản phẩm/ngôn ngữ (chính sách phiên âm, hàng duyệt).
Câu hỏi: làm sao để AI tự lập glossary đủ tốt để bản dịch nhất quán hơn, mà người dịch vẫn là người chốt?

## 1. Nguyên tắc

- **Dữ liệu ngữ cảnh do luồng AI của Mira tạo, không soạn hộ.** Glossary, nhân vật và cặp xưng hô dùng
  cho thí nghiệm phải đi qua chính lệnh trích xuất mà sản phẩm sẽ chạy. Năm tệp glossary hiện có của Lab
  là nháp soạn tay (`claude-draft`), nên số đo trên chúng không nói về sản phẩm
  ([vận hành thí nghiệm](../measurement/running-experiments.md#mira-lab-thử-prompt-trên-truyện-thật)).
- **AI chỉ tạo ứng viên.** Theo [glossary](glossary.md): ứng viên có dạng nguồn, vị trí, nghĩa dự đoán, bản
  dịch đề xuất, lý do và bằng chứng; mục chưa duyệt không vào prompt; mục đã loại được nhớ.
- **Code kiểm những gì kiểm được.** Dạng nguồn phải có thật trong bản gốc, câu bằng chứng phải trích đúng
  nguyên văn — một tên chỉ có trong output của model không chứng minh gì.

## 2. Các tool khác làm gì (quan sát, đọc 2026-10-06)

| Nguồn | Cách làm | Ghi chú |
| --- | --- | --- |
| [KeywordGacha](https://github.com/neavo/KeywordGacha) | LLM đọc văn bản, trả bảng thuật ngữ kèm ngữ cảnh và gợi ý quan hệ nhân vật | Tự báo “trúng ~90%” so với glossary làm tay; README không mô tả pipeline |
| [LinguaGacha](https://github.com/neavo/LinguaGacha) | “Trích xuất thuật ngữ” là bước riêng nên chạy trước khi dịch cả truyện | Mục tiêu nêu rõ: tên nhân vật thống nhất toàn tác phẩm |
| Dịch sách bằng LLM ([ví dụ](https://dev.to/jacob_gong/translating-entire-books-with-llms-a-chunking-strategy-that-doesnt-lose-context-257l)) | NER (spaCy) tìm thực thể, LLM xác minh và đề xuất cách dịch | Bài thực hành, không phải nghiên cứu |
| [WMT25, hệ thống nhất quán thuật ngữ](https://www2.statmt.org/wmt25/pdf/2025.wmt-1.30.pdf) | Bước chuẩn bị: LLM trích thuật ngữ, khớp từ điển song ngữ, gộp glossary người dùng | Miền kỹ thuật, không phải văn học |
| [ATE bằng LLM, ACL Findings 2025](https://arxiv.org/abs/2506.21222) | Few-shot chọn ví dụ theo cú pháp thay vì theo nghĩa cải thiện F1 trích thuật ngữ | Gợi ý: ví dụ mẫu nên giống **dạng** câu nguồn |
| [DelTA](https://arxiv.org/abs/2410.08143) | Bộ nhớ tên riêng là một tầng riêng khi dịch tài liệu dài | Ủng hộ tách tên riêng khỏi phần ngữ cảnh khác |

Đọc mã nguồn thêm (quan sát, 2026-10-23):

- **KeywordGacha** đếm tần suất dạng dài trước và che vị trí đã khớp, nên tên ngắn không bị đếm lại bên trong
  tên dài. Mira dùng lại cách này (mục 8).
- **AiNiee** gom các dạng gần nhau thành nhóm rồi gọi model thêm một lần để "phán quyết" cách dịch chung cho
  nhóm. Mira không thêm lời gọi đó; thay vào đó xếp cả nhóm vào một lô và gửi kèm các mục đã chốt.
- **LinguaGacha** vẫn tách trích thuật ngữ thành bước chạy trước khi dịch, như đã ghi ở bảng trên.

Điểm chung: trích xuất là **bước riêng trước khi dịch**, AI làm phần hiểu (loại, nhóm biến thể, đề xuất
dịch), và glossary chỉ có giá trị nếu sau đó được giữ nhất quán. Không nguồn nào cho số đo Nhật–Việt.

## 3. Luồng đề xuất

```text
Chương đã nhập (chỉ tới chương sắp dịch, tránh lộ trước)
  1. Sinh ứng viên bằng code ──┐
  2. AI quét mẫu chương ───────┴→ hợp ứng viên, đếm tần suất, gom câu ngữ cảnh
  3. AI phân loại + đề xuất dịch (theo lô ứng viên, kèm 2–3 câu ngữ cảnh mỗi mục)
  4. Kiểm bằng code: có trong bản gốc, bằng chứng đúng nguyên văn, trùng/xung đột, mục đã loại
  5. Lưu ứng viên  status=pending, origin=ai, kèm bằng chứng, model, hash prompt
  6. Người duyệt (theo loại, theo tần suất) → approved / rejected
  7. Nhân vật và cặp xưng hô: `analyze` dùng các mục loại "người" đã duyệt làm danh sách nhân vật
  → Dịch dùng mục đã duyệt như hiện tại
```

### Bước 1–2: sinh ứng viên — code trước, AI bù

| Nguồn ứng viên | Bắt được | Bỏ sót |
| --- | --- | --- |
| Code, tiếng Nhật: chuỗi katakana ≥ 2 ký tự; kanji đi với hậu tố gọi (さん, くん, 様, 先生, 殿下…); ruby/furigana `｜漢字《よみ》` của syosetsu | Tên người, tên Tây, tên có furigana; rẻ và tất định | Tên kanji không hậu tố, kỹ năng, tổ chức |
| Code, tiếng Trung: chuỗi lặp ≥ N lần đứng trước 说/道/笑 hoặc sau 叫/名叫 | Tên người phổ biến | Phần lớn thuật ngữ; tiếng Trung không có ranh giới từ |
| AI quét mẫu: vài chương đầu và chương rải đều, hỏi “liệt kê tên riêng và thuật ngữ cần dịch nhất quán” | Kỹ năng, địa danh, tổ chức, vật phẩm, tên kanji | Có thể bịa — bước 4 lọc |

Hợp hai nguồn, giữ ứng viên xuất hiện **ít nhất 2 lần** trong phạm vi quét (ngưỡng thử, cần đo), đếm tần
suất và gom 2–3 câu ngữ cảnh mỗi mục để gửi bước 3.

### Bước 3: AI phân loại và đề xuất dịch

Một lời gọi cho mỗi lô khoảng 50–100 ứng viên (cỡ lô cần đo). Đầu ra JSON theo mẫu cố định:

```json
{"terms":[{"source":"桐谷彰","aliases":["桐谷","彰"],"type":"person","reading":"Kiritani Akira",
  "target":"Kiritani Akira","gender":"male","note":"nhân vật chính, học sinh",
  "confidence":"cao","evidence":["ch1: 「桐谷、お前の進路希望調査…」"]},
 {"source":"進路希望調査","type":"term","target":"phiếu khảo sát nguyện vọng","confidence":"trung bình",
  "evidence":["ch1: …"]},
 {"source":"先生","type":"not-a-term","reason":"danh xưng chung, dịch theo cảnh"}]}
```

- `type`: `person`, `place`, `organization`, `skill`, `item`, `title` (chức danh riêng), `term`,
  `not-a-term`. Loại `not-a-term` được lưu thành mục đã loại để không đề xuất lại.
- Chính sách dịch đi kèm prompt theo ngôn ngữ, khớp profile hiện có: tên Nhật phiên romaji theo thứ tự
  họ trước tên (chuẩn Hepburn cụ thể còn phải chốt); tên Tây viết bằng katakana thì khôi phục dạng Latin
  khi chắc chắn; tên Trung dùng Hán Việt; kỹ năng và vật phẩm dịch nghĩa, ghi dạng gốc trong `note`.
- Furigana có thì đưa vào làm `reading` — đọc tên Nhật từ kanji là chỗ model hay sai nhất.
- `note` **không chứa diễn biến**: chỉ vai trò đã lộ trong phạm vi quét. Giả danh, thân phận thật tiết lộ
  muộn không được đẩy ngược vào chương trước ([glossary](glossary.md#ca-kiểm-bắt-buộc-trước-khi-làm)).

### Bước 4: kiểm bằng code

| Kiểm | Xử lý khi sai |
| --- | --- |
| `source` và mọi alias có trong bản gốc của phạm vi quét | bỏ dạng không có; bỏ mục nếu không còn dạng nào |
| Câu `evidence` trích đúng nguyên văn | bỏ câu sai; không còn câu nào thì hạ `confidence` |
| Trùng mục đã duyệt | bỏ, hoặc đề xuất thêm alias cho mục đó |
| Trùng mục đã loại | bỏ, trừ khi bằng chứng mới; khi đó mở lại kèm lý do |
| Alias trùng giữa hai mục | giữ cả hai, gắn cờ xung đột cho người duyệt |
| `target` của tên Nhật phải là chữ Latin; của tên Trung phải là chữ tiếng Việt | gắn cờ, không tự sửa |

### Bước 5–6: lưu và duyệt

- Mục mới lưu `status: pending`, `origin: ai`, kèm bằng chứng, model và hash prompt của lần trích.
- Hàng duyệt xếp theo tần suất và loại; cho duyệt hàng loạt **trong một loại** (ví dụ mọi tên người tần
  suất cao), sửa bản dịch tại chỗ, loại kèm lý do. Khu vực Ngữ cảnh đang có hàng “Chờ duyệt” minh họa.
- **Trích tăng dần:** khi nhập thêm chương hoặc trước khi dịch một dải chương mới, chỉ quét chương chưa
  quét; chỉ đề xuất mục hoặc alias mới.

### Bước 7: nối với nhân vật và xưng hô

**Đã triển khai (2026-10-14):** sau các lô quét, cùng lần trích gọi phân tích xưng hô với mục loại `person`
(đã duyệt hoặc chờ duyệt) và nhân vật có sẵn; mục chưa có nhân vật thành nhân vật `pending`, cặp đề xuất lưu
`pending` kèm bằng chứng và chờ duyệt cùng thuật ngữ. Toàn bộ dữ liệu ngữ cảnh đi một đường: trích thuật ngữ →
nhân vật → xưng hô → người duyệt. Chi tiết ở [nhân vật và xưng hô](characters-and-addressing.md).

## 4. Thí nghiệm trong Lab (đề xuất)

Lệnh mới `extract <ncode> [--chapters 1-30] [--model …]` ghi `glossary/<ncode>.ai.json` với
`origin: ai`, không đè tệp soạn tay; sổ đăng ký ghi nguồn gốc mỗi lần chạy
([sổ đăng ký](../measurement/running-experiments.md#sổ-đăng-ký-lần-chạy)).

| Nhánh | Glossary | Câu hỏi trả lời |
| --- | --- | --- |
| A | không có | mốc: model tự giữ tên tới đâu |
| B | AI trích, duyệt tự động (chỉ để đo) | luồng AI thuần giúp được bao nhiêu |
| C | AI trích, người duyệt | sản phẩm thật sẽ đạt bao nhiêu |
| D | soạn tay (`claude-draft`) | đối chứng với các số đo cũ |

| Chỉ số | Cách đo | Cần nhãn người? |
| --- | --- | --- |
| **Tên nhất quán** | cùng dạng nguồn có được dịch cùng một cách qua các chương không (tỷ lệ dạng dịch chiếm đa số) | không — đo được cả nhánh A |
| Độ trúng của trích xuất | so ứng viên với danh sách sau khi người duyệt: đúng, thừa, sót | có |
| Tuân thủ glossary | như `report` hiện có | không |
| Chi phí trích xuất | token, USD mỗi chương quét | không |

“Tên nhất quán” là chỉ số chính vì không cần đáp án: nó cho biết glossary có làm bản dịch ổn định hơn
hay không, kể cả trước khi có người duyệt.

## 5. Mặc định trích trước (quyết định 2026-10-14)

Chủ sản phẩm chốt: luồng dịch mặc định tự trích glossary trước nếu tác phẩm chưa có, trừ khi người dùng chủ
động bảo dịch luôn. Trong mã: `contextStrategy` của lệnh tạo task thành tùy chọn; bỏ trống thì tác phẩm không có
mục thuật ngữ nào đã duyệt hoặc chờ duyệt được trích trước (rồi `waiting_user(context_review)` như cũ), đã có
thì dịch ngay. Chat chỉ truyền `approved_only` khi người dùng nói rõ dịch luôn. Luồng dịch một chương trong hộp
thoại dịch chưa có bước trích.

## 6. Tự cải thiện qua các chương (nghiên cứu 2026-10-14, đề xuất)

Vòng đề xuất: mỗi chương dịch xong sinh **tín hiệu** → ứng viên `pending` có bằng chứng, hoặc cờ trên mục đã
có → người dịch duyệt → thay đổi ghi theo phạm vi chương → app chỉ **liệt kê** chỗ bị ảnh hưởng, không sửa.
Không công cụ nào đã đọc tự áp thay đổi glossary vào bản dịch cũ (Phrase cũng bắt người dùng tìm–thay tay,
[Phrase](https://support.phrase.com/hc/en-us/articles/10112307362332)).

| Tín hiệu | Ai làm | Mira nên |
| --- | --- | --- |
| Ứng viên mới tần suất cao | DelTA trích tên riêng sau mỗi câu và cố định bản dịch đầu ([arXiv 2410.08143](https://arxiv.org/html/2410.08143)) | pending (đã có); không cố định bản dịch đầu của mục chưa duyệt |
| Người dùng sửa tên trong bản dịch | Crowdin Dreams gom các lần sửa lặp lại thành đề xuất có ví dụ trước/sau, không tự áp ([Crowdin](https://store.crowdin.com/crowdin-dreams)) | pending khi cùng một sửa lặp ≥2 chương |
| Cùng nguồn dịch khác nhau giữa các chương | Trados "inconsistent translations"; WMT25 đo % lệch khỏi cách dịch phổ biến ([WMT25](https://www2.statmt.org/wmt25/terminology.html)) | cờ trên mục đã duyệt |
| Alias (họ/tên/hậu tố) | BookNLP gom tên trước, tránh coreference đầy đủ vì hay gộp nhầm ([BookNLP](https://github.com/booknlp/booknlp)) | alias pending bằng code từ mục `person` đã duyệt |
| Đổi phạm vi (thăng chức, lộ danh tính) | Novelcrafter progression theo cảnh ([Novelcrafter](https://www.novelcrafter.com/help/docs/codex/progressions-additions)) | mục mới có `from_chapter`, mục cũ đóng `to_chapter` |

LLM dịch đúng tên người khoảng 60%, địa danh khoảng 90% ([MT Summit 2025](https://aclanthology.org/2025.mtsummit-1.16),
snippet): hàng duyệt nên ưu tiên tên người.

Năm cơ chế xếp theo giá trị/chi phí (chưa duyệt):

1. **Tổng hợp compliance theo mục qua các chương** — mục "thiếu target" ở k/n chương thì cờ `often_missing`,
   gợi ý biến thể hoặc sửa target. Không cần dữ liệu mới ngoài một mã cờ.
2. **Xếp hàng duyệt theo tác động** — số chương của task kế tiếp mà mục khớp; không cần dữ liệu mới.
3. **Alias bằng code** từ mục `person` đã duyệt (tách họ/tên, bỏ hậu tố; chỉ dạng có thật, ≥2 lần).
4. **Học từ sửa của người dùng** — so `after_text` của part đã nhận với bản hiện tại; cần loại bằng chứng
   trước/sau.
5. **Progression** — bước phân loại nhận thêm mục đã duyệt có mặt trong lô và được đề xuất đổi phạm vi; cần
   liên kết `supersedes`.

Không làm: tự duyệt theo tần suất; ghi đè target đã duyệt âm thầm hay tìm–thay toàn truyện; coreference đầy đủ;
gọi LLM sau mỗi câu; đưa thông tin chương sau vào ghi chú của mục áp cho chương trước.

Câu hỏi mở: tự duyệt alias tách bằng code? Đổi target giữa truyện mặc định "từ chương N" hay toàn bộ? Sửa nào
tính là tín hiệu (sửa tay, hay cả đề xuất của chat đã nhận)? Lời gọi LLM chạy nền có tính vào ngân sách task?
Truyện đang ra tự quét khi có chương mới?

### Đã triển khai (change `add-context-progression`, 2026-10-24)

Không còn bước duyệt (2026-10-23), nên mọi thay đổi đều áp ngay. Thay cho bước duyệt là chốt chặn và lịch sử.

- **Hai loại thay đổi.**
  - `correction`: mục sai từ đầu, sửa tại chỗ cho cả truyện.
  - `progression`: mục đóng ở chương N−1, và một mục mới nối với mục cũ (`supersedes_id`) bắt đầu từ chương N.
    Thuật ngữ đổi được từ chương N như xưng hô (`changeTermFrom`), kể cả qua steering của task (IPC).
- **Dạng viết** chỉ còn duy nhất trong cùng phạm vi chương. Migration 19 của file tác phẩm dựng lại
  `context_alias` với `UNIQUE (entry_id, form)`. Code từ chối hai mục có phạm vi chồng nhau cùng một dạng.
- **Một hàm áp: `reviseEntry`.** Thay đổi do AI đề xuất chỉ áp khi qua đủ ba chốt:
  - mục chưa được người dùng sửa tay (`user_edited_at`);
  - `progression` có câu chứng ở ít nhất 2 chương từ chương N trở đi;
  - không trả lại một giá trị mà AI đã thay đi.

  Không qua chốt thì mục không đổi; mục nhận cờ `revision_suggested`, đề xuất nằm trong `detail` dạng JSON.
- **Bước trích đề xuất sửa.** Lô phân loại đầu tiên của mỗi khúc kèm `<known_in_chunk>`: tối đa 20 mục có dạng
  trong khúc, mỗi mục một câu mới. Model có thể trả `revisions`. Câu chứng phải có nguyên văn trong chương nó nêu.
  Không thêm lời gọi model nào.
- **Cơ chế 3 (alias bằng code)** đã làm. Phần tên trong tên đầy đủ có ・/＝ xuất hiện riêng ≥ 2 lần thì thành
  alias, cùng các dạng "phần tên + hậu tố" có thật.
- **Cơ chế 4 (học từ sửa tay)** đã làm, theo từng dòng:
  - người dùng lưu bản dịch mà thay bản dịch X của một mục bằng Y (≤ 40 ký tự, không chứa dấu kết câu), thì
    Mira ghi một tín hiệu;
  - cùng cặp X → Y ở 2 chương thì mục đổi theo kiểu `correction`, nguồn là `user_edit_signal`;
  - lần lưu nào thêm hoặc bớt dòng thì bỏ qua (`shortcut:` trong `editSignals.ts`).
- **Cơ chế 5 (progression)** đã làm, cho cả thuật ngữ lẫn xưng hô (xem
  [nhân vật và xưng hô](characters-and-addressing.md)).
- **Lịch sử.** Bảng `context_entry_change` ghi mọi lần tạo hoặc đổi: ai đổi, trường, giá trị cũ và mới, chương bắt
  đầu, câu chứng. Màn Từ điển có nút "Lịch sử" cho từng mục.
- **Chương bị ảnh hưởng.** Hộp thoại "Lịch sử" liệt kê các chương đã dịch trước lần `correction` gần nhất mà
  nguồn có dạng của mục. Nút "Dịch lại các chương này" tạo task dịch đúng các chương đó, sau khi người dùng xác
  nhận. Mira không tự sửa bản dịch nào.
- **Quét lại.** Lưu nguồn của một chương với nội dung khác thì chương đó mất dấu "đã quét".

Cơ chế 1–2 (compliance theo mục, xếp theo tác động) vẫn là đề xuất. Lịch sử chưa có nút hoàn tác.

## 8. Bước trích sau change `improve-glossary-extraction` (đã triển khai 2026-10-24)

Mục này mô tả hành vi hiện tại; các mục 3–4 ở trên là thiết kế ban đầu. Không thêm lời gọi model nào: một lần
chạy vẫn là một lượt quét và các lô phân loại cho mỗi khúc, rồi một lời gọi phân tích xưng hô.

- **Đếm trên toàn phạm vi.** Tần suất đếm trên mọi chương từ chương đầu tới chương cuối của task, không riêng
  khúc đang quét. Không đọc chương sau chương cuối của task. Đếm dạng dài trước và che vị trí đã khớp (theo
  KeywordGacha): "田中" trong "田中太郎" không được đếm thêm.
- **Ngưỡng.** Ứng viên code cần ≥ 2 lần. Dạng model quét được chỉ cần có nguyên văn trong khúc; dạng không có thì
  bị bỏ trước khi phân loại.
- **Lời nhắn của tác giả.** Đoạn cuối chương sau dòng ngăn cách (`――――`, `◇◇◇`…) mà có từ khóa xin đánh giá
  (`評価|ブックマーク|感想|レビュー|お願い`) bị cắt khỏi văn bản dùng cho bước trích. Bản dịch không đổi.
- **Lọc rác (tiếng Nhật).** Bỏ chuỗi katakana mà mọi lần xuất hiện đều dính đuôi hiragana không phải trợ từ
  hay hậu tố gọi người (バレる); bỏ tượng thanh: tận cùng ッ, cụm lặp (ゴチャゴチャ), một chữ lặp ba lần
  (アハハハ).
- **Chú âm.** `漢字（カナ）` và ruby `｜漢字《よみ》` thành ứng viên dù chỉ xuất hiện một lần, kèm cách đọc.
- **Không phân loại lại mục đã có.** Ứng viên trùng nguồn hoặc alias của một mục thuật ngữ, kể cả mục `rejected`,
  không được gửi phân loại.
- **Lô theo họ thuật ngữ.** Các dạng là chuỗi con của nhau, hoặc chung kanji đầu hay cuối và dài chênh ≤ 1
  (銀級, 鉄級, 金級), nằm chung một lô. Lô kèm tối đa 30 mục đã chốt trong `<known>`: trước là mục cùng họ, sau là
  mục chung kanji. Prompt yêu cầu dịch theo khuôn của mục đã chốt.
- **`alias_of`.** Model có thể trả một dạng là biến thể của mục đã có; dạng đó thành alias của mục, không tạo
  mục mới. `alias_of` không khớp mục nào thì dạng đó được xử lý như ứng viên mới.
- **Gắn alias khi trùng.** `saveExtraction` không bỏ hẳn ứng viên trùng một mục thuật ngữ nữa: alias chưa thuộc
  mục nào được gắn vào mục đó. Mục `rejected` không nhận alias.
- **Cờ mới, không tự sửa:**
  - `family_mismatch`: bản dịch của mục mới lệch khuôn với mục cùng họ chung hậu tố/tiền tố. Hai bản dịch cùng
    khuôn khi có chung một từ và cách viết hoa giống nhau; từ đứng đầu bản dịch không so hoa thường. Tên người
    không so.
  - `short_alias`: alias dài ≤ 2 ký tự nằm trong một chuỗi cùng hệ chữ dài hơn không thuộc mục nào
    (セラ trong セラミック). Alias đó không được lưu.
- **Cách đọc.** Lưu ở cột `context_entry.reading` (migration 19 của file tác phẩm); không vào prompt dịch.
- **Giới tính.** Phân tích xưng hô chỉ giữ `male`/`female` khi `genderEvidence` là câu có thật, chứa tên hoặc
  alias của nhân vật và một từ chỉ giới tính (女, 男, 娘, 少年, 彼女, 彼…). Đại từ tự xưng 僕, 俺, 私 không tính.
  Không có câu như vậy thì giới tính là `unknown`.

### Số đo khi chạy lại không gọi model (2026-10-24)

Cách đo: lấy lại các câu trả lời quét đã lưu trong log của tác phẩm, rồi cho chạy qua phần code mới. Không gọi
model nào. Số mục `term` và số alias chỉ đo được khi chạy lại cả bước phân loại bằng model, nên **chưa đo**.

| Chỉ số | Noel (`23c0b9a2…`) | Zeke (`439f4af4…`) |
| --- | --- | --- |
| Dạng model quét bị mất trước khi phân loại | 15/48 → **0/48** | không có log quét |
| Ứng viên code gửi phân loại | 35 → 25 | 130 → 153 |
| Mục đã có sẽ bị cờ `family_mismatch` nếu là mục mới | 0 | 14 |

Đọc kết quả:
- **Noel.** Có 10 ứng viên rác bị bỏ, đều từ lời nhắn của tác giả: クリック, レビュー, スマホ, スクロール…
- **Zeke.** Ứng viên tăng thêm 23, vì đếm trên toàn phạm vi kéo vào cả từ thông dụng (ポケット, リスト, ゼロ) và tượng
  thanh chưa lọc được (コツン, ポツリ). Bước phân loại phải loại các từ này, nên tốn thêm token; mỗi từ chỉ bị loại
  một lần, vì đã loại thì được nhớ.
- **Cờ lệch khuôn ở Zeke.** Phần lớn là lệch thật:
  - "Hạng Bạc" và "Cấp Sắt";
  - "Ma thuật Cấp Hai" và "Ma thuật cấp Ba";
  - "Đồng vàng", "Tiền sắt" và "Đồng xu đồng".

  Có một cờ nhầm: 魔力操作 "Thao tác ma lực" với 魔術学院 "Học viện Ma thuật".

## 9. Câu hỏi ngữ cảnh và quy ước tác phẩm (đã triển khai 2026-10-24, change `add-context-questions`)

Task dịch không dừng chờ người dùng. Chỗ bước trích không chắc thì Mira áp ngay phương án mặc định an toàn, rồi
gắn một câu hỏi lên mục. Câu hỏi nằm trong `review_flags` của mục, ở dạng một `ContextQuestion` JSON. Mỗi lựa
chọn ứng với một hành động code, không gọi model.

| Câu hỏi | Khi nào | Mặc định đã áp | Lựa chọn |
| --- | --- | --- | --- |
| Sửa đổi bị giữ lại (`revision_suggested`) | đề xuất của AI không qua chốt chặn | giữ nguyên | Áp cho cả truyện · Áp từ chương N · Giữ nguyên |
| Dịch lại (`revision_suggested`) | sau một `correction` có chương đã dịch bị ảnh hưởng, khi quy ước là "hỏi" | chỉ liệt kê | Dịch lại các chương này · Chỉ liệt kê |
| Có thể là một (`merge_suggested`) | mục mới viết liền mục đã có (`X の Y`, `X・Y`), hoặc model trả `same_as` | hai mục riêng | Gộp vào mục kia · Hai mục khác nhau |
| Giới tính chưa chắc (`gender_uncertain`) | các câu chứng giới tính hợp lệ mâu thuẫn nhau (少年 và 彼女) | `unknown` | Nam · Nữ · Không rõ |

- **Không hỏi lại.** Mỗi câu có một fingerprint: hash của loại, mục, mục kia và đề xuất. Trả lời xong thì cờ được
  gỡ. Fingerprint cùng nhãn đã chọn được ghi vào lịch sử mục (`field = 'question'`). Câu có fingerprint đã trả
  lời thì không được tạo lại.
- **Gộp.** Nguồn và alias của mục mới thành alias của mục kia; bằng chứng và lịch sử chuyển sang mục kia; mục mới
  bị xóa.
- **Trả lời trong màn Từ điển.** Nút "Cần xem (N)" liệt kê các câu đang mở, xếp theo mức ảnh hưởng (số lần dạng
  của mục xuất hiện trong các chương chưa dịch). Thẻ câu hỏi dùng chung giao diện với `ask_questions` của chat
  (`QuestionForm`). Chọn "Dịch lại" thì Mira hỏi xác nhận rồi mới tạo task.
- **Trả lời qua chat.**
  - Mỗi lượt có tác phẩm làm đích sẽ kèm một dòng: số câu hỏi đang mở và các quy ước chưa chốt.
  - Model đọc câu hỏi bằng `read_context_questions`, hỏi người dùng tối đa 5 câu bằng `ask_questions`, rồi áp
    đáp án bằng `answer_context_questions`. Mỗi câu có kết quả riêng, nên một câu đã đóng không chặn các câu khác.
  - `ask_questions` trả `autoAnswered` (Autopilot) thì model không áp đáp án và không lưu quy ước.
- **Quy ước tác phẩm** (bảng `work_convention`, migration 20). Không có dòng nào thì là mặc định, chưa chốt.

  | Quy ước | Giá trị | Mặc định |
  | --- | --- | --- |
  | Kiểu phiên âm tên Nhật | Hepburn có dấu · Hepburn không dấu · kiểu `ou` | Hepburn không dấu |
  | Kính ngữ | Giữ hậu tố · Việt hóa | Giữ hậu tố |
  | Khi sửa sai đụng chương đã dịch | Chỉ liệt kê · Hỏi có dịch lại không | Chỉ liệt kê |

  - Trước task dịch đầu tiên, chat hỏi các quy ước chưa chốt trong một lần `ask_questions`, rồi lưu bằng
    `set_work_conventions`.
  - Xem và sửa ở mục "Quy ước của tác phẩm" trong màn Từ điển.
  - Kiểu phiên âm đi vào prompt phân loại của bước trích. Kính ngữ đi vào bản chụp ngữ cảnh của chương, nên một
    chương đã ghim thì giữ quy ước lúc nó bắt đầu chạy.
  - Đổi kiểu phiên âm thì code phiên lại bằng bảng kana → romaji (`romaji.ts`) những mục tên người thỏa ba điều:
    có cách đọc, chưa được sửa tay, và bản dịch đúng cách phiên cũ. Mỗi mục phiên lại có lịch sử với nguồn
    `code`. Mira trả số mục đã đổi và số mục bị bỏ qua.

Chưa làm: số câu hỏi trong chi tiết task ở màn Hoạt động. Màn đó đang được làm ở phần việc khác.

## 7. Câu hỏi còn mở

- Chuẩn phiên romaji: đã thành quy ước của từng tác phẩm, mặc định Hepburn không dấu (mục 9).
- Tên Trung: Hán Việt nên tra bằng bảng tất định thay vì để model đoán? Cần nguồn dữ liệu có giấy phép
  dùng được.
- Quét bao nhiêu chương đầu là đủ trước khi dịch, và có quét toàn truyện khi người dùng cho phép không?
- Ngưỡng tần suất và cỡ lô ứng viên: đo trên `n5955en`, `n4696dd`.
- Khi nào được tự duyệt (ví dụ tên người tần suất cao, độ tin cao) — chỉ sau khi có số đo độ trúng.

[Về module Ngữ cảnh](README.md)


> [!IMPORTANT]
> **Cập nhật quyết định sản phẩm (2026-10-23):**
> Chủ sản phẩm đã chốt bãi bỏ hoàn toàn cơ chế duyệt tiền kiểm đối với cả thuật ngữ và xưng hô.
> 1. AI trích xuất thuật ngữ/xưng hô sẽ lưu trực tiếp vào từ điển ở trạng thái có hiệu lực (`approved`). Không còn
>    `pending`: migration 17 của file tác phẩm chuyển mục `pending` cũ thành `approved`. `rejected` vẫn giữ làm trí
>    nhớ "đừng đề xuất lại" (model gọi `not-a-term`, hoặc người dùng từ chối trước đây), bị ẩn khỏi bảng, và bước
>    trích không còn mở lại nó.
> 2. Pipeline dịch tự động chạy xuyên suốt, không ngắt luồng sang `waiting_user(context_review)`.
> 3. Toàn bộ thanh lọc trạng thái `[ Tất cả | Đã duyệt | Chờ duyệt | Từ chối ]`, các nút Duyệt/Từ chối trên UI được dọn dẹp. Người dùng kiểm soát chất lượng qua hậu kiểm (sửa, xóa, cấm dùng trực tiếp trong bảng).
