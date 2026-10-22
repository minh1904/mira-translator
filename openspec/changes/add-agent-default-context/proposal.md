## Why

Log chat thật ngày 2026-10-22 (mục 2.1 của `docs/modules/proposals/autonomous-agent.md`) cho thấy agent không dịch
được truyện 30 chương dù người dùng đang mở chương 1: cả bốn lượt có ngữ cảnh rỗng vì chip chương ở chế độ Agent
hiện mờ và không được gửi, nên agent tốn 3–4 trong 6 vòng chỉ để tìm ra tác phẩm. Lượt cuối hết vòng mà chưa gọi
`create_translation_task`, trả câu trả lời rỗng và vẫn hiện như đã xong. Chủ sản phẩm đã sửa quyết định 13: tác
phẩm đang mở luôn là ngữ cảnh mặc định. Đây là bước 1 của thứ tự triển khai (mục 10.2), làm trước vì không đụng
mô hình quyền và gỡ chặn lệnh "dịch toàn bộ" sớm nhất.

## What Changes

- Tác phẩm đang mở luôn được gửi làm ngữ cảnh của lượt ở cả Ask và Agent, kèm chip tác phẩm nhìn thấy được và tắt
  được. Chip chương đang mở giữ hành vi gợi ý (mờ ở Agent) như cũ. **BREAKING** về hành vi: lượt Agent ở màn chương
  không còn có ngữ cảnh rỗng khi người dùng chưa bấm chip.
- Agent chỉ sang tác phẩm khác khi người dùng nêu rõ; nếu lệnh mơ hồ giữa tác phẩm đang mở và tác phẩm khác thì hỏi
  lại thay vì tự chọn.
- Thêm capability đọc `get_work_overview`: một lần gọi trả tên, ngôn ngữ, số chương, số chương đã dịch, số mục
  glossary theo trạng thái và các task dịch của tác phẩm.
- `list_glossary` và `list_addressing` nhận target cấp tác phẩm (trả mục áp dụng cho toàn tác phẩm); lỗi validation
  của capability đọc nói rõ cần target loại nào và cách lấy.
- Lượt kết thúc không có chữ trả lời và không có thao tác ghi thì transcript hiện thông báo "Lượt kết thúc mà không
  có phản hồi" kèm nút **Tiếp tục**, thay vì im lặng.
- System prompt của agent hướng dẫn gọi các lệnh đọc độc lập song song trong cùng một vòng và dùng
  `get_work_overview` thay cho chuỗi đọc lẻ.

Ngoài phạm vi: nâng trần vòng, thẻ kế hoạch, mô hình quyền A–E (bước 3); `extract_terms`, `list_task`,
`control_task`, thẻ task (bước 2); glossary dùng tạm (bước 4).

## Capabilities

### New Capabilities
- `agent-read-tools`: capability đọc tổng quan tác phẩm `get_work_overview`, glossary và xưng hô ở cấp tác phẩm, và
  lỗi validation có hướng dẫn cho capability đọc.

### Modified Capabilities
- `agent-composer`: thêm chip tác phẩm đang mở luôn được gửi; sửa quy tắc "chip gợi ý mờ không được gửi" để không
  áp dụng cho tác phẩm.
- `agent-conversation`: snapshot context luôn có tác phẩm đang mở và cấp handle cho nó; lệnh mơ hồ giữa tác phẩm
  đang mở và tác phẩm khác phải hỏi lại; lượt rỗng không được hiện như hoàn tất bình thường.

## Impact

- Renderer: `modules/agent/components/composeContext.ts`, chip trong composer, `AgentTranscript.tsx` và
  `turnItems.ts` (thông báo và nút Tiếp tục).
- Main: `services/agent/agentService.ts` (snapshot context, `SYSTEM_PROMPT`, phát phần tử `progress` cho lượt rỗng),
  `services/agent/capabilities/readCapabilities.ts` (`get_work_overview`, `list_glossary`, `list_addressing`),
  `services/agent/resolver.ts` nếu cần cho trường hợp mơ hồ.
- Không đổi schema DB: thông báo lượt rỗng dùng phần tử `progress` đã có.
- Tài liệu: `docs/modules/proposals/decisions.md` (quyết định 13 chuyển từ "chưa triển khai" sang đã triển khai khi
  xong), `docs/modules/proposals/agent-roadmap.md`.
