---
version: alpha
name: Mira
description: Hệ thiết kế desktop yên tĩnh, rõ ràng và tập trung cho công việc đọc, dịch và biên tập dài.
colors:
  primary: "#1a1a1a"
  canvas-light: "#fafafa"
  surface-light: "#ffffff"
  surface-subtle-light: "#fcfcfc"
  text-light: "#1a1a1a"
  text-emphasis-light: "#000000"
  text-subtle-light: "#5c5c5c"
  border-light: "#ebebeb"
  canvas-dark: "#141414"
  surface-dark: "#1a1a1a"
  surface-subtle-dark: "#1f1f1f"
  text-dark: "#f5f5f5"
  text-emphasis-dark: "#ffffff"
  text-subtle-dark: "#a3a3a3"
  border-dark: "#262626"
  success-light: "#15803d"
  info-light: "#0369a1"
  warning-light: "#c2410c"
  error-light: "#b91c1c"
  accent-light: "#be185d"
  success-dark: "#4ade80"
  info-dark: "#7dd3fc"
  warning-dark: "#fdba74"
  error-dark: "#fca5a5"
  accent-dark: "#f9a8d4"
typography:
  label-xs:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
  label-sm:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
  label-md:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.3
  title:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  body-xs:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  reading:
    fontFamily: "Segoe UI Variable Text, Segoe UI, Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "JetBrains Mono, Cascadia Code, Consolas, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  none: 0px
  3xs: 2px
  2xs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 40px
  4xl: 48px
components:
  app-canvas-light:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.text-light}"
  app-surface-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
  app-surface-subtle-light:
    backgroundColor: "{colors.surface-subtle-light}"
    textColor: "{colors.text-light}"
  heading-light:
    textColor: "{colors.text-emphasis-light}"
    typography: "{typography.title}"
  metadata-light:
    textColor: "{colors.text-subtle-light}"
    typography: "{typography.body-xs}"
  divider-light:
    backgroundColor: "{colors.border-light}"
    height: 1px
  app-canvas-dark:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.text-dark}"
  app-surface-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
  app-surface-subtle-dark:
    backgroundColor: "{colors.surface-subtle-dark}"
    textColor: "{colors.text-dark}"
  heading-dark:
    textColor: "{colors.text-emphasis-dark}"
    typography: "{typography.title}"
  metadata-dark:
    textColor: "{colors.text-subtle-dark}"
    typography: "{typography.body-xs}"
  divider-dark:
    backgroundColor: "{colors.border-dark}"
    height: 1px
  status-success-light:
    textColor: "{colors.success-light}"
  status-info-light:
    textColor: "{colors.info-light}"
  status-warning-light:
    textColor: "{colors.warning-light}"
  status-error-light:
    textColor: "{colors.error-light}"
  status-accent-light:
    textColor: "{colors.accent-light}"
  status-success-dark:
    textColor: "{colors.success-dark}"
  status-info-dark:
    textColor: "{colors.info-dark}"
  status-warning-dark:
    textColor: "{colors.warning-dark}"
  status-error-dark:
    textColor: "{colors.error-dark}"
  status-accent-dark:
    textColor: "{colors.accent-dark}"
  button-sm:
    height: 24px
    padding: 8px
    rounded: "{rounded.xs}"
    typography: "{typography.label-xs}"
  button-md:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-light}"
    height: 28px
    padding: 10px
    rounded: "{rounded.xs}"
    typography: "{typography.label-xs}"
  button-lg:
    height: 32px
    padding: 12px
    rounded: "{rounded.xs}"
    typography: "{typography.label-sm}"
  compact-button:
    size: 24px
    rounded: "{rounded.xs}"
  input-md:
    height: 28px
    padding: 10px
    rounded: "{rounded.xs}"
    typography: "{typography.body-sm}"
  card:
    rounded: "{rounded.sm}"
  panel:
    rounded: "{rounded.sm}"
  dialog-md:
    width: 512px
    rounded: "{rounded.lg}"
---

# Hệ thiết kế Mira

Cập nhật: 2026-10-10 · Trạng thái: **Quy tắc UI hiện hành**.

Tài liệu này là nguồn quy tắc thị giác và tương tác cấp repository. Frontmatter cung cấp token tối thiểu
cho công cụ; phần bên dưới giải thích cách dùng. Giá trị thực thi nằm trong
[`src/renderer/src/styles/tokens/`](src/renderer/src/styles/tokens/) và component dùng chung nằm trong
[`src/renderer/src/components/ui/`](src/renderer/src/components/ui/). Hai nơi phải được cập nhật cùng
một change; sai khác giữa chúng là lỗi tài liệu hoặc lỗi triển khai.

Kiến trúc mã nguồn, module và hướng phụ thuộc nằm ở [`ARCHITECTURE.md`](ARCHITECTURE.md). Lịch sử quyết
định, nghiên cứu và bằng chứng triển khai nằm ở
[`docs/modules/design-system/`](docs/modules/design-system/README.md).

## Overview

Mira là ứng dụng desktop cho công việc đọc, dịch và biên tập dài. Giao diện phải tạo cảm giác yên tĩnh,
chính xác và bền khi dùng nhiều giờ: ít màu trang trí, mật độ vừa phải, phân cấp bằng khoảng cách và chữ,
không bằng nhiều khung card hoặc hiệu ứng.

Năm nguyên tắc bắt buộc:

1. **Nội dung là trọng tâm.** Chrome của ứng dụng lùi lại; văn bản, bản dịch và trạng thái công việc nổi
   lên trước.
2. **Grayscale là mặc định.** Màu chỉ truyền đạt trạng thái hoặc một điểm nhấn đã có nghĩa rõ ràng.
3. **Cùng một ngôn ngữ control.** Nút, input và group dùng chung thang 24/28/32 px; kích thước mặc định
   cho màn feature là 28 px theo chuẩn desktop VS Code.
4. **Accessible từ token.** Focus luôn nhìn thấy; chữ quan trọng và cạnh control đạt contrast; màu không
   bao giờ là dấu hiệu duy nhất.
5. **Primitive trước tùy biến.** Màn feature dùng component chung. Nếu primitive thiếu khả năng thật sự
   dùng lại, mở rộng primitive và test nó thay vì dựng control tại chỗ.

## Colors

Mỗi màu đi qua ba tầng: foundation là giá trị thô, semantic nói mục đích theo theme, component token nói
vai trò trong một control. Màn feature chỉ dùng tên semantic như `bg-surface`, `text-subtle`,
`border-default`; không đọc màu foundation hay component token.

- `bg` là nền cửa sổ, `surface` là sheet/bar/popover, `subtle` là mặt phẳng thứ hai, `muted` là fill.
- `text` dùng cho nội dung, `emphasis` cho điểm nhấn, `subtle` cho nội dung phụ, `muted` cho metadata.
  `faint` chỉ dành cho trang trí, không dành cho chữ người dùng cần đọc.
- Link là chữ mạnh nhất kèm underline; không dùng xanh dương chỉ để biểu thị link.
- `success`, `info`, `warning`, `error`, `accent` lần lượt biểu thị hoàn tất, đang diễn ra/thông tin,
  cần chú ý, thất bại/nguy hiểm và điểm nổi bật không phán xét. Nhãn hoặc icon phải nói lại ý nghĩa màu.
- Theme tối dùng semantic token riêng; không đảo màu bằng filter và không suy ra màu trong component.
- Focus của ô nhập liệu dùng outline nhẹ 1px (-1px offset) như VS Code; nút bấm và điều khiển dùng outline 1px. Trạng thái lỗi có viền đỏ. Không bỏ focus ring nếu chưa có dấu focus tương đương.

## Typography

- UI dùng Inter; nội dung truyện dùng font hệ thống để đọc tiếng Việt và CJK ổn định; code dùng JetBrains
  Mono với fallback Cascadia/Consolas.
- Chỉ dùng các cỡ UI 12, 13, 15 và 20 px; nội dung đọc là 16 px. Không thêm cỡ để sửa cục bộ một màn.
- Body dùng line-height 1.5, nhãn và tiêu đề ngắn dùng 1.3. Trọng lượng hợp lệ là 400, 500 và 600.
- Tạo phân cấp theo thứ tự: nội dung, weight, màu semantic, khoảng cách. Không dùng ALL CAPS, tracking tùy
  ý hoặc nhiều cấp heading chỉ để trang trí.
- Chuỗi dài, tên model và đường dẫn phải co/cắt có chủ ý; không làm control nở vô hạn.

## Layout

- Dùng scale khoảng cách 2/4/8/12/16/20/24/32/40/48 px. Khoảng cách ngoài một nhóm phải lớn hơn hoặc
  bằng khoảng cách trong nhóm.
- Thanh tiêu đề duy nhất cao 35 px theo chuẩn VS Code, mép trái là icon app căn giữa trên cột activity bar.
  Thân cửa sổ theo Modern UI của VS Code (`floatingPanels.css`): nền vỏ cùng màu thanh tiêu đề, không viền
  dưới thanh tiêu đề và không viền trên thanh trạng thái; activity bar, sidebar, vùng làm việc và các khung
  editor là panel khung cách nhau và cách mép cửa sổ 4 px. Activity bar màn chương liền với sidebar thành một
  khối: cạnh chạm nhau vuông, sidebar bỏ viền trái để viền phải của rail là đường ngăn duy nhất; đóng
  sidebar thì rail bo đủ bốn góc. Sidebar chuẩn rộng 260 px; app sidebar hiện tại rộng 224 px và thu về
  activity bar 40 px. Mọi activity bar dùng ô 40 px với icon 18 px và vạch trái cho mục đang mở
  (`ActivityBarItem`), ngoại lệ duy nhất của thang control. Hàng đầu và hàng cuối của thanh bên mở rộng
  cùng cao 28 px.
- Ưu tiên một mặt phẳng lớn chia bằng hairline border. Card chỉ dùng khi nhóm có biên nhận thức và hành
  động riêng; không bọc mọi section trong card.
- Màn feature dùng control `md` 28 px. `sm` 24 px dành cho toolbar, table/row hoặc composition nội bộ;
  `lg` 32 px chỉ cho một hành động chính nổi bật và tối đa một lần trên một màn.
- Layout phải chịu được cửa sổ hẹp, chuỗi tiếng Việt dài và nội dung CJK. Chỉ ẩn thông tin khi có đường
  truy cập thay thế rõ ràng.
- Z-index chỉ dùng scale `sticky < backdrop < modal < dropdown < toast < tooltip`; không viết số tùy ý.

## Elevation & Depth

- Border và thay đổi surface tạo cấu trúc chính; shadow chỉ giúp phần tử nổi thật sự tách khỏi mặt phẳng.
- `shadow-xs` cho control nổi nhẹ; `sm` cho menu/popover; `md` cho dialog; `lg` chỉ dành cho lớp phủ lớn.
- Dialog luôn có backdrop, focus trap, close affordance và phần thân cuộn được khi cần.
- Không dùng acrylic/glass. Cửa sổ và panel có nền đặc ở cả hai theme.
- Motion chỉ giải thích thay đổi trạng thái: 120 ms cho feedback nhỏ, 200 ms mặc định, 300 ms cho chuyển
  cảnh lớn. Tôn trọng `prefers-reduced-motion`; không animation trang trí lặp lại.

## Shapes

- Radius theo thang 0/4/6/8/12/16 px; pill chỉ cho tag, switch track hoặc affordance thật sự tròn.
- Radius theo ba tầng của Modern UI VS Code (`contrib/modernUI/browser/media/roundedCorners.css`,
  `floatingPanels.css`): lớp nổi 8, phần tử bên trong 6, control 4.
  - Control (button, input, textarea, select trigger, kbd, badge, tag, checkbox, hàng list, tab): 4 px
    (`rounded-xs`).
  - Nút icon trên toolbar (`CompactButton`), mục trong menu/select, card, list có khung, alert, code block:
    6 px (`rounded-sm`).
  - Lớp nổi và panel shell: 8 px (`rounded-md`). Gồm activity bar, thanh điều hướng, sidebar, vùng làm việc,
    editor, panel Agent, composer, menu/select/context menu, tooltip, toast, thanh thao tác nổi, dialog,
    command palette, Cài đặt, Onboarding. Cạnh hai panel liền khối (rail + sidebar) không bo.
  - Switch, radio, chấm trạng thái, thanh tiến độ, nút tròn nổi: `rounded-full`.
  - `rounded-lg`/`rounded-xl` chỉ dành cho ô icon/avatar lớn (≥ 32 px), không cho khung chứa.
- Phần tử nằm trong phần tử khác không bao giờ bo tròn hơn khung cha; dùng radius bằng hoặc nhỏ hơn theo
  khoảng cách inset, tránh nhiều đường cong cạnh nhau không đồng tâm.
- Viền luôn 1 px. Khung chứa (panel, card, composer lúc nghỉ) dùng `border-default`; `border-input` chỉ
  cho ô nhập liệu đơn lẻ; `border-strong` cho hover của control và lớp phủ nằm trên backdrop. Trạng thái
  focus thể hiện bằng outline, không làm đậm viền khung chứa.
- Icon dùng Reicon Outline với nét mặc định 1,5 px và thang 12/14/16/18/24 px. Chỉ dùng Filled để biểu
  thị trạng thái đang chọn hoặc đã đánh dấu. Dùng glyph trơn, không khung tròn/vuông bao ngoài (X, Stop,
  Check, Add); chỉ giữ khung khi Reicon không có bản trơn, như dấu "!", "i", "?". Icon tương tác phải nằm trong hit target của component,
  không tự quyết định kích thước vùng bấm.

## Components

- `components/ui` chỉ chứa primitive hoặc pattern trung lập domain. Component biết chương, tác phẩm,
  glossary, model hoặc connection thuộc module sở hữu theo `ARCHITECTURE.md`.
- Button có tone `neutral` hoặc `danger`, variant `solid`, `outline`, `light`, `ghost`. `outline` là mặc
  định; `solid` là primary action; destructive action dùng `danger` và lời xác nhận phù hợp.
- CompactButton chỉ có icon, bắt buộc có accessible name. Không dùng icon không nhãn khi nghĩa có thể mơ
  hồ.
- Input, select trigger và button đứng cạnh nhau phải cùng chiều cao. Field có label luôn hiện, help/error
  nằm dưới và trạng thái invalid có cả chữ lẫn style.
- Badge chỉ diễn tả trạng thái/phân loại, không đóng vai button. CardButton không chứa control tương tác
  khác bên trong.
- Dialog dùng 400/512/760 px cho `sm`/`md`/`lg`; hành động chính ở cuối, hành động phá hủy không được đặt
  làm lựa chọn mặc định vô tình.
- Tất cả control phải hỗ trợ keyboard, focus-visible, disabled và loading nếu có thao tác bất đồng bộ.
  Dùng Base UI primitive hiện có trước khi tự triển khai hành vi ARIA.

## Do’s and Don’ts

### Nên

- Dùng semantic token và component UI hiện có.
- Giữ một primary action rõ ràng, wording là động từ cụ thể.
- Dùng khoảng trắng, heading và divider để nhóm nội dung.
- Kiểm cả theme sáng/tối, bàn phím, reduced motion, tiếng Việt dài và trạng thái loading/error/empty.
- Cập nhật token, component test, tài liệu module và file này trong cùng change khi đổi quy tắc chung.

### Không nên

- Không viết mã màu, cỡ chữ, radius, shadow hoặc z-index tùy ý trong màn feature.
- Không dùng màu semantic để trang trí hoặc dùng màu làm tín hiệu duy nhất.
- Không tự viết `<button>`, input/select/textarea nhìn thấy được khi primitive chung đã tồn tại.
- Không truyền `sm`/`lg` từ màn feature chỉ để ép layout; sửa composition hoặc primitive owner trước.
- Không đưa component domain vào `components/ui` chỉ vì có hai consumer.
- Không thêm glass, gradient, animation hoặc card lồng nhau nếu chúng không làm rõ cấu trúc hay trạng thái.

