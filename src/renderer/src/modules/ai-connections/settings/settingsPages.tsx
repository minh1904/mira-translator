import { AboutPage } from './AboutPage'
import { AppearancePanel } from './AppearancePanel'
import { EndpointsPage, KeysPage, LocalPage } from './connectionPages'
import { AccountsPage } from './AccountsPage'
import { AuxiliaryModelPage, FallbacksPage, MainModelPage } from './modelPages'
import { ModelListPage } from './ModelListPage'
import { SourcesSettingsPage } from './SourcesSettingsPage'
import type { SettingsPages } from './SettingsModal'

/** Bảng ánh xạ nội dung hiển thị cho từng trang trong modal Cài đặt theo khóa `group/page`. */
export const SETTINGS_PAGES: SettingsPages = {
  'model/main': () => <MainModelPage />,
  'model/models': () => <ModelListPage />,
  'model/fallbacks': () => <FallbacksPage />,
  'model/auxiliary': () => <AuxiliaryModelPage />,
  'connections/accounts': () => <AccountsPage />,
  'connections/keys': () => <KeysPage />,
  'connections/endpoints': () => <EndpointsPage />,
  'connections/local': () => <LocalPage />,
  'appearance/general': () => <AppearancePanel />,
  'sources/general': () => <SourcesSettingsPage />,
  'about/general': () => <AboutPage />
}
