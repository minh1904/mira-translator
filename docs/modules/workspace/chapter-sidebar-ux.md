# Nghiên cứu UX: Điều hướng chương và thanh bên màn dịch

Cập nhật: 2026-10-10 · Trạng thái: **Đề xuất & Thiết kế** · Chủ trì: chủ sản phẩm, Antigravity.

## Câu hỏi tài liệu này trả lời

1. Nút quay lại tác phẩm (`< Tên truyện`) hiện nằm ở đầu cột danh sách chương có hợp lý không? Đẩy lên thanh trên (topbar của AppShell) thì bố cục ra sao?
2. Thanh đầu của cột danh sách chương (vị trí nút back cũ) nên đặt những gì để hỗ trợ người dịch tốt nhất?
3. Trải nghiệm tìm kiếm, nhảy số chương, lọc trạng thái dịch và quản lý chương trong sidebar nên tổ chức như thế nào theo chuẩn các công cụ viết/dịch hiện đại?

---

## 1. Hiện trạng và vấn đề (Quan sát)

### 1.1. Hiện trạng giao diện màn Chương

Hiện tại màn Chương (`ChapterScreen`) có cấu trúc hiển thị 3–4 tầng thanh ngang chồng chéo:

1. **Titlebar cửa sổ (40 px)**: Chữ "Mira" và vùng kéo cửa sổ OS.
2. **Topbar của AppShell (`page-topbar`, 40 px)**:
   - Nửa bên trái hoàn toàn trống (`setTitleSlot` không được truyền nội dung từ `ChapterWorkspace`).
   - Nửa bên phải: `[Hỏi AI]` `[Tập trung]` `[⋯]` `|` `[Theme]` `[Cài đặt]`.
3. **Thanh đầu của Sidebar (`ChapterNavSidebar`, 40 px)**:
   - Nằm ngay dưới `page-topbar`, hiển thị: `[< Tên tác phẩm]` (click để về `WorkDetailScreen`).
4. **Sub-header của vùng soạn thảo (`ChapterWorkspace`, 36 px)**:
   - Hiển thị: `Chương X: Tiêu đề · N đoạn gốc · M đoạn dịch`.
5. **Thanh tiêu đề Pane Editor**:
   - `Bản gốc · Ngôn ngữ` và `Bản dịch · Tiếng Việt`.

### 1.2. Vấn đề UX

1. **Lệch cấp bậc thông tin (Hierarchy Mismatch)**:
   - Nút "Về tác phẩm" là điều hướng cấp màn hình (Page/Work level navigation), nhưng lại bị nhét vào bên trong cột danh sách chương (Chapter list).
   - Trong khi đó, thanh trên (`page-topbar`) của AppShell chạy suốt chiều ngang và có nửa bên trái bỏ trống hoàn toàn.
2. **Lãng phí không gian thao tác của danh sách chương**:
   - Tiểu thuyết thường có từ hàng chục đến hàng nghìn chương (50–2000+ chương).
   - Cột danh sách chương hiện tại hoàn toàn không có ô **Tìm kiếm** hoặc **Nhảy số chương**, buộc người dịch phải cuộn chuột thủ công trong một danh sách rất dài.
3. **Trùng lặp và phân tán tiêu đề**:
   - Tên truyện vừa xuất hiện ở nút back trong sidebar, vừa có trong sub-header của editor; trong khi tiêu đề topbar chính lại trống.

---

## 2. Quan sát đối thủ và công cụ tương đương

| Ứng dụng | Nút quay lại / Breadcrumb | Đầu cột danh sách chương / tệp | Bộ lọc trạng thái |
| --- | --- | --- | --- |
| **Novelcrafter** | Breadcrumb ở topbar: `[← Library] / Novel / Chapter`. Bấm vào cấp nào nhảy về cấp đó. | Ô tìm kiếm chương + Nút thêm chương (`+`) + Menu sắp xếp / dàn ý. | Đánh dấu màu theo trạng thái (Draft, Revised, Final). |
| **LinguaGacha** | Thanh điều hướng bên trái; danh sách tệp có bộ lọc trạng thái. | Ô lọc tệp nguồn; hiển thị tiến độ % từng tệp. | Lọc: Tất cả / Chưa dịch / Đã dịch / Lỗi. |
| **GalTransl** | Danh sách dự án ở thanh bên; thanh trên có tên dự án và nút back. | Ô tìm kiếm văn bản / tệp nhanh; chấm màu xanh (xong), vàng (đang làm). | Bộ lọc tệp và tiến độ tổng. |
| **Crowdin / Smartcat** | Breadcrumb trên thanh công cụ chính của editor. | Tìm kiếm chuỗi / tệp; hỗ trợ nhảy theo ID hoặc số thứ tự. | Rất mạnh: Lọc chưa dịch, đã dịch, cần duyệt, có bình luận. |
| **Obsidian / VS Code** | Nút back/forward lịch sử hoặc breadcrumb đường dẫn trên topbar. | Header danh sách: Ô tìm kiếm (Quick Filter), nút Thêm mới, Thu gọn, Đổi sắp xếp. | Lọc theo từ khóa, nhảy file qua `Ctrl+P`. |

### Nhận xét rút ra
- **Không công cụ nào đặt nút back trang chính vào bên trong ô đầu danh sách tài liệu con.** Nút back luôn nằm trên thanh tiêu đề/topbar cùng với breadcrumb.
- **Đầu danh sách tài liệu luôn là ô Tìm kiếm / Lọc nhanh**: Người dùng cần tìm theo số hoặc theo tên ngay lập tức khi danh sách vượt quá 20 mục.

---

## 3. Đề xuất kiến trúc UX cho Mira

### 3.1. Khu vực 1: Đẩy nút Back lên Topbar của AppShell

Đưa điều hướng về tác phẩm lên `TopBarTitle` của `page-topbar`.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Mira (Titlebar)                                                              [ - ◻ X ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [← Về tác phẩm]  Tên truyện  /  Chương 1: Khởi đầu        [Hỏi AI] [Tập trung] [⋯] | ☼ ⚙ │
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ SIDEBAR CHƯƠNG           │ WORKSPACE SOẠN THẢO                                         │
...
```

**Chi tiết thành phần bên trái Topbar:**
1. **Nút Back (`AltArrowLeftIcon`)**:
   - Icon mũi tên quay lại tinh gọn, tooltip: `"Về tác phẩm: [Tên tác phẩm] (Esc hoặc Alt+Trái)"`.
   - Bấm vào sẽ đưa người dùng về `WorkDetailScreen`.
2. **Breadcrumb tương tác**:
   - `[Tên truyện]` (nhạt) ` / ` `[Chương X]` (đậm, font-semibold).
   - Tên truyện có thể click được để về màn chi tiết truyện.
3. **Chỉ báo trạng thái lưu (Save state indicator)**:
   - Hiển thị nhẹ nhàng cạnh tiêu đề: `"Đã lưu"` (mờ) hoặc `"Đang lưu…"` khi có thay đổi. Điều này giúp loại bỏ cảm giác lo lắng mất chữ của người dịch.

---

### 3.2. Khu vực 2: Thanh đầu Sidebar — Ô Tìm kiếm & Nhảy chương thông minh

Chuyển đổi hoàn toàn hàng đầu tiên của Sidebar thành **Thanh công cụ chương**:

```text
┌──────────────────────────┐
│ [🔍 Tìm hoặc nhảy chương ] │  <- SearchInput (hỗ trợ số & chữ)
├──────────────────────────┤
│ [Tất cả] [Chưa dịch] [AI]│  <- Thanh chip lọc nhanh (tuỳ chọn)
├──────────────────────────┤
│ • 1. Chương 1            │
│ • 2. Chương 2            │
...
```

#### A. Ô tìm kiếm & nhảy chương (`SearchInput`)
- Tận dụng hàm `parseQuery` và `filterChapters` đã có sẵn trong [`chapterList.ts`](../../../src/renderer/src/modules/workspace/work-detail/chapterList.ts):
  - **Nhập số (ví dụ `12`)**: Chế độ **Nhảy chương (Jump)**. Tự động cuộn đến Chương 12 và highlight (nhấn `Enter` để mở ngay). Với tiểu thuyết, độc giả và dịch giả nhớ số chương nhiều hơn nhớ tên chương.
  - **Nhập chữ (ví dụ `đại chiến`)**: Chế độ **Lọc (Filter)**. Lọc danh sách tức thì theo tên chương (không dấu, không phân biệt hoa thường).
  - Có nút `✕` xóa nhanh khi có nội dung; phím tắt kích hoạt nhanh: `/` hoặc `Ctrl+F` khi đang mở sidebar.

#### B. Các nút tiện ích trên header sidebar (Action row)
Bên cạnh hoặc ngay dưới ô tìm kiếm:
1. **Nút Thêm chương (`+`)**:
   - Thêm nhanh một chương mới vào cuối truyện mà không cần back ra màn ngoài.
2. **Nút Đảo chiều sắp xếp (`1→N` / `N→1`)**:
   - Rất quan trọng khi truyện dài (500+ chương): người dịch đang dịch các chương mới nhất thường muốn chương mới nằm trên cùng để không phải cuộn xuống đáy.
3. **Nút Thu gọn sidebar (`SidebarCloseIcon`)**:
   - Thu gọn cột chương sang chế độ toàn màn hình editor (tương đương phím tắt `Ctrl+B`).

---

### 3.3. Khu vực 3: Bộ lọc trạng thái (Status Filter Chips)

Dưới ô tìm kiếm có thể có dải chip/pill nhỏ (hoặc dropdown nhỏ):
- **Tất cả (`All`)**: Hiển thị toàn bộ chương.
- **Chưa dịch (`Untranslated`)**: Chỉ hiện các chương có chấm vàng (cần dịch tiếp).
- **Chờ duyệt AI (`Proposals`)**: Chỉ hiện các chương có badge số đề xuất AI chưa duyệt (giúp rà soát nhanh).

---

### 3.4. Khu vực 4: Hàng danh sách chương (Chapter Rows) & Đáy Sidebar

1. **Hàng chương (`NavItem`)**:
   - Giữ nguyên thiết kế tối giản:
     - Chấm trạng thái: 🟢 Đã dịch (`bg-success`), 🟡 Chưa dịch (`bg-warning`), ⚪ Trống (`bg-neutral/40`).
     - Tên hiển thị: `{số}. {tiêu đề}`.
     - Badge số đề xuất AI: Màu cam tabular-nums nếu có.
   - Thêm tính năng **Tự động cuộn đến chương đang chọn (`scrollIntoView`)** khi mở màn hình để người dùng không bị mất dấu vị trí hiện tại.
2. **Đáy Sidebar (Footer)**:
   - Hiển thị dòng tiến độ tinh gọn: `12/120 chương đã dịch (10%)`.
   - Giúp người dịch nắm được tổng quan tiến độ mà không tốn diện tích hiển thị.
   - **Đã thay đổi (2026-10-22):** dòng `N/M chương đã dịch` chuyển xuống thanh trạng thái 22px ở
     đáy cửa sổ, cạnh nhãn "Soạn thảo". Chân sidebar cao khác thanh trạng thái nằm trong card
     editor, nên ba cột không thẳng đáy. Chân sidebar giờ chỉ hiện `N/M chương` khi đang lọc.

---

## 4. So sánh hai phương án triển khai

### Phương án A: Tinh gọn & Trực diện (Khuyên dùng cho bước 1)
- **Topbar**: Đẩy nút Back + Tên truyện (`< Test / Chương 1`) lên `TopBarTitle`.
- **Sidebar Header**:
  - 1 ô `SearchInput` nhỏ gọn (`size="sm"`), placeholder `"Tìm hoặc nhảy số chương…"` có icon kính lúp và nút xóa `✕`.
  - Giữ lại nút `+` nhỏ ở góc phải ô tìm kiếm để thêm chương nhanh.
- **Danh sách chương**: Tự động lọc theo ô tìm kiếm; gõ số nhảy số, gõ chữ lọc tiêu đề.
- **Ưu điểm**:
  - Gọn gàng, sạch sẽ, giải quyết triệt để 100% yêu cầu của người dùng.
  - Tận dụng 100% component và hàm có sẵn (`SearchInput`, `parseQuery`, `filterChapters`).
  - Không làm rối mắt giao diện với quá nhiều nút bấm phụ.

### Phương án B: Đầy đủ tính năng (Power-user)
- Bao gồm toàn bộ Phương án A.
- Bổ sung thêm:
  - Dải chip lọc trạng thái: `Tất cả` · `Chưa dịch` · `Có đề xuất AI`.
  - Nút đảo chiều sắp xếp `1→N` / `N→1`.
  - Tóm tắt tiến độ ở đáy sidebar (`X/Y chương`).
- **Ưu điểm**: Hỗ trợ tối đa cho các bộ truyện quy mô lớn (hàng nghìn chương).

---

## 5. Kết luận & Đề xuất tiếp theo

1. **Đồng thuận với quan điểm của người dùng**:
   - Đẩy nút Back lên topbar AppShell là hoàn toàn chuẩn xác về mặt UX hierarchy và giải quyết việc bỏ trống lãng phí của topbar.
   - Chuyển thanh đầu sidebar thành tìm kiếm/nhảy chương là tính năng thiết yếu mà mọi app viết/dịch truyện đều có.
2. **Đề xuất thực hiện**:
   - Áp dụng **Phương án A** trước: di chuyển nút Back lên Topbar qua `TopBarTitle`, thay thế header sidebar bằng `SearchInput` tích hợp tìm kiếm và nhảy chương.
   - Sau đó đánh giá và bổ sung bộ lọc chip / sắp xếp nếu có nhu cầu quản lý dự án lớn.
