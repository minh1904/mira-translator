## Context

Lý do xem `proposal.md` (Why). Hiện trạng code liên quan:

- `assembleTurnContext` (`services/agent/turnContext.ts`) nhận `history` chỉ gồm `{ instruction, answer }` và cắt
  turn cũ nhất khi tổng ký tự vượt `contextLimitChars(info)` = (context − output) × 2 ký tự.
- `AgentService` lấy history từ `repository.listTurns(sessionId)` (đã lọc `reverted_at IS NULL`), bỏ turn không có
  answer. Khi có turn bị bỏ, nó lưu một phần tử `progress` "Bỏ N lượt cũ…", tức là đang hiện trong transcript.
- `roundMessages(rows)` dựng message assistant/tool từ `agent_tool_call` cho turn hiện tại, kèm `extra_content` của
  provider. Kết quả tool lưu ở `result_json`.
- Handle của một turn dựng lại được từ dữ liệu đã lưu: `contextTargets(turn.context)` cấp `ctx…` từ `context_json`,
  còn handle `t…` nằm trong `result.targets` của call `resolve_target` (`rememberHandles`).
- Model chính và chuỗi dự phòng lưu trong bảng `meta` của thư viện (`ai.main`, `ai.fallbacks`,
  `infra/storage/aiPreferences.ts`); entry bị xóa thì đọc như chưa đặt.
- Schema thư viện hiện ở v17 (`librarySchema.ts`, fixture `library-v17.schema.sql`).

## Goals / Non-Goals

**Goals:**
- Một hàm thuần dựng toàn bộ prompt (history, tóm tắt, rút gọn), kiểm thử được không cần provider.
- Lời gọi tóm tắt chỉ xảy ra khi cần, và tối đa một lần cho mỗi vòng model.

**Non-Goals:**
- Không đếm token thật; vẫn dùng ước lượng 2 ký tự/token.
- Không tóm tắt bên trong turn hiện tại; turn dài vẫn do budget đọc và trần vòng chặn.
- Không đổi luồng revert/checkpoint ngoài việc vô hiệu bản tóm tắt.

## Decisions

### D1. Dựng lịch sử đầy đủ ở main, theo từng turn

`history` đổi từ `{ instruction, answer }` thành `{ turnId, instruction, contextLine, rounds: ChatMessage[], answer }`.
`rounds` dùng lại `roundMessages()` với hai khác biệt cho turn cũ:
- bỏ `extra_content` (thought signature chỉ hợp lệ với đúng model/lượt sinh ra nó);
- thay handle trong `arguments` và trong kết quả `resolve_target` bằng nhãn đích, lấy từ bản đồ handle dựng lại như
  trên. Handle không tra được thì để nguyên kèm ghi chú "đích của lượt cũ".

`contextLine` dùng `describeTarget`/`targetLabel` sẵn có, một dòng, có tiền tố "Ngữ cảnh của lượt cũ:".

Khi `info.toolCall === false`, mỗi vòng cũ được dựng thành một message assistant dạng văn bản: "Đã gọi `<tên>`
(`<đích>`) → <kết quả rút gọn>". Message tool cần cặp với tool_calls, và một số provider từ chối message tool khi
request không có tool definitions.

*Phương án bỏ:* lưu sẵn chuỗi message của mỗi turn vào DB khi turn xong. Bị loại vì trùng dữ liệu với
`agent_tool_call`, và cách thay handle hay bỏ `extra_content` còn phụ thuộc model của turn đang chạy.

### D2. Thứ tự rút gọn trong `assembleTurnContext`

Ngưỡng `historyLimit = 0,5 × contextLimitChars(info)`, áp cho phần history (tóm tắt + turn trước). Ba turn gần nhất
không bị rút gọn. Với các turn cũ hơn:
1. Thay nội dung message tool có độ dài > 2.000 ký tự bằng `{"ok":…,"omitted":"Kết quả công cụ cũ đã lược bớt"}`,
   giữ `tool_call_id`, từ turn cũ nhất trở đi, dừng khi xuống dưới ngưỡng.
2. Nếu vẫn vượt: trả về yêu cầu tóm tắt (danh sách turn cần tóm tắt) thay vì messages. `AgentService` gọi tóm tắt,
   lưu, rồi lắp lại.
3. Nếu tóm tắt lỗi: lắp lại với cờ `noSummary`, cắt turn cũ nhất như hiện nay.

Ngoài ngưỡng 50%, giới hạn cứng `contextLimitChars` vẫn giữ như cũ cho cả prompt: nếu sau rút gọn mà tổng vẫn vượt
(ví dụ ba turn gần nhất quá lớn) thì vẫn lược kết quả công cụ của ba turn đó trước khi bỏ turn.

Hàm vẫn thuần: nhận history, bản tóm tắt hiện có và ngưỡng; trả `{ messages, compaction }` hoặc
`{ needsSummary: turnIds }`. Mọi I/O nằm ở `AgentService`.

*Phương án bỏ:* tóm tắt ngay khi vượt, bỏ bước lược kết quả. Bị loại vì phần lớn độ dài nằm ở kết quả đọc chương;
lược chúng thường đủ và không tốn lời gọi model (Hermes cũng làm bước này trước).

### D3. Lưu bản tóm tắt trong bảng riêng, schema thư viện v18

```sql
CREATE TABLE agent_session_summary (
  session_id TEXT PRIMARY KEY REFERENCES agent_session (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  covered_turn_ids_json TEXT NOT NULL,
  model_label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Một session có tối đa một bản. Turn thuộc `covered_turn_ids_json` không được gửi lại nguyên văn. Khi đọc, bản tóm tắt
hợp lệ chỉ khi mọi turn trong danh sách còn trong `listTurns` (chưa revert); không hợp lệ thì repository xóa nó.
Revert vì vậy không cần hook riêng.

*Phương án bỏ:* thêm cột vào `agent_session`. Bị loại vì bản tóm tắt có vòng đời riêng (xóa khi revert, ghi đè khi
dồn) và mang text lớn mà các truy vấn danh sách session không cần.

### D4. Lời gọi tóm tắt

Prompt tóm tắt bằng tiếng Việt, đầu ra theo khung cố định: Mục tiêu của người dùng; Ràng buộc và sở thích; Việc đã
làm (gồm đích: tác phẩm, chương, task); Quyết định đã chốt; Việc còn dở; Thông tin quan trọng đã đọc. Đầu vào là
bản tóm tắt cũ (nếu có) cộng các turn cần tóm tắt, đã qua bước lược của D2; nếu đầu vào vẫn vượt giới hạn của model
phụ thì cắt bớt từng turn ở giữa. Giới hạn độ dài bản tóm tắt: 20% của `historyLimit`.

Khi chèn vào prompt, bản tóm tắt đi sau system policy, bọc trong lời dặn chép ý từ `SUMMARY_PREFIX` của Hermes: chỉ
để tham khảo, yêu cầu trong đó đã xử lý, chỉ làm theo instruction mới nhất, context hiện tại thắng, công cụ vẫn
dùng bình thường.

Gọi qua cùng đường `openChatModel` với selection là Model phụ, không có tools, không stream ra renderer. Model phụ
lỗi thì thử model của turn một lần. Usage cộng vào `usages` của turn.

### D5. Model phụ trong `meta`

Key `ai.auxiliary`, giá trị `ModelRef`. Đọc/ghi giống `ai.main`: không parse được hoặc entry đã xóa thì đọc là `null`.
`AiPreferences` thêm `auxiliary: ModelRef | null`. UI là một `SettingsSection` "Model phụ" trong `modelPages.tsx`,
dùng lại picker của Model dự phòng, có lựa chọn "Dùng model của lượt". Không thêm mức suy luận cho Model phụ.

### D6. Rút gọn chỉ ghi activity

Bỏ phần tử `progress` "Bỏ N lượt cũ…" hiện có. Thay bằng `agent_activity` loại `compaction` với `detail_json` ghi
số turn bị lược kết quả, số turn được tóm tắt, số turn bị cắt và lỗi tóm tắt nếu có.

## Risks / Trade-offs

- [Prompt mỗi vòng dài hơn, chi phí tăng ở session ngắn] → ngưỡng 50% và bước lược kết quả công cụ giới hạn phần
  tăng; prompt cache của provider hưởng lợi vì phần history ổn định giữa các vòng.
- [Đích trong `context_json` cũ có thể đã bị xóa hoặc đổi tên, nhãn dựng lại khác lúc chạy] → dùng nhãn đã lưu trong
  `result_json` của `resolve_target` khi có; không tra được thì ghi "đích không còn".
- [Bản tóm tắt sai hoặc thiếu làm model hiểu nhầm việc cũ] → lời dặn "chỉ tham khảo"; ba turn gần nhất luôn nguyên
  văn; revert xóa bản tóm tắt.
- [Hai turn cùng session tóm tắt đồng thời] → session chỉ có một turn chạy tại một thời điểm (`app-agent-session`),
  nên không có tranh chấp ghi.
- [Lời gọi tóm tắt làm chậm vòng đầu của turn] → chỉ xảy ra khi vượt ngưỡng và bản cũ không đủ; các turn sau dùng lại.

## Migration Plan

Migration v18 chỉ tạo bảng mới, không đụng dữ liệu cũ. Session cũ chưa có bản tóm tắt; lần đầu vượt ngưỡng sẽ tóm
tắt. Rollback: bản app cũ bỏ qua bảng lạ, nhưng không mở được DB v18 theo luật phiên bản hiện có, như mọi migration
trước.
