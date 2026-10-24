# Đẩy request song song an toàn

Cập nhật: 2026-10-23 · Trạng thái: **Nghiên cứu** và **đề xuất**, chưa chốt, chưa triển khai. Chủ trì: kỹ thuật.

## Câu hỏi

Khi tác vụ dịch chạy nhiều chương cùng lúc, Mira nên đẩy request thế nào để nhanh mà không bị nhà cung cấp
chặn (429), không đốt hạn mức vô ích và không làm chat của người dùng phải chờ?

## Nhà cung cấp tính giới hạn thế nào (đọc 2026-10-23)

| | Gemini | OpenAI | Anthropic |
| --- | --- | --- | --- |
| Đo theo | RPM, TPM đầu vào, RPD; có thể thêm TPD | RPM, RPD, TPM, TPD | RPM, ITPM, OTPM theo nhóm model |
| Phạm vi | **Theo project, không theo khóa** | Theo tổ chức/project | Theo tổ chức (workspace đặt thấp hơn được) |
| Đặc điểm | RPD reset nửa đêm giờ Thái Bình Dương; tier trả phí có thêm trần chi tiêu theo cửa sổ 10 phút, vượt thì 429 `RESOURCE_EXHAUSTED`; "không bảo đảm" công suất | `max_tokens` tính vào TPM (lấy max của `max_tokens` và ước lượng); **request lỗi vẫn tính vào giới hạn** | Token bucket hồi liên tục; 60 RPM có thể bị áp thành 1 request/giây nên dồn cục cũng dính 429; tăng tải đột ngột dính "acceleration limit"; token đọc cache không tính ITPM |
| Báo còn lại | Không nêu header | `x-ratelimit-remaining-requests/tokens` | `anthropic-ratelimit-*-remaining`, `retry-after` |
| Khuyến nghị | Chờ rồi thử lại, giảm request tốn kém | Backoff lũy thừa có jitter | Tăng tải từ từ, tôn trọng `retry-after` |

Nguồn: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits),
[Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits).

## Mira đã có gì (`src/main/infra/providers/gateway/`)

- `Limiter`: trần đồng thời theo mục model, mặc định 4, dùng chung cho chat và tác vụ.
- `RatePacer`: giãn đều theo RPM nếu người dùng đặt `rpmLimit`; mặc định 0 là không giãn.
- `KeyScheduler`: đóng băng khóa khi 429/hết hạn mức, gộp các lỗi đồng thời cùng đợt thành một lần vi phạm,
  một lượt thăm dò khi khóa hết băng.
- `decideRetry`: chỉ thử lại lỗi mạng/timeout (tối đa 2 lần, backoff có jitter ±20%, trần 10 giây); tôn trọng
  `Retry-After` nếu không quá trần. Lỗi do khóa thì đổi khóa ngay.
- Đọc `Retry-After`; **không** đọc header "còn lại".

## Chỗ thiếu khi chạy song song

1. **Không giới hạn token/phút.** Mỗi lô dịch tới 4.500 token đầu vào cộng system prompt. Bốn chương cùng
   lúc dễ chạm TPM trước RPM, nhất là ở tier thấp.
2. **Gặp 429 thì đổi khóa, không giảm tốc.** Với Gemini, giới hạn theo project: nhiều khóa cùng project đổi qua
   lại vẫn dính 429, và request lỗi vẫn tính vào giới hạn (OpenAI nói rõ). Cần giảm tốc cả mục model, không chỉ
   đóng băng một khóa.
3. **Đồng thời cố định.** Không tự giảm khi bị chặn, không tăng dần khi chạy êm.
4. **Không khởi động từ từ.** Bắt đầu tác vụ là bắn đủ 4 request cùng lúc; Anthropic cảnh báo dồn cục và tăng tải
   đột ngột.
5. **Chat và tác vụ dùng chung một trần.** Tác vụ dài chiếm hết suất thì lượt chat của người dùng phải xếp hàng.

## Đề xuất (theo thứ tự làm)

1. **Song song ở tầng tác vụ, giới hạn ở tầng gateway.** Bộ lập lịch tác vụ mở N chương (N = trần đồng thời của
   model, tối đa 4 lúc đầu); gateway vẫn là nơi duy nhất quyết định khi nào request được đi.
2. **Khởi động chậm và tự điều chỉnh (AIMD).** Bắt đầu với 1–2 request đồng thời, mỗi lần thành công liên tiếp đủ
   một ngưỡng thì cộng 1 tới trần; gặp `rate_limited` thì chia đôi và tạm dừng cả mục model theo `Retry-After`
   (hoặc vài giây có jitter nếu không có). Giống `autoAdjustWorkers` của GalTransl.
3. **Phân biệt 429 tốc độ với hết hạn mức.** `rate_limited` → giảm tốc và chờ; `quota` → đóng băng khóa và dừng tác
   vụ như hiện nay. Chỉ đổi khóa khi kết nối có khóa thuộc project/tài khoản khác nhau; không xoay vòng vô ích.
4. **Giãn theo token khi người dùng biết TPM.** Thêm `tpmLimit` cạnh `rpmLimit`, ước lượng token đầu vào trước khi
   gửi (bộ chia lô đã ước lượng sẵn).
5. **Ưu tiên chat.** Giữ lại ít nhất một suất cho lượt chat, hoặc cho chat chen trước trong hàng đợi của `Limiter`.
6. **Đọc header "còn lại"** của OpenAI và Anthropic để chậm lại trước khi dính 429. Gemini không có, dựa vào bước 2.

Không nên: thử lại `rate_limited` liên tục không chờ; tăng trần đồng thời mặc định quá 4 khi chưa đo; xoay vòng
khóa để "lách" giới hạn của cùng một project.

## Cần đo

Tác vụ 30 chương, Gemini Flash, tier miễn phí và tier 1: thời gian xong, số 429, số request lỗi, token. So sánh
tuần tự, song song cố định 4, và AIMD.
