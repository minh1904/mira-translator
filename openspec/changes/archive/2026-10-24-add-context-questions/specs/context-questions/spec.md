## Purpose

Quy định cách Mira hỏi người dùng về những chỗ ngữ cảnh mà AI chưa chắc, mà không chặn task dịch: áp mặc định
ngay, để câu hỏi mở, và cho người dùng trả lời trong màn Từ điển hoặc qua chat. Mỗi câu trả lời là một hành động có
thể áp bằng code.

## ADDED Requirements

### Requirement: Câu hỏi ngữ cảnh không chặn task
Khi bước trích gặp chỗ chưa chắc thuộc một loại câu hỏi đã định, Mira SHALL:
- áp ngay phương án mặc định của loại đó;
- gắn lên mục một câu hỏi mở gồm loại, tiêu đề, các lựa chọn, đáp án mặc định, chương bắt đầu ảnh hưởng và câu chứng;
- tiếp tục task.

Task SHALL không chuyển sang `waiting_user` vì câu hỏi ngữ cảnh. Các loại câu hỏi và mặc định:

| Loại | Khi nào | Mặc định đã áp | Lựa chọn |
| --- | --- | --- | --- |
| Sửa đổi bị giữ lại | mục có cờ `revision_suggested` | giữ nguyên | Áp cho cả truyện · Áp từ chương N · Giữ nguyên |
| Có thể là một | model hoặc code thấy hai mục có thể cùng một thực thể | hai mục riêng | Gộp vào mục kia · Hai mục khác nhau |
| Giới tính chưa chắc | bằng chứng giới tính của nhân vật mâu thuẫn nhau | `unknown` | Nam · Nữ · Không rõ |

#### Scenario: Biệt danh có thể là nhân vật đã có
- **WHEN** bước trích thấy "翠風のシルフィア" và tạo mục 翠風 trong khi đã có mục シルフィア
- **THEN** 翠風 được lưu là mục riêng có hiệu lực, mang câu hỏi "Có thể là một" trỏ tới シルフィア, và task dịch tiếp
  không dừng

#### Scenario: Giới tính mâu thuẫn
- **WHEN** câu chứng của một nhân vật có cả "少年" ở chương 2 và "彼女" ở chương 9
- **THEN** nhân vật lưu giới tính `unknown` với câu hỏi "Giới tính chưa chắc" kèm hai câu chứng

### Requirement: Trả lời là hành động code
Mỗi lựa chọn của câu hỏi ngữ cảnh SHALL ứng với đúng một hành động, áp bằng code, không gọi model:

| Lựa chọn | Hành động |
| --- | --- |
| Áp cho cả truyện | đổi mục tại chỗ |
| Áp từ chương N | đổi mục từ chương N |
| Giữ nguyên | không đổi |
| Gộp vào mục kia | chuyển nguồn, alias và bằng chứng của mục này thành alias và bằng chứng của mục kia, rồi xóa mục này |
| Hai mục khác nhau | giữ nguyên hai mục |
| Nam · Nữ · Không rõ | đặt giới tính |

Áp đáp án SHALL tính là người dùng sửa mục: có lịch sử với nguồn là người dùng, và đặt mốc "người dùng sửa". Sau khi
áp, câu hỏi SHALL được đóng. Câu hỏi cùng loại, cùng mục và cùng nội dung đề xuất SHALL không được tạo lại. Đáp án
không thuộc các lựa chọn SHALL bị từ chối, và câu hỏi vẫn mở.

#### Scenario: Gộp biệt danh
- **WHEN** người dùng chọn "Gộp vào mục kia" cho câu hỏi 翠風 → シルフィア
- **THEN** 翠風 thành alias của シルフィア, mục 翠風 không còn, và lịch sử của シルフィア ghi thay đổi do người dùng

#### Scenario: Đã trả lời "Hai mục khác nhau"
- **WHEN** người dùng chọn "Hai mục khác nhau", rồi lần trích sau lại thấy 翠風 và シルフィア có thể là một
- **THEN** không có câu hỏi mới cho cặp đó

#### Scenario: Trả lời trước khi chương N chạy
- **WHEN** task đang dịch chương 5, và người dùng chọn "Áp từ chương N" cho một sửa đổi từ chương 12
- **THEN** bản chụp của chương 12 có giá trị mới và không chương nào phải dịch lại

### Requirement: Trả lời trong màn Từ điển
Màn Từ điển của tác phẩm SHALL có bộ lọc "Cần xem", liệt kê các mục có câu hỏi mở. Mỗi mục đó SHALL hiện thẻ câu
hỏi có tiêu đề, câu chứng kèm chương, các lựa chọn với đáp án mặc định đã chọn sẵn, và nút xác nhận. Thẻ SHALL có
cùng cách thao tác với thẻ câu hỏi trong chat: phím số chọn lựa chọn, Ctrl+Enter gửi. Chi tiết task và màn Hoạt động
SHALL hiện số câu hỏi ngữ cảnh mở mà task đó tạo ra, kèm liên kết mở màn Từ điển với bộ lọc "Cần xem".

#### Scenario: Mở từ chi tiết task
- **WHEN** task tạo 3 câu hỏi ngữ cảnh và người dùng bấm "3 câu hỏi ngữ cảnh" trong chi tiết task
- **THEN** màn Từ điển của đúng tác phẩm mở với bộ lọc "Cần xem" và 3 mục

#### Scenario: Không có câu hỏi
- **WHEN** tác phẩm không có câu hỏi mở
- **THEN** bộ lọc "Cần xem" hiện trạng thái trống, và chi tiết task không hiện số câu hỏi

### Requirement: Trả lời qua chat
Ngữ cảnh của mỗi lượt chat có tác phẩm làm đích SHALL có số câu hỏi ngữ cảnh mở của tác phẩm đó. Capability đọc
`read_context_questions` SHALL trả các câu hỏi mở, xếp theo mức ảnh hưởng giảm dần. Mức ảnh hưởng là số lần dạng của
mục xuất hiện trong các chương chưa dịch; bằng nhau thì xếp theo chương bắt đầu ảnh hưởng tăng dần. Mỗi câu hỏi kèm
ID, tiêu đề, lựa chọn, mặc định và câu chứng. Model SHALL hỏi bằng `ask_questions` với tối đa 5 câu một lần, giữ
nguyên nhãn lựa chọn. Capability ghi `answer_context_questions` SHALL nhận cặp ID câu hỏi → nhãn lựa chọn, áp như
trả lời trong màn Từ điển, và trả kết quả từng câu. Câu không hợp lệ hoặc đã đóng SHALL báo lỗi riêng câu đó và
không chặn các câu khác. Ở mức quyền Autopilot, model SHALL không gọi `answer_context_questions` cho câu mà người
dùng chưa trả lời.

#### Scenario: Người dùng hỏi trong chat
- **WHEN** người dùng nhắn "có gì cần tôi quyết không?" và tác phẩm có 7 câu hỏi mở
- **THEN** model đọc câu hỏi, gọi `ask_questions` với 5 câu ảnh hưởng nhất, rồi áp các đáp án bằng
  `answer_context_questions`

#### Scenario: Một câu đã được trả lời ở màn Từ điển
- **WHEN** `answer_context_questions` nhận hai câu, một câu vừa được đóng ở màn Từ điển
- **THEN** câu còn lại được áp, và câu đã đóng báo lỗi riêng mà không đổi mục
