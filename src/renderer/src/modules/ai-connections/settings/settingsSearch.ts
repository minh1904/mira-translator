import { PROVIDER_CARDS } from '../../../../../shared/contracts/aiProviders'
import type { SettingsLocation } from './settingsNav'

export interface SettingsIndexEntry {
  title: string
  description: string
  location: SettingsLocation
}

/** Danh mục tĩnh các hàng và thẻ cài đặt có thể điều hướng tới khi tìm kiếm. */
export const STATIC_INDEX: SettingsIndexEntry[] = [
  {
    title: 'Model chính',
    description: 'Model dùng cho chat mới, hộp thoại dịch và hàng chờ dịch',
    location: { group: 'model', page: 'main', key: 'main-model' }
  },
  {
    title: 'Mức suy luận mặc định',
    description: 'Mức suy luận đi kèm model chính',
    location: { group: 'model', page: 'main', key: 'main-thinking' }
  },
  {
    title: 'Danh sách model',
    description: 'Các model hiện trong menu chọn model, mức suy luận và giới hạn của từng mục',
    location: { group: 'model', page: 'models' }
  },
  {
    title: 'Model dự phòng',
    description: 'Thử lần lượt khi model chính hết hạn mức hoặc không dùng được',
    location: { group: 'model', page: 'fallbacks', key: 'fallbacks' }
  },
  {
    title: 'Model phụ',
    description: 'Model rẻ cho việc nền của agent như tóm tắt lịch sử chat',
    location: { group: 'model', page: 'auxiliary', key: 'auxiliary-model' }
  },
  {
    title: 'Tài khoản',
    description: 'Đăng nhập bằng gói thuê bao: ChatGPT/Codex, GitHub Copilot',
    location: { group: 'connections', page: 'accounts' }
  },
  {
    title: 'Endpoint tùy chỉnh',
    description: 'Gateway tự dựng, mọi URL tương thích OpenAI',
    location: { group: 'connections', page: 'endpoints' }
  },
  {
    title: 'Ollama',
    description: 'Model chạy trên máy này qua Ollama',
    location: { group: 'connections', page: 'local', key: 'local:ollama' }
  },
  {
    title: 'LM Studio',
    description: 'Model chạy trên máy này qua LM Studio',
    location: { group: 'connections', page: 'local', key: 'local:lmstudio' }
  },
  {
    title: 'Theme',
    description: 'Sáng, tối hoặc theo Windows',
    location: { group: 'appearance', page: 'general', key: 'theme' }
  },
  {
    title: 'Phiên bản',
    description: 'Phiên bản Mira và nền tảng',
    location: { group: 'about', page: 'general', key: 'version' }
  }
]

export const SETTINGS_INDEX: SettingsIndexEntry[] = [
  ...STATIC_INDEX,
  ...PROVIDER_CARDS.map((card) => ({
    title: card.label,
    description: 'Khóa API · ' + card.description,
    location: { group: 'connections' as const, page: 'keys', key: 'provider:' + card.id }
  }))
]

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

/** Tìm kiếm các mục cài đặt có tiêu đề hoặc mô tả chứa toàn bộ từ khóa truy vấn (không phân biệt hoa thường và dấu tiếng Việt). */
export function searchSettings(query: string, index = SETTINGS_INDEX): SettingsIndexEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return index
    .map((entry) => {
      const title = fold(entry.title)
      const haystack = title + ' ' + fold(entry.description)
      if (!words.every((word) => haystack.includes(word))) return null
      return { entry, score: words.every((word) => title.includes(word)) ? 0 : 1 }
    })
    .filter((hit): hit is { entry: SettingsIndexEntry; score: number } => hit !== null)
    .sort((a, b) => a.score - b.score)
    .map((hit) => hit.entry)
    .slice(0, 12)
}
