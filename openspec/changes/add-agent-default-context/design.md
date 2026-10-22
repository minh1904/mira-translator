## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- `composeContext` (renderer, `modules/agent/components/composeContext.ts`) chỉ đặt `context.workId` khi chip gợi ý
  đã được thêm hoặc khi có vùng chọn. Ở Agent chip chương mặc định mờ, nên `context` rỗng và lượt không có `ctx`.
- Main (`AgentService`, đoạn dựng target của snapshot) đã resolve `current_work` khi `context` có `workId` mà không
  có `chapterId`, và cấp `ctx` cho đích đó. Tức là main đã xử lý được ngữ cảnh chỉ có tác phẩm; chỗ thiếu nằm ở
  renderer.
- `list_glossary` và `list_addressing` (`capabilities/readCapabilities.ts`) trả lỗi "yêu cầu target chapter" với
  handle tác phẩm. `listContextEntries` đã lọc được theo loại và trạng thái ở cấp tác phẩm.
- Phần tử câu trả lời có loại `progress` (`RESPONSE_PART_KINDS`, ràng buộc `CHECK` của `agent_turn_part`), được lưu
  bền và transcript đã hiện nó. Không cần thêm loại mới.
- `SYSTEM_PROMPT` của agent có bốn dòng, chưa nói gì về gọi song song hay đọc tổng quan.
- Transport OpenAI-compatible đã ghép đúng nhiều lệnh gọi song song của Gemini (commit `5ba0dad`).

## Goals / Non-Goals

**Goals:**
- Lượt Agent ở màn chương có `ctx` trỏ tới tác phẩm mà không cần người dùng bấm gì.
- Bước "hiểu tác phẩm" của agent tốn tối đa một vòng.
- Lượt rỗng không còn im lặng, có đường đi tiếp.

**Non-Goals:**
- Không đổi trần vòng, policy hay mức quyền. Không thêm tool ghi.
- Không đổi luồng duyệt glossary. `get_work_overview` chỉ đếm, không trả mục glossary.
- Không đổi schema DB.

## Decisions

### D1. Tác phẩm vào ngữ cảnh ở renderer, không tự chèn ở main

`composeContext` luôn đặt `context.workId` khi có tác phẩm đang mở và chip tác phẩm chưa bị tắt; `chapterId` vẫn chỉ
đặt khi chip chương đã thêm hoặc có vùng chọn. Trạng thái "đã tắt chip tác phẩm" giữ trong store agent của renderer,
theo cặp (phiên, tác phẩm), chỉ trong bộ nhớ.

*Phương án bỏ:* để main tự lấy tác phẩm đang mở từ trạng thái cửa sổ. Bị loại vì vi phạm "chip phản ánh đúng thứ
được gửi" và "context chụp lúc gửi" của `agent-conversation`: người dùng không thấy và không tắt được thứ main tự
thêm, và main không biết cửa sổ nào đang gửi.

*Phương án bỏ:* thêm sẵn chip chương ở Agent (bỏ trạng thái mờ). Bị loại vì quyết định 13 vẫn giữ chương mờ ở Agent;
chỉ tác phẩm là ngữ cảnh mặc định.

### D2. Handle `ctx` không đổi cách cấp

Main giữ nguyên thứ tự cấp handle: target chính (chương nếu có, nếu không thì tác phẩm) là `ctx`, đính kèm là
`ctx2`… Vì main đã resolve `current_work`, D1 đủ để có `ctx` tác phẩm. Task kiểm bằng test ở main rằng `context`
chỉ có `workId` cho `ctx` loại tác phẩm, và policy coi ghi vào chương của tác phẩm đó là target do người dùng nêu
qua `contextWorkId` như hiện tại.

### D3. `resolve_target` ưu tiên tác phẩm đang mở, mơ hồ thì hỏi

Khi mô tả khớp tác phẩm của snapshot, trả `resolved` với tác phẩm đó. Khi khớp cả tác phẩm của snapshot và tác phẩm
khác, trả `ambiguous` (không tự chọn bên nào). Resolver hiện đã dùng `context.workId` ở vài nhánh; task đầu tiên của
phần này là đọc `resolver.ts` và viết test cho ba scenario của spec, rồi chỉ sửa nhánh nào lệch.

### D4. `get_work_overview` là capability đọc dùng các service có sẵn

Dựng theo mẫu `readTranslationTasksCapability`: một factory nhận `tasks` (để liệt kê task) và đọc phần còn lại qua
`library` trong context của handler. Số chương đã dịch cần một truy vấn đếm trong work DB (chương có ít nhất một
đoạn có bản dịch), thêm thành một phương thức của `LibraryStore` thay vì đọc từng chương trong handler, để chi phí
là một truy vấn cho mỗi lần gọi. Số mục glossary đếm theo trạng thái bằng truy vấn `GROUP BY`, không tải danh sách.

Kết quả không có nội dung chương hay mục glossary, nên không tính vào trần 100.000 ký tự đọc theo cách đáng kể.

*Phương án bỏ:* nhét tổng quan vào system prompt của mọi lượt. Bị loại vì tốn token cả ở lượt không cần, và số liệu
cũ đi khi task đang chạy giữa lượt. Có thể xem lại khi đo thấy model vẫn gọi lẻ.

### D5. Glossary và xưng hô cấp tác phẩm

Với handle tác phẩm, `list_glossary` trả mục `term` đã duyệt từ `listContextEntries` kèm phạm vi chương của mục.
`list_addressing` trả cặp xưng hô đã duyệt cấp tác phẩm kèm chương bắt đầu và kết thúc hiệu lực. Nhánh handle chương
giữ nguyên. Nếu work DB chưa có hàm liệt kê cặp xưng hô cấp tác phẩm, thêm vào `contextEntries`/addressing storage
cạnh hàm hiệu lực theo chương.

### D6. Lượt rỗng: một quy tắc thuần dùng chung, main phát phần tử, renderer hiện nút

Thêm hàm thuần trong `src/shared` quyết định "lượt không có phản hồi": không có phần tử `text` khác rỗng sau khi
trim, và không có tool call loại ghi ở trạng thái `completed`. Main gọi hàm này lúc kết thúc turn ở `completed` và
thêm một phần tử `progress` với nội dung cố định "Lượt kết thúc mà không có phản hồi". Renderer gọi cùng hàm trên
turn mới nhất để quyết định hiện nút **Tiếp tục**, nên không phải nhận diện thông báo bằng cách so chuỗi.

*Phương án bỏ:* thêm loại phần tử `notice` có mã. Bị loại vì cần migration cho ràng buộc `CHECK` của `agent_turn_part`
trong khi `progress` đã đủ để hiện và lưu.

*Phương án bỏ:* chuyển turn sang `waiting_user`. Bị loại vì đó là việc của bước 3 (Tiếp tục khi chạm trần) và đụng
state machine của turn.

### D7. Tiếp tục gửi lượt mới bằng ngữ cảnh đã lưu của turn

Nút Tiếp tục gửi lệnh "Tiếp tục" qua đường gửi lượt hiện có, với chế độ và context snapshot đã lưu của turn rỗng,
không lấy từ ô nhập hiện tại (người dùng có thể đã chuyển chương). Nếu snapshot session gửi cho renderer chưa có
context của turn, thêm trường đó vào view của turn. Mức quyền không gửi kèm: nó thuộc về phiên, nên turn mới nhận mức
hiện tại của phiên; tự nâng lại mức cũ sau khi người dùng đã hạ là sai. Lượt gửi từ nút (Tiếp tục, Thử lại) không xóa
bản nháp của ô nhập.

### D8. System prompt

Thêm vào `SYSTEM_PROMPT` các ý, bằng tiếng Việt như các dòng hiện có:
- `ctx` là tác phẩm hoặc chương người dùng đang mở; dùng nó, không gọi `list_works` hay `resolve_target` để tìm lại.
- Muốn biết trạng thái tác phẩm thì gọi `get_work_overview` một lần.
- Gọi các lệnh đọc không phụ thuộc nhau trong cùng một vòng.

## Risks / Trade-offs

- [Model vẫn gọi đọc lẻ dù có hướng dẫn] → Đo lại bằng log `agent_tool_call` sau khi triển khai với Gemini và một
  model khác; nếu vẫn tốn vòng thì cân nhắc nhét tổng quan vào prompt (phương án bỏ ở D4).
- [Người dùng không muốn tác phẩm vào ngữ cảnh] → Chip tắt được và nhớ trong phiên.
- [Gửi tác phẩm làm policy coi ghi vào mọi chương của nó là "do người dùng nêu"] → Đây là hành vi mong muốn theo
  quyết định 13 và 14; policy hiện đã so `contextWorkId` nên không mở thêm đường ghi sang tác phẩm khác.
- [Thông báo lượt rỗng hiện cả khi model cố ý không nói gì] → Chấp nhận; một lượt agent không có chữ và không ghi gì
  là không có giá trị với người dùng.

## Migration Plan

Không có migration dữ liệu. Phiên cũ hiện như trước; lượt rỗng cũ không có phần tử thông báo, nhưng renderer vẫn tính
quy tắc D6 nên nút Tiếp tục hiện cho turn mới nhất nếu nó rỗng. Rollback bằng revert commit.
