## Context

- IPC `src/main/ipc/handlers/sources.ts` viết cứng Kakuyomu ở identify (`identifyKakuyomu`), preview
  (`sourceId === 'mira.jp.kakuyomu'`, canonical URL tự ghép) và kiểm tra preview khi create.
  `sourceServices.ts` chỉ resolve được một adapter mạng.
- `bindings:create` chỉ ghi binding; mục lục đã tải ở preview bị bỏ, người dùng phải bấm Kiểm tra để tải lại.
  Spec `source-network-binding-flow` đã yêu cầu lưu catalog cùng binding.
- `catalog:download-range` không dùng khóa `activeDownloads` của tải đơn, không có `AbortController`, lỗi
  giữa chừng ném ra ngoài làm mất thông tin chương nào đã xong.
- Broker cấm header `cookie`, giãn cách theo `minIntervalMs`, tự retry 429/5xx. Mỗi operation có
  `operationRequestBudget` (Kakuyomu: 10).
- Selector tham chiếu: `webnovel/*.yaml` của narou 3.9.1 (2024-09) và fork narou-mod (cập nhật tới
  2026-07), cộng HTML Syosetu lấy trực tiếp ngày 2026-10-24.
- Hameln và Arcadia nằm ngoài change (xem proposal): Hameln đứng sau Cloudflare (403 với client không phải
  trình duyệt, narou-mod dừng và báo lỗi thay vì vượt); Arcadia chỉ có HTTP.

## Goals / Non-Goals

**Goals:**
- Thêm site mới = thêm một thư mục adapter + đăng ký, không sửa IPC.
- Một mục catalog không bao giờ tạo hai chương Mira.

**Non-Goals:**
- Engine định nghĩa site bằng YAML/regex như narou.
- Tải ảnh minh hoạ (挿絵); ảnh được giữ thành dòng chữ `［挿絵］`.
- Ghi nhớ cookie phiên hoặc đăng nhập.

## Decisions

### 1. Adapter tự nhận diện URL và dựng canonical URL

Mở rộng `NovelSourceAdapter.identify` thành hàm đồng bộ, không cần network, trả
`{ remoteWorkId, canonicalUrl, inputRemoteChapterId? }`. Registry giữ danh sách adapter; IPC `identify` thử
lần lượt adapter có domain khớp. `preview-create`/`create` dùng `canonicalUrl` từ adapter và bỏ mọi so sánh
`sourceId`. Kakuyomu chuyển `identifyKakuyomu` vào adapter.

Thay thế đã cân nhắc: giữ `switch(sourceId)` trong IPC. Bị loại vì 6 nguồn thành 6 nhánh rải ở 3 handler.

Khi triển khai: `identify`/`canonicalUrl` nằm trên `NetworkSource` (`src/main/sources/networkSources.ts`,
gồm manifest, hai hàm đó và factory adapter) thay vì trên `NovelSourceAdapter`, vì adapter cần broker còn
nhận diện URL thì không. `NovelSourceAdapter.identify` giữ nguyên cho nguồn thư mục/tệp.

### 2. Lưu catalog từ preview khi tạo binding

Bộ nhớ `urlPreviews` giữ thêm `items` của preview. `create` ghi binding và catalog snapshot trong cùng
transaction bằng đường ghi catalog mà `syncService` đang dùng (snapshot đầu tiên, không sinh update event).

### 3. Tác vụ tải nằm trong một service, không nằm trong IPC

Tách `SourceDownloadService` ở `src/main/sources/`: map `bindingId → { controller, itemIds }` và tập khóa
`catalogItemId`. Tải đơn là tác vụ một mục. Mỗi chương: kiểm tra lại `chapterId` dưới khóa, gọi
`getChapter` với signal của tác vụ, tạo chương và lưu text như code hiện tại (xóa chương nếu lưu lỗi).
Lỗi `temporarily_unavailable` (429/503 sau retry của broker) dừng tác vụ; lỗi khác ghi vào tổng kết rồi
chạy tiếp. Thêm IPC `sources:catalog:download-cancel`. Kết quả trả `{ state, downloaded, skipped, empty,
failed: [{ title, message }] }`.

Không đổi retry của broker: narou bỏ ngay khi gặp 503, Mira vẫn để broker retry vài lần trong deadline rồi
mới dừng tác vụ, vì 503 ngắn hạn cũng xảy ra khi site bảo trì nhanh.

### 4. Nhịp tải theo đợt khai báo trong manifest

Thêm `networkPolicy.burstPause?: { every: number; ms: number }`. Tác vụ tải nghỉ `ms` sau mỗi `every`
chương. Syosetu, なろう R18, Akatsuki: `{ every: 10, ms: 5000 }` (theo `download.wait-steps` của narou);
`minIntervalMs` 1000 cho mọi site.

### 5. Cookie tuổi do manifest khai báo, broker gắn

Thêm `networkPolicy.ageCookies?: Record<origin, string>` và cờ manifest `adult: true`. Broker nhận thêm
hàm `ageConfirmed(): boolean` từ app preferences; với origin có `ageCookies` mà chưa xác nhận thì trả lỗi
`age_verification_required`. Header `cookie` từ adapter vẫn bị cấm như hiện tại. Giá trị:

| Origin | Cookie |
|---|---|
| `https://novel18.syosetu.com` | `over18=yes` |
| `https://www.akatsuki-novels.com` | `CakeCookie[ALLOWED_ADULT_NOVEL]=on` |

Akatsuki trộn truyện thường với truyện người lớn trên cùng origin, nên nguồn này cũng đòi xác nhận tuổi.
`ncode.syosetu.com` không cần cookie.

Thay thế đã cân nhắc: cookie jar theo origin. Bị loại vì cần lưu trữ và mã hoá như credential, trong khi
giá trị ở đây cố định và công khai.

### 6. Syosetu: API cho metadata, HTML cho mục lục và nội dung

Đã kiểm tra trực tiếp ngày 2026-10-24 trên `n9669bk` (286 tập):

- API: `https://api.syosetu.com/novelapi/api/?out=json&ncode=<ncode>&of=t-w-s-nt-ga-gl-n` (khi triển
  khai bỏ `gzip` vì broker trả byte thô và phản hồi một tác phẩm rất nhỏ; thêm `n` để so ncode)
  (R18: `novel18api`, thêm `ng` để lấy `nocgenre`). Phần tử đầu của mảng JSON là `{ allcount }`. API chưa
  giới hạn lượt gọi, khuyên dùng `of`/`gzip` và cache không quá 2 tuần. Dữ liệu trễ trung bình 5 phút, tối
  đa khoảng 2 giờ; `general_lastup` không đổi khi tác giả chỉ sửa tập.
- Không đọc trang thông tin `/novelview/infotop/`: HTML trang này đổi sang `dl/dt/dd` vào 09/2026 (narou
  issue #457) và API đã đủ.
- Mục lục: `https://<host>/<ncode>/?p=<n>`, 100 `.p-eplist__sublist` mỗi trang, tên phần ở
  `.p-eplist__chapter-title`; số trang lấy từ `?p=` của `.c-pager__item--last`, không có thì một trang.
  Đọc tuần tự qua broker (LNReader tải song song không giới hạn; không làm theo).
- Nội dung: trong `.p-novel__body`, các `.js-novel-text.p-novel__text` theo thứ tự; modifier
  `--preface`/`--afterword` là lời đầu/lời cuối, nối bằng dòng `＊＊＊`.
- Truyện ngắn (`noveltype` 2): một mục catalog, ID `1`, nội dung lấy từ trang tác phẩm.
- Kiểm tra cập nhật: so `general_all_no` + `general_lastup` với giá trị lưu trong `statsJson` của lượt sync
  hoàn chỉnh gần nhất; bằng nhau thì kết thúc mà không đọc mục lục. Tham số `full: true` của
  `sources:sync:start` bỏ qua bước này; UI có mục "Kiểm tra kỹ" trong menu của nút Kiểm tra.
- `nocgenre` 1 → Nocturne, 2/3 → Moonlight, 4 → Midnight; hiện ở preview và nhãn bản raw.
- Budget: `limits.maxPages` 100, `operationRequestBudget` 102, deadline 180 s, đủ cho khoảng 10.000 tập.
- `ncode.syosetu.com` và `novel18.syosetu.com` là hai `sourceId` dùng chung parser, vì khác origin, khác
  endpoint API và chỉ R18 cần cookie.

### 7. Parse HTML bằng parse5 như Kakuyomu

Thêm helper chung `src/main/sources/html.ts` (tìm phần tử theo class/id, lấy text có ruby, chuyển `<br>`
thành xuống dòng). Mỗi site chỉ chứa selector và quy tắc fail-closed.

### 8. Gỡ release gate

Xóa `releaseGate`, `allowUnreleased` và nhánh liên quan trong `registry.ts`, `manifest.ts`,
`sourceServices.ts` cùng test. Kakuyomu không đổi hành vi.

## Risks / Trade-offs

- [Selector của narou đã cũ] → viết fixture từ HTML thật khi triển khai từng site; parser fail-closed nên
  site đổi giao diện sẽ báo lỗi thay vì lưu sai.
- [Akatsuki: giới hạn 300 tập của narou là do mục lục phân trang, đã được sửa trong narou issue #456] →
  spec yêu cầu đọc hết trang hoặc đánh dấu snapshot chưa đầy đủ.
- [API Syosetu trễ tới khoảng 2 giờ] → báo cho người dùng khi API nói không đổi; có "Kiểm tra kỹ".
- [Cookie `over18=yes` chưa được xác nhận trên một truyện R18 thật] → task 6.1 lấy HTML thật trước khi viết
  parser.
- [Preview truyện Syosetu rất dài mất khoảng 1 phút do giãn cách 1 s/trang] → wizard hiện tiến độ đọc mục
  lục; chấp nhận.
- [Site chặn IP khi tải nhiều] → nhịp nghỉ theo đợt, dừng khi gặp 429/503, chỉ tải khi người dùng bấm.

## Migration Plan

Không đổi schema. Binding Kakuyomu hiện có giữ nguyên. Binding tạo trước change này chưa có catalog vẫn
dùng nút Kiểm tra như cũ.
