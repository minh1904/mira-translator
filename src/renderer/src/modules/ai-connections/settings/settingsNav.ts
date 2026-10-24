/**
 * Danh sách các nhóm và trang trong modal Cài đặt.
 */
export const SETTINGS_GROUPS = [
  {
    id: 'model',
    label: 'Model',
    pages: [
      { id: 'main', label: 'Model chính' },
      { id: 'models', label: 'Danh sách model' },
      { id: 'fallbacks', label: 'Dự phòng' },
      { id: 'auxiliary', label: 'Model phụ' }
    ]
  },
  {
    id: 'connections',
    label: 'Kết nối AI',
    pages: [
      { id: 'accounts', label: 'Tài khoản' },
      { id: 'keys', label: 'Khóa API' },
      { id: 'endpoints', label: 'Endpoint tùy chỉnh' },
      { id: 'local', label: 'Trên máy' }
    ]
  },
  { id: 'appearance', label: 'Giao diện', pages: [{ id: 'general', label: 'Chung' }] },
  { id: 'sources', label: 'Nguồn truyện', pages: [{ id: 'general', label: 'Chung' }] },
  { id: 'about', label: 'Về Mira', pages: [{ id: 'general', label: 'Phiên bản' }] }
] as const

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id']

export interface SettingsLocation {
  group: SettingsGroupId
  page: string
  /** Khóa định danh hàng hoặc thẻ cần cuộn tới và làm nổi bật, ví dụ: `provider:google`. */
  key?: string
}

/** Vị trí trang mặc định khi mở modal cài đặt. */
export const DEFAULT_SETTINGS_LOCATION: SettingsLocation = { group: 'model', page: 'main' }

export function groupOf(id: SettingsGroupId): (typeof SETTINGS_GROUPS)[number] {
  return SETTINGS_GROUPS.find((group) => group.id === id) ?? SETTINGS_GROUPS[0]
}

/** Chuẩn hóa vị trí trang thuộc nhóm hợp lệ; nếu trang không tồn tại thì dùng trang đầu tiên của nhóm. */
export function normalizeLocation(location: SettingsLocation): SettingsLocation {
  const group = groupOf(location.group)
  const page = group.pages.some((item) => item.id === location.page)
    ? location.page
    : group.pages[0].id
  return { group: group.id, page, ...(location.key ? { key: location.key } : {}) }
}

/** Tạo danh sách breadcrumb điều hướng (ví dụ: 'Cài đặt › Kết nối AI › Khóa API'). */
export function breadcrumbOf(location: SettingsLocation): string[] {
  const group = groupOf(location.group)
  const page = group.pages.find((item) => item.id === location.page)
  return group.pages.length > 1 && page
    ? ['Cài đặt', group.label, page.label]
    : ['Cài đặt', group.label]
}
