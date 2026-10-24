## Why

`SYSTEM_PROMPT` của agent chỉ nói "Trả lời bằng tiếng Việt", không nói gì về độ dài hay cách báo kết quả. Transcript
đã hiện dòng tool và thanh "Đã sửa", nên câu trả lời kể lại từng bước hay lặp lại yêu cầu chỉ làm người dùng đọc hai
lần. Hermes Agent (NousResearch, `SOUL.md`) giải quyết việc này bằng vài dòng văn phong trong system prompt.

## What Changes

- Thêm vào system policy của agent các chỉ dẫn văn phong:
  - độ dài câu trả lời tương xứng câu hỏi: câu hỏi một dòng thì trả lời một dòng;
  - không câu đệm, không nhắc lại yêu cầu, không tóm tắt lại điều vừa nói;
  - không kể lại tool call mà transcript đã hiện;
  - việc đã làm xong thì báo ngắn: đã đổi gì, đã kiểm gì, còn gì;
  - không chắc thì nói thẳng là không chắc.
- Không đổi tool, policy, budget hay giao diện.

Ngoài phạm vi: cho người dùng chỉnh văn phong (ô hướng dẫn cho agent, để sau), đổi văn phong của luồng chat legacy
hay prompt dịch.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-conversation`: thêm requirement về văn phong câu trả lời của agent.

## Impact

- `src/main/services/agent/agentService.ts`: thêm vài dòng vào `SYSTEM_PROMPT`.
- Prompt mỗi vòng dài thêm khoảng 400 ký tự.
