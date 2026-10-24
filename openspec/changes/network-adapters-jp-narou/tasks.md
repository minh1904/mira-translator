## 1. Chuẩn bị: dispatch adapter tổng quát và gỡ release gate

- [x] 1.1 Đổi `NovelSourceAdapter.identify` thành hàm đồng bộ trả `{ remoteWorkId, canonicalUrl, inputRemoteChapterId? }`, chuyển `identifyKakuyomu` vào adapter Kakuyomu; test identify Kakuyomu hiện có vẫn qua
- [x] 1.2 `sourceServices.ts` resolve adapter mạng theo `sourceId` từ một bảng đăng ký (bỏ biến `kakuyomuAdapter` riêng); test resolve hai adapter giả có broker riêng
- [x] 1.3 IPC `bindings:identify`, `bindings:preview-create`, `bindings:create` dùng adapter/registry, bỏ mọi so sánh `'mira.jp.kakuyomu'`; `grep -n "mira.jp.kakuyomu" src/main/ipc` không còn kết quả và test IPC hiện có qua
- [x] 1.4 Preview trả `author`, `description`, cờ `adult` từ `getWork`; cập nhật contract `src/shared/contracts/sources.ts` và test contract
- [ ] 1.5 Gỡ `releaseGate`, `allowUnreleased` khỏi `domain.ts`, `manifest.ts`, `registry.ts`, `sourceServices.ts` và test; `node scripts/check.mjs` qua

## 2. Lưu catalog khi tạo bản raw

- [x] 2.1 `urlPreviews` giữ catalog items; `bindings:create` ghi binding và snapshot catalog trong một transaction, không sinh update event; test: tạo binding xong `catalog:list` trả đủ mục mà không gọi network
- [x] 2.2 Bỏ trạng thái "Chưa có danh mục" sau khi tạo từ URL trong `SourcesArea` (danh mục hiện ngay); test component

## 3. Tác vụ tải chương

- [x] 3.1 Tạo `src/main/sources/downloadService.ts` với khóa theo binding và theo catalog item, `AbortController`, tổng kết `{ state, downloaded, skipped, empty, failed[] }`; unit test các kịch bản trùng đơn/dải, hai dải, hủy, lỗi giữa chừng, 503 dừng tác vụ
- [x] 3.2 Thêm `networkPolicy.burstPause` vào manifest + validation; test tác vụ nghỉ sau mỗi `every` chương bằng đồng hồ giả
- [x] 3.3 IPC `catalog:download` và `catalog:download-range` gọi service; thêm `catalog:download-cancel` + preload; test IPC
- [x] 3.4 `SourcesArea`: nút Hủy khi đang tải dải, hiện tổng kết (đã tải / rỗng / lỗi kèm tên chương); test component

## 4. Cookie tuổi và xác nhận R18

- [x] 4.1 Thêm tùy chọn ứng dụng `ageConfirmed` (đọc/ghi qua storage preferences hiện có, không vào `.mira`); test storage
- [x] 4.2 Broker: `networkPolicy.ageCookies` theo origin, gắn header khi `ageConfirmed()`, trả `age_verification_required` khi chưa; vẫn cấm `cookie` từ adapter, bỏ qua `Set-Cookie`, đổi cookie theo origin khi redirect; test broker cho từng kịch bản trong spec
- [x] 4.3 `AddRawDialog`: hiện bước xác nhận đủ 18 tuổi trước preview của nguồn `adult`, badge R18 ở preview; cập nhật gợi ý URL liệt kê các site hỗ trợ; test component
- [x] 4.4 Cài đặt: công tắc thu hồi xác nhận tuổi; test lượt kiểm tra cập nhật R18 sau khi thu hồi báo `age_verification_required`

## 5. Helper HTML chung

- [x] 5.1 Tạo `src/main/sources/html.ts` trên parse5 (tìm theo class/id, text có ruby giữ cách chuẩn hoá hiện có, `<br>` → xuống dòng, ảnh → `［挿絵］`); dùng lại phần chuẩn hoá của `kakuyomu/episodeParser.ts`; unit test

## 6. Adapter Syosetu và なろう R18

- [x] 6.1 Lấy HTML thật một tác phẩm ngắn, một tác phẩm nhiều trang mục lục, một trang tập có lời đầu/lời cuối; tạo fixture tổng hợp tối thiểu trong `src/main/sources/syosetu/fixtures/` (không lưu nguyên văn chương)
- [x] 6.2 `identify` cho `ncode.syosetu.com` và `novel18.syosetu.com`; test các URL trong spec
- [x] 6.3 `getWork` qua API (`novelapi` / `novel18api`), fail-closed khi không có hoặc khác ncode; test fixture JSON
- [x] 6.4 `getCatalog` đọc mọi trang `?p=n`, giữ tên phần, so số tập với API, truyện ngắn một mục; test fixture
- [x] 6.5 `getChapter` ghép lời đầu, nội dung, lời cuối; fail-closed khi thiếu nội dung; test fixture
- [x] 6.6 Sync Syosetu bỏ qua đọc mục lục khi `general_all_no` và `general_lastup` không đổi (lưu trong `statsJson`), báo API có thể trễ; tham số `full: true` luôn đọc mục lục; test cả hai nhánh
- [x] 6.7 `SourcesArea`: mục "Kiểm tra kỹ" trong menu của nút Kiểm tra gọi sync với `full: true`; test component
- [x] 6.8 Manifest hai nguồn (origin trang + API, `burstPause`, `ageCookies` cho R18, `adult`), tên site R18 theo `nocgenre`, đăng ký; test registry liệt kê cả hai và preview R18 hiện đúng tên site

## 7. Adapter Akatsuki

- [x] 7.1 Fixture từ HTML thật, gồm mục lục nhiều trang của một tác phẩm trên 300 tập
- [x] 7.2 identify, getWork, getCatalog (đọc hết trang hoặc snapshot chưa đầy đủ), getChapter theo spec; manifest với `ageCookies`, `adult`, `burstPause`; test fixture

## 8. Hoàn tất

- [ ] 8.1 Chạy thử app: thêm bản raw từ URL cho Syosetu, なろう R18 và Akatsuki, tải một dải 3 chương, hủy giữa chừng, kiểm tra cập nhật và kiểm tra kỹ; ghi kết quả vào `docs/modules/sources/README.md` (Hiện trạng triển khai)
- [ ] 8.2 `node scripts/check.mjs --build` qua
