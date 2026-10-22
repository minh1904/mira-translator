import { createContext } from 'react'

/**
 * Phần tử DOM trên thanh trên cùng nơi màn hình gắn các điều khiển thuộc về nó (hỏi AI, lưu, menu
 * chương). Có giá trị `null` cho đến khi shell được mount hoặc khi render ngoài shell.
 */
export const TopBarSlotContext = createContext<HTMLElement | null>(null)
/** Phần tử DOM ở bên trái thanh trên cùng nơi trang hiển thị tiêu đề (TopBarTitle). */
export const TopBarTitleSlotContext = createContext<HTMLElement | null>(null)
/** Phần tử DOM trên thanh trạng thái đáy cửa sổ nơi màn hình hiển thị trạng thái của nó (StatusBarItems). */
export const StatusBarSlotContext = createContext<HTMLElement | null>(null)
/** Các tab công việc bị ẩn vẫn giữ editor được mount nhưng không được chiếm quyền hành động hay phím tắt. */
export const WorkTabActiveContext = createContext(true)
