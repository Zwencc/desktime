// Per-widget window state: pin, visibility, position and size.
//
// Both the widget windows (App) and the standalone context-menu and settings
// windows read and write the same localStorage keys, so the key names and
// accessors live here to keep every window in sync. Which widgets exist is not
// decided here — that comes from the registry in widgets.ts.

import { invoke } from '@tauri-apps/api/core'
import { flushConfig } from './config'
import {
  PhysicalPosition,
  Window,
  getCurrentWindow,
  monitorFromPoint,
  primaryMonitor,
} from '@tauri-apps/api/window'
import { type WidgetKey, mutexPeers, widgetKeys, widgetOf } from './widgets'

export type SavedPosition = {
  x: number
  y: number
}

export type SavedSize = {
  width: number
  height: number
}

const PINNED_KEY_PREFIX = 'desktime.pinned.'
const VISIBLE_KEY_PREFIX = 'desktime.visible.'
const WINDOW_POSITION_KEY_PREFIX = 'desktime.windowPosition.'
const WINDOW_SIZE_KEY_PREFIX = 'desktime.windowSize.'

/**
 * These two take any window label, not only a registry key: a plugin window is
 * stored under exactly the same keys, so the backend can restore one without
 * knowing whether it belongs to a widget or a plugin.
 */
export function pinnedKey(label: string) {
  return `${PINNED_KEY_PREFIX}${label}`
}

export function visibleKey(label: string) {
  return `${VISIBLE_KEY_PREFIX}${label}`
}

export function readSavedPosition(widget: WidgetKey) {
  try {
    const value = localStorage.getItem(`${WINDOW_POSITION_KEY_PREFIX}${widget}`)
    return value ? (JSON.parse(value) as SavedPosition) : null
  } catch {
    return null
  }
}

export function saveWindowPosition(widget: WidgetKey, position: SavedPosition) {
  localStorage.setItem(`${WINDOW_POSITION_KEY_PREFIX}${widget}`, JSON.stringify(position))
}

export function readSavedSize(widget: WidgetKey): SavedSize | null {
  try {
    const value = localStorage.getItem(`${WINDOW_SIZE_KEY_PREFIX}${widget}`)
    return value ? (JSON.parse(value) as SavedSize) : null
  } catch {
    return null
  }
}

export function saveWindowSize(widget: WidgetKey, size: SavedSize) {
  localStorage.setItem(`${WINDOW_SIZE_KEY_PREFIX}${widget}`, JSON.stringify(size))
}

export function readPinnedState(widget: WidgetKey) {
  const value = localStorage.getItem(pinnedKey(widget))
  const legacyValue = localStorage.getItem('desktime.pinned')
  const stored = value ?? legacyValue
  if (stored === null) return widgetOf(widget).defaultPinned !== false

  return stored !== 'false'
}

export function readVisibleState(widget: WidgetKey) {
  const value = localStorage.getItem(visibleKey(widget))
  if (value === null) return widgetOf(widget).defaultVisible !== false
  return value !== 'false'
}

// Built from the registry so a new widget shows up in every window's state map
// without touching this file.
function stateOfAll(read: (widget: WidgetKey) => boolean): Record<WidgetKey, boolean> {
  return Object.fromEntries(widgetKeys.map((widget) => [widget, read(widget)])) as Record<
    WidgetKey,
    boolean
  >
}

export function readAllPinnedStates() {
  return stateOfAll(readPinnedState)
}

export function readAllVisibleStates() {
  return stateOfAll(readVisibleState)
}

export function savePinnedState(widget: WidgetKey, pinned: boolean) {
  localStorage.setItem(pinnedKey(widget), String(pinned))
  announce(widget)
}

export function saveVisibleState(widget: WidgetKey, visible: boolean) {
  localStorage.setItem(visibleKey(widget), String(visible))
  announce(widget)
}

// —— Watching a widget's own pin and visibility ——
//
// The `storage` event does not fire in the window that wrote the value, and
// these two are written from several places — the widget's own title bar, the
// context menu window, the tray, the settings list. The privacy vault locks
// itself when the notebook is hidden or unpinned, so it has to hear about the
// change wherever it came from; the local-listener half is what covers the
// widget doing it to itself.

type PanelStateListener = (widget: WidgetKey) => void

const panelListeners = new Set<PanelStateListener>()
let watchingStorage = false

function announce(widget: WidgetKey) {
  panelListeners.forEach((listener) => listener(widget))
}

export function subscribePanelState(listener: PanelStateListener) {
  if (!watchingStorage) {
    watchingStorage = true
    window.addEventListener('storage', (event) => {
      const key = event.key ?? ''
      if (!key.startsWith(PINNED_KEY_PREFIX) && !key.startsWith(VISIBLE_KEY_PREFIX)) return
      const widget = key.slice(key.indexOf('.', key.indexOf('.') + 1) + 1) as WidgetKey
      panelListeners.forEach((entry) => entry(widget))
    })
  }

  panelListeners.add(listener)
  return () => {
    panelListeners.delete(listener)
  }
}

// Window operations any window may perform on any widget — the widgets do it
// from their own title bar, the settings panel does it from its component list.
//
// "Pinned" and "unpinned" are two active modes, not on/off: unpinned widgets are
// pushed behind other apps so they behave like desktop gadgets.
// A window label rather than a `WidgetKey` on these two: a plugin's window is
// pinned and shown exactly like a built-in widget's, and it has no key in the
// registry — see PluginSettings. Everything else here stays keyed, because
// everything else is about state this app persists per widget.
export async function applyPanelPin(label: string, pinned: boolean) {
  const target = await Window.getByLabel(label)
  if (!target) return

  if (pinned) {
    await target.setAlwaysOnBottom(false)
    await target.setAlwaysOnTop(true)
    return
  }

  await target.setAlwaysOnTop(false)
  await target.setAlwaysOnBottom(true)
  await invoke('set_window_to_bottom', { label })
}

export async function applyPanelVisibility(label: string, visible: boolean) {
  await invoke('set_window_visibility', { label, visible })
}

/**
 * Closes an app-driven window for good rather than hiding it.
 *
 * Settings and DevTools are the two big, stateless, rarely-opened windows, and a
 * hidden WebView2 instance apiece is tens of megabytes held for a page nobody is
 * looking at. Every path that opens one already goes through `ensure_window` —
 * it has to, because these windows do not exist for the first couple of seconds
 * of a run either — so being gone is a state they already handle.
 *
 * Not for the menu, the reminder, the launcher or any widget: those either have
 * to appear instantly or hold state that a rebuild would throw away.
 */
export async function closeForGood() {
  try {
    // Before the window stops existing, not after.
    await flushConfig()
    await getCurrentWindow().destroy()
  } catch (error) {
    // Both call sites are `void closeForGood()`, so a rejection has nowhere
    // else to go. `destroy` needs `core:window:allow-destroy`, and a command
    // missing from a capability list fails silently — which is how this window
    // stayed unclosable for a whole version without printing a single line.
    console.error('Failed to close window for good', error)
  }
}

/**
 * Shows a self-managed widget's window, in the state the user last left it.
 *
 * `App` deliberately does not do this for a self-managed widget: that widget
 * sizes and places its own window from a measurement it can only take once it
 * has rendered, and revealing the window before then puts the half-finished
 * shape on screen. The widget calls this when it is done.
 */
export async function revealSelf(widget: WidgetKey) {
  await applyPanelVisibility(widget, readVisibleState(widget))
}

/**
 * Resolves one show/hide request against both house rules and carries it out:
 * mutually exclusive widgets switch each other off, and the last visible widget
 * cannot be hidden (the tray would be the only way back). Returns the new state
 * map for the caller to render, or `null` when the request is refused.
 */
export function requestVisibility(
  current: Record<WidgetKey, boolean>,
  widget: WidgetKey,
  visible: boolean,
): Record<WidgetKey, boolean> | null {
  const next = { ...current, [widget]: visible }
  if (visible) mutexPeers(widget).forEach((peer) => (next[peer] = false))

  if (!widgetKeys.some((key) => next[key])) return null

  // Show before hiding, so a swap never leaves the desktop briefly empty and
  // never trips the rule above halfway through.
  widgetKeys
    .filter((key) => next[key] !== current[key])
    .sort((a, b) => Number(next[b]) - Number(next[a]))
    .forEach((key) => {
      saveVisibleState(key, next[key])
      void applyPanelVisibility(key, next[key])
    })

  return next
}

/**
 * Brings `widget` on screen, switching off whatever it excludes.
 *
 * This is the whole of "swap the clock for the moo clock": the two are mutex
 * peers (see MUTEX_GROUPS), so showing one already hides the other. Callers that
 * do not render the result — a widget switching itself off, say — want this
 * rather than `requestVisibility`, whose return value they would only discard.
 */
export function showWidget(widget: WidgetKey) {
  requestVisibility(readAllVisibleStates(), widget, true)
}

/**
 * Turns a widget's anchored default into screen coordinates.
 *
 * Resolved against the **work area** of the monitor the window is currently on,
 * so a widget hugging the bottom of the screen sits above the taskbar rather
 * than behind it. The margin in the registry is in CSS pixels and is scaled
 * here, or a 24px inset would shrink to a hairline on a 200% display.
 *
 * Returns `null` when the window or its monitor cannot be read — the caller
 * then leaves the window wherever it already is, which is always safe.
 */
export async function resolveDefaultPosition(widget: WidgetKey): Promise<SavedPosition | null> {
  const target = await Window.getByLabel(widget)
  if (!target) return null

  // The monitor is found from the window's own corner, not from `currentMonitor()`:
  // that one answers for whichever window is calling, and settings resets the
  // position of widgets other than itself.
  const origin = await target.outerPosition()
  const monitor = (await monitorFromPoint(origin.x, origin.y)) ?? (await primaryMonitor())
  if (!monitor) return null

  const size = await target.outerSize()
  const { anchor, dx, dy } = widgetOf(widget).position
  const marginX = Math.round(dx * monitor.scaleFactor)
  const marginY = Math.round(dy * monitor.scaleFactor)
  const { position, size: area } = monitor.workArea

  const right = position.x + area.width - size.width - marginX
  const bottom = position.y + area.height - size.height - marginY

  return {
    // A window wider or taller than the work area would otherwise be pushed off
    // the near edge, which is worse than overflowing the far one.
    x: anchor.endsWith('right') ? Math.max(position.x, right) : position.x + marginX,
    y: anchor.startsWith('bottom') ? Math.max(position.y, bottom) : position.y + marginY,
  }
}

export async function resetPanelPosition(widget: WidgetKey) {
  const position = await resolveDefaultPosition(widget)
  if (!position) return

  saveWindowPosition(widget, position)

  const target = await Window.getByLabel(widget)
  await target?.setPosition(new PhysicalPosition(position.x, position.y))
}

// Context-menu request channel: a widget writes the cursor position + which
// widget it was triggered from, and the standalone menu window picks it up via
// the cross-window `storage` event. The nonce makes each request a distinct
// value so repeated right-clicks at the same spot still fire the event.
export const MENU_REQUEST_KEY = 'desktime.menuRequest'

export type MenuRequest = {
  x: number
  y: number
  panel: WidgetKey
  nonce: number
}

export function requestContextMenu(request: MenuRequest) {
  localStorage.setItem(MENU_REQUEST_KEY, JSON.stringify(request))
}

// Context-menu action channel: the menu window is presentation only. When an
// item is clicked it writes the action here, and the widget window it was
// triggered from (`origin`) executes it with its existing pin/visible/reset
// logic. Routing by `origin` keeps a single window from double-applying.
export const MENU_ACTION_KEY = 'desktime.menuAction'

export type MenuAction =
  | { type: 'pin'; origin: WidgetKey; target: WidgetKey; value: boolean; nonce: number }
  | { type: 'visible'; origin: WidgetKey; target: WidgetKey; value: boolean; nonce: number }
  | { type: 'reset'; origin: WidgetKey; nonce: number }

export function sendMenuAction(action: MenuAction) {
  localStorage.setItem(MENU_ACTION_KEY, JSON.stringify(action))
}
