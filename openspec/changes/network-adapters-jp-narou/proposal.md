## Why

Mira chỉ lấy raw mạng được từ Kakuyomu, trong khi phần lớn truyện Nhật người dùng đọc nằm trên Syosetu và
các site mà narou hỗ trợ. Ngày 2026-10-24 chủ sản phẩm chốt bổ sung các site này, gồm cả truyện R18, và bỏ
yêu cầu nghiên cứu ToS, smoke test live và release gate riêng cho từng adapter. Luồng tải raw hiện tại có
các lỗi phải sửa trước khi thêm nguồn: Kakuyomu bị viết cứng trong IPC, mục lục không được lưu khi tạo bản
raw, và tải theo dải có thể tạo chương trùng, không hủy được.

## What Changes

- IPC nguồn gọi `identify` và canonical URL của adapter theo `sourceId`; bỏ các nhánh Kakuyomu viết cứng.
- Tạo bản raw lưu luôn mục lục đã xem trước (spec hiện hành đã yêu cầu, code chưa làm), không tải lại.
- Tải nhiều chương thành một tác vụ ở main process: khóa theo từng mục catalog dùng chung với tải đơn, hủy
  được, báo tổng kết; nhịp tải theo từng nguồn; nguồn còn trả 503 sau retry của broker thì dừng tác vụ.
- Adapter mới:
  - Syosetu `ncode.syosetu.com`: metadata và kiểm tra cập nhật qua API chính thức, mục lục HTML có phân
    trang, truyện ngắn một chương.
  - なろう R18 `novel18.syosetu.com` (Nocturne, Moonlight, Midnight): dùng chung parser với Syosetu.
  - Akatsuki `www.akatsuki-novels.com`.
- R18: broker gửi cookie xác nhận tuổi cố định do manifest khai báo; người dùng xác nhận đủ 18 tuổi một lần
  trước khi xem trước nguồn R18.
- **BREAKING** (nội bộ): bỏ release gate. Adapter phát hành là bật; Kakuyomu giữ trạng thái đang bật.

Ngoài phạm vi:
- Hameln (`syosetu.org`, `h.syosetu.org`): đứng sau Cloudflare và trả 403 cho client không phải trình duyệt
  (kiểm tra 2026-10-24); cần transport qua Chromium của Electron, tách sang change sau.
- Arcadia (`www.mai-net.net`): chỉ phục vụ HTTP, broker chỉ cho HTTPS; bỏ.
- Lối "Thêm từ URL" ở Thư viện và màn Nguồn, lịch kiểm tra tự động, đăng nhập tài khoản.

## Capabilities

### New Capabilities
- `source-adapter-syosetu`: nhận diện, metadata qua API, mục lục phân trang và nội dung chương cho
  `ncode.syosetu.com` và `novel18.syosetu.com`.
- `source-adapter-akatsuki`: nhận diện, mục lục và nội dung chương cho `www.akatsuki-novels.com`.

### Modified Capabilities
- `network-broker`: cho phép cookie xác nhận tuổi cố định do manifest khai báo, không phải do adapter tự đặt.
- `sparse-chapter-ingestion`: tải theo dải thành tác vụ có khóa, hủy, tổng kết và dừng khi nguồn không khả
  dụng.
- `source-network-binding-flow`: bỏ kịch bản release gate; thêm xác nhận tuổi cho nguồn R18.
- `source-adapter-kakuyomu`: bỏ yêu cầu release gate.

## Impact

- `src/main/sources/`: adapter mới, `sourceServices.ts` (resolve adapter tổng quát), `registry.ts`,
  `broker.ts`, `domain.ts` (manifest: cookie tuổi, nhịp tải, cờ R18).
- `src/main/ipc/handlers/sources.ts`: identify/preview/create tổng quát, lưu catalog khi tạo, tác vụ tải.
- `src/shared/contracts/sources.ts`, preload: hủy tác vụ tải, kết quả tổng kết, cờ R18.
- Renderer: `AddRawDialog` (gợi ý URL, xác nhận tuổi), `SourcesArea` (hủy, tổng kết).
- Tùy chọn ứng dụng: lưu xác nhận đủ 18 tuổi.
- Docs: `docs/modules/sources/README.md` đã ghi quyết định ngày 2026-10-24.
