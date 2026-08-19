// Global app settings, shared by every widget window.
// Stored as one JSON blob so a single cross-window `storage` event carries the
// whole change. Per-panel pin/visible state deliberately stays in its own keys
// (see panels.ts) because the context menu and the tray already read those.

export type TimeZoneMode = 'system' | 'fixed'

/** `float` is an ordinary widget window; `island` is the capsule at the top of the screen. */
export type MooShape = 'float' | 'island'

export type AppSettings = {
  timeZoneMode: TimeZoneMode
  timeZone: string
  autoSaveSeconds: number
  /**
   * Minutes of no activity before the privacy vault locks itself.
   *
   * The countdown is a timestamp comparison, never an accumulation — see the
   * watchdog in NotebookPanel. A throttled timer that ticks late has to lock
   * late; one that adds up its own ticks would simply never get there.
   */
  vaultLockMinutes: number
  inappFallbackToDesktop: boolean
  mooShape: MooShape
  /** A `ThemeId`; typed loosely so settings.ts stays free of theme imports. */
  theme: string
  /**
   * A `LanguageId`, or empty to follow the system. Typed loosely for the same
   * reason as the theme, and empty by default so a first run can guess from the
   * Windows display language rather than assuming Chinese.
   */
  language: string
}

export const SETTINGS_KEY = 'desktime.settings'

export const defaultSettings: AppSettings = {
  timeZoneMode: 'fixed',
  timeZone: 'Asia/Shanghai',
  autoSaveSeconds: 10,
  vaultLockMinutes: 5,
  inappFallbackToDesktop: true,
  mooShape: 'float',
  theme: 'default',
  language: '',
}

type Listener = (settings: AppSettings) => void

const listeners = new Set<Listener>()
let installed = false

export function readSettings(): AppSettings {
  try {
    const value = localStorage.getItem(SETTINGS_KEY)
    if (!value) return defaultSettings
    return { ...defaultSettings, ...(JSON.parse(value) as Partial<AppSettings>) }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  // `storage` only fires in *other* windows, so notify this one directly.
  listeners.forEach((listener) => listener(settings))
}

export function updateSettings(patch: Partial<AppSettings>) {
  const next = { ...readSettings(), ...patch }
  saveSettings(next)
  return next
}

/**
 * Snapshot for `useSyncExternalStore`: the stored JSON, whose identity changes
 * only when a setting does.
 */
export function settingsSnapshot() {
  return localStorage.getItem(SETTINGS_KEY) ?? ''
}

/** Subscribes to setting changes from this window and from every other window. */
export function subscribeSettings(listener: Listener) {
  if (!installed) {
    installed = true
    window.addEventListener('storage', (event) => {
      if (event.key !== SETTINGS_KEY) return
      const settings = readSettings()
      listeners.forEach((entry) => entry(settings))
    })
  }

  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
