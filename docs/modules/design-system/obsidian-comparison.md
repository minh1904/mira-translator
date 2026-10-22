# Phân tích design system Obsidian và so sánh với Mira

Cập nhật: 2026-10-05 · Trạng thái: **Quan sát** (phần 1–4) và **Đề xuất** (phần 5–7). Cùng ngày chủ
sản phẩm yêu cầu triển khai; phần đã làm và lựa chọn cho năm câu hỏi ở phần 7 ghi tại
[chương chính](README.md). Chủ trì: chủ sản phẩm.

## Câu hỏi chương này trả lời

Obsidian thực sự tổ chức giao diện bằng những token và quy tắc nào, Mira đang lệch ở đâu, và nếu
làm lại bộ thiết kế thì nên giữ, đổi hay bỏ gì? [Chương chính](README.md) vẫn là token hiện hành
và ghi phần đề xuất nào đã triển khai.

## Nguồn và độ tin cậy

| Nguồn | Đọc ngày | Ghi chú |
| --- | --- | --- |
| `app.css` trong bản cài Obsidian **1.13.7** (`resources/obsidian.asar`) | 2026-10-05 | Nguồn chắc nhất cho giá trị thật. Chỉ đọc để đo; không chép file vào repo. |
| [CSS variables – Foundations/Components/Window](https://docs.obsidian.md/Reference/CSS+variables/About+styling) | 2026-10-05 | Khớp `app.css`, trừ `--radius-xl`: docs ghi 16 px, CSS 1.13.7 là 24 px. |
| [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines), [Icons](https://docs.obsidian.md/Plugins/User+interface/Icons) | 2026-10-05 | Quy tắc chữ, heading settings, icon Lucide. |
| [Changelog 1.0](https://obsidian.md/changelog/2022-10-13-desktop-v1.0.0/), [1.11](https://obsidian.md/changelog/2025-12-10-desktop-v1.11.0/), [1.13.4](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/) | 2026-10-05 | Redesign 1.0, SettingGroup, cửa sổ Settings riêng có tìm kiếm. |
| [Minimal theme](https://minimal.guide/home), [stephango.com/file-over-app](https://stephango.com/file-over-app) | 2026-10-05 | Triết lý của người thiết kế chính (kepano). |
| Forum: [vị trí Settings/Help](https://forum.obsidian.md/t/please-restore-the-location-of-the-settings-and-help-buttons/83312/17), [menu quá dài](https://forum.obsidian.md/t/menus-that-are-easier-to-comprehend-not-too-long-ux-accessibility-issue/104267) | 2026-10-05 | Phê bình từ cộng đồng; là ý kiến, không phải số liệu. |
| Hai ảnh chụp chủ sản phẩm gửi (Obsidian 1.13.7, theme tối, Windows) | 2026-10-05 | Tham chiếu thị giác. |
| Code Mira tại commit `db7879b` | 2026-10-05 | Số đếm lấy bằng grep trong `src/renderer`; có thể lệch vài đơn vị. |

Chưa đọc: write-up của theme AnuPpuccin, Things, Border.

## 1. Obsidian tổ chức hệ thiết kế thế nào

**Ba tầng biến.** (1) *Nền tảng*: thang `--color-base-00…100`, accent HSL, tám màu mở rộng, cỡ chữ,
lưới `--size-*`, radius, icon, layer, shadow, animation. (2) *Semantic*: `--background-primary`,
`--text-muted`, `--interactive-accent`… trỏ về tầng 1. (3) *Component*: `--tab-*`, `--nav-item-*`,
`--ribbon-width`, `--status-bar-*`, `--setting-items-*`… trỏ về tầng 2. Theme và plugin chỉ ghi đè
biến, không cần selector phức tạp; đó là lý do hàng trăm theme cộng đồng vẫn đồng bộ.

**Accent sinh từ một màu.** `--accent-h: 258; --accent-s: 88%; --accent-l: 66%` (≈ `#8a5cf5`).
`--color-accent-1/2` được tính bằng `calc()` (lệch hue −1…−5, nhân saturation và lightness), nên
người dùng đổi một màu là hover, chữ accent, tag, toggle đổi theo.

**Hover là lớp phủ, không phải bậc màu.** `--background-modifier-hover` =
`color-mix(in oklch, mono-100 6.7%, transparent)`: cùng một token dùng được trên nền editor, sidebar
hay modal. Mục đang chọn trong cây tệp là accent 15 %, tag là accent 10 %.

**Bảng ánh xạ semantic chính (theme tối).**

| Token | Giá trị | Token | Giá trị |
| --- | --- | --- | --- |
| background-primary | base-00 `#1c1c1c` | text-normal | base-100 `#dadada` |
| background-primary-alt | base-10 `#232323` | text-muted | base-70 `#b3b3b3` |
| background-secondary | base-20 `#282828` | text-faint | base-50 `#666666` |
| background-secondary-alt | base-30 `#333333` | text-on-accent | trắng |
| modifier-border / -hover / -focus | base-30 / 35 / 40 | interactive-normal / -hover | base-30 / base-35 |
| modifier-form-field | base-25 `#2e2e2e` | text-selection | accent 33 % |

**Nền tảng còn lại.**

- **Chữ:** UI 12 / 13 / 15 / 20 px, nội dung 16 px; line-height 1,5 (thường) và 1,3 (chặt);
  heading theo tỉ lệ vàng 1,618 → 1 em với letter-spacing âm nhẹ; font giao diện là font hệ thống.
  Bề rộng dòng đọc `--file-line-width: 700px`.
- **Khoảng cách:** `--size-2-1…3` = 2/4/6, `--size-4-1…18` = 4…72 px.
- **Radius:** 4 / 8 / 12 / 24 px; input 5 px; tab đang mở bo trên 6 px.
- **Icon Lucide:** 14 / 16 / 18 / 18 / 32 px, nét 2 → 1,25 px khi icon lớn dần; màu `text-muted`,
  opacity 0,85, lên 1 khi hover.
- **Layer:** cover 5, sidedock 10, status bar 15, popover 30, modal 50, notice 60, menu 65,
  tooltip 70, kéo-thả 80.
- **Shadow:** `xs / s / l` nhiều lớp, alpha lớn hơn ở theme tối. Menu dùng `s`, command palette dùng
  `l`, **modal không có shadow**, chỉ viền base-40.
- **Chuyển động:** 70 / 140 / 300 / 560 ms với bốn easing đặt tên.

**Kích thước khung và component.**

| Thành phần | Obsidian 1.13.7 |
| --- | --- |
| Ribbon | 44 px, nền secondary, icon muted |
| Thanh tab / view header | 40 px; tab rộng 200 (tối đa 320) px; chữ 13 px; tab không active là `text-faint` |
| Status bar | nổi góc phải dưới, 12 px, tabular-nums, chỉ bo góc trên-trái |
| Mục cây tệp | 13 px, padding 4/8 px, radius 4, hover = overlay, chọn = accent 15 %, có đường dóng thụt lề |
| Button / dropdown | cao 30 px, padding 4/12 px, 13 px, radius 5, nền interactive-normal + input-shadow; `mod-cta` nền accent chữ trắng |
| Toggle | 40 × 18 px (nhỏ 34 × 15), bật = interactive-accent |
| Modal | rộng 560 px, radius 12, padding 16, tiêu đề 20 px semibold, nội dung 15 px, nền phủ `cover` 40 % |
| Settings | cửa sổ riêng; nav dọc 200–250 px có ô tìm; nội dung tối đa 700 px; nhóm là thẻ nền primary-alt radius 12, giữa các dòng là vạch 1 px; dòng = tên 13 px + mô tả 12 px muted + control bên phải |
| Command palette | 700 px, cách đỉnh 80 px, input 40 px, mục 15 px |
| Menu | nền secondary, viền, radius 8, shadow-s, mục 13 px |
| Tag | pill 2 em, chữ accent trên nền accent 10 %, không viền |

## 2. Đọc hai ảnh chụp

- **Một mặt phẳng tối, ba sắc độ.** Ribbon, thanh tab, hai sidebar và status bar cùng
  `background-secondary`; chỉ editor (và tab đang mở) dùng `background-primary`. Ranh giới là đường
  1 px chứ không phải shadow hay khối màu khác. Mira hiện tách titlebar `#333333` khỏi sidebar
  `#282828`, nên khung trông nặng hơn.
- **Chữ giao diện nhỏ và nhạt, nội dung to và sáng.** Sidebar/status bar 12–13 px màu muted; tiêu đề
  ghi chú lớn, đậm; nội dung 16 px. Độ tương phản tập trung vào nội dung.
- **Accent cực tiết kiệm.** Trong cả hai ảnh, tím chỉ xuất hiện ở tag, toggle bật và một icon đang
  chọn. Nút thường (Check for updates, Log in) là xám nổi nhẹ bằng shadow 1 px.
- **Settings là danh sách đọc được.** Mỗi dòng có tên, một câu mô tả, control căn phải; nhóm thành thẻ
  bo 12 px. Nav trái có tiêu đề nhóm nhỏ, nhạt, viết thường (sentence case).

## 3. So sánh với Mira hiện tại

| Nhóm | Obsidian | Mira (`tokens.css`, commit `db7879b`) | Đánh giá |
| --- | --- | --- | --- |
| Thang trung tính | base-00…100 | Giống từng giá trị | Khớp. Nhưng `--neutral-*` và `--surface-*` lặp hex thay vì trỏ nhau, và không component nào dùng `--neutral-*`. |
| Khung app | Tab bar = sidebar = secondary | Chrome `#333`, sidebar `#282828` | Lệch: thêm một bậc nền không cần. |
| Control | interactive-normal base-30, form field base-25, có input-shadow | control `#2e2e2e`, viền `line-strong` | Gần; thiếu cách phân biệt nút và ô nhập. |
| Hover | Lớp phủ 6,7 % | `hover:bg-selected`, `hover:bg-control`, `brightness-110` | Lệch: ba cách, phụ thuộc nền bên dưới. |
| Chọn | Accent 15 % (cây tệp), overlay (palette) | `bg-selected #3f3f3f` | Mira chỉ có một bậc xám cho mọi "đang chọn". |
| Chữ | normal / muted / faint | primary / muted (muted tối = `#999`, tức base-60) | Thiếu `faint`; muted tối đậm hơn Obsidian một bậc. |
| Viền | base-30/35/40 đặc | trắng/đen 10 % và 20 % | Chấp nhận được; alpha làm viền đổi màu theo nền. |
| Accent | HSL 258/88/66, sinh biến thể | `#9973eb` tối, `#7041b9` sáng, cố định | Mira tốt hơn ở tương phản (xem phần 4) nhưng không có hover/tint dẫn xuất. |
| Màu trạng thái | 8 màu, mỗi theme một bộ | 4 màu `status-*`, sáng đã làm tối cho 4,5:1 | Đủ dùng; `danger` bị gọi nhưng không tồn tại. |
| Cỡ chữ | 4 cỡ UI + 16 nội dung | Token có nhưng **không map vào Tailwind**; thực tế dùng 17 cỡ: 11 px (69 lần), 12,5 px, 14, 10, 17, 24, 26, 28, 44… | Lệch lớn nhất. |
| Line-height | 1,5 / 1,3 | 7 giá trị cứng 1,15 → 1,7 | Lệch. |
| Khoảng cách | `--size-*` | `--space-*` không ai dùng; component dùng thang Tailwind | Cùng lưới 4 px nên không vỡ; chỉ là token chết. |
| Radius | input 5, nav 4, tab 6, modal 12 | control và tab 8, panel 12, thêm 5/6/7 px cứng | Mira bo tròn hơn; control 8 px trông "mềm" kiểu web app hơn Obsidian. |
| Chiều cao control | 30 px thống nhất | Button 28, input 32, item menu 30, tab 35, titlebar 42 | Không chung một nhịp. |
| Shadow / layer / motion | Có thang | Không có; 4 shadow cứng, `z-10` rải rác, 150 ms mặc định, không `prefers-reduced-motion` | Thiếu. |
| Modal | Viền base-40, không shadow, 560 px | `bg-popover`, shadow 0 16 48, 420/540/760 px, nền phủ `black/30` | Khác tinh thần "phẳng". |
| Icon | Lucide, 3 cỡ chính, muted + opacity | Solar Icons, chủ yếu 16 px | Chấp nhận khác bộ icon; thiếu token cỡ và màu. |
| Tooltip | Component, layer 70 | 81 thuộc tính `title=` gốc | Thiếu. |
| Settings | Nav dọc + thẻ nhóm + dòng chuẩn | `SettingRow` riêng của màn model, nội dung 900 px | Chưa có pattern dùng chung. |
| Ribbon / status bar | Có | Không | Xem phần 5. |

Nợ phát sinh độc lập với Obsidian:

- `text-danger`, `bg-danger/10`, `bg-danger/15` không có token nên Tailwind không sinh lớp
  (`GlossaryScreen.tsx`, `GlossaryDialogs.tsx`); `--status-danger` trong `imageEmbedDecorations.ts`
  không tồn tại nên luôn rơi về `#c0392b`.
- 34 `<button>` và 17 input/select/textarea tự style trong các màn feature.
- Khoảng 30 mức alpha tint tự đặt (`bg-warning/5, /6, /10, /14, /20`…) và ba độ đậm focus ring
  (`/25`, `/40`, `/60`).
- `docs/handbook/experience/wireframes/tokens.css` ghi "dán từ src" nhưng vẫn là palette cũ.

## 4. Những chỗ không nên chép từ Obsidian

- **Ribbon.** kepano thừa nhận ribbon tạo "hiệu ứng buồng lái": dãy icon không nhãn làm người mới
  choáng; Obsidian đã cho tắt ribbon. Mira chỉ có bốn khu vực mỗi truyện và đã có tab, không cần
  thêm cột icon.
- **Accent mặc định với chữ trắng.** `#8a5cf5` có độ sáng tương đối ≈ 0,20; chữ trắng trên đó đạt
  khoảng **4,3:1**, dưới ngưỡng 4,5:1 cho chữ nhỏ (tính tay theo WCAG). Accent tối của Mira
  `#9973eb` với chữ `#1c1c1c` ≈ 4,9:1, sáng `#7041b9` với chữ trắng ≈ 6,7:1. Giữ giá trị của Mira.
- **`text-faint` cho thông tin cần đọc.** base-50 `#666` trên `#1c1c1c` chỉ ≈ 3:1. Obsidian dùng nó
  cho tab không active; Mira chỉ nên dùng cho chữ trang trí (gợi ý phím tắt, số đếm phụ).
- **Mọi thứ nằm sau command palette.** Đánh giá cộng đồng nhắc đường học dốc vì tính năng ẩn sau
  lệnh và settings. Người dịch truyện cần thao tác chính hiện ngay trên màn.
- **Cho người dùng tự theme.** Đáng học *cấu trúc* biến để có thể làm sau, nhưng không phải mục tiêu
  bây giờ.

## 5. Đề xuất bộ thiết kế mới

Trạng thái: **Đề xuất**. Mục tiêu là giữ "cảm giác Obsidian" (bình lặng, phẳng, tập trung nội dung)
bằng *cấu trúc* của nó, không phải bằng cách chép giao diện.

**5.1. Ba tầng token, một nguồn.** Tầng 1 giữ `--neutral-*` và thêm accent HSL. Tầng 2 viết lại
semantic bằng `var(--neutral-xx)` thay vì hex. Tầng 3 thêm token component cho những chỗ đang là số
cứng: `--header-height`, `--tab-*`, `--control-height`, `--nav-item-*`, `--dialog-width`,
`--setting-*`. Ánh xạ tất cả vào `@theme inline` để component dùng được qua Tailwind.

**5.2. Màu.**

| Thay đổi | Giá trị đề xuất (tối / sáng) | Lý do |
| --- | --- | --- |
| Gộp chrome vào sidebar | `--surface-chrome` = neutral-20 / neutral-20 | Khung một màu như ảnh; editor là mặt phẳng duy nhất khác màu. |
| Thêm `--surface-raised` | neutral-10 / neutral-10 | Thẻ nhóm settings, panel trong canvas (giống primary-alt). |
| `--bg-hover` | `color-mix(in oklch, var(--mono-100) 6.7%, transparent)` | Một hover cho mọi nền; thay `bg-selected`/`brightness-110`. |
| `--bg-active` (đang chọn trong danh sách) | accent 15 % | Chương đang mở, mục sidebar; tách khỏi hover. |
| `--text-faint` | neutral-50 / neutral-50 | Chữ trang trí, không mang thông tin bắt buộc. |
| `--text-muted` tối | Giữ `#999` hay lên `#b3b3b3` | Cần chốt; `#999` tách tầng rõ hơn, `#b3b3b3` đúng Obsidian và dễ đọc hơn. |
| Accent | Giữ `#9973eb` / `#7041b9`; thêm `--accent-hover`, `--accent-tint-10/15/20` dẫn xuất bằng `color-mix` | Giữ tương phản, có biến thể thống nhất. |
| `--status-*` | Thêm alias `danger` = `error` hoặc sửa nơi gọi; tint cố định 10 % và 20 % | Hết token gãy và 30 mức alpha. |

**5.3. Chữ.** Map `--text-ui-*` thành `text-ui-xs` (12), `text-ui-sm` (13), `text-ui-md` (15),
`text-ui-lg` (20), thêm `text-title` cho tiêu đề màn/chương (khoảng 24–26 px, theo h1 1,618 em × 16).
Thay 11 px bằng 12 px; tiêu đề panel bỏ uppercase + tracking, dùng 12 px semibold `text-faint` kiểu
nhóm settings. Hai line-height: `leading-normal` 1,5 và `leading-tight` 1,3. Viết hoa kiểu câu cho
mọi nhãn.

**5.4. Hình khối và nhịp.** Control cao **30 px** (nhỏ 24, lớn 34), titlebar/tab bar **40 px**.
Radius control 5–6 px, mục danh sách 4, tab bo trên 6, panel/dialog 12. Thêm thang shadow `s`/`l`,
thang z-index theo bảng Obsidian, thời lượng 70/140/300 ms và tắt chuyển động khi
`prefers-reduced-motion`. Dialog bỏ shadow lớn, dùng viền `line-strong` và nền phủ token.

**5.5. Component và pattern.**

- **Tooltip** dùng chung (Base UI có sẵn) thay 81 `title=`.
- **SettingGroup / SettingRow** dùng chung: thẻ `surface-raised`, dòng tên + mô tả + control phải,
  nội dung tối đa 700 px, nav dọc 200–250 px có ô tìm cho màn Cài đặt.
- **Danh sách điều hướng** (thư viện, chương): 13 px, cao 28 px, hover overlay, active accent 15 %.
- **Tag/Badge**: thêm biến thể pill nền accent 10 % cho nhãn nhân vật/glossary.
- **Status bar cho editor chương** (đã làm 2026-10-05): số chữ, trạng thái lưu, số đề xuất AI đang chờ. Đây là
  phần duy nhất của khung Obsidian có giá trị rõ cho người dịch; ribbon thì không. Từ 2026-10-22,
  `AppShell` luôn có một thanh trạng thái 22px trải hết chiều ngang đáy cửa sổ; màn chương gắn nội
  dung của nó vào đây qua `StatusBarItems` thay vì đặt thanh riêng trong card editor.
- **Icon:** giữ Solar Icons (quyết định cũ còn hiệu lực), thêm `--icon-s/m/l` = 16/18/24 và màu mặc
  định muted.

**5.6. Lint chống trôi.** Sau khi map token, thêm quy tắc lint hoặc test chặn `text-[Npx]`,
`rounded-[Npx]`, `shadow-[…]` và lớp màu không có token (như `text-danger`). Không có bước này, số
410 giá trị tùy ý sẽ quay lại.

## 6. Lộ trình gợi ý

1. **Token** (không đổi giao diện nhìn thấy nhiều): ba tầng, alias danger, map type scale/shadow/z
   vào Tailwind, sửa wireframe `tokens.css` cũ.
2. **Component dùng chung:** chiều cao 30 px, radius, hover/active, Tooltip, SettingGroup.
3. **Thay số cứng trong màn feature**, lần lượt Glossary, Addressing, AI panel, Library, Chapters;
   chuyển 34 nút tự style về `Button`.
4. **Khung:** gộp màu chrome, titlebar 40 px (đồng bộ `TOP_BAR_HEIGHT` ở `titleBar.ts`), status bar
   nếu được chốt.
5. Kiểm tương phản cả hai theme ở cỡ cửa sổ Windows thường dùng, rồi cập nhật [chương chính](README.md)
   và [quyết định](https://github.com/minh1904/app-novel/blob/501be2a/docs/handbook/product/decisions.md).

## 7. Câu hỏi cần chủ sản phẩm chốt

1. Gộp titlebar vào màu sidebar như Obsidian, hay giữ titlebar sáng hơn một bậc?
2. `text-muted` theme tối: `#999999` (hiện tại) hay `#b3b3b3` (Obsidian)?
3. Radius control: giữ 8 px hay hạ về 5–6 px cho gần Obsidian?
4. Có làm status bar cho editor chương không?
5. Có chuẩn bị accent đổi được (HSL) ngay từ đợt token, dù chưa mở tùy chọn cho người dùng?

---

[Hệ thiết kế giao diện](README.md) · [Mục lục module](../README.md)
