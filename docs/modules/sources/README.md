# Nguồn và cập nhật

Cập nhật: 2026-10-24 · Trạng thái: **Đã triển khai folder/file, Kakuyomu URL, manual catalog sync và tải chương theo yêu cầu (từng chương hoặc theo dải); đã chốt mở rộng adapter Nhật kèm R18, chưa triển khai** · Chủ trì: chủ sản phẩm.

Module này quản lý nguồn raw của tác phẩm (thư mục, tệp đơn, website/API tương lai), theo dõi danh mục chương, phát hiện chương mới hoặc raw thay đổi, và điều hướng các sự kiện cập nhật trên trang **Cập nhật** và chi tiết tác phẩm.

## Hiện trạng triển khai (Implementation Status)

- **Hệ thống nguồn cốt lõi (Source System Foundation):**
  - **Source Registry & Builtin Adapters:** Hỗ trợ nguồn thư mục cục bộ (`mira.folder`) và tệp văn bản đơn (`mira.single-file`), chuẩn hóa tên chương, trật tự, hash sha-256 (`contentHash`, `payloadHash`) và đường dẫn an toàn (chống path traversal và chặn symlink trỏ ra ngoài).
  - **Storage & Schema:** Migration v8 cho thư viện (bảng `source_adapter_install`, `source_auth_profile`) và v12 cho tác phẩm (bảng `source_binding`, `source_catalog_item`, `source_sync_run`, `source_update_event`), bảo đảm toàn vẹn dữ liệu và phân biệt binding theo ID độc lập.
  - **Catalog Diff & Đồng bộ không phá hủy:** Thuật toán so khớp danh mục xác định chính xác các loại sự kiện (`added`, `renamed`, `moved`, `access_changed`, `missing_remote`, `reappeared`). Sự kiện `missing_remote` chỉ được xác nhận sau **3 snapshot hợp lệ và đầy đủ liên tiếp**; tuyệt đối không xóa dữ liệu hàng catalog, chương, nội dung gốc hay bản dịch.
  - **IPC & Bảo mật:** Toàn bộ kênh IPC nguồn được xác thực người gửi tin cậy (`guardHandlers`), mật khẩu/token xác thực được mã hóa an toàn qua `SecretCrypto` và không bao giờ lộ ra renderer.
  - **UI Nguồn & Bản raw:**
    - Màn hình **Nguồn nội dung** cấp app (`SourcesScreen`) với các tab Khám phá / Đã kết nối / Tình trạng, hỗ trợ lọc theo quốc gia Trung Quốc (CN) / Nhật Bản (JP) / Hàn Quốc (KR) / Khác và tìm kiếm.
    - Khu vực **Bản raw** thật trong chi tiết tác phẩm (`SourcesArea`) hiển thị từng binding, vai trò (chính / đối chiếu), tiến độ ghép chương và nút kiểm tra cập nhật thủ công. Wizard thêm bản raw (`AddRawDialog`) hỗ trợ 3 tab: Theo dõi thư mục, Tệp văn bản đơn và URL nguồn mạng.
    - Với binding Kakuyomu, nút **Danh mục chương** mở danh sách đã đồng bộ; **Tải chương** chỉ lấy chương người dùng chọn, tạo chương Mira và lưu nội dung vào phía raw. Chương đã tải được đánh dấu và endpoint từ chối tải đè.
    - Màn hình **Cập nhật** thật (`UpdatesScreen`) hiển thị feed sự kiện theo thời gian, lọc theo loại biến động, đánh dấu đã đọc và xem trước diff trước khi áp dụng.

- **Adapter Nhật mở rộng (change `network-adapters-jp-narou`, 2026-10-24):**
  - IPC identify/preview/create không còn viết cứng Kakuyomu: mọi nguồn mạng đăng ký trong
    `NETWORK_SOURCES` (`src/main/sources/networkSources.ts`) với `identify` offline và `canonicalUrl`.
  - Tạo bản raw từ URL lưu luôn danh mục đã xem trước trong cùng transaction, không sinh sự kiện cập nhật.
  - `SourceDownloadService`: khóa theo chương và theo binding, nút **Hủy tải**, tổng kết (đã tải / bỏ qua /
    rỗng / lỗi kèm tên chương), nghỉ 5 s sau mỗi 10 chương với Syosetu, なろう R18, Akatsuki; dừng cả tác vụ
    khi nguồn trả 429/5xx hoặc cần xác nhận tuổi.
  - **Syosetu** (`mira.jp.syosetu`) và **なろう R18** (`mira.jp.syosetu.r18`): metadata và dấu cập nhật
    (`general_all_no|general_lastup`) qua API chính thức; mục lục HTML phân trang (100 tập/trang), giữ tên
    phần; so số tập với API để đánh dấu snapshot đầy đủ; truyện ngắn là một mục `1`; nội dung nối lời đầu,
    thân, lời cuối bằng `＊＊＊`. Kiểm tra cập nhật bỏ qua mục lục khi dấu không đổi và báo API có thể trễ
    khoảng 2 giờ; mục **Kiểm tra kỹ** luôn đọc lại mục lục. R18 hiện tên site Nocturne/Moonlight/Midnight.
  - **Akatsuki** (`mira.jp.akatsuki`): metadata, mục lục 20 tập/trang theo dòng `Page x of y ... out of n
    total` (tối đa 200 trang), báo không công khai khi gặp thông báo của site.
  - **R18:** xác nhận đủ 18 tuổi một lần trong `AddRawDialog`, lưu ở bảng `meta` của library (không vào
    `.mira`), thu hồi ở **Cài đặt › Nguồn truyện**. Khi chưa xác nhận, broker từ chối mọi request của nguồn
    R18, kể cả API; Akatsuki tính là nguồn R18 vì trộn truyện người lớn trên cùng origin. Cookie tuổi cố
    định (`over18=yes`, `CakeCookie[ALLOWED_ADULT_NOVEL]=on`) chỉ gắn cho đúng origin.
  - Đã kiểm trực tiếp ngày 2026-10-24 bằng parser trên HTML thật: Syosetu `n9669bk` (286 tập, 3 trang),
    truyện ngắn `n2839il`, R18 `n9598df` (302 về trang xác nhận tuổi khi thiếu cookie, 200 khi có);
    Akatsuki `2109` (2370 tập, 119 trang) và `103` (294 tập một trang). Chưa chạy thử luồng đầy đủ trong
    app (task 8.1).

- **Hạ tầng Network Broker & Adapter Kakuyomu:**
  - **Network Broker:** Chỉ cho phép HTTPS exact origin trong policy; resolve và kiểm tra toàn bộ DNS answer rồi ghim lookup vào Undici Agent, kiểm tra lại từng redirect, giới hạn body/timeout và giãn cách request tối thiểu 1 giây. Không gửi credential hoặc cookie.
  - **Kakuyomu Parser (Fixture-First):** Phân tích `__NEXT_DATA__` nhúng Apollo state, sử dụng stable `Episode.id`, trật tự duyệt xác định, fail-closed khi phát hiện schema drift; trích xuất nội dung bằng `parse5` không eval/script, chuẩn hóa ruby và khoảng cách đoạn văn bản có versioning và SHA-256 hash.
  - **Giới hạn đồng bộ:** Quá trình kiểm tra danh mục (catalog sync) tuyệt đối **không tải nội dung chương**, không tạo chương mới trong DB, không ghi đè `chapter_text` và không tạo tác vụ dịch.

## Release Gate Kakuyomu (`mira.jp.kakuyomu`) — đã gỡ 2026-10-24

Release gate (`releaseGate`, `allowUnreleased`) đã bị gỡ khỏi code theo quyết định ngày 2026-10-24; phần
dưới là lịch sử. Trạng thái trước khi gỡ: **`open`** cho Kakuyomu. Chủ sản phẩm đã yêu cầu bật ngày 2026-10-11; preview/catalog chỉ gửi GET tuần tự khi người dùng chủ động thao tác, không tải hàng loạt nội dung chương.

Trong môi trường production, `SourceRegistry` không quảng bá các capability khả dụng của Kakuyomu khi release gate đang đóng (capabilities trả về mảng rỗng). Môi trường kiểm thử có thể bật rõ ràng qua tùy chọn cấu hình test (`allowUnreleased: true`).

### Bằng chứng phát hành

- Smoke test live qua chính `NetworkBroker` trên URL `https://kakuyomu.jp/works/16817330652291194063` đạt `PASS` ở identify, reachability, metadata, catalog (1360 chương) và chapter ngày 2026-10-11.
- Chủ sản phẩm đã yêu cầu bật adapter ngày 2026-10-11.
- Kakuyomu có thể hạn chế truy cập khi tải quá mức; ToS không nói rõ việc dùng crawler. Mira giới hạn truy cập theo thao tác người dùng và không tải toàn bộ nội dung chương. Đây không phải kết luận pháp lý.

### Nghiên cứu ToS và trạng thái phát hành (2026-10-11)

- Điều khoản chính thức, mục 5, cho phép Kakuyomu hạn chế hoặc chặn truy cập khi có tải quá mức; trang trợ giúp cũng nêu các đợt truy cập lớn trong thời gian ngắn có thể bị chặn.
- Mục 12 giới hạn sao chép và sử dụng dữ liệu ngoài phạm vi sử dụng cá nhân nếu chưa được cho phép. Điều khoản và hướng dẫn đã xem không nêu rõ quyền dùng crawler hoặc quyền tự động tải tác phẩm; đây là quan sát nghiên cứu, không phải kết luận pháp lý.
- Smoke test cho URL `https://kakuyomu.jp/works/16817330652291194063` qua broker: cả năm giai đoạn đạt `PASS`; catalog gồm 1360 chương. Smoke chỉ tính hash chương, không lưu nội dung chương.
- Parser theo cấu trúc `tableOfContentsV2` dạng mảng và `episodeUnions`; broker request thật, DNS lookup được ghim, redirect/body/timeout được giới hạn.
  - Trong app, URL hỗ trợ nhận diện, xem trước, tạo binding, đồng bộ catalog thủ công và tải từng chương hoặc theo dải (ví dụ `1-10`) qua nút **Danh mục chương** trong thẻ Bản raw. Tải theo dải chưa có khóa chống trùng và chưa hủy được.
- Nguồn: [Điều khoản dịch vụ Kakuyomu](https://kakuyomu.jp/legal/tos), [Hướng dẫn Kakuyomu](https://kakuyomu.jp/legal/guideline), [Trợ giúp về chặn truy cập](https://kakuyomu.jp/help/entry/new_arrival).

*Lưu ý:* Kakuyomu có thể đổi HTML, schema hoặc chặn request; khi đó preview/sync sẽ báo lỗi và cần cập nhật adapter. Quyền truy cập tự động không được Kakuyomu xác nhận rõ trong tài liệu đã xem.

## Quyết định mở rộng adapter Nhật (2026-10-24)

Quyết định của chủ sản phẩm, thay cho "Quyết định loại trừ Syosetu" ngày 2026-10-11:

- Bổ sung adapter cho các site Nhật mà [narou](https://github.com/whiteleaf7/narou) hỗ trợ: Syosetu
  (`ncode.syosetu.com`), なろう R18 (`novel18.syosetu.com`) và Akatsuki (`www.akatsuki-novels.com`). Định
  nghĩa site của narou và fork [narou-mod](https://github.com/ponponusa/narou-mod) dùng làm tham chiếu
  selector, không chép cơ chế regex YAML. OpenSpec: `network-adapters-jp-narou`.
- **Hameln tách sang change sau:** kiểm tra ngày 2026-10-24, `syosetu.org` đứng sau Cloudflare và trả 403
  cho client không phải trình duyệt; truyện R18 chuyển sang `h.syosetu.org`. Cần tải qua Chromium của
  Electron và mở cửa sổ để người dùng tự qua bước kiểm tra; không vượt tự động.
- **Bỏ Arcadia:** `www.mai-net.net` chỉ phục vụ HTTP, broker chỉ cho HTTPS.
- **Bỏ yêu cầu** mỗi adapter phải có nghiên cứu ToS, smoke test live và release gate riêng trước khi bật.
  Adapter mới bật mặc định; fixture test vẫn bắt buộc vì parser phải fail-closed khi HTML đổi.
- **Hỗ trợ truyện R18.** Broker được phép gửi cookie xác nhận tuổi cố định do adapter khai báo (ví dụ
  `over18=yes`); đây không phải credential người dùng. Trạng thái: đề xuất, chưa triển khai.
- Vẫn giữ: chỉ tải khi người dùng thao tác, giãn cách request theo từng nguồn và dừng khi nguồn trả 503.
  Đây là lựa chọn sản phẩm, không phải kết luận pháp lý về quyền truy cập.

## Tài liệu chi tiết

- [Cập nhật chương mới: đối thủ làm gì, Mira nên làm gì](updates-research.md): Nghiên cứu so sánh Mihon, Legado, LNReader, Kotatsu, FanFicFare, Readwise; phân tích rủi ro pháp lý; thiết kế feed Cập nhật.
- [Repo crawler novel Nhật, Hàn và Trung: cơ chế thực tế](repository-survey.md): Khảo sát cơ chế của Narou/Syosetu, Kakuyomu, Alphapolis, Novelpia, Joara, Qidian, JJWXC, Fanqie, Ciweimao; xử lý rate limit, session và bảo mật.
- [Thiết kế hệ thống nguồn đa quốc gia](system-design.md): Kiến trúc kỹ thuật, schema cơ sở dữ liệu, hợp đồng adapter, IPC contract, catalog diff và UX.

---

[Mục lục module](../README.md)
