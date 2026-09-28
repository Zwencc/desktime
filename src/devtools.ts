// Developer mode's client: the marker file's verdict, and the read-only views
// behind it.
//
// Everything here observes. Nothing in this module changes a setting, a stored
// minute or a window's state — the one exception is `reloadAllWindows`, which is
// a developer action rather than a reading and is named to say so.
//
// The whole surface is gated on `devMode().enabled`, which is a file next to the
// executable (see src-tauri/src/devmode.rs). A normal install never sees any of
// it, so nothing below needs a second switch of its own.

import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { Window } from '@tauri-apps/api/window'
import type { MonitorConfig } from './activity'
import { isTauri } from './env'

export const DEVTOOLS_WINDOW = 'devtools'

/** Broadcast that makes every window reload itself; a window cannot reload another. */
export const RELOAD_EVENT = 'dev://reload'

export type DevModeInfo = {
  enabled: boolean
  /** Directory the marker was looked for in — the answer to "wrong folder?". */
  root: string
}

export type SchedulerStatus = {
  workerRunning: boolean
  queued: number
  ringing: number
  nextTrigger: number | null
  inappFallback: boolean
}

/** What DTCore answered `status` with; null when it could not be reached. */
export type CoreStatus = {
  pid: number
  protocolVersion: number
  schemaVersion: number
  startedAtMs: number
  storedMinutes: number
}

export type RuntimeStatus = {
  /** The backend's clock, so timestamps can be aged without trusting two clocks. */
  now: number
  /** null means DTCore is not reachable — which is not the same reading as
   *  "reachable and collecting nothing", and the two look identical without it. */
  core: CoreStatus | null
  /** Why it could not be reached, when it could not be. Empty otherwise. */
  coreError: string
  activitySampledAt: number
  activityEnabled: boolean
  activityCommitted: number
  /** The last activity write that failed inside DTCore, if one has. */
  activityStoreError: string
  reminder: SchedulerStatus
}

export type WindowDiagnostic = {
  label: string
  visible: boolean
  focused: boolean
  x: number
  y: number
  width: number
  height: number
  scale: number
  /** The native visibility policy's belief; null for app-driven windows. */
  appVisible: boolean | null
}

export type DebugSnapshot = {
  sampledAt: number
  /** The backend's own switch, which is the point — not the stored setting. */
  enabled: boolean
  minute: number
  foregroundExe: string
  idleMs: number
  keysTotal: number
  keysCopy: number
  keysBack: number
  mousePx: number
  appSwitches: number
  distinctApps: number
  active: boolean
  mic: boolean
  cam: boolean
  audio: boolean
  fullscreen: boolean
  locked: boolean
  onBattery: boolean
  monitors: number
  committed: number
  lastCommit: number
  /** The last failed write. Empty while commits are landing. */
  storeError: string
}

export type MinuteRecord = {
  ts: number
  active: boolean
  keysTotal: number
  keysCopy: number
  keysBack: number
  mousePx: number
  appSwitches: number
  topApp: string
  distinctApps: number
  mic: boolean
  cam: boolean
  audio: boolean
  fullscreen: boolean
  locked: boolean
  onBattery: boolean
  monitors: number
}

export type ActivityDebug = {
  config: MonitorConfig
  snapshot: DebugSnapshot
  recentRecords: MinuteRecord[]
}

const disabled: DevModeInfo = { enabled: false, root: '' }

/** Probed once per window; the backend reads the marker once per process. */
export async function devMode(): Promise<DevModeInfo> {
  if (!isTauri) return disabled
  return invoke<DevModeInfo>('is_dev_mode').catch(() => disabled)
}

export async function runtimeStatus() {
  return invoke<RuntimeStatus>('runtime_status')
}

export async function windowDiagnostics() {
  return invoke<WindowDiagnostic[]>('window_diagnostics')
}

export async function activityDebug() {
  return invoke<ActivityDebug>('activity_debug_snapshot')
}

export async function openDevTools() {
  // Built on demand: app-driven windows are no longer created at startup, so
  // until the deferred pass has run this one does not exist yet.
  await invoke('ensure_window', { label: DEVTOOLS_WINDOW }).catch(() => undefined)

  const window = await Window.getByLabel(DEVTOOLS_WINDOW)
  if (!window) return
  // App-driven window: plain show/hide, never `set_window_visibility` — that
  // command looks the label up in the native policy registry and fails for
  // anything not registered there.
  await window.show()
  await window.setFocus()
}

export async function reloadAllWindows() {
  await emit(RELOAD_EVENT)
}
