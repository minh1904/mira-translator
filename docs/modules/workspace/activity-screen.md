# Màn Hoạt động

Cập nhật: 2026-10-23 · Trạng thái: **Quyết định đã chốt**; **đã triển khai** phần giao diện, bản ghi lỗi và
tầng lần chạy (change `unify-activity-screen`). Còn **chưa kiểm tay**: bố cục ở cửa sổ hẹp và hai theme,
luồng Trợ lý đề xuất đổi model qua thẻ duyệt. Chủ trì: chủ sản phẩm.

## Quyết định (chủ sản phẩm chốt 2026-10-23)

- Một màn **Hoạt động** thay hai tab "Tác vụ" và "Nhật ký AI". Đọc từ trên xuống theo mức khẩn cấp:
  "Cần xử lý" (chỉ hiện khi có), "Đang chạy", "Gần đây" nhóm theo ngày.
- Tác vụ xong không lỗi chỉ là một dòng. Lỗi và việc cần người dùng nổi lên đầu màn.
- Lỗi là một bản ghi có cấu trúc (`TaskError`) mà giao diện và Trợ lý AI cùng đọc.
- **Không làm**: cây tác vụ, sơ đồ nút, terminal trong app, hiển thị prompt hay phản hồi thô của model.
  Nhóm theo phiên chat để sau, khi có lệnh nhiều truyện và task có `session_id`.

## Đã triển khai

| Phần | Nơi |
| --- | --- |
| Chia ba khối, nhóm theo ngày (hàm thuần, có test) | `modules/agent/model/activity.ts` |
| Thẻ đang chạy / cần xử lý, dòng một dòng cho task xong, chi tiết, bảng chương | `modules/agent/components/{TaskCard,TaskSummaryRow,TaskDetail,ChapterTable}.tsx` |
| `TaskError`, bảng mã lỗi, `parseOperationError` | `shared/contracts/agentTask.ts` |
| Sinh bản ghi lỗi từ lỗi nhà cung cấp, gom nguyên nhân theo lô | `main/services/agent/taskError.ts`, `chapterTranslationRunner.ts` |
| `lastRun` của từng chương và kênh `agent:task:runs` | `taskService.ts`, `agentRepository.listTaskOperations` |
| Bảng tra mã → câu, mức, hành động; gom lỗi trùng | `modules/agent/model/taskErrorView.ts`, `ErrorBlock.tsx` |
| Tầng lần chạy (danh sách sự kiện, không terminal) | `modules/agent/components/RunLog.tsx` |
| `read_translation_tasks` trả cùng bản ghi lỗi (không có `detail`) | `capabilities/taskCapabilities.ts` |

Khác với thiết kế ban đầu (đã ghi vào `design.md` của change):

- `agent.operations.list` chỉ nhận `limit`, không lọc theo item, nên thêm một truy vấn gộp theo task và kênh
  IPC `agent:task:runs` cho tầng lần chạy. `lastRun` trong chi tiết task không mang `detail` để payload nhẹ.
- Số lô của một lần chạy chỉ biết số lô đã ghi (bằng chứng ở file tác phẩm), không biết tổng số lô dự kiến,
  nên hiện "N lô" thay vì "N/M lô".
- `tried` (số lần thử, đã đổi khóa) có trong bản ghi nhưng tầng provider chưa đưa số liệu này ra khi lỗi, nên
  hiện để trống và giao diện bỏ dòng "App đã". Không bịa số lần thử.
- Lỗi xác thực và hết hạn mức làm tác vụ chuyển `waiting_user` thay vì thử tiếp các chương sau (trước đây mọi
  chương còn lại đều lỗi giống nhau). Bảng chuyển trạng thái và `AgentTaskReason` không đổi.
- "Hỏi trợ lý AI" điền văn bản bản ghi lỗi đã che khóa vào ô soạn và mở màn Trợ lý, không tự gửi. Chưa thêm
  loại chip đính kèm riêng vì chip phải đi qua schema và Main; làm khi có nhu cầu.
- Mức "cảnh báo" của lỗi giới hạn tốc độ, mạng, hết thời gian, sai định dạng chỉ nói thử lại được; app không
  tự thử lại ở cấp tác vụ nên câu chữ không hứa "tự thử lại".

## Trợ lý đọc nhật ký của màn (đã triển khai 2026-10-23, chưa kiểm tay)

Lý do: khi được hỏi "Truyện test cảnh báo gì nhiều thế", Trợ lý không có công cụ nào đọc tab Cảnh báo. Nó
đọc lan sang các tác phẩm khác rồi hỏi chọn đích nhiều lần. Ba công cụ đọc mới (`capabilities/taskCapabilities.ts`):

| Công cụ | Đọc gì | Ghi chú |
| --- | --- | --- |
| `read_task_quality` | Cảnh báo QA như tab Cảnh báo: đếm theo luật và theo chương, từng cảnh báo kèm đoạn gốc, bản dịch và `sourceId` | Mỗi chương lấy từ tác vụ mới nhất đã dịch nó; lọc `rule`, phân trang 30 (tối đa 100) |
| `read_task_runs` | Các lần chạy như tab Lần chạy: trạng thái, thời gian, token, chi phí, số lô, tóm tắt, bản ghi lỗi | Không có `detail` |
| `read_ai_call_log` | Log thô `logs/<workId>.jsonl`: câu trả lời thô, `translate.result` (đoạn gốc và bản app giữ), lỗi | Mới nhất trước, trang 30.000 ký tự, chuỗi dài cắt ở 8.000; prompt chỉ kèm khi `withMessages`; bỏ mọi khóa `detail` |

- Quyết định "không hiển thị prompt hay phản hồi thô" ở trên chỉ áp dụng cho giao diện. Trợ lý được đọc log
  thô để lần ra lỗi nằm ở prompt, model hay bộ phân tích.
- System prompt có thêm một dòng chỉ Trợ lý dùng ba công cụ này khi người dùng hỏi về cảnh báo hay chất lượng.
- Sửa kèm: `resolve_target` ưu tiên tên tác phẩm viết đầy đủ trong mô tả, chọn tên dài nhất. Trước đây quy
  tắc tiền tố "truyện …" cắt mất chữ "Truyện" của "Truyện test", nên mô tả nào cũng khớp mọi "Truyện test N".
- Chưa làm: công cụ "bỏ qua cảnh báo" cho Trợ lý. Sửa thì đi qua `edit_translation`.

## Sửa luật cảnh báo báo nhầm (đã triển khai 2026-10-23)

Đã kiểm "Truyện test" (12 chương, 1.365 đoạn) bằng log gọi model, chạy lại đúng các luật của app: có 667
cảnh báo, trong đó khoảng 550 là báo nhầm.

- `text.unbalanced_quotes` v2: bộ tách đoạn cắt một câu thoại 「…」 thành nhiều đoạn, nên bản dịch đúng vẫn
  bị lệch ngoặc trong từng đoạn. Giờ luật bỏ qua đoạn mà chính bản gốc đã lệch ngoặc. Với log trên: 385 → 1.
- `glossary.missing_target` v2: bản gốc chỉ khớp qua alias (`ノエル` của `ノエル・アーデン`) thì bản dịch chỉ
  cần có một từ viết hoa của tên dịch ("Noel" của "Noel Arden"). Luật nằm trong `evaluateGlossaryCompliance`,
  nên kiểm tra glossary của editor cũng đổi theo. Với log trên: 168 → 6.
- 「」『』 trong bản dịch: prompt v10 đã yêu cầu đổi sang “ ” ‘ ’, nhưng gemini-3.8-flash vẫn để nguyên ở 84
  đoạn. Giờ `executeTranslateBatch` tự đổi khi giữ bản dịch, áp dụng cho cả ba đường dịch. Bản đã dịch trước
  đó vẫn còn 「」 cho tới khi dịch lại hoặc sửa tay.
- Tăng phiên bản luật nên các lần "Bỏ qua" cũ của hai luật này không còn khớp, phải bỏ qua lại.
- Ngoặc `"…"` thẳng lẫn với `“…”` vẫn chưa được chuẩn hóa; luật cũng không báo kiểu lẫn này.

## Quy tắc hiển thị

- Task `completed` không có chương lỗi, chờ hay bỏ qua: một dòng, không thanh tiến độ, không badge xanh.
- "Chạy lại tất cả" ghi đè bản dịch nên hỏi xác nhận; "Chạy lại chương lỗi" thì không.
- Dòng "Không có chỉ dẫn" bỏ hẳn; chỉ hiện nút "Chỉ dẫn" khi chương có chỉ dẫn.
- Token không báo hiện "không rõ", không hiện 0. Chi phí ước tính chỉ hiện khi model có bảng giá.
- Bộ đếm "Đang dịch chương N · n giây" chạy ở renderer, dừng khi cửa sổ ẩn hoặc khi bật giảm chuyển động.

Mẫu hiển thị lỗi: xem [Hiển thị lỗi](../design-system/error-display.md).
