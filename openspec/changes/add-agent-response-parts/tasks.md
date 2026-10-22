## 1. Dữ liệu

- [ ] 1.1 Migration library kế tiếp: bảng `agent_turn_part`, cột `agent_tool_call.parent_call_id` và `messages_json`; fixture schema; test migration/backup
- [ ] 1.2 Repository: ghi lô phần tử của một vòng cùng tool call trong một transaction; liệt kê phần tử và tool call theo turn; đọc một tool call theo ID
- [ ] 1.3 Dựng phần tử ảo cho turn cũ không có phần tử; test với fixture turn trước migration

## 2. Contract

- [ ] 2.1 Thêm kind `tool-call` và trường `round` cho delta trong `agentStreamEventSchema`; cập nhật `validateAgentEventSequence` và test
- [ ] 2.2 Snapshot session thêm `parts` và `toolCalls` (tham số, trạng thái, câu mô tả, `summary`, cha); lệnh `toolCalls.get`
- [ ] 2.3 Capability: thay `activityAdapter` bằng `describe` trả câu thì hiện tại, thì quá khứ và `summary`; cập nhật mọi capability đọc, ghi và task

## 3. Vòng chạy trong main

- [ ] 3.1 Giữ chữ và suy nghĩ theo vòng, ghi phần tử khi vòng kết thúc và trong nhánh hủy/lỗi; `agent_turn.answer` giữ nguyên, ghi `agent_turn.reasoning`
- [ ] 3.2 Phát `tool-call` khi lưu, khi chạy và khi kết thúc, kể cả call bị từ chối, sai tham số, hết ngân sách và `autopilot_skipped`
- [ ] 3.3 Activity info (bỏ lịch sử, model không có tool) thành phần `progress`
- [ ] 3.4 Tách thân vòng chạy thành hàm dùng chung có `scope`; vòng chính dùng lại không đổi hành vi (toàn bộ test `agentService` hiện có xanh)
- [ ] 3.5 Subagent qua hàm dùng chung: capability chỉ đọc, ngân sách 4/10/60.000, chặn lặp, `resolve_target` trả ứng viên, tóm tắt là chữ vòng cuối, hủy theo turn, log model không trùng vòng
- [ ] 3.6 Test spec: thứ tự chữ–tool–chữ; mở lại app trả cùng thứ tự; suy nghĩ được lưu; call bị từ chối có sự kiện `failed`; subagent lưu tool con, chạm trần, gọi tool ghi bị từ chối

## 4. Store renderer

- [ ] 4.1 Store giữ `parts` theo turn và `toolCalls` theo ID; delta cập nhật phần tạm của vòng; snapshot thắng khi đọc lại
- [ ] 4.2 Xử lý sự kiện `tool-call`; tải kết quả đầy đủ khi mở dòng tool, có cache
- [ ] 4.3 Hành động Thử lại gửi turn mới cùng instruction và context
- [ ] 4.4 Test store: event trùng, mất event rồi đọc lại, hai vòng chữ

## 5. Transcript

- [ ] 5.1 Hàm thuần dựng theo tốc độ từ và tự đóng fence, thay `DeltaBuffer`; test các mốc 8/40/2000/80 và reduced motion
- [ ] 5.2 Bong bóng lệnh căn phải, tối đa 90%
- [ ] 5.3 `ResponseParts` dựng chữ, suy nghĩ, dòng tool, dòng subagent, tiến trình theo thứ tự
- [ ] 5.4 `ThinkingPart`: cao tối đa 200px, tự cuộn, tiêu đề đang/đã suy nghĩ có thời lượng, nhãn tiếng Việt
- [ ] 5.5 `ToolCallRow`: icon và nhãn trạng thái, câu thì hiện tại/quá khứ, mở Đầu vào/Kết quả, `aria-expanded`
- [ ] 5.6 Thẻ duyệt và operation đặt ngay sau dòng tool của chúng; operation có Dừng, tiến độ, Mở đích, Hoàn tác, Chi tiết
- [ ] 5.7 `SubagentRow`: đang/đã chạy, thời gian, mở ra thấy tool con, tự thu gọn khi xong
- [ ] 5.8 `WorkingRow` với nhãn luân phiên 1,2 giây, cảnh báo 90 giây, trạng thái chờ người dùng
- [ ] 5.9 `TurnFooter`: Sao chép, Thử lại ở turn cuối, model, usage (ghi rõ khi chưa đầy đủ), khối lỗi, nhãn Đã dừng
- [ ] 5.10 Tự cuộn bằng `ResizeObserver` ngưỡng 2px và nút "Về mới nhất"
- [ ] 5.11 Xóa lọc nhãn `Subagent:`, emoji, `AgentFollowups` và test của nó; bỏ export `ActivityTimeline` nếu không còn dùng
- [ ] 5.12 Test transcript: thứ tự xen kẽ, dòng tool mở được, thẻ duyệt đúng vị trí, bàn phím và vùng live

## 6. Hoàn tất

- [ ] 6.1 Cập nhật trạng thái C9–C17, C19, C21 trong `docs/modules/proposals/chat-ui-vscode.md` và README module
- [ ] 6.2 Chạy `node scripts/check.mjs`
