// Global app settings, shared by every widget window.
// Stored as one JSON blob so a single cross-window `storage` event carries the
// whole change. Per-panel pin/visible state deliberately stays in its own keys
// (see panels.ts) because the context menu and the tray already read those.

export type TimeZoneMode = 'system' | 'fixed'

export type AppSettings = {
  timeZoneMode: TimeZoneMode
  timeZone: string
  autoSaveSeconds: number
  inappFallbackToDesktop: boolean
}

export const SETTINGS_KEY = 'desktime.settings'

export const defaultSettings: AppSettings = {
  timeZoneMode: 'fixed',
  timeZone: 'Asia/Shanghai',
  autoSaveSeconds: 10,
  inappFallbackToDesktop: true,
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
