/**
 * Các tính năng hiện chỉ hiển thị giao diện minh họa ("Sắp có").
 * Không thực hiện đọc file, gọi tiến trình chính hay ghi dữ liệu. Xóa mục tương ứng khi tính năng hoàn thiện.
 */
export interface MockFeature {
  id: string
  label: string
}

export const SOON_LABEL = 'Sắp có'

export const MOCK_FEATURES = {
  importTxt: { id: 'import-txt', label: 'Nhập từ .txt' },
  contextArea: { id: 'context-area', label: 'Ngữ cảnh' },
  sourcesArea: { id: 'sources-area', label: 'Nguồn' },
  // Bảng "Hỏi AI" đã được triển khai chính thức và không còn thuộc danh sách giao diện minh họa.
  // Các trang điều hướng trên thanh bên: Trang chủ và Thư viện đã hoàn thiện; các thẻ phụ và các trang bên dưới là giao diện mẫu.
  homeOverview: { id: 'home-overview', label: 'Số liệu, tác vụ và hoạt động ở Trang chủ' },
  updatesPage: { id: 'updates-page', label: 'Cập nhật' },
  sharedGlossary: { id: 'shared-glossary', label: 'Kho dùng chung' },
  styleProfiles: { id: 'style-profiles', label: 'Prompt & văn phong' },
  assistantPage: { id: 'assistant-page', label: 'Trợ lý AI' },
  commandPalette: { id: 'command-palette', label: 'Tìm và lệnh (Ctrl K)' }
} as const satisfies Record<string, MockFeature>
