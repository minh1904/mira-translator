## RENAMED Requirements

- FROM: `### Requirement: Scheduler tuần tự`
- TO: `### Requirement: Scheduler song song có giới hạn`

## MODIFIED Requirements

### Requirement: Scheduler song song có giới hạn
Hệ thống SHALL cho phép nhiều item `running` cùng lúc trên toàn ứng dụng. Số item `running` dùng cùng một mục
model SHALL không vượt trần đồng thời của mục model đó (giá trị người dùng đặt, hoặc mặc định của gateway). Trong
một item, các batch SHALL vẫn chạy tuần tự. Khi có suất trống, scheduler SHALL chọn item `queued` theo vòng
giữa các task đang chờ (mỗi task lần lượt một item, task tạo trước được lượt trước), và trong một task theo
`item.ordinal`. Item của task đang trích thuật ngữ trước khi dịch SHALL không bắt đầu cho tới khi bước trích
xong. Item `waiting_user` hoặc `failed` SHALL không chặn item sau. Scheduler SHALL được đánh thức bởi sự kiện
(tạo, Continue, Retry, item kết thúc, bước trích thuật ngữ kết thúc) và SHALL không poll.

#### Scenario: Hai task cùng queued
- **WHEN** hai task dùng cùng mục model trần 4, mỗi task có 10 item `queued`
- **THEN** bốn item chạy cùng lúc, hai của mỗi task, và task tạo trước nhận item đầu tiên

#### Scenario: Trần của mục model
- **WHEN** trần đồng thời của mục model là 2 và một task có 5 item `queued`
- **THEN** đúng hai item `running`, item thứ ba bắt đầu khi một item kết thúc

#### Scenario: Batch trong một item
- **WHEN** một item có ba batch
- **THEN** batch 2 chỉ được gửi sau khi batch 1 kết thúc

#### Scenario: Trích thuật ngữ trước khi dịch
- **WHEN** task `extract_then_review` đang trích thuật ngữ
- **THEN** không item nào của task đó `running` cho tới khi bước trích kết thúc

#### Scenario: Chương thiếu raw
- **WHEN** chương 7 của task 1–30 không có bản gốc
- **THEN** item 7 chuyển `waiting_user(missing_raw)`, các item khác tiếp tục chạy, và khi hết item task kết
  thúc `partially_completed`

#### Scenario: Lỗi khóa dừng cả task
- **WHEN** item 3 lỗi xác thực trong khi item 4 và 5 đang chạy
- **THEN** task chuyển `waiting_user(provider)`, không item mới nào của task bắt đầu, item 4 và 5 được kết thúc
  theo kết quả thật của chúng

### Requirement: Item ghim một bản chụp ngữ cảnh
Lần đầu item chuyển `queued → running`, hệ thống SHALL tạo bản chụp bằng `takeContextSnapshot` và lưu vào
`translate_run_context` (work DB trước), rồi trong cùng transaction library đặt `run_key`, `source_rev` và
`expected_target_rev` của item. Mọi lời gọi model của mọi lần chạy item SHALL dựng ngữ cảnh từ bản chụp này,
không đọc kho ngữ cảnh. Lỗi đọc bản chụp SHALL không bị bỏ qua. `source_rev` khác bản nguồn hiện tại khi
Continue/Retry SHALL đưa item về `waiting_user(conflict)`. Bản chụp của một item SHALL không phụ thuộc kết quả
dịch của item khác, để kết quả không đổi theo thứ tự hay số item chạy song song.

#### Scenario: Sửa glossary giữa task
- **WHEN** người dùng duyệt thêm mục glossary khi item 3 và 4 đang chạy
- **THEN** item 3, 4 và các lần Retry của chúng dùng bản chụp cũ và báo ngữ cảnh đã đổi; item chưa bắt đầu chụp
  bản mới

#### Scenario: Nguồn đổi khi app tắt
- **WHEN** bản nguồn của chương đổi revision trước khi người dùng Continue
- **THEN** item chuyển `waiting_user(conflict)` và không có lời gọi model nào cho item đó

#### Scenario: Revision đích chụp lúc item bắt đầu
- **WHEN** người dùng sửa bản dịch chương 20 sau khi tạo task nhưng trước khi item 20 bắt đầu
- **THEN** item 20 chụp `expected_target_rev` mới lúc bắt đầu và chạy bình thường

#### Scenario: Thứ tự chạy không đổi bản chụp
- **WHEN** item 9 bắt đầu trước khi item 8 xong
- **THEN** bản chụp của item 9 giống hệt bản chụp nó có khi item 8 đã xong, với cùng kho ngữ cảnh

### Requirement: Pause, Cancel và đóng app có điểm an toàn
Runner SHALL kiểm `shouldStop()` trước mỗi batch; Pause SHALL để batch đang chạy của **mọi** item `running` của
task commit nguyên tử rồi dừng, và task chỉ thành `paused` khi item cuối cùng đã dừng. Cancel SHALL abort mọi
request đang chạy của task và SHALL không commit batch nào sau khi được chấp nhận; phần đã commit được giữ.
Đường thoát app SHALL ghi `paused(app_closed)` cho task `queued`/`running`/`pausing` và đưa mọi item `running`
về `queued` trước khi đóng library.

#### Scenario: Pause giữa item
- **WHEN** Pause đến khi item 4 đang chờ provider ở batch 2 và item 5 đang chờ ở batch 1
- **THEN** cả hai batch đang chờ commit, không batch mới nào được gửi, task thành `paused(user)` sau khi item cuối
  dừng, và tiến độ đúng

#### Scenario: Cancel khi provider đang chạy
- **WHEN** Cancel đến khi request của ba item đang bay
- **THEN** cả ba request bị abort, không batch nào của chúng được commit, task thành `cancelled` sau khi runner
  cuối kết thúc

#### Scenario: Đóng app khi task đang chạy
- **WHEN** người dùng thoát app khi item 5 và 6 đang chạy
- **THEN** task là `paused(app_closed)`, item 5 và 6 là `queued`, và mở lại app không tự chạy tiếp

### Requirement: Ngân sách một lượt và trần task
Mỗi operation của item SHALL dùng đúng một `CallBudget` cho mọi batch và vòng phụ, theo spec
`translation-call-budget`. Trước mỗi lời gọi model, cùng cổng đó SHALL kiểm trần task (số lời gọi, số token;
chi phí chỉ khi catalog có giá; kết nối subscription/OAuth chỉ có trần lời gọi/token) trên **tổng** của các lần
chạy đã kết thúc và **mọi** lần chạy đang diễn ra của task. Chạm trần SHALL đưa task về `paused(budget)` trước
khi gửi request; các item đang chạy khác dừng ở điểm an toàn. Usage SHALL được lưu sau mỗi batch, kể cả khi lần
chạy lỗi, với `complete = false` cho tới khi kết thúc bình thường; usage provider không báo SHALL là "không rõ",
không phải 0. Hệ thống SHALL không tự chuyển sang provider, model hoặc kết nối khác.

#### Scenario: Chạm trần lời gọi giữa task
- **WHEN** task đặt trần 40 lời gọi và lời gọi kế tiếp sẽ là thứ 41
- **THEN** request không được gửi, item đang chạy về `queued`, task thành `paused(budget)` và kết quả đã commit
  được giữ

#### Scenario: Hai item cùng chạm trần
- **WHEN** task đặt trần 40 lời gọi, đã dùng 39, và hai item đang chạy cùng xin lời gọi kế tiếp
- **THEN** đúng một lời gọi được gửi, item kia dừng ở điểm an toàn, và tổng lời gọi của task không vượt 40

#### Scenario: Lỗi provider giữa item
- **WHEN** provider lỗi ở batch ba sau hai batch có usage
- **THEN** operation lưu usage của hai batch với `complete = false` và item `failed(provider)`

#### Scenario: Provider không báo usage
- **WHEN** provider không trả usage cho lời gọi nào của item
- **THEN** màn Hoạt động hiện usage "không rõ" chứ không hiện 0
