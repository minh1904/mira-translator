# Agent toàn diện: người dùng chỉ cần ra lệnh

Cập nhật: 2026-10-22 · Trạng thái: **đề xuất**; ba điểm đã được chủ sản phẩm chốt hướng cùng ngày và ghi ở
[decisions.md](decisions.md): quyết định 13 (tác phẩm đang mở luôn là ngữ cảnh), quyết định 14 (Autopilot
và phạm vi lệnh) và quyết định 9 (glossary dùng tạm, cách A). Phần còn lại chưa chốt. Tài liệu này nêu luồng
đích và các quyết định cần sửa; không phải trạng thái triển khai. Hiện trạng code lấy từ cây làm việc ngày
2026-10-22, kèm log chat thật cùng ngày (mục 2).

## 1. Đích

Chủ sản phẩm muốn một agent dịch, sửa và quản lý toàn bộ tác phẩm, người dùng chỉ ra lệnh. Năm lệnh mẫu
dùng làm gate cho toàn bộ đề xuất:

| # | Lệnh | Agent phải làm |
| --- | --- | --- |
| L1 | "Dịch toàn bộ truyện" | Trích thuật ngữ, dịch mọi chương chưa dịch, kiểm tra, báo kết quả |
| L2 | "Đổi Lâm Phong thành Lâm Phượng trong cả truyện" | Sửa glossary, thay ở mọi chương đã dịch, cho xem trước và hoàn tác được |
| L3 | "Sửa chương 12, tên nhân vật bị lệch và sót đoạn" | Kiểm tra chương, sửa đúng chỗ lỗi, không dịch lại chỗ người dùng đã sửa tay |
| L4 | "Từ chương 50, A gọi B là 'chàng'" | Đổi xưng hô từ chương 50, dịch lại phần bị ảnh hưởng |
| L5 | "Kiểm tra chương 1–100 rồi sửa hết lỗi" | QA hàng loạt, sửa lỗi chắc chắn, gom lỗi chưa chắc cho người dùng |

Với L1, người dùng chỉ ra lệnh một lần. Sau đó họ không phải bấm duyệt từng bước, không phải tự sang khu
Context duyệt glossary rồi quay lại, và không bị báo "không làm được" vì luật quyền.

## 2. Vì sao hiện tại chưa làm được

| Chặn | Ở đâu | Hậu quả với lệnh mẫu |
| --- | --- | --- |
| Autopilot bỏ qua task dịch nhiều chương | Quyết định 14; `applyPermission` (`policy.ts`) | L1 ở Autopilot bị báo không làm được |
| Task dừng chờ duyệt glossary | Quyết định 9; `taskService.extractTerms` → `waiting_user(context_review)` | L1 đứng ở chương 0 với tác phẩm mới |
| Ghi vào chương người dùng không nêu tên là rủi ro cao | `namedByUser` trong `policy.ts` | L2, L5 bị hỏi từng chương hoặc bị bỏ qua |
| Trần lượt 6 vòng, 20 call, **3 thao tác ghi**; chạm trần là `failed` | `MAX_MODEL_ROUNDS`, `TurnBudgetTracker` (`registry.ts`) | L2, L3, L5 dừng giữa chừng |
| Không có công cụ ghi glossary, xưng hô, điều khiển task, QA, tìm–thay | Bộ capability (`capabilities/*.ts`) | L2, L4, L5 không có đường đi |
| Không có tìm–thay toàn truyện ở bất kỳ đâu | — | L2 không làm được kể cả bằng tay |
| Thao tác ghi gói trong một chương, Undo theo từng operation | `writeCoordinator.ts`, `agentOperationJournal.ts` | L2 không hoàn tác được một lần cho cả lệnh |
| Glossary và xưng hô không có journal hay Undo | `glossaryService.ts`, `addressingService.ts` | Agent ghi Context thì không lùi được |
| `search_work` chỉ trả lần khớp đầu của mỗi chương | `readCapabilities.ts` | L2 không đếm được số chỗ cần thay |
| Code polish và QA task có sẵn nhưng agent không gọi được | `services/ai/polish.ts`, `taskQuality.ts` | L3, L5 thiếu bước kiểm và sửa |

Gốc của các chặn: luật quyền hiện hỏi **"người dùng có nêu tên đích này không"**. Agent toàn diện cần hỏi
**"hậu quả của việc này có lùi lại được không, và có nằm trong việc người dùng đã đồng ý không"**.

### 2.1 Lỗi thấy trong log chat thật (2026-10-22)

Đọc từ `agent_turn` và `agent_tool_call` trong `library.db` của một phiên dịch thử truyện 30 chương. Đây là
**quan sát**, không phải suy luận:

| Quan sát | Hậu quả |
| --- | --- |
| Cả 4 lượt có `context_json` rỗng dù người dùng đang mở chương 1 (chip chương hiện mờ, chỉ gửi khi bấm; quyết định 13 cũ) | Agent phải `list_works`, hỏi "tác phẩm nào?", `resolve_target`: 3–4 vòng chỉ để biết mình đang ở đâu |
| Lượt 16:55 (mức Cho phép tất cả) dùng 5 vòng cho `list_works`, `resolve_target` ×2, `read_translation_tasks`, `list_glossary`, rồi hết lượt; **chưa bao giờ gọi** `create_translation_task` | Không dịch gì |
| Vòng cuối không có tool trả câu trả lời rỗng, lượt vẫn `completed` | Giao diện im lặng, người dùng không biết vì sao |
| `list_glossary` ở cấp tác phẩm trả lỗi "yêu cầu target chapter", lỗi không chỉ cách sửa | Model không tự sửa được, mất một vòng |
| Lượt 16:50 (Autopilot) gọi đúng `create_translation_task` 1–30 và bị `autopilot_skipped` | Mô tả mức quyền gây hiểu nhầm: "bỏ qua thao tác rủi ro cao" bị đọc thành "mặc kệ rủi ro" |
| Hai lệnh gọi song song của Gemini bị nối thành `{...}{...}` (`_raw`) | Đã sửa trong `openAiChatTransport.ts` (slot mới khi `id` hoặc tên hàm khác trên cùng index) |
| Sau khi tạo task, chat không có thẻ tiến độ | Người dùng không biết có đang dịch hay không |

**Trạng thái xử lý (2026-10-22):** ngữ cảnh rỗng, `list_glossary` cấp tác phẩm, lỗi validation không chỉ
cách sửa và lượt rỗng im lặng đã được sửa trong code bằng `add-agent-default-context`, có test. **Chưa đo**:
số vòng trước `create_translation_task` khi gửi "dịch toàn bộ truyện" ở chương 1 của tác phẩm 30 chương với
Gemini, mức Cho phép tất cả (mục tiêu: không quá 2 vòng). Kết quả đo ghi tại đây khi có.

Các lỗi này được xử lý ở mục 5.1 (thẻ tiến độ trong chat), 6 (phạm vi lệnh và ngữ cảnh mặc định), 8 (tool
tổng quan, sửa `list_glossary`) và 9 (lượt rỗng, nút Tiếp tục).

## 3. Nghiên cứu: các agent chuẩn làm thế nào

Nghiên cứu ngày 2026-10-22. Nguồn đầy đủ ở mục 11.

| Mẫu | Ai làm | Rút ra cho Mira |
| --- | --- | --- |
| Hỏi một lần ở đầu, rồi chạy | Claude Code plan mode (duyệt kế hoạch xong chọn "tự chấp nhận sửa"); Devin interactive planning | Lệnh lớn hiện **thẻ kế hoạch**: phạm vi, số chương, chi phí ước tính, việc nào sẽ hỏi. Duyệt một lần |
| Danh sách "luôn hỏi" không mức nào vượt | Claude Code: `ask` rule, xoá đường dẫn quan trọng hỏi cả ở bypass; Cursor: chặn xoá file, file ngoài workspace | Xoá, ghi đè bản người dùng sửa tay, ghi sang tác phẩm khác luôn hỏi |
| Chạm trần thì hỏi tiếp, không báo lỗi | VS Code `chat.agent.maxRequests` = 25, dừng hỏi "Continue to iterate?" | Hết ngân sách lượt thì `waiting_user` với nút Tiếp tục |
| Cầu dao khi lỗi lặp | Claude Code auto: 3 lần bị chặn liên tiếp hoặc 20 lần tổng thì quay về hỏi | Task gặp từ chối nội dung hoặc lỗi liên tiếp thì dừng hỏi |
| Hàng việc bền, model chỉ đổi trạng thái | Anthropic "Effective harnesses for long-running agents": danh sách JSON, mỗi lần một mục | Giữ quyết định 3: nhiều chương là task bền, model không tự lặp |
| Sửa ghi thẳng, xem lại sau bằng Giữ/Hoàn tác | VS Code: sửa được lưu nhưng đánh dấu chờ, Giữ/Hoàn tác từng file hoặc tất cả; checkpoint trước mỗi lệnh | Thanh "Đã sửa N chương" (C20) và checkpoint (C24) là thứ cho phép nới quyền |
| Sửa hàng loạt có xem trước | VS Code Refactor Preview: diff từng chỗ, bỏ chọn được, Apply một lần | Đổi tên toàn truyện: tìm tất định → xem trước theo chương → áp một giao dịch, một điểm Undo |
| Bộ chấm rủi ro bằng LLM không phải ranh giới an toàn | VS Code Assisted, Cursor Auto-review đều ghi rõ | Không dùng LLM quyết định quyền; phân loại theo loại hành động |

Về dịch truyện dài:

- **Hệ nghiên cứu và công cụ đều dùng thuật ngữ trích được ngay, không chờ người duyệt.** DelTA cố định bản
  dịch đầu của tên riêng: độ nhất quán tăng trung bình khoảng 5 điểm, có trường hợp từ 37 lên 85,5.
  TransAgents duyệt glossary bằng AI. Crowdin đưa thuật ngữ nháp vào lần dịch LLM kế tiếp. Các tool dịch
  truyện mạng (Wenyi, LinguaGacha, llm-novel-translator) tự nhận tên, bản tốt hơn có thêm phát hiện xung đột.
- **Phía thận trọng:** memoQ "moderated" ẩn thuật ngữ chưa duyệt; MAPS thấy kiến thức tự sinh đủ nhiễu để
  cần bước lọc. Chưa tìm thấy nghiên cứu nào đo glossary sai lan ra sao.
- **Glossary không tự bảo đảm nhất quán.** Một nghiên cứu nhỏ (nguồn thứ cấp) cho thấy model chỉ theo
  glossary khoảng 70%. Đánh giá chất lượng tổng quát bằng LLM không bắt được lỗi thuật ngữ, nên phải kiểm
  bằng khớp chuỗi sau khi dịch.
- **Kiểm tra tự động đáng làm:** chữ Hán sót trong bản Việt (regex, rất chắc chắn), thiếu/thừa/lặp đoạn,
  số lệch, tên lệch so với glossary, một thuật ngữ có nhiều cách dịch.

Kết luận: tên riêng "thống nhất nhưng có thể sai" rẻ hơn nhiều so với "mỗi chương một kiểu", **với điều kiện
biết chính xác chương nào đã dùng bản nào và đổi lại được bằng một lệnh**.

## 4. Nguyên tắc

1. **Hỏi một lần, đúng chỗ.** Lệnh lớn hỏi một lần qua thẻ kế hoạch. Trong lúc chạy chỉ dừng ở danh sách
   luôn hỏi (mục 6).
2. **Model đề xuất, công cụ tất định làm.** Model chọn việc và tham số. Vòng lặp nhiều chương, tìm–thay,
   kiểm tra là code. Giữ quyết định 3.
3. **Lùi được theo lệnh.** Mọi thay đổi của một lệnh, kể cả glossary và xưng hô, gom dưới một nhóm có
   "Hoàn tác cả lệnh". Lùi được thì không cần hỏi trước.
4. **Kiểm sau khi làm.** Mỗi lệnh ghi kết thúc bằng bước kiểm tất định; kết quả kiểm là phần của báo cáo.
5. **Ngân sách là chi phí, không phải số vòng.** Trần đặt theo token/chi phí và hiện ước tính trước. Chạm
   trần thì hỏi tiếp, không báo `failed`.
6. **Truyện là dữ liệu.** Giữ nguyên: nội dung chương và kết quả công cụ không bao giờ thành chỉ dẫn hay
   căn cứ cấp quyền.

## 5. Luồng tổng thể

```text
Lệnh
 └─ 1. Hiểu ──── resolve đích, đọc trạng thái (chương đã dịch, glossary, task đang chạy)
 └─ 2. Kế hoạch ─ việc nhỏ (≤ 1 chương, không tốn tiền lớn): bỏ qua, chạy luôn
 │                việc lớn: thẻ kế hoạch → người dùng duyệt (Autopilot tự duyệt dưới trần chi phí)
 └─ 3. Chạy ──── trong lượt chat: việc ≤ 1 chương
 │                ngoài lượt (task bền): dịch nhiều chương, đổi tên toàn truyện, QA hàng loạt
 └─ 4. Kiểm ──── QA tất định trên phần vừa ghi; sửa lỗi chắc chắn một vòng; gom lỗi chưa chắc
 └─ 5. Báo cáo ─ tóm tắt + thanh "Đã sửa" (Giữ / Hoàn tác từng mục / Hoàn tác cả lệnh)
```

### 5.1 Thẻ kế hoạch

Hiện khi lệnh chạm hơn một chương, tốn hơn ngưỡng chi phí, hoặc ghi vào Context. Nội dung:

- Phạm vi: tác phẩm, dải chương, số chương sẽ đổi.
- Các bước: trích thuật ngữ → dịch → kiểm → sửa.
- Chi phí ước tính (token, tiền nếu catalog có giá) và trần sẽ áp.
- Chỗ sẽ hỏi lại trong lúc chạy (nếu có), ví dụ "có 3 đoạn người dùng đã sửa tay trong phạm vi".
- Nút chính **Chạy**, menu **Duyệt từng bước**, nút phụ **Sửa kế hoạch** (đưa lại vào ô nhập).

Thẻ kế hoạch thay cho thẻ duyệt `create_translation_task` hiện có. Duyệt thẻ là duyệt mọi call nằm trong
kế hoạch: call của task sau đó không hỏi lại.

Sau khi tạo task, chat hiện **thẻ task** ngay trong transcript: số chương xong trên tổng, trạng thái, và nút
mở màn Tác vụ. Thẻ cập nhật khi task chạy, để người dùng không phải đoán "đã dịch chưa".

### 5.2 Lệnh mẫu đi qua luồng

**L1 "Dịch toàn bộ truyện"** (tác phẩm 300 chương, chưa có glossary):

1. Hiểu: 300 chương, 0 đã dịch, glossary rỗng.
2. Kế hoạch: trích thuật ngữ chương 1–300 → dịch 300 chương → kiểm. Ước tính chi phí. Người dùng bấm Chạy.
3. Task bền chạy. Trích thuật ngữ trước; tên riêng đủ bằng chứng thành **dùng tạm** (mục 7), task **không
   dừng**. Sau chương 5 có một câu hỏi không chặn: "Xác nhận 8 tên chính?" nằm ở màn Tác vụ; task vẫn chạy.
4. Mỗi chương xong chạy QA tất định. Lỗi chắc chắn (sót chữ Hán, sót đoạn) thì dịch lại đúng đoạn đó một lần.
5. Báo cáo: số chương xong, số lỗi còn lại theo loại, số thuật ngữ dùng tạm chờ xác nhận.

**L2 "Đổi Lâm Phong thành Lâm Phượng trong cả truyện":**

1. Hiểu: glossary có `林峰 → Lâm Phong` (dùng tạm hoặc đã duyệt); 120 chương đã dịch.
2. Công cụ `plan_rename` tìm tất định trong bản dịch: 120 chương, 1.430 chỗ khớp; 12 chỗ mơ hồ (nằm trong
   từ dài hơn); 3 chỗ nằm trong đoạn người dùng sửa tay.
3. Thẻ kế hoạch hiện xem trước theo chương, bỏ chọn được. Chỗ mơ hồ và chỗ sửa tay mặc định không chọn.
4. `apply_rename` chạy như task: mỗi chương một operation có revision guard, cùng một nhóm lệnh; cập nhật
   mục glossary thành `Lâm Phượng` (và duyệt luôn, vì người dùng vừa nêu rõ).
5. Kiểm: còn "Lâm Phong" ở đâu không. Báo cáo + Hoàn tác cả lệnh.

**L3 "Sửa chương 12":** chạy QA trên chương 12 → sửa chỗ lỗi chắc chắn bằng `retranslate_segments` (chỉ
đoạn lỗi, bỏ qua đoạn sửa tay) hoặc `edit_translation` → kiểm lại → báo phần còn nghi ngờ. Một chương, có
Undo, nên không cần thẻ kế hoạch.

**L4 "Từ chương 50, A gọi B là 'chàng'":** ghi cặp xưng hô từ chương 50 (`set_addressing`, cùng cơ chế
`changeDyadFrom` của steering) → thẻ kế hoạch nếu chương 50 trở đi đã dịch: dịch lại các đoạn thoại có A
và B → kiểm.

**L5 "Kiểm tra chương 1–100 rồi sửa hết lỗi":** `check_quality` chạy tất định trên 100 chương (chỉ đọc,
không cần duyệt) → thẻ kế hoạch liệt kê lỗi theo loại và chi phí sửa → chạy task sửa → lỗi chưa chắc gom
thành danh sách cho người dùng.

## 6. Mô hình quyền mới

Phân loại hành động theo hậu quả, không theo việc người dùng có gõ tên đích hay không.

| Lớp | Ví dụ | Mặc định | Cho phép tất cả | Autopilot |
| --- | --- | --- | --- | --- |
| A. Đọc, kiểm tra | đọc chương, tìm, QA | chạy | chạy | chạy |
| B. Ghi lùi được, trong phạm vi lệnh | dịch/sửa chương thuộc tác phẩm của lệnh, ghi glossary dùng tạm | chạy, hiện ở thanh "Đã sửa" | chạy | chạy |
| C. Ghi lùi được, quy mô lớn hoặc tốn tiền | > 1 chương, task dịch, đổi tên toàn truyện | thẻ kế hoạch | tự duyệt | tự duyệt dưới trần chi phí; vượt trần thì hỏi |
| D. Luôn hỏi | xoá chương/mục, ghi đè đoạn người dùng sửa tay, ghi sang tác phẩm khác, export ra file | hỏi | hỏi | hỏi |
| E. Cấm | SQL, shell, file, ID thô | deny | deny | deny |

Thay đổi so với hiện tại:

- **"Phạm vi lệnh"** thay `namedByUser`: là **tác phẩm đang mở** (luôn là ngữ cảnh mặc định, không cần bấm
  chip; quyết định 13) hoặc tác phẩm người dùng nêu tên rõ. Lệnh mơ hồ giữa nhiều tác phẩm thì agent hỏi
  lại. Ghi vào chương bất kỳ trong phạm vi là lớp B, không cần gõ tên chương. Ghi sang tác phẩm khác với
  tác phẩm đang mở và chưa được nêu tên là lớp D.
- **Autopilot không còn chặt hơn Cho phép tất cả.** Khác biệt duy nhất: Autopilot tự trả lời câu hỏi và tự
  duyệt thẻ kế hoạch dưới trần chi phí.
- **Lớp D hỏi ở mọi mức.** Ở Autopilot, việc lớp D không có người trả lời thì bị bỏ qua và báo lại, như
  `autopilot_skip` hiện nay, nhưng chỉ cho lớp D.
- Lớp B dựa vào thanh "Đã sửa" và checkpoint của `add-agent-questions-and-checkpoints`. **Chưa có hai thứ đó
  thì lớp B phải giữ hành vi hiện tại.**

## 7. Luồng glossary mới: dùng tạm

### 7.1 Bốn trạng thái

| Trạng thái | Vào prompt? | Ai tạo |
| --- | --- | --- |
| Đã duyệt | có, ràng buộc chính | người dùng, hoặc agent khi người dùng nêu rõ trong lệnh |
| **Dùng tạm** (mới) | có, đánh dấu "đề xuất, dùng thống nhất" | trích xuất, khi đủ điều kiện ở 7.2 |
| Chờ duyệt | không | trích xuất, khi chưa đủ điều kiện |
| Đã loại | không; đưa vào như biến thể cấm | người dùng |

Thứ tự ưu tiên khi trùng: đã duyệt > dùng tạm. Mô hình ba tầng này giống "Preferred / Admitted" của
LingoHub và cách Crowdin đưa thuật ngữ nháp vào lần dịch AI.

### 7.2 Điều kiện thành dùng tạm

- Loại tên riêng: người, địa danh, tổ chức/môn phái, vật phẩm có tên.
- Có bằng chứng ở ít nhất 2 đoạn (bước verify của trích xuất đã có).
- **Không bao giờ dùng tạm:** cặp xưng hô, mục loại khái niệm/cảnh giới chưa rõ, mục bị cờ `not-a-term`,
  mục xung đột với một mục khác.

Xưng hô bị loại vì sai vai vế hay giới tính làm hỏng cả lời thoại và không sửa được bằng thay chuỗi.

### 7.3 Truy vết và sửa

1. Mỗi lần dịch chương lưu mục dùng tạm nào đã vào prompt và ở revision nào. Snapshot `runKey` của task đã
   ghim context; cần thêm truy vấn ngược "mục X được dùng ở chương nào".
2. Người dùng duyệt đúng như đề xuất: không làm gì thêm.
3. Người dùng sửa bản dịch của mục: tự sinh kế hoạch đổi tên như L2, phạm vi là các chương đã dùng bản cũ.
4. Người dùng loại mục: đánh dấu các chương liên quan cho bước kiểm.
5. **Phát hiện xung đột:** một tên gốc có nhiều cách dịch trong các chương đã dịch thì thành mục cần xem,
   xếp theo tần suất (Wenyi, Xbench).
6. Hàng chờ xác nhận xếp theo số lần xuất hiện, để tên nhân vật chính lên đầu.

### 7.4 Câu hỏi không chặn

Sau khi dịch K chương đầu (đề xuất K = 5), task tạo một mục "Xác nhận N tên chính" ở màn Tác vụ và chạy
tiếp. Người dùng xác nhận lúc nào cũng được; đổi tên sau đó đi theo 7.3. Ở mức Mặc định có thể chọn "Dừng
chờ xác nhận" trong thẻ kế hoạch nếu muốn hành vi cũ.

**Giai đoạn chuyển tiếp (đề xuất):** khi chưa có `plan_rename` và `apply_rename`, tên dùng tạm sai không có
cách sửa rẻ. Đến lúc đó task nên **dừng một lần sau K chương đầu** để xác nhận các tên chính, rồi mới chạy
hết. Khi đổi tên toàn truyện có mặt, bước dừng này đổi thành câu hỏi không chặn như trên.

## 8. Bộ capability cần thêm

| Capability | Lớp | Bọc gì có sẵn | Cần làm mới |
| --- | --- | --- | --- |
| `get_work_overview` | A | `LibraryStore`, `AgentTaskService`, `GlossaryService` | Một lần gọi trả số chương, số chương đã dịch, số mục glossary theo trạng thái, task đang có. Thay `list_works` + `list_chapters` + `read_translation_tasks` + `list_glossary` của bước "Hiểu"; có thể nhét sẵn vào prompt của lượt |
| `list_glossary` (sửa) | A | `list_glossary` | Nhận target cấp tác phẩm; lỗi validation nói rõ cần gì (log 2026-10-22: "yêu cầu target chapter" làm model mất một vòng) |
| `search_work` (nâng cấp) | A | `search_work` | Trả mọi lần khớp, đếm theo chương, có trần kết quả |
| `check_quality` | A | `taskQuality.ts`, `checkCompliance` của glossary và xưng hô | Thêm sót chữ Hán, thiếu/thừa/lặp đoạn, số lệch, xung đột thuật ngữ; chạy theo dải chương |
| `list_task`, `control_task` | A / B | `AgentTaskService.control` (pause, continue, retry, cancel, skip) | Chỉ bọc |
| `set_glossary_entry` | B | `GlossaryService.create/update` | Journal và Undo cho mục context; trạng thái dùng tạm |
| `review_glossary` | B | `review`, `bulkApprove` | Chỉ khi lệnh nêu rõ ("duyệt hết tên nhân vật") |
| `set_addressing` | B | `setDyad`, `changeDyadFrom` | Journal và Undo |
| `extract_terms` | C | `ContextExtractionService.extract` | Gọi ngoài task; hiện chỉ đi qua `taskService` |
| `retranslate_segments` | B / C | `runChapterTranslation` | Dịch lại theo danh sách đoạn, bỏ qua đoạn sửa tay |
| `plan_rename`, `apply_rename` | A / C | `edit_translation` theo lô | Tìm tất định, xem trước, operation nhiều chương chung một nhóm. `fromChapter` là tham số **bắt buộc** (mô tả: "1 nếu cả truyện") để model tự quyết theo câu lệnh; lệnh mơ hồ thì hỏi bằng `ask_questions`, và giá trị dự phòng khi Autopilot tự trả lời là cả truyện kèm xem trước, đoạn sửa tay mặc định bỏ chọn |
| `polish_chapter` | B | `services/ai/polish.ts` | Nối vào app; chờ đo tỉ lệ cờ sai theo `post-editing.md` |
| `delete_*`, `export_*` | D | `deleteChapter`, `exportService` | Lớp `destructive` hiện bị deny cứng phải đổi thành luôn hỏi |

Hạ tầng dùng chung cần có trước:

- **Nhóm lệnh (command group):** mọi operation của một lệnh mang chung `group_id`; Undo cả nhóm chạy kiểm
  tra trước rồi lùi theo thứ tự ngược. Mở rộng `undoOperation` theo lô của `add-agent-questions-and-checkpoints`.
- **Journal cho context:** glossary và xưng hô hiện không có Undo. Cần bảng trước/sau giống
  `agent_operation_checkpoint`, ở work DB.
- **Task tổng quát:** `agent_task` hiện chỉ có loại dịch. Cần thêm loại `rename`, `qa`, `fix` dùng chung
  scheduler, trần và trạng thái.

## 9. Ngân sách

- **Lượt chat:** nâng lên khoảng 15 vòng và 40 call. Đếm ghi theo số chương bị đổi, không theo số operation.
  Chạm trần thì `waiting_user` với **Tiếp tục**, không `failed`. Nâng trần không thay cho việc bớt vòng
  khám phá: ngữ cảnh mặc định và `get_work_overview` mới là chỗ giảm vòng, và model được hướng dẫn gọi các
  lệnh đọc độc lập song song trong cùng một vòng.
- **Lượt rỗng:** lượt kết thúc không có câu trả lời và không có thao tác ghi thì không được hiện là hoàn
  tất. Hiện thông báo "Lượt kết thúc mà không có phản hồi" kèm **Tiếp tục** (log 2026-10-22: lượt 16:55
  `completed` với câu trả lời rỗng).
- **Task:** trần token/chi phí đã có (`AgentTaskBudget`); thẻ kế hoạch hiện ước tính và trần trước khi chạy.
- **Cầu dao:** task gặp 3 lỗi liên tiếp cùng loại (từ chối nội dung, provider) thì `waiting_user` thay vì
  thử tiếp.

## 10. Quyết định phải sửa và thứ tự triển khai

### 10.1 Quyết định bị ảnh hưởng

| Quyết định | Hiện tại | Đề xuất |
| --- | --- | --- |
| 3 | Nhiều chương là workflow bền, model không tự lặp | **Giữ**, mở rộng task cho rename/QA/fix |
| 8 | Duyệt context và thao tác hàng loạt ở khu Context | Chat được khởi động thao tác hàng loạt; xem trước hiện trong thẻ kế hoạch hoặc mở khu Context |
| 9 | Pending không vào prompt | Pending vẫn không vào; thêm trạng thái **dùng tạm** được vào, có đánh dấu và truy vết. **Đã chốt hướng 2026-10-22, cách A** (trạng thái mới, không tự duyệt thẳng) |
| 13 | Ở Agent chương đang mở chỉ gửi khi bấm chip | Tác phẩm đang mở luôn là ngữ cảnh mặc định; chỉ sang tác phẩm khác khi nêu rõ, mơ hồ thì hỏi. **Đã chốt hướng 2026-10-22** |
| 14 | Autopilot bỏ qua task dịch và ghi vào đích không nêu | Autopilot chỉ bỏ qua lớp D; lớp C tự duyệt dưới trần chi phí; "phạm vi lệnh" thay `namedByUser`. **Đã chốt hướng 2026-10-22** |
| `glossary-extraction.md` §6 | Không tìm–thay toàn truyện âm thầm | **Giữ "không âm thầm"**: đổi tên luôn qua xem trước và Undo cả lệnh |
| `context/roadmap.md` | Không dùng pending ở chương sau | Thay bằng dùng tạm có điều kiện (mục 7.2) |

### 10.2 Thứ tự

Bốn change chat đang mở (`fix-agent-chat-permissions`, `add-agent-response-parts`,
`add-agent-composer-context`, `add-agent-questions-and-checkpoints`) đi trước. Sau đó:

Thứ tự đề xuất sau khi đối chiếu với log chat thật (mục 2.1), đưa tool và ngữ cảnh lên trước vì chúng không
đụng quyết định nào về an toàn và gỡ chặn L1 sớm nhất:

1. `add-agent-default-context`: tác phẩm đang mở là ngữ cảnh mặc định; `get_work_overview`; sửa
   `list_glossary`; lượt rỗng hiện thông báo kèm Tiếp tục; gọi lệnh đọc song song. Sửa quyết định 13.
   **Đã triển khai trong code 2026-10-22**; còn thiếu phép đo trên app thật (mục 2.1).
2. `add-agent-task-tools`: `extract_terms` ngoài task (chỉ ghi `pending`), `list_task`, `control_task`, thẻ
   task có tiến độ trong chat.
3. `add-agent-plan-and-budget`: thẻ kế hoạch, Tiếp tục khi chạm trần, nâng trần lượt, cầu dao, mô hình
   quyền lớp A–E, phạm vi lệnh. Sửa quyết định 14, đổi nhãn Autopilot.
4. `add-provisional-glossary`: trạng thái dùng tạm (cách A), truy vết theo chương, phát hiện xung đột, câu
   hỏi không chặn. Sửa quyết định 9. Trong lúc chưa có đổi tên toàn truyện thì dừng một lần sau K chương
   đầu (mục 7.4).
5. `add-command-groups`: nhóm lệnh, journal cho context, Undo cả lệnh, thanh "Đã sửa" gồm cả mục context.
   Sau bước này mới nới quyền cho `set_glossary_entry`, `review_glossary`, `set_addressing`; trước đó chúng
   ở mức cần duyệt.
6. `add-work-rename`: `plan_rename`, `apply_rename`, task loại rename. Gate: L2.
7. `add-agent-qa-and-fix`: `check_quality`, `retranslate_segments`, task loại qa/fix. Gate: L3, L5.
8. `polish_chapter` và lớp D: sau khi đo tỉ lệ cờ sai của checker.

Gate cuối: năm lệnh L1–L5 chạy với provider thật trong app đang chạy, ở cả ba mức quyền.

### 10.3 Đã chốt thêm và câu hỏi mở

Chủ sản phẩm chốt ngày 2026-10-22 (con số là mặc định ban đầu, chưa kiểm bằng dữ liệu dịch thật):

- Việc **≤ 1 chương** chạy luôn, không cần thẻ kế hoạch.
- **K = 5**: task dừng một lần sau 5 chương đầu để xác nhận tên chính, chỉ trong lúc chưa có đổi tên toàn
  truyện (mục 7.4).
- Giá trị dự phòng của đổi tên khi lệnh mơ hồ và Autopilot tự trả lời là **cả truyện**, kèm xem trước và
  Hoàn tác cả lệnh. Model tự quyết khi lệnh nói rõ phạm vi (mục 8). `glossary-extraction.md` nghiêng "từ
  chương N" nên cần sửa theo khi triển khai.

Còn mở:

- Trần chi phí mặc định cho Autopilot. Chưa có số liệu: cần đo chi phí dịch thử một đến hai chương rồi
  mới đặt, tính theo tiền khi catalog có giá, theo token khi không.
- Có cho người dùng tắt hẳn dùng tạm theo tác phẩm không.
- Đoạn người dùng sửa tay: luôn hỏi (lớp D) hay chỉ mặc định bỏ chọn trong xem trước. Đề xuất bỏ chọn;
  chưa chốt.
- Trích xuất có trả độ tin cậy dùng được làm điều kiện thứ ba của 7.2 không.

## 11. Nguồn

Agent và quyền:

- VS Code, duyệt tool và mức quyền: <https://code.visualstudio.com/docs/agents/run/approvals>
- VS Code, xem lại sửa và checkpoint: <https://code.visualstudio.com/docs/agents/run/review-code-edits>
- VS Code, cài đặt (`chat.agent.maxRequests`, subagent): <https://code.visualstudio.com/docs/copilot/reference/copilot-settings>
- VS Code, refactor preview: <https://code.visualstudio.com/docs/editing/refactoring>
- Claude Code, chế độ quyền và plan mode: <https://code.claude.com/docs/en/permission-modes>
- Claude Code, quy tắc quyền: <https://code.claude.com/docs/en/permissions>
- Claude Code, checkpoint: <https://code.claude.com/docs/en/checkpointing>
- Cursor, run modes: <https://cursor.com/docs/agent/security/run-modes>
- Devin, ngưỡng ACU: <https://docs.devin.ai/admin/billing/acu-limits.md>
- Anthropic, Building effective agents: <https://www.anthropic.com/engineering/building-effective-agents>
- Anthropic, Effective harnesses for long-running agents: <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>

Dịch truyện dài và thuật ngữ:

- TransAgents: <https://arxiv.org/abs/2405.11804>
- DelTA: <https://arxiv.org/html/2410.08143>
- MAPS: <https://aclanthology.org/2024.tacl-1.13>
- TEaR: <https://arxiv.org/abs/2402.16379v1>
- Ràng buộc thuật ngữ sau dịch (WMT 2023): <https://aclanthology.org/2023.wmt-1.80>
- Dịch theo chương, lỗi lặp câu: <https://arxiv.org/pdf/2407.08978>
- Crowdin, thuật ngữ AI dạng nháp: <https://crowdin.com/blog/what-is-new-at-crowdin-october-2024>
- Phrase, trạng thái thuật ngữ và QA: <https://support.phrase.com/hc/en-us/articles/5709733372188>
- LingoHub, Preferred/Admitted: <https://help.lingohub.com/en/articles/9317328-what-is-the-usage-attribute-in-a-term-base-for>
- LILT, tìm–thay theo dự án: <https://support.lilt.com/kb/find-replace>
- Xbench, kiểm tra QA: <https://blog.pangeanic.com/xbench>
- Wenyi (phát hiện xung đột thuật ngữ): <https://github.com/BigDawnGhost/wenyi>
- LinguaGacha: <https://github.com/neavo/LinguaGacha>

Nguồn thứ cấp, chưa kiểm: tỉ lệ theo glossary khoảng 70% (Šorak 2025, qua
<https://www.congree.com/en/blog/terminology-management-with-probabilistic-ai-systems>); số liệu giảm lỗi
thuật ngữ của Lingo.dev là tự đánh giá của nhà cung cấp.
