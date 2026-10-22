# Tìm (Ctrl+F) và thay thế

Cập nhật: 2026-10-22 · Trạng thái: **nghiên cứu và đề xuất, chưa chốt, chưa triển khai** · Chủ trì: phát
triển sản phẩm Mira.

Chương này trả lời ba câu hỏi:

1. Mira hiện có gì để tìm và thay chữ trong chương và trong cả truyện?
2. Các app viết, dịch và soạn thảo tổ chức tìm–thay ra sao?
3. Mira nên làm theo thứ tự nào, và phần nào cần chủ sản phẩm quyết?

## 1. Hiện trạng trong code (quan sát 2026-10-22)

- **Không có Ctrl+F ở đâu cả.** Bản đóng gói gọi `Menu.setApplicationMenu(null)`
  ([`index.ts`](../../../src/main/index.ts)), nên Electron không có lệnh Find mặc định. Mira cũng không
  dùng `webContents.findInPage`. Bấm Ctrl+F trong editor hiện không làm gì.
- **Editor chưa nạp `@codemirror/search`.** `package.json` chỉ có `commands`, `lang-markdown`, `language`,
  `merge`, `state`, `view`. [`TextEditor`](../../../src/renderer/src/modules/workspace/chapter-editor/TextEditor.tsx)
  gắn `standardKeymap`, `historyKeymap`, và `Mod-b` / `Mod-i` khi bật live preview.
  `allowMultipleSelections` bị tắt, nên các lệnh nhiều con trỏ như `Mod-d` hay "chọn mọi chỗ khớp" không
  dùng được.
- **Màn dịch chương có hai editor:** bản gốc (chỉ đọc khi chưa mở khóa) và bản dịch (chỉ đọc khi agent đang
  ghi), cùng nằm trong [`ChapterPanes`](../../../src/renderer/src/modules/workspace/chapter-screen/ChapterPanes.tsx).
  Mỗi editor là một `EditorView` riêng; tìm trong cả hai pane phải phối hợp hai view.
- **Phím tắt toàn cục** đi theo một mẫu: lắng nghe `keydown` trên `window`, bỏ qua nếu
  `event.defaultPrevented`, và editor đã nhận phím trước được ưu tiên (`Ctrl+S`, `Ctrl+B`, `/`, `Alt+N`,
  `F2`). Ctrl+F và Ctrl+H chưa bị chiếm.
- **Tìm chương trong thanh bên** (phím `/`) chỉ lọc theo số và tên chương, không tìm nội dung.
- **Tìm nội dung toàn truyện chỉ có cho agent.** Tool `search_work` dùng
  [`chatSearch.ts`](../../../src/main/services/ai/chatSearch.ts): quét chuỗi con trên mọi chương một
  phía, không cần chỉ mục; chuẩn hóa NFC, không phân biệt hoa thường với chữ La-tinh, giữ dấu tiếng Việt;
  trả mọi chỗ khớp nhưng chỉ hiện 20 dòng đầu, kèm đoạn đối ứng ở phía kia qua liên kết gióng hàng.
  (Bảng hiện trạng trong [agent tự chủ](../proposals/autonomous-agent.md) ghi "chỉ trả lần khớp đầu của
  mỗi chương"; code hiện tại đã trả mọi chỗ khớp, chỉ cắt ở 20.)
- **Không có thay thế ở bất kỳ đâu**, kể cả cho agent. Kịch bản L2 "đổi Lâm Phong thành Lâm Phượng trong cả
  truyện" của [agent tự chủ](../proposals/autonomous-agent.md) vì vậy chưa làm được kể cả bằng tay.

Các quyết định đã có liên quan:

- **Không bỏ dấu khi tìm** (chủ sản phẩm, 2026-10-08, [Hermes runtime](../ai-connections/hermes-runtime-research.md)).
  Chữ phải được chuẩn hóa NFC cả khi lưu lẫn khi tìm.
- **Glossary:** "không fuzzy-replace, không tìm–thay toàn truyện khi đổi tên; chỉ đề xuất các vị trí chịu
  ảnh hưởng để người dịch kiểm" ([glossary](../context/glossary.md)). Thay toàn truyện có xem trước và chọn
  từng chỗ (mục 4) vẫn khớp tinh thần này; thay mù thì không.
- Ô "Tìm và lệnh (Ctrl K)" toàn thư viện đang là mục minh hoạ, cần chỉ mục
  ([tính năng toàn app](app-level-features.md)). Ctrl+F trong chương không phụ thuộc mục đó.

## 2. Cách các app khác làm

Nguồn: tài liệu đối thủ đã ghi trong [tính năng của đối thủ](competitor-features.md) và hiểu biết chung về
các app phổ biến; chưa kiểm lại từng màn trong lần nghiên cứu này.

| App | Trong tài liệu đang mở | Toàn dự án | Điểm đáng học |
| --- | --- | --- | --- |
| **VS Code** | `Ctrl+F` mở widget nổi góc trên; `Ctrl+H` mở thêm ô thay. Nút Aa / từ nguyên vẹn / regex, "Tìm trong vùng chọn", đếm `3 of 17`, giữ hoa thường khi thay | `Ctrl+Shift+F` / `Ctrl+Shift+H`: kết quả gom theo tệp, bấm để nhảy, thay từng chỗ hoặc cả tệp, **xem trước diff**, lọc theo đường dẫn | Một widget nhỏ không che chữ; đếm chỗ khớp; xem trước trước khi thay hàng loạt |
| **Obsidian** | `Ctrl+F` / `Ctrl+H` trong note (dựa trên CodeMirror 6) | `Ctrl+Shift+F` chỉ tìm, không thay | Cùng nền editor với Mira; tách tìm toàn kho khỏi thay |
| **LinguaGacha, AiNiee** | — | Màn Hiệu đính: lưới Nguồn / Bản dịch, tìm–thay có regex, **chọn cột** nguồn hay dịch, nhảy tới câu | Phạm vi theo cột là chuẩn của app dịch truyện |
| **memoQ, Trados, Phrase** | Find & Replace trong lưới đoạn | Tìm nguồn hoặc đích, lọc đoạn khóa / đã duyệt; concordance tra "trước đây dịch cụm này thế nào" | Không đụng đoạn đã khóa; tra cứu tách khỏi thay |
| **LILT** | — | Tìm–thay theo dự án, bỏ qua đoạn đã xác nhận nếu muốn | Thay toàn dự án là thao tác của người duyệt, có phạm vi rõ |

Rút ra:

1. Gần như mọi app tách **tìm trong tài liệu đang mở** (nhanh, phím tắt quen) khỏi **tìm–thay toàn dự án**
   (có danh sách kết quả, xem trước).
2. App dịch thêm **chọn phía** (nguồn hay dịch) và **không thay vào đoạn đã khóa**.
3. Thay hàng loạt luôn có xem trước và hoàn tác gộp.

## 3. Ba phạm vi cần phân biệt

| Phạm vi | Ví dụ nhu cầu | Ai sở hữu dữ liệu | Độ khó |
| --- | --- | --- | --- |
| **A. Trong editor đang focus** | "Chương này dịch 师兄 là gì", sửa một tên sai trong chương | Một `EditorView` ở renderer | Thấp |
| **B. Cả hai pane của chương** | Tìm 林峰 ở bản gốc rồi nhảy sang câu đối ứng | Hai view + liên kết gióng hàng | Trung bình |
| **C. Toàn tác phẩm** | Đổi tên nhân vật trong 120 chương đã dịch | Main (`library`), nhiều revision, có thể có chương đang mở chưa lưu | Cao |

## 4. Đề xuất

### Lát 1: Ctrl+F / Ctrl+H trong editor (phạm vi A)

- Thêm `@codemirror/search` (6.7.2 lúc khảo sát, cần `@codemirror/view` ≥ 6.37, Mira đang ở 6.43). Lưu ý
  quy tắc `AGENTS.md`: chỉ chạy `pnpm add` bằng pnpm 8.9.0 để không đổi lockfile.
- Dùng engine của gói (`SearchQuery`, `findNext`, `findPrevious`, `replaceNext`, `replaceAll`, tô sáng
  mọi chỗ khớp) nhưng **tự vẽ panel** qua tùy chọn `createPanel`, dùng `Input`, `Button`, token của
  [DESIGN.md](../../../DESIGN.md). Panel mặc định của gói là HTML trần, không hợp design system.
- Phím: `Mod-f` mở tìm, `Mod-h` mở tìm + thay, `Enter` / `Shift-Enter` hoặc `F3` / `Shift-F3` chuyển chỗ khớp,
  `Esc` đóng và trả focus về editor. Không nạp `searchKeymap` nguyên bộ: bỏ `Mod-d` và
  `selectSelectionMatches` vì editor tắt nhiều vùng chọn; `Mod-Alt-g` (đi tới dòng) không có nghĩa với văn
  xuôi.
- Mở panel thì điền sẵn chữ đang bôi đen; nếu không bôi đen thì giữ chuỗi tìm lần trước.
- Hiện số đếm `3/17` (gói không tự có; đếm bằng `SearchCursor` khi chuỗi tìm đổi, có trần để không chậm
  ở chương rất dài).
- Tùy chọn: phân biệt hoa thường, nguyên từ, regex. Mặc định không phân biệt hoa thường, giữ dấu. Với chữ
  Hán/Nhật, "nguyên từ" không có nghĩa nên ẩn hoặc vô hiệu khi editor là bản gốc CJK.
- Pane chỉ đọc (bản gốc đang khóa, bản dịch khi agent ghi, hay đang duyệt đề xuất) **chỉ cho tìm**, ẩn ô
  thay.
- "Thay tất cả" là một transaction, nên một lần Ctrl+Z hoàn tác hết. Sau khi thay, các đoạn bị đổi
  được phân đoạn lại theo `idleResegment` như khi gõ tay; liên kết gióng hàng của đoạn đó có thể cần soát.
- Ctrl+F khi focus không nằm trong editor (ví dụ đang ở danh sách chương): mở trên editor bản dịch, vì đó
  là nơi người dùng sửa nhiều nhất. Cần chủ sản phẩm xác nhận (câu hỏi 2).

### Lát 2: tìm trong cả chương hai pane và toàn tác phẩm, chỉ đọc (phạm vi B, C)

- Phạm vi B: trong panel có chỗ đổi "Bản gốc / Bản dịch"; chọn một chỗ khớp thì cuộn pane kia tới đoạn đối
  ứng bằng liên kết đã có (`scrollToAnchor`, `linkParagraph`).
- Phạm vi C: một IPC mới gọi lại `findMatches` / `hitsIn` của `chatSearch.ts` (chuyển sang vị trí dùng
  chung cho cả agent và UI, theo [ARCHITECTURE.md](../../../ARCHITECTURE.md)). Kết quả gom theo chương,
  mỗi dòng có trích đoạn và đoạn đối ứng; bấm để mở chương và nhảy tới chỗ khớp. Đây cũng là nền của
  **concordance** (hạng 10 trong [tính năng của đối thủ](competitor-features.md)).
- Quét thẳng không chỉ mục đủ nhanh cho một tác phẩm vài trăm chương; chỉ mục FTS5 chỉ cần khi làm tìm
  toàn thư viện (Ctrl K).

### Lát 3: thay toàn tác phẩm có xem trước (phạm vi C)

- Danh sách kết quả của Lát 2 thêm ô thay và **xem trước theo chương**, bỏ chọn được từng chỗ, như
  Refactor Preview của VS Code.
- Mặc định không chọn: chỗ khớp nằm trong từ dài hơn (mơ hồ), đoạn người dùng sửa tay, đoạn đã duyệt.
- Áp dụng: mỗi chương một thao tác có revision guard, gom vào **một nhóm hoàn tác**. Chương đang mở và có
  bản sửa chưa lưu thì dừng và yêu cầu lưu hoặc bỏ trước, không ghi đè.
- Dùng chung engine với `plan_rename` / `apply_rename` của [agent tự chủ](../proposals/autonomous-agent.md):
  người dùng thay bằng tay và agent thay theo lệnh đi qua cùng một đường, cùng xem trước và hoàn tác.
- Khi chuỗi tìm trùng một mục glossary, gợi ý cập nhật mục đó luôn (không tự làm).

## 5. Rủi ro

- **NFC/NFD:** chữ cào từ web có thể ở dạng tổ hợp. `SearchQuery` của CodeMirror so khớp trên văn bản
  thô, không chuẩn hóa. Cần kiểm văn bản đã được chuẩn hóa NFC khi nhập, hoặc chuẩn hóa chuỗi tìm theo
  cùng dạng với văn bản.
- **Regex trên văn bản người dùng** có thể chậm (backtracking). Cần trần thời gian hoặc số chỗ khớp ở Lát 3.
- **Đụng agent:** thay toàn tác phẩm trong lúc agent đang ghi chương phải bị chặn hoặc xếp hàng, giống
  khóa bản dịch hiện có.
- **Gióng hàng:** thay chữ làm đổi độ dài đoạn; liên kết theo phân đoạn sẽ được đánh dấu cần soát như mọi
  lần sửa tay.

## 6. Chỗ đặt: activity bar ở màn dịch chương

Trạng thái: **đã dựng khung, panel là màn minh hoạ** (2026-10-22). Mục này mở lại "Màn Chương tạm để
ngoài" trong [quyết định thanh bên](app-level-features.md#5-quyết-định).

**Hành vi đã có**, theo activity bar của VS Code:

- Màn dịch chương có activity bar rộng 40 px, icon 18 px, dính liền sidebar thành một khối. Mỗi nút
  **chỉ đổi nội dung sidebar**; hai editor giữ nguyên. Bấm lại nút của panel đang mở thì ẩn sidebar, như
  Ctrl+B; activity bar luôn hiện.
- Thứ tự: Chương (danh sách chương thật) · Tìm và thay · Ngữ cảnh · Kiểm tra · Tác vụ. Bốn panel sau là màn
  minh hoạ gắn nhãn "Sắp có", dữ liệu cố định. Panel Tìm và thay lọc trên đoạn mẫu để thấy cách gom kết quả
  theo chương và cách hiện chữ thay.
- Màn tác phẩm giữ thanh bên chung và tab khu vực như cũ.
- Mã: [`ActivityBarItem`](../../../src/renderer/src/components/ui/ActivityBarItem.tsx),
  [`ChapterActivityBar`](../../../src/renderer/src/modules/workspace/chapter-screen/ChapterActivityBar.tsx),
  [`ChapterSidePanel`](../../../src/renderer/src/modules/workspace/chapter-screen/ChapterSidePanel.tsx),
  [`SidePanelMocks`](../../../src/renderer/src/modules/workspace/chapter-screen/SidePanelMocks.tsx);
  panel đang mở là `chapterPanel` trong `workspaceStore`, không lưu qua phiên.

**Còn lại:**

- Bố cục các panel mock còn lộn xộn; chủ sản phẩm chọn căn chỉnh sau khi luồng thật chạy.
- Chuyển khỏi panel Chương rồi quay lại thì ô lọc chương bị xoá, vì danh sách được dựng lại.
- Badge số đếm đã có trong `ActivityBarItem` nhưng chưa bật, để màn minh hoạ không hiện số giả.
- Tra thuật ngữ khi đang dịch vẫn ở panel phải; panel Ngữ cảnh ở sidebar để lướt và lọc. Khu Ngữ cảnh đầy
  đủ ở màn tác phẩm cần **thiết kế lại**
  ([`ContextAreaMock.tsx`](../../../src/renderer/src/modules/workspace/work-detail/ContextAreaMock.tsx)),
  thuộc module [Ngữ cảnh](../context/README.md), chưa nghiên cứu.

**Phương án đã bỏ (lịch sử, 2026-10-22):** rail tác phẩm hai tầng, nút rail đổi cả màn (Chương, Ngữ cảnh,
Bản raw, Tác vụ) còn tab ở đầu cột trái đổi danh sách. Đã dựng thử; chủ sản phẩm thấy nút đổi cả màn sai
kỳ vọng và chọn mô hình VS Code: mọi nút chỉ đổi sidebar.

## 7. Câu hỏi cho chủ sản phẩm

1. Làm Lát 1 trước rồi mới tính Lát 2–3, hay cần thay toàn truyện sớm để mở đường cho L2 của agent?
2. Ctrl+F khi focus ngoài editor mở trên bản dịch, hay trên pane được bấm gần nhất?
3. Panel nằm nổi góc trên phải của pane (như VS Code) hay thành thanh ngang trên cùng pane (như Obsidian)?
4. Có cần regex ở Lát 1 không, hay chỉ hoa thường và nguyên từ?
5. Thay toàn truyện có được chạm vào đoạn đã duyệt không, hay luôn loại trừ?

## Nguồn

- CodeMirror, `@codemirror/search` reference: <https://codemirror.net/docs/ref/#search>
- VS Code, Basic editing – Find and Replace: <https://code.visualstudio.com/docs/editing/codebasics#_find-and-replace>
- VS Code, Search across files: <https://code.visualstudio.com/docs/editing/codebasics#_search-across-files>
- Obsidian Help, Search: <https://help.obsidian.md/Plugins/Search>
- LILT, tìm–thay theo dự án: <https://support.lilt.com/kb/find-replace>

---

[Phiên làm việc theo tác phẩm](README.md) · [Tính năng của đối thủ](competitor-features.md) ·
[Bố cục hai pane](chapter-panes.md)
