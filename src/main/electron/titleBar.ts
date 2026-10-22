import type { ChromeTheme } from '../../shared/contracts/desktopApi'
import { ZOOM_FACTOR } from './zoom'

/**
 * Thanh trên cùng của trang web đóng vai trò là thanh tiêu đề: hệ điều hành chỉ vẽ 3 nút điều khiển cửa sổ
 * ở góc phải của thanh đó (window controls overlay) thay vì một dải tiêu đề riêng biệt bên trên trang.
 * macOS giữ khung gốc của hệ thống vì nó đã tích hợp sẵn các nút trên một thanh thống nhất.
 */
export const OVERLAY_TITLE_BAR = process.platform !== 'darwin'

/** `--mira-header-height` trong styles/tokens/foundation.css, trước khi áp dụng tỉ lệ thu phóng (zoom). */
export const HEADER_HEIGHT = 35

/**
 * Chiều cao của các nút theo pixel cửa sổ: chiều cao thanh sau khi thu phóng, trừ đi hàng viền dưới,
 * để đường viền mảnh bên dưới thanh tiêu đề tiếp tục chạy liền mạch dưới các nút.
 */
export const TOP_BAR_HEIGHT = Math.round(HEADER_HEIGHT * ZOOM_FACTOR) - 1

/**
 * Nền trong suốt cho các nút cửa sổ: thanh trên cùng của trang sẽ hiển thị xuyên qua, nhờ đó nền làm mờ
 * của hộp thoại (backdrop) sẽ che phủ góc chứa các nút giống như phần còn lại của thanh. Màu đen trong suốt
 * hoàn toàn bị Electron hiểu là "không có màu", do đó kênh màu đỏ được gán giá trị 1.
 */
export const TRANSPARENT_OVERLAY = 'rgba(1, 0, 0, 0)'

/**
 * Màu sắc của các nút cửa sổ theo từng theme: nền trong suốt và `--mira-text-subtle` cho các biểu tượng
 * nút (glyph), tương tự các nút icon trên thanh công cụ. Màu glyph được sao chép trực tiếp vì hệ điều hành
 * vẽ biểu tượng này và không đọc được biến CSS.
 */
export const CHROME_COLORS: Record<ChromeTheme, { color: string; symbolColor: string }> = {
  dark: { color: TRANSPARENT_OVERLAY, symbolColor: '#a3a3a3' },
  light: { color: TRANSPARENT_OVERLAY, symbolColor: '#5c5c5c' }
}

/**
 * Màu của cửa sổ trước khi trang được vẽ: màu bề mặt (`--mira-bg-surface`), để khi mở ứng dụng không bị
 * chớp nháy màu khác.
 */
export const BOOT_BACKGROUND: Record<ChromeTheme, string> = {
  dark: '#1a1a1a',
  light: '#ffffff'
}
