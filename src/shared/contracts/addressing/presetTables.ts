import type { PresetTables } from './types'
import { JA } from './dataJa'
import { KO } from './dataKo'
import { SETTINGS } from './dataSettings'
import { WEST } from './dataWest'
import { ZH } from './dataZh'

export const PRESET_TABLES: PresetTables = {
  settings: SETTINGS,
  cultures: { ja: JA, ko: KO, zh: ZH, west: WEST }
}
