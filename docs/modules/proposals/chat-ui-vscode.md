# Giao diện chat Trợ lý theo VS Code

Cập nhật: 2026-10-22 · Trạng thái: **Yêu cầu đã chốt hướng ([quyết định 11–17](decisions.md)), đã đặc tả
thành bốn OpenSpec change ([mục OpenSpec](#openspec)), chưa triển khai**. Phần "Hiện trạng" và "Đánh giá code 2026-10-22" mô tả code tại commit `d209122`.

## Yêu cầu gốc

Chủ sản phẩm, 2026-10-22: chat agent phải **y hệt chat của VS Code**: chữ chạy dần (streaming), tool hiện
trong luồng trả lời, ngữ cảnh hiện **phía trên** ô nhập; có nút **+** để thêm ngữ cảnh; ngữ cảnh gợi ý mà
chưa thêm thì hiện **mờ**.

Cách hiểu: "y hệt" áp dụng cho **cấu trúc, thứ tự, trạng thái và tương tác** của panel chat. Không sao chép
các khái niệm VS Code không có trong Mira (file, terminal, workspace git, MCP, custom agent). Mỗi khái niệm
VS Code được ánh xạ sang đối tượng của Mira ở bảng dưới; mục nào không ánh xạ được thì ghi rõ là bỏ.

| VS Code | Mira |
| --- | --- |
| File đang mở (implicit context) | Chương đang mở trong workspace |
| Vùng chọn trong editor | Vùng chọn đoạn (nguồn hoặc bản dịch) |
| File/symbol trong picker "Add Context" | Tác phẩm, chương, mục glossary, cặp xưng hô |
| Edit file + Keep/Undo | Operation ghi chương + Hoàn tác (đã có journal/checkpoint) |
| Terminal tool | Bỏ |
| Ask / Edit / Agent | Ask / Agent; bỏ Edit ([quyết định 12](decisions.md)) |

Nguồn tham chiếu: mã nguồn VS Code clone tại `D:\personal\vscode` (commit `f2103684`, 2026-10-21), thư mục
`src/vs/workbench/contrib/chat/`. Đường dẫn trong tài liệu này tính từ thư mục đó.

## Yêu cầu theo khu vực

Mỗi yêu cầu có mã `C<n>` để OpenSpec và review trích dẫn.

### Ô nhập và ngữ cảnh

**C1. Hàng ngữ cảnh nằm trong khung ô nhập, phía trên textarea.** VS Code đặt
`.chat-attached-context` trong khung input, trên editor, xuống dòng khi chật, khoảng cách 4px; ẩn khi không
có chip nào (`browser/widget/input/chatInputPart.ts`, `renderAttachedContext`).

**C2. Nút + "Thêm ngữ cảnh" đứng đầu thanh công cụ dưới ô nhập** (VS Code: icon `add-compact`, phím
Ctrl+/, `actions/chatContextActions.ts`). Bấm mở picker có ô tìm, bấm lần nữa thì đóng; chọn xong focus
quay về ô nhập. Picker của Mira gồm: tác phẩm, chương của tác phẩm đang mở, mục glossary, cặp xưng hô.

**C3. Ngữ cảnh gợi ý (implicit) hiện mờ cho tới khi người dùng thêm.** VS Code
(`attachments/implicitContextAttachment.ts`, `widget/media/chat.css`): chip gợi ý có viền **nét đứt**, nhãn
**nghiêng, opacity 0.8**, nút **+** bên trái với tooltip "Add {file} to context"; hover thì viền liền. Bấm vào
bất kỳ đâu trên chip (hoặc Enter/Space) biến nó thành chip thường và focus ô nhập. Mira áp dụng cho
**chương đang mở**.

**C4. Vùng chọn luôn được gửi.** VS Code gửi selection ngay cả khi chip file đang tắt; chip selection có nút
ghim chứ không bao giờ mờ. Mira: vùng chọn đoạn luôn đi kèm lượt; chip gợi ý mờ thì **không** gửi chương.

**C5. Chip đã thêm:** cao 18px, viền 1px, nút **X bên trái** "Bỏ khỏi ngữ cảnh", rồi icon và nhãn. Backspace
hoặc Delete khi chip đang focus thì xóa chip; bấm vào chip thì mở đích (chương, tác phẩm).

**C6. Thanh công cụ dưới ô nhập theo thứ tự VS Code:** `+` · chọn chế độ · chọn model · (khoảng trống) ·
Gửi. Khi lượt đang chạy, nút Gửi đổi tại chỗ thành Dừng (`stop-circle`). Thanh co giãn sao cho nút Gửi không
bao giờ bị đẩy ra ngoài.

**C7. Phím:** Enter gửi, Shift+Enter xuống dòng. Mũi tên Lên chỉ khi con trỏ ở đầu ô, mũi tên Xuống chỉ khi ở
cuối: duyệt lịch sử lệnh, khôi phục cả chữ lẫn chip; bản nháp đang gõ không bị mất.

**C8. Placeholder theo chế độ**, như VS Code lấy mô tả của mode (`common/chatModes.ts`).

### Transcript và streaming

**C9. Lệnh người dùng là bong bóng căn phải**, rộng tối đa 90%, không avatar; chip ngữ cảnh của lượt đó hiện
ngay trên bong bóng (`chatListRenderer.ts`, `media/chat.css`).

**C10. Câu trả lời là chuỗi phần tử theo đúng thứ tự đến:** suy nghĩ, tool, chữ, tool, chữ, thẻ duyệt…
(`renderChatResponseBasic`). Không gom tất cả chữ xuống cuối, không gom tool sang một khối riêng. Điều này
phải đúng cả khi xem lại lịch sử sau khi mở lại app, không chỉ lúc đang stream.

**C11. Chữ chạy theo tốc độ từ, không nhảy theo cục.** VS Code tính số từ hiển thị theo thời gian
(`getProgressiveRenderRate`: 8 từ/s khi chưa có số liệu, kẹp 40–2000 theo tốc độ đến, tối thiểu 80 khi đã
xong để xả phần còn lại). Code fence chưa đóng được tự đóng; fence rỗng chưa hiện.

**C12. Dòng "đang làm" ở cuối câu trả lời** với spinner khi model chưa trả chữ và không có tool đang chạy.
Nhãn luân phiên (VS Code: Thinking, Working…; Mira dùng tiếng Việt), hiện tối thiểu 1,2 giây mỗi nhãn; quá
90 giây thì báo "lâu hơn bình thường". Khi chờ người dùng: "Đang chờ bạn trả lời" hoặc "N thao tác cần duyệt".

**C13. Tự cuộn:** ở cuối (sai số 2px) thì bám theo nội dung mới; người dùng cuộn lên thì hiện nút "Về mới
nhất". Mọi thay đổi chiều cao (tool, suy nghĩ, thẻ duyệt) đều kích hoạt, không chỉ chữ trả lời.

### Suy nghĩ

**C14.** Khối suy nghĩ cao tối đa 200px, tự cuộn khi stream. Tiêu đề lúc đang chạy là "Đang suy nghĩ" (nếu
đoạn suy nghĩ mở đầu bằng `**Tiêu đề**` thì dùng "Đang suy nghĩ: Tiêu đề"); xong thì "Đã suy nghĩ trong
{thời gian}". Icon: chấm khi đang chạy, dấu check khi xong, chevron khi mở. Tool gọi giữa lúc suy nghĩ được gom
vào khối này với tóm tắt kiểu "Đã đọc 3 chương" (`chatThinkingContentPart.ts`, `chatToolGroupSummary.ts`).
Suy nghĩ phải được lưu để xem lại.

### Tool

**C15. Mỗi lời gọi tool là một dòng trong luồng trả lời** với icon trạng thái (spinner → check; lỗi; bị bỏ
qua) và câu mô tả: thì hiện tại khi đang chạy ("Đang đọc chương 12"), thì quá khứ khi xong ("Đã đọc
chương 12") (`toolInvocationParts/chatToolInvocationSubPart.ts`).

**C16.** Bấm vào dòng tool thì mở phần **Đầu vào** và **Kết quả** (nạp khi mở lần đầu)
(`chatToolInputOutputContentPart.ts`). Lời gọi bị policy từ chối hoặc hết ngân sách cũng hiện dòng lỗi
với lý do; hiện code bỏ qua chúng.

**C17. Thẻ duyệt nằm ngay trong luồng, tại vị trí của tool cần duyệt:** tiêu đề, mô tả, "Đầu vào" mở được,
nút chính **Cho phép** và nút phụ **Bỏ qua**; Ctrl+Enter cho phép, Ctrl+Alt+Enter bỏ qua
(`abstractToolConfirmationSubPart.ts`). Nút chính là **Cho phép trong phiên này**, menu kèm **Cho phép một
lần** ([quyết định 15](decisions.md)).

### Câu hỏi

**C18.** Câu hỏi của agent theo mô hình `IChatQuestion` (`common/chatService/chatService.ts`): chọn một,
chọn nhiều, hoặc nhập chữ; có đáp án mặc định, cho phép nhập câu trả lời tự do, cho bỏ qua. Khi đang hỏi,
thẻ câu hỏi nằm **phía trên ô nhập**; trả lời xong thì luồng giữ một dòng tóm tắt "H: … / Đ: …" hoặc "Đã bỏ
qua". Lựa chọn đánh số 1, 2, 3 và chọn được bằng phím số (`chatQuestionCarouselPart.ts`).

### Subagent

**C19.** Lời gọi subagent là một dòng thu gọn "Đang chạy subagent: {mô tả}" → "Đã chạy subagent", có thời
gian "Làm trong {t}"; mở ra thấy các tool con của nó; tự thu gọn khi xong (`chatSubagentContentPart.ts`).
Tool con phải được lưu như tool của lượt chính.

### Thao tác ghi

**C20.** Tương đương "N files changed" của VS Code: khi lượt có operation ghi, phía trên ô nhập hiện thanh
"Đã sửa N chương" với **Giữ** / **Hoàn tác** cho từng chương và cho tất cả; trong luồng trả lời có dòng tóm
tắt thao tác kèm "Xem". Thao tác đang chạy (task dịch nhiều chương) phải còn nút **Dừng** và tiến độ.

### Chân câu trả lời

**C21.** Hover câu trả lời hiện: Sao chép, Thử lại (chỉ lượt cuối). Model và usage (token vào/ra, chi phí
nếu provider báo) xem được ở chân lượt, theo [quyết định 6](decisions.md). Lỗi hiện thành khối lỗi; lượt bị
dừng thì chỉ dừng, không hiện khối lỗi. Gợi ý tiếp theo (followups) nằm phía trên ô nhập.

### Chế độ và quyền

**C22.** VS Code có Ask (không tool), Edit, Agent, và mức quyền Mặc định / Cho phép tất cả / Autopilot. Mức
cao phải qua hộp xác nhận, chỉ có hiệu lực cho phiên hiện tại; Autopilot có bộ phân loại rủi ro bỏ qua lệnh
nguy hiểm (`common/chatPermissionWarnings.ts`, `browser/tools/languageModelToolsService.ts`). Mira làm
Ask/Agent và ba mức Mặc định / Cho phép tất cả / Autopilot theo [quyết định 12 và 14](decisions.md); bộ phân
loại rủi ro của Mira là luật tất định, không gọi model. Chọn mức quyền nằm ở thanh dưới ô nhập như VS Code.
Chế độ và mức quyền phải đi theo **mọi** lượt, kể cả lượt tiếp tục sau khi duyệt hoặc trả lời.

**C24. Checkpoint và sửa lệnh cũ** ([quyết định 16](decisions.md)): phía trên mỗi lệnh có "Khôi phục
checkpoint" (lệnh đầu là "Bắt đầu lại"); bấm vào bong bóng lệnh thì sửa tại chỗ, Esc hủy. Gửi lại sẽ xóa các
lượt sau, và nếu các lượt đó có thao tác ghi thì hỏi xác nhận trước khi hoàn tác. VS Code có "Làm lại" sau khi
khôi phục; Mira chưa làm vì operation journal không có redo.

### Header panel

**C23.** Tiêu đề phiên (bấm để chọn phiên khác), nút + Chat mới, lịch sử phiên, đóng. Đã có gần đủ.

## Nền kỹ thuật cần có

Các yêu cầu C10, C14–C19 không làm được chỉ bằng sửa giao diện:

1. **Sự kiện stream cho tool.** Hiện chỉ có `activity-start/finish` với nhãn tiếng Việt; không có tên tool,
   tham số hay kết quả, và lời gọi bị từ chối không phát sự kiện nào. Cần sự kiện `tool-call` (bắt đầu, đổi
   trạng thái, kết thúc) mang `toolCallId`, tên, tham số, kết quả rút gọn.
2. **Thứ tự xen kẽ được lưu bền.** `agent_turn.answer` đang nối chữ của mọi vòng thành một chuỗi; chữ không
   gắn với vòng nào. Cần lưu chữ theo vòng (hoặc danh sách phần tử của câu trả lời) và trả `agent_tool_call`
   cho renderer. Hiện `listToolCalls` có trong `AgentService` nhưng không có kênh IPC.
3. **Lưu suy nghĩ.** Lượt mới không ghi `agent_turn.reasoning`.
4. **Nguồn ngữ cảnh mở rộng.** `AgentContext` chỉ có work, chapter, caret, selection. Thêm mục glossary và
   cặp xưng hô cần mở rộng contract, prompt và resolver.
5. **Subagent đi qua cùng đường lưu, policy và ngân sách** như lượt chính.

## Đã chốt 2026-10-22

Chủ sản phẩm chốt ưu tiên UX/UI của VS Code và cho sửa quyết định cũ. Các câu hỏi trước đó được trả lời
theo VS Code và ghi thành [quyết định 11–17](decisions.md):

| Câu hỏi | Chốt |
| --- | --- |
| Chế độ | Ask và Agent; bỏ Edit (quyết định 12) |
| Chương đang mở | Ask: thêm sẵn. Agent: mờ, bấm mới gửi. Vùng chọn luôn gửi (quyết định 13) |
| Mức quyền | Mặc định, Cho phép tất cả, Autopilot; xác nhận khi nâng, chỉ trong phiên; Autopilot bỏ qua lời gọi rủi ro cao (quyết định 14) |
| Duyệt theo phiên | Có (quyết định 15) |
| Checkpoint, sửa lệnh cũ | Có, làm sau transcript và tool (quyết định 16) |
| Màn Trợ lý | Cùng transcript và ô nhập; cột phiên bật/tắt được (quyết định 17) |

Hệ quả cần lưu ý của quyết định 13: ở Agent, "dịch chương này" mà chưa bấm chip chương thì lượt không có
ngữ cảnh; model phải gọi `resolve_target` hoặc hỏi lại. Đây là hành vi của VS Code và được chấp nhận.

## OpenSpec

Yêu cầu được tách thành bốn change, apply theo thứ tự (mỗi change cần change trước):

| # | Change | Phạm vi | Trạng thái |
| --- | --- | --- | --- |
| 1 | [`fix-agent-chat-permissions`](../../../openspec/changes/fix-agent-chat-permissions/proposal.md) | C22: chế độ trên turn, ba mức quyền, cổng rủi ro Autopilot, duyệt trong phiên; sửa lỗi 1–2 | Đã triển khai 2026-10-22, chưa archive |
| 2 | [`add-agent-response-parts`](../../../openspec/changes/add-agent-response-parts/proposal.md) | Nền 1–3, 5; C9–C17, C19, C21 | Đã triển khai 2026-10-22, chưa archive |
| 3 | [`add-agent-composer-context`](../../../openspec/changes/add-agent-composer-context/proposal.md) | Nền 4; C1–C8 | Đã triển khai 2026-10-22, chưa archive |
| 4 | [`add-agent-questions-and-checkpoints`](../../../openspec/changes/add-agent-questions-and-checkpoints/proposal.md) | C18, C20, C24 | Đã triển khai 2026-10-22, chưa archive |

Ghi chú về phạm vi đặc tả so với yêu cầu: không stream tham số tool (provider trả tool call nguyên khối), không có gợi ý
tiếp theo do model sinh (xóa bản gõ cứng), không có Làm lại sau checkpoint, thanh chương đã sửa mở chương chứ chưa mở diff.

## Hiện trạng

Bảng ban đầu ghi theo commit `d209122`; các dòng được cập nhật khi từng change ở mục OpenSpec triển khai.

| Mã | Trạng thái | Ghi chú |
| --- | --- | --- |
| C1–C5 | Đạt | Hàng chip trên chỗ gõ, ẩn khi rỗng; chương đang mở là chip gợi ý (Ask thêm sẵn, Agent mờ, bấm để thêm); vùng chọn luôn gửi kèm chương và ghim được; nút + (Ctrl+/) mở picker tác phẩm, chương của tác phẩm đang mở, glossary và xưng hô đã duyệt, tối đa 10 chip. Bấm chip glossary/xưng hô hiện chỉ mở trang tác phẩm vì chưa có route tới mục trong khu Ngữ cảnh |
| C6 | Đạt | Thanh dưới: + · chế độ · model · Gửi/Dừng, model co lại trước; mức quyền ở thanh phụ dưới khung |
| C7 | Đạt | Enter gửi, Shift+Enter xuống dòng; Lên/Xuống ở đầu/cuối ô duyệt lệnh của session, khôi phục cả chip, trả lại bản nháp |
| C8 | Đạt | Placeholder theo chế độ: Ask "Hỏi về truyện, chương hoặc bản dịch", Agent "Mô tả việc cần làm" |
| C9 | Đạt | Bong bóng căn phải, tối đa 90% |
| C10 | Đạt | Câu trả lời dựng từ `agent_turn_part` (library v16) theo thứ tự xảy ra; lượt cũ được dựng lại gần đúng |
| C11 | Đạt | Chữ hiện theo tốc độ từ (8 từ/s ban đầu, kẹp 40–2000, xả tối thiểu 80); fence mở được tự đóng, fence rỗng ẩn |
| C12 | Đạt | Nhãn luân phiên 1,2 giây, "Lâu hơn bình thường" sau 90 giây; chờ người dùng thì báo số thao tác cần duyệt |
| C13 | Đạt | `ResizeObserver`, ngưỡng 2px, nút "Về mới nhất" |
| C14 | Đạt | Cao tối đa 200px, tiêu đề tiếng Việt có tiêu đề in đậm và thời lượng; suy nghĩ được lưu theo vòng |
| C15–C16 | Đạt | Dòng tool có icon và nhãn trạng thái, "Đang …"/"Đã …"; mở xem Đầu vào/Kết quả (đọc khi mở); call bị từ chối hiện lý do |
| C17 | Một phần | Thẻ duyệt nằm ngay sau dòng tool của nó, có phím tắt (change 1); chưa có phần Đầu vào trong thẻ, xem bằng cách mở dòng tool |
| C18 | Đạt | `ask_questions` nhận 1–5 câu chọn một, chọn nhiều hoặc nhập chữ, có mặc định, nhập tự do, bắt buộc và `allowSkip`; thẻ phía trên ô nhập với bước i/n, phím 1–9, Ctrl+Enter, Bỏ qua tất cả, thu gọn; dòng H/Đ hoặc "Đã bỏ qua câu hỏi" tại vị trí call; Autopilot trả lời bằng mặc định |
| C19 | Đạt | Tool con lưu dưới call cha, có ngân sách riêng 4/10/60.000; dòng subagent mở ra thấy tool con, có thời gian làm |
| C20 | Đạt | Thẻ operation nằm sau dòng tool tạo ra nó; thanh "Đã sửa N chương" phía trên ô nhập (library v17 `agent_operation.kept_at`) có Xem, Giữ, Hoàn tác từng chương và cho tất cả, còn sau khi mở lại app. Hoàn tác nhiều lần ghi trên một chương đi ngược theo chuỗi revision và dừng ở chỗ người dùng đã sửa tay |
| C21 | Một phần | Sao chép, Thử lại (lượt cuối), tên model, usage, khối lỗi, nhãn Đã dừng. Chưa có gợi ý tiếp theo (xóa bản gõ cứng) |
| C22 | Đạt (sau `fix-agent-chat-permissions`) | Chế độ lưu trên turn; ba mức quyền thuộc session, chọn ở thanh dưới ô nhập, xác nhận khi nâng; Autopilot bỏ qua tạo task và ghi vào đích không nêu; thẻ duyệt có Cho phép trong phiên này / Cho phép một lần / Bỏ qua |
| C23 | Đạt phần lớn | |
| C24 | Đạt (không có Làm lại) | "Khôi phục checkpoint" / "Bắt đầu lại" phía trên mỗi lệnh: kiểm tra trước mọi chương, tất cả hoặc không, ẩn lượt (`agent_turn.reverted_at`) khỏi transcript và lịch sử model, đặt lệnh về ô nhập; task bền không bị hủy. Bấm bong bóng để sửa tại chỗ, gửi là khôi phục rồi gửi lệnh mới, có xác nhận "Hoàn tác thay đổi ở {n} chương?" với Không hỏi lại. Không có Làm lại vì journal chưa có redo |

## Đánh giá code 2026-10-22

Bốn commit `f846f8e`, `ec40f03`, `0a7f592`, `088d0af`. Typecheck và 2727 test xanh; biome lỗi format ở
`src/main/services/export/*`, không thuộc phần agent.

Lỗi:

1. **Chế độ Ask mất sau lượt tiếp tục (C22)** — đã sửa bởi `fix-agent-chat-permissions`. `reply` trong `agentStore.ts` không gửi `mode` và
   `permissionLevel`; lượt tiếp tục sau khi duyệt hoặc trả lời câu hỏi có đủ tool ghi.
2. **Autopilot bỏ qua mọi bước duyệt (C22)** — đã sửa bởi `fix-agent-chat-permissions`. `prepareCall` đổi mọi `needs_user` thành `allow`, gồm
   `create_translation_task` và ghi vào đích người dùng không nêu. Test autopilot đang ghi vào tác phẩm khác
   với tác phẩm trong ngữ cảnh. Theo quyết định 14, hai loại lời gọi này phải bị bỏ qua ở Autopilot; mức
   Cho phép tất cả chưa có; chưa có nút chọn mức và hộp xác nhận.
3. **Subagent không đi qua đường lưu và ngân sách (C19).** — đã sửa bởi `add-agent-response-parts`. Tool con không vào `agent_tool_call`, không bị
   `budget` hay chặn lặp; bản tóm tắt nối chữ của mọi vòng; `ambiguous` bị báo là `not_found`; `turnRound`
   đánh lại từ 0 nên có thể lẫn với log gọi model của lượt chính.
4. **Câu hỏi (C18):** nhánh tạo câu hỏi trong `execute()` không bao giờ chạy ở chế độ thường; ép kiểu
   `undefined as unknown as ResolvedTarget`; không bỏ qua được.

Thoái lui so với trước 2026-10-22: chip ngữ cảnh bị ẩn, `ActivityTimeline` và `OperationCard` bị gỡ khỏi
transcript (mất nút Dừng task), badge trạng thái lượt và usage bị gỡ. Nhận diện subagent bằng so chuỗi nhãn
`Subagent:` và emoji trong giao diện.

[Về module](README.md)
