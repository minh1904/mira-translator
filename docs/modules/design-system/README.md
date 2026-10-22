# Hệ thiết kế giao diện Mira

Cập nhật: 2026-10-10 · Trạng thái: **Đã chốt và đã triển khai**. Các quyết định cũ được giữ dưới
nhãn lịch sử khi đã bị thay thế. Chủ trì: chủ sản phẩm.

## Câu hỏi chương này trả lời

Mira tổ chức token và component dùng chung thế nào, mỗi token nằm ở đâu, và một màn mới phải dùng
những gì để cùng ngôn ngữ thị giác với các màn khác?

Quy tắc UI hiện hành, ngắn gọn và máy đọc được nằm ở [`DESIGN.md`](../../../DESIGN.md). Tài liệu module
này giữ lịch sử quyết định, nghiên cứu, bằng chứng và giới hạn triển khai.

## Quyết định

**2026-10-22 (chiều): Shell theo Modern UI của VS Code, panel shell bo 8 px.** Chủ sản phẩm yêu cầu khung
và bo góc "như VS Code" và chỉ vào bản clone `D:\personal\vscode`. Đã đọc
`src/vs/workbench/browser/media/floatingPanels.css` (Modern UI, `workbench.experimental.modernUI`) và
`src/vs/platform/theme/common/sizes`:

- Nền vỏ cửa sổ cùng màu thanh tiêu đề; activity bar, sidebar, editor, panel đều là khung viền 1 px, bo
  `cornerRadius.large` 8 px, cách nhau và cách mép `spacing.size40` 4 px. Thanh trạng thái nằm ngoài cụm
  khung, không viền trên.
- Activity bar và primary sidebar liền thành một khối: cạnh chạm nhau vuông, sidebar nhường viền nên chỉ
  còn một đường ngăn; đóng sidebar thì rail bo đủ góc.
- Thang bo góc của VS Code: `xSmall` 2, `small` 4, `medium` 6, `large` 8, `xLarge` 12 px.

Bo góc theo từng component lấy từ Modern UI (`contrib/modernUI/browser/media/roundedCorners.css`), vì Mira
dùng kiểu khung nổi của nó: lớp nổi 8 (quick input hạ từ 12, hover nâng từ 5, dialog hạ từ 12, menu,
thông báo); phần tử bên trong 6 (mục menu, nút icon toolbar, code block); control 4 (button, input, select,
hàng list, kbd, tab, badge dài); switch và badge chấm tròn hẳn. Bản không Modern UI dùng 12 cho dialog và
palette, 5 cho hover và để hàng list, tab vuông.

Quyết định (đã áp dụng, chuẩn ở [`DESIGN.md`](../../../DESIGN.md#shapes)): ba tầng 8 · 6 · 4 như Modern UI.
Panel shell, menu, tooltip, toast, composer, dialog và Cài đặt lên/xuống 8 px; nút icon toolbar và mục menu
lên 6 px; card, alert, code block giữ 6 px; control giữ 4 px. Checkbox giữ 4 px (VS Code 3 px, Mira không có
token 3). Mira giữ ô activity bar 40 px, chưa thêm khoảng đệm 8 px quanh cột icon như VS Code. Thay quyết
định "dialog 12" bên dưới.

**2026-10-22: Thang bo góc theo tầng và màu viền khung chứa.** Chủ sản phẩm thấy card bo tròn và viền
đậm hơn button, hỏi có nên đồng bộ. Đã kiểm code: ba panel khung bo 4 px nhưng card bên trong bo 12 px
(composer Agent, TaskList, card màn chương), nên con tròn hơn cha. Ngoài dialog, code dùng lẫn `rounded-sm`,
`rounded-md`, `rounded-lg` cho cùng loại khung. Composer Agent dùng `border-input` (`neutral-550` trên
nền tối), sáng hơn hẳn `border-default` (`neutral-800`) của panel.

Quan sát ở sản phẩm khác (số liệu từ hiểu biết chung về các hệ thiết kế, chưa đo lại trên bản mới nhất):

| Sản phẩm | Button / input | Card | Menu / popover | Dialog |
| --- | --- | --- | --- | --- |
| VS Code | 2–4 | panel không bo | 4–6 | 6 |
| GitHub Primer | 6 | 6 | 12 | 12 |
| Linear | 6 | 8 | 8 | 12 |
| macOS | 5–6 | 10 | 6 | 10–12 |

Điểm chung: bo góc tăng theo kích thước chứ không theo loại; con không tròn hơn cha; viền luôn 1 px và
chỉ khác màu (khung chứa nhạt, control tương tác đậm hơn).

Quyết định (đã áp dụng, chuẩn ở [`DESIGN.md`](../../../DESIGN.md#shapes)):

- Control 4 px; card, list có khung, composer, alert, menu, toast và panel khung 6 px; dialog 12 px (trước
  ghi 16 px nhưng `Dialog` đã dùng 12 px). Thay quyết định "card 12 · dialog 16" ngày 2026-10-08.
- `rounded-md`/`rounded-lg` ngoài dialog chỉ còn cho ô icon/avatar lớn.
- Khung chứa dùng `border-default`; composer, `ProposalCard`, khung trong `AiPanel` và `AccountsPage` bỏ
  `border-strong`/`border-input`. Focus thể hiện bằng outline.

**2026-10-08 (lần ba)**, thay hai quyết định trước đó trong ngày (skin "paper" và khung kính). Chủ sản
phẩm yêu cầu:

- **Cách tổ chức và hệ size theo design system của LMS v3 (`D:\izone\lms-v3`):**
  - token chia ba tầng foundation → semantic → component;
  - tắt thang mặc định của Tailwind;
  - component dựng trên Base UI theo mô hình màu × kiểu × cỡ.
- **Style theo ảnh Acme** (hộp thư, tệp `e841384458…jpg` chủ sản phẩm gửi):
  - nền trắng, rail `#fafafa`, ngăn cách bằng viền mảnh;
  - hàng đang chọn là lớp phủ xám;
  - màu chỉ dùng cho trạng thái.
- **Chữ và icon theo Obsidian:**
  - chữ giao diện 12 / 13 / 15 / 20 px, chữ đọc 16 px, dòng 1,5 / 1,3;
  - icon 14 / 16 / 18 px. Ribbon 44 px là số tham chiếu Obsidian; rail Mira hiện rộng 48 px.
- **Xoá toàn bộ component cũ** ở `src/renderer/src/components/` và dựng lại bộ mới ở
  [`components/ui/`](../../../src/renderer/src/components/ui/).

**Quyết định lịch sử ngày 2026-10-08:** chủ sản phẩm từng gỡ giao diện màn Thư viện để dựng lại UI.
Ngày 2026-10-09, `LibraryScreen` đã có lại lưới tác phẩm, bộ lọc, tìm kiếm, tạo và mở tác phẩm.

Hướng Hermes, hướng "paper" và hướng Obsidian trước đó chỉ còn giá trị lịch sử:
[phân tích Hermes](hermes-comparison.md), [nghiên cứu kính trên nền ảnh](soft-glass-research.md),
[phân tích Obsidian](obsidian-comparison.md).

**Font hiện tại:** Inter 4.1 (variable, SIL OFL) cho giao diện, đóng gói ở `assets/fonts/` vì CSP không
cho tải font từ CDN. Editor và chế độ câu dùng font hệ thống (`Segoe UI Variable Text` trên Windows),
cỡ 16 px, dòng 1,5; chữ Trung, Nhật rơi về font CJK của hệ thống. Code và định danh kỹ thuật dùng
JetBrains Mono. Google Sans Flex đã gỡ.

**2026-10-21: Chuẩn hóa toàn bộ control UI và focus theo VS Code.**
Chủ sản phẩm yêu cầu điều chỉnh các button và control đang bị to trên toàn bộ UI, đưa về kích thước desktop editor gọn gàng, thuận mắt như VS Code và sửa viền focus ô nhập chỉ outline nhẹ 1px ôm khít viền trong:
- **Thang control chuẩn hóa 24 / 28 / 32 px (thay thế thang cũ 24 / 32 / 40 px):**

  | Cỡ | Cao | Chữ nhãn | Đệm ngang | Bo góc | Icon |
  | --- | --- | --- | --- | --- | --- |
  | `sm` | 24 | 12 (`label-xs`) | 8 | 4 | 14 |
  | `md` (mặc định) | 28 | 12 (`label-xs`) | 10 | 4 | 16 |
  | `lg` | 32 | 13 (`label-sm`) | 12 | 4 | 16 |

  - Mặc định là 28 px theo chuẩn VS Code (`monaco-text-button`), giúp nút và ô nhập trên toàn màn hình không bị quá khổ hay thô.
  - Mọi control đứng cạnh nhau (Button, Input, Select trigger, ButtonGroup, NavItem, DropdownMenu item, Tabs) cùng chung chiều cao 28 px ở cỡ `md`.
  - CompactButton theo thang này: 28 / 24 / 20 px.
- **Focus của ô nhập liệu (Input, Textarea, Select):**
  - Chuyển từ outline 2px quầng ngoài (`outline-offset-1`) sang outline 1px solid ôm khít viền trong (`outline-offset: -1px`, `has-[:focus]:outline-1 has-[:focus]:-outline-offset-1`) đúng như VS Code (`style.css:274-277`), sắc nét, thanh thoát và không làm nở khung.
- **Focus của nút bấm và điều khiển:** Giảm từ `outline-2` xuống `outline-1` đồng bộ.

**2026-10-08, cùng tối: thang control cho app desktop.** Chủ sản phẩm duyệt đề xuất sau khi đối chiếu
`DESIGN.md`, `DESIGN-REVIEW.md` của LMS v3 với các nguyên lý thị giác. Bộ size chép từ LMS là của một
app web, và ba component lệch nhau: nút sm 24 cạnh ô nhập sm 32, ButtonGroup md 36 nhưng sm 28. Quyết
định gồm năm điểm:

- **Một thang control chung** cho Button, Input, ButtonGroup và trigger của Select, theo lưới 4 px:

  | Cỡ | Cao | Chữ nhãn | Đệm ngang | Bo góc | Icon |
  | --- | --- | --- | --- | --- | --- |
  | `sm` | 24 | 12 (`label-xs`) | 8 | 4 | 14 |
  | `md` (mặc định) | 32 | 13 (`label-sm`) | 12 | 6 | 16 |
  | `lg` | 40 | 15 (`label-md`) | 16 | 8 | 18 |

  - Mặc định là 32, như Obsidian và Linear. LMS dùng 36 / 48, quá thưa cho một công cụ dày đặc.
  - Chữ nhãn bằng khoảng 40 % chiều cao. Ở 36 px, chữ 13 làm nút trông rỗng.
  - Đệm nằm ở nút; nhãn bên trong không thêm đệm riêng.
  - CompactButton theo thang này: 28 / 24 / 20.
- **Bo góc theo app desktop:** `xs` 4 · `sm` 6 · `md` 8 · `lg` 12 (card) · `xl` 16 (dialog).
  - Bo góc control bằng ¼ chiều cao hoặc ít hơn. Thang LMS (8 / 12 / 16) cho nút 36 bo 12, tròn như
    app web tiêu dùng.
  - Hộp lồng trong hộp lấy bo góc ngoài trừ khe giữa hai hộp. Ví dụ: track ButtonGroup bo 6, đệm 2,
    nên lựa chọn bên trong bo 4.
- **Viền ô nhập và track của Switch đạt 3:1** (WCAG 1.4.11, chính `DESIGN.md` của LMS cũng yêu cầu).
  - Trước đó `neutral-300` chỉ đạt 1,35:1 trên nền trắng, còn `neutral-700` trên nền tối là 1,68:1.
  - Thêm hai bậc xám: `neutral-350` `#949494` cho theme sáng, `neutral-550` `#666666` cho theme tối.
  - Viền trang trí (`border-default`) vẫn mảnh như ảnh Acme.
- **Chữ:**
  - Giữ thang 12 / 13 / 15 / 20 và chữ đọc 16.
  - Dòng 1,5 cho đoạn văn: LMS dùng khoảng 1,25, quá chật cho dấu tiếng Việt.
  - Dòng 1,3 chỉ dùng cho nhãn một dòng.
  - `text-title` khít lại −0,015em, vì Inter ở 20 px thưa.
- **ButtonGroup** không xuống dòng nhãn (`whitespace-nowrap`).

**Mira khác LMS v3 ở bốn chỗ:**

- **Không có màu thương hiệu.** Nút chính là màu trung tính đảo (than `#1a1a1a` trên nền sáng), như
  ảnh Acme. LMS có màu đỏ brand.
- **Thêm lớp phủ hover/chọn kiểu Obsidian** (`bg-hover` đen 4 %, `bg-selected` đen 6 %). Nhờ vậy hàng
  đang chọn đúng trên mọi nền; LMS dùng nền đặc.
- **Header 40 px** như thanh tab của Obsidian; LMS dùng 56 px.
- **Chữ truyện theo editor của Obsidian** (2026-10-08, chủ sản phẩm yêu cầu; thay quyết định dòng
  1,65 trước đó):
  - font hệ thống (Segoe UI Variable trên Windows), không phải Inter;
  - cỡ 16 px, dòng 1,5;
  - heading 1,618 / 1,462 / 1,318 em (khoảng 26 / 23 / 21 px), H1 đậm 700, H2 và H3 đậm 600;
  - câu truyện ở chế độ câu dùng cùng font và cỡ với editor (trước là 13 px).

  Khung quanh editor (tiêu đề panel, thanh trạng thái, nút) vẫn dùng Inter và thang 12 / 13 px.

**Giữ từ trước:**

- vòng focus 2 px khi dùng bàn phím;
- chữ truyện và câu trả lời AI chọn được, chữ của khung thì không;
- icon Reicon (thay Solar ngày 2026-10-11);
- zoom 100 %;
- bỏ "Tác phẩm gần đây" và nút "Tạo tác phẩm" khỏi thanh bên.

## Tổ chức token

Mọi token nằm ở [`styles/`](../../../src/renderer/src/styles/):

| File | Nội dung |
| --- | --- |
| [`index.css`](../../../src/renderer/src/styles/index.css) | Điểm vào: Tailwind, `theme.css`, font, lớp base, thanh cuộn, vùng kéo cửa sổ |
| [`theme.css`](../../../src/renderer/src/styles/theme.css) | Nơi duy nhất biến token thành utility Tailwind |
| [`strict.css`](../../../src/renderer/src/styles/strict.css) | Tắt màu, bo góc, cỡ chữ, bóng mặc định của Tailwind: `bg-red-500`, `rounded-2xl`, `text-sm` không sinh CSS |
| [`tokens/foundation.css`](../../../src/renderer/src/styles/tokens/foundation.css) | Tầng 1, giá trị thô `--mira-*`: thang xám 0…1000, năm màu trạng thái, bo góc, khoảng cách, chữ, icon, bóng, chuyển động, lớp chồng, khung cửa sổ |
| [`tokens/semantic.css`](../../../src/renderer/src/styles/tokens/semantic.css) | Tầng 2, theo theme (sáng / tối): nền, chữ, viền, focus, trạng thái 4 bậc. Chỉ trỏ về tầng 1 |
| [`tokens/component.css`](../../../src/renderer/src/styles/tokens/component.css) | Tầng 3: `--mira-button-*`, `--mira-input-*`, `--mira-nav-*`, `--mira-switch-*`, `--mira-tooltip-*`. Chỉ component đó đọc |

Mỗi thuộc tính có namespace riêng, nên tên nói luôn nó dùng ở đâu:

| Nhóm | Utility |
| --- | --- |
| Nền | `bg-default` (khung, rail) · `bg-surface` (vùng làm việc, card, popover) · `bg-subtle` (đầu bảng, cột phụ) · `bg-muted` (chip, track, bong bóng) · `bg-hover` · `bg-selected` · `bg-inverted` · `bg-backdrop` · `bg-line` (vạch 1 px) |
| Chữ | `text-default` · `text-emphasis` · `text-subtle` (mô tả) · `text-muted` (meta, giờ, số đếm) · `text-faint` (chỉ trang trí) · `text-placeholder` · `text-link` · `text-inverted` |
| Viền | `border-default` · `border-subtle` · `border-strong` · `border-input` |
| Trạng thái | `success`, `info`, `warning`, `error`, `accent`, mỗi màu 4 bậc: `-emphasis` (chữ trên nền nhạt), gốc (chữ, icon, chấm), `-muted` (viền), `-subtle` (nền nhạt). Dùng được cho mọi thuộc tính: `text-error`, `bg-success-subtle`, `border-warning-muted` |
| Kiểu chữ | `text-body-xs/sm/md/lg` (12/13/15/16, dòng 1,5) · `text-label-xs/sm/md` (đậm 500, dòng 1,3) · `text-heading` (15, 600) · `text-title` (20, 600) |
| Khác | `rounded-xs/sm/md/lg/xl/full` (4/6/8/12/16) · `shadow-xs/sm/md/lg` · khoảng cách có tên `p-md`, `gap-xs` (2xs 4 … 4xl 48) · `z-(--mira-z-modal)` |

**Thứ tự lớp chồng:** sticky < backdrop < modal < dropdown < toast < tooltip. Menu mở từ trong dialog
nằm trên dialog.

**Icon** theo thang Obsidian ở [`icon.ts`](../../../src/renderer/src/components/ui/icon.ts): 12 (dấu
đóng trong tab), 14 (trong nút nhỏ, menu), 16 (mặc định), 18 (nút lớn), 24 (trạng thái rỗng).

**2026-10-11 — bộ glyph Reicon.** Toàn bộ renderer dùng `reicon-react` qua điểm vào nội bộ
[`reicon.ts`](../../../src/renderer/src/components/ui/reicon.ts), thay `@solar-icons/react`. Các màn vẫn
dùng thang cỡ phía trên, màu kế thừa từ `currentColor`, và mặc định dùng Outline 1,5 px. Filled chỉ dùng
cho trạng thái đang chọn hoặc đã đánh dấu, hiện có ngôi sao yêu thích model. Import trực tiếp từng module
icon giữ tree-shaking rõ ràng; test token chặn việc đưa Solar trở lại. Reicon phát hành theo giấy phép MIT
và hỗ trợ thuộc tính SVG/ARIA, theo tài liệu React chính thức tại <https://reicon.dev/docs/react>.

**Tương phản**, tính ngày 2026-10-08:

| Theme | Nền | Chữ | Subtle | Muted | Link | Chữ trên nút chính |
| --- | --- | --- | --- | --- | --- | --- |
| Sáng | `#ffffff` / `#fafafa` | 17,4 / 16,7 | 6,7 / 6,4 | 4,7 / 4,5 | 21,0 | 17,4 |
| Tối | `#1a1a1a` / `#141414` | 16,0 / 16,9 | 6,9 / 7,3 | 5,0 / 5,3 | 17,4 | 16,0 |

Chữ trạng thái trên nền trắng: error 6,5, warning 5,2, success 5,0, accent 6,0.

Viền ô nhập và track Switch: 3,0 trên nền sáng (`#949494`), 3,0 trên nền tối (`#666666`).

**Tạm thời chỉ dùng đen, trắng, xám** (2026-10-08, chủ sản phẩm yêu cầu). Màu chỉ còn ở các trạng thái
(success, info, warning, error, accent) và nút xoá. Cụ thể:

- **Vòng focus** đổi từ xanh dương sang xám: `neutral-500` trên nền sáng (4,7:1), `neutral-450` trên
  nền tối (5,0:1). Cả hai vẫn trên mức 3:1 mà dấu focus cần.
- **Ô nhập giữ vòng focus xám** như mọi control. Đã thử bỏ vòng và chỉ đậm viền khi đang gõ, rồi
  quay lại vòng (cùng ngày).
- **Link** là chữ đậm nhất (đen / trắng) kèm gạch chân.
- **Vùng chọn** (nền hàng chọn, bôi đen chữ truyện) là lớp phủ xám thay cho xanh và vàng highlight.
- **Icon trang trí** không mượn màu trạng thái nữa: ngôi sao ở đầu panel AI đổi sang `text-subtle`.

## Khung cửa sổ

[`AppShell.tsx`](../../../src/renderer/src/app/AppShell.tsx) và `AppNav.tsx` theo bố cục Acme: các mặt
phẳng chia bằng viền mảnh.

- **Thanh trên là thanh tiêu đề** (window controls overlay): Windows chỉ vẽ ba nút cửa sổ ở đầu phải.
  - **Nền ba nút trong suốt** (`rgba(1, 0, 0, 0)`, cách Hermes Desktop làm; đổi ngày 2026-10-08).
    Thanh trên của trang hiện xuyên qua, nên lớp phủ dialog phủ lên góc ba nút như phần còn lại của
    thanh, kể cả lúc mờ dần và blur.
  - Trước đó nền là màu đặc, được đổi tối khi có dialog. Màu đổi trong một bước còn lớp phủ mờ dần,
    nên ô ba nút giật và lệch màu; cách này đã bỏ.
  - Biểu tượng là `--mira-text-subtle`, đổi theo theme, nên liền với các icon của thanh. Bản chép màu
    ở [`titleBar.ts`](../../../src/main/electron/titleBar.ts) có test đối chiếu với token.
- **Điều hướng hiện tại** (quyết định 2026-10-09):
  - các màn cấp app có sidebar rộng 224 px, thu được thành activity bar 40 px (trước 2026-10-22 là rail
    48 px);
  - sidebar chứa Tìm, Trang chủ, Thư viện, Tác vụ, Cập nhật, nhóm Tài nguyên, Cài đặt và theme;
  - màn Chương tạm không hiện app sidebar để giữ chiều rộng cho editor; Ctrl+B ở đây vẫn điều khiển
    cột danh sách chương.
- **Thanh trên cao 40 px:** nằm bên phải app sidebar; tên màn ở trái, nút riêng ở phải. Khi app sidebar
  bị ẩn ở màn Chương, theme và Cài đặt trở lại cuối thanh trên.
- Quyết định “không rail” ngày 2026-10-08 chỉ còn giá trị lịch sử; xem
  [nghiên cứu thanh bên](../workspace/sidebar-research.md) và
  [tính năng toàn app](../workspace/app-level-features.md).
- **Cuộn mượt** (2026-10-08):
  - Cờ `enable-smooth-scrolling` của Chromium ở main không đủ: trên Windows mỗi nấc chuột vẫn nhảy
    khoảng 100 px gần như tức thì.
  - [`app/smoothWheel.ts`](../../../src/renderer/src/app/smoothWheel.ts) tự cuộn khung gần con trỏ
    nhất qua vài khung hình, khoảng 250 ms, không cần thư viện.
  - Chỉ áp dụng cho chuột có nấc. Touchpad có quán tính riêng nên giữ nguyên.
  - Tắt khi Windows bật giảm chuyển động, khi giữ Ctrl, khi cuộn ngang.
  - Dừng ngay nếu người dùng kéo thanh cuộn hay bấm phím giữa chừng.
  - Cuộn bằng code (bám câu trả lời AI) vẫn tức thì.
- **Cột danh sách** rộng 260 px, chỉ có ở màn Chương. Ctrl + B ẩn/hiện.
- **Không có kính acrylic** (gỡ ngày 2026-10-08, chủ sản phẩm quyết định sau khi thử bản làm theo
  Hermes). Cửa sổ luôn nền đặc theo theme. Cài đặt › Giao diện chỉ còn Theme.

## Component

Ở [`components/ui/`](../../../src/renderer/src/components/ui/), dựng trên `@base-ui/react`. Bảng variant
nằm riêng ở [`variants.ts`](../../../src/renderer/src/components/ui/variants.ts) để file component chỉ
export component (yêu cầu của React fast refresh). `variants()` và `cn()` ở
[`lib/cn.ts`](../../../src/renderer/src/lib/cn.ts) thay cho `class-variance-authority`.

**`cn()` gộp class bằng `tailwind-merge` 3.7.0 (từ 2026-10-22):** khi hai class cùng đặt một thuộc tính,
class đứng sau thắng, nên `className` truyền vào component luôn đè được class gốc mà không cần `!`. Trước
đó `cn()` chỉ nối chuỗi; bên thắng phụ thuộc thứ tự CSS mà Tailwind sinh ra, nên `resize-none`, `w-24`,
`rounded-full`, `px-1.5`… truyền vào component bị class gốc đè ở 18 chỗ (rà bằng cách render từng chỗ và so
thứ tự trong CSS đã build). Thang token riêng (`text-body-*`, `text-label-*`, `p-xs`, `gap-2xs`,
`leading-text`, `ease-standard`…) được khai báo trong `extendTailwindMerge`; thêm token mới vào
`styles/theme.css` thì phải thêm vào đó, nếu không `tailwind-merge` sẽ hiểu sai nhóm, ví dụ coi cỡ chữ là
màu chữ và xóa mất một class.

**Ownership component (quyết định 2026-10-10, chưa hoàn tất refactor):** `components/ui` chỉ chứa
primitive hoặc pattern trung lập domain. Component biết thuật ngữ và hành vi của library, workspace,
kết nối AI, ngữ cảnh hoặc nguồn phải nằm trong module sở hữu; việc có hai consumer không tự động biến nó
thành UI primitive. Xem [kiến trúc frontend](../frontend-architecture/README.md) và
[`ARCHITECTURE.md`](../../../ARCHITECTURE.md).

| Component | Dùng khi |
| --- | --- |
| `Button` | Màu `neutral` / `danger` × kiểu `solid` / `outline` (mặc định) / `light` / `ghost` × cỡ `lg` 40 / `md` 32 / `sm` 24. `solid` là hành động chính, tối đa một nút mỗi màn. Có `leftIcon`, `rightIcon`, `icon` (nút vuông), `loading` |
| `CompactButton` | Nút chỉ có icon trong thanh, hàng, tab: 28 / 24 / 20 px; bắt buộc `aria-label` |
| `LinkButton` | Hành động dạng chữ, màu link hoặc trung tính |
| `ButtonGroup` | Chọn một trong vài lựa chọn, cao bằng nút cùng cỡ (32 / 24); thay `SegmentedControl` |
| `Badge` | Trạng thái hoặc phân loại: 6 màu × `light` / `outline` / `plain`, tuỳ chọn chấm |
| `Alert` | Thông báo gắn với một vùng; thay `Banner` |
| `Dialog` | `sm` 400 / `md` 512 / `lg` 760 px, có nút đóng, phần thân cuộn được, `footer` |
| `MenuRoot`… | Menu thả xuống, submenu, nhóm radio; hàng 32 px |
| `Tip` | Tooltip chữ, màu đảo, trễ 200 ms |
| `Toaster` | Thông báo nổi: lỗi và cảnh báo ở giữa trên, còn lại góc dưới phải |
| `Field`, `TextField`, `TextareaField` | Nhãn luôn hiện, gợi ý hoặc lỗi bên dưới; thay `TextField` và `TextArea` cũ |
| `Input`, `SearchInput`, `Textarea`, `Kbd` | Ô nhập không nhãn: `md` 32 / `sm` 24 px, bằng nút đứng cạnh |
| `Select`, `Switch` (36 × 20), `Slider`, `TabsRoot`… | Tabs có kiểu `line` (gạch chân) và `pill` (track xám) |
| `Card`, `EmptyState`, `Spinner` | `Card` thay `Panel` |
| `CardButton` | Card mà toàn bộ bề mặt mở một đối tượng; không đặt control khác bên trong |
| `ProgressBar` | Tiến độ 0–100, có nhãn hỗ trợ và tone trạng thái |
| `ConfirmDialog` | Xác nhận thao tác không hoàn tác, dựng từ `Dialog` và `Button` |
| `SettingRow`, `SectionHeading`, `SettingsSection` | Dòng cài đặt kiểu Obsidian: tên, mô tả, control bên phải |
| `NavItem` | Hàng 32 px của cột danh sách hoặc điều hướng (chương, trang cài đặt). Hàng đang mở có lớp phủ chọn và `aria-current`; có `leading`, `trailing`, `strong` |
| `ActionRow` | Lựa chọn dẫn tới bước khác: tiêu đề, mô tả, nhãn, mũi tên; cả hàng bấm được (chọn nhà cung cấp, chọn tài khoản) |
| `Disclosure` | Dòng chữ mờ mở ra chi tiết: model đã nghĩ gì, đã gọi công cụ nào, một nhóm model |
| `Checkbox`, `RadioGroup`, `Radio` | Ô 16 px viền `border-input`, tô màu chính khi bật; cả nhãn bấm được |
| `ListOption` | Một lựa chọn trong danh sách do ô nhập tự điều khiển (combobox, kết quả tìm kiếm), `role="option"` |
| `PickerTrigger` | Nút mở một bộ chọn tự dựng (menu model): giá trị cắt bớt, nhãn phụ, mũi tên; kiểu `field` (khung ô nhập) hoặc `ghost` (trong thanh) |
| `DropZone` | Ô viền đứt để kéo thả hoặc bấm chọn file, sáng lên khi kéo file qua (ảnh bìa) |

**Quy tắc (2026-10-08, chủ sản phẩm yêu cầu, giống LMS v3):**

- Màn feature không tự viết control. Mọi nút, ô nhập, lựa chọn đều lấy từ `components/ui/`.
- Khi chưa có component phù hợp, thêm component chung vào đó, không style tại chỗ.
- Mọi control dùng cỡ mặc định `md`. Màn không truyền `size="sm"` hay `size="lg"`; hai cỡ này chỉ
  còn để component chung dùng bên trong.
- Ngoại lệ:
  - `<input type="file">` ẩn; control nhìn thấy để mở picker vẫn phải dùng component chung;
  - textarea là mặt viết của một trình soạn có khung riêng: `AiComposer`.

Phép kiểm hiện miễn `input[type="file"]` theo loại input, chưa tự xác nhận nó thật sự ẩn; đây vẫn là
yêu cầu review. Proxy file picker viết tay ở `GlossaryDialogs.tsx` là nợ cần chuyển thành component chung.

Các màn feature được chuyển bằng codemod:

- khoảng 1.340 tên token cũ đã đổi sang tên mới;
- 56 file đổi import và props;
- 50 cỡ icon dồn về thang Obsidian.

## Phép kiểm

[`tokens.test.ts`](../../../src/renderer/src/styles/tokens.test.ts) fail khi:

- một màn dùng cỡ chữ, line-height, tracking, bo góc hoặc bóng tùy ý, dùng cỡ chữ Tailwind
  (`text-sm`), hoặc dùng icon ngoài thang 12/14/16/18/24;
- một màn viết số z-index, dùng lại tên cũ (`bg-canvas`, `text-ink`, `rounded-control`…), đọc biến
  CSS chưa định nghĩa, hoặc đọc token tầng component ngoài `components/ui`;
- tầng semantic có mã màu thô, đọc biến ngoài tầng foundation, hoặc thiếu token ở một trong hai theme;
- một màn viết `<button>`, `<input>`, `<textarea>`, `<select>` (trừ ngoại lệ ở trên), hoặc truyền
  `size="sm"` / `size="lg"` cho một control.

[`components.test.ts`](../../../src/renderer/src/components/ui/components.test.ts) kiểm:

- cỡ của Button;
- trạng thái loading;
- nhãn và lỗi của TextField;
- Badge;
- Tooltip;
- mọi component tương tác có vòng focus.

[`titleBar.test.ts`](../../../src/main/electron/titleBar.test.ts) đối chiếu màu nút cửa sổ, màu khởi
động và chiều cao header với token.

## Đã kiểm và phạm vi bằng chứng

Snapshot ngày 2026-10-08, trước app sidebar và Thư viện mới:

- `node scripts/check.mjs` qua: typecheck, 2.208 test, lint 0 lỗi.
- Dò bản build không còn class nào thiếu CSS.
- Đã chạy bản build trên Windows 11 với bản sao thư viện thật trong thư mục tạm và chụp màn Chương
  (sáng), Thư viện (sáng, tối) và Cài đặt (sáng).

Ảnh trên không xác minh AppNav, PageFrame, Trang chủ hoặc Thư viện được thêm ngày 2026-10-09.
Wireframe và ảnh xác nhận phương án A không được lưu trong repo, nên chưa phải visual regression
artifact tái chạy được.

## Giới hạn

- **Màn feature vẫn còn style viết tay.** Header phụ màn Chương vẫn 36 px; một số kích thước tùy ý và
  `font-semibold` chưa đổi sang component/token có tên.
- `NavItem` đã dùng cho app nav, danh sách chương và mục Cài đặt. Thư viện đã có đường tạo và mở tác phẩm.
- Màn Chương tạm chưa dùng app sidebar; bố cục cuối cùng chưa chốt.
- Tác vụ, Cập nhật, Kho dùng chung, Prompt & văn phong, Trợ lý AI và bảng lệnh vẫn là mock.
- Chưa có visual regression artifact được lưu trong repo.
- **Theme tối là suy ra**; ảnh Acme chỉ có bản sáng.

---

[Mục lục module](../README.md) · [Quy tắc UI](../../../DESIGN.md) ·
[Phân tích Obsidian](obsidian-comparison.md) ·
[Phân tích Hermes (lịch sử)](hermes-comparison.md) ·
[Nghiên cứu kính trên nền ảnh (lịch sử)](soft-glass-research.md)
