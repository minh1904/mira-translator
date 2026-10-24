## ADDED Requirements

### Requirement: Vòng model rỗng được thử lại có giới hạn
Một vòng model SHALL được coi là rỗng khi không có chữ trả lời (sau khi bỏ khoảng trắng), không có tool call và
provider không báo bị bộ lọc nội dung chặn. Runtime SHALL gửi lại đúng request của vòng rỗng tới cùng model, tối
đa 2 lần cho một vòng và 3 lần cho cả lượt. Runtime SHALL dừng thử lại sớm khi hai lần liên tiếp đều rỗng và
provider báo 0 token output. Vòng bị bộ lọc chặn SHALL không được thử lại. Lần thử lại SHALL không tính là một vòng
model trong budget của lượt, SHALL không lưu phần tử câu trả lời của lần rỗng, và usage cùng chi phí của mọi lần
thử SHALL được cộng vào lượt. Mỗi lần thử lại SHALL được ghi vào activity của lượt và SHALL không hiện phần tử nào
trong transcript. Khi hết lượt thử mà vòng vẫn rỗng, lượt SHALL kết thúc như một vòng trả lời cuối rỗng hiện nay.
Quy tắc này SHALL áp dụng cho cả vòng model của subagent.

#### Scenario: Thử lại thành công
- **WHEN** vòng model thứ hai trả về không chữ, không tool call và không bị lọc
- **THEN** runtime gửi lại vòng đó tới cùng model, lần sau có chữ trả lời, transcript chỉ có câu trả lời đó và
  usage của lượt gồm cả lần rỗng

#### Scenario: Rỗng tất định
- **WHEN** hai lần liên tiếp của một vòng đều rỗng và provider báo 0 token output cho cả hai
- **THEN** runtime không gửi thêm lần nào cho vòng đó và lượt hiện "Lượt kết thúc mà không có phản hồi" kèm Tiếp tục

#### Scenario: Bị bộ lọc chặn
- **WHEN** vòng model kết thúc không có chữ với lý do bộ lọc nội dung
- **THEN** runtime không thử lại và xử lý như hiện nay

#### Scenario: Hết số lần thử của lượt
- **WHEN** lượt đã thử lại 3 lần ở các vòng trước và một vòng sau lại rỗng
- **THEN** runtime không thử lại vòng đó

#### Scenario: Không đổi model
- **WHEN** một vòng rỗng được thử lại
- **THEN** request thử lại đi tới đúng model của lượt, không tới model dự phòng nào

### Requirement: Dừng sớm khi model lặp văn bản
Trong lúc stream chữ trả lời hoặc suy luận của một vòng, runtime SHALL coi vòng là lặp khi văn bản của vòng đã dài
ít nhất 2.000 ký tự và một đoạn nguyên văn dài ít nhất 60 ký tự lặp lại liên tiếp sao cho phần lặp chiếm hơn một nửa
văn bản của vòng. Khi đó runtime SHALL hủy request đang stream, SHALL giữ phần văn bản trước lần lặp thứ hai của
đoạn đó, SHALL không chạy tool call nào của vòng, SHALL không gửi thêm vòng model nào, và SHALL kết thúc lượt
`completed` kèm thông báo "Lượt dừng vì chạm giới hạn" nêu lý do lặp văn bản, có nút **Tiếp tục** như các lần dừng
vì giới hạn khác. Lặp văn bản SHALL không làm lượt `failed`. Usage đã được provider báo SHALL được cộng vào lượt. Quy tắc này SHALL áp dụng cho cả subagent; subagent bị dừng vì lặp SHALL
trả lỗi cho lượt chính như các lý do dừng khác của subagent.

#### Scenario: Model lặp một đoạn
- **WHEN** model stream 3.000 ký tự trong đó một câu 80 ký tự lặp liên tiếp chiếm 2.400 ký tự
- **THEN** request bị hủy, câu trả lời giữ phần trước lần lặp thứ hai và lượt kết thúc `completed` kèm thông báo
  dừng vì lặp văn bản và nút Tiếp tục

#### Scenario: Văn bản có điệp từ bình thường
- **WHEN** câu trả lời 3.000 ký tự có vài câu ngắn hơn 60 ký tự lặp lại, hoặc phần lặp chiếm dưới một nửa
- **THEN** stream chạy tiếp và lượt kết thúc bình thường

#### Scenario: Suy luận lặp
- **WHEN** phần suy luận của vòng thỏa điều kiện lặp trong khi chưa có chữ trả lời
- **THEN** request bị hủy và lượt kết thúc `completed` kèm thông báo dừng vì lặp văn bản và nút Tiếp tục
