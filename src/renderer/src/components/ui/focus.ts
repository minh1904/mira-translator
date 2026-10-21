/**
 * Viền focus bàn phím áp dụng cho các phần tử điều khiển (nút bấm, công tắc, checkbox, thẻ).
 * Theo chuẩn VS Code: viền outline 1px rõ nét, thanh lịch mà không bị dày cộm.
 */
export const focusRing =
  'outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * Viền focus cho các ô nhập văn bản trực tiếp (Textarea, Select trigger):
 * Theo kiểu VS Code (input:focus, textarea:focus, select:focus):
 * outline 1px solid, outline-offset -1px ôm khít viền trong, nhẹ nhàng và sắc nét khi focus.
 */
export const inputFocusRing =
  'outline-none focus:outline-1 focus:outline-solid focus:-outline-offset-1 focus:outline-focus focus-visible:outline-1 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-focus'

/**
 * Viền focus cho khung chứa ô nhập liệu (khung Input bọc ngoài):
 * Khi ô nhập bên trong nhận focus, khung ngoài nhận outline 1px thanh mảnh ôm khít viền như VS Code.
 */
export const focusWithinRing =
  'outline-none has-[:focus]:outline-1 has-[:focus]:outline-solid has-[:focus]:-outline-offset-1 has-[:focus]:outline-focus'
