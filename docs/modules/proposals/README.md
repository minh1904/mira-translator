# Module Trợ lý AI và đề xuất

Cập nhật: 2026-10-14 · Trạng thái: quyết định sản phẩm và roadmap hiện hành. Lát 1
`repair-agent-runtime` và lát 2 `add-agent-conversation` đã triển khai và archive; lát 3
`add-durable-translation-tasks` và lát 4 `add-agent-context-workflow` đã triển khai và archive; lát 5
`add-agent-steering` và lát 6 `add-translation-task-qa` đã triển khai và archive.

Module này chịu trách nhiệm cho hội thoại với Trợ lý, tác vụ AI dài, thao tác ghi có thể hoàn tác và
dữ liệu proposal cũ. Trợ lý là tính năng toàn ứng dụng; tác phẩm và chương chỉ là ngữ cảnh hoặc đích
của một lượt.

| Cần biết | Nguồn hiện hành |
| --- | --- |
| Sản phẩm đã chốt điều gì? | [Quyết định](decisions.md) |
| Làm agent theo thứ tự nào và gate hoàn thành là gì? | [Roadmap agent](agent-roadmap.md) |
| Agent được tách thành những lát/spec nào, dựa trên nghiên cứu gì? | [Chương trình đặc tả Agent](agent-spec-program.md) — 6 change độc lập; lát 1–3 đã triển khai, lát 4–6 chưa; lát MCP đã bỏ |
| Người dùng gói thuê bao (Kimi, Claude/Antigravity qua gateway) kết nối thế nào? | [`add-subscription-gateway-auth`](../../../openspec/changes/add-subscription-gateway-auth/proposal.md) — track riêng, **hoãn** (chủ sản phẩm, 2026-10-14) |
| Gemini CLI, Gemini web hoặc web app riêng có thể điều khiển Mira thế nào? | [Tích hợp agent bên ngoài](external-agent-integration.md) |
| Chat Trợ lý phải giống VS Code tới mức nào, còn thiếu gì? | [Giao diện chat theo VS Code](chat-ui-vscode.md) — chuẩn VS Code chốt 2026-10-22 (quyết định 11–17), kèm hiện trạng và đánh giá code |
| Agent toàn diện (người dùng chỉ ra lệnh) cần luồng, quyền và glossary thế nào? | [Agent toàn diện](autonomous-agent.md) — **đề xuất** 2026-10-22; chủ sản phẩm đã chốt hướng cho quyết định 9, 13, 14 (xem [Quyết định](decisions.md)), phần còn lại chưa chốt; chưa triển khai |
| Session, turn, operation và task khác nhau thế nào? | [Phiên và tác vụ](sessions-and-jobs.md) |
| Ghi dữ liệu và hoàn tác phải an toàn ra sao? | [Dữ liệu và an toàn](data-and-safety.md) |
| Proposal cũ được duyệt thế nào? | [Luồng duyệt proposal legacy](review-flow.md) |

## Hiện trạng

Mira đã có schema session toàn ứng dụng, target resolver, capability registry, operation journal,
checkpoint, một phần runner dịch chương và module renderer cho agent. Các phần này là nền để tái sử
dụng, không phải bằng chứng rằng Trợ lý đã chạy hoàn chỉnh.

`repair-agent-runtime` đã nối UI → IPC → `AgentService`, cancel/undo thật, usage và ghi có điều phối cho
một chương. `add-agent-conversation` thay nhánh regex bằng vòng model → tool → kết quả trên
`provider.chat`: tool call lưu vào `agent_tool_call` (library v11) trước khi chạy, target chỉ đi qua
handle, policy là bảng trong code, budget 6 vòng và phát hiện lặp; turn chờ người dùng tiếp tục bằng
câu trả lời gắn với đúng call. Turn thuộc Main và event tới mọi cửa sổ. Màn Trợ lý có Chat mới, lịch
sử, transcript và composer với chip ngữ cảnh; side panel màn chương dùng chung store.

`add-durable-translation-tasks` thêm task dịch dải chương lưu bền (library v12: `agent_task`,
`agent_task_item`, `agent_task_attempt`; `agent_operation` có `turn_id` hoặc `task_item_id`). Scheduler
trong Main chạy tuần tự một item toàn app, mỗi lần chạy item là một operation mới với một `CallBudget`;
runner chỉ dịch hàng chưa có bản dịch (`fill_untranslated`), khóa batch theo nội dung và dựng prompt từ
bản chụp `task:<itemId>`. Pause/Continue/Cancel/Retry/Bỏ qua/Chạy lại đi qua compare-and-set
`state_version`; đóng app ghi `paused(app_closed)`, khởi động lại chỉ đối soát journal, không gọi
provider. Trần task (lời gọi, token, chi phí khi catalog có giá) chặn trước request. Màn Tác vụ và khu
Tác vụ của tác phẩm đọc task thật; chat tạo task qua `create_translation_task` sau khi người dùng duyệt.

`add-agent-context-workflow` đưa trích thuật ngữ vào sản phẩm (work v14: `term_type`, `review_flags`,
`context_entry_evidence`, `context_extraction_scan`). Lệnh tạo task mang `contextStrategy`
(`extract_then_review` hoặc `approved_only`); từ 2026-10-14 trường này tùy chọn: bỏ trống thì tác phẩm chưa có
glossary được trích trước, đã có thì dịch ngay; chat chỉ truyền `approved_only` khi người dùng nói rõ dịch luôn. Với `extract_then_review`, trước item đầu scheduler quét các chương chưa quét bằng
luồng Lab bước 1–4, ghi ứng viên `pending` kèm câu trích, lần chạy, model và hash prompt; lời gọi đi qua
trần của task (là một operation của item đầu). Có mục mới thì task `waiting_user(context_review)`, item
vẫn `queued`. Lệnh duyệt (approve, sửa rồi approve, reject, duyệt hàng loạt cùng loại) có guard
`updatedAt`. Tab Ngữ cảnh của side panel hiện "Đang áp dụng" từ `takeContextSnapshot`; "Xem và duyệt" mở
khu Ngữ cảnh với bộ lọc Chờ duyệt.

`add-agent-steering` cho task nhận điều chỉnh giữa chừng (library v13: `agent_task_steering`). Lệnh được
validate ngay (task đã kết thúc, chương ngoài task, không còn chương chưa chạy, đại từ ngôi ba theo chương
đều bị từ chối và không để lại bản ghi), idempotent theo `clientCommandId` và trả chương thực sự áp dụng:
item `queued` đầu tiên chưa pin snapshot, ở hoặc sau chương yêu cầu. Chỉ dẫn là toàn văn thay thế, được vật
chất hóa vào snapshot của item lúc pin và vào prompt (từ `translate-v6`, khối `<task_instruction>`). Đổi xưng
hô từ chương E đóng cặp cũ ở chương trước E và thêm cặp mới trong một transaction work DB. Chat có
`read_translation_tasks` và `steer_translation_task` (cần duyệt); màn Tác vụ có form chỉ dẫn, danh sách điều
chỉnh và chỉ dẫn từng chương đã pin.

`add-translation-task-qa` thêm cảnh báo chất lượng cho item của task (work v15: `qa_dismissal`). Hàm thuần
`evaluateTaskItem` chạy tám luật bằng các evaluator sẵn có (glossary cấm/thiếu, xưng hô, chữ gốc sót, độ dài,
lặp, ngoặc) trên **bản chụp item đã pin**, ghép nguồn–đích theo segment ID; cảnh báo tính khi đọc, không lưu,
không đổi trạng thái hay văn bản. Chỉ quyết định "Bỏ qua" được lưu, khóa theo luật, phiên bản luật, đoạn và
hash target nên sửa đoạn hay đổi luật làm cảnh báo hiện lại. Màn Tác vụ hiện số cảnh báo mở, danh sách theo
chương (N/A khi chưa có bản dịch), nút Mở đoạn (editor cuộn tới đoạn) và Bỏ qua kèm lý do tùy chọn.
[Roadmap agent](agent-roadmap.md) là nguồn trạng thái duy nhất cho phần
này.

### Chat legacy còn lại

Chat theo tác phẩm (`AiPanel`, spec `ai-chat-tools`) chưa bị gỡ khỏi code nhưng từ commit `d99e027`
(2026-10-22) không còn chỗ hiển thị: side panel màn chương chỉ chứa Trợ lý ([quyết định 7](decisions.md)),
tab **Chat cũ** và **Ngữ cảnh** đã bỏ, `AiPanel` không còn được import. Proposal chờ duyệt của chat cũ vì
vậy không duyệt được từ giao diện. Gỡ hẳn chat legacy, hoặc giữ một lối đọc dữ liệu cũ theo quyết định 10,
cần một change riêng.

Proposal theo tác phẩm và Accept/Deny vẫn tồn tại để đọc dữ liệu cũ và phục vụ các luồng legacy chưa
chuyển đổi. Không dùng thiết kế proposal-only cũ làm contract cho lượt agent mới.

OpenSpec [`app-agent-foundation`](../../../openspec/changes/archive/2026-10-12-app-agent-foundation/proposal.md)
mô tả foundation dự kiến. Checklist của change là hồ sơ thực hiện tại thời điểm viết, không thay cho kiểm
chứng runtime hiện tại.

[Về mục lục module](../README.md)
