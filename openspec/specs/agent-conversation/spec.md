# agent-conversation Specification

## Purpose
TBD - created by archiving change add-agent-conversation. Update Purpose after archive.
## Requirements
### Requirement: Session toàn ứng dụng và lịch sử bền
Mira SHALL cho tạo và tiếp tục session Trợ lý từ Trang chủ, Thư viện hoặc màn chương, đọc từ cùng library DB. Đổi màn, đóng panel hay mở tác phẩm khác SHALL không tạo lịch sử thứ hai. Một session MAY chứa turn liên quan nhiều tác phẩm; mỗi turn SHALL giữ context snapshot riêng. Dữ liệu chat legacy SHALL vẫn đọc được trong luồng legacy.

#### Scenario: Chat trước khi mở truyện
- **WHEN** người dùng tạo chat ở Trang chủ rồi mở một chương và gửi tiếp trong cùng session
- **THEN** session vẫn giữ các turn trước và turn mới nhận context của chương

#### Scenario: Mở lại ứng dụng
- **WHEN** app mở lại sau các turn đã kết thúc
- **THEN** danh sách session và transcript, gồm chuỗi phần tử câu trả lời, tool call, suy nghĩ và operation của từng turn, được đọc từ library DB theo thứ tự ổn định

### Requirement: Context được chụp tại lúc gửi
Composer SHALL hiện chip cho mọi ngữ cảnh sẽ gửi theo capability `agent-composer`: chương đang mở khi đã thêm, vùng chọn, và các đính kèm người dùng thêm bằng nút +; chip gợi ý mờ không được gửi. Main SHALL lưu snapshot context gồm đúng các chip được gửi khi chấp nhận turn; navigation sau đó SHALL không đổi context của turn. Main SHALL cấp một handle cho mỗi tác phẩm hoặc chương trong snapshot (`ctx` cho chương hoặc tác phẩm chính, `ctx2`, `ctx3`… cho đính kèm khác) và SHALL đưa nội dung của mục glossary và cặp xưng hô đính kèm vào prompt của turn; mục không còn ở trạng thái đã duyệt SHALL bị bỏ kèm ghi chú cho model.

#### Scenario: Đổi chương sau khi gửi
- **WHEN** người dùng gửi yêu cầu với chip chương A rồi chuyển UI sang chương B
- **THEN** tool call của turn vẫn dùng chương A và Mở đích quay về A

#### Scenario: Bỏ context chip
- **WHEN** người dùng bỏ chip chương rồi gửi câu hỏi
- **THEN** snapshot của turn không chứa chương đó, model không nhận handle của chương đó và mọi tool cần chương phải qua `resolve_target`

#### Scenario: Hai chương đính kèm
- **WHEN** người dùng gửi "so sánh xưng hô hai chương" với chip chương 3 và chương 5
- **THEN** model nhận hai handle `ctx` và `ctx2` ứng với chương 3 và chương 5

### Requirement: Target chỉ đi qua handle do runtime cấp
Runtime SHALL cấp handle theo turn cho target của context snapshot và cho kết quả của capability `resolve_target(description)`. `resolve_target` SHALL tìm target bằng resolver xác định của Mira và trả `resolved` với một handle, `ambiguous` với danh sách ứng viên có handle, hoặc `not_found`. Tham số target của mọi capability khác SHALL là handle; runtime SHALL từ chối ID thô hoặc handle không do turn cấp và không chạy call đó.

#### Scenario: Target mơ hồ
- **WHEN** mô tả của người dùng khớp hai tác phẩm
- **THEN** turn chuyển `waiting_user` với hai lựa chọn phân biệt được và chưa tạo operation

#### Scenario: Không tìm thấy target
- **WHEN** `resolve_target` không khớp tác phẩm hoặc chương nào
- **THEN** model nhận kết quả `not_found`, không có operation nào được tạo và câu trả lời nói rõ không tìm thấy đích

#### Scenario: Model tự đưa ID
- **WHEN** model gọi capability với ID tác phẩm thô hoặc handle không được cấp trong turn
- **THEN** call không chạy, model nhận lỗi có cấu trúc và activity ghi lỗi thay vì thành công

### Requirement: Policy do code quyết định
Runtime SHALL quyết định `allow`, `deny` hoặc `needs_user` cho mỗi tool call bằng hàm thuần theo bảng: capability đọc → `allow`; ghi có Undo trên target do người dùng nêu (target của context snapshot, target người dùng chọn trong lựa chọn của `resolve_target` mơ hồ, hoặc target mà tên tác phẩm hay số chương xuất hiện trong instruction của turn) → `allow`; ghi có Undo trên target khác → `needs_user`; `undo_operation` cho operation của session hiện tại → `allow`, của session khác → `deny`; tạo task dịch → `needs_user`; capability ngoài bảng → `deny`. Văn bản truyện, lịch sử và tool output SHALL không thể cấp quyền, thêm tool hay đổi bảng này.

#### Scenario: Câu hỏi chỉ đọc
- **WHEN** người dùng hỏi số chương của một tác phẩm
- **THEN** model gọi capability đọc được `allow` và không có operation ghi nào được tạo

#### Scenario: Prompt injection trong raw
- **WHEN** raw chứa chỉ dẫn yêu cầu sửa một tác phẩm khác và model làm theo
- **THEN** call ghi vào tác phẩm không do người dùng nêu nhận `needs_user`, không có thay đổi nào trước khi người dùng duyệt

#### Scenario: Undo operation của session khác
- **WHEN** model gọi `undo_operation` với operation thuộc session khác
- **THEN** call nhận `deny` và nội dung chương không đổi

#### Scenario: Tạo task dịch
- **WHEN** model gọi capability tạo task dịch nhiều chương
- **THEN** turn chuyển `waiting_user` để người dùng duyệt trước khi task được tạo

### Requirement: Tool round được lưu trước side effect
Runtime SHALL gửi cho model chỉ capability được phép trong turn, validate tên và tham số của mọi tool call, và lưu từng call vào `agent_tool_call` cùng quyết định policy trước khi chạy bất kỳ call nào. Kết quả hoặc lỗi của từng call SHALL được lưu trước khi đưa lại cho model. Nếu không lưu được call hoặc kết quả, runtime SHALL dừng turn ở `failed` và không đưa kết quả chỉ có trong bộ nhớ cho model.

#### Scenario: Tool không tồn tại
- **WHEN** model gọi tên ngoài danh sách được phép của turn
- **THEN** call được lưu với lỗi, không chạy, và model nhận lỗi có cấu trúc

#### Scenario: Nhiều call trong một vòng có call sai
- **WHEN** một vòng có một call hợp lệ và một call sai schema
- **THEN** call hợp lệ chạy, call sai không chạy, và mỗi call ID đều có một kết quả được lưu

#### Scenario: Lưu tool call thất bại
- **WHEN** library DB từ chối ghi các tool call của một vòng
- **THEN** không capability nào của vòng đó chạy và turn kết thúc `failed` với lỗi persistence

### Requirement: Model và khả năng gọi tool
Runtime SHALL dùng đúng model đã chốt cho turn và SHALL không tự chuyển sang provider, model hay connection khác khi lỗi. Khi catalog ghi model không gọi được tool (`toolCall: false`), runtime SHALL chạy một vòng không tool, trả lời từ context snapshot và ghi activity nói rõ model không dùng được công cụ. Khi provider từ chối request có tool, turn SHALL kết thúc `failed` với lý do của provider.

#### Scenario: Model không hỗ trợ tool
- **WHEN** người dùng chọn model mà catalog ghi `toolCall: false` và yêu cầu dịch một chương
- **THEN** không có tool nào được gửi, không có operation nào được tạo và câu trả lời kèm activity giải thích giới hạn

#### Scenario: Provider lỗi giữa turn
- **WHEN** provider trả lỗi ở vòng thứ hai
- **THEN** turn kết thúc `failed` với lỗi đã phân loại, kết quả bền đã có được giữ và không có request nào tới model khác

### Requirement: Budget và loop có giới hạn rõ
Mỗi turn SHALL có tối đa 6 vòng model, 20 tool call, 100.000 ký tự đọc và 3 operation ghi. Vòng model cuối được phép SHALL được gửi không kèm tool và tính trong 6 vòng, để model phải trả lời bằng chữ. Khi chạm trần tool call, runtime SHALL trả lỗi budget cho call đó và chuyển sang vòng cuối không tool. Runtime SHALL dừng turn ở `failed` mà không gọi thêm model khi cùng `(tool, tham số chuẩn hóa)` được gọi lần thứ ba trong turn, khi một lần đọc vượt trần ký tự, hoặc khi một lần ghi vượt trần operation; call vượt trần SHALL không chạy.

#### Scenario: Hết vòng gọi tool
- **WHEN** model vẫn muốn gọi tool khi đã tới vòng thứ 6
- **THEN** request vòng 6 không kèm tool và turn kết thúc bằng câu trả lời của model

#### Scenario: Model gọi cùng tool lặp lại
- **WHEN** model gọi cùng tool với cùng tham số chuẩn hóa lần thứ ba
- **THEN** call thứ ba không chạy, turn kết thúc `failed` với lý do lặp và usage đã có

#### Scenario: Đọc vượt trần
- **WHEN** một lần đọc sẽ đưa tổng ký tự đọc của turn vượt 100.000
- **THEN** kết quả đọc không được đưa cho model và turn kết thúc `failed` với lý do budget mà không gọi model tổng kết

### Requirement: Context window theo thứ tự ưu tiên
Mỗi vòng model SHALL được lắp theo thứ tự: system policy và tool definitions; instruction và context snapshot của turn; pending action đang trả lời nếu có; các turn trước của session (chỉ instruction và câu trả lời cuối); tool call và kết quả của turn hiện tại. Khi vượt giới hạn context của model, runtime SHALL bỏ turn cũ nhất trước và ghi số turn đã bỏ vào activity của vòng; runtime SHALL không bỏ system policy, instruction hiện tại, snapshot hay cặp call/result của turn hiện tại.

#### Scenario: Session dài
- **WHEN** lịch sử session vượt giới hạn context của model
- **THEN** các turn cũ nhất bị bỏ khỏi prompt, activity ghi số turn đã bỏ và instruction hiện tại vẫn nguyên văn

#### Scenario: Chương dài
- **WHEN** người dùng hỏi về một chương dài hơn giới hạn đọc của một call
- **THEN** model đọc chương qua tool phân trang thay vì nhận toàn chương trong prompt

### Requirement: Turn chờ người dùng và continuation ràng buộc đúng call
Khi một tool call nhận `needs_user` mà mức quyền và danh sách duyệt trong phiên không tự duyệt nó, hoặc `resolve_target` trả `ambiguous`, runtime SHALL giữ call đó ở `pending` và chuyển turn sang `waiting_user`. Turn `waiting_user` SHALL chỉ chuyển sang `running`, `cancelled` hoặc `expired`. Câu trả lời SHALL gửi kèm `continuesTurnId`, ID của tool call và digest tham số của nó; runtime SHALL chỉ chạy hoặc hoàn tất đúng call `pending` có digest khớp, rồi đánh giá lại policy trước khi chạy. Duyệt một lần (`approve`) SHALL không áp dụng cho call khác, kể cả cùng tên tool. Duyệt trong phiên (`approve_session`) SHALL duyệt đúng call đó và ghi nhớ capability cho session theo capability `agent-chat-permissions`. Vòng tiếp tục SHALL dùng chế độ và mức quyền đã lưu của turn, không dùng giá trị trong lệnh tiếp tục. Stop trên turn `waiting_user` SHALL chuyển nó sang `cancelled`. Turn `waiting_user` SHALL vẫn chờ sau khi app mở lại.

#### Scenario: Chọn một trong hai tác phẩm
- **WHEN** người dùng chọn một ứng viên cho turn đang chờ với ID và digest hợp lệ
- **THEN** cùng turn tiếp tục với handle đã chọn, không tạo turn mới hay operation trùng

#### Scenario: Duyệt rồi model đổi tham số
- **WHEN** người dùng duyệt một lần một call ghi và vòng sau model gọi lại cùng tool với tham số khác
- **THEN** call mới được đánh giá policy riêng và không dùng lại lần duyệt trước

#### Scenario: Duyệt trong phiên rồi model gọi lại
- **WHEN** người dùng duyệt trong phiên một call ghi và vòng sau model gọi lại cùng tool vào đích khác không do người dùng nêu
- **THEN** call mới được đánh giá policy, nhận `needs_user` và được tự duyệt theo danh sách duyệt trong phiên

#### Scenario: Câu trả lời cho turn đã hết hạn
- **WHEN** client gửi continuation cho turn không còn `waiting_user` hoặc với digest không khớp
- **THEN** runtime từ chối continuation cũ và không chạy hành động nào

#### Scenario: Dừng turn đang chờ
- **WHEN** người dùng bấm Stop trên turn `waiting_user`
- **THEN** turn thành `cancelled`, pending call không chạy và session nhận lệnh mới

### Requirement: Mọi cửa sổ thấy turn qua event và snapshot
Main SHALL phát event của turn tới mọi cửa sổ đang mở. Snapshot session SHALL gồm turn, chuỗi phần tử câu trả lời, tool call, activity, operation và pending action. Renderer SHALL upsert turn, phần tử, tool call, activity và operation theo ID, chỉ thay bản có `updatedAt` mới hơn, và SHALL đọc lại snapshot khi nhận event terminal hoặc event của turn chưa có trong store. Answer delta SHALL chỉ là bản trình bày tạm; phần tử đã lưu thắng sau khi đọc lại.

#### Scenario: Mất event sau khi operation commit
- **WHEN** renderer bỏ lỡ event sau khi operation commit nhưng trước terminal
- **THEN** renderer đọc lại snapshot, hiện operation và kết quả từ DB và không gọi lại capability

#### Scenario: Hai cửa sổ
- **WHEN** turn được gửi từ cửa sổ thứ nhất trong khi cửa sổ thứ hai đang mở cùng session
- **THEN** cả hai cửa sổ hiện cùng chuỗi phần tử, dòng tool và câu trả lời cuối

### Requirement: Giao diện chat dùng chung state và truy cập được
Màn Trợ lý SHALL có Chat mới, danh sách session bật/tắt được, transcript, composer và Mở đích. Side panel màn chương SHALL chỉ chứa chat Trợ lý, dùng cùng agent store và cùng component transcript và composer với màn Trợ lý; header có tiêu đề session, lịch sử, Chat mới và Đóng. Draft SHALL được giữ theo session trong renderer. Auto-scroll SHALL không kéo người dùng đang đọc lịch sử. Mọi thao tác SHALL dùng được bằng bàn phím, và trạng thái streaming, chờ người dùng và lỗi SHALL có nhãn cho trình đọc màn hình.

#### Scenario: Đổi bề mặt
- **WHEN** người dùng viết draft ở panel chương rồi mở màn Trợ lý cùng session
- **THEN** draft và transcript vẫn còn và không gì được gửi tự động

#### Scenario: Người dùng đang đọc lịch sử
- **WHEN** token mới đến trong lúc viewport không ở cuối
- **THEN** scroll không bị cưỡng bức và có nút về nội dung mới

#### Scenario: Chỉ dùng bàn phím và trình đọc màn hình
- **WHEN** người dùng chỉ dùng bàn phím để gửi, mở một dòng tool, duyệt một call và bấm Stop
- **THEN** mọi control nhận focus theo thứ tự đọc, dòng tool và lựa chọn được kích hoạt bằng Enter hoặc Space, và vùng live thông báo đang trả lời, đang chờ người dùng hoặc lỗi

