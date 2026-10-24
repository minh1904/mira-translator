# Kết nối AI

Cập nhật: 2026-10-12 · Trạng thái: **Đã chốt hướng** (mục "Quyết định 2026-10-12", sửa một phần "Quyết định
2026-10-08"); phần giao diện **đã
triển khai** (mục "Đã triển khai"); đăng nhập thuê bao và ba transport **có trong mã**, chưa thử với tài
khoản thật (mục "Đã triển khai (change `subscription-providers`)"). Phần 1–2 là quan sát; phần 3–4 là đề xuất ngày 2026-10-07, đã bị quyết định mới thay ở các
điểm ghi rõ. Chủ trì: chủ sản phẩm, kỹ thuật.

## Câu hỏi chương này trả lời

Người dịch kết nối nhà cung cấp AI, chọn model và đổi model trong lúc chat bằng giao diện nào? Phần nào
của Hermes Desktop nên học theo, phần nào đã có backend để bấm được, và phần nào chỉ dựng giao diện?

## Quyết định 2026-10-12: thuê bao qua TypeScript gốc và gateway tự chạy

Chủ sản phẩm chốt hướng cho người dùng gói thuê bao. Kế hoạch triển khai nằm ở OpenSpec
[`add-subscription-gateway-auth`](../../../openspec/changes/add-subscription-gateway-auth/proposal.md).
**Chưa triển khai.**

- **Đăng nhập trong app bằng TypeScript gốc** (mã thiết bị, chạy ở main):
  - Codex và GitHub Copilot giữ đúng như change `subscription-providers` đã làm;
  - thêm **Kimi Code**, dùng lại `tokenStore`, làm mới một-lần-một-lúc, `FlowPanel` và thẻ
    tài khoản.

  Bộ nhà cung cấp MVP là Codex, Copilot, Kimi. xAI Grok được hoãn ("tạm thời chưa cần xAI").
- **Claude Pro/Max và Antigravity chỉ đi qua gateway CLIProxyAPI do người dùng tự chạy.** Mira không bao
  giờ lưu token của hai loại này. Thẻ ghi "chỉ qua gateway tự chạy, rủi ro khóa tài khoản" và có link
  hướng dẫn dựng gateway.
- **Chế độ gateway hiểu CLIProxyAPI:**
  - nhận diện gateway trên máy (mặc định `http://127.0.0.1:8317`);
  - chỉ quản lý gateway loopback; khóa quản lý lưu bằng `safeStorage`, chỉ gửi tới đúng host đó;
  - đăng nhập qua Management API v8;
  - hạn mức hay usage chỉ hiện khi gateway trả về, còn lại là "không rõ";
  - cảnh báo khi gateway nghe trên mọi giao diện mạng.
- **Không tự chuyển sang API trả tiền hay nhà cung cấp khác.** Hết hạn mức thì dừng, kèm mốc đặt lại.
  Nhiều tài khoản chỉ trong một nhà cung cấp, và người dùng phải tự bật.
- **Không đóng gói CLIProxyAPI làm sidecar ở thời điểm này.** Lý do:
  - file exe thứ hai khoảng 24 MB, không ký số;
  - phát hành hằng tuần;
  - token lưu thành file chữ thường;
  - mặc định bật giả danh client;
  - mặc định nghe trên mọi giao diện mạng.

  Có thể mở lại thành change riêng. Sign in with ChatGPT cho Codex cũng có thể là change sau.
- **Bỏ lát MCP `add-external-translation-worker`.** Git giữ lịch sử.

**Quyết định này sửa "Quyết định 2026-10-08" ở các điểm sau:**

- Dòng "Thẻ Claude của Mira dẫn sang khóa API Anthropic hoặc gateway tự dựng" trong mục Không làm được thay
  bằng thẻ Claude Pro/Max "chỉ qua gateway tự chạy". Mira vẫn không giữ token Claude và không giả danh
  Claude Code.
- Mục "Đăng nhập Google qua Gemini CLI, Antigravity hay Code Assist" vẫn là Không làm **trong Mira**.
  Antigravity chỉ được nhắc tới như một tài khoản nằm trong gateway của người dùng.
- Danh sách đăng nhập trong app mở rộng từ hai (Codex, Copilot) lên ba (thêm Kimi).
- Luật "Chat tự chuyển sang dự phòng" (mục Đã triển khai bên dưới) không áp cho kết nối tài khoản thuê bao
  và gateway CLIProxyAPI. Phần này sửa spec `model-defaults`.

## Quyết định 2026-10-08: cấu hình provider như Hermes

Chủ sản phẩm chốt: **toàn bộ cách cấu hình provider và subscription làm giống Hermes Desktop, trừ Nous
Portal**, kể cả Cài đặt dạng modal. Quyết định này **thay ADR-004** (một adapter, không OAuth
subscription, không preset mang tên CLI subscription) ở các điểm sau:

- **Cài đặt là một modal phủ lên app**, như Hermes: điều hướng dọc, breadcrumb, ô tìm kiếm, tự lưu.
  Nhóm Providers có bốn mục: Tài khoản, Khóa API, Endpoint tùy chỉnh, Trên máy. Nhóm Model có: Model
  chính, Dự phòng và Danh sách model. Thêm onboarding lần đầu.
- **Đăng nhập subscription ngay trong app** cho **ChatGPT/Codex** và **GitHub Copilot**, bằng device code
  như Hermes. Token lưu bằng `safeStorage` ở main process. Hermes để token dạng chữ thường; Mira không
  làm vậy.
- **Mira có nhiều transport.** Ngoài Chat Completions, thêm Responses API cho Codex và header riêng cho
  Copilot.
- **Menu chọn model trong ô chat** như Hermes: tìm kiếm, yêu thích, submenu Thinking/Effort, cùng các mục
  "Dùng mặc định", "Tải lại model", "Thêm model tùy chỉnh", "Sửa danh sách model".

**Rủi ro chủ sản phẩm chấp nhận:** Codex và Copilot đăng nhập bằng client ID của công cụ chính hãng
(Codex CLI, plugin Copilot), giống Hermes. Nhà cung cấp có thể đổi hoặc chặn cách này, và tài khoản người
dùng có thể chịu rủi ro điều khoản. App phải nói rõ điều này ở thẻ đăng nhập.

**Không làm, dù Hermes có:**

- **Dùng gói Claude Pro/Max bằng token của Claude Code.** Hermes không có nút đăng nhập Claude trong app,
  và tự ghi lý do là trái chính sách OAuth của Anthropic. Khi gọi API, Hermes còn giả làm Claude Code (đổi
  user-agent, câu mở đầu system prompt, tên tool) để request không bị tính vào extra usage. Đó là lách cơ
  chế tính phí. Thẻ Claude của Mira dẫn sang khóa API Anthropic hoặc gateway tự dựng.
- **Nous Portal.**
- **Đăng nhập Google qua Gemini CLI, Antigravity hay Code Assist.** Hermes từng có hai provider này, rồi
  gỡ hẳn ngày 2026-06-21 (commit `7130d60861`, #50492). Lý do: Google đang khóa tài khoản dùng OAuth đó
  qua công cụ bên thứ ba. Lệnh khóa có thể lan ra cả tài khoản Google (Gmail, Drive), và vi phạm lần hai là
  khóa vĩnh viễn. Vì vậy "giống Hermes" nghĩa là không có mục này. Gemini vẫn dùng bằng khóa API
  (`generativelanguage.googleapis.com`) như hiện nay.

Phần giao diện được triển khai qua change `hermes-settings-modal`; đăng nhập thuê bao và transport qua
`subscription-providers`. Vòng agent dùng provider và capability theo
[roadmap Trợ lý](../proposals/agent-roadmap.md).

## Đã triển khai (change `hermes-settings-modal`, 2026-10-08)

Trạng thái: **đã có trong mã và lịch sử Git**. Phần 1 bên dưới là snapshot trước change này.

**Modal Cài đặt**
(`src/renderer/src/features/settings/SettingsModal.tsx`)

- Nút bánh răng mở một thẻ phủ lên màn đang xem, không đổi view. Đóng bằng Esc, nút X hoặc bấm ra ngoài.
- Điều hướng dọc 13rem có bốn nhóm:
  - Model: Model chính, Dự phòng, Danh sách model.
  - Kết nối AI: Tài khoản, Khóa API, Endpoint tùy chỉnh, Trên máy.
  - Giao diện.
  - Về Mira.
- Breadcrumb ở đầu trang. Ô tìm nằm vắt trên mép thẻ; gõ một phím chữ ở đâu trong thẻ cũng mở được.
- Link sâu (`openSettings({ group, page, key })`) làm hàng được trỏ tới nhấp sáng 1,6 giây.
- Toast mới: báo thành công hiện ở góc dưới phải và tự tắt sau 5 giây; báo lỗi đứng yên ở giữa trên.

**Khóa API**

- Mỗi provider một thẻ: Gemini, OpenRouter, OpenAI, DeepSeek, Anthropic. Anthropic ghi "Sắp có" cho tới
  change `subscription-providers`, nay đã dùng được.
- Chấm trạng thái trên thẻ sáng khi có ít nhất một khóa dùng được.
- Ô khóa hiện `••••` + 4 ký tự cuối; dán khóa vào thẻ chưa có kết nối thì Mira tạo kết nối từ preset
  (`ai:connections:ensure-with-key`).
- Một provider có nhiều kết nối (ví dụ hai project Gemini) thì thẻ liệt kê tất cả.

**Kiểm endpoint**
(`src/main/services/ai/endpointProbe.ts`)

- Thử `/models`, rồi biến thể thêm hoặc bỏ `/v1`, và lưu base URL nào trả được danh sách.
- Gửi thêm một request chat 1 token. Chỉ HTTP 404, 405, 501 mới bị coi là "không phục vụ API chat".
- Trang HTML hoặc danh sách model rỗng bị báo là URL sai.
- Khóa bị từ chối (401/403) thì dừng ngay, không thử biến thể khác.

**Model chính và dự phòng**

- Lưu ở bảng `meta` của thư viện, khóa `ai.main` và `ai.fallbacks`.
- Xóa một kết nối hay một mục model thì tham chiếu tới nó cũng bị gỡ.
- Thứ tự chọn model cho chat mới, hộp thoại dịch và hàng chờ dịch:
  1. Model chọn riêng cho phiên.
  2. Model chính.
  3. Mục mặc định của kết nối bật đầu tiên.
- Chat tự chuyển sang dự phòng khi gặp các lỗi: hết hạn mức, bị giới hạn tốc độ, model không tồn tại hoặc
  không được phép, mạng lỗi, quá thời gian chờ, phản hồi hỏng. Luật nằm ở
  `src/main/services/ai/fallback.ts`.
- Không chuyển dự phòng khi câu trả lời đã stream được một phần chữ.
- Mỗi lần chuyển, lượt chat ghi một dòng "Đã chuyển sang Y vì X …". Lượt lỗi có thêm nút "Thử bằng Y".
- **Dịch chương không tự chuyển model** (chủ sản phẩm chọn ngày 2026-10-08): mỗi đề xuất dịch gắn một model
  và một chương không nên tự đổi giọng văn. Khi lượt dừng vì lỗi mà chính sách lỗi đánh dấu `fallback`
  (hết hạn mức, giới hạn tốc độ, mạng, quá giờ, phản hồi hỏng), hộp thoại mời **"Dịch tiếp bằng Y"**. Bấm
  thì Mira dịch riêng các đoạn còn thiếu bằng Y, vào một đề xuất mới; các đoạn đã dịch giữ nguyên.

**Menu model**
(`src/renderer/src/features/models/ModelSelectionMenu.tsx`)

- Ô tìm, nhóm Yêu thích, nhóm theo kết nối (thu gọn được), nhãn mức suy luận đang đặt.
- Submenu "Tùy chọn: Suy luận / Mức" chỉ liệt kê những mức model hỗ trợ.
- Bốn lối tắt ở cuối menu. `Ctrl+Shift+M` mở menu khi panel chat đang mở.
- Yêu thích và trạng thái thu gọn nhóm lưu trong `localStorage` của máy.

**Onboarding**
(`src/renderer/src/features/onboarding/`)

- Tự hiện khi thư viện chưa có kết nối nào và người dùng chưa bấm "Để sau". "Để sau" được lưu vào `meta`.
- Các lựa chọn: Gateway tự dựng (nổi bật), "Nhà cung cấp khác", "Tôi có khóa API".
- Khóa kiểm không qua thì bị gỡ ra, rồi hiện ba nút: Thử lại, Dùng khóa API khác, Chọn nhà cung cấp khác.

**Đã kiểm bằng app thật** (bản build trên Windows 11, dữ liệu fixture và một thư mục dữ liệu trống):

- Mở và đóng modal, điều hướng giữa các nhóm.
- Gõ phím để mở tìm kiếm.
- Trang Khóa API, Endpoint tùy chỉnh, Tài khoản.
- Menu model, submenu mức suy luận, phím `Ctrl+Shift+M`.
- Onboarding đến trạng thái lỗi, dùng một khóa Gemini giả.

Chưa chạy hết luồng onboarding tới bước "Bắt đầu", vì cần một khóa thật.

## Đã triển khai (change `subscription-providers`, 2026-10-08)

Trạng thái: **có trong mã và có test**, chỉ chạy với server giả. **Chưa thử với tài khoản thật** (task 7.2):
đăng nhập Codex, dịch một lô, chat có tool; đăng nhập Copilot, chat với một model gpt-5 và một model Claude.
Fixture SSE trong `src/main/infra/providers/transports/__fixtures__/responses` và `anthropic` được soạn tay theo giao
thức. Khi có bản ghi thật thì thay vào.

**Ba transport, một dạng nội bộ**
(`src/main/infra/providers/transports/`)

- `transportShared.ts`: phần dùng chung gồm deadline, hủy, gộp header, chuyển lỗi, `Credential`,
  `CallOptions` và `ChatTransport`.
- `openAiChatTransport.ts`: Chat Completions như trước. Có thêm header theo kết nối (Copilot).
- `responsesTransport.ts`: Responses API. System thành `instructions`. Tin nhắn và lời gọi tool thành các
  mục có kiểu. `call_id` dài hơn 64 ký tự được rút gọn bằng hash. Ký hiệu `<|…|>` được thay. Phần chữ thuộc
  phase `commentary` bị bỏ. Tool mở mà không có `.done` được chốt với `{}`.
- `anthropicTransport.ts`: Anthropic Messages. Có `cache_control` ở system và tool cuối, `max_tokens` luôn
  gửi. Mức suy luận đổi theo họ model:
  - Claude 4.6 trở lên: `adaptive` kèm `output_config.effort`.
  - Claude cũ hơn: ngân sách 4.000 / 8.000 / 16.000 / 32.000, `temperature: 1`, và `max_tokens` không dưới
    ngân sách + 4.096.
  - Haiku: không gửi gì.
- `transportFactory.ts`: chọn transport cho mỗi lượt gọi.
  - Codex luôn dùng Responses.
  - Kết nối Anthropic luôn dùng Messages.
  - Copilot dùng Responses cho `gpt-N` với N ≥ 5 (trừ `gpt-5-mini`), còn lại dùng Chat Completions.
  - Endpoint tùy chỉnh theo chế độ người dùng chọn. "Tự nhận" chọn Messages khi host là `api.anthropic.com`
    hoặc đường dẫn kết thúc bằng `/anthropic`.

Lỗi 401 với tài khoản đăng nhập làm Mira lấy token mới rồi thử lại **một** lần. Copilot cũng thử lại một lần
khi gặp `model_not_available_for_integrator` hoặc `model_not_supported`.

**Tài khoản**
(`src/main/infra/providers/accounts/`, `src/main/services/ai/accountCredentials.ts`, `accountLogins.ts`)

- Đăng nhập bằng mã thiết bị, chạy hết ở main. Renderer hỏi trạng thái mỗi 2 giây. Lỗi mạng khi hỏi lại
  được thử im lặng tối đa 6 lần liên tiếp. Mã Codex hết hạn sau 15 phút; mã Copilot theo GitHub, thêm 3
  giây vào khoảng chờ GitHub cho.
- Trình duyệt chỉ được mở tới `auth.openai.com` và `github.com`.
- Token chỉ lưu dạng mã hóa bằng `safeStorage`, ở bảng `ai_oauth_token` (thư viện v7). Máy không mã hóa
  được thì Mira từ chối lưu. Token không bao giờ về renderer.
- Codex làm mới 120 giây trước `exp`; Copilot đổi lại token Copilot 120 giây trước khi hết hạn. Mỗi tài
  khoản chỉ có một lần làm mới chạy cùng lúc; lời gọi đến sau đợi lần đang chạy. Refresh token mới được ghi
  ngay.
- Làm mới bị từ chối hẳn (`invalid_grant`, `refresh_token_reused`, 401/403; Copilot 401) thì kết nối chuyển
  sang "Cần đăng nhập lại". Mọi lời gọi sau đó báo lỗi ngay, không gọi ra ngoài nữa. Lượt chat lỗi vì lý do
  này có nút "Đăng nhập lại" mở thẳng thẻ. Hộp thoại dịch chỉ báo bằng lời.
- Đăng nhập xong thì Mira tạo kết nối (tối đa một kết nối cho mỗi nhà cung cấp). Model của tài khoản được
  thêm thành mục; không lấy được danh sách thì dùng danh sách dự phòng tĩnh. Sau đó hiện màn chọn model
  chính.
- Hủy giữa lúc đang lưu token thì không lưu gì: Mira kiểm lại trong chính giao dịch ghi token.

**Hằng số và nguồn** (mã Hermes commit `bf871a5943`, đọc ngày 2026-10-08):

| Mục | Giá trị | Nguồn Hermes |
| --- | --- | --- |
| Client ID Codex | `app_EMoamEEZ73f0CkXaXp7hrann` | `hermes_cli/auth_constants.py` |
| Mã thiết bị Codex | `auth.openai.com/api/accounts/deviceauth/usercode`, `…/token` | `web_routers/oauth.py:219-295` |
| Đổi và làm mới token Codex | `auth.openai.com/oauth/token` | `auth_codex.py:443-539` |
| API Codex | `chatgpt.com/backend-api/codex` | `codex_headers.py` |
| Hạn mức Codex | `chatgpt.com/backend-api/wham/usage` | `account_usage.py:316-493` |
| Client ID Copilot | `Iv1.b507a08c87ecfe98`, scope `read:user` | `copilot_auth.py:27-34` |
| Token Copilot | `api.github.com/copilot_internal/v2/token` | `copilot_auth.py:376-511` |
| Header Copilot | `Editor-Version: vscode/1.104.1`, `Copilot-Integration-Id: vscode-chat` | `copilot_auth.py:502-511` |

Mira tự xưng `originator: mira` và `User-Agent: Mira/<phiên bản>` ở mọi chỗ không bắt buộc giả danh. Riêng
hai header Copilot ở trên là của VS Code: thiếu chúng thì Copilot trả 400.

**Hạn mức:** thẻ Codex và nhóm Codex trong menu model có chip "Còn x % · đặt lại …". Chip chỉ hiện khi một
cửa sổ còn dưới 20 % và chuyển màu cảnh báo dưới 10 %. Cửa sổ 18.000 giây là "Phiên", 604.800 giây là
"Tuần". Main lưu đệm 5 phút.

**Anthropic:** thẻ Khóa API › Anthropic đã dùng được. Khóa không bắt đầu bằng `sk-ant-api` bị từ chối.
Token `sk-ant-oat…` được báo là token đăng nhập Claude, không phải khóa API.

**Endpoint tùy chỉnh:** chọn được Tự nhận, Chat Completions, Responses hoặc Anthropic Messages. Nút Kiểm tra
thăm dò đúng route của chế độ đó: `/chat/completions`, `/responses` hoặc `/v1/messages`.

**Lỗi theo nhà cung cấp** (`classifyError.ts`):

- Codex trả 429 `usage_limit_reached`: hết hạn mức, kèm mốc đặt lại nếu thân lỗi có.
- Copilot trả 402, hoặc thông báo về premium request: hết hạn mức.
- Anthropic `overloaded_error` (529): giới hạn tốc độ, thử lại được.

**Rủi ro:**

- `chatgpt.com/backend-api` và `copilot_internal` là API nội bộ, có thể đổi bất kỳ lúc nào. Mọi hằng số
  nằm trong `accounts/codex.ts` và `accounts/copilot.ts`.
- Rủi ro điều khoản đã ghi ở mục "Quyết định 2026-10-08". Thẻ đăng nhập có dòng cảnh báo.

**Cách quay lại bản trước:** migration thư viện v7 chỉ thêm cột và bảng. Revert mã là đủ để app cũ chạy,
nhưng app cũ sẽ thấy kết nối tài khoản như một kết nối khóa API không có khóa. Muốn sạch thì ngắt các tài
khoản trước khi revert.

**Bổ sung 2026-10-14 (task 3.4, 4.4):** mức suy luận của kết nối tài khoản không lấy từ catalog nữa. Codex dùng
thang theo thế hệ model của Hermes (`agent/reasoning_effort.py`, đọc 2026-10-14): không có `minimal`; `max`
từ gpt-5.6 và GPT-6 Sol/Luna; Astra và 6.1 Sol không tắt được. Copilot dùng `supports.reasoning_effort` của
`/models` ở lần liệt kê gần nhất (giữ trong bộ nhớ; sau khi khởi động lại dùng catalog tới lần liệt kê sau).
Mã: `accounts/accountReasoning.ts`; form và bước kiểm trước khi gọi dùng chung thang này.

**Còn cần thử thật (task 7.2 của `subscription-providers`, chuyển ra đây khi archive 2026-10-14).** Cần tài
khoản ChatGPT và Copilot của chủ sản phẩm:

1. Đăng nhập Codex, dịch một lô, chat có tool.
2. Đăng nhập Copilot, chat với một model gpt-5 và một model Claude.
3. Ghi vào mục này: model, usage nhà cung cấp báo, lỗi gặp phải và mức suy luận đã thử.

## Đã triển khai (rà flow theo Hermes, 2026-10-09)

Chi tiết và lý do ở [Rà flow Kết nối AI so với Hermes](hermes-ux-flow-review.md), mục "Trạng thái triển
khai".

- **Dán khóa:** lưu khóa, thử kiểm kết nối và cố thêm model đầu tiên. Với pool nhiều khóa, phép kiểm chưa
  bảo đảm đã dùng đúng khóa vừa thêm; xem các giới hạn bên dưới.
- **Danh sách model:** chuyển sang trang Model › Danh sách model.
- **Thẻ provider:** chỉ còn khóa và một hàng thao tác.
- **Endpoint tùy chỉnh:** thành danh sách cùng một form sửa.
- **Thẻ lỗi:** có nút "Cập nhật khóa".
- **Xóa:** xóa khóa và xóa kết nối đều hỏi xác nhận.
- **Lỗi khi lưu:** hiện thành toast.

**Khoảng trống và rủi ro hiện tại:**

- `connectKey` và Onboarding nhận diện khóa vừa thêm bằng bốn ký tự cuối để rollback. Hai khóa trùng
  suffix hoặc hai lần thêm đồng thời có thể xác định sai khóa; service cần trả ID khóa vừa tạo.
- Phép kiểm kết nối dùng cả pool theo thứ tự, nên một khóa cũ tốt có thể che khóa mới hỏng. Lỗi thêm
  model đầu tiên hiện chưa chặn trạng thái thành công.
- Ô Kích hoạt truyền `providerId`; khi có nhiều connection cùng provider, service có thể thêm khóa vào
  connection đầu tiên thay vì connection đang chọn.
- Luồng thiếu connection chưa thống nhất: chat/dịch mở Cài đặt, menu model mở Onboarding, còn bấm Gửi
  có thể bị vô hiệu. Connection bật nhưng không có model cũng chưa được phân loại nhất quán.

## Đã triển khai (menu model trên ô soạn Trợ lý, 2026-10-14)

Trạng thái: **có trong mã và có test store**; chưa thử bằng tay trong app.

- Ô soạn Trợ lý (`AgentComposer`) có cùng `ModelSelectionMenu` với chat cũ: pill tên model kèm mức suy
  luận, tìm kiếm, yêu thích, submenu mức suy luận, "Dùng mặc định", "Thêm model tùy chỉnh". Phần trạng thái
  của menu tách thành hook `useModelPicker`, chat cũ và Trợ lý dùng chung.
- Model chọn riêng áp cho mọi phiên Trợ lý và chỉ sống trong renderer: khởi động lại app thì về model
  chính.
- Renderer luôn gửi model đã chọn, kể cả khi trả lời câu hỏi đang chờ duyệt. Lý do: khi không nhận model,
  main (`defaultModelSelection`) lấy mục mặc định của kết nối bật đầu tiên mà **bỏ qua model chính**
  `ai.main`, nên pill sẽ hiện sai model đang chạy. Hàng chờ dịch (`taskService`) vẫn gặp khoảng trống này
  khi không truyền model.

## Đã triển khai (model mới từ nhà cung cấp trong menu, 2026-10-14)

Trạng thái: **có trong mã và có test cho phần thuần** (`modelMenuModel.test.ts`); chưa thử bằng tay trong
app, chưa chạy `GET /models` thật của Gemini bằng khóa thật.

**Vấn đề:** menu chỉ hiện các mục model người dùng đã thêm. Danh sách thật của nhà cung cấp chỉ được hỏi
khi mở hộp thoại "Thêm model" trong Cài đặt; tài khoản Codex/Copilot chỉ được đồng bộ một lần lúc đăng nhập
(`syncAccountModels`). Nút "Tải lại model" chỉ đọc lại dữ liệu cục bộ, nên model mới ra không bao giờ hiện.

**Hành vi mới:**

- Mở menu lần đầu trong phiên thì Mira hỏi `GET /models` của mọi kết nối đang bật (dùng lại `store.test`,
  không thêm kênh IPC). Lỗi hỏi không hiện trong menu; kết nối đó chỉ không có gợi ý. "Tải lại model" hỏi
  lại tất cả kết nối đang bật và quay khi đang chạy.
- Cuối mỗi nhóm kết nối có nhóm **"Có thể thêm · N"**: model nhà cung cấp liệt kê mà kết nối chưa có mục.
  Bấm (hoặc Enter) thì thêm mục với cài đặt trống và chọn luôn, cùng đường với "Thêm model tùy chỉnh".
  Khi chưa tìm kiếm chỉ hiện 5 model mới nhất của mỗi nhóm; gõ vào ô tìm kiếm để thấy hết.
- Gợi ý bỏ: model đã có mục, model nhà cung cấp đánh dấu `deprecated`, và model không dùng để chat đoán theo
  tên (embedding, tts, imagen, veo, image, audio, live, realtime, transcribe, whisper, moderation, dall-e,
  sora, rerank, aqa). Thứ tự "mới nhất" là so sánh số trong tên giảm dần, không phải ngày phát hành.

**Quyết định lệch so với đề xuất ban đầu:** tài khoản Codex/Copilot cũng đi qua nhóm "Có thể thêm" thay vì
tự thêm lại bằng `syncAccountModels` khi tải lại. Lý do: tự thêm sẽ hồi sinh những mục người dùng đã xóa
có chủ ý.

**Giới hạn đã biết:**

- Bộ lọc đoán theo tên: nhà cung cấp đặt tên lạ thì lọt rác hoặc mất model; còn "Thêm model tùy chỉnh".
- OpenRouter và gateway trả hàng trăm model; "5 mới nhất" theo thứ tự chữ cái giảm dần có thể không hữu
  ích, phải tìm kiếm.
- Chỉ ô soạn chat cũ và ô soạn Trợ lý có gợi ý. Hộp thoại dịch và Onboarding dùng cùng menu nhưng chưa
  truyền `suggestions`.
- Mở menu bằng phím tắt `Ctrl+Shift+M` không kích hoạt lần hỏi đầu tiên (chỉ lần mở bằng chuột/phím trên
  pill); "Tải lại model" vẫn chạy.

## Đã triển khai (bộ nhớ phiên Trợ lý và Model phụ, change `add-agent-session-memory`, 2026-10-23)

Trạng thái: **có trong mã và có test**; chưa thử bằng tay trong app (task 6.3 của change).

- **Lịch sử đầy đủ:** turn cũ của phiên được dựng lại với dòng ngữ cảnh, các vòng tool và câu trả lời (dùng lại
  `roundMessages`), không còn chỉ `{ instruction, answer }`. Handle `ctx…`/`t…` của lượt cũ được thay bằng nhãn
  đích vì handle chỉ có nghĩa trong lượt sinh ra nó; `extra_content` của provider bị bỏ.
- **Rút gọn theo thứ tự** (`assembleTurnContext`): vượt 50% giới hạn context thì lược kết quả tool > 2.000 ký tự từ
  turn cũ nhất (ba turn gần nhất giữ nguyên); vẫn vượt thì yêu cầu tóm tắt; tóm tắt lỗi thì cắt turn cũ nhất như
  trước. Giới hạn cứng giữ nguyên.
- **Bản tóm tắt** lưu ở bảng `agent_session_summary` (schema thư viện v18), một bản mỗi phiên, dồn dần. Revert một
  turn đã được tóm tắt thì bản tóm tắt bị xóa khi đọc. Khi chèn vào prompt nó được đánh dấu "chỉ để tham khảo".
- **Model phụ** (`ai.auxiliary` trong `meta`, Cài đặt › Model › Model phụ): chạy việc tóm tắt, lỗi thì thử model
  của lượt. Chưa chọn thì dùng model của lượt. Không có mức suy luận riêng.
- Phần tử `progress` "Bỏ N lượt cũ…" trong transcript đã bỏ; thay bằng activity `compaction` ghi số liệu.

**Giới hạn đã biết:** vẫn ước lượng 2 ký tự/token; không tóm tắt bên trong một turn đang chạy; test component
Model phụ chỉ kiểm trạng thái "chưa chọn" vì render tĩnh đọc state khởi tạo của store.

**Quan sát Hermes** (`agent/context_compressor.py`, đã mô tả ở
[mục 3d](hermes-runtime-research.md#3d-tóm-tắt-các-quyết-định-thay-vì-bỏ-lượt-cũ)): Hermes lược kết quả tool
trước rồi mới tóm tắt có cấu trúc, cập nhật dần, bọc bằng `SUMMARY_PREFIX`. Mira lấy đúng thứ tự đó và lời dặn
"chỉ tham khảo"; khác ở chỗ bản tóm tắt gắn với danh sách turn đã phủ để revert vô hiệu hóa được.

## Đã triển khai (subagent chạy bằng Model phụ, change `route-subagent-to-auxiliary-model`, 2026-10-23)

Trạng thái: **có trong mã và có test**.

- `run_subagent` chạy bằng Model phụ khi đã đặt, mở được và catalog không ghi `toolCall: false`; ngược lại chạy
  bằng model của lượt. Model phụ lỗi trước khi subagent lưu call nào thì chạy lại từ đầu bằng model của lượt; lỗi
  sau đó làm call cha thất bại để không lưu call con hai lần. Kết quả call cha ghi nhãn model đã chạy (`model`).
- Usage của mọi vòng subagent được cộng vào lượt (trước đây bị bỏ).
- **Sửa chi phí lượt:** trước đây mọi usage của lượt, kể cả lời gọi tóm tắt bằng Model phụ, bị tính theo giá model
  của lượt. Nay usage được gộp theo model đã sinh ra nó rồi tính theo giá của model đó (`sumTurnCost`). Gộp trước
  khi tính vì chi phí một lần tính được làm tròn tới 0,0001 USD.
- Chọn model nền dùng chung cho tóm tắt và subagent (`backgroundModels`).

## Đã triển khai (chặn vòng rỗng và lặp văn bản, change `add-agent-empty-reply-guard`, 2026-10-23)

Trạng thái: **có trong mã và có test** (`services/agent/roundGuards.ts`, `agentService.guards.test.ts`).

- **Vòng rỗng** (không chữ, không tool call, không bị bộ lọc chặn; chỉ có suy luận vẫn là rỗng): gửi lại nguyên
  request tới cùng model, tối đa 2 lần mỗi vòng, 3 lần mỗi lượt; dừng sớm khi hai lần liên tiếp đều báo 0 token
  output. Lần thử không tính vào budget vòng, không lưu phần tử, usage vẫn cộng vào lượt, activity loại `retry`.
  Không chuyển model dự phòng: agent chat không dùng chuỗi dự phòng (requirement "Model và khả năng gọi tool").
- **Lặp văn bản:** khi chữ hoặc suy luận của vòng ≥ 2.000 ký tự (kiểm mỗi 500 ký tự mới) kết thúc bằng một đoạn
  ≥ 60 ký tự lặp liên tiếp nguyên văn phủ quá nửa, request bị hủy bằng controller riêng của vòng, văn bản cắt trước
  bản lặp thứ hai, tool call của vòng không chạy và lượt dừng mềm (`completed`, "Lượt dừng vì chạm giới hạn",
  **Tiếp tục**). Không gửi vòng cuối không tool vì model đang lặp thường lặp tiếp.
- Subagent dùng cùng hai luật; lặp thì kết thúc với `stopped`.

**Nguồn Hermes:** `agent/empty_response_guard.py` (thử lại 3 lần, rỗng tất định khi hai lần cùng 0 token output,
rồi đi chuỗi dự phòng; Mira không lấy phần dự phòng), `agent/repetition_guard.py` (chỉ bắt lặp nguyên văn dài 60+
ký tự phủ đa số đoạn).

**Giới hạn đã biết:** stream bị hủy vì lặp thường không có usage, nên chi phí của vòng đó có thể thiếu trong tổng.

## Đã triển khai (danh sách bước `todo_list`, change `add-agent-todo-list`, 2026-10-23)

Trạng thái: **có trong mã và có test**; chưa thử bằng tay trong app (task 5.3 của change).

- Capability `todo_list` (`kind: 'read'`, không target, có ở Ask và Agent, không có ở subagent): gửi `todos` thì
  ghi đè cả danh sách, bỏ `todos` thì đọc, danh sách rỗng thì xóa. Tối đa 20 bước × 200 ký tự, trạng thái
  `pending`/`in_progress`/`completed`/`cancelled` (`shared/contracts/agentTodo.ts`).
- Không có bảng riêng: danh sách hiện tại của phiên là `todos` của lần ghi thành công mới nhất trong các lượt chưa
  revert (`AgentService.latestTodos`), nên revert, mở lại app và nhiều cửa sổ tự đúng.
- Lượt ghi danh sách đã bị tóm tắt hoặc cắt thì danh sách được chèn lại ngay sau system/bản tóm tắt
  (`todoBlock` trong `turnContext.ts`), tính vào ngưỡng lịch sử khi lượt đó đã được tóm tắt.
- Transcript: các call `todo_list` thành công của một lượt gộp thành một thẻ `TodoCard` ở vị trí lần ghi đầu, nội
  dung theo lần ghi cuối (`turnItems`); call lỗi vẫn là dòng tool. Trạng thái có icon, chữ cho trình đọc màn hình
  và kiểu chữ (đậm, gạch ngang), không chỉ dựa vào màu.
- `SYSTEM_PROMPT` dặn ghi danh sách cho việc từ ba bước, một bước `in_progress`, xóa khi đổi việc.

**Quan sát Hermes** (`tools/todo_tool.py`): một tool ghi/đọc toàn bộ danh sách, chèn lại sau nén. Mira giới hạn
nhỏ hơn nhiều (Hermes 256 × 4.000) và không lưu trạng thái riêng ngoài tool call.

## Đã triển khai (tin gửi thêm khi lượt đang chạy, change `add-agent-turn-steering`, 2026-10-23)

Trạng thái: **có trong mã và có test**; chưa thử bằng tay trong app (task 5.3 của change).

- **Lưu trữ:** schema thư viện v19 thêm bảng `agent_turn_steer` (hàng đợi: `pending` → `delivered` / `withdrawn`
  / `returned` / `forwarded`) và dựng lại `agent_turn_part` để có loại phần tử `steer`. Gửi lại cùng
  `client_command_id` không tạo tin trùng; tối đa 5 tin chờ mỗi lượt.
- **Điểm chèn:** sau khi mọi call của một vòng có kết quả (và sau call vừa duyệt khi lượt chạy tiếp), trước lời gọi
  model kế tiếp. Các tin chờ thành `delivered` và phần tử `steer` trong một transaction. Prompt dựng message từ
  phần tử `steer`: một message `user` có nhãn `[Người dùng gửi thêm khi lượt đang chạy]` sau kết quả tool của vòng
  đó, nên vòng sau, lượt chạy tiếp và lịch sử ở lượt sau (cả dạng văn bản cho model không có tool) cùng một nguồn.
  Lượt đang bị Dừng thì không chèn.
- **Kết thúc lượt còn tin chờ:** `completed` thì tạo ngay lượt mới (cùng chế độ, mức quyền, ngữ cảnh) trước mọi
  `await` rồi chạy nó; mọi trạng thái kết thúc khác (kể cả `waiting_user` và `interrupted` khi mở lại app) trả tin
  về `returned` ngay trong `AgentRepository.transitionTurn`.
- **Policy:** chữ của tin đã chèn được nối vào instruction khi xét đích "do người dùng nêu".
- **IPC:** `agent:turn:steer`, `agent:turn:withdraw-steer`, event `agent:steer:changed` tới mọi cửa sổ; snapshot
  phiên có `steers`. Lệch design D4: lỗi "lượt không chạy", "đủ 5 tin" và "đã chèn" đi bằng mã `conflict` có thông
  điệp riêng, vì `ErrorCode` của IPC là tập cố định.
- **Renderer:** khi lượt chạy, Enter gửi tin chen ngang; nút Gửi hiện trước Dừng khi có chữ; +, chế độ và model bị
  tắt. Tin chờ (X để rút) và tin trả lại (Gửi/Bỏ; Gửi khi có lượt chờ trả lời thì chỉ đưa chữ vào ô) nằm phía trên ô
  nhập. Phần tử `steer` hiện như lời người dùng với nhãn "Gửi thêm khi đang chạy".

**Quan sát Hermes** (`agent/agent_runtime_helpers.py`, `apply_pending_steer_to_tool_results`): chèn steer thành
message `user` riêng có nhãn ngay sau kết quả tool. Mira giữ cách đó và thêm hàng đợi bền, rút lại được.

## 1. Snapshot Mira trước các change (quan sát mã, 2026-10-07)

**Kết nối:**

- Một adapter OpenAI-compatible duy nhất (`src/main/infra/providers/openAiCompatible.ts`), với gateway có
  hàng khóa, giới hạn tốc độ và retry.
- Bảy preset chỉ là dữ liệu (`src/shared/contracts/aiConnections.ts`): gateway tự dựng ở `127.0.0.1:8317`,
  Google Gemini, OpenRouter, OpenAI, DeepSeek, Ollama và LM Studio.
- Mỗi kết nối có nhiều khóa và nhiều **mục model**. Một mục model gồm model cùng các cài đặt của nó.

**Khóa API:**

- Lưu trong SQLite của thư viện, mã hóa bằng Electron `safeStorage`. Nếu máy không mã hóa được thì từ chối
  lưu, không bao giờ ghi khóa dạng chữ thường.
- Renderer chỉ nhận lại 4 ký tự cuối của khóa.

**Giao diện:**

- Cài đặt → "Kết nối AI": menu "+ Thêm kết nối" theo preset và danh sách `ConnectionCard`
  (`src/renderer/src/features/settings/`).
- Các hộp thoại model nằm ở `src/renderer/src/features/models/`.
- `ModelSelectionMenu.tsx` là menu chọn kết nối → mục → mức suy luận. Ô chat và hộp thoại dịch dùng chung
  menu này.

**Giá model:** có sẵn bảng giá `modelCatalog.json`, chụp từ models.dev.

**Không có:**

- Đăng nhập bằng gói thuê bao (subscription).
- Màn onboarding.
- Ô tìm kiếm model và danh sách model yêu thích.
- Chip hạn mức.

ADR-004 (handbook cũ, commit `501be2a`) và spec của change `ai-connection` (đã lưu trữ ngày 2026-10-02)
quyết định:

- Một adapter duy nhất.
- **Không có OAuth subscription.**
- **Không có preset mang tên công cụ CLI subscription.**

## 2. Hermes Desktop làm thế nào (quan sát mã, commit `bf871a5943`, 2026-10-07)

Đường dẫn tính từ gốc `D:\personal\hermes-agent`.

**Kiến trúc.**

- Renderer không tự chạy OAuth và không giữ token của nhà cung cấp.
- Mọi luồng đăng nhập chạy trong backend Python (`hermes_cli/web_routers/oauth.py`).
- Renderer gọi REST qua IPC `hermes:api` và mở trình duyệt qua `hermes:openExternal`.
- Token lưu ở `~/.hermes/auth.json`, quyền 0600, **không mã hóa**.

**Onboarding** (`apps/desktop/src/components/onboarding/`):

- Lớp phủ toàn màn hình với một thẻ ở giữa rộng 45rem.
- Bố cục từ trên xuống:
  - một dòng nổi bật "Recommended" (Nous Portal);
  - nút mở "Other providers" liệt kê các tài khoản OAuth và vài dòng khóa API;
  - dưới cùng là "I'll choose a provider later" và "I have an API key".
- Mỗi dòng ghi cách đăng nhập:

  | Cách đăng nhập | Dòng phụ hiển thị |
  | --- | --- |
  | device code | Mở trang xác minh trên trình duyệt, Hermes tự kết nối |
  | CLI ngoài | Đăng nhập một lần trong terminal rồi quay lại |

- Form khóa API là lưới thẻ hai cột: chọn thẻ, dán khóa, có link "Get a key". Khóa không được kiểm tra
  trước khi lưu.

**Máy trạng thái đăng nhập** (`apps/desktop/src/store/onboarding.ts:32-54`):

| Trạng thái | Giao diện |
| --- | --- |
| `starting` | Spinner |
| `polling` | Mã device hiện như ô OTP, bấm để sao chép; link mở lại trang xác minh; "Waiting for you to authorize…"; nút Hủy |
| `external_pending` | Lệnh CLI trong khối code kèm nút Copy, và nút "I've signed in" |
| `confirming_model` | Tên model mặc định, giá vào/ra, nút "Change", nút "Begin" |
| `error` | Thông báo, Details thu gọn, "Try again" / "Use an API key" / "Pick a different provider" |

**Cài đặt → Providers** (`apps/desktop/src/app/settings/providers-settings.tsx`) có bốn tab:

- **Accounts:** nhóm "Connected" với huy hiệu ✓ và nút Disconnect, cùng nút mở "Connect another provider".
- **Keys:** ô tìm kiếm và các dòng khóa mở rộng được.
- **Custom endpoints.**
- **Local.**

**Đổi model trong ô chat** (`apps/desktop/src/app/chat/composer/model-pill.tsx`,
`apps/desktop/src/app/shell/model-catalog-menu.tsx`):

- Pill ghost hiện tên model ▾ và mở menu rộng 18rem lên phía trên.
- Đầu menu là ô "Search models", điều khiển bằng mũi tên và Enter; Shift+Enter đánh dấu yêu thích.
- Nhóm "Favorites" đứng đầu, sau đó là nhóm theo provider, thu gọn được và có chip hạn mức.
- Mỗi dòng model:
  - sao yêu thích, tên, giá ("free" hoặc `$vào/$ra`), huy hiệu "resets HH:MM";
  - submenu mức suy luận.
- Cuối menu: "Refresh models", "Edit models…", "Add custom model…".
- Hộp thoại đầy đủ "Switch model" có ô lọc và nút "Add provider".
- Phím tắt `mod+shift+m`.

**Chip hạn mức** (`apps/desktop/src/components/provider-status-chip.tsx`):

- Chỉ hiện khi phần còn lại dưới 20 %, chuyển màu cảnh báo khi dưới 10 %, có thanh mảnh hiển thị phần còn
  lại.
- Dữ liệu đọc từ endpoint usage của từng nhà cung cấp, ví dụ OpenRouter `/credits` và `/key`.

**Subscription.**

- **ChatGPT/Codex:** dùng luồng device code của OpenAI với client ID của Codex CLI, gọi
  `chatgpt.com/backend-api/codex`.
- **Claude Pro/Max:**
  - Desktop **không** có nút đăng nhập trong app. Hermes ghi rõ lý do: một nút như vậy sẽ trái chính
    sách OAuth của Anthropic.
  - Đường dùng được là chạy lệnh CLI.
  - Khi gọi API, Hermes giả làm Claude Code: user-agent `claude-code/…`, câu mở đầu system prompt "You are
    Claude Code…", và đổi tên tool. Mục đích là để request không bị tính vào "extra usage".

## 3. Đề xuất cho Mira

> **Đã cũ.** Quyết định 2026-10-08 ở đầu chương thay mục này: ADR-004 không còn hiệu lực, và trang Tài
> khoản đã có luồng đăng nhập thật.

**Quyết định của chủ sản phẩm, 2026-10-07.** Dựng giao diện theo Hermes trước. Phần nào Mira đã có
backend thì bấm được; phần chưa có backend chỉ hiện giao diện. ADR-004 vẫn còn hiệu lực: change này
**không** thêm luồng OAuth.

| Màn / phần | Theo Hermes | Trạng thái trong Mira |
| --- | --- | --- |
| Onboarding lần đầu | Thẻ giữa màn, dòng nổi bật, "Nhà cung cấp khác", "Để sau", "Tôi có khóa API" | **Bấm được**: tạo kết nối từ preset bằng `ai:connections:create` |
| Form khóa API | Lưới thẻ preset, ô dán khóa, link lấy khóa, Xóa / Kết nối | **Bấm được**: thêm khóa và kiểm tra kết nối đều đã có IPC |
| Màn chọn model mặc định sau khi kết nối | Tên model, giá vào/ra lấy từ `modelCatalog.json`, "Đổi", "Bắt đầu" | **Bấm được** |
| Cài đặt → Kết nối AI | Bốn nhóm: Tài khoản, Khóa API, Endpoint tùy chỉnh (gateway), Trên máy (Ollama, LM Studio) | Khóa API, Endpoint và Trên máy **bấm được**; Tài khoản **chỉ giao diện** |
| Thẻ tài khoản subscription | Dòng provider và nhãn cách đăng nhập | **Chỉ giao diện**: huy hiệu "Chưa hỗ trợ", nút bị khóa, giải thích dùng gateway tự dựng hoặc khóa API |
| Các trạng thái đăng nhập (`polling`, `external_pending`…) | Như Hermes | **Chưa làm**: không có luồng nào dùng tới |
| Pill model trong ô chat và menu tìm kiếm | Tìm kiếm, yêu thích, giá, submenu mức suy luận, phím tắt `mod+shift+m` | **Bấm được**: viết lại `ModelSelectionMenu`; danh sách yêu thích lưu ở renderer |
| Chip hạn mức | Thanh phần trăm còn lại | **Chỉ giao diện**; OpenRouter `/credits` có thể nối sau |

**Không làm:**

- **Giả danh Claude Code để dùng gói Claude Pro/Max.** Mượn danh tính của client khác để lách cách tính phí
  là trái điều khoản của Anthropic, và rủi ro bị khóa tài khoản rơi vào người dùng.
- **Lưu token dạng không mã hóa như Hermes.** Mira giữ `safeStorage`.

## 4. Câu hỏi còn mở

> **Đã cũ.** Quyết định 2026-10-08 ở đầu chương đã trả lời cả hai câu hỏi dưới đây.

1. **Thẻ subscription.** Có hiện thẻ "Chưa hỗ trợ" cho ChatGPT/Codex, Claude, GitHub Copilot không?
   - Hiện thì sát Hermes, nhưng trông như một lời hứa sẽ làm.
   - Đề xuất: hiện. Thẻ Claude ghi rõ "Dùng khóa API Anthropic hoặc gateway tự dựng".
2. **OAuth ChatGPT/Codex.** Nếu sau này muốn đăng nhập ChatGPT/Codex trong app thì cần một quyết định mới thay
   ADR-004 và một bản đánh giá điều khoản riêng, vì luồng này dùng client ID của Codex CLI.

---

[Cài đặt và lớp provider của Hermes](hermes-settings-and-adapters.md) ·
[Rà flow Kết nối AI so với Hermes](hermes-ux-flow-review.md) ·
[Học thêm từ Hermes: lõi gọi model, dữ liệu, vỏ app](hermes-runtime-research.md) · [Đẩy request song song an toàn](parallel-requests.md) · [Mục lục module](../README.md) ·
[Roadmap Trợ lý](../proposals/agent-roadmap.md) ·
[Design system theo Hermes](../design-system/hermes-comparison.md)
